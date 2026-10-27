# authapp/url_patterns/visitor_feedback_urls.py
#
# VISITOR-FEEDBACK: the public "Feedback" form plus the Back Office list behind
# it. Mounted from authapp/urls.py (public at api/, admin at api/admin-panel/).
from django.urls import path

from authapp.views.visitor_feedback_views import (
    AdminPublishFeedbackView,
    AdminVisitorFeedbackDetailView,
    AdminVisitorFeedbackListView,
    AdminVisitorFeedbackSummaryView,
    FeedbackPromptEventView,
    VisitorFeedbackCreateView,
)

# Public (any visitor, throttled) — mounted at api/
public_urlpatterns = [
    path("feedback/", VisitorFeedbackCreateView.as_view(), name="visitor-feedback-create"),
    path("feedback/prompt-event/", FeedbackPromptEventView.as_view(),
         name="visitor-feedback-prompt-event"),
]

# Admin-only — mounted at api/admin-panel/
admin_urlpatterns = [
    path("visitor-feedback/", AdminVisitorFeedbackListView.as_view(),
         name="admin-visitor-feedback-list"),
    path("visitor-feedback/summary/", AdminVisitorFeedbackSummaryView.as_view(),
         name="admin-visitor-feedback-summary"),
    path("visitor-feedback/<int:pk>/", AdminVisitorFeedbackDetailView.as_view(),
         name="admin-visitor-feedback-detail"),
    path("visitor-feedback/<int:pk>/publish/", AdminPublishFeedbackView.as_view(),
         name="admin-visitor-feedback-publish"),
]
