# authapp/serializers/__init__.py

from .user_serializers import (
    RegisterSerializer,
    LoginSerializer,
    UserProfileSerializer,
    UpdateProfileSerializer,
    ChangePasswordSerializer,
    AdminProfileSerializer,
    ActivityLogSerializer,
)

from .wallet_serializers import (
    WalletAccountSerializer,
    WalletTransactionSerializer,
    WalletValidationSerializer,   # note: was WalletValidationLogSerializer in the file
    AdminWalletUpdateSerializer,
    BonusConfigSerializer,
)