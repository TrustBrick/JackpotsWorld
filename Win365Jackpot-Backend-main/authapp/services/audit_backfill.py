"""
authapp/services/audit_backfill.py
─────────────────────────────────────────────────────────────────────────────
Reconstructs the admin audit trail for the period BEFORE
middleware/admin_audit.py existed.

WHAT THIS CAN AND CANNOT DO — READ THIS FIRST
─────────────────────────────────────────────
It does not recover history. It re-reads history that was already recorded
elsewhere, in a form nobody could query, and writes it into the one table
that answers "who did what".

Two sources, both already in the database:

  1. `actor_type` on existing ActivityLog rows. Those ~95 hand-written log
     calls have always recorded the actor; they just never said whether the
     actor was staff. That is derivable from the actor, so it is filled in.

  2. The 20-odd models that carry `created_by` / `updated_by` / `reviewed_by`
     / `approved_by` / `initiated_by` alongside a timestamp. Each one is a
     statement that a named person did a named thing at a known time — an
     audit record that was only ever readable by opening that one table.

WHAT IS STILL MISSING, AND ALWAYS WILL BE
─────────────────────────────────────────
  * **Deletions.** If an admin deleted a promotion in August, the row is gone
    and `created_by` went with it. Nothing anywhere remembers. This is the
    largest blind spot and it cannot be closed retroactively.
  * **Every edit but the last.** `updated_by`/`updated_at` hold one value, so
    a record edited nine times yields one reconstructed row, not nine.
  * **Anything on a model with no `*_by` column** — most of the platform.
  * **Endpoint, HTTP method and status.** Never captured, so they stay NULL
    rather than being invented.
  * **Whether the actor was staff at the time.** `is_staff` is read as it is
    now. Someone whose access was revoked since will be judged by today's
    flag, not the one they had then.

So the reconstructed trail is a floor, not a complete account, and it must
never be read as one. Which is why:

EVERY ROW THIS WRITES IS MARKED
───────────────────────────────
`meta.source = "backfill"`, a `reference_id` of
`backfill:<table>:<pk>:<basis>`, and a description that begins
"Reconstructed". A derived row and an observed one must never be
indistinguishable in an audit trail — the whole value of the table is that
what it says was witnessed, was witnessed. Filter them out with
`meta->>'$.source' <> 'backfill'` (or `IS NULL`) to see only observed events.

The `reference_id` is also the dedupe key, so running this twice adds
nothing the second time.
"""

import logging

from django.apps import apps
from django.db import DatabaseError, transaction

logger = logging.getLogger(__name__)

# Field names that mean "a person did this". Deliberately an allowlist: a
# column has to be known to carry an actor before its rows are turned into
# audit entries, because a wrong attribution is worse than a missing one.
CREATE_FIELDS = ("created_by",)
UPDATE_FIELDS = ("updated_by", "reviewed_by", "approved_by", "initiated_by")

# Timestamp to use, most specific first.
CREATE_TIME = ("created_at",)
UPDATE_TIME = ("updated_at", "created_at")

BATCH = 500


def _pick(cols, candidates):
    for c in candidates:
        if c in cols:
            return c
    return None


def _plan():
    """[(model, who_field, when_field, action, verb)] for everything readable."""
    from authapp.models import ActivityLog

    out = []
    for model in apps.get_app_config("authapp").get_models():
        if model is ActivityLog:
            continue
        cols = {f.name for f in model._meta.fields}
        for who in CREATE_FIELDS:
            when = _pick(cols, CREATE_TIME)
            if who in cols and when:
                out.append((model, who, when, "admin_create", "created"))
        for who in UPDATE_FIELDS:
            when = _pick(cols, UPDATE_TIME)
            if who in cols and when:
                # "last updated", not "updated" — the column only remembers
                # the most recent edit, and the description should not imply
                # this was the only one.
                out.append((model, who, when, "admin_update", "last updated"))
    return out


