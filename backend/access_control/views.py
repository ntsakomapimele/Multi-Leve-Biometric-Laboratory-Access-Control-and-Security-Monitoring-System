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

        response_data = {
            "result": result,
            "message": "Access decision granted." if access_granted else denial_reason,
            "denial_reason": denial_reason,
            "user": user.username,
            "laboratory": laboratory.name,
            "source": source,
            "checks": {
                "face_verified": face_verified,
                "fingerprint_verified": fingerprint_verified,
                "permission_active": has_permission,
            },
            "door_release": False,
            "door_message": "No door controller is connected; this records an access decision only.",
        }
        return Response(response_data, status=status.HTTP_200_OK if access_granted else status.HTTP_403_FORBIDDEN)


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

