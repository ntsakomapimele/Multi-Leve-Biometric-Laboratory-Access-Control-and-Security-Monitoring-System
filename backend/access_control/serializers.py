from rest_framework import serializers

from .models import (
    Laboratory,
    BiometricProfile,
    AccessPermission,
    AuthenticationEvent,
    SecurityEvent,
)


class LaboratorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Laboratory
        fields = "__all__"


class BiometricProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BiometricProfile
        fields = "__all__"


class AccessPermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessPermission
        fields = "__all__"


class AuthenticationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuthenticationEvent
        fields = "__all__"


class SecurityEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecurityEvent
        fields = "__all__"

class AccessAuthenticationSerializer(serializers.Serializer):
    username = serializers.CharField()
    laboratory_id = serializers.IntegerField()
    face_verified = serializers.BooleanField()
    fingerprint_verified = serializers.BooleanField()



