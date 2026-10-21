from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
import cv2
import numpy as np
import json
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from django.conf import settings
from django.db import transaction
from django.core.cache import cache
from rest_framework.permissions import IsAuthenticated
import os

from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import (
    Laboratory,
    BiometricProfile,
    FingerprintChallenge,
    AccessPermission,
    AuthenticationEvent,
    FaceSample,
    SecurityEvent,
)
from .permissions import (
    CanManageLaboratories,
    CanViewSecurityEvents,
    IsAdministrator,
    IsSecurityOfficer,
)
from .serializers import (
    LaboratorySerializer,
    BiometricProfileSerializer,
    AccessPermissionSerializer,
    AuthenticationEventSerializer,
    SecurityEventSerializer,
    AccessAuthenticationSerializer,
    FingerprintScanRequestSerializer,
    ReaderTestSerializer,
    UserSerializer,
)
from .face_recognition import extract_face, matches_sample


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action == "list" or self.action == "retrieve":
            return [IsSecurityOfficer()]
        return [IsAdministrator()]


class LaboratoryViewSet(viewsets.ModelViewSet):
    queryset = Laboratory.objects.all()
    serializer_class = LaboratorySerializer
    permission_classes = [CanManageLaboratories]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Laboratory.objects.filter(is_active=True)
        return Laboratory.objects.all()

class BiometricProfileViewSet(viewsets.ModelViewSet):
    queryset = BiometricProfile.objects.all()
    serializer_class = BiometricProfileSerializer
    permission_classes = [IsSecurityOfficer]

class AccessPermissionViewSet(viewsets.ModelViewSet):
    queryset = AccessPermission.objects.all()
    serializer_class = AccessPermissionSerializer
    permission_classes = [IsSecurityOfficer]

class AuthenticationEventViewSet(viewsets.ModelViewSet):
    queryset = AuthenticationEvent.objects.all()
    serializer_class = AuthenticationEventSerializer
    permission_classes = [CanViewSecurityEvents]


class SecurityEventViewSet(viewsets.ModelViewSet):
    queryset = SecurityEvent.objects.all()
    serializer_class = SecurityEventSerializer
    permission_classes = [CanViewSecurityEvents]

