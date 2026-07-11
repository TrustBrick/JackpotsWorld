# authapp/models/__init__.py
from .kyc_model import KYCSubmission

from .user_model import (
    User,
    UserManager,
    AdminProfile,
    OTPRecord,
    ActivityLog,
    PendingAdminCreation,
)

from .user_model import User
from .reward_model import Reward
from .notification_model import Notification

from .wallet_models import (
    WalletAccount,
    WalletTransaction,
    WalletValidationLog,
    BonusConfig,
    WALLET_TYPES,
    TRANSACTION_TYPES,
    TXN_WALLET_MAP,
    VALIDATED_TXN_TYPES,
    NON_REDEEMABLE_WALLETS,
    NON_TRANSFERRABLE_WALLETS,
)

from .casino_wallet_models import CasinoWalletAccount, CasinoWalletTransaction
from .spin_models import SpinConfig, SpinSettings, SpinGlobalCounter, SpinHistory

__all__ = [
    # User models
    "User",
    "UserManager",
    "AdminProfile",
    "OTPRecord",
    "ActivityLog",
    "PendingAdminCreation",
    # Wallet models
    "WalletAccount",
    "WalletTransaction",
    "WalletValidationLog",
    "BonusConfig",
    # Constants
    "WALLET_TYPES",
    "TRANSACTION_TYPES",
    "TXN_WALLET_MAP",
    "VALIDATED_TXN_TYPES",
    "NON_REDEEMABLE_WALLETS",
    "NON_TRANSFERRABLE_WALLETS", 
    "CasinoWalletAccount",
    "CasinoWalletTransaction",
    "SpinConfig",
    "SpinSettings",
    "SpinGlobalCounter",
    "SpinHistory",
]