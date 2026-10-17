from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import Group, User
from django.db import transaction

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
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    role = serializers.ChoiceField(
        choices=["Administrator", "Security Officer", "Laboratory User"],
        write_only=True,
    )
    roles = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "password", "is_active", "role", "roles"]

    def validate(self, attrs):
        if attrs.get("role") != "Laboratory User" and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A password is required for console users."})
        return attrs

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        role = validated_data.pop("role")
        password = validated_data.pop("password", None)
        user = User.objects.create_user(password=password, **validated_data)
        if role == "Laboratory User":
            user.set_unusable_password()
            user.save(update_fields=["password"])
        role_group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(role_group)
        return user

    def get_roles(self, obj):
        return list(obj.groups.values_list("name", flat=True))


class LaboratorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Laboratory
        fields = "__all__"


class BiometricProfileSerializer(serializers.ModelSerializer):
    user = serializers.SlugRelatedField(
        slug_field="username",
        queryset=User.objects.all(),
    )

    class Meta:
        model = BiometricProfile
        fields = "__all__"
        read_only_fields = ["face_registered"]


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
    fingerprint_token = serializers.UUIDField()

    


class ReaderTestSerializer(serializers.Serializer):
    username = serializers.CharField()
    laboratory_id = serializers.IntegerField()
    face_verified = serializers.BooleanField()
    fingerprint_verified = serializers.BooleanField()


class FingerprintScanRequestSerializer(serializers.Serializer):
    laboratory_id = serializers.IntegerField(min_value=1)
