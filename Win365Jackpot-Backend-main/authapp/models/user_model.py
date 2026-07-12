"""
authapp/models/user_model.py
Production-grade User model with country, phone, strict fields.
Removed: is_banned, banned_at, banned_by, ban_reason
"""
import random
import string

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone
from django.conf import settings


# ─────────────────────────────────────────────────────────────────────────────
# UID / Referral helpers
# ─────────────────────────────────────────────────────────────────────────────

def _gen_win_uid():
    letters = random.choices(string.ascii_uppercase, k=2)
    digits  = random.choices(string.digits, k=2)
    return "WIN" + "".join(letters) + "".join(digits)


def _unique_win_uid():
    uid = _gen_win_uid()
    while User.objects.filter(user_uid=uid).exists():
        uid = _gen_win_uid()
    return uid


def _gen_referral_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


# ─────────────────────────────────────────────────────────────────────────────
# UserManager
# ─────────────────────────────────────────────────────────────────────────────

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user  = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff",     True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


# ─────────────────────────────────────────────────────────────────────────────
# User
# ─────────────────────────────────────────────────────────────────────────────

class User(AbstractBaseUser, PermissionsMixin):

    VIP_LEVELS = [(i, f"VIP {i}") for i in range(1, 11)]

    KYC_CHOICES = [
        ("pending",   "Pending"),
        ("submitted", "Submitted"),
        ("approved",  "Approved"),
        ("rejected",  "Rejected"),
    ]

    # ── Identity ──────────────────────────────────────────────────────────────
    user_uid      = models.CharField(max_length=10, unique=True, editable=False, db_index=True)
    email         = models.EmailField(unique=True, db_index=True)
    name          = models.CharField(max_length=120, blank=True)

    # ── Country & Phone ───────────────────────────────────────────────────────
    # country stores ISO 3166-1 alpha-2 code, e.g. "IN", "US"
    country       = models.CharField(max_length=2, blank=True, db_index=True)
    # phone stores full number including country dial code prefix, e.g. "+919876543210"
    phone         = models.CharField(max_length=20, blank=True, db_index=True)
    # dial_code stored separately for display, e.g. "+91"
    dial_code     = models.CharField(max_length=6, blank=True)

    # ── Profile ───────────────────────────────────────────────────────────────
    date_of_birth         = models.DateField(null=True, blank=True)
    profile_last_updated  = models.DateTimeField(null=True, blank=True)
    profile_locked_until  = models.DateTimeField(null=True, blank=True)
    avatar                = models.ImageField(upload_to="avatars/", null=True, blank=True)
    avatar_url            = models.URLField(blank=True, null=True)

    # ISO 639-1 code (e.g. "en", "hi"), or "zh-CN"/"zh-TW" for the two Chinese
    # variants — matches the language codes used by the frontend's i18next config.
    preferred_language    = models.CharField(max_length=8, default="en")

    # ── VIP ───────────────────────────────────────────────────────────────────
    vip_level = models.PositiveSmallIntegerField(choices=VIP_LEVELS, default=1, db_index=True)
    vip_xp    = models.IntegerField(default=0)

    # ── Wallet totals (summary fields) ────────────────────────────────────────
    wallet_balance  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    bonus_balance   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_deposited = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_withdrawn = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_won       = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # ── Rolling Points ────────────────────────────────────────────────────────
    rolling_points_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # ── Referral ──────────────────────────────────────────────────────────────
    referral_code     = models.CharField(max_length=12, unique=True, blank=True, db_index=True)
    referred_by       = models.ForeignKey(
        "self", null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="referrals"
    )
    referral_code_used = models.CharField(max_length=12, blank=True)   # stores the code they used at signup
    referral_count    = models.IntegerField(default=0)
    referral_earnings = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # ── KYC / Flags ───────────────────────────────────────────────────────────
    kyc_status  = models.CharField(max_length=20, choices=KYC_CHOICES, default="pending", db_index=True)
    is_verified = models.BooleanField(default=False)
    is_active   = models.BooleanField(default=True, db_index=True)
    is_staff    = models.BooleanField(default=False)

    # ── Timestamps / Session ──────────────────────────────────────────────────
    date_joined   = models.DateTimeField(default=timezone.now, db_index=True)
    last_login    = models.DateTimeField(null=True, blank=True, db_index=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    # ── Login geolocation (resolved from last_login_ip via a free IP-lookup
    # service at login/signup time — best-effort, left blank if the lookup
    # fails or the IP is a private/loopback address) ─────────────────────────
    last_login_city         = models.CharField(max_length=100, blank=True)
    last_login_region       = models.CharField(max_length=100, blank=True)
    last_login_country_name = models.CharField(max_length=100, blank=True)


    objects = UserManager()

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = []

    class Meta:
        indexes = [
            models.Index(fields=["vip_level", "is_active"]),
            models.Index(fields=["kyc_status", "date_joined"]),
            models.Index(fields=["date_joined"]),
            models.Index(fields=["country", "is_active"]),
        ]

    def __str__(self):
        return f"{self.user_uid} | {self.email}"

    def save(self, *args, **kwargs):
        if not self.user_uid:
            self.user_uid = _unique_win_uid()
        if not self.referral_code:
            self.referral_code = _gen_referral_code()
        super().save(*args, **kwargs)

    @property
    def vip_xp_needed(self):
        return self.vip_level * 100

    @property
    def vip_progress_pct(self):
        if self.vip_level >= 10:
            return 100
        return min(int((self.vip_xp / self.vip_xp_needed) * 100), 100)


# ─────────────────────────────────────────────────────────────────────────────
# AdminProfile  (unchanged)
# ─────────────────────────────────────────────────────────────────────────────

class AdminProfile(models.Model):
    ROLE_CHOICES = [
        ("superadmin",  "Super Admin"),
        ("admin",       "Admin"),
        ("support",     "Support"),
        ("finance",     "Finance"),
        ("kyc_officer", "KYC Officer"),
    ]

    user         = models.OneToOneField(User, on_delete=models.CASCADE, related_name="admin_profile")
    role         = models.CharField(max_length=20, choices=ROLE_CHOICES, default="admin")
    mobile       = models.CharField(max_length=20, blank=True)
    geo_location = models.CharField(max_length=120, blank=True)
    department   = models.CharField(max_length=60, blank=True)
    notes        = models.TextField(blank=True)

    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login    = models.DateTimeField(null=True, blank=True)
    login_count   = models.IntegerField(default=0)

    can_edit_users     = models.BooleanField(default=True)
    can_manage_finance = models.BooleanField(default=True)
    can_approve_kyc    = models.BooleanField(default=True)
    can_send_notifs    = models.BooleanField(default=True)
    can_manage_vip     = models.BooleanField(default=True)
    is_active          = models.BooleanField(default=True)

    THEME_CHOICES = [("dark", "Dark"), ("light", "Light")]
    theme_preference = models.CharField(max_length=10, choices=THEME_CHOICES, default="dark")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["role", "is_active"])]

    def __str__(self):
        return f"{self.user.email} [{self.role}]"


