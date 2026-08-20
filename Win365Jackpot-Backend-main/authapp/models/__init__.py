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
from .two_factor_models import TwoFactorAuth, TwoFactorBackupCode

# AFFILIATE-WITHDRAWALS: new module — safe to delete this import block (and
# the module itself) to remove the feature.
from .affiliate_wallet_models import (
    AffiliateWalletAccount,
    AffiliateWalletTransaction,
    AffiliateWithdrawalMethodConfig,
    AffiliateWithdrawalRequest,
    AffiliateWithdrawalPaymentDetail,
    AffiliateWithdrawalStatusHistory,
    AffiliateWithdrawalSettings,
)

# WALLET-REQUESTS: new module — safe to delete this import block (and the
# module itself) to remove the feature.
from .wallet_request_models import (
    WalletRequestMethodConfig,
    DepositRequest,
    WithdrawalRequest,
    DepositRequestStatusHistory,
    WithdrawalRequestStatusHistory,
)

# VOICE-CALL: new module — safe to delete this import block (and the module
# itself) to remove the feature. See call_models.py's docstring.
from .call_models import CallSession, CallEvent

# ANALYTICS: new module — safe to delete this import block (and the module
# itself) to remove the feature. See analytics_models.py's docstring.
from .analytics_models import AnalyticsEvent, Campaign

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
    "TwoFactorAuth",
    "TwoFactorBackupCode",
    # AFFILIATE-WITHDRAWALS
    "AffiliateWalletAccount",
    "AffiliateWalletTransaction",
    "AffiliateWithdrawalMethodConfig",
    "AffiliateWithdrawalRequest",
    "AffiliateWithdrawalPaymentDetail",
    "AffiliateWithdrawalStatusHistory",
    "AffiliateWithdrawalSettings",
    # WALLET-REQUESTS
    "WalletRequestMethodConfig",
    "DepositRequest",
    "WithdrawalRequest",
    "DepositRequestStatusHistory",
    "WithdrawalRequestStatusHistory",
    # VOICE-CALL
    "CallSession",
    "CallEvent",
    # ANALYTICS
    "AnalyticsEvent",
    "Campaign",
]