class FingerprintScanView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = FingerprintScanRequestSerializer(
            data=request.data
        )

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        laboratory_id = serializer.validated_data[
            "laboratory_id"
        ]

        laboratory = Laboratory.objects.filter(
            id=laboratory_id,
            is_active=True,
        ).first()

        if laboratory is None:
            return Response(
                {
                    "result": "DENIED",
                    "message": "Laboratory does not exist or is inactive.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ensure that the ESP32 connection is configured.
        device_url = getattr(
            settings,
            "ESP32_DEVICE_URL",
            "",
        )

        device_key = getattr(
            settings,
            "ESP32_DEVICE_KEY",
            "",
        )

        if not device_url or not device_key:
            return Response(
                {
                    "result": "ERROR",
                    "message": "Fingerprint device is not configured.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Ask the ESP32 to scan a finger.
        device_request = Request(
            url=f"{device_url}/scan",
            data=b"{}",
            headers={
                "Content-Type": "application/json",
                "X-Device-Key": device_key,
            },
            method="POST",
        )

        try:
            with urlopen(
                device_request,
                timeout=35,
            ) as device_response:
                payload = json.loads(
                    device_response.read().decode("utf-8")
                )

        except HTTPError as error:
            if error.code == 404:
                return Response(
                    {
                        "result": "DENIED",
                        "message": (
                            "No enrolled fingerprint matched. "
                            "Try again."
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            return Response(
                {
                    "result": "ERROR",
                    "message": "The fingerprint device returned an error.",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        except (URLError, TimeoutError, OSError):
            return Response(
                {
                    "result": "ERROR",
                    "message": (
                        "Could not communicate with the fingerprint "
                        "device. Check its Wi-Fi connection and IP address."
                    ),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        except (json.JSONDecodeError, UnicodeDecodeError):
            return Response(
                {
                    "result": "ERROR",
                    "message": "The fingerprint device returned invalid data.",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        fingerprint_id = payload.get("fingerprint_id")

        if (
            isinstance(fingerprint_id, bool)
            or not isinstance(fingerprint_id, int)
            or fingerprint_id < 1
        ):
            return Response(
                {
                    "result": "ERROR",
                    "message": "Invalid fingerprint ID returned by device.",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Match the scanner's template ID to an enrolled profile.
        profiles = list(
            BiometricProfile.objects
            .select_related("user")
            .filter(fingerprint_id=fingerprint_id)[:2]
        )

        if len(profiles) == 0:
            return Response(
                {
                    "result": "DENIED",
                    "message": (
                        "This fingerprint is not linked to an enrolled user."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if len(profiles) > 1:
            return Response(
                {
                    "result": "ERROR",
                    "message": (
                        "The fingerprint ID is assigned to multiple profiles. "
                        "Resolve the duplicate assignments."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        profile = profiles[0]
        user = profile.user

        if not user.is_active:
            return Response(
                {
                    "result": "DENIED",
                    "message": "The matched user account is inactive.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create a short-lived token tied to this user and laboratory.
        challenge = FingerprintChallenge.objects.create(
            user=user,
            laboratory=laboratory,
            expires_at=timezone.now() + timedelta(minutes=1),
        )

        return Response(
            {
                "result": "MATCHED",
                "message": "Fingerprint matched. Complete face verification.",
                "username": user.username,
                "laboratory_id": laboratory.id,
                "fingerprint_token": str(challenge.token),
                "expires_at": challenge.expires_at.isoformat(),
            },
            status=status.HTTP_200_OK,
        )

class AuthenticateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AccessAuthenticationSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = serializer.validated_data["username"]
        laboratory_id = serializer.validated_data["laboratory_id"]
        face_image = serializer.validated_data["face_image"]

        # Find the user
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response(
                {
                    "result": "DENIED",
                    "message": "User does not exist.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check whether the user is active
        if not user.is_active:
            return Response(
                {
                    "result": "DENIED",
                    "message": "User account is inactive.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        fingerprint_token = serializer.validated_data.get("fingerprint_token")
        fingerprint_verified = False

        if fingerprint_token:
            try:
                with transaction.atomic():
                    challenge = (
                        FingerprintChallenge.objects
                        .select_for_update()
                        .get(
                            token=fingerprint_token,
                            user=user,
                            laboratory_id=laboratory_id,
                            used_at__isnull=True,
                            expires_at__gt=timezone.now(),
                        )
                    )

                    challenge.used_at = timezone.now()
                    challenge.save(update_fields=["used_at"])
                    fingerprint_verified = True

            except FingerprintChallenge.DoesNotExist:
                return Response(
                    {
                        "result": "DENIED",
                        "message": (
                            "Fingerprint verification is invalid, "
                            "expired, already used, or belongs to "
                            "a different user or laboratory."
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        try:
            face = extract_face(face_image)
            samples = [
                cv2.imdecode(np.frombuffer(bytes(sample.image), np.uint8), cv2.IMREAD_GRAYSCALE)
                for sample in FaceSample.objects.filter(user=user)
            ]
            face_verified = matches_sample(face, [sample for sample in samples if sample is not None])
        except ValueError:
            face_verified = False

        return self._finish_scan(
            user,
            laboratory_id,
            face_verified,
            fingerprint_verified,
            "TERMINAL",
        )

    @staticmethod
    def _finish_scan(user, laboratory_id, face_verified, fingerprint_verified, source):
        try:
            laboratory = Laboratory.objects.get(
                id=laboratory_id,
                is_active=True,
            )
        except Laboratory.DoesNotExist:
            return Response(
                {
                    "result": "DENIED",
                    "message": "Laboratory does not exist or is inactive.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        now = timezone.now()
        has_permission = AccessPermission.objects.filter(
            user=user,
            laboratory=laboratory,
            is_allowed=True,
        ).filter(
            Q(valid_from__isnull=True) | Q(valid_from__lte=now),
            Q(valid_until__isnull=True) | Q(valid_until__gte=now),
        ).exists()

        if not face_verified:
            denial_reason = "Face did not match an enrolled profile."
        elif not fingerprint_verified:
            denial_reason = "Fingerprint reader is offline."
        elif not has_permission:
            denial_reason = "No active permission for this laboratory."
        else:
            denial_reason = ""
        access_granted = not denial_reason

        result = "GRANTED" if access_granted else "DENIED"

        # Record authentication event
        AuthenticationEvent.objects.create(
            user=user,
            laboratory=laboratory,
            face_verified=face_verified,
            fingerprint_verified=fingerprint_verified,
            result=result,
            denial_reason=denial_reason,
            source=source,
        )

        # Unlock only after all access checks have passed.
        door_release = False
        door_message = "Door remains locked."

        if not access_granted:
            door_message = "Access denied. Door remains locked."

        elif source == "READER_TEST":
            door_message = (
                "Access checks passed. Reader test does not unlock the door."
            )

        elif source == "TERMINAL":
            device_url = getattr(
                settings,
                "ESP32_DEVICE_URL",
                "",
            ).rstrip("/")

            device_key = getattr(
                settings,
                "ESP32_DEVICE_KEY",
                "",
            )

            if not device_url or not device_key:
                door_message = (
                    "Access granted, but the door controller "
                    "is not configured."
                )
            else:
                door_request = Request(
                    url=f"{device_url}/door/unlock",
                    data=b"{}",
                    headers={
                        "Content-Type": "application/json",
                        "X-Device-Key": device_key,
                    },
                    method="POST",
                )

                try:
                    with urlopen(
                        door_request,
                        timeout=10,
                    ) as door_response:
                        door_payload = json.loads(
                            door_response.read().decode("utf-8")
                        )

                    if door_payload.get("result") == "UNLOCKED":
                        door_release = True
                        door_message = door_payload.get(
                            "message",
                            "Door unlocked successfully.",
                        )
                    else:
                        door_message = (
                            "Access granted, but the door controller "
                            "did not confirm unlocking."
                        )

                except (
                    HTTPError,
                    URLError,
                    TimeoutError,
                    OSError,
                    ValueError,
                ):
                    door_message = (
                        "Access granted, but the door unlock command "
                        "failed. Check the device connection and logs."
                    )

        response_data = {
            "result": result,
            "message": (
                "Access granted and door unlocked."
                if door_release
                else (
                    "Access decision granted."
                    if access_granted
                    else denial_reason
                )
            ),
            "denial_reason": denial_reason,
            "user": user.username,
            "laboratory": laboratory.name,
            "source": source,
            "checks": {
                "face_verified": face_verified,
                "fingerprint_verified": fingerprint_verified,
                "permission_active": has_permission,
            },
            "door_release": door_release,
            "door_message": door_message,
        }

        return Response(
            response_data,
            status=(
                status.HTTP_200_OK
                if access_granted
                else status.HTTP_403_FORBIDDEN
            ),
        )


class ReaderTestView(APIView):
    permission_classes = [IsAdministrator]

    def post(self, request):
        serializer = ReaderTestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(username=serializer.validated_data["username"], is_active=True)
        except User.DoesNotExist:
            return Response({"result": "DENIED", "message": "Active user does not exist."}, status=status.HTTP_404_NOT_FOUND)
        return AuthenticateView._finish_scan(
            user,
            serializer.validated_data["laboratory_id"],
            serializer.validated_data["face_verified"],
            serializer.validated_data["fingerprint_verified"],
            "READER_TEST",
        )


class FaceEnrollmentView(APIView):
    permission_classes = [IsAdministrator]

    def post(self, request):
        username = request.data.get("username")
        try:
            user = User.objects.get(username=username, is_active=True)
            face = extract_face(request.data.get("face_image"))
        except (User.DoesNotExist, ValueError) as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        ok, encoded = cv2.imencode(".jpg", face)
        if not ok:
            return Response({"detail": "The face image could not be stored."}, status=status.HTTP_400_BAD_REQUEST)
        FaceSample.objects.create(user=user, image=encoded.tobytes())
        profile, _ = BiometricProfile.objects.get_or_create(user=user)
        profile.face_registered = True
        profile.save(update_fields=["face_registered"])
        return Response({"user": user.username, "face_registered": True}, status=status.HTTP_201_CREATED)


class FingerprintEnrollmentView(APIView):
    permission_classes = [IsAdministrator]

    CACHE_KEY = "sentrylab_fingerprint_enrollment_user"
    ENROLLMENT_TIMEOUT = 90

    def device_request(self, endpoint, method="GET", payload=None):
        device_url = getattr(settings, "ESP32_DEVICE_URL", "").rstrip("/")
        device_key = getattr(settings, "ESP32_DEVICE_KEY", "")

        if not device_url or not device_key:
            raise ValueError("ESP32 device URL or key is not configured.")

        data = None
        headers = {"X-Device-Key": device_key}

        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = Request(
            f"{device_url}{endpoint}",
            data=data,
            headers=headers,
            method=method,
        )

        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    def post(self, request):
        user_id = request.data.get("user_id")

        try:
            target_user = User.objects.get(
                pk=user_id,
                is_active=True,
            )
        except (User.DoesNotExist, TypeError, ValueError):
            return Response(
                {"message": "Select a valid active user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only one user can be enrolled at a time on this scanner.
        if cache.get(self.CACHE_KEY):
            return Response(
                {"message": "Another fingerprint enrollment is in progress."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            device_status = self.device_request(
                "/enrollment/status",
                method="GET",
            )

            if device_status.get("result") not in ("IDLE", "ENROLL_IDLE"):
                return Response(
                    {
                        "message": "The fingerprint reader is busy.",
                        "device": device_status,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            # Store the target user before starting the physical enrollment.
            cache.set(
                self.CACHE_KEY,
                target_user.pk,
                timeout=self.ENROLLMENT_TIMEOUT,
            )

            started = self.device_request(
                "/enrollment/start",
                method="POST",
                payload={},
            )

            result = started.get("result", "")

            if result in ("ERROR", "FAILED", "ENROLL_FAILED"):
                cache.delete(self.CACHE_KEY)
                return Response(
                    {
                        "message": started.get(
                            "message",
                            "The reader could not start enrollment.",
                        )
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            return Response(
                {
                    "result": result,
                    "user_id": target_user.pk,
                    "username": target_user.username,
                    "fingerprint_id": started.get("fingerprint_id", 0),
                    "message": started.get(
                        "message",
                        "Enrollment started. Place your finger on the reader.",
                    ),
                },
                status=status.HTTP_200_OK,
            )

        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            cache.delete(self.CACHE_KEY)
            return Response(
                {"message": f"Could not start fingerprint enrollment: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    def get(self, request):
        target_user_id = cache.get(self.CACHE_KEY)

        if not target_user_id:
            return Response({
                "result": "IDLE",
                "message": "No enrollment is assigned to a user.",
            })

        try:
            device_status = self.device_request(
                "/enrollment/status",
                method="GET",
            )
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            return Response(
                {"message": f"Could not read the fingerprint reader: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        result = device_status.get("result", "UNKNOWN")
        fingerprint_id = device_status.get("fingerprint_id", 0)

        completed_states = ("COMPLETED", "ENROLL_COMPLETED")
        failed_states = ("FAILED", "ERROR", "ENROLL_FAILED")

        if result in completed_states:
            try:
                with transaction.atomic():
                    target_user = User.objects.get(
                        pk=target_user_id,
                        is_active=True,
                    )

                    profile, _ = BiometricProfile.objects.get_or_create(
                        user=target_user,
                    )

                    # Do not assign an ID already associated with another user.
                    duplicate_profile = BiometricProfile.objects.filter(
                        fingerprint_id=fingerprint_id,
                    ).exclude(pk=profile.pk).exists()

                    if fingerprint_id < 1 or duplicate_profile:
                        cache.delete(self.CACHE_KEY)
                        return Response(
                            {
                                "result": "ERROR",
                                "message": (
                                    "The sensor returned an invalid or "
                                    "already assigned fingerprint ID."
                                ),
                            },
                            status=status.HTTP_409_CONFLICT,
                        )

                    profile.fingerprint_id = fingerprint_id
                    profile.save(update_fields=["fingerprint_id"])

            except User.DoesNotExist:
                cache.delete(self.CACHE_KEY)
                return Response(
                    {
                        "result": "ERROR",
                        "message": "The selected user no longer exists.",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            cache.delete(self.CACHE_KEY)

            return Response({
                "result": "COMPLETED",
                "username": target_user.username,
                "fingerprint_id": fingerprint_id,
                "message": "Fingerprint enrolled and linked to the user.",
            })

        if result in failed_states:
            cache.delete(self.CACHE_KEY)

        return Response({
            "result": result,
            "fingerprint_id": fingerprint_id,
            "duplicate_fingerprint_id": device_status.get(
                "duplicate_fingerprint_id",
                0,
            ),
            "message": device_status.get("message", ""),
        })

    def delete(self, request):
        target_user_id = cache.get(self.CACHE_KEY)

        if not target_user_id:
            return Response({
                "result": "IDLE",
                "message": "No enrollment is in progress.",
            })

        try:
            device_status = self.device_request(
                "/enrollment/cancel",
                method="POST",
                payload={},
            )
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            return Response(
                {"message": f"Could not cancel enrollment: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        cache.delete(self.CACHE_KEY)

        return Response({
            "result": device_status.get("result", "CANCELLED"),
            "message": device_status.get(
                "message",
                "Fingerprint enrollment cancelled.",
            ),
        })




@csrf_exempt
@require_POST
def create_initial_superuser(request):
    expected_key = os.environ.get("INITIAL_ADMIN_SETUP_KEY", "")
    supplied_key = request.headers.get("X-Setup-Key", "")

    if not expected_key or supplied_key != expected_key:
        return JsonResponse({"error": "Forbidden"}, status=403)

    User = get_user_model()

    if User.objects.filter(is_superuser=True).exists():
        return JsonResponse(
            {"error": "A superuser already exists"},
            status=409,
        )

    username = os.environ.get("INITIAL_ADMIN_USERNAME", "")
    email = os.environ.get("INITIAL_ADMIN_EMAIL", "")
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "")

    if not username or not email or not password:
        return JsonResponse(
            {"error": "Admin configuration is incomplete"},
            status=500,
        )

    User.objects.create_superuser(
        username=username,
        email=email,
        password=password,
    )

    return JsonResponse({"message": "Superuser created"}, status=201)