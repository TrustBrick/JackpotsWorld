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

There is also NO country/region/city field, and no way to override country/
region/city already on the row — all three are resolved entirely server-side
in analytics_service.record_event (Cloudflare's edge header for country, the
existing ip-api geolocation utility for region/city), so a client cannot claim
to be somewhere it isn't. Same treatment as identity above.
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
