"""
authapp/serializers/andhar_bahar_serializers.py
─────────────────────────────────────────────────────────────────────────────
Public/admin split, same as the Teen Patti and Poker serializers: the public
serializer exposes what a visitor needs and nothing else, the admin one is the
full Back Office CRUD surface.

The public content endpoint returns the page in ONE payload — settings,
highlights, steps, media and events together — rather than five requests. That
is a deliberate difference from the landing page, which is assembled from many
independent sections that legitimately load at different times; this is one
page whose parts are meaningless apart, and five round trips would show it
building itself in stages on a slow connection.
"""
from rest_framework import serializers

from authapp.models.andhar_bahar_models import (
    PUBLIC_EVENT_STATUSES,
    AndharBaharContent,
    AndharBaharEvent,
    AndharBaharHighlight,
    AndharBaharRegistration,
    AndharBaharStep,
)


class AndharBaharHighlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = AndharBaharHighlight
        fields = [
            "id", "icon_name", "color", "title", "description",
            "is_active", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AndharBaharStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = AndharBaharStep
        fields = [
            "id", "title", "description", "is_active", "order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AndharBaharContentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AndharBaharContent
        exclude = ["updated_by"]
        read_only_fields = ["id", "updated_at"]


class AndharBaharEventPublicSerializer(serializers.ModelSerializer):
    casino_name = serializers.CharField(source="casino.name", read_only=True, default="")
    casino_location = serializers.CharField(source="casino.location", read_only=True, default="")
    # Whether the requesting member has already registered — lets the card
    # render "Registered" instead of "Register" without a second round trip.
    # Always false for an anonymous visitor. Same contract, and the same
    # prefetched-map trick, TeenPattiEventPublicSerializer uses.
    is_registered = serializers.SerializerMethodField()
    can_register = serializers.SerializerMethodField()
    # Derived from the dates on every read — see the model property. Sent
    # alongside `status`, never in place of it, so nothing that reads the
    # stored value changes behaviour.
    computed_status = serializers.CharField(read_only=True)

    class Meta:
        model = AndharBaharEvent
        fields = [
            "id", "name", "short_description", "description",
            "country", "city", "casino", "casino_name", "casino_location", "venue",
            "start_date", "end_date", "start_time", "end_time",
            "min_buy_in", "currency", "event_type", "image",
            "status", "computed_status", "is_featured", "order",
            "is_registered", "can_register",
        ]
        read_only_fields = fields

    def _my_ids(self):
        """The registered-event ids the view prefetched, so rendering a page of
        events costs one extra query in total rather than one per card."""
        return self.context.get("my_registration_event_ids") or set()

    def get_is_registered(self, obj):
        return obj.id in self._my_ids()

    def get_can_register(self, obj):
        """Mirrors the server-side gate in AndharBaharRegisterView so the
        button state matches what the API would actually do. Advisory only —
        the view re-checks."""
        return bool(
            obj.is_active
            and obj.status in PUBLIC_EVENT_STATUSES
            and obj.computed_status != "completed"
            and obj.id not in self._my_ids()
        )


class AndharBaharEventAdminSerializer(serializers.ModelSerializer):
    casino_name = serializers.CharField(source="casino.name", read_only=True, default="")
    computed_status = serializers.CharField(read_only=True)
    # Declared explicitly for the same reason the Teen Patti and Casino event
    # serializers do it: DRF's multipart parsing treats an omitted boolean as
    # False, which would otherwise silently override the model's default=True
    # on every create made from the Back Office form.
    is_active = serializers.BooleanField(required=False, default=True)
    is_featured = serializers.BooleanField(required=False, default=False)

    class Meta:
        model = AndharBaharEvent
        fields = [
            "id", "name", "short_description", "description",
            "country", "city", "casino", "casino_name", "venue",
            "start_date", "end_date", "start_time", "end_time",
            "min_buy_in", "currency", "event_type", "image",
            "status", "computed_status", "is_featured", "is_active", "order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "computed_status", "casino_name"]

    def validate(self, attrs):
        """An end date before the start date would make derive_status()
        nonsense — the event would be 'completed' before it began. Caught here
        so the Back Office form shows the error rather than saving a row whose
        computed status is permanently wrong."""
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "End date cannot be before the start date."},
            )
        return attrs


class AndharBaharRegistrationSerializer(serializers.ModelSerializer):
    """What a member sees about their own registration."""

    event_name = serializers.CharField(source="event.name", read_only=True)
    event_country = serializers.CharField(source="event.country", read_only=True)
    event_start_date = serializers.DateField(source="event.start_date", read_only=True)
    casino_name = serializers.CharField(source="event.casino.name", read_only=True, default="")

    class Meta:
        model = AndharBaharRegistration
        fields = [
            "id", "event", "event_name", "event_country", "event_start_date",
            "casino_name", "status", "created_at",
        ]
        # `admin_note` is deliberately absent: it is staff-only context about
        # this member, and this serializer is what the member themselves reads.
        read_only_fields = fields


class AndharBaharRegistrationAdminSerializer(serializers.ModelSerializer):
    """The Back Office view of a registration — who, for what, and the host's
    own notes."""

    event_name = serializers.CharField(source="event.name", read_only=True)
    event_country = serializers.CharField(source="event.country", read_only=True)
    event_start_date = serializers.DateField(source="event.start_date", read_only=True)
    casino_name = serializers.CharField(source="event.casino.name", read_only=True, default="")
    user_name = serializers.CharField(source="user.name", read_only=True, default="")
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_uid = serializers.CharField(source="user.user_uid", read_only=True, default="")
    user_country = serializers.CharField(source="user.country", read_only=True, default="")

    class Meta:
        model = AndharBaharRegistration
        fields = [
            "id", "event", "event_name", "event_country", "event_start_date", "casino_name",
            "user", "user_name", "user_email", "user_uid", "user_country",
            "status", "admin_note", "created_at", "updated_at",
        ]
        # Only the two an admin actually works with are writable; the member
        # and the event they registered for are facts, not fields to edit.
        read_only_fields = [
            f for f in fields if f not in ("status", "admin_note")
        ]
