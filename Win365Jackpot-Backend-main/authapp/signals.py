"""
authapp/signals.py  (add/merge into your existing signals.py)
────────────────────────────────────────────────────────────────────────────
Auto-creates 4 WalletAccount rows whenever a new User is created.
Account numbers follow the format: {PREFIX}{DDMMYY}{SS}{ms+offset}

Also handles rolling-points update notification to admin when
threshold is reached after a RollingPointsLog is saved.
"""

from django.db.models import FileField
from django.db.models.signals import post_delete, post_init, post_save
from django.dispatch import receiver
from django.conf import settings

from .models.wallet_models import WalletAccount
from .utils.account_number import generate_account_number

User = settings.AUTH_USER_MODEL


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_wallet_accounts(sender, instance, created, **kwargs):
    """Create 4 wallet accounts for every new user."""
    if not created:
        return

    wallet_types = ["C", "NC", "O", "RP"]
    for wtype in wallet_types:
        acc_no = generate_account_number(wtype)
        WalletAccount.objects.get_or_create(
            user=instance,
            wallet_type=wtype,
            defaults={
                "wallet_account_number": acc_no,
                "balance": 0,
            }
        )


# ─────────────────────────────────────────────────────────────────────────────
# Media file cleanup
# ─────────────────────────────────────────────────────────────────────────────
# Django never deletes a FileField/ImageField's underlying storage object on
# its own — neither when the row holding it is deleted, nor when the field is
# reassigned to a different file. Both leave the old bytes sitting in storage
# (local disk or S3) forever, i.e. exactly the "orphaned storage files" this
# is meant to prevent. Handled once, generically, here rather than per model
# — every current and future model in this app gets it for free.
#
# All three receivers below connect to every sender (no `sender=`) and self-
# filter to the authapp app_label as their first line, so Django's own/
# third-party models (auth, sessions, token_blacklist, ...) are skipped
# before doing any real work.
#
# Deliberately snapshots each instance's file field values in post_init
# (an in-memory read off the just-loaded instance, no query) rather than
# re-fetching the row from the database in pre_save to compare — the latter
# would add a DB round trip to every single save() of every model with a
# file field, including User (avatar), which is saved on ordinary,
# high-frequency paths unrelated to media (wallet balance updates, last
# login, ...). This is the same snapshot-on-load approach django-cleanup
# (a well-known third-party package solving this exact problem) uses.


def _file_fields(model):
    return [f for f in model._meta.get_fields() if isinstance(f, FileField)]


def _loaded_file_fields(instance):
    """_file_fields(), minus any currently deferred on this specific
    instance (e.g. loaded via .only()/.defer()). Accessing a deferred
    FileField triggers Django's DeferredAttribute -> refresh_from_db, which
    constructs a *new* instance and fires post_init all over again —
    snapshotting an unconditionally-accessed field here would recurse into
    that infinitely. A deferred field is safe to just skip: it wasn't part
    of this load, so there's nothing loaded here to snapshot or diff against."""
    deferred = instance.get_deferred_fields()
    return [f for f in _file_fields(type(instance)) if f.attname not in deferred]


@receiver(post_init)
def _snapshot_media_files(sender, instance, **kwargs):
    if sender._meta.app_label != "authapp":
        return
    fields = _loaded_file_fields(instance)
    if fields:
        instance._media_file_snapshot = {
            f.name: (getattr(instance, f.name).name or None) for f in fields
        }


@receiver(post_delete)
def delete_media_files_on_row_delete(sender, instance, **kwargs):
    """The row is gone — any file(s) it referenced are unambiguously
    orphaned now, deletion order doesn't matter the way it does for a
    replace (see below)."""
    if sender._meta.app_label != "authapp":
        return
    for field in _loaded_file_fields(instance):
        file_ = getattr(instance, field.name, None)
        if file_ and file_.name:
            file_.storage.delete(file_.name)


@receiver(post_save)
def delete_replaced_media_files(sender, instance, created, **kwargs):
    """Deletes the *old* file(s) a save just replaced — only reachable after
    the row holding the new value has actually committed, so a save that
    raises never deletes media a live row still references."""
    if created or sender._meta.app_label != "authapp":
        return
    snapshot = getattr(instance, "_media_file_snapshot", None)
    if not snapshot:
        return
    fields = _loaded_file_fields(instance)
    for field in fields:
        old_name = snapshot.get(field.name)
        new_file = getattr(instance, field.name, None)
        new_name = new_file.name if new_file else None
        if old_name and old_name != new_name:
            # field.storage, not new_file.storage — this must still resolve
            # correctly when the field was cleared entirely (new_file falsy).
            field.storage.delete(old_name)
    # Re-snapshot so a second save() on the same long-lived instance (common
    # in admin request/response cycles) diffs against what's live now, not
    # against the original values from when the instance was first loaded.
    instance._media_file_snapshot = {
        f.name: (getattr(instance, f.name).name or None) for f in fields
    }