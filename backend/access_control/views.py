from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
import cv2
import numpy as np

from .models import (
    Laboratory,
    BiometricProfile,
    AccessPermission,
    AuthenticationEvent,
    SecurityEvent,
)
from .permissions import (
    CanManageLaboratories,
    CanViewSecurityEvents,
    IsAdministrator,
)
from .serializers import (
    LaboratorySerializer,
    BiometricProfileSerializer,
    AccessPermissionSerializer,
    AuthenticationEventSerializer,
    SecurityEventSerializer,
    AccessAuthenticationSerializer,
    UserSerializer,
)
from .face_recognition import extract_face, matches_sample
from .models import FaceSample


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action == "list" or self.action == "retrieve":
            return [IsAuthenticated()]
        return [IsAdministrator()]


class LaboratoryViewSet(viewsets.ModelViewSet):
    queryset = Laboratory.objects.all()
    serializer_class = LaboratorySerializer
    permission_classes = [CanManageLaboratories]

class BiometricProfileViewSet(viewsets.ModelViewSet):
    queryset = BiometricProfile.objects.all()
    serializer_class = BiometricProfileSerializer
    permission_classes = [IsAuthenticated]

class AccessPermissionViewSet(viewsets.ModelViewSet):
    queryset = AccessPermission.objects.all()
    serializer_class = AccessPermissionSerializer
    permission_classes = [IsAuthenticated]

class AuthenticationEventViewSet(viewsets.ModelViewSet):
    queryset = AuthenticationEvent.objects.all()
    serializer_class = AuthenticationEventSerializer
    permission_classes = [CanViewSecurityEvents]


class SecurityEventViewSet(viewsets.ModelViewSet):
    queryset = SecurityEvent.objects.all()
    serializer_class = SecurityEventSerializer
    permission_classes = [CanViewSecurityEvents]


class AuthenticateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AccessAuthenticationSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = serializer.validated_data["username"]
        laboratory_id = serializer.validated_data["laboratory_id"]
        face_verified = serializer.validated_data["face_verified"]
        fingerprint_verified = serializer.validated_data["fingerprint_verified"]
        face_image = serializer.validated_data.get("face_image")

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

        if face_image:
            try:
                face = extract_face(face_image)
                samples = [
                    cv2.imdecode(np.frombuffer(bytes(sample.image), np.uint8), cv2.IMREAD_GRAYSCALE)
                    for sample in FaceSample.objects.filter(user=user)
                ]
                face_verified = matches_sample(face, [sample for sample in samples if sample is not None])
            except ValueError:
                face_verified = False

        # Check laboratory
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

        # Check permission
        now = timezone.now()
        has_permission = AccessPermission.objects.filter(
            user=user,
            laboratory=laboratory,
            is_allowed=True,
        ).filter(
            Q(valid_from__isnull=True) | Q(valid_from__lte=now),
            Q(valid_until__isnull=True) | Q(valid_until__gte=now),
        ).exists()

        # Final access decision
        access_granted = (
            face_verified
            and fingerprint_verified
            and has_permission
        )

        result = "GRANTED" if access_granted else "DENIED"

        # Record authentication event
        AuthenticationEvent.objects.create(
            user=user,
            face_verified=face_verified,
            fingerprint_verified=fingerprint_verified,
            result=result,
        )

        if access_granted:
            return Response(
                {
                    "result": "GRANTED",
                    "message": "Access granted.",
                    "user": user.username,
                    "laboratory": laboratory.name,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "result": "DENIED",
                "message": "Access denied.",
                "user": user.username,
                "laboratory": laboratory.name,
            },
            status=status.HTTP_403_FORBIDDEN,
        )


class FaceEnrollmentView(APIView):
    permission_classes = [IsAdministrator]

    def post(self, request):
        username = request.data.get("username")
        try:
            user = User.objects.get(username=username) if not str(username).isdigit() else User.objects.get(pk=username)
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

