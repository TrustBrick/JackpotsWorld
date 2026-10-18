"""Same-day bet slips for the admin Rolling Points entry.

When a player already has a bet slip recorded for a betting date, the next
slip for that day is numbered automatically from the last one, so the admin
does not retype the slip number and date for every additional slip.
"""
import re

from authapp.models.offline_deposit import OfflineDepositLog

_TRAILING_NUMBER = re.compile(r"^(.*?)(\d+)$")


def slips_for_day(user, betting_date):
    """The player's rolling-points slips recorded for one betting date, oldest first."""
    if not user or not betting_date:
        return OfflineDepositLog.objects.none()
    return (
        OfflineDepositLog.objects
        .filter(user=user, entry_type="rolling_points", betting_date=betting_date)
        .exclude(slip_number__isnull=True).exclude(slip_number="")
        .order_by("created_at", "id")
    )


def _increment(slip_number):
    """SLP-20261018-001 -> SLP-20261018-002; ABC -> ABC-2. Keeps zero padding."""
    m = _TRAILING_NUMBER.match(slip_number)
    if not m:
        return f"{slip_number}-2"
    prefix, digits = m.groups()
    return f"{prefix}{int(digits) + 1:0{len(digits)}d}"


def next_slip_number(user, betting_date):
    """The next free slip number for the player's day, or None when the day
    has no slip yet (the first slip of a day is always typed by the admin)."""
    last = slips_for_day(user, betting_date).last()
    if last is None:
        return None
    candidate = _increment(last.slip_number)
    # Slip numbers are globally unique; step past any already taken.
    for _ in range(1000):
        if not OfflineDepositLog.objects.filter(slip_number=candidate).exists():
            return candidate
        candidate = _increment(candidate)
    return None
