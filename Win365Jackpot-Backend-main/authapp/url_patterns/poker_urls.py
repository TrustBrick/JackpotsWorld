# authapp/url_patterns/poker_urls.py
from django.urls import path
from authapp.views.poker_views import (
    PokerListView,
    PokerDetailView,
    PokerFilterOptionsView,
    PokerRegisterView,
    AdminPokerListCreateView,
    AdminPokerDetailView,
    AdminPokerReviewView,
    AdminPokerChangeLogView,
    AdminPokerChangeHistoryView,
    AdminPokerRegistrationListView,
    AdminPokerRegistrationUpdateView,
    AdminPokerSourceListCreateView,
    AdminPokerSourceDetailView,
    AdminPokerSourceSyncView,
    AdminPokerSyncAllView,
    AdminPokerSyncLogListView,
    AdminPokerStatsView,
)

# Public — mounted at api/poker/
public_urlpatterns = [
    path("poker/", PokerListView.as_view()),
    # Before <int:pk> so "filters" isn't captured by the detail route.
    path("poker/filters/", PokerFilterOptionsView.as_view()),
    path("poker/<int:pk>/", PokerDetailView.as_view()),
    path("poker/<int:pk>/register/", PokerRegisterView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/poker/
# Every literal sub-path is declared before the <int:pk> detail route.
admin_urlpatterns = [
    path("poker/stats/", AdminPokerStatsView.as_view()),
    path("poker/history/", AdminPokerChangeHistoryView.as_view()),
    path("poker/registrations/", AdminPokerRegistrationListView.as_view()),
    path("poker/registrations/<int:pk>/", AdminPokerRegistrationUpdateView.as_view()),

    path("poker/sources/sync-all/", AdminPokerSyncAllView.as_view()),
    path("poker/sources/", AdminPokerSourceListCreateView.as_view()),
    path("poker/sources/<int:pk>/", AdminPokerSourceDetailView.as_view()),
    path("poker/sources/<int:pk>/sync/", AdminPokerSourceSyncView.as_view()),
    path("poker/sync-logs/", AdminPokerSyncLogListView.as_view()),

    path("poker/", AdminPokerListCreateView.as_view()),
    path("poker/<int:pk>/", AdminPokerDetailView.as_view()),
    path("poker/<int:pk>/review/", AdminPokerReviewView.as_view()),
    path("poker/<int:pk>/history/", AdminPokerChangeLogView.as_view()),
]
