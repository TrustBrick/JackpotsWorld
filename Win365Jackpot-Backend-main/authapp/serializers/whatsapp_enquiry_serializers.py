"""
WHATSAPP-CAPTURE serializers.

Two, deliberately: what an anonymous visitor may write, and what staff may
read. They do not share a field list, because the public one must not be able
to set `status` or `admin_note`, and must never echo `submitted_ip` back.
"""

import re

from rest_framework import serializers

from authapp.models import WhatsAppEnquiry
from authapp.models.whatsapp_enquiry_models import STAFF_SETTABLE_STATUSES

# Digits, with an optional leading +. Everything else (spaces, dashes,
# brackets, the "(0)" people paste out of contact pages) is stripped before
# this runs, so the check is about whether a usable number was given, not
# about formatting the visitor should not have to think about.
_DIGITS = re.compile(r"^\+?\d{6,20}$")

# Loose on purpose. Numbering plans vary far more than validators usually
# assume, and refusing a real enquirer because their country's number is
# shorter than some rule of thumb costs a lead. The floor only rejects what
# obviously cannot be dialled.
_MIN_DIGITS = 6


class WhatsAppEnquiryCreateSerializer(serializers.ModelSerializer):
    """What the visitor sends, before being handed to WhatsApp."""

    class Meta:
        model = WhatsAppEnquiry
        fields = ["name", "whatsapp_number", "email", "message", "source",
                  "page_path", "destination_number", "country_code"]
        extra_kwargs = {
            # Optional: the number is what answers a WhatsApp enquiry, so
            # requiring an address would cost leads to collect something
            # the desk may never use.
            "email": {"required": False, "allow_blank": True},
            "message": {"required": False, "allow_blank": True},
            "source": {"required": False, "allow_blank": True},
            "page_path": {"required": False, "allow_blank": True},
            "destination_number": {"required": False, "allow_blank": True},
            "country_code": {"required": False, "allow_blank": True},
        }

    def validate_name(self, value):
        value = (value or "").strip()
        if len(value) < 2:
            raise serializers.ValidationError("Please enter your name.")
        return value[:120]

    def validate_whatsapp_number(self, value):
        raw = (value or "").strip()

        # "(0)" is the international convention for a trunk prefix to be
        # OMITTED when dialling from abroad — "+91 (0) 98765 43210" is
        # +919876543210, not +9109876543210. Keeping that zero produces a
        # number nobody can call, which for a lead list is the same as losing
        # the lead. Removed explicitly, because the parentheses are what make
        # the meaning unambiguous; a bare leading zero is NOT stripped, since
        # in plenty of numbering plans it is a real digit.
        raw = re.sub(r"\(\s*0\s*\)", "", raw)

        # Keep a leading + and the digits; drop the punctuation people type.
        cleaned = re.sub(r"[^\d+]", "", raw)
        cleaned = ("+" if cleaned.startswith("+") else "") + re.sub(r"\D", "", cleaned)
        if not _DIGITS.match(cleaned) or len(re.sub(r"\D", "", cleaned)) < _MIN_DIGITS:
            raise serializers.ValidationError(
                "Please enter a valid WhatsApp number, including the country code."
            )
        return cleaned

    def validate_message(self, value):
        # Bounded so one paste cannot make the lead list unreadable. Cut
        # rather than rejected: the number is the point, and losing the whole
        # enquiry over an over-long message would be the wrong trade.
        return (value or "").strip()[:2000]


class WhatsAppEnquiryClickSerializer(serializers.Serializer):
    """
    WHATSAPP-LEADS: a button press with no details attached.

    SEPARATE FROM WhatsAppEnquiryCreateSerializer ON PURPOSE. That one requires
    a name and a usable number, and should keep requiring them — a submitted
    form without them is a broken form. This one is the other half: the visitor
    who pressed the button and declined the form, or never saw it. Which button
    they reached for is worth recording on its own, and forcing that through a
    serializer built for a filled-in form would mean weakening the form's
    validation for every caller.

    Nothing here is trusted. `source` is looked up against EnquiryMessage by
    the view, and everything else is context the row carries rather than
    anything the row asserts.
    """

    source = serializers.CharField(max_length=40, allow_blank=True, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    message = serializers.CharField(required=False, allow_blank=True)
    page_path = serializers.CharField(max_length=255, required=False, allow_blank=True)
    destination_number = serializers.CharField(max_length=32, required=False, allow_blank=True)
    country_code = serializers.CharField(max_length=8, required=False, allow_blank=True)

    referrer = serializers.CharField(max_length=500, required=False, allow_blank=True)
    utm_source = serializers.CharField(max_length=150, required=False, allow_blank=True)
    utm_medium = serializers.CharField(max_length=150, required=False, allow_blank=True)
    utm_campaign = serializers.CharField(max_length=150, required=False, allow_blank=True)
    utm_content = serializers.CharField(max_length=150, required=False, allow_blank=True)
    utm_term = serializers.CharField(max_length=150, required=False, allow_blank=True)

    anonymous_id = serializers.CharField(max_length=64, required=False, allow_blank=True)
    session_key = serializers.CharField(max_length=64, required=False, allow_blank=True)

    def validate_message(self, value):
        return (value or "").strip()[:2000]


class WhatsAppEnquiryAdminSerializer(serializers.ModelSerializer):
    """What staff read and update. `status` and `admin_note` are the only
    writable fields — the visitor's own words are a record, not a draft."""

    user_email = serializers.EmailField(source="user.email", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    is_guest = serializers.SerializerMethodField()

    class Meta:
        model = WhatsAppEnquiry
        fields = [
            "id", "created_at", "updated_at",
            "name", "whatsapp_number", "email", "message",
            "source", "button_label", "section",
            "page_path", "destination_number", "country_code",
            "referrer", "utm_source", "utm_medium", "utm_campaign",
            "utm_content", "utm_term",
            "click_count", "first_clicked_at", "last_clicked_at",
            "user", "user_email", "is_guest",
            "status", "status_label", "admin_note",
        ]
        read_only_fields = [
            "id", "created_at", "updated_at",
            "name", "whatsapp_number", "email", "message",
            "source", "button_label", "section",
            "page_path", "destination_number", "country_code",
            "referrer", "utm_source", "utm_medium", "utm_campaign",
            "utm_content", "utm_term",
            "click_count", "first_clicked_at", "last_clicked_at",
            "user", "user_email", "is_guest", "status_label",
        ]

    def get_is_guest(self, obj):
        return obj.user_id is None

    def validate_status(self, value):
        """
        A host may say what THEY did about a lead, not what the visitor did.

        `clicked` and `new` describe an observed event and are written by the
        endpoint; `message_received` would need evidence from a Cloud API
        webhook that does not exist. Letting either be set by hand would make
        the column describe opinion rather than fact, which is the one thing a
        lead list cannot afford.
        """
        if value not in STAFF_SETTABLE_STATUSES:
            allowed = ", ".join(sorted(STAFF_SETTABLE_STATUSES))
            raise serializers.ValidationError(
                f"Only {allowed} can be set by hand — the other states record what "
                f"the visitor actually did."
            )
        return value
