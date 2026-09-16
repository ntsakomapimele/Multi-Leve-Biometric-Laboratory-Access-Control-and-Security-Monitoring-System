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
