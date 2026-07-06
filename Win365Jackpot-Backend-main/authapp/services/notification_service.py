# authapp/services/notification_service.py

# authapp/services/notification_service.py

import logging
logger = logging.getLogger(__name__)


def notify_transaction(user, txn_type, amount, wallet_type, balance_after, casino_name=None, extra_note="",actor=None):
    logger.warning(
        "notify_transaction CALLED: user=%s txn_type=%s amount=%s wallet=%s",
        user, txn_type, amount, wallet_type
    )
    try:
        from authapp.models import Notification

        WALLET_LABELS = {
            "cash": "Cash", "C": "Cash",
            "non_cash": "Non-Cash", "NC": "Non-Cash",
            "otp": "OTP", "O": "OTP",
            "rolling_points": "Rolling Points", "RP": "Rolling Points",
        }

        TYPE_META = {
            "DAC":        ("💰", "Deposit added to your casino wallet",       "green"),
            "WIN":        ("🏆", "Casino winnings credited to your wallet",   "green"),
            "LUB":        ("🎁", "VIP level bonus added to your wallet",      "gold"),
            "WBA":        ("🎁", "Weekly bonus credited to your wallet",      "gold"),
            "MBA":        ("🎁", "Monthly bonus credited to your wallet",     "gold"),
            "RMB":        ("↩️",  "Refund credited to your wallet",           "blue"),
            "GBE":        ("💎", "Encashment credited to your wallet",        "purple"),
            "CBG":        ("💸", "Cashback credited to your wallet",          "green"),
            "CBGNC":      ("💸", "Non-cash cashback credited to your wallet", "blue"),
            "LUBNC":      ("🎁", "Non-cash level bonus credited",             "blue"),
            "CBGOT":      ("💸", "OTP cashback credited to your wallet",      "purple"),
            "LUBOT":      ("🎁", "OTP level bonus credited to your wallet",   "purple"),
            "ROP":        ("⭐", "Rolling points added to your account",      "gold"),
            "DEP":        ("💰", "Deposit credited to your wallet",           "green"),
            "WDL":        ("📤", "Withdrawal processed successfully",         "red"),
            "WAC":        ("📤", "Casino withdrawal processed",               "red"),
            "LAC":        ("🎰", "Casino loss recorded",                      "orange"),
            "TAC":        ("🔄", "Funds transferred between casinos",         "purple"),
            "MAN":        ("🔧", "Manual credit applied to your wallet",      "blue"),
            "GIFT_CLAIM": ("🎁", "Bonus gift claimed successfully",           "blue"),
            "GIFT":       ("🎁", "Bonus gift credited to your wallet",        "blue"),
            "BONUS":      ("🎁", "Bonus credited to your wallet",             "blue"),
            "OTP_ADD":      ("⚡", "OTP points credited to your wallet",      "purple"),
            "OTP_BONUS":    ("🎁", "OTP bonus credited to your wallet",       "purple"),
            "OTP_REFERRAL": ("👥", "OTP referral reward credited",            "purple"),
            "OTP_REWARD":   ("🏅", "OTP reward credited to your wallet",      "purple"),
            "OTP_MANUAL":   ("🔧", "OTP manual credit applied",               "purple"),
            "MANUAL":     ("🔧", "Manual adjustment applied to your wallet",  "blue"),
            "ADJ":        ("🔧", "Wallet adjustment applied",                 "blue"),
        }

        txn_upper = (txn_type or "").strip().upper()
        meta = TYPE_META.get(txn_upper, ("🔔", "Transaction Update", "default"))
        icon_emoji, base_title, _ = meta

        wallet_label = WALLET_LABELS.get(wallet_type, str(wallet_type).upper())
        is_rp = wallet_type in ("rolling_points", "RP")

        amt_str = f"{float(amount):,.0f} RP" if is_rp else f"${float(amount):,.2f}"
        bal_str = f"{float(balance_after):,.0f} RP" if is_rp else f"${float(balance_after):,.2f}"

        DEBIT_TYPES = {"WAC", "LAC", "WDL", "TAC"}
        verb = "deducted from" if txn_upper in DEBIT_TYPES else "added to"

        lines = [f"{icon_emoji} {amt_str} has been {verb} your {wallet_label} wallet."]
        if casino_name:
            lines.append(f"🏛️ Casino: {casino_name}")
        lines.append(f"💼 Wallet: {wallet_label}")
        lines.append(f"📊 New Balance: {bal_str}")
        if extra_note:
            lines.append(f"📝 {extra_note}")

        # REPLACE:
        TYPE_TO_NOTIF_TYPE = {
            "DAC": "deposit",   "DEP": "deposit",
            "WIN": "win",       "LUB": "bonus",
            "WBA": "bonus",     "MBA": "bonus",
            "RMB": "bonus",     "GBE": "bonus",
            "CBG": "bonus",     "CBGNC": "bonus",
            "LUBNC": "bonus",   "CBGOT": "otp",
            "LUBOT": "otp",     "ROP": "rolling",
            "WDL": "withdrawal","WAC": "withdrawal",
            "LAC": "withdrawal","TAC": "system",
            "MAN": "bonus",     "OTP_ADD": "otp",
            "OTP_BONUS": "otp", "OTP_REFERRAL": "otp",
            "OTP_REWARD": "otp","OTP_MANUAL": "otp",
            "GIFT": "bonus",    "BONUS": "bonus",
        }
        notif_type = TYPE_TO_NOTIF_TYPE.get(txn_upper, "system")

        n = Notification.objects.create(
            user=user,
            title=base_title,
            message="\n".join(lines),
            icon=notif_type,   # store type in icon field
        )
        logger.warning("Notification CREATED id=%s for user=%s", n.id, user)

    except Exception as exc:
        logger.warning("notify_transaction FAILED for user=%s txn_type=%s: %s", user, txn_type, exc)


def notify_generic(user, title, message, icon="bell"):
    """Send a free-form notification (e.g. VIP level-up)."""
    try:
        from authapp.models import Notification
        Notification.objects.create(user=user, title=title, message=message, icon=icon or "system")
        logger.warning("notify_generic CREATED for user=%s title=%s", user, title)
    except Exception as exc:
        logger.warning("notify_generic failed for user=%s: %s", user, exc)