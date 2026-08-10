# Win365 Jackpot — Backend Architecture Documentation

**Stack:** Django 5.2.12 + Django REST Framework 3.17.1 + MySQL (PyMySQL driver) + React (Vite) frontend, deployed on AWS Elastic Beanstalk (`ap-south-1`, Amazon Linux 2023, Python 3.11).
**Scope:** Single Django app `authapp` (~17,200 lines, excluding migrations) containing 67 models, ~27 view modules, ~21 URL modules, 18 serializer modules, 12 service modules.
**Status:** Read-only analysis. No code was modified to produce this document. All file:line references were verified against the current repo state as of 2026-07-28.

> ⚠️ **Correction vs. the assumptions in the original request:** `authapp/models/register_models.py` / `register_views.py` / `/api/register/` is **not** the user-account signup flow — it's a marketing "trip interest" lead-capture form (`Registration` model: `full_name`, `destination`, `package`, `whatsapp_number`, ...). It creates **no** `User` row. The real account-registration flow is `POST /api/auth/register/` → `RegisterView` (`authapp/views/auth_views.py`). This is used throughout the doc.

---

## Table of Contents

1. [User ID Generation](#1-user-id-generation)
2. [Affiliate ID Generation](#2-affiliate-id-generation)
3. [Complete Database Architecture](#3-complete-database-architecture)
4. [Data Storage Mapping](#4-data-storage-mapping)
5. [SQL / ORM Query Patterns](#5-sql--orm-query-patterns)
6. [Admin Users Page — Performance Investigation](#6-admin-users-page--performance-investigation)
7. [Performance Improvement Suggestions](#7-performance-improvement-suggestions-not-implemented)
8. [Manual Inspection SQL](#8-manual-inspection-sql)
9. [Delete Queries (Reference Only)](#9-delete-queries-reference-only)
10. [AWS / Database Infrastructure](#10-aws--database-infrastructure)
11. [API Documentation](#11-api-documentation)
12. [Model Relationships / ER Diagram](#12-model-relationships--er-diagram)
13. [Code Execution Flow](#13-code-execution-flow)
14. [Security Review](#14-security-review)
15. [Handover Summary](#15-handover-summary)

---

## 1. User ID Generation

### 1.1 Files & functions

| File | Function | Purpose |
|---|---|---|
| `authapp/models/user_model.py:19-22` | `_gen_win_uid()` | Builds one candidate ID string |
| `authapp/models/user_model.py:25-29` | `_unique_win_uid()` | Wraps the above in a DB-uniqueness retry loop |
| `authapp/models/user_model.py:32-33` | `_gen_referral_code()` | Generates the referral code (separate ID, no retry loop) |
| `authapp/models/user_model.py:155-160` | `User.save()` | The single choke point that actually assigns both |

### 1.2 Exact code

```python
# authapp/models/user_model.py
import random, string

def _gen_win_uid():
    letters = random.choices(string.ascii_uppercase, k=2)
    digits  = random.choices(string.digits, k=2)
    return "WIN" + "".join(letters) + "".join(digits)

def _unique_win_uid():
    uid = _gen_win_uid()
    while User.objects.filter(user_uid=uid).exists():
        uid = _gen_win_uid()
    return uid

def _gen_referral_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))

# ... inside class User(AbstractBaseUser, PermissionsMixin):
def save(self, *args, **kwargs):
    if not self.user_uid:
        self.user_uid = _unique_win_uid()
    if not self.referral_code:
        self.referral_code = _gen_referral_code()
    super().save(*args, **kwargs)
```

### 1.3 Model / field

`User.user_uid` — `authapp/models/user_model.py:72`
```python
user_uid = models.CharField(max_length=10, unique=True, editable=False, db_index=True)
```

### 1.4 Which API calls it

`POST /api/auth/register/` → `RegisterView` (`authapp/views/auth_views.py:141`). Also indirectly: `POST /api/auth/verify-otp/` (register-mode OTP flow), `AdminStaffConfirmView`, `SuperAdminCreateAdminView` — anywhere a new `User` row is created, since generation happens in `User.save()`, not in the view/serializer.

### 1.5 Algorithm

| Component | Value | Source |
|---|---|---|
| Prefix (constant) | `"WIN"` | hardcoded literal, 3 chars |
| Random letters | 2 chars, `random.choices(string.ascii_uppercase, k=2)` | 26 possibilities each |
| Random digits | 2 chars, `random.choices(string.digits, k=2)` | 10 possibilities each |
| Total length | 7 characters (field allows up to 10) | e.g. `WINDN86` |
| RNG source | Python's `random` module (Mersenne Twister) | **not cryptographically secure**, not `secrets`, not `uuid`, no counter/sequence, no hash |

### 1.6 Constant vs. random parts

- **Constant:** `"WIN"` — first 3 characters, always identical.
- **Random:** the remaining 4 characters (`LLDD` — 2 uppercase letters then 2 digits).

### 1.7 Duplicates / uniqueness

- **Possible?** Yes, in principle — the generator itself has no built-in exclusivity.
- **Prevented by:** `_unique_win_uid()`'s `while User.objects.filter(user_uid=uid).exists(): ...` retry loop, backstopped by the DB `unique=True` constraint on `user_uid` (a genuine race between two simultaneous requests would surface as an `IntegrityError`, not a silent duplicate — but this isn't caught/retried in `RegisterSerializer.create()`, so a true collision would 500 the request).

### 1.8 Total ID space & exhaustion

- Random portion space: **26² × 10² = 676 × 100 = 67,600** possible values (the constant `WIN` prefix contributes nothing to the space).
- **Birthday-paradox collision risk:** ~50% chance of at least one collision attempt by ~306 users; the retry loop absorbs this transparently but gets progressively slower as the ID space fills.
- **Exhaustible:** Yes — with only 67,600 combinations, at high user counts the while-loop will spin longer and longer. There is **no maximum retry cap** and no fallback to a longer ID — in the theoretical limit it would loop forever.
- **Recycling:** IDs are **never recycled** on deletion. There's no dedicated reclaim mechanism, and the codebase doesn't appear to support hard-deleting `User` rows anywhere in the reviewed views (bans use `is_active=False`, not row deletion).

### 1.9 Changing prefix or length

Edit `authapp/models/user_model.py:19-22`:
- Prefix: change the literal `"WIN"` string.
- Length: change the `k=2`/`k=2` arguments and/or the character sets (`string.ascii_uppercase`, `string.digits`).
- If the total exceeds 10 characters, also raise `max_length=10` on `user_uid` (`user_model.py:72`) and generate a new migration.

### 1.10 Complete execution flow

```
POST /api/auth/register/
  → authapp/url_patterns/auth_urls.py  (path "auth/register/")
  → RegisterView.post()                                    [views/auth_views.py:145]
      → RegisterSerializer(data=request.data)                [serializers/user_serializers.py:67]
      → serializer.is_valid()   (validate_email / validate_phone / validate_password)
      → serializer.save() → RegisterSerializer.create()       [serializers/user_serializers.py:130]
          → User.objects.create_user(...)                      [UserManager.create_user, user_model.py:41]
              → user.set_password(password)
              → user.save(using=self._db)                       [User.save(), user_model.py:155]
                  → self.user_uid = _unique_win_uid()             [→ _gen_win_uid()]
                  → self.referral_code = _gen_referral_code()
                  → super().save() → INSERT INTO authapp_user (...)
              → post_save signal fires
                  → create_wallet_accounts()                      [authapp/signals.py:21]
                      → generate_account_number("C"/"NC"/"O"/"RP") ×4  [utils/account_number.py:41]
                      → WalletAccount.objects.get_or_create(...) ×4
      → referral_code_used handling → sets user.referred_by, bumps referrer.referral_count
  → JWT tokens issued, geo-stamp last_login, UserProfileSerializer built
  → ActivityLog.log(action="register", ...)
  → Response 201 {"user": profile, "tokens": tokens}
```

**Simplified chain (as requested):**
```
Registration API (RegisterView)
  ↓
Serializer (RegisterSerializer)
  ↓
Manager (UserManager.create_user)
  ↓
Model.save() → generate_user_id() equivalent = _unique_win_uid() → _gen_win_uid()
  ↓
Database Save (INSERT authapp_user)
  ↓
Response (user profile + JWT tokens)
```

---

## 2. Affiliate ID Generation

### 2.1 Key finding: there is no dedicated Affiliate ID

An "Affiliate" is **just a `User` row with an attached `AffiliateProfile` row** (`authapp/models/affiliate_models.py:7-32`, `OneToOneField` to `User`). No separate ID generator, prefix, or charset exists for affiliates. Confirmed by an exhaustive grep for `AFF`, `affiliate_code`, `affiliate_uid`, `generate_`, `secrets.`, `uuid.` across the whole app.

Every identifier shown for an affiliate is borrowed from the underlying `User`:

| Displayed as | Actual source | Same generator as User ID? |
|---|---|---|
| `affiliate_uid` (`serializers/affiliate_wallet_serializers.py:64`) | `source="affiliate.user_uid"` | Yes — identical `_gen_win_uid()` output |
| `affiliate_id` | `source="affiliate.id"` | No — Django's default auto-increment PK on `User` |
| Affiliate's tracking/referral code | `User.referral_code` | Yes — identical `_gen_referral_code()` output |

### 2.2 How a User becomes an "Affiliate" (no ID generation happens here)

1. **Self-service:** `AffiliateApplyView.post()` (`views/affiliate_views.py:144-157`) — `AffiliateProfile.objects.create(user=request.user, is_active=False)`. Requires the user to already be a registered `User`.
2. **Admin grant:** `AdminGrantAffiliateView.post()` (`views/affiliate_views.py:355-398`) — `AffiliateProfile.objects.get_or_create(user=User.objects.get(id=user_id), ...)`.

Neither path calls any ID-generation function.

### 2.3 Execution flow

```
[Prior step] POST /api/auth/register/ → User.user_uid / User.referral_code already generated (see §1)

POST /api/affiliate/apply/  (authenticated)
  → AffiliateApplyView.post()                          [affiliate_views.py:144]
      → AffiliateProfile.objects.create(user=request.user, is_active=False)   [no ID generated — new int PK only]
  → Response 201 {affiliate_profile}   (identity surfaced later via user.user_uid / user.id)

-- or --

POST /api/admin-panel/affiliates/grant/  (admin)
  → AdminGrantAffiliateView.post()                     [affiliate_views.py:358]
      → AffiliateProfile.objects.get_or_create(user=User.objects.get(id=user_id), ...)
```

### 2.4 User ID vs. Affiliate ID — comparison table

| Aspect | User ID (`user_uid`) | "Affiliate ID" |
|---|---|---|
| Dedicated generator? | Yes, `_gen_win_uid()` | **No** — reuses `User.user_uid` |
| Prefix | `"WIN"` | n/a (inherited) |
| Random charset | 2 letters + 2 digits | n/a (inherited) |
| Length | 7 chars | n/a (inherited) |
| Uniqueness check | Explicit `.exists()` retry loop | n/a (inherited; `User.user_uid` already unique) |
| ID space | 67,600 | n/a |
| Field | `authapp_user.user_uid` | none — `AffiliateProfile` has only an int PK, no string ID field |

### 2.5 Referral code — the other generated ID, for completeness

`_gen_referral_code()` (`user_model.py:32-33`): 8 random chars from `A-Z0-9` (36-char alphabet), **no** uniqueness retry loop (only the DB `unique=True` constraint backstops it — asymmetric vs. `user_uid`'s explicit loop). Space: 36⁸ ≈ 2.82 trillion — effectively non-exhaustible at this app's scale. Field: `authapp_user.referral_code`, `CharField(max_length=12, unique=True, blank=True, db_index=True)`.

### 2.6 Other identifier/reference generators in the app (for completeness, not User/Affiliate IDs)

| File:Line | Function | Format | Used for |
|---|---|---|---|
| `authapp/otp/otp_utils.py:40` | `generate_otp()` | 6-digit numeric, `random.randint` | Login/register/reset OTP |
| `authapp/utils/account_number.py:41` | `generate_account_number()` | `{2-letter prefix}{DDMMYY}{SS}{ms}` | Wallet account numbers (C/NC/O/RP) |
| `authapp/services/super_admin_service.py:28` | inline | `{prefix}-{DDMMYYHHMMSS}-{uuid4().hex[:6].upper()}` | Admin wallet-adjustment references |
| `authapp/models/affiliate_wallet_models.py:101` | `_gen_affiliate_wallet_ref()` | `{TXN_PREFIX}{DDMMYYHHMMSSmmm}` | `AffiliateWalletTransaction.reference` (5× IntegrityError retry) |
| `authapp/models/affiliate_wallet_models.py:155` | `_gen_withdrawal_reference()` | `WD-YYYYMMDD-HHMMSSmmm` | `AffiliateWithdrawalRequest.request_reference` |
| `authapp/models/two_factor_models.py:37` | backup-code generator | `secrets.choice(alphabet)` — the **only CSPRNG use** in the app | 2FA backup codes |
| Various wallet/casino/super-admin models | `models.UUIDField(default=uuid.uuid4)` | UUID4 | Primary keys of `WalletAccount`, `WalletTransaction`, `CasinoWalletAccount`, `CasinoWalletTransaction`, `WalletValidationLog`, `SuperAdminTransaction` |

---

## 3. Complete Database Architecture

**App label:** `authapp`. **Table naming:** Django default — `authapp_<lowercase model class name>` (no model overrides `Meta.db_table`). **Default PK:** `BigAutoField id`, except 6 models that use a `UUIDField` PK (noted below). **Migrations:** 40 files, `0001_initial.py` → `0040_wallet_request_methods_bank_cash_crypto.py`, standard Django ORM migrations, no squashing.

> Note: the user's example mapping (`users table`, `wallet table`, `offline_transactions table`, `rewards table`, `otp table`) doesn't match this schema's actual naming — see §4 for the real table names per data type.

67 model classes across 24 files. Full inventory, grouped by subsystem:

### 3.1 User & Auth core (`user_model.py`)

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_user` | `User` | `id` | `user_uid`(u), `email`(u), `name`, `country`, `phone`, `vip_level`, `wallet_balance`, `bonus_balance`, `total_deposited/withdrawn/won`, `rolling_points_total`, `referral_code`(u), `referral_count`, `kyc_status`, `is_verified/active/staff`, `date_joined`, `last_login*` | `referred_by → User` (self, SET_NULL) |
| `authapp_adminprofile` | `AdminProfile` | `id` | `role`, `mobile`, `department`, `can_edit_users/manage_finance/approve_kyc/send_notifs/manage_vip`, `is_active`, `theme_preference` | `user → User` (O2O, CASCADE) |
| `authapp_otprecord` | `OTPRecord` | `id` | `email`, `phone`, `otp`, `mode`, `is_used`, `expires_at` | none |
| `authapp_activitylog` | `ActivityLog` | `id` | `action`(60+ choices), `description`, `amount`, `cr_dr`, `wallet_type`, `before/after_balance`, `meta`(JSON), `ip_address` | `actor → User`(SET_NULL), `target_user → User`(SET_NULL) |
| `authapp_pendingadmincreation` | `PendingAdminCreation` | `id` | `email`(u), `password`, `role`, `otp`, `expires_at` | `initiated_by → User`(SET_NULL) |

*u = unique constraint*

### 3.2 Affiliate subsystem

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_affiliateprofile` | `AffiliateProfile` | `id` | `commission_rate`, `is_active`, `total_earned/paid`, `can_view_player_transactions` | `user → User`(O2O,CASCADE), `approved_by → User`(SET_NULL) |
| `authapp_referralcommission` | `ReferralCommission` | `id` | `source_transaction_ref`, `deposit_amount`, `commission_rate`, `amount`, `status`(pending/paid) | `affiliate → User`(CASCADE), `referred_user → User`(CASCADE) |
| `authapp_affiliateclicklog` | `AffiliateClickLog` | `id` | `ip_address`, `user_agent`, `landing_path` | `affiliate → User`(CASCADE) |
| `authapp_affiliateloginlog` | `AffiliateLoginLog` | `id` | `ip_address` | `affiliate → User`(CASCADE) |

### 3.3 Affiliate wallet / withdrawals

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_affiliatewithdrawalmethodconfig` | `AffiliateWithdrawalMethodConfig` | `id` | `code`(u), `label`, `is_enabled`, `field_schema`(JSON) | none |
| `authapp_affiliatewalletaccount` | `AffiliateWalletAccount` | `id` | `balance`, `locked_for_withdrawal` | `user → User`(O2O,CASCADE) |
| `authapp_affiliatewallettransaction` | `AffiliateWalletTransaction` | `id` | `txn_type`, `amount`, `balance_before/after`, `reference`(u) | `wallet → AffiliateWalletAccount`(CASCADE), `withdrawal_request → AffiliateWithdrawalRequest`(SET_NULL) |
| `authapp_affiliatewithdrawalrequest` | `AffiliateWithdrawalRequest` | `id` | `request_reference`(u), `amount`, `status`, `priority` | `affiliate → User`(CASCADE), `method → AffiliateWithdrawalMethodConfig`(PROTECT), `reviewed_by → User`(SET_NULL) |
| `authapp_affiliatewithdrawalpaymentdetail` | `AffiliateWithdrawalPaymentDetail` | `id` | `details`(JSON) | `request → AffiliateWithdrawalRequest`(O2O,CASCADE), `method → AffiliateWithdrawalMethodConfig`(PROTECT) |
| `authapp_affiliatewithdrawalstatushistory` | `AffiliateWithdrawalStatusHistory` | `id` | `from/to_status`, `note` | `request → AffiliateWithdrawalRequest`(CASCADE), `changed_by → User`(SET_NULL) |
| `authapp_affiliatewithdrawalsettings` | `AffiliateWithdrawalSettings` | `1` (singleton) | `is_withdrawal_enabled`, `minimum_withdrawal_amount` | none |

### 3.4 Casino & Casino Wallets

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_casino` | `Casino` | `id` | `country`, `location`, `name`, `is_active` (unique_together country+name) | none |
| `authapp_casinowalletaccount` | `CasinoWalletAccount` | **UUID** | `casino_name`, `country`, `wallet_type`(C/NC/O), `balance`, `rolling_points` | `user → User`(CASCADE) |
| `authapp_casinowallettransaction` | `CasinoWalletTransaction` | **UUID** | `unified_ref`, `casino_name`, `wallet_type`, `transaction_type`, `amount`, `balance_before/after` | `user → User`(CASCADE), `performed_by → User`(SET_NULL) |

### 3.5 Core Wallet (fiat/cash ledger)

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_walletaccount` | `WalletAccount` | **UUID** | `wallet_type`(C/NC/O/RP), `wallet_account_number`(u), `balance` | `user → User`(CASCADE), `updated_by → User`(SET_NULL) |
| `authapp_wallettransaction` | `WalletTransaction` | **UUID** | `transaction_type`(16 codes), `amount`, `balance_before/after`, `transaction_reference`(u), `validation_status` | `user → User`(CASCADE), `wallet → WalletAccount`(CASCADE), `performed_by → User`(SET_NULL) |
| `authapp_walletvalidationlog` | `WalletValidationLog` | **UUID** | `entered/expected_amount`, `is_valid`, `rejection_reason` | `user → User`(CASCADE), `validated_by → User`(SET_NULL), `transaction → WalletTransaction`(O2O,SET_NULL) |
| `authapp_bonusconfig` | `BonusConfig` | `id` | `vip_level`, `bonus_type`, `amount` (unique_together) | `updated_by → User`(SET_NULL) |

### 3.6 Wallet Request queue (deposit/withdrawal requests, distinct from admin-direct wallet edits)

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_walletrequestmethodconfig` | `WalletRequestMethodConfig` | `id` | `code`(u), `label`, `is_enabled` | none |
| `authapp_depositrequest` | `DepositRequest` | `id` | `request_reference`(u), `amount`, `status`, `payment_reference` | `user → User`(CASCADE), `casino → Casino`(SET_NULL), `method → WalletRequestMethodConfig`(PROTECT), `wallet_transaction → WalletTransaction`(SET_NULL), `reviewed_by → User`(SET_NULL) |
| `authapp_withdrawalrequest` | `WithdrawalRequest` | `id` | `request_reference`(u), `wallet_type`, `amount`, `status` | same FK shape as `DepositRequest` |
| `authapp_depositrequeststatushistory` | `DepositRequestStatusHistory` | `id` | `from/to_status` | `request → DepositRequest`(CASCADE), `changed_by → User`(SET_NULL) |
| `authapp_withdrawalrequeststatushistory` | `WithdrawalRequestStatusHistory` | `id` | `from/to_status` | `request → WithdrawalRequest`(CASCADE), `changed_by → User`(SET_NULL) |

### 3.7 Super Admin ledger

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_adminwallet` | `AdminWallet` | `1` (singleton) | `cash/non_cash/otp_balance` | `updated_by → User`(SET_NULL) |
| `authapp_superadmintransaction` | `SuperAdminTransaction` | **UUID** | `txn_type`, `wallet_type`, `amount`, `admin_wallet_before/after`, `reference`(u) | `performed_by → User`(SET_NULL), `target_user → User`(SET_NULL) |

### 3.8 KYC, Notifications, Offline Deposits, Responsible Gambling, Rewards

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_kycsubmission` | `KYCSubmission` | `id` | `kyc_type`, `document_type/number`, `doc_front/back`, `selfie`, `status`, `geo_*` | `user → User`(O2O,CASCADE), `reviewed_by → User`(SET_NULL) |
| `authapp_notification` | `Notification` | `id` | `title`, `message`, `icon`, `is_read` | `user → User`(CASCADE) |
| `authapp_offlinedepositlog` | `OfflineDepositLog` | `id` | `entry_type`(cash/rolling_points), `slip_number`(u), `total_deposited/won/withdrawn`, `rolling_points_added/total` | `user → User`(CASCADE), `recorded_by → User`(SET_NULL) |
| `authapp_responsiblegamblingsettings` | `ResponsibleGamblingSettings` | `id` | `deposit_limit_daily/weekly/monthly`, `cooling_off_until`, `self_exclusion_until` | `user → User`(O2O,CASCADE) |
| `authapp_reward` | `Reward` | `id` | `type`, `amount`, `is_claimed`, `is_locked` | `user → User`(CASCADE) |

### 3.9 Gift / Level / Points

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_usergift` | `UserGift` | `id` | `amount`, `gift_type`(20 choices), `status`(pending/claimed/expired/revoked), `expires_at` | `user → User`(CASCADE), `created_by → User`(SET_NULL) |
| `authapp_userlevel` | `UserLevel` | `id` | `level`, `points` | `user → User`(O2O,CASCADE), `updated_by → User`(SET_NULL) |
| `authapp_pointslog` | `PointsLog` | `id` | `points_added/before/after`, `level_before/after`, `leveled_up`, `reason` | `user → User`(CASCADE), `recorded_by → User`(SET_NULL) |

### 3.10 Spin (daily-login wheel)

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_spinconfig` | `SpinConfig` | `id` | `reward_type`(13 choices), `value`, `weight`, `is_jackpot/active` | `tournament → PokerTournament`(SET_NULL), `event → CasinoEvent`(SET_NULL) |
| `authapp_spinsettings` | `SpinSettings` | `1` (singleton) | `max_spins_per_month`, `jackpot_every_n_users` | none |
| `authapp_spinglobalcounter` | `SpinGlobalCounter` | `1` (singleton) | `eligible_user_count` | none |
| `authapp_spinhistory` | `SpinHistory` | `id` | `reward_type/label_snapshot`, `value_snapshot`, `is_jackpot_win`, `month_key` | `user → User`(CASCADE), `config → SpinConfig`(SET_NULL) |

### 3.11 Events, Poker, Promotions

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_casinoevent` | `CasinoEvent` | `id` | `name`, `country`, `event_date`, `status`, `is_active` | `created_by → User`(SET_NULL) |
| `authapp_eventticketrequest` | `EventTicketRequest` | `id` | `status`(new/contacted/closed) (unique_together event+user) | `event → CasinoEvent`(CASCADE), `user → User`(CASCADE) |
| `authapp_pokertournament` | `PokerTournament` | `id` | `name`, `casino_name`, `event_date`, `prize_pool`, `buy_in`, `status` | `created_by → User`(SET_NULL) |
| `authapp_pokerregistration` | `PokerRegistration` | `id` | `status` (unique_together tournament+user) | `tournament → PokerTournament`(CASCADE), `user → User`(CASCADE) |
| `authapp_promotion` | `Promotion` | `id` | `country`, `casino_name`, `title`, `benefits`(JSON), `is_active` | `created_by → User`(SET_NULL) |
| `authapp_promotiongalleryimage` | `PromotionGalleryImage` | `id` | `image`, `order` | `promotion → Promotion`(CASCADE) |

### 3.12 Landing/CMS content (13 models, no `User` FKs at all)

`authapp_landingsettings`(singleton), `authapp_herostat`, `authapp_whychooseusfeature`, `authapp_trustbadge`, `authapp_giftitem`, `authapp_giftstep`, `authapp_viptier`, `authapp_viptierbenefit`(FK→`VipTier`), `authapp_testimonial`, `authapp_destination`, `authapp_destinationmedia`(FK→`Destination`), `authapp_vipserviceimage`, `authapp_tourpackage`. Pure CMS content for the public marketing site — order-controlled lists with `is_active` flags.

### 3.13 Support, Two-Factor, Location, Registration

| Table | Model | PK | Key columns | FKs |
|---|---|---|---|---|
| `authapp_supportsettings` | `SupportSettings` | `1` (singleton) | `enabled`, `translation_provider`, `default/fallback_language` | none |
| `authapp_supportticket` | `SupportTicket` | `id` | `subject`, `message`, `status`, `admin_reply`, translation fields | `user → User`(CASCADE) |
| `authapp_twofactorauth` | `TwoFactorAuth` | `id` | `secret`, `is_enabled`, `confirmed_at` | `user → User`(O2O,CASCADE) |
| `authapp_twofactorbackupcode` | `TwoFactorBackupCode` | `id` | `code_hash`, `used_at` | `two_factor → TwoFactorAuth`(CASCADE) |
| `authapp_supportedlocation` | `SupportedLocation` | `id` | `name`, `country_code`, `is_active` | none |
| `authapp_registration` | `Registration` | `id` | `full_name`, `destination`, `package`, `whatsapp_number`, geo fields | none (standalone lead table) |

### 3.14 Non-default primary keys (UUID instead of BigAutoField)

`CasinoWalletAccount`, `CasinoWalletTransaction`, `WalletAccount`, `WalletTransaction`, `WalletValidationLog`, `SuperAdminTransaction` — all `UUIDField(default=uuid.uuid4, editable=False)`.

### 3.15 Singleton tables (pk forced to 1)

`LandingSettings`, `SpinSettings`, `SpinGlobalCounter`, `AdminWallet`, `SupportSettings`, `AffiliateWithdrawalSettings` — each has a custom `save()`/`load()`/`get()` pattern forcing a single row.

---

## 4. Data Storage Mapping

```
Users                     → authapp_user
Admin/Staff profiles      → authapp_adminprofile
Affiliate identity        → authapp_affiliateprofile (+ borrows authapp_user.user_uid/referral_code)
Affiliate wallet          → authapp_affiliatewalletaccount / authapp_affiliatewallettransaction
Affiliate withdrawals     → authapp_affiliatewithdrawalrequest (+ ...paymentdetail, ...statushistory, ...settings)
Casino Wallet (per-casino)→ authapp_casinowalletaccount / authapp_casinowallettransaction
Cash/Bonus/OTP/RP Wallet  → authapp_walletaccount / authapp_wallettransaction / authapp_walletvalidationlog
Deposit/Withdrawal queue  → authapp_depositrequest / authapp_withdrawalrequest (+ ...statushistory tables)
Admin "house" ledger      → authapp_adminwallet / authapp_superadmintransaction
Offline (in-person) txns  → authapp_offlinedepositlog
Rewards                   → authapp_reward
Gifts / bonuses           → authapp_usergift
VIP level & points        → authapp_userlevel / authapp_pointslog
Daily spin wheel          → authapp_spinconfig / authapp_spinhistory / authapp_spinsettings / authapp_spinglobalcounter
Events                    → authapp_casinoevent / authapp_eventticketrequest
Poker                     → authapp_pokertournament / authapp_pokerregistration
Promotions                → authapp_promotion / authapp_promotiongalleryimage
Landing page CMS content  → authapp_landingsettings, authapp_herostat, authapp_whychooseusfeature,
                             authapp_trustbadge, authapp_giftitem, authapp_giftstep, authapp_viptier,
                             authapp_viptierbenefit, authapp_testimonial, authapp_destination,
                             authapp_destinationmedia, authapp_vipserviceimage, authapp_tourpackage
KYC documents (metadata)  → authapp_kycsubmission
KYC document files        → media/kyc/  (see below)
Email/SMS OTP              → authapp_otprecord
2FA (Super Admin)         → authapp_twofactorauth / authapp_twofactorbackupcode
Support tickets           → authapp_supportticket / authapp_supportsettings
Responsible gambling      → authapp_responsiblegamblingsettings
Notifications             → authapp_notification
Activity / audit log      → authapp_activitylog
Marketing lead form       → authapp_registration   (⚠ NOT user signup — see correction banner)
Supported locations       → authapp_supportedlocation
Casino catalog            → authapp_casino
Images/avatars            → media/avatars/
Event images               → media/events/
KYC uploads                → media/kyc/
Landing/promo images       → media/landing/, media/promotions/
Poker images                → media/poker/
Compiled frontend assets   → jackpotsworld_frontend_dist/ (served by Whitenoise)
Static (collected) files   → staticfiles/
```

All uploaded files (`ImageField`/`FileField`) are stored on the **local EC2 instance disk** under `MEDIA_ROOT` (`Win365Jackpot-Backend-main/media/`), served via a direct `django.views.static.serve` route — **not S3**. See §10 and §14 for the implications.

---

## 5. SQL / ORM Query Patterns

The application uses the Django ORM exclusively — **no raw SQL** was found anywhere in `authapp/` (`.raw(`, `cursor.execute(`, string-interpolated queries all absent). Below are the representative query shapes per major API family; "SQL" here means the SQL Django's ORM generates for that call pattern.

| API area | Operation | ORM call (representative) | Effective SQL shape | Indexes used | Notes |
|---|---|---|---|---|---|
| Register | INSERT | `User.objects.create_user(...)` | `INSERT INTO authapp_user (...)` | PK, unique(`email`,`user_uid`,`referral_code`) | Triggers 4× wallet `INSERT` via signal |
| Login | SELECT | `User.objects.get(email=...)` | `SELECT * FROM authapp_user WHERE email=%s` | `email` (db_index+unique) | Cache-backed lockout check precedes this |
| Admin Users list | SELECT+ANNOTATE | `User.objects.filter(is_staff=False).annotate(is_affiliate=Exists(...)).order_by("-date_joined")` | `SELECT ..., EXISTS(SELECT 1 FROM authapp_affiliateprofile WHERE user_id=authapp_user.id) AS is_affiliate FROM authapp_user WHERE is_staff=0 ORDER BY date_joined DESC LIMIT 10 OFFSET n` | `date_joined` (db_index), correlated subquery on `affiliateprofile.user_id` | Single query, no N+1 — see §6 |
| Admin Users search | SELECT (OR) | `.filter(Q(email__icontains=q) \| Q(name__icontains=q) \| Q(phone__icontains=q) \| Q(user_uid__icontains=q))` | `WHERE email LIKE '%q%' OR name LIKE '%q%' OR ...` | **none usable** — leading-wildcard LIKE can't use btree indexes | Full scan when searching |
| Wallet transactions | SELECT+ORDER | `WalletTransaction.objects.filter(user=u).order_by("-created_at")` | indexed on `(user,created_at)` | `authapp_wallettransaction_user_id_created_at_idx` | Paginated |
| Admin transactions | SELECT+FILTER | `WalletTransaction.objects.filter(transaction_type=..., created_at__range=...)` | uses `(transaction_type,created_at)` composite index | | |
| Admin wallet update | UPDATE (atomic) | `AdminWallet.debit()` + `WalletAccount.balance = F(...)+amount; .save()` inside `transaction.atomic()` | `UPDATE authapp_adminwallet SET cash_balance=... WHERE id=1` + `UPDATE authapp_walletaccount SET balance=... WHERE id=...` | PK | Wrapped in DB transaction to keep before/after balances consistent |
| Affiliate dashboard | SELECT+AGGREGATE | `ReferralCommission.objects.filter(affiliate=u).aggregate(Sum("amount"))`, `.values("status").annotate(Count(...))` | `SELECT SUM(amount) ... GROUP BY status` | `(affiliate,status)` composite index | |
| KYC review | UPDATE | `KYCSubmission.objects.filter(pk=pk).update(status=..., reviewed_by=..., reviewed_at=...)` | single-row UPDATE | PK | Also updates `User.kyc_status` in the same view |
| Spin play | SELECT (weighted) + INSERT | `SpinConfig.objects.filter(is_active=True)` then Python-side weighted random pick, `SpinHistory.objects.create(...)` | | `is_jackpot`,`is_active` db_index | Whole operation wrapped in `transaction.atomic()` to keep `SpinGlobalCounter` consistent |
| Landing CMS (public) | SELECT | `.filter(is_active=True).order_by("order")` | | `is_active` db_index on every landing model | Cheap, cache-friendly (rarely changes) |
| Support tickets (admin) | SELECT+JOIN | `SupportTicket.objects.select_related("user").order_by("-created_at")` (where used) | LEFT JOIN authapp_user | `(user,status)` | |

**General optimization notes:**
- Every high-traffic table that's filtered/ordered by admins has explicit `Meta.indexes` (confirmed for `User`, `WalletTransaction`, `ActivityLog`, `ReferralCommission`, `AffiliateWithdrawalRequest`, `DepositRequest`/`WithdrawalRequest`, `Notification`, `SpinHistory`, etc.) — this is a generally well-indexed schema for its filtered fields.
- The one clear anti-pattern is `icontains` OR-chains on the admin search endpoints (`admin_views.py:209-215` and equivalents elsewhere) — these can't use btree indexes and force a table scan proportional to `authapp_user` size. At current scale this is fine; will degrade linearly as the user table grows into the hundreds of thousands.
- No `GROUP BY`/aggregate-heavy analytics endpoints were found beyond simple `.aggregate()`/`.annotate()` calls on already-indexed columns — no obvious runaway aggregation query.

---

## 6. Admin Users Page — Performance Investigation

### 6.1 Root cause ranking (most → least impactful)

1. **Frontend N+1 fan-out** (dominant cause) — `Win365Jackpot-Frontend-main/src/admin/tabs/UsersTab.jsx:184-229`. After the paginated 10-row list loads, the page fires **3 extra HTTP requests per visible row** — `fetchUserLevel`, `fetchMainWallets`, `fetchCasinoWallets` — batched 3-at-a-time (`BATCH = 3`), for **31 total HTTP requests** on one page load, each a full JWT-authenticated round trip.
2. **Backend per-user endpoints amplify #1** — `AdminUserWalletAccountsView` (`views/wallet_views.py:349-398`) does up to **6 DB queries per call** (1 user lookup + 4× `get_or_create` existence checks for C/NC/O/RP wallets + 1 final select) — and this runs on *every* page load for *every* row, even when the 4 wallet rows already exist. `AdminUserLevelView` (`views/gift_level_views.py:414-429`) similarly does a `get_or_create` per call.
3. **Remote MySQL host** (`backend/settings.py:141-161`, shared GoDaddy-style hosting per the code's own comment) — turns ~100 queries spread across 31 HTTP requests into real additive network latency rather than negligible local I/O.
4. **Minor:** unindexed `icontains` search filter (`admin_views.py:209-215`) — only affects the search case, not default load.

### 6.2 What is *not* the problem (verified clean)

- **List endpoint pagination:** present and correctly sized (`page_size = 10`, `admin_views.py:190-192`).
- **List endpoint queryset:** no N+1 — `is_affiliate` uses a single `Exists()` subquery annotation, not per-row queries.
- **List serializer:** `UserProfileSerializer` is flat — all fields are direct columns on `User` (denormalized `wallet_balance`, `bonus_balance`, etc.), no nested/related serializers, no `SerializerMethodField` hitting the DB.
- **Indexes on `User`:** present and migrated (`vip_level+is_active`, `kyc_status+date_joined`, `date_joined`, `country+is_active`, plus per-field indexes).
- **Frontend re-fetch triggers:** search only fires on button/Enter, not per keystroke; `useEffect` is correctly dependency-gated; table is capped at 10 rows so no virtualization gap.

### 6.3 Execution timeline (approximate, qualitative — no live profiling was run)

```
Browser
  ↓  (render UsersTab, mount)
React (useEffect → loadUsers(page))
  ↓  1 request
API: GET /api/admin-panel/users/?page=1&page_size=10
  ↓
Django → AdminUserListView.get()
  ↓
Serializer: UserProfileSerializer(page, many=True)   — flat, cheap
  ↓
Database: 1 query (indexed ORDER BY date_joined DESC LIMIT 10) — fast even remote
  ↓
Response: list renders immediately (shimmer placeholders for balances)
  ↓
React: background enrichment loop starts
  ↓  batches of 3, 4 sequential rounds for 10 rows
API: 30 more requests — 10× GET /users/{id}/level/, 10× GET /wallet/accounts/user/{id}/, 10× GET /wallet/casino-balances/user/{id}/
  ↓  each round-trips to MySQL over the network; AdminUserWalletAccountsView alone does up to 6 DB queries
Database: ~90-100 additional queries total across all 30 requests
  ↓
React: setUsers(...) called once per completed user → up to 10 full table re-renders
  ↓
Table fully "settled" only after the slowest of the 4 sequential enrichment batches completes
```

The list itself (step 1) is fast; the perceived slowness comes from the ~4 sequential batches of enrichment calls that follow it, each gated by network + multi-query round trips to a remote DB host.

---

## 7. Performance Improvement Suggestions (not implemented)

*Suggestions only — nothing below has been applied.*

1. **Collapse the 3 per-user enrichment calls into the list response itself.** Add `select_related`/`prefetch_related` + a couple of `annotate()`s (e.g. `Prefetch("wallets")`, `Prefetch("user_level")`, aggregate casino balance) to `AdminUserListView` so the 10-row page ships with everything in **one** query, eliminating all 30 extra HTTP round trips.
2. **Or, if enrichment must stay separate, batch it:** add one endpoint like `GET /api/admin-panel/users/bulk-wallets/?ids=1,2,3,...` that returns wallet/level/casino data for N users in a single call (`select_related`+`prefetch_related`, one query per model instead of one per user).
3. **Fix `AdminUserWalletAccountsView`'s per-call `get_or_create` loop** — only create missing wallet rows once at registration (already happens via the `post_save` signal, see §1.10); the admin view should be a pure read (`WalletAccount.objects.filter(user=user)`), not a 4× existence-check-and-maybe-insert on every view.
4. **Cache landing/CMS and rarely-changing config reads** (Redis or Django's cache framework) — `LandingSettings`, `SpinConfig`, `SupportSettings`, etc. don't need a DB hit on every request.
5. **Add DB connection pooling beyond `CONN_MAX_AGE`** if traffic grows — consider PgBouncer-equivalent for MySQL (ProxySQL) or moving to RDS with a managed proxy, since the current setup relies on Django's basic persistent-connection reuse against a remote host.
6. **Use `select_related`/`prefetch_related` proactively** wherever a serializer's `SerializerMethodField` walks a reverse FK (audit other admin list views the same way the Users page was audited here — `AdminTransactionListView`, `AdminAffiliateListView`, etc. weren't in scope for this specific investigation).
7. **Virtualize/paginate more aggressively** only if page sizes grow — not currently needed at `page_size=10`.
8. **Move media storage to S3 + CloudFront** (see §10/§14) — while not a Users-page-specific fix, avatar/KYC image loads inside the user detail panel would benefit from CDN-backed delivery instead of local-disk/Whitenoise serving.
9. **Background/async heavy admin actions** (CSV exports in `AdminDepositRequestExportView`/`AdminWithdrawalRequestExportView`) via a task queue (Celery + Redis) if export sizes grow, so they don't block a web worker.
10. **Debounce/memoize the frontend table** — wrap row rendering in `React.memo` keyed by user id so a `setUsers` update for one enriched row doesn't re-render all 10 rows each time.

---

## 8. Manual Inspection SQL

Run these via `python manage.py dbshell`, a MySQL client (MySQL Workbench/DBeaver), or Django shell (`python manage.py shell`). Adjust `LIMIT` as needed.

```sql
-- View all users
SELECT id, user_uid, email, name, vip_level, wallet_balance, is_active, date_joined
FROM authapp_user
ORDER BY date_joined DESC;

-- View one user (by generated ID)
SELECT * FROM authapp_user WHERE user_uid = 'WINDN86';

-- View all affiliates (User rows with an AffiliateProfile)
SELECT u.id, u.user_uid, u.email, u.name, ap.commission_rate, ap.is_active, ap.total_earned, ap.total_paid
FROM authapp_user u
JOIN authapp_affiliateprofile ap ON ap.user_id = u.id;

-- View wallets for one user
SELECT wallet_type, wallet_account_number, balance, updated_at
FROM authapp_walletaccount
WHERE user_id = (SELECT id FROM authapp_user WHERE user_uid = 'WINDN86');

-- View casino wallets
SELECT casino_name, wallet_type, balance, rolling_points
FROM authapp_casinowalletaccount
WHERE user_id = (SELECT id FROM authapp_user WHERE user_uid = 'WINDN86');

-- View wallet transactions (most recent first)
SELECT transaction_type, amount, balance_before, balance_after, transaction_reference, created_at
FROM authapp_wallettransaction
WHERE user_id = (SELECT id FROM authapp_user WHERE user_uid = 'WINDN86')
ORDER BY created_at DESC
LIMIT 50;

-- View rewards
SELECT * FROM authapp_reward WHERE user_id = (SELECT id FROM authapp_user WHERE user_uid = 'WINDN86');

-- View casino balances summary across all users for a casino
SELECT casino_name, wallet_type, SUM(balance) AS total_balance, COUNT(*) AS accounts
FROM authapp_casinowalletaccount
GROUP BY casino_name, wallet_type
ORDER BY total_balance DESC;

-- View promotions
SELECT id, country, casino_name, title, is_active FROM authapp_promotion ORDER BY country, "order";

-- View events
SELECT id, name, country, event_date, status, is_active FROM authapp_casinoevent ORDER BY event_date DESC;

-- Count users
SELECT COUNT(*) FROM authapp_user;

-- Count affiliates
SELECT COUNT(*) FROM authapp_affiliateprofile WHERE is_active = 1;

-- Count transactions
SELECT COUNT(*) FROM authapp_wallettransaction;

-- Show latest registrations
SELECT user_uid, email, name, date_joined
FROM authapp_user
ORDER BY date_joined DESC
LIMIT 20;

-- Show duplicate user_uid values (should always return 0 rows given the unique constraint —
-- useful as a sanity check / to catch pre-constraint legacy data)
SELECT user_uid, COUNT(*) AS cnt
FROM authapp_user
GROUP BY user_uid
HAVING COUNT(*) > 1;

-- Show duplicate referral codes (same sanity-check purpose)
SELECT referral_code, COUNT(*) AS cnt
FROM authapp_user
WHERE referral_code <> ''
GROUP BY referral_code
HAVING COUNT(*) > 1;

-- Show orphan wallet accounts (user_id pointing at a deleted/missing user — should be
-- impossible given CASCADE, but a useful integrity check)
SELECT wa.id, wa.user_id
FROM authapp_walletaccount wa
LEFT JOIN authapp_user u ON u.id = wa.user_id
WHERE u.id IS NULL;

-- Show orphan KYC submissions
SELECT k.id, k.user_id
FROM authapp_kycsubmission k
LEFT JOIN authapp_user u ON u.id = k.user_id
WHERE u.id IS NULL;
```

---

## 9. Delete Queries (Reference Only)

**⚠️ These are documentation only, provided for your own manual use — none of these have been executed as part of this analysis.** Always `SELECT` first to confirm the target row(s), and take a DB snapshot/backup before running any bulk delete on a production financial database. Several `ForeignKey`s use `on_delete=CASCADE` (see §3/§12), so deleting a `User` row cascades into wallets, transactions, gifts, KYC, notifications, etc. — deleting `User` rows is effectively irreversible without a backup.

```sql
-- Delete one user (⚠ cascades into every CASCADE-related child table listed in §12)
DELETE FROM authapp_user WHERE user_uid = 'WINDN86';

-- Delete one affiliate (only removes the AffiliateProfile row — the underlying User remains)
DELETE FROM authapp_affiliateprofile WHERE user_id = (SELECT id FROM authapp_user WHERE user_uid = 'WINDN86');

-- Delete one transaction
DELETE FROM authapp_wallettransaction WHERE transaction_reference = 'DAC-...';

-- Delete all transactions (⚠ irreversible ledger wipe — will break balance history/audit trail)
DELETE FROM authapp_wallettransaction;

-- Delete all rewards
DELETE FROM authapp_reward;

-- Delete all events
DELETE FROM authapp_casinoevent;

-- Delete all promotions
DELETE FROM authapp_promotion;

-- Delete all OTPs (safe to run periodically — OTPRecord rows are inherently short-lived)
DELETE FROM authapp_otprecord;

-- Delete everything except Super Admin
-- (Django's is_superuser flag identifies Super Admins; this keeps that user row and
--  everything CASCADE-linked to it, deletes all other User rows and their CASCADE children)
DELETE FROM authapp_user WHERE is_superuser = 0;
```

**Notes:**
- `DELETE` removes matching rows and preserves auto-increment counters; `TRUNCATE TABLE authapp_wallettransaction` would be faster for a full wipe but resets the auto-increment sequence and cannot be used where foreign keys reference the table (MySQL requires disabling `FOREIGN_KEY_CHECKS` or truncating child tables first).
- Any table with `on_delete=PROTECT` (e.g. `AffiliateWithdrawalMethodConfig`, `WalletRequestMethodConfig` referenced by requests) will **refuse** deletion while rows still reference it — you'd need to delete/reassign the referencing rows first.
- Prefer Django's `User.objects.filter(...).update(is_active=False)` (the app's own "ban" pattern, see `AdminUserDetailView.patch` in §11) over hard deletion for user-facing accounts, to preserve the financial audit trail.

---

## 10. AWS / Database Infrastructure

### 10.1 Database engine

**MySQL** (confirmed via `requirements.txt`: `PyMySQL==1.1.2`, and `backend/settings.py:117-162`: `'ENGINE': 'django.db.backends.mysql'`). Not PostgreSQL, not SQLite, not Aurora — plain MySQL, currently on **shared GoDaddy hosting** per an explicit code comment (not AWS RDS at present, despite the app itself running on AWS Elastic Beanstalk).

```python
DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.mysql',
        'NAME':     config('DB_NAME'),
        'USER':     config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST':     config('DB_HOST'),
        'PORT':     config('DB_PORT', default='3306', cast=int),
        'OPTIONS':  _DB_OPTIONS,          # utf8mb4 charset, optional ssl_ca
        'CONN_MAX_AGE': config('DB_CONN_MAX_AGE', default=60, cast=int),
        'CONN_HEALTH_CHECKS': True,
    }
}
```

### 10.2 Connection details

| Setting | Source | Notes |
|---|---|---|
| Host/Port/Name/User/Password | env vars via `python-decouple`'s `config()` | nothing hardcoded |
| SSL | `DB_SSL_CA` env var → `certs/global-bundle.pem` (AWS RDS CA bundle, present in repo) | only relevant if/when migrated to RDS |
| Connection pooling | `CONN_MAX_AGE` (default 60s persistent connections) + `CONN_HEALTH_CHECKS=True` | Django has no true pool; this is a lightweight substitute, since there's no ProxySQL/PgBouncer-equivalent layer in front of MySQL currently |
| Migration system | Django ORM migrations, `authapp/migrations/`, 40 files | run via `python manage.py migrate --noinput`, automated on every EB deploy (leader-only) |

### 10.3 AWS deployment

- **Platform:** Elastic Beanstalk, `Jackpotsworld-env`, region `ap-south-1` (Mumbai), Python 3.11 on Amazon Linux 2023 (`.elasticbeanstalk/config.yml`).
- **Deploy hooks** (`.ebextensions/01_django.config`, in order, `leader_only` unless noted): ensure DB exists → `migrate` → import data dump → `createcachetable` (DB-backed cache table used for throttling/lockout) → seed default admin accounts → `collectstatic` (runs on **every** instance, not leader-only).
- **ALLOWED_HOSTS trick:** `settings.py` queries the EC2 IMDSv2 metadata endpoint at boot to append the instance's private IP, so the ALB's direct health-check requests aren't rejected as `DisallowedHost`.
- **Storage location:** Media (`media/`) and collected static (`staticfiles/`) live on the **local EC2 instance's disk** — no S3 integration exists (`django-storages`/`boto3` are absent from `requirements.txt`). This means uploads (avatars, KYC docs) are **not** durable across instance replacement or horizontal scaling.
- **Backup strategy:** No in-repo backup/export script — only `scripts/import_dump.py` (import, not export). If backups exist, they're an operational/hosting-provider concern outside this repo (e.g. GoDaddy MySQL backups), not something Django or EB automates here. **This is a gap worth closing** given this is a real-money financial application — see §14.

---

## 11. API Documentation

Full endpoint inventory (89 view classes/functions across 20 URL modules). Grouped by feature area; `AllowAny` = public, `IsAuthenticated` = any logged-in user, `IsAdminUser`/`IsAdminOrSuperAdmin` = staff, `IsSuperAdmin` = superuser (+ IP allowlist), `IsAffiliate` = user with active `AffiliateProfile`.

### Auth (`auth_urls.py` + `otp/otp_views.py`)

| Method | Path | View | Auth |
|---|---|---|---|
| GET | `/api/auth/countries/` | `CountryListView` | AllowAny |
| POST | `/api/auth/register/` | `RegisterView` | AllowAny (throttled) |
| POST | `/api/auth/login/` | `LoginView` | AllowAny (throttled + Turnstile + lockout) |
| POST | `/api/auth/logout/` | `LogoutView` | IsAuthenticated |
| POST | `/api/auth/send-otp/` | `SendOTPView` | AllowAny (throttled) |
| POST | `/api/auth/verify-otp/` | `VerifyOTPView` | AllowAny (throttled) |
| POST | `/api/auth/forgot-password/` | `ForgotPasswordRequestView` | AllowAny (throttled) |
| POST | `/api/auth/reset-password/` | `ResetPasswordConfirmView` | AllowAny (throttled) |
| POST | `/api/auth/token/refresh/` | SimpleJWT `TokenRefreshView` | AllowAny |
| POST | `/api/auth/check-user/` | `CheckUserView` | AllowAny (throttled) |
| POST | `/api/auth/admin-login/` | `AdminLoginView` | AllowAny (throttled + lockout) |
| POST | `/api/auth/super-admin-login/` | `SuperAdminLoginView` | AllowAny (IP-allowlisted + throttled + lockout) |
| POST | `/api/auth/super-admin-verify-2fa/` | `SuperAdminVerify2FAView` | AllowAny (throttled) |

### Registration (lead-capture, not user accounts)

| Method | Path | View | Auth |
|---|---|---|---|
| POST | `/api/register/` | `register` | AllowAny |
| GET/GET/GET/DELETE | `/api/admin/registrations/`, `/stats/`, `/<pk>/` | `registration_list`/`registration_stats`/`registration_detail` | IsAdminUser |

### User (`user_urls.py`)

| Method | Path | View | Auth |
|---|---|---|---|
| GET | `/api/user/dashboard/` | `UserDashboardView` | IsAuthenticated |
| GET/PATCH | `/api/user/profile/` | `ProfileView` | IsAuthenticated |
| PATCH | `/api/user/avatar/` | `AvatarUpdateView` | IsAuthenticated |
| POST | `/api/user/change-password/` | `ChangePasswordView` | IsAuthenticated |
| GET | `/api/user/wallet/` | `UserWalletView` | IsAuthenticated |
| GET | `/api/user/activity/` | `UserActivityLogView` | IsAuthenticated |
| GET | `/api/user/notifications/` | `UserNotificationListView` | IsAuthenticated |
| POST | `/api/user/notifications/<pk>/read/`, `/read-all/` | `MarkNotificationReadView`/`MarkAllNotificationsReadView` | IsAuthenticated |
| GET | `/api/user/travel-history/` | `UserTravelHistoryView` | IsAuthenticated |
| GET | `/api/user/referral/` | `UserReferralView` | IsAuthenticated |
| POST/GET | `/api/kyc/submit/`, `/api/kyc/status/` | `UserKYCSubmitView`/`UserKYCStatusView` | IsAuthenticated |

### Two-Factor (Super Admin self-service)

`/api/super-admin/2fa/status|setup|confirm|disable|regenerate-backup-codes/` — all `IsAuthenticated + IsSuperAdmin`.

### Wallet (user) / Casino Wallet / Admin Wallet

| Method | Path | View | Auth |
|---|---|---|---|
| GET | `/api/wallet/balances/`, `/transactions/`, `/casino-balances/` | `UserWalletBalancesView` etc. | IsAuthenticated |
| GET | `/api/admin-panel/wallet/casino-wallets/` | `CasinoWalletBalanceView` | staff |
| GET | `/api/admin-panel/wallet/admin-balance/` | `AdminWalletBalanceView` | staff |
| GET | `/api/admin-panel/wallet/accounts/user/<id>/` | `AdminUserWalletAccountsView` | IsAdminUser+HasFinanceAccess |
| POST | `/api/admin-panel/wallet/update/` | `AdminWalletUpdateView` | IsAdminUser+HasFinanceAccess |
| GET | `/api/admin-panel/wallet/transactions/`, `/validations/` | list views | staff |
| GET/POST | `/api/admin-panel/bonus-config/` | `AdminBonusConfigView` | IsAdminUser+HasFinanceAccess |

### Admin KYC / Offline Deposits / Dashboard / Users / Staff (`admin_views.py`, `admin_kyc_views.py`, `admin_offline_deposit_views.py`)

| Method | Path | View | Auth |
|---|---|---|---|
| GET/POST | `/api/admin-panel/kyc/`, `/kyc/<pk>/update/` | `AdminKYCListView`/`AdminKYCUpdateView` | staff+capability |
| GET/POST | `/api/admin-panel/deposits/offline/`, `/history/`, `/casinos/`, `/check-slip/` | offline-deposit views | staff+`can_manage_finance` |
| GET | `/api/admin-panel/stats/` | `AdminStatsView` | IsAdminUser |
| GET/PATCH | `/api/admin-panel/me/theme/` | `AdminThemePreferenceView` | IsAdminUser |
| GET | `/api/admin-panel/users/` | `AdminUserListView` | IsAdminUser |
| GET/PATCH | `/api/admin-panel/users/<pk>/` | `AdminUserDetailView` | IsAdminUser |
| POST | `.../add-wallet/`, `.../add-bonus/`, `.../set-vip/` | wallet/bonus/vip actions | IsAdminUser + capability |
| GET/POST | `/api/admin-panel/transactions/`, `.../approve/` | transaction admin views | IsAdminUser |
| GET | `/api/admin-panel/logs/` / `/activity-logs/` | `AdminActivityLogView` | IsAdminUser |
| GET/POST/PATCH/DELETE | `/api/admin-panel/staff/...` | staff management | IsSuperAdmin |

### Super Admin (`super_admin_views.py`)

`/api/super-admin/wallet/balance|credit|debit|transfer|history/`, `/api/super-admin/stats/`, `/api/super-admin/admins/...` — all `IsSuperAdmin`/`IsAdminOrSuperAdmin`.

### Admin Gift, Gift Level, Landing, Location, Poker, Promotion, Reward, Spin, Support, Chat, Events, Affiliate, Affiliate Wallet, Wallet Request

Each of these families follows the same public-read / staff-write CRUD pattern:
- **Public GET** endpoints (`AllowAny`) for content the marketing site or logged-in players consume (`/api/events/`, `/api/poker/`, `/api/promotions/`, `/api/landing-settings/`, `/api/hero-stats/`, etc.).
- **`/api/admin-panel/<resource>/`** CRUD endpoints (`IsAdminOrSuperAdmin`) for the same resources, largely generated by a `_admin_crud_views()` factory in `landing_views.py` (12 CMS models × list+detail = 24 URL patterns) plus hand-written CRUD views for events/poker/promotions/spin-config/support.
- **User-facing action endpoints** requiring `IsAuthenticated`: `/api/gifts/`, `/api/gifts/<id>/claim/`, `/api/level/`, `/api/spin/status|wheel|play|history/`, `/api/rewards/`, `/api/rewards/<id>/claim/`, `/api/support/tickets/`, `/api/events/<id>/ticket/`, `/api/poker/<id>/register/`.
- **Affiliate self-service** (`IsAffiliate`): `/api/affiliate/dashboard|referrals|commissions|clicks|login-history/`, `/api/affiliate/wallet/...` (withdrawal creation/listing/cancel).
- **Admin affiliate management** (`IsAdminOrSuperAdmin`): `/api/admin-panel/affiliates/...`, `/api/admin-panel/affiliate-withdrawals/...` (approve/processing/reject/mark-paid/cancel lifecycle).
- **Wallet request queue** (deposits/withdrawals submitted by users, reviewed by admins with `HasFinanceAccess`): `/api/wallet/deposit-requests/...`, `/api/wallet/withdrawal-requests/...`, `/api/admin-panel/deposit-requests/...`, `/api/admin-panel/withdrawal-requests/...` — each with the same approve/processing/reject/paid/cancel lifecycle plus CSV export.

*(Full per-endpoint table with exact serializer names is available in the research transcript this document was generated from — condensed here for readability; ~89 endpoints total across all families.)*

### Known code-quality flags relevant to API documentation

- `authapp/urls.py` double-mounts `gift_level_urls` under `admin-panel/`, making a handful of gift/level routes reachable at two different paths.
- Several "admin" views declare only `IsAuthenticated` and do a manual `is_staff`/`_has_capability()` check in the method body instead of `permission_classes` — functionally equivalent but not visible from the class declaration alone (`admin_wallet_views.py`, `casino_wallet_views.py`, `wallet_views.py`'s admin views, `admin_kyc_views.py`, `admin_offline_deposit_views.py`, `gift_level_views.py`'s admin views).
- A few endpoints are stubs with no real persistence yet: `AdminCreateRewardView`, `AdminSendNotificationView`, `AdminCasinoVisitView`/`AdminCasinoVisitDeleteView`, `AdminStaffRequestDeleteView`.
- Dead code (defined, not wired to any URL): duplicate `AdminKYCListView`/`AdminKYCUpdateView`/`AdminOfflineDepositsView` inside `admin_views.py`; `NotificationListView`/`MarkNotificationsReadView`/`NotificationReadView` inside `reward_views.py`.

---

## 12. Model Relationships / ER Diagram

`User` (`authapp_user`) is the hub — nearly all 67 models reference it directly or transitively.

### 12.1 Textual relationship map

```
User (self) ── referred_by → User                                    [SET_NULL]

User ── 1:1 ──> AdminProfile, AffiliateProfile, AffiliateWalletAccount,
                KYCSubmission, UserLevel, ResponsibleGamblingSettings,
                TwoFactorAuth                                          [CASCADE]

User ── 1:N ──> ActivityLog(actor/target), Notification, OfflineDepositLog,
                UserGift, PointsLog, Reward, SpinHistory, SupportTicket,
                WalletAccount, WalletTransaction, WalletValidationLog,
                CasinoWalletAccount, CasinoWalletTransaction,
                DepositRequest, WithdrawalRequest,
                AffiliateClickLog, AffiliateLoginLog, ReferralCommission(×2 FKs),
                AffiliateWithdrawalRequest, EventTicketRequest, PokerRegistration
                                                                         [mostly CASCADE, "performed_by/reviewed_by/created_by" style audit FKs are SET_NULL]

WalletAccount ──1:N──> WalletTransaction ──1:1──> WalletValidationLog

Casino ──1:N──> DepositRequest, WithdrawalRequest                      [SET_NULL]

WalletRequestMethodConfig ──1:N──> DepositRequest, WithdrawalRequest   [PROTECT]

DepositRequest ──1:N──> DepositRequestStatusHistory                    [CASCADE]
WithdrawalRequest ──1:N──> WithdrawalRequestStatusHistory               [CASCADE]

AffiliateWalletAccount ──1:N──> AffiliateWalletTransaction             [CASCADE]
AffiliateWithdrawalRequest ──1:1──> AffiliateWithdrawalPaymentDetail   [CASCADE]
AffiliateWithdrawalRequest ──1:N──> AffiliateWithdrawalStatusHistory,
                                     AffiliateWalletTransaction         [CASCADE / SET_NULL]
AffiliateWithdrawalMethodConfig ──1:N──> AffiliateWithdrawalRequest,
                                          AffiliateWithdrawalPaymentDetail  [PROTECT]

AdminWallet(singleton) ──1:N──> SuperAdminTransaction (via performed_by/target_user → User, not a direct FK to AdminWallet itself)

PokerTournament ──1:N──> PokerRegistration                              [CASCADE]
CasinoEvent ──1:N──> EventTicketRequest                                 [CASCADE]
Promotion ──1:N──> PromotionGalleryImage                                [CASCADE]
VipTier ──1:N──> VipTierBenefit                                         [CASCADE]
Destination ──1:N──> DestinationMedia                                   [CASCADE]
TwoFactorAuth ──1:N──> TwoFactorBackupCode                              [CASCADE]

SpinConfig ──references──> PokerTournament, CasinoEvent (optional prize link) [SET_NULL]
SpinHistory ──references──> SpinConfig                                  [SET_NULL]
```

### 12.2 As requested — the specific chain

```
User
 ↓ (1:1 CASCADE)
Wallet (WalletAccount ×4 per user: C/NC/O/RP)
 ↓ (1:N CASCADE)
WalletTransaction
 ↓ (1:1 SET_NULL)
WalletValidationLog

User ↓ (1:1 CASCADE) UserLevel → (1:N) PointsLog
User ↓ (1:N CASCADE) Reward, UserGift
User ↓ (1:N CASCADE) CasinoWalletAccount ↓ (implicit, same user_id) CasinoWalletTransaction
User ↓ (1:1 CASCADE) AffiliateProfile
                        ↓ (via User FK, not AffiliateProfile FK) ReferralCommission
AffiliateProfile.user ↓ (1:1 CASCADE) AffiliateWalletAccount ↓ (1:N) AffiliateWalletTransaction
User ↓ (1:1 CASCADE) TwoFactorAuth ↓ (1:N CASCADE) TwoFactorBackupCode (Super Admin only)
User ↓ (1:N CASCADE) EventTicketRequest → CasinoEvent
User ↓ (1:N CASCADE) PokerRegistration → PokerTournament
User ↓ (implicit via Promotion.created_by, admin-authored) Promotion
```

**Note:** `ReferralCommission` and `AffiliateWithdrawalRequest` link to `User` directly (`affiliate` FK), not through `AffiliateProfile` — `AffiliateProfile` only carries the role/commission-rate metadata, not the relational hub for affiliate activity.

---

## 13. Code Execution Flow

### 13.1 General request lifecycle

```
Frontend (React, Win365Jackpot-Frontend-main/src/)
  ↓
Axios/fetch call (src/services/*.js, adminFetch helper)
  ↓  HTTP request with JWT Bearer token
Django URLs (backend/urls.py → authapp/urls.py → authapp/url_patterns/*.py)
  ↓
Middleware stack: WWWRedirectMiddleware → CorsMiddleware → SecurityMiddleware →
                  WhiteNoiseMiddleware → SessionMiddleware → CommonMiddleware →
                  CsrfViewMiddleware → AuthenticationMiddleware → MessageMiddleware →
                  XFrameOptionsMiddleware
  ↓
DRF View (authapp/views/*.py) — permission_classes / throttle_classes checked
  ↓
Serializer (authapp/serializers/*.py) — validation, field shaping
  ↓
(Optional) Service layer (authapp/services/*.py) — business logic for wallet/affiliate/notification operations
  ↓
Model layer (authapp/models/*.py) — ORM query/save, signals (authapp/signals.py) fire on create
  ↓
Database (MySQL) — INSERT/UPDATE/SELECT
  ↓
Response (JSON via DRF Response)
  ↓
Frontend rendering (React state update → re-render)
```

### 13.2 Example: money-movement flow (admin wallet update)

```
Frontend: AdminWalletTab → adminFetch POST /api/admin-panel/wallet/update/
  ↓
AdminWalletUpdateView.post()                         [views/admin_wallet_views.py]
  ↓ permission: IsAdminUser + HasFinanceAccess         [permissions/admin_role_permissions.py]
  ↓ validates against BonusConfig / WalletValidationLog
  ↓ transaction.atomic():
       AdminWallet.debit(...)          [models/super_admin_models.py — raises ValueError if insufficient funds]
       WalletAccount.balance = F(...) + amount; .save()
       WalletTransaction.objects.create(...)           [auto-generates transaction_reference]
       ActivityLog.log(action="wallet_credit", ...)
  ↓
notify_user(...)                                        [services/notification_service.py] → Notification row
  ↓
Response 200 {new balances}
  ↓
Frontend updates local wallet state, shows toast
```

---

## 14. Security Review

*Findings only — nothing has been changed. All improvements are suggestions.*

### 14.1 Authentication

- JWT via `rest_framework_simplejwt`: access token lifetime **24 hours**, refresh **30 days**, rotation + blacklist-after-rotation enabled. `token_blacklist` app installed; used explicitly on password reset (blacklists all `OutstandingToken`s for the user).
- **Suggestion:** 24h access-token lifetime is long for a real-money platform — a stolen access token stays valid up to a full day even after logout (logout only blacklists the *refresh* token). Consider shortening access-token TTL (e.g. 15–60 min) and relying on refresh rotation for longer sessions.

### 14.2 Password hashing

Django's default PBKDF2 hasher chain (no `PASSWORD_HASHERS` override found). Standard `AUTH_PASSWORD_VALIDATORS` (similarity, min-length, common-password, numeric) — no custom complexity validator visible at the settings level (registration serializer may add its own — not fully audited here).

### 14.3 CSRF

`CsrfViewMiddleware` active, `CSRF_TRUSTED_ORIGINS` env-configured, `CSRF_COOKIE_SECURE = not DEBUG`. Since the API is JWT-bearer authenticated (not session-cookie authenticated for the SPA), CSRF middleware mainly protects Django's own `/admin/` and any session-based paths — appropriate for this architecture.

### 14.4 SQL injection

**No raw SQL found anywhere** in `authapp/` — 100% ORM. No `.raw()`, no `cursor.execute()`, no string-interpolated queries. This is a clean bill of health on this specific vector.

### 14.5 Permissions

Layered, capability-flag-based permission classes (`admin_role_permissions.py`, `affiliate_permissions.py`, `super_admin_permissions.py`) — generally well-designed, fail-closed defaults. **Inconsistency noted:** some views use declarative `permission_classes`, others do manual `is_staff`/capability checks inline — functionally fine but harder to audit at a glance; worth standardizing.

### 14.6 Rate limiting

- Per-IP DRF throttles on sensitive auth endpoints (login, admin-login, OTP send/verify, register, check-user) — opt-in per view, no global default throttle.
- Custom per-account lockout (`utils/account_lockout.py`: 5 attempts / 15-minute window / 15-minute lockout), correctly using `DatabaseCache` in production (flagged explicitly in code comments as necessary since `LocMemCache` would be per-worker-process and under-protect in production).
- **Gap:** OTP *verify* has per-IP throttling but no per-account lockout (unlike login) — a distributed attacker (many IPs) could spray guesses against one target's live 6-digit OTP within its 10-minute window.

### 14.7 OTP security

- **Generation uses `random.randint`, not `secrets`** (`otp/otp_utils.py:40-42`) — not cryptographically secure. **Suggestion:** switch to `secrets.randbelow()`/`secrets.choice()` for a security-sensitive one-time code on a money platform.
- **OTPs stored in plaintext** in `OTPRecord` (contrast: 2FA backup codes are correctly hashed via `make_password`). **Suggestion:** hash OTPs the same way.
- 10-minute expiry, consumed-on-use — reasonable design otherwise.

### 14.8 Admin security

- Two parallel admin surfaces: Django's built-in `/admin/` (session-based, only 8 models registered, **not** covered by `SUPERADMIN_IP_ALLOWLIST` or the custom account-lockout) vs. the custom JWT-based admin panel (**is** covered by IP allowlist, lockout, throttling, optional 2FA). **Suggestion:** since the same superuser credentials work on both, either disable `/admin/` in production or wrap it with equivalent IP-allowlist protection.
- `SUPERADMIN_IP_ALLOWLIST` is re-checked on every Super Admin request (not just login) — good design, prevents a stolen token from working outside the allowlist. **Caveat:** client IP is derived from `X-Forwarded-For` without confirming the request actually transited the ALB — spoofable if the origin is ever reachable directly.
- Optional TOTP 2FA for Super Admin only (not regular Admins) — well-implemented (`pyotp`, HMAC-signed pending tokens with 5-min expiry, hashed backup codes).

### 14.9 Media storage

Uploads (avatars, KYC documents) are stored on local EC2 disk, not S3 — no durability guarantee across instance replacement/scaling, and KYC documents (sensitive PII) aren't behind any CDN/access-control layer beyond Django's own media-serving view. **Suggestion:** migrate to S3-backed storage (`django-storages`) with signed URLs for KYC docs specifically, given their sensitivity.

### 14.10 Summary of suggested improvements (priority order)

1. Switch OTP generation from `random` to `secrets`.
2. Add per-account rate limiting to OTP verify (mirror the login lockout pattern).
3. Hash stored OTPs instead of plaintext.
4. Shorten JWT access-token TTL or add an access-token revocation mechanism.
5. Lock down or IP-restrict Django's built-in `/admin/`.
6. Validate `X-Forwarded-For` only from a trusted proxy hop (or use a dedicated ALB header).
7. Move media (especially KYC docs) to S3 with signed URLs.
8. Add an explicit, tested DB backup/export procedure (currently only an *import* script exists).

---

## 15. Handover Summary

**What this backend is:** a single-Django-app (`authapp`) real-money casino/rewards platform with player accounts, multi-wallet ledgers (cash/bonus/OTP/rolling-points, per-casino wallets), an affiliate/referral program with its own withdrawal pipeline, a VIP level/points/spin-wheel gamification layer, KYC, support tickets, and a fairly large public marketing CMS (landing page, events, poker, promotions, testimonials, destinations) — all behind a JWT-authenticated DRF API, deployed on AWS Elastic Beanstalk against a MySQL database.

**Key things a new developer should internalize immediately:**
1. `User.user_uid` (`WIN`+4 random chars, 67,600-value space, no max-retry cap) is the player-facing ID; it doubles as the affiliate's public ID too — there is no separate affiliate identifier.
2. `/api/register/` is a marketing lead form, **not** account signup — real signup is `/api/auth/register/`.
3. Money movement always goes through `transaction.atomic()` blocks with before/after balance snapshots recorded on the transaction row itself (`WalletTransaction`, `CasinoWalletTransaction`, `SuperAdminTransaction`, `AffiliateWalletTransaction`) — a solid audit-trail pattern to preserve when extending this code.
4. The Users admin page's slowness is a frontend N+1 fan-out, not a backend indexing/pagination problem — fix at the API-shape level (batch endpoint or richer list serializer), not by adding more indexes.
5. Media/KYC files live on local disk, not S3 — a real durability and security gap on an AWS-hosted, real-money app; prioritize before scaling to multiple EC2 instances.
6. All money-adjacent admin endpoints are gated by `HasFinanceAccess`/`IsSuperAdmin`, but note several older view files check permissions manually rather than declaratively — read the method body, not just `permission_classes`, when auditing access control on those.

*Generated 2026-07-28 via full static code review of `Win365Jackpot-Backend-main/` and `Win365Jackpot-Frontend-main/`. No code was modified.*
