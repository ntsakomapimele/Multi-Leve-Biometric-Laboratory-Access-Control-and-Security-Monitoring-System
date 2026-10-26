from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.utils import timezone
import numpy as np
from rest_framework.test import APIClient

from .models import (
	AccessPermission,
	AuthenticationEvent,
	BiometricProfile,
	FaceSample,
	FingerprintChallenge,
	Laboratory,
)


class AuthenticateViewTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.user = User.objects.create_user(username="researcher")
		self.user.groups.create(name="Administrator")
		self.client.force_authenticate(self.user)
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

		response = self.client.post("/api/reader-test/", self.payload)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["result"], "GRANTED")
		self.assertEqual(response.data["source"], "READER_TEST")
		self.assertEqual(AuthenticationEvent.objects.count(), 1)

	def test_denies_access_when_permission_is_outside_validity_window(self):
		AccessPermission.objects.create(
			user=self.user,
			laboratory=self.laboratory,
			valid_until=timezone.now() - timedelta(minutes=1),
		)

		response = self.client.post("/api/reader-test/", self.payload)

		self.assertEqual(response.status_code, 403)
		self.assertEqual(response.data["result"], "DENIED")
		self.assertEqual(response.data["denial_reason"], "No active permission for this laboratory.")

	def test_live_terminal_requires_a_face_image_and_never_trusts_client_flags(self):
		AccessPermission.objects.create(
			user=self.user,
			laboratory=self.laboratory,
		)
		response = self.client.post(
			"/api/authenticate/",
			{"username": self.user.username, "laboratory_id": self.laboratory.id, "face_verified": True, "fingerprint_verified": True},
			format="json",
		)

		self.assertEqual(response.status_code, 400)

	def test_live_terminal_requires_fingerprint_challenge(self):
		response = APIClient().post(
			"/api/authenticate/",
			{"username": self.user.username, "laboratory_id": self.laboratory.id, "face_image": "captured-frame"},
			format="json",
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn("fingerprint_token", response.data)


class UserAndPermissionApiTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.admin = User.objects.create_user(username="admin", password="admin-pass")
		self.admin.groups.create(name="Administrator")
		self.operator = User.objects.create_user(username="operator", password="operator-pass")
		self.laboratory = Laboratory.objects.create(name="Physics Lab", location="Building B")

	def test_only_security_staff_can_list_users(self):
		self.client.force_authenticate(self.operator)
		response = self.client.get("/api/users/")
		self.assertEqual(response.status_code, 403)

		self.client.force_authenticate(self.admin)

		response = self.client.get("/api/users/")

		self.assertEqual(response.status_code, 200)
		self.assertEqual({item["username"] for item in response.data}, {"admin", "operator"})

	def test_laboratory_user_cannot_access_management_apis(self):
		laboratory_user = User.objects.create_user(username="lab-user")
		laboratory_user.groups.create(name="Laboratory User")
		self.client.force_authenticate(laboratory_user)

		for endpoint in ["/api/users/", "/api/biometric-profiles/", "/api/access-permissions/"]:
			with self.subTest(endpoint=endpoint):
				response = self.client.get(endpoint)
				self.assertEqual(response.status_code, 403)

	def test_anonymous_terminal_can_list_active_laboratories(self):
		Laboratory.objects.create(name="Closed Lab", location="Building C", is_active=False)
		response = APIClient().get("/api/laboratories/")

		self.assertEqual(response.status_code, 200)
		self.assertEqual([item["name"] for item in response.data], ["Physics Lab"])

	def test_only_administrator_can_create_user(self):
		self.client.force_authenticate(self.operator)
		response = self.client.post(
			"/api/users/",
			{"username": "new-user", "password": "new-user-pass", "role": "Laboratory User"},
			format="json",
		)
		self.assertEqual(response.status_code, 403)

		self.client.force_authenticate(self.admin)
		response = self.client.post(
			"/api/users/",
			{"username": "new-user", "role": "Laboratory User"},
			format="json",
		)
		self.assertEqual(response.status_code, 201)
		created = User.objects.get(username="new-user")
		self.assertFalse(created.has_usable_password())
		self.assertTrue(created.groups.filter(name="Laboratory User").exists())
		self.assertTrue(BiometricProfile.objects.filter(user=created).exists())

	def test_security_officer_can_view_but_not_modify_biometric_profiles(self):
		officer = User.objects.create_user(username="officer")
		officer.groups.create(name="Security Officer")
		profile = BiometricProfile.objects.create(user=self.operator)
		self.client.force_authenticate(officer)

		self.assertEqual(self.client.get("/api/biometric-profiles/").status_code, 200)
		self.assertEqual(
			self.client.post(
				"/api/biometric-profiles/",
				{"user": "operator", "fingerprint_id": 17},
				format="json",
			).status_code,
			403,
		)
		self.assertEqual(
			self.client.patch(
				f"/api/biometric-profiles/{profile.pk}/",
				{"fingerprint_id": 17},
				format="json",
			).status_code,
			403,
		)
		self.assertEqual(
			self.client.delete(f"/api/biometric-profiles/{profile.pk}/").status_code,
			403,
		)
		self.assertEqual(
			self.client.post(
				"/api/users/",
				{"username": "new-user", "role": "Laboratory User"},
				format="json",
			).status_code,
			403,
		)
		self.assertEqual(
			self.client.post(
				"/api/face-enroll/",
				{"username": "operator", "face_image": "captured-frame"},
				format="json",
			).status_code,
			403,
		)
		self.assertEqual(
			self.client.post(
				"/api/fingerprint-enrollment/start/",
				{"user_id": self.operator.pk},
				format="json",
			).status_code,
			403,
		)
		self.assertTrue(BiometricProfile.objects.filter(pk=profile.pk).exists())
		self.assertFalse(User.objects.filter(username="new-user").exists())

	def test_user_creation_reuses_existing_role_group(self):
		role_group = Group.objects.create(name="Laboratory User")
		self.client.force_authenticate(self.admin)

		response = self.client.post(
			"/api/users/",
			{"username": "another-lab-user", "role": "Laboratory User"},
			format="json",
		)

		self.assertEqual(response.status_code, 201)
		created = User.objects.get(username="another-lab-user")
		self.assertTrue(created.groups.filter(pk=role_group.pk).exists())
		self.assertEqual(Group.objects.filter(name="Laboratory User").count(), 1)

	def test_biometric_profile_uses_username(self):
		self.client.force_authenticate(self.admin)
		response = self.client.post(
			"/api/biometric-profiles/",
			{"user": "operator", "fingerprint_id": 17, "face_registered": True},
			format="json",
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data["user"], "operator")
		self.assertFalse(response.data["face_registered"])

	def test_face_enrollment_stores_a_sample_for_username(self):
		self.client.force_authenticate(self.admin)
		with patch("access_control.views.extract_face", return_value=np.zeros((200, 200), dtype=np.uint8)):
			response = self.client.post(
				"/api/face-enroll/",
				{"username": "operator", "face_image": "captured-frame"},
				format="json",
			)

		self.assertEqual(response.status_code, 201)
		self.assertTrue(BiometricProfile.objects.get(user=self.operator).face_registered)
		self.assertEqual(FaceSample.objects.filter(user=self.operator).count(), 1)

	def test_anonymous_fingerprint_scan_resolves_device_template_to_user(self):
		BiometricProfile.objects.create(user=self.operator, fingerprint_id=17)
		client = APIClient()
		with self.settings(ESP32_DEVICE_URL="http://sensor", ESP32_DEVICE_KEY="test-key"):
			with patch("access_control.views.urlopen") as urlopen:
				urlopen.return_value.__enter__.return_value.read.return_value = b'{"fingerprint_id": 17}'
				response = client.post(
					"/api/fingerprint-scan/",
					{"laboratory_id": self.laboratory.id},
					format="json",
				)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["username"], "operator")
		self.assertEqual(FingerprintChallenge.objects.count(), 1)

	def test_reader_test_is_administrator_only(self):
		self.client.force_authenticate(self.operator)
		response = self.client.post(
			"/api/reader-test/",
			{"username": self.operator.username, "laboratory_id": self.laboratory.id, "face_verified": True, "fingerprint_verified": True},
			format="json",
		)
		self.assertEqual(response.status_code, 403)

	def test_permission_accepts_username(self):
		self.client.force_authenticate(self.admin)
		response = self.client.post(
			"/api/access-permissions/",
			{"user": "operator", "laboratory": self.laboratory.id, "is_allowed": True},
			format="json",
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data["user"], "operator")

# Create your tests here.
