# authapp/url_patterns/teenpatti_urls.py
from django.urls import path

from authapp.views.teenpatti_views import (
    TeenPattiListView,
    TeenPattiDetailView,
    TeenPattiFilterOptionsView,
    TeenPattiRegisterView,
    TeenPattiMyRegistrationsView,
    AdminTeenPattiStatsView,
    AdminTeenPattiListCreateView,
    AdminTeenPattiDetailView,
    AdminTeenPattiRegistrationListView,
    AdminTeenPattiRegistrationUpdateView,
)

# Public — mounted at api/teen-patti/
public_urlpatterns = [
    path("teen-patti/", TeenPattiListView.as_view()),
    # Declared before the <int:pk> route so "filters"/"my-registrations" are
    # never swallowed by the detail pattern.
    path("teen-patti/filters/", TeenPattiFilterOptionsView.as_view()),
    path("teen-patti/my-registrations/", TeenPattiMyRegistrationsView.as_view()),
    path("teen-patti/<int:pk>/", TeenPattiDetailView.as_view()),
    path("teen-patti/<int:pk>/register/", TeenPattiRegisterView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/teen-patti/
admin_urlpatterns = [
    path("teen-patti/stats/", AdminTeenPattiStatsView.as_view()),
    path("teen-patti/registrations/", AdminTeenPattiRegistrationListView.as_view()),
    path("teen-patti/registrations/<int:pk>/", AdminTeenPattiRegistrationUpdateView.as_view()),
    path("teen-patti/", AdminTeenPattiListCreateView.as_view()),
    path("teen-patti/<int:pk>/", AdminTeenPattiDetailView.as_view()),
]
