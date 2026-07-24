from decimal import Decimal
from django.db import migrations

# Initial Daily Login Spin Wheel reward tiers — the wheel was previously
# unusable ("Spin rewards are not configured yet") because SpinConfig had
# zero rows. Deliberately no image/image_url set on any tier: no real
# licensed reward artwork is available to seed, so every tier renders via
# the frontend's icon-by-reward_type fallback until an admin uploads real
# artwork through the existing Rewards & Spin admin tab.
SEED_TIERS = [
    # label, reward_type, value, weight, is_jackpot, description
    ("$5 Cash Bonus",         "cash_wallet_bonus",   Decimal("5.00"),   20, False,
     "A little extra in your main wallet — spend it however you like."),
    ("$10 Cash Bonus",        "cash_wallet_bonus",   Decimal("10.00"),  10, False,
     "A bigger cash top-up straight to your wallet."),
    ("50 Rolling Points",     "rolling_points",      Decimal("50.00"),  20, False,
     "Boost your VIP progress with free Rolling Points."),
    ("15% Cashback",          "cashback",            Decimal("15.00"),  15, False,
     "Cashback credited straight to your cash wallet."),
    ("$20 Bonus Credits",     "bonus_credits",       Decimal("20.00"),  15, False,
     "Non-cash bonus credits added to your account."),
    ("VIP Level Boost",       "vip_upgrade",         Decimal("0.00"),   5,  False,
     "Instantly climb one VIP tier — unlock the next level's perks."),
    ("$25 Gift Voucher",      "gift_voucher",        Decimal("25.00"),  8,  False,
     "A gift voucher waiting for you in your Gifts tab."),
    ("10% Discount Voucher",  "discount_coupon",     Decimal("10.00"),  8,  False,
     "A discount voucher waiting for you in your Gifts tab."),
    ("Try Again",             "no_reward",           Decimal("0.00"),   30, False,
     "So close! Come back tomorrow for another spin."),
    ("MEGA JACKPOT",          "jackpot_bonus",       Decimal("500.00"), 10, True,
     "The big one — a massive cash bonus credited instantly."),
]


def seed(apps, schema_editor):
    SpinConfig = apps.get_model("authapp", "SpinConfig")
    if SpinConfig.objects.exists():
        return
    for label, reward_type, value, weight, is_jackpot, description in SEED_TIERS:
        SpinConfig.objects.create(
            label=label, reward_type=reward_type, value=value,
            weight=weight, is_jackpot=is_jackpot, is_active=True,
            description=description,
        )


def unseed(apps, schema_editor):
    SpinConfig = apps.get_model("authapp", "SpinConfig")
    SpinConfig.objects.filter(label__in=[t[0] for t in SEED_TIERS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0026_spinconfig_description_spinconfig_image"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
