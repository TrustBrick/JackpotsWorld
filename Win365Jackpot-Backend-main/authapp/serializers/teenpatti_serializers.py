"""
authapp/serializers/teenpatti_serializers.py
─────────────────────────────────────────────────────────────────────────────
Two event serializers rather than one: the public one exposes only what a
visitor needs to decide whether to register (and never the admin bookkeeping
fields), while the admin one is the full CRUD surface driven by the Back
Office form. Same public/admin split the Poker and Events serializers already
use.
"""
from rest_framework import serializers

from authapp.models.teenpatti_models import TeenPattiEvent, TeenPattiRegistration


class TeenPattiEventPublicSerializer(serializers.ModelSerializer):
    casino_name = serializers.CharField(source="casino.name", read_only=True, default="")
    seats_remaining = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    # Whether the requesting user already holds a seat — lets the card render
    # "Registered" instead of "Register Now" without a second round trip.
    # Always false for an anonymous visitor.
    is_registered = serializers.SerializerMethodField()
    my_confirmation_id = serializers.SerializerMethodField()
    can_register = serializers.SerializerMethodField()
    # Derived from the dates on every read — see the model property. Sent
    # alongside `status`, never in place of it, so nothing that already reads
    # the stored value changes behaviour.
    computed_status = serializers.CharField(read_only=True)

    class Meta:
        model = TeenPattiEvent
        fields = [
            "id", "name", "short_description", "description",
            "country", "city", "casino", "casino_name", "venue",
            "start_date", "end_date", "start_time", "end_time",
            "entry_fee", "currency", "prize_pool",
            "max_participants", "current_participants", "seats_remaining", "is_full",
            "event_type", "image", "banner",
            "status", "computed_status", "is_featured", "registration_open",
            "is_registered", "my_confirmation_id", "can_register",
        ]
        read_only_fields = fields

    def _my_registration(self, obj):
        """Reads the prefetched map the view attaches (see
        TeenPattiListView.get_serializer_context) so rendering a page of
        events costs one extra query in total, not one per card."""
        registrations = self.context.get("my_registrations")
        if registrations is None:
            return None
        return registrations.get(obj.id)

    def get_is_registered(self, obj):
        return self._my_registration(obj) is not None

    def get_my_confirmation_id(self, obj):
        reg = self._my_registration(obj)
        return reg.confirmation_id if reg else None

    def get_can_register(self, obj):
        """Mirrors the server-side gate in teenpatti_service.register_user so
        the button state matches what the API would actually do. Advisory
        only — the service re-checks everything under a row lock."""
        return bool(
            obj.is_active
            and obj.registration_open
            and obj.status in ("published", "upcoming", "live")
            and not obj.is_full
            and self._my_registration(obj) is None
        )


