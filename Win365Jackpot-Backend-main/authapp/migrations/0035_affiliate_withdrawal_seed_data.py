# AFFILIATE-WITHDRAWALS: data migration — safe to delete along with
# 0034_affiliate_withdrawal_system.py to remove the feature.
#
# Seeds the withdrawal method registry (USDT enabled, everything else
# pre-listed but disabled per the Phase 1 spec) and the settings singleton.
from django.db import migrations


METHODS = [
    ("USDT", "USDT (Crypto)", True, ["network", "wallet_address"], 0),
    ("BANK", "Bank Transfer", False, ["account_name", "account_number", "bank_name", "swift_or_ifsc"], 1),
    ("UPI", "UPI", False, ["upi_id"], 2),
    ("PAYPAL", "PayPal", False, ["paypal_email"], 3),
    ("WISE", "Wise", False, ["wise_email_or_account"], 4),
    ("STRIPE", "Stripe", False, ["stripe_account_id"], 5),
    ("USDC", "USDC (Crypto)", False, ["network", "wallet_address"], 6),
    ("BINANCE_PAY", "Binance Pay", False, ["binance_pay_id"], 7),
    ("WESTERN_UNION", "Western Union", False, ["full_name", "country", "city"], 8),
]


def seed(apps, schema_editor):
    MethodConfig = apps.get_model("authapp", "AffiliateWithdrawalMethodConfig")
    for code, label, enabled, schema, order in METHODS:
        MethodConfig.objects.update_or_create(
            code=code,
            defaults={"label": label, "is_enabled": enabled, "field_schema": schema, "order": order},
        )

    Settings = apps.get_model("authapp", "AffiliateWithdrawalSettings")
    obj, _ = Settings.objects.get_or_create(pk=1)
    obj.save()


def unseed(apps, schema_editor):
    MethodConfig = apps.get_model("authapp", "AffiliateWithdrawalMethodConfig")
    MethodConfig.objects.filter(code__in=[m[0] for m in METHODS]).delete()
    Settings = apps.get_model("authapp", "AffiliateWithdrawalSettings")
    Settings.objects.filter(pk=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0034_affiliate_withdrawal_system'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
