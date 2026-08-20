# authapp/url_patterns/commission_rule_urls.py
from django.urls import path

from authapp.views.commission_rule_views import (
    AdminCommissionDashboardView,
    AdminCommissionRuleListCreateView,
    AdminCommissionRuleDetailView,
    AdminCommissionRuleDuplicateView,
    AdminCommissionRuleResolveView,
    AdminCommissionTierListCreateView,
    AdminCommissionTierDetailView,
    AdminCommissionConditionListCreateView,
    AdminCommissionConditionDetailView,
    AdminManualCommissionCreateView,
    AdminCommissionLedgerListView,
    AdminCommissionLedgerUpdateView,
    AdminCommissionLedgerTransitionView,
    AffiliateCommissionSummaryView,
    AffiliateCommissionLedgerView,
)

# Affiliate-facing — mounted at api/affiliate/commissions/
public_urlpatterns = [
    path("affiliate/commissions/summary/", AffiliateCommissionSummaryView.as_view()),
    path("affiliate/commissions/ledger/", AffiliateCommissionLedgerView.as_view()),
]

# Back Office — mounted at api/admin-panel/commissions/
admin_urlpatterns = [
    path("commissions/dashboard/", AdminCommissionDashboardView.as_view()),

    # "resolve" and "duplicate" are declared before the <int:pk> detail route
    # so they are never captured by it.
    path("commissions/rules/resolve/", AdminCommissionRuleResolveView.as_view()),
    path("commissions/rules/<int:pk>/duplicate/", AdminCommissionRuleDuplicateView.as_view()),
    path("commissions/rules/", AdminCommissionRuleListCreateView.as_view()),
    path("commissions/rules/<int:pk>/", AdminCommissionRuleDetailView.as_view()),

    path("commissions/tiers/", AdminCommissionTierListCreateView.as_view()),
    path("commissions/tiers/<int:pk>/", AdminCommissionTierDetailView.as_view()),

    path("commissions/conditions/", AdminCommissionConditionListCreateView.as_view()),
    path("commissions/conditions/<int:pk>/", AdminCommissionConditionDetailView.as_view()),

    # Manual / Bonus commission — declared before the ledger routes it feeds.
    path("commissions/manual/", AdminManualCommissionCreateView.as_view()),

    path("commissions/ledger/", AdminCommissionLedgerListView.as_view()),
    path("commissions/ledger/<int:pk>/transition/", AdminCommissionLedgerTransitionView.as_view()),
    path("commissions/ledger/<int:pk>/", AdminCommissionLedgerUpdateView.as_view()),
]
