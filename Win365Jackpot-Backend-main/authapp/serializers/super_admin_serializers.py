# authapp/serializers/super_admin_serializers.py
from decimal import Decimal
from rest_framework import serializers
from authapp.models.super_admin_models import AdminWallet, SuperAdminTransaction
from authapp.models.wallet_models import TXN_WALLET_MAP, TRANSACTION_TYPES

VALID_WALLET_TYPES = ["C", "NC", "O"]


class AdminWalletSerializer(serializers.ModelSerializer):
    updated_by_uid = serializers.CharField(
        source="updated_by.user_uid", default=None, read_only=True
    )

    class Meta:
        model  = AdminWallet
        fields = [
            "cash_balance", "non_cash_balance", "otp_balance",
            "updated_at", "updated_by_uid",
        ]
        read_only_fields = fields


class AdminWalletCreditSerializer(serializers.Serializer):
    wallet_type = serializers.ChoiceField(choices=VALID_WALLET_TYPES)
    amount      = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    note        = serializers.CharField(required=False, allow_blank=True, default="")


class AdminWalletDebitSerializer(serializers.Serializer):
    wallet_type = serializers.ChoiceField(choices=VALID_WALLET_TYPES)
    amount      = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    note        = serializers.CharField(required=False, allow_blank=True, default="")


class AdminTransferToUserSerializer(serializers.Serializer):
    user_id          = serializers.IntegerField()
    wallet_type      = serializers.ChoiceField(choices=VALID_WALLET_TYPES)
    transaction_type = serializers.ChoiceField(choices=[c[0] for c in TRANSACTION_TYPES])
    amount           = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    note             = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        txn_type    = data["transaction_type"]
        wallet_type = data["wallet_type"]
        expected_wallet = TXN_WALLET_MAP.get(txn_type)
        if expected_wallet and expected_wallet != wallet_type:
            raise serializers.ValidationError(
                {
                    "transaction_type": (
                        f"{txn_type} must be used with wallet {expected_wallet}, "
                        f"not {wallet_type}."
                    )
                }
            )
        return data


class SuperAdminTransactionSerializer(serializers.ModelSerializer):
    performed_by_uid = serializers.CharField(
        source="performed_by.user_uid", default=None, read_only=True
    )
    txn_type_display = serializers.CharField(
        source="get_txn_type_display", read_only=True
    )

    class Meta:
        model  = SuperAdminTransaction
        fields = [
            "id", "txn_type", "txn_type_display",
            "wallet_type", "amount",
            "admin_wallet_before", "admin_wallet_after",
            "performed_by_uid", "performed_by_email",
            "target_user_uid",
            "user_wallet_before", "user_wallet_after",
            "note", "reference", "created_at",
        ]
        read_only_fields = fields


class CreateAdminSerializer(serializers.Serializer):
    """SuperAdmin creates a new admin account with a manually set user_uid."""
    email    = serializers.EmailField(required=True)
    name     = serializers.CharField(max_length=120, required=True, allow_blank=False)
    password = serializers.CharField(write_only=True, min_length=8, required=True)
    user_uid = serializers.CharField(max_length=10, required=True)

    def validate_email(self, value):
        from authapp.models import User
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError("Email is required.")
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def validate_password(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Password is required.")
        return value

    def validate_user_uid(self, value):
        from authapp.models import User
        value = value.strip()
        if not value:
            raise serializers.ValidationError("user_uid is required.")
        if User.objects.filter(user_uid=value).exists():
            raise serializers.ValidationError("user_uid already taken.")
        return value

    def create(self, validated_data):
        from authapp.models import User
        password = validated_data.pop("password")
        user = User(
            email=validated_data["email"],
            name=validated_data["name"],
            user_uid=validated_data["user_uid"],
            is_staff=True,
            is_superuser=False,
            is_active=True,
        )
        user.set_password(password)
        user.save()
        return user