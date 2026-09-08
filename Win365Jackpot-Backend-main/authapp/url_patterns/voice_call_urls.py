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

from authapp.views.call_control_views import (
    AdminCallControlConfigView,
    AdminCallHoldView,
    AdminCallResumeView,
    AdminCallTransferListView,
    AdminCallTransferView,
    AdminLiveSupportSettingsView,
    AdminPlayerCommunicationHistoryView,
    AdminPlayerCommunicationView,
    AdminSupportDepartmentDetailView,
    AdminSupportDepartmentListCreateView,
    AdminTransferAcceptView,
    AdminTransferCancelView,
    AdminTransferDeclineView,
    AdminTransferTargetsView,
    MyCommunicationStatusView,
)
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
    # What the widget needs before offering chat or a call: whether either is
    # open for THIS player, and the player-safe message if not. Read-only, and
    # the real gate is server-side in live_chat_service / voice_call_service.
    path("live-chat/communication-status/", MyCommunicationStatusView.as_view()),
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

    # ── Hold / forwarding ──────────────────────────────────────────────────
    # Declared before the <int:call_id>/ DELETE route above would matter --
    # these all carry a trailing verb segment, so there is no ambiguity, but
    # they are grouped here rather than interleaved so the call-control
    # surface reads as one block.
    path("live-chat/calls/<int:call_id>/hold/", AdminCallHoldView.as_view()),
    path("live-chat/calls/<int:call_id>/resume/", AdminCallResumeView.as_view()),
    path("live-chat/calls/<int:call_id>/transfer/", AdminCallTransferView.as_view()),
    path("live-chat/calls/<int:call_id>/transfers/", AdminCallTransferListView.as_view()),
    # "transfer-targets" is a literal and must be declared before any
    # <int:transfer_id> pattern could shadow it -- it cannot, since that
    # converter only matches digits, but the ordering is kept explicit.
    path("live-chat/transfer-targets/", AdminTransferTargetsView.as_view()),
    path("live-chat/call-control-config/", AdminCallControlConfigView.as_view()),
    path("live-chat/transfers/<int:transfer_id>/accept/", AdminTransferAcceptView.as_view()),
    path("live-chat/transfers/<int:transfer_id>/decline/", AdminTransferDeclineView.as_view()),
    path("live-chat/transfers/<int:transfer_id>/cancel/", AdminTransferCancelView.as_view()),

    # ── Departments and desk settings ──────────────────────────────────────
    path("support-departments/", AdminSupportDepartmentListCreateView.as_view()),
    path("support-departments/<int:pk>/", AdminSupportDepartmentDetailView.as_view()),
    # The whole desk configuration. voice-call-settings/ above still serves
    # the recording switch on its own for the client that already reads it.
    path("live-support-settings/", AdminLiveSupportSettingsView.as_view()),

    # ── Per-player chat/call access ────────────────────────────────────────
    path("players/<int:user_id>/communication/", AdminPlayerCommunicationView.as_view()),
    path("players/<int:user_id>/communication/history/", AdminPlayerCommunicationHistoryView.as_view()),
]
