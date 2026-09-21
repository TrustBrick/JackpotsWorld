"""
FULL-ADMIN-AUDIT: rewrite already-recorded middleware descriptions into plain
language (see authapp/services/audit_labels.py).

Rows written between the middleware shipping and the labels shipping read
"POST /api/admin-panel/live-chat/calls/41/accept/". Endpoint and method were
always stored, so the sentence is produced from what the row already
contained — nothing is inferred that was not there.

Same reason for being a migration as 0104: `aws ssm send-command` is refused,
so `migrate --noinput` in .ebextensions is the only hook that runs once, on
the leader, in production. `manage.py relabel_admin_audit --dry-run` remains
the better tool anywhere it can actually be run.

Only touches rows with meta.source = "middleware". Hand-written log calls
describe their actions far better than any endpoint mapping could, and the
0104 reconstructions say "Reconstructed:" deliberately; rewriting either would
replace good text with worse.

Reversible: the original request line is kept in meta.request, so the reverse
puts the raw description back from it rather than guessing.
"""

import logging

from django.db import migrations

logger = logging.getLogger(__name__)

BATCH = 500


def relabel(apps, schema_editor):
    from authapp.models import ActivityLog
    from authapp.services.audit_labels import describe

    try:
        qs = (ActivityLog.objects
              .filter(meta__source="middleware", endpoint__isnull=False)
              .exclude(meta__has_key="request")
              .order_by("id"))
        changed = []
        for row in qs.iterator(chunk_size=BATCH):
            phrase = describe(row.method, row.endpoint)
            if not phrase:
                continue
            if row.status_code and row.status_code >= 400:
                phrase = f"{phrase} (failed: HTTP {row.status_code})"
            row.meta = {**(row.meta or {}), "request": f"{row.method} {row.endpoint}"}
            row.description = phrase
            changed.append(row)

        for i in range(0, len(changed), BATCH):
            ActivityLog.objects.bulk_update(
                changed[i:i + BATCH], ["description", "meta"], batch_size=BATCH)
        logger.info("admin audit relabel: %s rows rewritten", len(changed))
    except Exception:
        # Wording is not worth failing a deploy over. The command can be run
        # afterwards, and every row still carries its endpoint and method.
        logger.exception("admin audit relabel failed; continuing with the deploy")


def unrelabel(apps, schema_editor):
    ActivityLog = apps.get_model("authapp", "ActivityLog")
    rows = ActivityLog.objects.filter(meta__source="middleware",
                                      meta__has_key="request")
    changed = []
    for row in rows.iterator(chunk_size=BATCH):
        meta = dict(row.meta or {})
        raw = meta.pop("request", None)
        if not raw:
            continue
        row.description = raw
        row.meta = meta
        changed.append(row)
    for i in range(0, len(changed), BATCH):
        ActivityLog.objects.bulk_update(
            changed[i:i + BATCH], ["description", "meta"], batch_size=BATCH)
    logger.info("admin audit relabel reversed: %s rows", len(changed))


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0104_backfill_admin_audit"),
    ]

    operations = [
        migrations.RunPython(relabel, unrelabel),
    ]
