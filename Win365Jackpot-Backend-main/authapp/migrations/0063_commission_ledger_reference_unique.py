"""Actually enforce bet-slip idempotency on the commission ledger.

CommissionLedgerEntry carried

    UniqueConstraint(..., condition=~Q(reference_id=""), name="uniq_commission_ledger_reference")

whose purpose was "one entry per bet slip per affiliate/player", with the
condition exempting the deposit/losing rows that have no bet slip.

A conditional UniqueConstraint compiles to a partial index. MySQL does not
support those, so BaseDatabaseSchemaEditor._create_unique_sql() returns None
and the constraint is silently never created -- Django reports it only as the
models.W036 warning. `SHOW CREATE TABLE` on production confirmed the table had
just a plain non-unique KEY on reference_id and no UNIQUE at all. The
IntegrityError that commission_engine_service._persist() catches to make
rolling commissions idempotent therefore never fired, and the same bet slip
could be paid more than once.

The fix keeps the intent and drops the condition: rows with no bet slip now
store NULL instead of "", and every backend treats NULLs in a unique index as
distinct, so those rows stay exempt while real references are enforced.

Ordering is load-bearing, for two separate reasons.

The duplicate guard runs *first*, ahead of every schema and data operation.
MySQL cannot roll back DDL (`can_rollback_ddl = False`), so Django does not
wrap the migration in a transaction -- BaseDatabaseSchemaEditor computes
`atomic_migration = can_rollback_ddl and atomic`. Anything that executes
before a failure stays executed and, since the executor only records a
migration after apply() returns, 0063 would be left partially applied and
unrecorded. Checking before touching anything means a duplicate-bearing
database fails with the table exactly as it was found.

The guard must exclude "" as well as NULL. At the point it runs the column is
still NOT NULL and the reference-less rows still hold "", which would group
together and report a false duplicate on any table with two or more of them.

RemoveConstraint then runs before the field change. On MySQL it is a silent
no-op (_delete_unique_sql returns None for the same conditional reason, so
there is no DROP INDEX for an index that was never built), while on PostgreSQL
and SQLite the partial index does exist and is properly dropped.
"""

from django.db import migrations, models


DUPLICATE_GROUPS = ("affiliate", "referred_player", "commission_type", "reference_id")


def refuse_if_duplicates_exist(apps, schema_editor):
    """Abort before anything has been changed if the data cannot satisfy the
    constraint that this migration is about to add.

    This deliberately raises rather than deleting, merging or rewriting.
    These are financial rows; silently mutating them inside a migration to
    make an index build is not a trade worth making. A production scan on
    2026-08-18 found the table empty, so this is expected to be a no-op --
    but if some other environment does hold duplicates, an operator should
    decide what happens to them, not this file.
    """
    Entry = apps.get_model("authapp", "CommissionLedgerEntry")

    # Both exclusions are required -- see the module docstring. "" is what the
    # reference-less rows still hold at this point; NULL is what they will
    # hold if this migration has already run once and failed later.
    duplicates = (
        Entry.objects
        .exclude(reference_id=None)
        .exclude(reference_id="")
        .values(*DUPLICATE_GROUPS)
        .annotate(n=models.Count("id"))
        .filter(n__gt=1)
        .order_by("-n")
    )
    clashes = list(duplicates[:20])
    if clashes:
        total = duplicates.count()
        lines = "\n".join(
            "  affiliate=%s player=%s type=%s reference=%s occurs %s times"
            % (c["affiliate"], c["referred_player"], c["commission_type"],
               c["reference_id"], c["n"])
            for c in clashes
        )
        raise RuntimeError(
            "Cannot add uniq_commission_ledger_reference: %s reference(s) are "
            "already duplicated in authapp_commissionledgerentry.\n%s\n\n"
            "These are duplicate commission payments -- the defect this "
            "migration exists to prevent. Nothing has been changed; the table "
            "is exactly as it was found. Resolve them deliberately (decide "
            "which entry is authoritative and what happens to the money "
            "already attributed to the others) and re-run. Do not simply "
            "delete rows to get past this check." % (total, lines)
        )


def blank_references_to_null(apps, schema_editor):
    Entry = apps.get_model("authapp", "CommissionLedgerEntry")
    Entry.objects.filter(reference_id="").update(reference_id=None)


def null_references_to_blank(apps, schema_editor):
    Entry = apps.get_model("authapp", "CommissionLedgerEntry")
    Entry.objects.filter(reference_id=None).update(reference_id="")


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0062_s3_storage_and_field_lengths"),
    ]

    operations = [
        migrations.RunPython(refuse_if_duplicates_exist, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="commissionledgerentry",
            name="uniq_commission_ledger_reference",
        ),
        migrations.AlterField(
            model_name="commissionledgerentry",
            name="reference_id",
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.RunPython(blank_references_to_null, null_references_to_blank),
        migrations.AddConstraint(
            model_name="commissionledgerentry",
            constraint=models.UniqueConstraint(
                fields=("affiliate", "referred_player", "commission_type", "reference_id"),
                name="uniq_commission_ledger_reference",
            ),
        ),
    ]
