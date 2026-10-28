from datetime import timedelta
import json
import os
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.utils import timezone
import numpy as np
from urllib.error import URLError
from rest_framework.test import APIClient

from .models import (
	AccessPermission,
	AuthenticationEvent,
	BiometricProfile,
	FaceSample,
	FingerprintChallenge,
	Laboratory,
	SecurityEvent,
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


class DoorStatusApiTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.user = User.objects.create_user(username="security")
		self.client.force_authenticate(self.user)

	def test_requires_authentication(self):
		response = APIClient().get("/api/door/status/")
		self.assertEqual(response.status_code, 401)

	def test_returns_valid_door_reading_from_configured_bridge(self):
		payload = {"door_status": "OPEN", "sensor_reading": 1}
		with self.settings(
			SENTRYLAB_BRIDGE_URL="http://bridge:8765/",
			BRIDGE_KEY="server-secret",
		):
			with patch("access_control.views.urlopen") as urlopen:
				urlopen.return_value.__enter__.return_value.read.return_value = (
					json.dumps(payload).encode()
				)
				response = self.client.get("/api/door/status/")

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["door_status"], "OPEN")
		self.assertEqual(response.data["sensor_reading"], 1)
		self.assertTrue(response.data["device_online"])
		self.assertFalse(response.data["stale"])
		self.assertTrue(response.data["last_updated"])
		outgoing = urlopen.call_args.args[0]
		self.assertEqual(outgoing.full_url, "http://bridge:8765/door/status")
		self.assertEqual(outgoing.get_header("X-device-key"), "server-secret")
		self.assertEqual(urlopen.call_args.kwargs["timeout"], 5)

	def test_returns_service_unavailable_when_bridge_key_is_missing(self):
		with self.settings(SENTRYLAB_BRIDGE_URL="http://bridge:8765", BRIDGE_KEY=""):
			with patch("access_control.views.urlopen") as urlopen:
				response = self.client.get("/api/door/status/")

		self.assertEqual(response.status_code, 503)
		urlopen.assert_not_called()

	def test_rejects_invalid_sensor_data(self):
		for payload in (
			{"door_status": "JAMMED", "sensor_reading": 1},
			{"door_status": "OPEN", "sensor_reading": True},
			{"door_status": "CLOSED", "sensor_reading": 2},
		):
			with self.subTest(payload=payload):
				with self.settings(
					SENTRYLAB_BRIDGE_URL="http://bridge:8765",
					BRIDGE_KEY="server-secret",
				):
					with patch("access_control.views.urlopen") as urlopen:
						urlopen.return_value.__enter__.return_value.read.return_value = (
							json.dumps(payload).encode()
						)
						response = self.client.get("/api/door/status/")

				self.assertEqual(response.status_code, 502)
				self.assertEqual(response.data["error"], "Invalid door sensor response.")
				self.assertIsNone(response.data["door_status"])
				self.assertTrue(response.data["stale"])

	def test_returns_gateway_error_when_bridge_is_unavailable(self):
		with self.settings(
			SENTRYLAB_BRIDGE_URL="http://bridge:8765",
			BRIDGE_KEY="server-secret",
		):
			with patch("access_control.views.urlopen", side_effect=URLError("offline")):
				response = self.client.get("/api/door/status/")

		self.assertEqual(response.status_code, 502)
		self.assertIsNone(response.data["door_status"])
		self.assertFalse(response.data["device_online"])
		self.assertTrue(response.data["stale"])


