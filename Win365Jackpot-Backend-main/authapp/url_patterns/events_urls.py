# authapp/url_patterns/events_urls.py
from django.urls import path
from authapp.views.events_views import (
    EventListView,
    EventDetailView,
    EventTicketRequestView,
    AdminEventListCreateView,
    AdminEventDetailView,
)

# Public — mounted at api/events/
public_urlpatterns = [
    path("events/", EventListView.as_view()),
    path("events/<int:pk>/", EventDetailView.as_view()),
    path("events/<int:pk>/ticket/", EventTicketRequestView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/events/
admin_urlpatterns = [
    path("events/", AdminEventListCreateView.as_view()),
    path("events/<int:pk>/", AdminEventDetailView.as_view()),
]
