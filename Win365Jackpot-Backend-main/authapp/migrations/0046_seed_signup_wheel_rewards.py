from decimal import Decimal

from django.db import migrations


DEFAULT_REWARDS = [
    {"label": "Try Again", "reward_type": "no_reward", "value": Decimal("0"), "probability_pct": Decimal("40.000"), "no_repeat_for_player": False, "display_order": 0},
    {"label": "$50", "reward_type": "cash_bonus", "value": Decimal("50.00"), "probability_pct": Decimal("30.000"), "no_repeat_for_player": False, "display_order": 1},
    {"label": "$100", "reward_type": "cash_bonus", "value": Decimal("100.00"), "probability_pct": Decimal("20.000"), "no_repeat_for_player": False, "display_order": 2},
    {"label": "$150", "reward_type": "cash_bonus", "value": Decimal("150.00"), "probability_pct": Decimal("7.000"), "no_repeat_for_player": True, "display_order": 3},
    {"label": "$250", "reward_type": "cash_bonus", "value": Decimal("250.00"), "probability_pct": Decimal("2.900"), "no_repeat_for_player": True, "display_order": 4},
    {"label": "$500", "reward_type": "cash_bonus", "value": Decimal("500.00"), "probability_pct": Decimal("0.100"), "no_repeat_for_player": True, "display_order": 5},
]


def seed_rewards(apps, schema_editor):
    SignupWheelReward = apps.get_model("authapp", "SignupWheelReward")
    SignupWheelSettings = apps.get_model("authapp", "SignupWheelSettings")

    for reward in DEFAULT_REWARDS:
        SignupWheelReward.objects.get_or_create(label=reward["label"], defaults=reward)

    SignupWheelSettings.objects.get_or_create(
        pk=1, defaults={"is_enabled": True, "max_lifetime_spins": 5, "eligibility_window_days": 30},
    )


def unseed_rewards(apps, schema_editor):
    SignupWheelReward = apps.get_model("authapp", "SignupWheelReward")
    SignupWheelSettings = apps.get_model("authapp", "SignupWheelSettings")
    SignupWheelReward.objects.filter(label__in=[r["label"] for r in DEFAULT_REWARDS]).delete()
    SignupWheelSettings.objects.filter(pk=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0045_wheel_engine"),
    ]

    operations = [
        migrations.RunPython(seed_rewards, unseed_rewards),
    ]
