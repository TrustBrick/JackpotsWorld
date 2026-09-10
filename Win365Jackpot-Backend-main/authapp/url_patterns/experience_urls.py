# authapp/url_patterns/experience_urls.py
#
# EXPERIENCES: the public site's non-casino pillars (luxury travel, stays,
# dining & entertainment, VIP concierge) plus the enquiries they capture.
# Mounted from authapp/urls.py (public at api/, admin at api/admin-panel/).
# Safe to delete this file + its import/include block in urls.py to remove the
# feature's routes.
from django.urls import path

from authapp.views.experience_views import (
    AdminExperienceDetailView,
    AdminExperienceEnquiryDetailView,
    AdminExperienceEnquiryListView,
    AdminExperienceListCreateView,
    ExperienceEnquiryCreateView,
    ExperienceListView,
)

public_urlpatterns = [
    path("experiences/", ExperienceListView.as_view(), name="experience-list"),
    path(
        "experiences/enquiries/",
        ExperienceEnquiryCreateView.as_view(),
        name="experience-enquiry-create",
    ),
]

admin_urlpatterns = [
    path(
        "experiences/",
        AdminExperienceListCreateView.as_view(), name="admin-experience-list",
    ),
    path(
        "experiences/<int:pk>/",
        AdminExperienceDetailView.as_view(), name="admin-experience-detail",
    ),
    path(
        "experience-enquiries/",
        AdminExperienceEnquiryListView.as_view(), name="admin-experience-enquiry-list",
    ),
    path(
        "experience-enquiries/<int:pk>/",
        AdminExperienceEnquiryDetailView.as_view(), name="admin-experience-enquiry-detail",
    ),
]
