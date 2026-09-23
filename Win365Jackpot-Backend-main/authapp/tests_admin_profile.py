"""
authapp/tests_admin_profile.py
─────────────────────────────────────────────────────────────────────────────
ADMIN-PROFILE — an admin changes their own password, proven by an OTP sent to
their registered email.

The properties that matter:
  * the typed email must match the account, and the code only ever goes to
    the registered address;
  * a wrong / expired / other-flow code never changes the password, and
    repeated wrong codes burn the issued one;
  * success actually changes the password and signs out every session.
"""

import os
from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from django.test import TestCase

from authapp.models import ActivityLog, OTPRecord, User
from authapp.models.user_model import AdminProfile
from authapp.otp.otp_utils import LOGO_CID, LOGO_PATH
from authapp.views.admin_profile_views import MAX_OTP_ATTEMPTS, OTP_MODE

SEND = "authapp.views.admin_profile_views.send_otp_email_html"
REQUEST_URL = "/api/admin-panel/me/change-password/request-otp/"
CHANGE_URL = "/api/admin-panel/me/change-password/"
NEW_PW = "N3w-Secure!pw"


class AdminProfileTests(TestCase):
    def setUp(self):
        cache.clear()  # throttles and attempt counters live in the cache
        self.admin = User.objects.create_user(
            email="profileadmin@jackpotsworld.vip", password="Old-Pass1!", name="Profile Admin",
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])
        AdminProfile.objects.create(user=self.admin, role="support", department="Support")
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _issue_code(self):
        with patch(SEND) as send:
            res = self.client.post(REQUEST_URL, {"email": self.admin.email}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return send.call_args.args[1]

    # ── profile ──────────────────────────────────────────────────────────────

    def test_profile_returns_the_signed_in_admins_details(self):
        res = self.client.get("/api/admin-panel/me/profile/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["email"], self.admin.email)
        self.assertEqual(res.data["name"], "Profile Admin")
        self.assertEqual(res.data["role_label"], "Support")
        self.assertNotIn("password", res.data)

    def test_profile_is_closed_to_players(self):
        player = User.objects.create_user(email="p@jackpotsworld.vip", password="Pl-ayer12!")
        self.client.force_authenticate(user=player)
        self.assertEqual(self.client.get("/api/admin-panel/me/profile/").status_code, 403)
        self.assertEqual(self.client.post(REQUEST_URL, {"email": player.email}, format="json").status_code, 403)

    # ── request-otp ──────────────────────────────────────────────────────────

    def test_mismatched_email_is_refused_and_nothing_is_sent(self):
        with patch(SEND) as send:
            res = self.client.post(REQUEST_URL, {"email": "attacker@example.com"}, format="json")
        self.assertEqual(res.status_code, 400)
        send.assert_not_called()
        self.assertFalse(OTPRecord.objects.filter(mode=OTP_MODE).exists())

    def test_code_goes_to_the_registered_address_matching_case_insensitively(self):
        with patch(SEND) as send:
            res = self.client.post(REQUEST_URL, {"email": "  ProfileAdmin@JackpotsWorld.VIP "}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(send.call_args.args[0], self.admin.email)
        self.assertTrue(OTPRecord.objects.filter(email=self.admin.email, mode=OTP_MODE).exists())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_the_real_email_carries_the_code_and_the_inline_logo(self):
        """Unpatched send: the message that would reach the admin's inbox.
        The logo assertion guards LOGO_PATH -- when the bundle moved it, OTP
        emails lost their logo silently for weeks."""
        res = self.client.post(REQUEST_URL, {"email": self.admin.email}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, [self.admin.email])
        code = OTPRecord.objects.get(mode=OTP_MODE).otp
        self.assertIn(code, msg.body)
        self.assertTrue(os.path.exists(LOGO_PATH), LOGO_PATH)
        self.assertIn('src="cid:%s"' % LOGO_CID, msg.alternatives[0][0])
        self.assertEqual(len(msg.attachments), 1)

    def test_failed_delivery_leaves_no_usable_code(self):
        with patch(SEND, side_effect=OSError("smtp down")):
            res = self.client.post(REQUEST_URL, {"email": self.admin.email}, format="json")
        self.assertEqual(res.status_code, 500)
        self.assertFalse(OTPRecord.objects.filter(mode=OTP_MODE).exists())

    # ── change-password ──────────────────────────────────────────────────────

    def test_correct_code_changes_password_and_signs_out_everywhere(self):
        RefreshToken.for_user(self.admin)  # an existing session
        code = self._issue_code()
        res = self.client.post(CHANGE_URL, {"otp": code, "new_password": NEW_PW}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(NEW_PW))
        self.assertFalse(OTPRecord.objects.filter(mode=OTP_MODE).exists())
        outstanding = OutstandingToken.objects.filter(user=self.admin).count()
        self.assertGreater(outstanding, 0)
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.admin).count(), outstanding)
        self.assertTrue(ActivityLog.objects.filter(action="password_change", actor=self.admin).exists())

    def test_wrong_code_does_not_change_password_and_attempts_burn_the_code(self):
        code = self._issue_code()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(MAX_OTP_ATTEMPTS):
            res = self.client.post(CHANGE_URL, {"otp": wrong, "new_password": NEW_PW}, format="json")
            self.assertEqual(res.status_code, 400)
        # The right code no longer works once the attempts are spent.
        res = self.client.post(CHANGE_URL, {"otp": code, "new_password": NEW_PW}, format="json")
        self.assertEqual(res.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password("Old-Pass1!"))

    def test_expired_code_is_refused(self):
        code = self._issue_code()
        OTPRecord.objects.filter(mode=OTP_MODE).update(expires_at=timezone.now() - timedelta(seconds=1))
        res = self.client.post(CHANGE_URL, {"otp": code, "new_password": NEW_PW}, format="json")
        self.assertEqual(res.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password("Old-Pass1!"))

    def test_a_player_forgot_password_code_cannot_be_spent_here(self):
        OTPRecord.objects.create(
            email=self.admin.email, otp="424242", mode="reset",
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        res = self.client.post(CHANGE_URL, {"otp": "424242", "new_password": NEW_PW}, format="json")
        self.assertEqual(res.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password("Old-Pass1!"))

    def test_weak_or_unchanged_password_is_refused_without_spending_the_code(self):
        code = self._issue_code()
        res = self.client.post(CHANGE_URL, {"otp": code, "new_password": "weak"}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.client.post(CHANGE_URL, {"otp": code, "new_password": "Old-Pass1!"}, format="json")
        self.assertEqual(res.status_code, 400)
        # Code is still good for a valid attempt.
        res = self.client.post(CHANGE_URL, {"otp": code, "new_password": NEW_PW}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