def backfill(dry_run=False, stdout=None):
    """
    Returns a dict of counts. With dry_run=True nothing is written and the
    same numbers come back, so the size of the change can be seen first.
    """
    from authapp.models import ActivityLog

    def say(msg):
        if stdout:
            stdout.write(msg)
        else:
            logger.info(msg)

    results = {"actor_type_filled": 0, "reconstructed": 0, "skipped_existing": 0,
               "per_model": {}}

    # ── 1. actor_type on rows that predate the column ────────────────────────
    staff_null = ActivityLog.objects.filter(actor_type__isnull=True,
                                            actor__isnull=False,
                                            actor__is_staff=True)
    user_null = ActivityLog.objects.filter(actor_type__isnull=True,
                                           actor__isnull=False,
                                           actor__is_staff=False)
    n_staff, n_user = staff_null.count(), user_null.count()
    if not dry_run:
        staff_null.update(actor_type="admin")
        user_null.update(actor_type="user")
    results["actor_type_filled"] = n_staff + n_user
    say(f"actor_type: {n_staff} admin + {n_user} user rows")

    # ── 2. reconstruct from the models that recorded who and when ────────────
    already = set(
        ActivityLog.objects
        .filter(reference_id__startswith="backfill:")
        .values_list("reference_id", flat=True)
    )
    say(f"already reconstructed previously: {len(already)}")

    for model, who, when, action, verb in _plan():
        table = model._meta.db_table
        label = model.__name__
        try:
            pending, stamp_by_ref, skipped = _collect(
                model, who, when, action, verb, table, label, already,
            )
        except DatabaseError:
            # This runs from migration 0104 against the CURRENT models (see
            # that migration's docstring, which flags exactly this). Replaying
            # the chain on a fresh database therefore reaches 0104 while a
            # column added by a LATER migration is still missing, and querying
            # this model raises.
            #
            # Skip that model rather than abandoning the whole reconstruction:
            # one table whose schema has since moved on must not cost the
            # backfill every other table it could still read. Caught per model
            # for that reason, not around the loop.
            logger.warning(
                "admin audit backfill: skipping %s — its schema has moved on "
                "since migration 0104 (a later migration adds a column this "
                "query needs). Run `manage.py backfill_admin_audit` afterwards "
                "to pick it up.", label,
            )
            continue

        results["skipped_existing"] += skipped
        if not pending:
            continue
        results["per_model"][f"{label}.{who}"] = len(pending)
        results["reconstructed"] += len(pending)

        if dry_run:
            continue

        _write(pending, stamp_by_ref)

    say(f"reconstructed: {results['reconstructed']} "
        f"(skipped {results['skipped_existing']} already present)")
    return results


def _collect(model, who, when, action, verb, table, label, already):
    """Rows to write for one model. Raises DatabaseError if its schema has
    drifted past what migration 0104 can read — see the caller."""
    from authapp.models import ActivityLog

    qs = (model.objects
          .filter(**{f"{who}__isnull": False, f"{who}__is_staff": True})
          .select_related(who)
          .order_by("pk"))

    pending, stamp_by_ref, skipped = [], {}, 0
    for obj in qs.iterator(chunk_size=BATCH):
        ref = f"backfill:{table}:{obj.pk}:{who}"[:100]
        if ref in already:
            skipped += 1
            continue
        ts = getattr(obj, when, None)
        if ts is None:
            continue
        actor = getattr(obj, who)
        pending.append(ActivityLog(
            actor=actor,
            action=action,
            actor_type="admin",
            description=f"Reconstructed: {verb} {label} #{obj.pk}",
            reference_id=ref,
            meta={
                "source": "backfill",
                "model": label,
                "table": table,
                # str(): some models use a UUID primary key, and meta is
                # JSON. A dry run will not catch this, because it never
                # serialises.
                "object_id": str(obj.pk),
                "basis": f"{who} + {when}",
                "note": "Derived from an existing record, not observed at "
                        "the time. See services/audit_backfill.py.",
            },
        ))
        stamp_by_ref[ref] = ts

    return pending, stamp_by_ref, skipped


def _write(pending, stamp_by_ref):
    """Insert the reconstructed rows, then correct their timestamps."""
    from authapp.models import ActivityLog

    with transaction.atomic():
        # created_at is auto_now_add, so bulk_create stamps it with "now"
        # regardless of what the instance says. bulk_update does honour it, so
        # the real timestamp is written in a second pass -- without which every
        # reconstructed row would claim to have happened at the moment of the
        # backfill, which would be a lie in the one column an audit trail is
        # most often read by.
        ActivityLog.objects.bulk_create(pending, batch_size=BATCH)

        # MySQL has no RETURNING, so bulk_create hands back objects with no
        # primary key and bulk_update refuses them. Re-read the rows by the
        # deterministic reference_id instead -- which is also what makes the
        # second pass safe to interrupt and repeat.
        written = list(
            ActivityLog.objects.filter(reference_id__in=list(stamp_by_ref))
        )
        for row in written:
            row.created_at = stamp_by_ref[row.reference_id]
        ActivityLog.objects.bulk_update(written, ["created_at"], batch_size=BATCH)
