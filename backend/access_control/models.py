from django.contrib.auth.models import User
from django.db import models
import uuid
from django.utils import timezone


class Laboratory(models.Model):
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class BiometricProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="biometric_profile",
    )
    fingerprint_id = models.PositiveIntegerField(
        null=True,
        blank=True,
    )
    face_registered = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}'s biometric profile"

class FingerprintChallenge(models.Model):
    token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="fingerprint_challenges",
    )

    laboratory = models.ForeignKey(
        Laboratory,
        on_delete=models.CASCADE,
        related_name="fingerprint_challenges",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    expires_at = models.DateTimeField()

    used_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    def __str__(self):
        return (
            f"Fingerprint challenge for "
            f"{self.user.username} - {self.laboratory.name}"
        )

class FaceSample(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="face_samples")
    image = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)


class AccessPermission(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="access_permissions",
    )
    laboratory = models.ForeignKey(
        Laboratory,
        on_delete=models.CASCADE,
        related_name="access_permissions",
    )
    is_allowed = models.BooleanField(default=True)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.laboratory.name}"


class AuthenticationEvent(models.Model):
    RESULT_CHOICES = [
        ("GRANTED", "Granted"),
        ("DENIED", "Denied"),
    ]
    SOURCE_CHOICES = [("TERMINAL", "Access terminal"), ("READER_TEST", "Reader test")]

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authentication_events",
    )
    laboratory = models.ForeignKey(
        Laboratory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authentication_events",
    )
    face_verified = models.BooleanField(default=False)
    fingerprint_verified = models.BooleanField(default=False)
    result = models.CharField(
        max_length=10,
        choices=RESULT_CHOICES,
    )
    denial_reason = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default="TERMINAL")
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        username = self.user.username if self.user else "Unknown"
        return f"{username} - {self.result}"


class SecurityEvent(models.Model):
    EVENT_TYPES = [
        ("FORCED_ENTRY", "Forced Entry"),
        ("DOOR_LEFT_OPEN", "Door Left Open"),
        ("UNKNOWN_FACE", "Unknown Face"),
        ("FAILED_AUTH", "Failed Authentication"),
        ("SYSTEM_ALERT", "System Alert"),
    ]

    SEVERITY_CHOICES = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
    ]

    laboratory = models.ForeignKey(
        Laboratory,
        on_delete=models.CASCADE,
        related_name="security_events",
    )
    event_type = models.CharField(
        max_length=30,
        choices=EVENT_TYPES,
    )
    description = models.TextField()
    severity = models.CharField(
        max_length=10,
        choices=SEVERITY_CHOICES,
    )
    source_event_id = models.UUIDField(
        null=True,
        blank=True,
        editable=False,
        unique=True,
    )
    resolved = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.event_type} - {self.laboratory.name}"