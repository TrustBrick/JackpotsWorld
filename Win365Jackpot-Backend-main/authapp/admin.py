from django.contrib import admin
from authapp.models.casino_models import Casino
from authapp.models.events_models import CasinoEvent, EventTicketRequest
from authapp.models.poker_models import (
    PokerTournament, PokerRegistration, PokerSource, PokerSyncLog, PokerEventChangeLog,
)
from authapp.models.promotion_models import Promotion
from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission
from authapp.models.affiliate_commission_models import (
    CommissionPlan, AffiliateCommissionAssignment, AffiliatePlayerCommissionStatus,
)
from authapp.models.wheel_models import (
    SignupWheelSettings, SignupWheelReward, SignupWheelSpin,
    BonusWheel, BonusWheelReward, BonusWheelAssignment, BonusWheelGrant, BonusWheelSpin,
)
from authapp.models.landing_models import Destination, DestinationMedia, PremiumPartner
from authapp.models.teenpatti_models import TeenPattiEvent, TeenPattiRegistration
from authapp.models.commission_rule_models import (
    CommissionRule, CommissionTier, CommissionCondition, CommissionLedgerEntry,
)

admin.site.register(Casino)
admin.site.register(CasinoEvent)
admin.site.register(EventTicketRequest)
admin.site.register(PokerTournament)
admin.site.register(PokerRegistration)
admin.site.register(PokerSource)
admin.site.register(PokerSyncLog)
admin.site.register(PokerEventChangeLog)
admin.site.register(Promotion)
admin.site.register(AffiliateProfile)
admin.site.register(ReferralCommission)
admin.site.register(CommissionPlan)
admin.site.register(AffiliateCommissionAssignment)
admin.site.register(AffiliatePlayerCommissionStatus)
admin.site.register(SignupWheelSettings)
admin.site.register(SignupWheelReward)
admin.site.register(SignupWheelSpin)
admin.site.register(BonusWheel)
admin.site.register(BonusWheelReward)
admin.site.register(BonusWheelAssignment)
admin.site.register(BonusWheelGrant)
admin.site.register(BonusWheelSpin)
admin.site.register(Destination)
admin.site.register(DestinationMedia)
admin.site.register(TeenPattiEvent)
admin.site.register(TeenPattiRegistration)
admin.site.register(CommissionRule)
admin.site.register(CommissionTier)
admin.site.register(CommissionCondition)
admin.site.register(CommissionLedgerEntry)
admin.site.register(PremiumPartner)
