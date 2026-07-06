"""
authapp/utils/account_number.py
────────────────────────────────────────────────────────────────────────────
Account number generator.

Format: {PREFIX}{DDMMYY}{SS}{ms}
  PREFIX  = 2-char wallet prefix  (CA / NC / OT / RP)
  DD      = day  (2 digits)
  MM      = month (2 digits)
  YY      = year  (2 digits)
  SS      = seconds (2 digits)
  ms      = milliseconds (3 digits, padded)

Total: 2 + 2 + 2 + 2 + 2 + 3 = 13 chars  → e.g.  CA0704263244001
But we need exactly 12 digits after prefix → 14 chars total

Per-wallet offsets so 4 wallets created at the same time never clash:
  cash          → ms offset +0
  non_cash      → ms offset +1
  otp           → ms offset +2
  rolling_points→ ms offset +3
"""

from django.utils import timezone

PREFIX_MAP = {
    "C":  "CA",
    "NC": "NC",
    "O":  "OT",
    "RP": "RP",
}

OFFSET_MAP = {
    "C":  0,
    "NC": 1,
    "O":  2,
    "RP": 3,
}


def generate_account_number(wallet_type: str) -> str:
    """
    Generate a unique account number for a wallet.
    wallet_type must be one of: C, NC, O, RP
    """
    now    = timezone.now()
    prefix = PREFIX_MAP.get(wallet_type, "XX")
    offset = OFFSET_MAP.get(wallet_type, 0)

    dd  = now.strftime("%d")
    mm  = now.strftime("%m")
    yy  = now.strftime("%y")
    ss  = now.strftime("%S")
    ms  = (now.microsecond // 1000) + offset        # milliseconds + offset
    ms  = ms % 1000                                  # keep in range 0-999
    ms_str = str(ms).zfill(3)

    # e.g. CA070426324401   (CA + 07 + 04 + 26 + 32 + 440 + 1)
    return f"{prefix}{dd}{mm}{yy}{ss}{ms_str}"