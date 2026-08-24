from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AccessPermission, AuthenticationEvent, Laboratory


class AuthenticateViewTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.user = User.objects.create_user(username="researcher")
		self.laboratory = Laboratory.objects.create(
			name="Materials Lab",
			location="Building A",
		)
		self.payload = {
			"username": self.user.username,
			"laboratory_id": self.laboratory.id,
			"face_verified": True,
			"fingerprint_verified": True,
		}

	def test_grants_access_with_current_permission_and_biometrics(self):
		AccessPermission.objects.create(
			user=self.user,
			laboratory=self.laboratory,
			valid_from=timezone.now() - timedelta(minutes=1),
			valid_until=timezone.now() + timedelta(minutes=1),
		)

		response = self.client.post("/api/authenticate/", self.payload)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["result"], "GRANTED")
		self.assertEqual(AuthenticationEvent.objects.count(), 1)

	def test_denies_access_when_permission_is_outside_validity_window(self):
		AccessPermission.objects.create(
			user=self.user,
			laboratory=self.laboratory,
			valid_until=timezone.now() - timedelta(minutes=1),
		)

		response = self.client.post("/api/authenticate/", self.payload)

		self.assertEqual(response.status_code, 403)
		self.assertEqual(response.data["result"], "DENIED")

	def test_denies_access_when_biometric_check_fails(self):
		AccessPermission.objects.create(
			user=self.user,
			laboratory=self.laboratory,
		)
		self.payload["face_verified"] = False

		response = self.client.post("/api/authenticate/", self.payload)

		self.assertEqual(response.status_code, 403)
		self.assertEqual(response.data["result"], "DENIED")

# Create your tests here.
