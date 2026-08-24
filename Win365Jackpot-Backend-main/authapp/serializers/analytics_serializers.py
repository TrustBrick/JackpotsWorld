"""
authapp/serializers/analytics_serializers.py
─────────────────────────────────────────────────────────────────────────────
ANALYTICS: validation for the public ingest endpoint.

Deliberately there is NO user_id field: identity is always taken from the
request's JWT server-side (see analytics_service.record_event), so a client can
never attribute an event to another member. Only the client-ingestable event
types are accepted (url_click is recorded by the redirect endpoint, so it can't
be spoofed here). metadata is sanitised to bounded JSON scalars so it can't be
abused as blob storage or to smuggle sensitive data.

There is also NO ip/country/region/city/latitude/longitude field, and no way
to override any of them — every one is resolved entirely server-side in
services/visitor_service.py from the address the connection actually came
from, so a client cannot claim to be somewhere it isn't. Same treatment as
identity above. This is why the frontend never sends a location and why
adding such a field here would quietly undo §23.
"""
from rest_framework import serializers

from authapp.models.analytics_models import CLIENT_INGESTABLE_EVENT_TYPES, Campaign


class CampaignSerializer(serializers.ModelSerializer):
    """Admin CRUD for marketing campaigns. tracking_id is generated
    server-side (used by the trackable-link redirect), never client-set."""

    class Meta:
        model = Campaign
        fields = [
            "id", "name", "utm_source", "utm_medium", "utm_campaign",
            "utm_content", "utm_term", "tracking_id", "destination_url",
            "start_date", "end_date", "status", "ad_cost",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "tracking_id", "created_at", "updated_at"]

_MAX_META_KEYS = 20
_MAX_META_STR = 200
# The only metadata keys the video/page instrumentation actually needs. Anything
# else is dropped rather than stored — keeps the column purposeful and safe.
_ALLOWED_META_KEYS = {
    "percent", "watched_seconds", "duration", "position",
    "title", "content_kind", "autoplay", "muted",
}


class AnalyticsEventIngestSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(choices=sorted(CLIENT_INGESTABLE_EVENT_TYPES))
    content_type = serializers.CharField(required=False, allow_blank=True, max_length=40, default="")
    content_id = serializers.CharField(required=False, allow_blank=True, max_length=120, default="")
    url = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    referrer = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    source = serializers.CharField(required=False, allow_blank=True, max_length=120, default="")
    session_id = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")
    anonymous_id = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")
    # VIDEO-CLICK-ANALYTICS: optional idempotency key — see
    # AnalyticsEvent.client_event_id and analytics_service.record_event for
    # what this does. allow_blank because an older client build simply won't
    # send it; blank means "don't deduplicate", the pre-existing behavior.
    client_event_id = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")
    # VISITOR-ANALYTICS: what was clicked, for event_type="click". These are
    # descriptive strings the page already knows about itself (a button's id,
    # its visible label, where a link points) — none of them affects identity,
    # location, attribution or any count's denominator, so accepting them from
    # the client costs nothing that matters. Length-bounded like everything
    # else here so they can't be used as free storage.
    element_id = serializers.CharField(required=False, allow_blank=True, max_length=120, default="")
    element_type = serializers.CharField(required=False, allow_blank=True, max_length=40, default="")
    element_label = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    destination_url = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    utm_source = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    utm_medium = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    utm_campaign = serializers.CharField(required=False, allow_blank=True, max_length=150, default="")
    utm_content = serializers.CharField(required=False, allow_blank=True, max_length=150, default="")
    utm_term = serializers.CharField(required=False, allow_blank=True, max_length=150, default="")
    metadata = serializers.DictField(required=False, default=dict)

    def validate_metadata(self, value):
        if not isinstance(value, dict):
            return {}
        clean = {}
        for k, v in value.items():
            if len(clean) >= _MAX_META_KEYS:
                break
            if k not in _ALLOWED_META_KEYS:
                continue
            if isinstance(v, bool) or isinstance(v, (int, float)):
                clean[k] = v
            elif isinstance(v, str):
                clean[k] = v[:_MAX_META_STR]
            # anything non-scalar (nested dict/list/None) is dropped
        return clean

    def to_utm(self):
        d = self.validated_data
        return {
            "utm_source": d["utm_source"], "utm_medium": d["utm_medium"],
            "utm_campaign": d["utm_campaign"], "utm_content": d["utm_content"],
            "utm_term": d["utm_term"],
        }
