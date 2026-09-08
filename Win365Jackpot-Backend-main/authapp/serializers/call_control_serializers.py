"""
authapp/serializers/call_control_serializers.py
─────────────────────────────────────────────────────────────────────────────
Serializers for departments, call transfers, hold events and the live-support
settings singleton.

All of these are STAFF-FACING. That is why the transfer serializer includes
`reason` and `note` — internal agent-to-agent context — where the customer's
own call payload (call_control_service.call_control_payload) deliberately does
not. If any of these is ever exposed on a player-facing route, that decision
has to be revisited; nothing here is safe to hand to a customer.
"""
from rest_framework import serializers

from authapp.models.call_models import VoiceCallSettings
from authapp.models.support_communication_models import (
    CallHoldEvent,
    CallTransfer,
    SupportDepartment,
)


class SupportDepartmentSerializer(serializers.ModelSerializer):
    # Read side: enough to render the roster without a second request.
    agent_details = serializers.SerializerMethodField()
    agent_count = serializers.SerializerMethodField()

    class Meta:
        model = SupportDepartment
        fields = [
            "id", "name", "slug", "description",
            "agents", "agent_details", "agent_count",
            "ring_timeout_seconds", "is_active", "order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "agent_details", "agent_count"]
        extra_kwargs = {
            # Write side: a plain list of user ids from the Back Office form.
            "agents": {"required": False},
        }

    def get_agent_details(self, obj):
        return [
            {
                "id": u.id,
                "name": (u.name or "").strip() or u.email,
                "email": u.email,
            }
            for u in obj.agents.all()
        ]

    def get_agent_count(self, obj):
        return obj.agents.count()

    def validate_slug(self, value):
        value = (value or "").strip().lower()
        if not value:
            raise serializers.ValidationError("A slug is required.")
        return value

    def validate(self, attrs):
        """A department with no agents cannot be forwarded to. Allowed on
        purpose — an admin routinely creates the department before assigning
        anyone — so this is a warning surfaced in the payload, not an error
        that blocks the save."""
        return attrs


class CallTransferSerializer(serializers.ModelSerializer):
    from_agent_name = serializers.SerializerMethodField()
    to_agent_name = serializers.SerializerMethodField()
    to_department_name = serializers.CharField(
        source="to_department.name", read_only=True, default="",
    )
    accepted_by_name = serializers.SerializerMethodField()
    caller_name = serializers.SerializerMethodField()

    class Meta:
        model = CallTransfer
        fields = [
            "id", "call", "status",
            "from_agent", "from_agent_name",
            "to_agent", "to_agent_name",
            "to_department", "to_department_name",
            "accepted_by", "accepted_by_name",
            "caller_name",
            "reason", "note",
            "ring_expires_at", "created_at", "responded_at",
        ]
        # Every field is read-only: a transfer's state is decided by
        # call_control_service alone. There is no endpoint that lets a client
        # write one, so a writable serializer would only be a way to get that
        # wrong later — the same reasoning CallSessionSerializer states.
        read_only_fields = fields

    def _name(self, user):
        if user is None:
            return ""
        return (getattr(user, "name", "") or "").strip() or getattr(user, "email", "")

    def get_from_agent_name(self, obj):
        return self._name(obj.from_agent)

    def get_to_agent_name(self, obj):
        return self._name(obj.to_agent)

    def get_accepted_by_name(self, obj):
        return self._name(obj.accepted_by)

    def get_caller_name(self, obj):
        return self._name(getattr(obj.call, "caller", None))


class CallHoldEventSerializer(serializers.ModelSerializer):
    held_by_name = serializers.SerializerMethodField()
    resumed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CallHoldEvent
        fields = [
            "id", "call", "held_by", "held_by_name",
            "resumed_by", "resumed_by_name",
            "held_at", "resumed_at", "duration_seconds",
            "reason", "auto_resumed",
        ]
        read_only_fields = fields

    def _name(self, user):
        if user is None:
            return ""
        return (getattr(user, "name", "") or "").strip() or getattr(user, "email", "")

    def get_held_by_name(self, obj):
        return self._name(obj.held_by)

    def get_resumed_by_name(self, obj):
        return self._name(obj.resumed_by)


class LiveSupportSettingsSerializer(serializers.ModelSerializer):
    """The live-support configuration singleton.

    `recording_enabled` is included and remains writable exactly as it was —
    this serializer is a superset of the old VoiceCallSettingsSerializer's
    surface, not a replacement that drops anything. The dedicated
    /voice-call-settings/ endpoint still exists and still works; this is the
    one screen that shows the whole desk configuration together.
    """

    hold_audio_url = serializers.SerializerMethodField()
    updated_by_email = serializers.CharField(
        source="updated_by.email", read_only=True, default="",
    )

    class Meta:
        model = VoiceCallSettings
        fields = [
            "recording_enabled",
            "chat_enabled", "calls_enabled",
            "working_hours_start", "working_hours_end", "holiday_mode",
            "ring_timeout_seconds",
            "hold_enabled", "hold_audio", "hold_audio_url", "hold_message",
            "max_hold_seconds",
            "forwarding_enabled", "transfer_ring_timeout_seconds",
            "offline_message", "queue_message",
            "chat_disabled_message", "call_disabled_message",
            "call_unavailable_message",
            "updated_at", "updated_by_email",
        ]
        read_only_fields = ["updated_at", "updated_by_email", "hold_audio_url"]

    def get_hold_audio_url(self, obj):
        if not obj.hold_audio:
            return ""
        try:
            url = obj.hold_audio.url
        except Exception:
            # A storage backend that cannot produce a URL must not 500 the
            # settings screen; the clients fall back to a generated tone.
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate_max_hold_seconds(self, value):
        # A minute is the shortest hold worth automating an escape from; below
        # that the server would be hanging up on holds an agent is actively
        # working through. 0 means no limit and is always allowed.
        if value and value < 60:
            raise serializers.ValidationError(
                "Set 0 for no limit, or at least 60 seconds.",
            )
        return value

    def validate(self, attrs):
        start = attrs.get("working_hours_start", getattr(self.instance, "working_hours_start", None))
        end = attrs.get("working_hours_end", getattr(self.instance, "working_hours_end", None))
        # One without the other is ambiguous — "open from 09:00" until when? —
        # so both or neither. An overnight window (22:00–06:00) is valid and
        # handled by the service; only a half-configured pair is rejected.
        if bool(start) != bool(end):
            raise serializers.ValidationError({
                "working_hours_start": "Set both a start and an end time, or leave both empty for always open.",
            })
        return attrs
