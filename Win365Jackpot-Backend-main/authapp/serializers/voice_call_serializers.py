"""VOICE-CALL: read-only serializers for call state and history.

Every field is read-only on purpose. A call's status, participants and timings
are decided by voice_call_service alone — there is no endpoint anywhere that
lets a client write them, so exposing a writable serializer would only create
a way to get that wrong later.
"""
from rest_framework import serializers

from authapp.models.call_models import CallSession
from authapp.models.support_ticket_models import PARTICIPANT_AFFILIATE


class CallSessionSerializer(serializers.ModelSerializer):
    participant_type = serializers.CharField(source="ticket.participant_type", read_only=True)
    caller_name = serializers.SerializerMethodField()
    caller_uid = serializers.CharField(source="caller.user_uid", read_only=True)
    # The account behind the voice. An agent answering needs to know who is on
    # the line, and a display name is optional on these accounts — see
    # voice_call_service.call_payload, which carries the same three fields over
    # the socket so the card renders identically whichever path fed it.
    caller_email = serializers.EmailField(source="caller.email", read_only=True)
    caller_affiliate_id = serializers.SerializerMethodField()
    receiver_name = serializers.SerializerMethodField()
    has_recording = serializers.BooleanField(read_only=True)
    recording_url = serializers.SerializerMethodField()

    class Meta:
        model = CallSession
        fields = [
            "id", "ticket_id", "participant_type",
            "caller_id", "caller_name", "caller_uid", "caller_email",
            "caller_affiliate_id",
            "receiver_id", "receiver_name",
            "status", "end_reason",
            "started_at", "ring_expires_at", "connected_at", "ended_at",
            "duration_seconds",
            "has_recording", "recording_bytes", "recording_url",
        ]
        read_only_fields = fields

    def get_caller_name(self, obj):
        return (getattr(obj.caller, "name", "") or "").strip()

    def get_caller_affiliate_id(self, obj):
        """AFF-<uid> for affiliate calls only, mirroring the live-chat inbox so
        one person is referred to the same way in both places."""
        if obj.ticket.participant_type != PARTICIPANT_AFFILIATE:
            return None
        uid = getattr(obj.caller, "user_uid", None)
        return f"AFF-{uid}" if uid else None

    def get_receiver_name(self, obj):
        if not obj.receiver_id:
            return ""
        return (getattr(obj.receiver, "name", "") or "").strip()

    def get_recording_url(self, obj):
        """The *authorised endpoint* for the audio, never a storage URL.

        Same contract as chat attachments: possessing this path is not the
        same as being allowed to read it — the view re-checks entitlement on
        every fetch. Returning `recording.url` here would hand out a permanent
        public /media/ path locally, or a replayable presigned link on S3.
        """
        if not obj.recording:
            return None
        return f"/api/admin-panel/live-chat/calls/{obj.pk}/recording/"
