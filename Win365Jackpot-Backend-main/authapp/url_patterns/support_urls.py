# authapp/url_patterns/support_urls.py
from django.urls import path
from authapp.views.support_views import (
    ResponsibleGamblingSettingsView,
    SupportTicketListCreateView,
    AdminSupportTicketListView,
    AdminSupportTicketUpdateView,
    SupportConfigView,       # MULTILINGUAL-CHAT
    SupportSettingsView,     # MULTILINGUAL-CHAT
)

# Public (authenticated user) — mounted at api/
public_urlpatterns = [
    path("user/responsible-gambling/", ResponsibleGamblingSettingsView.as_view()),
    path("support/tickets/", SupportTicketListCreateView.as_view()),
    path("support/config/", SupportConfigView.as_view()),  # MULTILINGUAL-CHAT
]

# Admin-managed — mounted at api/admin-panel/
admin_urlpatterns = [
    path("support/tickets/", AdminSupportTicketListView.as_view()),
    path("support/tickets/<int:pk>/", AdminSupportTicketUpdateView.as_view()),
    path("support-settings/", SupportSettingsView.as_view()),  # MULTILINGUAL-CHAT
]
