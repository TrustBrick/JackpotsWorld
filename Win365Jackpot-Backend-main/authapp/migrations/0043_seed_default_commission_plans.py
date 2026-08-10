from decimal import Decimal

from django.db import migrations


DEFAULT_PLANS = [
    {
        "commission_type": "deposit",
        "name": "Standard Deposit Commission",
        "rate": Decimal("3.000"),
        "min_deposit": Decimal("5000.00"),
        "wagering_multiplier": Decimal("7.00"),
        "is_default": True,
        "description": (
            "Earn 3% commission on a referred player's deposit once they've deposited at least "
            "$5,000 and gone on to wager (turnover) 7x that deposit amount. One-time per referred "
            "player. Example: $5,000 deposit requires $35,000 completed wagering before the 3% "
            "($150) commission becomes payable."
        ),
    },
    {
        "commission_type": "losing",
        "name": "Standard Losing Commission",
        "rate": Decimal("5.000"),
        "min_deposit": Decimal("5000.00"),
        "wagering_multiplier": Decimal("7.00"),
        "is_default": True,
        "description": (
            "Earn 5% commission on a referred player's losses, once they've deposited at least "
            "$5,000 and wagered (turnover) 7x that deposit amount. Commission grows as the "
            "player's cumulative qualifying loss grows."
        ),
    },
    {
        "commission_type": "rolling",
        "name": "Standard Rolling Commission",
        "rate": Decimal("0.115"),
        "min_deposit": Decimal("0.00"),
        "wagering_multiplier": Decimal("0.00"),
        "is_default": True,
        "description": (
            "Earn 0.115% commission on every dollar a referred player wagers (turnover), credited "
            "as soon as each verified bet slip is recorded — no deposit minimum or wagering gate."
        ),
    },
]


def seed_plans(apps, schema_editor):
    CommissionPlan = apps.get_model("authapp", "CommissionPlan")
    for plan in DEFAULT_PLANS:
        CommissionPlan.objects.get_or_create(
            commission_type=plan["commission_type"],
            name=plan["name"],
            defaults=plan,
        )


def unseed_plans(apps, schema_editor):
    CommissionPlan = apps.get_model("authapp", "CommissionPlan")
    CommissionPlan.objects.filter(
        name__in=[p["name"] for p in DEFAULT_PLANS],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0042_affiliate_commission_engine"),
    ]

    operations = [
        migrations.RunPython(seed_plans, unseed_plans),
    ]
