"""VOICE-CALL: read-only serializers for call state and history.

Every field is read-only on purpose. A call's status, participants and timings
are decided by voice_call_service alone — there is no endpoint anywhere that
lets a client write them, so exposing a writable serializer would only create
a way to get that wrong later.
"""
from rest_framework import serializers

from authapp.models.call_models import CallSession


class CallSessionSerializer(serializers.ModelSerializer):
    participant_type = serializers.CharField(source="ticket.participant_type", read_only=True)
    caller_name = serializers.SerializerMethodField()
    caller_uid = serializers.CharField(source="caller.user_uid", read_only=True)
    receiver_name = serializers.SerializerMethodField()
    has_recording = serializers.BooleanField(read_only=True)
    recording_url = serializers.SerializerMethodField()

    class Meta:
        model = CallSession
        fields = [
            "id", "ticket_id", "participant_type",
            "caller_id", "caller_name", "caller_uid",
            "receiver_id", "receiver_name",
            "status", "end_reason",
            "started_at", "ring_expires_at", "connected_at", "ended_at",
            "duration_seconds",
            "has_recording", "recording_bytes", "recording_url",
        ]
        read_only_fields = fields

    def get_caller_name(self, obj):
        return (getattr(obj.caller, "name", "") or "").strip()

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
