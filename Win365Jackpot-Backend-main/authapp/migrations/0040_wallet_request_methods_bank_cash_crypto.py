# WALLET-REQUESTS: data migration — narrows the Deposit/Withdrawal Request
# payment-method dropdown to exactly Bank Transfer / Cash / Crypto, per the
# JackpotsWorld UI spec. Other methods (UPI, Card, Wise, Stripe, Casino
# Deposit API) stay in the registry, just disabled, so re-enabling any of
# them later is a data change, not a redesign.
from django.db import migrations

ENABLE = {"BANK_TRANSFER", "CASH", "CRYPTO"}


def set_enabled(apps, schema_editor):
    MethodConfig = apps.get_model("authapp", "WalletRequestMethodConfig")
    for cfg in MethodConfig.objects.all():
        enabled = cfg.code in ENABLE
        if cfg.is_enabled != enabled:
            cfg.is_enabled = enabled
            cfg.save(update_fields=["is_enabled"])


def revert_enabled(apps, schema_editor):
    MethodConfig = apps.get_model("authapp", "WalletRequestMethodConfig")
    PREVIOUS_ENABLED = {"BANK_TRANSFER", "UPI", "CARD"}
    for cfg in MethodConfig.objects.all():
        enabled = cfg.code in PREVIOUS_ENABLED
        if cfg.is_enabled != enabled:
            cfg.is_enabled = enabled
            cfg.save(update_fields=["is_enabled"])


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0039_withdrawal_casino_method'),
    ]

    operations = [
        migrations.RunPython(set_enabled, revert_enabled),
    ]
