# authapp/url_patterns/voice_call_urls.py
#
# VOICE-CALL: mounted from authapp/urls.py alongside live_chat_urls, under the
# same live-chat/ prefix the feature extends. Deleting the import block in
# urls.py plus this file removes every call endpoint without touching chat.
#
# Route order matters: the literal `calls/config/` and `calls/<call_id>/…`
# paths are registered before `<int:ticket_id>/calls/`, since Django resolves
# top-to-bottom and an int converter would otherwise never see them anyway —
# they are kept adjacent here so the grouping stays obvious.
from django.urls import path

from authapp.views.voice_call_views import (
    AdminCallAcceptView,
    AdminCallbackView,
    AdminCallConnectedView,
    AdminCallEndView,
    AdminCallFailedView,
    AdminCallHistoryView,
    AdminCallRecordingView,
    AdminCallDeleteView,
    AdminCallRejectView,
    AdminVoiceCallSettingsView,
    CallAcceptView,
    CallConnectedView,
    CallDetailView,
    CallEndView,
    CallFailedView,
    MyCallHistoryView,
    TicketCallListCreateView,
    VoiceCallConfigView,
)

# Customer-facing — mounted at api/
public_urlpatterns = [
    path("live-chat/calls/config/", VoiceCallConfigView.as_view()),
    path("live-chat/calls/", MyCallHistoryView.as_view()),
    path("live-chat/calls/<int:call_id>/", CallDetailView.as_view()),
    path("live-chat/calls/<int:call_id>/accept/", CallAcceptView.as_view()),
    path("live-chat/calls/<int:call_id>/connected/", CallConnectedView.as_view()),
    path("live-chat/calls/<int:call_id>/end/", CallEndView.as_view()),
    path("live-chat/calls/<int:call_id>/failed/", CallFailedView.as_view()),
    path("live-chat/<int:ticket_id>/calls/", TicketCallListCreateView.as_view()),
]

# Agent-facing — mounted at api/admin-panel/
admin_urlpatterns = [
    path("live-chat/calls/", AdminCallHistoryView.as_view()),
    path("live-chat/<int:ticket_id>/callback/", AdminCallbackView.as_view()),
    path("live-chat/calls/<int:call_id>/accept/", AdminCallAcceptView.as_view()),
    path("live-chat/calls/<int:call_id>/reject/", AdminCallRejectView.as_view()),
    path("live-chat/calls/<int:call_id>/connected/", AdminCallConnectedView.as_view()),
    path("live-chat/calls/<int:call_id>/end/", AdminCallEndView.as_view()),
    path("live-chat/calls/<int:call_id>/failed/", AdminCallFailedView.as_view()),
    # POST uploads the agent-side recording, GET plays it back. One route,
    # because both verbs act on the same object and share its authorization.
    path("live-chat/calls/<int:call_id>/recording/", AdminCallRecordingView.as_view()),
    # Erasing one call. DELETE only — the list view is the read path.
    path("live-chat/calls/<int:call_id>/", AdminCallDeleteView.as_view()),
    # The recording switch. Not under live-chat/: it is a deployment-wide
    # setting, not a property of one conversation.
    path("voice-call-settings/", AdminVoiceCallSettingsView.as_view()),
]