class TeenPattiEventAdminSerializer(serializers.ModelSerializer):
    casino_name = serializers.CharField(source="casino.name", read_only=True, default="")
    seats_remaining = serializers.IntegerField(read_only=True)
    registration_count = serializers.IntegerField(read_only=True, required=False)
    # Declared explicitly for the same reason CasinoEventSerializer does it:
    # DRF's multipart parsing treats an omitted boolean as False, which would
    # otherwise silently override the model's default=True on every create
    # made from the Back Office form.
    is_active = serializers.BooleanField(default=True, required=False)
    registration_open = serializers.BooleanField(default=True, required=False)
    is_featured = serializers.BooleanField(default=False, required=False)

    class Meta:
        model = TeenPattiEvent
        fields = [
            "id", "name", "short_description", "description",
            "country", "city", "casino", "casino_name", "venue",
            "start_date", "end_date", "start_time", "end_time",
            "entry_fee", "currency", "prize_pool",
            "max_participants", "current_participants", "seats_remaining",
            "event_type", "image", "banner",
            "status", "is_featured", "is_active", "registration_open",
            "registration_count", "created_at", "updated_at",
        ]
        # current_participants is maintained by the service layer's seat
        # accounting; letting an admin PATCH it directly would desynchronise
        # it from the actual registration rows.
        read_only_fields = ["id", "current_participants", "created_at", "updated_at"]

    def validate(self, attrs):
        instance = self.instance
        start_date = attrs.get("start_date", getattr(instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(instance, "end_date", None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date cannot be before the start date."})

        casino = attrs.get("casino", getattr(instance, "casino", None))
        country = attrs.get("country", getattr(instance, "country", None))
        # Part 44's country/casino integrity rule: a venue from a different
        # country than the event claims would make country filtering lie.
        if casino and country and casino.country.strip().lower() != country.strip().lower():
            raise serializers.ValidationError(
                {"casino": f"'{casino.name}' is in {casino.country}, which doesn't match the selected country."}
            )

        for field in ("entry_fee", "prize_pool"):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Cannot be negative."})

        max_participants = attrs.get("max_participants", getattr(instance, "max_participants", None))
        if instance and max_participants is not None and max_participants < instance.current_participants:
            raise serializers.ValidationError({
                "max_participants": (
                    f"{instance.current_participants} seats are already taken — "
                    f"the limit cannot be set below that."
                )
            })
        return attrs


class TeenPattiRegistrationSerializer(serializers.ModelSerializer):
    """The registrant's own view of their seat."""
    event_name = serializers.CharField(source="event.name", read_only=True)
    event_country = serializers.CharField(source="event.country", read_only=True)
    event_city = serializers.CharField(source="event.city", read_only=True)
    event_venue = serializers.CharField(source="event.venue", read_only=True)
    event_start_date = serializers.DateField(source="event.start_date", read_only=True)
    event_start_time = serializers.TimeField(source="event.start_time", read_only=True)
    event_status = serializers.CharField(source="event.status", read_only=True)

    class Meta:
        model = TeenPattiRegistration
        fields = [
            "id", "confirmation_id", "status", "created_at",
            "entry_fee_at_registration", "currency",
            "event", "event_name", "event_country", "event_city",
            "event_venue", "event_start_date", "event_start_time", "event_status",
        ]
        read_only_fields = fields


class TeenPattiRegistrationAdminSerializer(serializers.ModelSerializer):
    """The Back Office view of a registration. Beyond the seat itself, this
    carries the lead-qualification signals JACKPOTSWORLD spec Part 6/15
    calls for — country/city, VIP tier, verification, lifetime deposits and
    the affiliate code they signed up under — all pulled from the player's
    *existing* User record (nothing new is collected, nothing is
    duplicated). total_deposited in particular is what turns "someone
    registered for a Teen Patti event" into "a real, already-active
    JackpotsWorld player" versus a cold lead worth following up with.
    """
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_uid = serializers.CharField(source="user.user_uid", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    country = serializers.CharField(source="user.country", read_only=True)
    # No dedicated "home city" field exists on User — last_login_city is the
    # closest real signal already collected, so it's surfaced honestly under
    # that name rather than mislabeled as a home address.
    last_login_city = serializers.CharField(source="user.last_login_city", read_only=True)
    vip_level = serializers.IntegerField(source="user.vip_level", read_only=True)
    is_verified = serializers.BooleanField(source="user.is_verified", read_only=True)
    total_deposited = serializers.DecimalField(source="user.total_deposited", max_digits=14, decimal_places=2, read_only=True)
    # The affiliate/referral code this player signed up under, if any — the
    # closest real "source/campaign" signal this codebase has (there is no
    # separate marketing-campaign concept to attach Teen Patti registrations
    # to), and a genuinely actionable one: it tells the admin which affiliate
    # relationship to credit or follow up through.
    referral_source = serializers.CharField(source="user.referral_code_used", read_only=True)
    event_name = serializers.CharField(source="event.name", read_only=True)
    event_start_date = serializers.DateField(source="event.start_date", read_only=True)
    # Annotated by the view (Subquery over this player's other registrations)
    # — how many Teen Patti events this player has engaged with in total,
    # the "interest/activity level" signal Part 6 asks for.
    player_event_count = serializers.IntegerField(read_only=True, default=1)

    class Meta:
        model = TeenPattiRegistration
        fields = [
            "id", "confirmation_id", "user_name", "user_uid", "email", "phone",
            "country", "last_login_city", "vip_level", "is_verified",
            "total_deposited", "referral_source", "player_event_count",
            "event", "event_name", "event_start_date",
            "entry_fee_at_registration", "currency",
            "status", "admin_note", "cancelled_at", "created_at", "updated_at",
        ]
        # Only status/admin_note are admin-editable — the seat itself, who
        # holds it, and what they paid are historical facts.
        read_only_fields = [
            "id", "confirmation_id", "user_name", "user_uid", "email", "phone",
            "country", "last_login_city", "vip_level", "is_verified",
            "total_deposited", "referral_source", "player_event_count",
            "event", "event_name", "event_start_date",
            "entry_fee_at_registration", "currency", "cancelled_at",
            "created_at", "updated_at",
        ]
