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
from .email_log_models import EmailLog

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

# SUPPORT-TICKET / LIVE-CHAT: imported here (ahead of call_models below) so
# the app registry always has SupportTicket registered before CallSession's
# `ticket` FK to it is evaluated. Every other module in the codebase reaches
# these two models via the direct `authapp.models.support_ticket_models`
# path, which is why this gap went unnoticed: SupportTicket only ends up in
# the registry today if some other imported module happens to pull it in
# first, so whether `manage.py check` (and Django model resolution in
# general) succeeds ends up depending on which modules import order puts
# ahead of call_models — as seen with `manage.py test
# authapp.tests_analytics` alone, which fails E300 here, versus adding any
# module that imports support_ticket_models, which makes it pass. Importing
# it explicitly, unconditionally, removes that order-dependence.
from .support_ticket_models import SupportTicket, ChatMessage

# VOICE-CALL: new module — safe to delete this import block (and the module
# itself) to remove the feature. See call_models.py's docstring.
from .call_models import (
    CallSession, CallEvent, VoiceCallSettings, SupportAgentPresence,
)

# SUPPORT-SCRIPT: the standard live-chat wording from the Call & Live Chat
# Script Manual. Imported here so the app registry sees the model at load
# time -- without this, makemigrations proposes deleting it.
from .support_script_models import SupportScript

# ANALYTICS: new module — safe to delete this import block (and the module
# itself) to remove the feature. See analytics_models.py's docstring.
from .analytics_models import AnalyticsEvent, Campaign, Visitor, VisitorSession

# FAQ: Back-Office-managed questions for the landing and affiliate pages.
from .faq_models import FAQ

# ANDHAR-BAHAR: the third game section. Imported here for the same reason
# SupportTicket is above -- the registry must know these models regardless of
# which other module happens to import them first.
from .andhar_bahar_models import (
    AndharBaharContent, AndharBaharHighlight, AndharBaharStep, AndharBaharEvent,
    AndharBaharRegistration,
)

# EXPERIENCES: the non-casino pillars of the public site (luxury travel,
# stays, dining, concierge) plus the enquiries they capture. One model with a
# `category`, not one per pillar -- see the module docstring.
from .experience_models import (
    Experience,
    ExperienceEnquiry,
    CATEGORY_CHOICES as EXPERIENCE_CATEGORY_CHOICES,
    CATEGORY_VALUES as EXPERIENCE_CATEGORY_VALUES,
    ENQUIRY_STATUS_CHOICES as EXPERIENCE_ENQUIRY_STATUS_CHOICES,
)

# WHATSAPP-CAPTURE: the lead behind any WhatsApp button press, captured on the
# near side of the wa.me handoff. Distinct from ExperienceEnquiry above, which
# asks for travel dates and party sizes a floating button has no business
# asking for.
from .whatsapp_enquiry_models import (
    WhatsAppEnquiry,
    STATUS_CHOICES as WHATSAPP_ENQUIRY_STATUS_CHOICES,
)

# SUPPORT-COMMUNICATION: departments, call transfer/hold records and per-player
# chat/call restrictions, layered on the live-chat + voice-call stack above.
# Imported after call_models because CallTransfer/CallHoldEvent point at
# CallSession.
from .support_communication_models import (
    SupportDepartment,
    CallTransfer,
    CallHoldEvent,
    PlayerCommunicationRestriction,
    PlayerCommunicationRestrictionLog,
)

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
    # SUPPORT-TICKET / LIVE-CHAT
    "SupportTicket",
    "ChatMessage",
    # VOICE-CALL
    "CallSession",
    "CallEvent",
    # ANALYTICS
    "AnalyticsEvent",
    "Campaign",
    "Visitor",
    "VisitorSession",
    # SUPPORT-SCRIPT
    "SupportScript",
    # FAQ
    "FAQ",
    # ANDHAR-BAHAR
    "AndharBaharContent",
    "AndharBaharHighlight",
    "AndharBaharStep",
    "AndharBaharEvent",
    "AndharBaharRegistration",
    # EXPERIENCES
    "Experience",
    "ExperienceEnquiry",
    # WHATSAPP-CAPTURE
    "WhatsAppEnquiry",
    "WHATSAPP_ENQUIRY_STATUS_CHOICES",
    # SUPPORT-COMMUNICATION
    "SupportDepartment",
    "CallTransfer",
    "CallHoldEvent",
    "PlayerCommunicationRestriction",
    "PlayerCommunicationRestrictionLog",
]