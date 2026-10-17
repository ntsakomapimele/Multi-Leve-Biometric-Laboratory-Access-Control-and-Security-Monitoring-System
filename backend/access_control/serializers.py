from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User

from .models import (
    Laboratory,
    BiometricProfile,
    AccessPermission,
    AuthenticationEvent,
    SecurityEvent,
)


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["roles"] = list(user.groups.values_list("name", flat=True))
        return token


class UserSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(
        choices=["Administrator", "Security Officer", "Laboratory User"],
        write_only=True,
    )
    roles = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "password", "is_active", "role", "roles"]
        extra_kwargs = {"password": {"write_only": True}}

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def create(self, validated_data):
        role = validated_data.pop("role")
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        user.groups.create(name=role)
        return user

    def get_roles(self, obj):
        return list(obj.groups.values_list("name", flat=True))


class LaboratorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Laboratory
        fields = "__all__"


class BiometricProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BiometricProfile
        fields = "__all__"


class AccessPermissionSerializer(serializers.ModelSerializer):
    user = serializers.SlugRelatedField(
        slug_field="username",
        queryset=User.objects.all(),
    )

    class Meta:
        model = AccessPermission
        fields = "__all__"


class AuthenticationEventSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    laboratory_display = serializers.SerializerMethodField()

    class Meta:
        model = AuthenticationEvent
        fields = "__all__"

    def get_user_display(self, obj):
        return obj.user.username if obj.user else "Unknown user"

    def get_laboratory_display(self, obj):
        return obj.laboratory.name if obj.laboratory else "Unknown laboratory"


class SecurityEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecurityEvent
        fields = "__all__"

class AccessAuthenticationSerializer(serializers.Serializer):
    username = serializers.CharField()
    laboratory_id = serializers.IntegerField()
    face_image = serializers.CharField()
    fingerprint_token = serializers.UUIDField(required=False)

    


class ReaderTestSerializer(serializers.Serializer):
    username = serializers.CharField()
    laboratory_id = serializers.IntegerField()
    face_verified = serializers.BooleanField()
    fingerprint_verified = serializers.BooleanField()


class FingerprintScanRequestSerializer(serializers.Serializer):
    laboratory_id = serializers.IntegerField(min_value=1)
