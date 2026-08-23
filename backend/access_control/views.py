from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Laboratory,
    BiometricProfile,
    AccessPermission,
    AuthenticationEvent,
    SecurityEvent,
)

from .serializers import (
    LaboratorySerializer,
    BiometricProfileSerializer,
    AccessPermissionSerializer,
    AuthenticationEventSerializer,
    SecurityEventSerializer,
    AccessAuthenticationSerializer,
)


class LaboratoryViewSet(viewsets.ModelViewSet):
    queryset = Laboratory.objects.all()
    serializer_class = LaboratorySerializer


class BiometricProfileViewSet(viewsets.ModelViewSet):
    queryset = BiometricProfile.objects.all()
    serializer_class = BiometricProfileSerializer


class AccessPermissionViewSet(viewsets.ModelViewSet):
    queryset = AccessPermission.objects.all()
    serializer_class = AccessPermissionSerializer


class AuthenticationEventViewSet(viewsets.ModelViewSet):
    queryset = AuthenticationEvent.objects.all()
    serializer_class = AuthenticationEventSerializer


class SecurityEventViewSet(viewsets.ModelViewSet):
    queryset = SecurityEvent.objects.all()
    serializer_class = SecurityEventSerializer


class AuthenticateView(APIView):

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
        has_permission = AccessPermission.objects.filter(
            user=user,
            laboratory=laboratory,
            is_allowed=True,
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