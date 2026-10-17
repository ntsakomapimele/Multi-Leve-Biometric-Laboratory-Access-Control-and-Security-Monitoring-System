from datetime import timedelta

from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AccessPermission, AuthenticationEvent, Laboratory


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

	def test_live_terminal_denies_while_fingerprint_reader_is_offline(self):
		AccessPermission.objects.create(user=self.user, laboratory=self.laboratory)
		with self.settings():
			from unittest.mock import patch
			with patch("access_control.views.extract_face", return_value=object()), patch("access_control.views.matches_sample", return_value=True):
				response = self.client.post(
					"/api/authenticate/",
					{"username": self.user.username, "laboratory_id": self.laboratory.id, "face_image": "captured-frame"},
					format="json",
				)

		self.assertEqual(response.status_code, 403)
		self.assertEqual(response.data["result"], "DENIED")
		self.assertEqual(response.data["denial_reason"], "Fingerprint reader is offline.")


class UserAndPermissionApiTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.admin = User.objects.create_user(username="admin", password="admin-pass")
		self.admin.groups.create(name="Administrator")
		self.operator = User.objects.create_user(username="operator", password="operator-pass")
		self.laboratory = Laboratory.objects.create(name="Physics Lab", location="Building B")

	def test_authenticated_user_can_list_users(self):
		self.client.force_authenticate(self.operator)

		response = self.client.get("/api/users/")

		self.assertEqual(response.status_code, 200)
		self.assertEqual({item["username"] for item in response.data}, {"admin", "operator"})

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
			{"username": "new-user", "password": "new-user-pass", "role": "Laboratory User"},
			format="json",
		)
		self.assertEqual(response.status_code, 201)
		created = User.objects.get(username="new-user")
		self.assertTrue(created.check_password("new-user-pass"))
		self.assertTrue(created.groups.filter(name="Laboratory User").exists())

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
