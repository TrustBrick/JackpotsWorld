# authapp/url_patterns/email_log_urls.py
#
# EMAIL-LOGS: Back Office visibility of every outgoing email. Admin-only —
# there is no public half to this feature, so this file exposes admin routes
# and nothing else. Mounted from authapp/urls.py at api/admin-panel/.
from django.urls import path

from authapp.views.email_log_views import (
    AdminEmailLogDetailView,
    AdminEmailLogFilterOptionsView,
    AdminEmailLogListView,
    AdminEmailLogRetryView,
    AdminEmailLogStatsView,
)

admin_urlpatterns = [
    # Both fixed segments come before the <int:pk> route so neither is
    # swallowed by it.
    path("email-logs/stats/", AdminEmailLogStatsView.as_view(), name="admin-email-log-stats"),
    path("email-logs/filters/", AdminEmailLogFilterOptionsView.as_view(), name="admin-email-log-filters"),
    path("email-logs/<int:pk>/retry/", AdminEmailLogRetryView.as_view(), name="admin-email-log-retry"),
    path("email-logs/<int:pk>/", AdminEmailLogDetailView.as_view(), name="admin-email-log-detail"),
    path("email-logs/", AdminEmailLogListView.as_view(), name="admin-email-log-list"),
]
