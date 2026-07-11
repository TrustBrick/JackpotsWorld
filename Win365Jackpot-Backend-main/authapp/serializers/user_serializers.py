# authapp/serializers/user_serializers.py
"""
Production serializers for auth system.
- RegisterSerializer: strict password validation, country + dial_code, referral
- LoginSerializer: email + password
- UserProfileSerializer: full profile read
- UpdateProfileSerializer: edit-locked profile fields
- ChangePasswordSerializer: old + new password
"""

import re
from datetime import timedelta

from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import serializers

from authapp.models import User, AdminProfile, ActivityLog

PROFILE_LOCK_DAYS = 90


def clean_full_phone(value):
    """
    Normalizes a phone number that already includes its dial code (e.g. the
    frontend sends "+919876543210") down to "+" plus digits only, validating
    a sane overall length. Shared by RegisterSerializer, UpdateProfileSerializer
    and VerifyOTPView so all three registration/edit paths agree.
    """
    if not value:
        return ""
    cleaned = re.sub(r"[^\d]", "", value)
    if len(cleaned) < 4 or len(cleaned) > 15:
        raise serializers.ValidationError("Enter a valid phone number.")
    return "+" + cleaned

# ─────────────────────────────────────────────────────────────────────────────
# Password validator (strict)
# ─────────────────────────────────────────────────────────────────────────────

def validate_strong_password(value):
    """
    Must be ≥8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special char.
    """
    errors = []
    if len(value) < 8:
        errors.append("at least 8 characters")
    if not re.search(r"[A-Z]", value):
        errors.append("one uppercase letter")
    if not re.search(r"[a-z]", value):
        errors.append("one lowercase letter")
    if not re.search(r"\d", value):
        errors.append("one number")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", value):
        errors.append("one special character (!@#$%^&* etc.)")
    if errors:
        raise serializers.ValidationError(
            "Password must contain " + ", ".join(errors) + "."
        )
    return value


# ─────────────────────────────────────────────────────────────────────────────
# RegisterSerializer
# ─────────────────────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.Serializer):
    name               = serializers.CharField(max_length=120)
    email              = serializers.EmailField()

    # ✅ MADE OPTIONAL (auto default)
    country            = serializers.CharField(max_length=2, required=False, default="IN")
    dial_code          = serializers.CharField(max_length=6, required=False, default="+91")

    phone              = serializers.CharField(max_length=15, required=False, allow_blank=True)

    password           = serializers.CharField(write_only=True)

    # ✅ MADE OPTIONAL (frontend not sending earlier)
    confirm_password   = serializers.CharField(write_only=True, required=False)

    referral_code_used = serializers.CharField(max_length=12, required=False, allow_blank=True)

    # ─────────────────────────────────────────────
    # EMAIL VALIDATION
    # ─────────────────────────────────────────────
    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    # ─────────────────────────────────────────────
    # PHONE VALIDATION
    # ─────────────────────────────────────────────
    def validate_phone(self, value):
        # Frontend sends full number like "+919876543210" (dial code already included)
        return clean_full_phone(value)

    def validate(self, attrs):
        confirm_password = attrs.get("confirm_password")
        if confirm_password and attrs["password"] != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        phone = attrs.get("phone", "")  # already "+919876543210" from validate_phone

        if phone:
            # Check uniqueness using the already-complete phone number
            if User.objects.filter(phone=phone).exists():
                raise serializers.ValidationError({
                    "phone": "This mobile number is already registered."
                })
            attrs["_full_phone"] = phone
        else:
            attrs["_full_phone"] = ""

        return attrs

    # ─────────────────────────────────────────────
    # PASSWORD VALIDATION
    # ─────────────────────────────────────────────
    def validate_password(self, value):
        return validate_strong_password(value)

    

    # ─────────────────────────────────────────────
    # CREATE USER
    # ─────────────────────────────────────────────
    def create(self, validated_data):
        validated_data.pop("confirm_password", None)
        referral_code_used = validated_data.pop("referral_code_used", "") or ""
        full_phone         = validated_data.pop("_full_phone", "")
        dial_code          = validated_data.pop("dial_code", "+91")
    
        user = User.objects.create_user(
            email              = validated_data["email"],
            password           = validated_data["password"],
            name               = validated_data.get("name", "").strip(),
            country            = validated_data.get("country", "IN").upper(),
            phone              = full_phone,   # already "+919876543210", no prepending
            dial_code          = dial_code,
            referral_code_used = referral_code_used,
        )
    
        if referral_code_used:
            try:
                referrer = User.objects.get(referral_code=referral_code_used)
                user.referred_by = referrer
                user.save(update_fields=["referred_by"])
                referrer.referral_count += 1
                referrer.save(update_fields=["referral_count"])
            except User.DoesNotExist:
                pass
            
        return user

        # ─────────────────────────────────────────
        # REFERRAL HANDLING
        # ─────────────────────────────────────────
        if referral_code_used:
            try:
                referrer = User.objects.get(referral_code=referral_code_used)
                user.referred_by = referrer
                user.save(update_fields=["referred_by"])

                referrer.referral_count += 1
                referrer.save(update_fields=["referral_count"])
            except User.DoesNotExist:
                pass

        return user
    
    


# ─────────────────────────────────────────────────────────────────────────────
# LoginSerializer
# ─────────────────────────────────────────────────────────────────────────────

