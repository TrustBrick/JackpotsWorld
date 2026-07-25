# WALLET-REQUESTS: data migration — safe to delete along with
# 0036_wallet_request_system.py to remove the feature.
#
# Seeds the deposit payment-method registry. Bank Transfer / UPI / Card are
# enabled by default as the common real-world deposit methods for this
# platform; Crypto/Wise/Stripe/Casino Deposit API are pre-listed but
# disabled so enabling them later is a data change, not a redesign.
from django.db import migrations


METHODS = [
    ("BANK_TRANSFER", "Bank Transfer", True, ["account_name", "account_number", "bank_name", "ifsc_or_swift"], 0),
    ("UPI", "UPI", True, ["upi_id"], 1),
    ("CARD", "Debit/Credit Card", True, ["card_last4"], 2),
    ("CASH", "Cash", False, [], 3),
    ("CRYPTO", "Crypto", False, ["network", "wallet_address"], 4),
    ("WISE", "Wise", False, ["wise_email_or_account"], 5),
    ("STRIPE", "Stripe", False, ["stripe_account_id"], 6),
    ("CASINO_API", "Casino Deposit API", False, [], 7),
]


def seed(apps, schema_editor):
    MethodConfig = apps.get_model("authapp", "WalletRequestMethodConfig")
    for code, label, enabled, schema, order in METHODS:
        MethodConfig.objects.update_or_create(
            code=code,
            defaults={"label": label, "is_enabled": enabled, "field_schema": schema, "order": order},
        )


def unseed(apps, schema_editor):
    MethodConfig = apps.get_model("authapp", "WalletRequestMethodConfig")
    MethodConfig.objects.filter(code__in=[m[0] for m in METHODS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0036_wallet_request_system'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