# ─────────────────────────────────────────────────────────────────────────────
# OTPRecord
# ─────────────────────────────────────────────────────────────────────────────

class OTPRecord(models.Model):
    email      = models.EmailField(db_index=True)
    phone      = models.CharField(max_length=20, blank=True, null=True)
    otp        = models.CharField(max_length=6)
    mode       = models.CharField(max_length=10, default="login")  # login | register
    is_used    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=["email", "is_used", "expires_at"])]

    def is_valid(self):
        return not self.is_used and self.expires_at > timezone.now()


# ─────────────────────────────────────────────────────────────────────────────
# ActivityLog
# ─────────────────────────────────────────────────────────────────────────────

class ActivityLog(models.Model):

    ACTION_CHOICES = [
        ("login", "Login"),
        ("logout", "Logout"),
        ("register", "Register"),
        ("password_change", "Password Changed"),
        ("otp_sent", "OTP Sent"),
        ("otp_verified", "OTP Verified"),
        ("profile_updated", "Profile Updated"),
        ("avatar_changed", "Avatar Changed"),
        ("admin_login", "Admin Login"),
        ("admin_logout", "Admin Logout"),
        ("wallet_credit", "Wallet Credit"),
        ("wallet_debit", "Wallet Debit"),
        ("wallet_adjusted", "Wallet Adjusted"),
        ("deposit_created", "Deposit Created"),
        ("withdrawal_created", "Withdrawal Created"),
        ("casino_visit_recorded", "Casino Visit Recorded"),
        ("casino_transfer", "Casino Transfer"),
        ("rolling_points_rejected", "Rolling Points Rejected"),
        ("bonus_added", "Bonus Added"),
        ("reward_created", "Reward Created"),
        ("reward_claimed", "Reward Claimed"),
        ("vip_upgraded", "VIP Upgraded"),
        ("vip_downgraded", "VIP Downgraded"),
        ("kyc_submitted", "KYC Submitted"),
        ("kyc_approved", "KYC Approved"),
        ("kyc_rejected", "KYC Rejected"),
        ("notification_sent", "Notification Sent"),
        ("staff_created", "Staff Created"),
        ("settings_changed", "Settings Changed"),
        ("other", "Other"),
    ]

    CR_DR_CHOICES = [("CR", "Credit"), ("DR", "Debit")]

    WALLET_TYPES = [
        ("cash", "Cash"),
        ("non_cash", "Non Cash"),
        ("otp", "OTP"),
        ("rolling_points", "Rolling Points"),
    ]

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="activity_actor"
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="activity_target"
    )
    action      = models.CharField(max_length=50, choices=ACTION_CHOICES)
    description = models.TextField(blank=True, null=True)

    amount         = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cr_dr          = models.CharField(max_length=2, choices=CR_DR_CHOICES, null=True, blank=True)
    wallet_type    = models.CharField(max_length=20, choices=WALLET_TYPES, null=True, blank=True)
    before_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    after_balance  = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    casino_name    = models.CharField(max_length=100, null=True, blank=True)
    reference_id   = models.CharField(max_length=100, null=True, blank=True)
    meta           = models.JSONField(default=dict, blank=True)
    ip_address     = models.GenericIPAddressField(null=True, blank=True)
    user_agent     = models.TextField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} | {self.target_user} | {self.created_at.strftime('%Y-%m-%d %H:%M')}"

    @classmethod
    def log(
        cls, *, actor=None, target_user=None, action,
        amount=None, cr_dr=None, wallet_type=None,
        before_balance=None, after_balance=None,
        casino_name=None, description=None,
        reference_id=None, meta=None,
        ip_address=None, user_agent=None,
        endpoint=None, actor_type=None,
    ):
        if amount is not None and amount < 0:
            amount = abs(amount)
        if amount and before_balance is not None and after_balance is not None and not cr_dr:
            cr_dr = "CR" if after_balance > before_balance else "DR"
        return cls.objects.create(
            actor=actor, target_user=target_user, action=action,
            amount=amount, cr_dr=cr_dr, wallet_type=wallet_type,
            before_balance=before_balance, after_balance=after_balance,
            casino_name=casino_name, description=description,
            reference_id=reference_id, meta=meta or {},
            ip_address=ip_address, user_agent=user_agent,
        )


# ─────────────────────────────────────────────────────────────────────────────
# PendingAdminCreation
# ─────────────────────────────────────────────────────────────────────────────

class PendingAdminCreation(models.Model):
    email        = models.EmailField(unique=True)
    name         = models.CharField(max_length=200, blank=True)
    password     = models.CharField(max_length=500)
    role         = models.CharField(max_length=50, default="admin")
    mobile       = models.CharField(max_length=20, blank=True)
    department   = models.CharField(max_length=100, blank=True)
    otp          = models.CharField(max_length=10)
    expires_at   = models.DateTimeField()
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at   = models.DateTimeField(auto_now_add=True)