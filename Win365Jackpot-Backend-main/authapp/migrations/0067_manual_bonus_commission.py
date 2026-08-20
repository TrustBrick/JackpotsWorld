"""Manual / Bonus commission — the fourth commission type.

Two operations, both additive, neither of which reads or rewrites a single
existing row:

`idempotency_key` is a new nullable, unique column. Every commission already
in the ledger gets NULL, and every backend allows any number of NULLs in a
unique index — so the three calculated types are entirely unaffected by the
constraint while a repeated manual submission collides on it. It cannot ride
on the existing uniq_commission_ledger_reference: a manual entry has no
referred_player, and a NULL anywhere in a composite unique index makes MySQL
treat the whole row as distinct, so that constraint cannot see manual
duplicates at all.

The `commission_type` change only widens the field's `choices` to include
"manual". Choices are validated by Django, never by the database, so this
compiles to no SQL whatsoever (confirmed with sqlmigrate) — it exists purely
to keep migration state in step with the model. The column stays
varchar(10); "manual" is six characters.

Deliberately not touched: CommissionRule.commission_type. A manual commission
is granted, not calculated, so there is no rule that pays one and "manual"
must never appear in the rule editor's dropdown. That is why the model keeps
two lists — COMMISSION_TYPES for rules, LEDGER_COMMISSION_TYPES for entries.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0066_campaign_analyticsevent'),
    ]

    operations = [
        migrations.AddField(
            model_name='commissionledgerentry',
            name='idempotency_key',
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name='commissionledgerentry',
            name='commission_type',
            field=models.CharField(
                choices=[
                    ('deposit', 'Deposit Commission'),
                    ('losing', 'Losing Commission'),
                    ('rolling', 'Rolling Commission'),
                    ('manual', 'Manual / Bonus'),
                ],
                db_index=True, max_length=10,
            ),
        ),
    ]