class DoorStateWebhookTests(TestCase):
	def setUp(self):
		self.laboratory = Laboratory.objects.create(
			name="Materials Lab",
			location="Building A",
		)
		self.url = "/api/internal/door-state/"
		self.headers = {"HTTP_X_DOOR_EVENT_KEY": "webhook-secret"}

	def post_door_state(self, payload, **extra):
		return self.client.post(
			self.url,
			data=json.dumps(payload),
			content_type="application/json",
			**(self.headers | extra),
		)

	def test_rejects_missing_or_incorrect_webhook_key(self):
		with patch.dict(os.environ, {"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret"}):
			for headers in ({}, {"HTTP_X_DOOR_EVENT_KEY": "wrong-secret"}):
				with self.subTest(headers=headers):
					response = self.client.post(
						self.url,
						data=json.dumps({"event_type": "DOOR_LEFT_OPEN"}),
						content_type="application/json",
						**headers,
					)

					self.assertEqual(response.status_code, 401)
		self.assertEqual(SecurityEvent.objects.count(), 0)

	def test_door_left_open_notification_creates_security_event(self):
		event_id = "06d4d7a2-65c7-4a2d-b71c-9a826451a0cc"
		with patch.dict(os.environ, {
			"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret",
			"SENTRYLAB_LABORATORY_ID": str(self.laboratory.pk),
		}):
			response = self.post_door_state({
				"event_type": "DOOR_LEFT_OPEN",
				"event_id": event_id,
			})

		self.assertEqual(response.status_code, 201)
		self.assertTrue(response.json()["security_event_created"])
		self.assertEqual(response.json()["event_id"], event_id)
		event = SecurityEvent.objects.get()
		self.assertEqual(event.laboratory, self.laboratory)
		self.assertEqual(event.event_type, "DOOR_LEFT_OPEN")
		self.assertEqual(event.severity, "HIGH")
		self.assertEqual(str(event.source_event_id), event_id)

	def test_each_accepted_notification_creates_one_event(self):
		payload = {
			"event_type": "DOOR_LEFT_OPEN",
			"event_id": "06d4d7a2-65c7-4a2d-b71c-9a826451a0cc",
		}
		with patch.dict(os.environ, {
			"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret",
			"SENTRYLAB_LABORATORY_ID": str(self.laboratory.pk),
		}):
			first_response = self.post_door_state(payload)
			second_response = self.post_door_state(payload)

		self.assertEqual(first_response.status_code, 201)
		self.assertEqual(second_response.status_code, 200)
		self.assertTrue(first_response.json()["security_event_created"])
		self.assertFalse(second_response.json()["security_event_created"])
		self.assertEqual(SecurityEvent.objects.count(), 1)

	def test_event_identifier_cannot_be_reused_for_another_laboratory(self):
		other_laboratory = Laboratory.objects.create(
			name="Chemistry Lab",
			location="Building B",
		)
		event_id = "06d4d7a2-65c7-4a2d-b71c-9a826451a0cc"
		with patch.dict(os.environ, {
			"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret",
			"SENTRYLAB_LABORATORY_ID": str(self.laboratory.pk),
		}):
			first_response = self.post_door_state({
				"event_type": "DOOR_LEFT_OPEN",
				"event_id": event_id,
			})
		with patch.dict(os.environ, {
			"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret",
			"SENTRYLAB_LABORATORY_ID": str(other_laboratory.pk),
		}):
			reuse_response = self.post_door_state({
				"event_type": "DOOR_LEFT_OPEN",
				"event_id": event_id,
			})

		self.assertEqual(first_response.status_code, 201)
		self.assertEqual(reuse_response.status_code, 409)
		self.assertEqual(SecurityEvent.objects.count(), 1)

	def test_unsupported_event_type_is_rejected(self):
		with patch.dict(os.environ, {"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret"}):
			response = self.post_door_state({"event_type": "DOOR_CLOSED"})

		self.assertEqual(response.status_code, 400)
		self.assertEqual(SecurityEvent.objects.count(), 0)

	def test_invalid_payloads_are_rejected(self):
		with patch.dict(os.environ, {"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret"}):
			for body in (
				"not-json",
				"[]",
				'{"event_type":"DOOR_CLOSED"}',
				'{"event_type":"DOOR_LEFT_OPEN","event_id":"not-a-uuid"}',
			):
				with self.subTest(body=body):
					response = self.client.post(
						self.url,
						data=body,
						content_type="application/json",
						**self.headers,
					)

					self.assertEqual(response.status_code, 400)
		self.assertEqual(SecurityEvent.objects.count(), 0)

	def test_missing_laboratory_configuration_is_server_error(self):
		with patch.dict(os.environ, {
			"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret",
			"SENTRYLAB_LABORATORY_ID": "",
		}):
			response = self.post_door_state({"event_type": "DOOR_LEFT_OPEN"})

		self.assertEqual(response.status_code, 500)

	def test_inactive_laboratory_is_not_accepted(self):
		self.laboratory.is_active = False
		self.laboratory.save(update_fields=["is_active"])
		with patch.dict(os.environ, {
			"DOOR_EVENT_WEBHOOK_KEY": "webhook-secret",
			"SENTRYLAB_LABORATORY_ID": str(self.laboratory.pk),
		}):
			response = self.post_door_state({"event_type": "DOOR_LEFT_OPEN"})

		self.assertEqual(response.status_code, 500)
		self.assertEqual(SecurityEvent.objects.count(), 0)