class LoginSerializer(serializers.Serializer):
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        password = attrs.get("password", "")

        if not email or not password:
            raise serializers.ValidationError("Email and password required.")

        user = User.objects.filter(email=email).first()

        if not user or not user.check_password(password):
            raise serializers.ValidationError("Invalid email or password.")

        if not user.is_active:
            raise serializers.ValidationError("This account has been disabled.")

        attrs["user"] = user
        return attrs


# ─────────────────────────────────────────────────────────────────────────────
# UserProfileSerializer
# ─────────────────────────────────────────────────────────────────────────────

class UserProfileSerializer(serializers.ModelSerializer):
    vip_progress_pct     = serializers.IntegerField(read_only=True)
    vip_xp_needed        = serializers.IntegerField(read_only=True)
    profile_locked_until = serializers.DateTimeField(read_only=True)
    profile_last_updated = serializers.DateTimeField(read_only=True)
    can_edit_profile     = serializers.SerializerMethodField()
    days_until_unlock    = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            "id", "user_uid", "email", "name",
            "country", "dial_code", "phone",
            "date_of_birth", "avatar", "avatar_url", "preferred_language",
            "vip_level", "vip_xp", "vip_xp_needed", "vip_progress_pct",
            "wallet_balance", "bonus_balance",
            "total_deposited", "total_withdrawn", "total_won",
            "referral_code", "referral_code_used", "referral_count", "referral_earnings",
            "kyc_status", "is_verified",
            "date_joined", "last_login",
            "last_login_city", "last_login_region", "last_login_country_name",
            "profile_last_updated", "profile_locked_until",
            "can_edit_profile", "days_until_unlock",
        ]
        read_only_fields = (
            "id", "user_uid", "email",
            "vip_level", "vip_xp",
            "wallet_balance", "bonus_balance",
            "total_deposited", "total_withdrawn", "total_won",
            "referral_code", "referral_count", "referral_earnings",
            "kyc_status", "is_verified", "date_joined", "last_login",
            "last_login_city", "last_login_region", "last_login_country_name",
            "profile_last_updated", "profile_locked_until",
        )

    def get_can_edit_profile(self, obj):
        if not obj.profile_locked_until:
            return True
        return timezone.now() >= obj.profile_locked_until

    def get_days_until_unlock(self, obj):
        if not obj.profile_locked_until:
            return 0
        delta = obj.profile_locked_until - timezone.now()
        return max(delta.days, 0)


# ─────────────────────────────────────────────────────────────────────────────
# UpdateProfileSerializer
# ─────────────────────────────────────────────────────────────────────────────

class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ["name", "date_of_birth", "country", "dial_code", "phone", "avatar", "avatar_url", "preferred_language"]

    def validate_phone(self, value):
        if not value:
            return value
        cleaned = clean_full_phone(value)
        if User.objects.filter(phone=cleaned).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("This mobile number is already registered.")
        return cleaned

    def validate(self, attrs):
        user = self.instance
        changing_locked = "name" in attrs or "date_of_birth" in attrs
        if changing_locked and user.profile_locked_until:
            if timezone.now() < user.profile_locked_until:
                delta = user.profile_locked_until - timezone.now()
                raise serializers.ValidationError(
                    f"Name and date of birth cannot be changed for {delta.days} more days."
                )
        return attrs

    def update(self, instance, validated_data):
        changing_locked = "name" in validated_data or "date_of_birth" in validated_data
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if changing_locked:
            now = timezone.now()
            instance.profile_last_updated = now
            instance.profile_locked_until = now + timedelta(days=PROFILE_LOCK_DAYS)
        instance.save()
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# ChangePasswordSerializer
# ─────────────────────────────────────────────────────────────────────────────

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate_new_password(self, value):
        return validate_strong_password(value)

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


# ─────────────────────────────────────────────────────────────────────────────
# AdminProfileSerializer
# ─────────────────────────────────────────────────────────────────────────────

class AdminProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    name  = serializers.CharField(source="user.name",  read_only=True)

    class Meta:
        model  = AdminProfile
        fields = [
            "email", "name", "role", "mobile", "geo_location",
            "department", "notes",
            "can_edit_users", "can_manage_finance", "can_approve_kyc",
            "can_send_notifs", "can_manage_vip",
            "is_active", "last_login", "login_count",
        ]
        read_only_fields = ["last_login", "login_count"]


# ─────────────────────────────────────────────────────────────────────────────
# ActivityLogSerializer
# ─────────────────────────────────────────────────────────────────────────────

class ActivityLogSerializer(serializers.ModelSerializer):
    actor_email       = serializers.SerializerMethodField()
    actor_uid         = serializers.SerializerMethodField()
    target_user_email = serializers.SerializerMethodField()
    target_user_uid   = serializers.SerializerMethodField()
    action_display    = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = ActivityLog
        fields = [
            "id", "action", "action_display", "description", "created_at",
            "actor_email", "actor_uid",
            "target_user_email", "target_user_uid",
            "amount", "cr_dr", "wallet_type",
            "before_balance", "after_balance",
            "casino_name", "reference_id",
            "ip_address", "meta",
        ]

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else None

    def get_actor_uid(self, obj):
        return obj.actor.user_uid if obj.actor else None

    def get_target_user_email(self, obj):
        return obj.target_user.email if obj.target_user else None

    def get_target_user_uid(self, obj):
        return obj.target_user.user_uid if obj.target_user else None