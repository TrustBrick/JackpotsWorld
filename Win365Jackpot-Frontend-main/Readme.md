# WIN365 Wallet System — Integration Guide

## File Structure

```
FRONTEND  src/
└── admin/
    ├── AdminPanel.jsx          ← Root admin component (entry point)
    ├── constants.js            ← C, VIP_COLOR, WALLET_CFG, SCENARIO_META, ADMIN_TABS
    ├── helpers.js              ← adminFetch, fmt, fmtN, fmtDT, calcBonus, calcVipXP
    ├── components/
    │   └── SharedUI.jsx        ← Card, Btn, Input, Select, Toast, Spinner,
    │                              UidBadge, UtrBadge, StatusBadge, Pagination,
    │                              Table, rowHover, SectionTitle
    └── tabs/
        └── WalletTab.jsx       ← Full wallet manager (5 sub-tabs)

BACKEND  authapp/
├── models/
│   └── wallet_models.py        ← WalletAccount, WalletTransaction, WalletValidation
├── serializers/
│   └── wallet_serializers.py   ← All 3 model serializers
├── views/
│   └── wallet_admin_views.py   ← All wallet API views
└── urls_wallet.py              ← URL patterns (include in main urls.py)
```

---

## Backend Setup

### 1. Add models to authapp/models/__init__.py
```python
from .wallet_models import (
    WalletAccount, WalletTransaction, WalletValidation,
    WALLET_TYPES, ALL_SCENARIOS, SCENARIO_TO_WALLET,
)
```

### 2. Add to authapp/urls.py
```python
from django.urls import include
from .urls_wallet import wallet_urlpatterns

urlpatterns = [
    # ...your existing paths...
    path("admin-panel/wallet/", include((wallet_urlpatterns, "wallet"))),
]
```

### 3. Run migrations
```bash
python manage.py makemigrations authapp
python manage.py migrate
```

### 4. (Optional) Add to admin site
```python
# authapp/admin.py
from django.contrib import admin
from .models.wallet_models import WalletAccount, WalletTransaction, WalletValidation

admin.site.register(WalletAccount)
admin.site.register(WalletTransaction)
admin.site.register(WalletValidation)
```

---

## API Endpoints (all require admin JWT)

| Method | URL | Description |
|--------|-----|-------------|
| GET    | /api/admin-panel/wallet/scenarios/ | All scenario codes for dropdowns |
| GET    | /api/admin-panel/wallet/accounts/ | List all wallet accounts |
| GET    | /api/admin-panel/wallet/accounts/user/{id}/ | 4 accounts for one user |
| GET    | /api/admin-panel/wallet/transactions/ | List (filterable) |
| POST   | /api/admin-panel/wallet/transactions/ | Create pending entry |
| GET    | /api/admin-panel/wallet/transactions/{id}/ | Detail with validation |
| POST   | /api/admin-panel/wallet/transactions/{id}/approve/ | Approve → apply balance |
| POST   | /api/admin-panel/wallet/transactions/{id}/reject/ | Reject with reason |
| GET    | /api/admin-panel/wallet/validations/ | Validation log |

---

## UTR Reference Format

```
W365-{SCENARIO_CODE}-{YYYYMMDD}-{HHMMSSMS}{2_RANDOM_DIGITS}

Examples:
  W365-DAC-20260406-14302245612    ← Deposit at Casino
  W365-LUB-20260406-14302245634    ← Level Up Bonus
  W365-WBA-20260406-14302245678    ← Weekly Bonus Added
  W365-ROP-20260406-14302245690    ← Rolling Points
```

---

## Wallet Flow

```
Back Office Admin
    │
    ▼
[Entry Pane] ── fills form ──► POST /wallet/transactions/
                                    │
                                    ▼
                            System Validation?
                            (LUB / WBA / MBA)
                                    │
                        ┌───────────┴───────────┐
                    PASS (match)            FAIL (mismatch)
                        │                       │
                        ▼                       ▼
                  status=pending          status=rejected
                        │                 WalletValidation
                        ▼                 logged + notification
                [Verify Pane]
                  Approve / Reject
                        │
                   Approved?
                        │
                        ▼
                WalletAccount.balance updated
                WalletTransaction.balance_before/after set
                User notified via Notification
                Activity logged
```

---

## Wallet Types & Scenarios

| Code   | Label                              | Wallet        | Direction |
|--------|------------------------------------|---------------|-----------|
| DAC    | Deposit at Casino                  | Cash          | Credit    |
| WAC    | Withdraw at Casino                 | Cash          | Debit     |
| TAC    | Transfer to Another Casino         | Cash          | Debit     |
| LUB    | Level Up Bonus                     | Cash          | Credit    |
| WBA    | Weekly Bonus Added                 | Cash          | Credit    |
| MBA    | Monthly Bonus Added                | Cash          | Credit    |
| RMB    | Reimbursement                      | Cash          | Credit    |
| WIN    | Winnings                           | Cash          | Credit    |
| GBE    | Gifts/Benefits Encashment          | Cash          | Credit    |
| CBG    | Casino Cash Back / Gift            | Cash          | Credit    |
| CBGNC  | Casino CB/Gift – Non-Transferrable | Non-Cash      | Credit    |
| LUBNC  | Level Up Bonus – Transferrable     | Non-Cash      | Credit    |
| CBGOT  | Casino CB/Gift – Non-Transferrable | OTP           | Credit    |
| LUBOT  | Level Up Bonus – Transferrable     | OTP           | Credit    |
| ROP    | Rolling Points – Daily Report      | Rolling Points| Credit    |

### System Validation Rules
| Scenario | Expected Amount Formula |
|----------|------------------------|
| LUB      | VIP Level × $100       |
| LUBNC    | VIP Level × $100       |
| LUBOT    | VIP Level × $100       |
| WBA      | VIP Level × $50        |
| MBA      | VIP Level × $200       |

Rolling Points (ROP) are **non-redeemable** and **non-transferrable** — enforced at API level.