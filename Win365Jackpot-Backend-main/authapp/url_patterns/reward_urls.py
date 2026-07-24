"""
authapp/urls/reward_urls.py
Reward endpoints: list rewards, claim reward.
Bonus history/claim views don't exist yet in reward_views.py — add them
there first, then wire the routes below when ready.
"""
from django.urls import path

from ..views.reward_views import (
    RewardListView,
    ClaimRewardView,
)

urlpatterns = [
    path("rewards/",                RewardListView.as_view()),
    path("rewards/<int:pk>/claim/", ClaimRewardView.as_view()),
    # path("bonus/history/",          BonusHistoryView.as_view()),
    # path("bonus/claim/",            BonusClaimView.as_view()),
]