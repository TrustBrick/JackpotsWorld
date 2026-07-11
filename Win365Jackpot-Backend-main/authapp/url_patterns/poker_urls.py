# authapp/url_patterns/poker_urls.py
from django.urls import path
from authapp.views.poker_views import (
    PokerListView,
    PokerDetailView,
    PokerRegisterView,
    AdminPokerListCreateView,
    AdminPokerDetailView,
    AdminPokerRegistrationListView,
    AdminPokerRegistrationUpdateView,
)

# Public — mounted at api/poker/
public_urlpatterns = [
    path("poker/", PokerListView.as_view()),
    path("poker/<int:pk>/", PokerDetailView.as_view()),
    path("poker/<int:pk>/register/", PokerRegisterView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/poker/
admin_urlpatterns = [
    path("poker/", AdminPokerListCreateView.as_view()),
    path("poker/<int:pk>/", AdminPokerDetailView.as_view()),
    path("poker/registrations/", AdminPokerRegistrationListView.as_view()),
    path("poker/registrations/<int:pk>/", AdminPokerRegistrationUpdateView.as_view()),
]
