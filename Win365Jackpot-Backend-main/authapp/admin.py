from django.contrib import admin
from authapp.models.casino_models import Casino
from authapp.models.events_models import CasinoEvent, EventTicketRequest
from authapp.models.poker_models import PokerTournament, PokerRegistration
from authapp.models.promotion_models import Promotion
from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission

admin.site.register(Casino)
admin.site.register(CasinoEvent)
admin.site.register(EventTicketRequest)
admin.site.register(PokerTournament)
admin.site.register(PokerRegistration)
admin.site.register(Promotion)
admin.site.register(AffiliateProfile)
admin.site.register(ReferralCommission)