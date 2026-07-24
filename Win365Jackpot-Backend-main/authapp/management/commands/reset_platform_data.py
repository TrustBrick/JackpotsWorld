"""
authapp/management/commands/reset_platform_data.py
────────────────────────────────────────────────────────────────────────────
DESTRUCTIVE. Wipes every player/user account, wallet, transaction, KYC,
affiliate, support, and gamification record in the database, keeping only
the Super Admin and Admin accounts (identified below) and the data those
two accounts need to log in.

This command does not run itself as part of any deploy step, signal, or
migration — it must be invoked explicitly, and only by you:

    python manage.py reset_platform_data --dry-run   # preview counts only
    python manage.py reset_platform_data              # prompts for confirmation
    python manage.py reset_platform_data --yes         # skips the prompt

Preserved (untouched):
  * User rows where is_superuser=True, or with an AdminProfile whose role
    is "superadmin" or "admin" (see PRESERVED_ADMIN_ROLES below — widen
    this list first if staff roles like "support"/"finance"/"kyc_officer"
    should also count as "Admin" for your purposes).
  * Those users' AdminProfile and TwoFactorAuth/TwoFactorBackupCode rows
    (2FA is "authentication data required to log in").
  * Config / static-reference tables that aren't per-user or
    per-transaction: BonusConfig, SpinConfig, SpinSettings, Casino,
    SupportedLocation, landing/promotion/event/poker content,
    SupportSettings, etc. — none of these are touched.

Wiped completely (every row, including any that happen to belong to a
preserved admin — a back-office account isn't expected to carry its own
player wallet/transaction history, so nothing of value is lost there):
  * WalletTransaction, WalletValidationLog, CasinoWalletTransaction,
    SuperAdminTransaction, OfflineDepositLog, PointsLog — the actual
    "transaction data".
  * WalletAccount, CasinoWalletAccount, KYCSubmission, Reward,
    Notification, AffiliateProfile, ReferralCommission,
    AffiliateClickLog, AffiliateLoginLog, ResponsibleGamblingSettings,
    SpinHistory, UserGift, UserLevel, EventTicketRequest,
    PokerRegistration, SupportTicket — per-user data.
  * The actual uploaded files behind KYCSubmission (doc_front, doc_back,
    selfie, id_proof_file) and User.avatar are deleted from storage, not
    just their DB rows — Django never does this automatically on row
    delete, so skipping this step leaves KYC documents/avatars orphaned
    on disk with nothing in the DB referencing them.
  * ActivityLog, OTPRecord, PendingAdminCreation, Registration (the
    travel-package lead-capture form) — none of these are login
    credentials.
  * Singleton balances reset to zero for consistency once the
    transactions that produced them are gone: AdminWallet,
    SpinGlobalCounter.
  * Every non-preserved User row (deleting it cascades away anything
    still attached: AdminProfile for non-preserved staff roles,
    TwoFactorAuth, etc.)
  * On the *preserved* admin accounts, the denormalized wallet/VIP/
    referral summary fields on User (wallet_balance, bonus_balance,
    total_deposited, total_withdrawn, total_won, rolling_points_total,
    vip_level, vip_xp, referral_count, referral_earnings) are reset to
    their model defaults — these mirror transaction history, not login
    credentials. Identity/auth fields (email, password hash, user_uid,
    name, is_staff, is_superuser, referral_code) are left untouched.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from authapp.models import (
    User,
    OTPRecord,
    ActivityLog,
    PendingAdminCreation,
    WalletAccount,
    WalletTransaction,
    WalletValidationLog,
    CasinoWalletAccount,
    CasinoWalletTransaction,
    KYCSubmission,
    Reward,
    Notification,
    SpinHistory,
    SpinGlobalCounter,
)
from authapp.models.affiliate_models import (
    AffiliateProfile, ReferralCommission, AffiliateClickLog, AffiliateLoginLog,
)
from authapp.models.responsible_gambling_models import ResponsibleGamblingSettings
from authapp.models.offline_deposit import OfflineDepositLog
from authapp.models.support_ticket_models import SupportTicket
from authapp.models.gift_level_models import UserGift, UserLevel, PointsLog
from authapp.models.events_models import EventTicketRequest
from authapp.models.poker_models import PokerRegistration
from authapp.models.super_admin_models import AdminWallet, SuperAdminTransaction
from authapp.models.register_models import Registration
from authapp.utils.account_number import generate_account_number

PRESERVED_ADMIN_ROLES = ["superadmin", "admin"]

# Deleted in full, regardless of which user (if any) a row belongs to.
# Order matters: models are listed before anything they hold a CASCADE
# foreign key to (e.g. WalletTransaction before WalletAccount), so each
# .delete() is already an empty no-op by the time it reaches the parent.
_FULL_WIPE_MODELS = [
    WalletTransaction,
    WalletValidationLog,
    CasinoWalletTransaction,
    SuperAdminTransaction,
    OfflineDepositLog,
    PointsLog,
    ActivityLog,
    OTPRecord,
    PendingAdminCreation,
    Registration,
    WalletAccount,
    CasinoWalletAccount,
    Reward,
    Notification,
    AffiliateProfile,
    ReferralCommission,
    AffiliateClickLog,
    AffiliateLoginLog,
    ResponsibleGamblingSettings,
    SpinHistory,
    UserGift,
    UserLevel,
    EventTicketRequest,
    PokerRegistration,
    SupportTicket,
]

# Reset to these defaults on the *preserved* admin accounts only — these
# fields mirror transaction/gameplay history, not login credentials.
_USER_FIELDS_RESET_TO_DEFAULT = {
    "wallet_balance": 0,
    "bonus_balance": 0,
    "total_deposited": 0,
    "total_withdrawn": 0,
    "total_won": 0,
    "rolling_points_total": 0,
    "vip_level": 1,
    "vip_xp": 0,
    "referral_count": 0,
    "referral_earnings": 0,
}


def _preserved_users_queryset():
    return User.objects.filter(
        Q(is_superuser=True) | Q(admin_profile__role__in=PRESERVED_ADMIN_ROLES)
    ).distinct()


def _delete_files(queryset, *field_names):
    """
    Deletes the on-disk/storage-backed file for each FileField/ImageField
    named in field_names, for every row in queryset. Deleting a model row
    does NOT delete the file it points to (Django never does this
    automatically) — without this, uploaded KYC documents and avatars are
    left behind as orphaned files after their owning row is gone.
    Must run BEFORE the rows themselves are deleted, since the file path
    lives on the row.
    """
    count = 0
    for obj in queryset.iterator():
        for field_name in field_names:
            f = getattr(obj, field_name)
            if f:
                f.delete(save=False)
                count += 1
    return count


class Command(BaseCommand):
    help = (
        "DESTRUCTIVE. Deletes every user/transaction/KYC/affiliate/support/"
        "gamification record, keeping only Super Admin and Admin login "
        "credentials. See the module docstring for exactly what is kept "
        "vs. wiped. Always run with --dry-run first."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Print what would be kept/deleted without changing anything.",
        )
        parser.add_argument(
            "--yes", action="store_true",
            help="Skip the interactive confirmation prompt.",
        )

    def handle(self, *args, **options):
        preserved = _preserved_users_queryset()
        preserved_count = preserved.count()

        if preserved_count == 0:
            raise CommandError(
                "No Super Admin / Admin account found — refusing to run, "
                "this would leave the database with zero login accounts. "
                "Create one first (see the create_default_admins command)."
            )

        to_delete_count = User.objects.count() - preserved_count

        self.stdout.write(self.style.WARNING(f"Preserved accounts ({preserved_count}):"))
        for u in preserved.order_by("email"):
            role = getattr(getattr(u, "admin_profile", None), "role", "superuser")
            self.stdout.write(f"  - {u.email} ({role})")

        self.stdout.write(self.style.WARNING(
            f"\n{to_delete_count} other user account(s) will be permanently "
            f"deleted, along with all wallets, transactions, KYC, affiliate, "
            f"support, and gamification data tied to them."
        ))

        if options["dry_run"]:
            self.stdout.write(self.style.NOTICE("\nDry run — no changes made."))
            return

        if not options["yes"]:
            confirm = input(
                "\nType RESET to permanently delete this data (this cannot be undone): "
            )
            if confirm != "RESET":
                self.stdout.write(self.style.NOTICE("Aborted — no changes made."))
                return

        preserved_ids = list(preserved.values_list("pk", flat=True))

        with transaction.atomic():
            # File-backed rows: delete the actual uploaded file from storage
            # before the row goes away, or it's left behind as an orphan
            # with nothing in the DB pointing to it.
            kyc_files_deleted = _delete_files(
                KYCSubmission.objects.all(), "doc_front", "doc_back", "selfie", "id_proof_file",
            )
            deleted, _ = KYCSubmission.objects.all().delete()
            self.stdout.write(f"Cleared KYCSubmission: {deleted} row(s), {kyc_files_deleted} file(s)")

            avatar_files_deleted = _delete_files(
                User.objects.exclude(pk__in=preserved_ids), "avatar",
            )
            if avatar_files_deleted:
                self.stdout.write(f"Cleared {avatar_files_deleted} avatar file(s) for deleted users")

            for model in _FULL_WIPE_MODELS:
                deleted, _ = model.objects.all().delete()
                self.stdout.write(f"Cleared {model.__name__}: {deleted} row(s)")

            wallet = AdminWallet.get()
            wallet.cash_balance = 0
            wallet.non_cash_balance = 0
            wallet.otp_balance = 0
            wallet.save(update_fields=["cash_balance", "non_cash_balance", "otp_balance"])

            counter = SpinGlobalCounter.get()
            counter.eligible_user_count = 0
            counter.save(update_fields=["eligible_user_count"])

            User.objects.filter(pk__in=preserved_ids).update(**_USER_FIELDS_RESET_TO_DEFAULT)

            deleted, _ = User.objects.exclude(pk__in=preserved_ids).delete()
            self.stdout.write(f"Deleted other User accounts (cascades included): {deleted} row(s) total")

            # Re-provision the 4 mandatory wallet rows for every preserved
            # admin — the post_save signal that normally does this only
            # fires on User *creation*, not on this bulk wipe.
            for user in User.objects.filter(pk__in=preserved_ids):
                for wtype in ["C", "NC", "O", "RP"]:
                    WalletAccount.objects.get_or_create(
                        user=user, wallet_type=wtype,
                        defaults={
                            "wallet_account_number": generate_account_number(wtype),
                            "balance": 0,
                        },
                    )

        self.stdout.write(self.style.SUCCESS(
            "\nDone. Database now contains only the preserved Super Admin / "
            "Admin login credentials plus static configuration/reference data."
        ))
