# authapp/url_patterns/whatsapp_enquiry_urls.py
#
# WHATSAPP-CAPTURE: the pre-chat lead form that runs before every wa.me
# handoff, plus the Back Office list behind it. Mounted from authapp/urls.py
# (public at api/, admin at api/admin-panel/).
#
# Safe to delete this file plus its import/include block in urls.py to remove
# the feature's routes; the model and its rows are untouched by that.
from django.urls import path

from authapp.views.whatsapp_enquiry_views import (
    AdminWhatsAppEnquiryDetailView,
    AdminWhatsAppEnquiryListView,
    WhatsAppEnquiryClickView,
    WhatsAppEnquiryCreateView,
)

# Public (any visitor, throttled) — mounted at api/
public_urlpatterns = [
    path("whatsapp-enquiries/", WhatsAppEnquiryCreateView.as_view(),
         name="whatsapp-enquiry-create"),
    # WHATSAPP-LEADS: the press itself, recorded whether or not the visitor
    # ever fills the form. Declared before nothing in particular — the paths
    # do not overlap — but kept next to its sibling so the two halves of one
    # flow are read together.
    path("whatsapp-enquiries/click/", WhatsAppEnquiryClickView.as_view(),
         name="whatsapp-enquiry-click"),
]

# Admin-only — mounted at api/admin-panel/
admin_urlpatterns = [
    path("whatsapp-enquiries/", AdminWhatsAppEnquiryListView.as_view(),
         name="admin-whatsapp-enquiry-list"),
    path("whatsapp-enquiries/<int:pk>/", AdminWhatsAppEnquiryDetailView.as_view(),
         name="admin-whatsapp-enquiry-detail"),
]
