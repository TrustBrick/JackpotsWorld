"""
authapp/management/commands/apply_event_data_corrections.py
────────────────────────────────────────────────────────────────────────────
ONE-OFF. Applies the 17 approved factual corrections to CasinoEvent and
PokerTournament rows, after each was verified against the official
organiser's own published schedule.

Six of the eleven casino events carried outright wrong facts -- ICE had
moved from London to Barcelona, WSOP Europe from Rozvadov to Prague (and
from autumn to spring), Triton Jeju's venue had been renamed and its dates
were half a year out -- and several already-finished events were still
publishing themselves as upcoming. All of it was reaching Google through
Event JSON-LD, so the wrong dates were not merely on-page text.

This command does not run itself as part of any deploy step, signal, or
migration -- like reset_platform_data, it must be invoked explicitly:

    python manage.py apply_event_data_corrections              # dry run
    python manage.py apply_event_data_corrections --apply      # prompts
    python manage.py apply_event_data_corrections --apply --yes

Every field carries the value it is expected to already hold. A field whose
current value is neither the expected old value nor the intended new one
means the row was edited by someone else since this set was approved, and
the run aborts having written nothing -- a stale correction silently
overwriting a newer hand-edit is the one failure mode worth refusing
outright. A field already holding the intended value is simply already
applied, which is what makes re-running safe.

--revert runs the same 39 fields in the opposite direction, restoring each
to the value it held before this command first ran:

    python manage.py apply_event_data_corrections --revert            # dry run
    python manage.py apply_event_data_corrections --revert --apply

That is the intended rollback for this change, and a far better one than
restoring the RDS snapshot: a restore would discard every registration,
wallet transaction and KYC record written since it was taken, to undo 39
fields. The revert is exact, targeted, needs no endpoint cutover, and runs
through the identical expected-value guard -- so a row edited by someone
else after the corrections landed stops the rollback too, rather than
being silently overwritten with month-old values.

PokerTournament 8 (APPT Manila) is deliberately NOT corrected here. Its
buy-in and prize pool are both known wrong, but the replacements are still
unresolved, so it is carried as a read-only control instead: snapshotted
before and after purely to prove this command left it alone.
"""
import datetime
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from authapp.models.events_models import CasinoEvent
from authapp.models.poker_models import PokerTournament

# Deliberately different per direction: the confirmation is worthless if it
# can be typed from muscle memory without reading which way the run is going.
CONFIRM_PHRASE = "APPLY CORRECTIONS"
REVERT_CONFIRM_PHRASE = "REVERT CORRECTIONS"

# {model: {pk: {field: (expected_old_value, new_value)}}}
#
# Explicit primary keys only -- never a filter or a queryset. Nothing here is
# discovered at runtime, so no row outside this table can be reached.
CORRECTIONS = {
    CasinoEvent: {
        1: {
            "status": ("live", "completed"),
        },
        2: {
            "name": ("WSOP Europe — Rozvadov", "WSOP Europe — Prague"),
            "event_date": (datetime.date(2026, 10, 14), datetime.date(2026, 3, 31)),
            "venue": ("King's Casino", "King's Casino Prague"),
            "city": ("Rozvadov", "Prague"),
            "status": ("upcoming", "completed"),
        },
        # WPT has not published 2026 dates. Deactivated rather than left
        # publishing an unverifiable one; the row itself is kept for
        # reactivation once real dates exist.
        3: {
            "is_active": (True, False),
        },
        4: {
            "event_date": (datetime.date(2026, 8, 19), datetime.date(2026, 8, 16)),
            "status": ("upcoming", "completed"),
        },
        # No PCA edition since 2023 and none announced for 2027, so this
        # advertises an event that does not exist. Deactivated, not deleted.
        5: {
            "is_active": (True, False),
        },
        6: {
            "event_date": (datetime.date(2026, 9, 9), datetime.date(2026, 3, 5)),
            "venue": ("Landing Casino", "Les A Casino, Jeju Shinhwa World"),
            "status": ("upcoming", "completed"),
        },
        7: {
            "name": (
                "Asian Poker Tour — APT Manila",
                "Asia Pacific Poker Tour — APPT Manila",
            ),
            "event_date": (datetime.date(2026, 8, 5), datetime.date(2026, 7, 28)),
            "status": ("upcoming", "completed"),
        },
        8: {
            "name": ("ICE — International Casino Exhibition", "ICE Barcelona"),
            "event_date": (datetime.date(2027, 2, 3), datetime.date(2027, 1, 18)),
            "venue": ("ExCeL London", "Fira Barcelona Gran Via"),
            "city": ("London", "Barcelona"),
            "country": ("United Kingdom", "Spain"),
        },
        9: {
            "event_date": (datetime.date(2026, 10, 6), datetime.date(2026, 9, 28)),
        },
        10: {
            "name": ("SiGMA Europe Summit", "SiGMA Central Europe"),
            "event_date": (datetime.date(2026, 11, 17), datetime.date(2026, 11, 2)),
            "city": ("Valletta", "Birkirkara"),
        },
    },
    PokerTournament: {
        1: {
            "status": ("live", "completed"),
        },
        2: {
            # The name follows the same "<event> — <buy-in> <format>" shape as
            # ids 1/3/4 and its figure matched buy_in exactly, so it is the
            # buy-in being stated. The 2026 Prague Main Event was EUR 5,300;
            # the EUR 10,000,000 in circulation is the guarantee, which this
            # model has no field for and which is NOT recorded here.
            "name": (
                "WSOP Europe Main Event — €10,000 No-Limit Hold'em",
                "WSOP Europe Main Event — €5,300 No-Limit Hold'em",
            ),
            "buy_in": (Decimal("10000.00"), Decimal("5300.00")),
            "event_date": (datetime.date(2026, 10, 20), datetime.date(2026, 3, 31)),
            "casino_name": ("King's Casino Rozvadov", "King's Casino Prague"),
            "location": ("Rozvadov, Czech Republic", "Prague, Czech Republic"),
            "status": ("upcoming", "completed"),
        },
        3: {
            "is_active": (True, False),
        },
        4: {
            "event_date": (datetime.date(2026, 8, 24), datetime.date(2026, 8, 22)),
        },
        5: {
            "is_active": (True, False),
        },
        # The 2026 WSOP Online series runs Aug 16 - Sep 29 and contains no
        # $1,050 event; this row's date also predates the series by four
        # weeks. No published event matches it, so it is deactivated rather
        # than pointed at an arbitrary one.
        6: {
            "is_active": (True, False),
        },
        7: {
            "event_date": (datetime.date(2026, 9, 12), datetime.date(2026, 3, 5)),
            "casino_name": ("Landing Casino", "Les A Casino, Jeju Shinhwa World"),
            "status": ("upcoming", "completed"),
        },
    },
}

# Read-only. Snapshotted before and after solely to evidence non-interference.
CONTROL_PK = 8
CONTROL_FIELDS = (
    "name", "casino_name", "location", "event_date",
    "buy_in", "prize_pool", "seats_available", "status", "is_active",
)


def _snapshot(instance, fields):
    return {f: getattr(instance, f) for f in fields}


class Command(BaseCommand):
    help = (
        "One-off: applies the 17 approved CasinoEvent/PokerTournament factual "
        "corrections. Dry run unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually write. Without this the command only reports.",
        )
        parser.add_argument(
            "--yes", action="store_true",
            help="Skip the interactive confirmation (only meaningful with --apply).",
        )
        parser.add_argument(
            "--revert", action="store_true",
            help=(
                "Run the same 39 fields backwards, restoring their pre-correction "
                "values. Still a dry run unless --apply is also passed."
            ),
        )

    # -- reporting ---------------------------------------------------------

    def _ok(self, msg):
        self.stdout.write(self.style.SUCCESS(msg))

    def _warn(self, msg):
        self.stdout.write(self.style.WARNING(msg))

    def _err(self, msg):
        self.stdout.write(self.style.ERROR(msg))

    def _print_target(self):
        """Name and host only -- never the user or password.

        Running this against the wrong environment is the expensive mistake,
        so the target is stated up front and the operator confirms it.
        """
        db = settings.DATABASES["default"]
        self.stdout.write("Target database")
        self.stdout.write(f"    ENGINE : {db.get('ENGINE')}")
        self.stdout.write(f"    NAME   : {db.get('NAME')}")
        self.stdout.write(f"    HOST   : {db.get('HOST')}")
        self.stdout.write(f"    PORT   : {db.get('PORT')}")
        self.stdout.write("")

    # -- phase 1: verify ---------------------------------------------------

    def _plan(self, revert=False):
        """Compare every field against its expected value.

        Returns (pending, applied, mismatches). Reads only; the caller decides
        whether anything happens next.

        Reverting swaps which end of each pair is the source and which is the
        target -- the comparison itself is unchanged, so a rollback is held to
        exactly the same standard as the forward run and refuses a row that
        someone has since edited by hand.
        """
        pending, applied, mismatches = [], [], []

        for model, rows in CORRECTIONS.items():
            label = model.__name__
            for pk in sorted(rows):
                try:
                    obj = model.objects.get(pk=pk)
                except model.DoesNotExist:
                    mismatches.append(
                        (label, pk, "<row>", "present", "MISSING")
                    )
                    continue

                for field, (expected_old, new) in rows[pk].items():
                    source, target = (new, expected_old) if revert else (expected_old, new)
                    current = getattr(obj, field)
                    if current == target:
                        applied.append((label, pk, field, current))
                    elif current == source:
                        pending.append((label, pk, field, current, target, obj))
                    else:
                        mismatches.append((label, pk, field, source, current))

        return pending, applied, mismatches

    # -- entry point -------------------------------------------------------

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        assume_yes = options["yes"]
        revert = options["revert"]
        direction = "REVERT" if revert else "APPLY"

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING(f"Direction: {direction}"))
        self._print_target()

        control_before = _snapshot(
            PokerTournament.objects.get(pk=CONTROL_PK), CONTROL_FIELDS
        )

        total_rows = sum(len(r) for r in CORRECTIONS.values())
        total_fields = sum(
            len(f) for rows in CORRECTIONS.values() for f in rows.values()
        )
        self.stdout.write(
            f"Correction set: {total_rows} rows, {total_fields} field changes"
        )
        self.stdout.write(
            f"Control (never modified): PokerTournament id={CONTROL_PK}"
        )
        self.stdout.write("")

        pending, applied, mismatches = self._plan(revert)

        if applied:
            self.stdout.write(
                "Already reverted (no write needed)" if revert
                else "Already applied (no write needed)"
            )
            for label, pk, field, current in applied:
                self.stdout.write(f"    {label} id={pk} {field}: {current!r}")
            self.stdout.write("")

        if pending:
            self.stdout.write("Planned changes")
            for label, pk, field, current, new, _obj in pending:
                self.stdout.write(
                    f"    {label} id={pk} {field}: {current!r}  ->  {new!r}"
                )
            self.stdout.write("")

        # A mismatch means someone edited the row after this set was approved.
        # Writing the rest anyway would leave a half-corrected table whose
        # state matches neither the plan nor what the other editor intended,
        # so nothing at all is written.
        if mismatches:
            self._err("UNEXPECTED VALUES -- no changes will be made:")
            for label, pk, field, expected, found in mismatches:
                self._err(
                    f"    {label} id={pk} {field}: expected {expected!r}, "
                    f"found {found!r}"
                )
            self.stdout.write("")
            self._err(
                f"Aborted with {len(mismatches)} mismatch(es). "
                f"0 rows written. Re-verify the correction set against the "
                f"current data before retrying."
            )
            raise CommandError("expected-value verification failed")

        if not pending:
            self._ok(
                f"Nothing to do -- all {total_fields} field values already "
                f"match the {'pre-correction' if revert else 'approved'} values."
            )
            self._verify_control(control_before)
            return

        if not apply_changes:
            verb = "reverted" if revert else "applied"
            flag = "--revert --apply" if revert else "--apply"
            self.stdout.write(
                f"DRY RUN: {len(pending)} field change(s) across "
                f"{len({(l, p) for l, p, _, _, _, _ in pending})} row(s) would be "
                f"{verb}. Nothing was written."
            )
            self.stdout.write(f"Re-run with {flag} to write.")
            self._verify_control(control_before)
            return

        phrase = REVERT_CONFIRM_PHRASE if revert else CONFIRM_PHRASE
        if not assume_yes:
            self.stdout.write("")
            self._warn(
                f"About to {direction} {len(pending)} field(s) in the database "
                f"named above."
            )
            answer = input(f'Type "{phrase}" to proceed: ').strip()
            if answer != phrase:
                raise CommandError("Confirmation not given -- nothing written.")

        self._apply(pending, control_before, revert)

    # -- phase 2: write ----------------------------------------------------

    def _apply(self, pending, control_before, revert=False):
        # Grouped so each row is saved once with every one of its changed
        # columns named -- update_fields is what keeps a save() from writing
        # columns this command was never authorised to touch.
        by_row = {}
        for label, pk, field, _current, new, obj in pending:
            entry = by_row.setdefault((label, pk), {"obj": obj, "fields": {}})
            entry["fields"][field] = new

        written_fields = 0
        self.stdout.write("")
        self.stdout.write("Reverting" if revert else "Applying")

        with transaction.atomic():
            for (label, pk), entry in sorted(by_row.items()):
                obj = entry["obj"]
                for field, new in entry["fields"].items():
                    setattr(obj, field, new)
                    written_fields += 1
                obj.save(update_fields=list(entry["fields"]) + ["updated_at"])
                self.stdout.write(
                    f"    {label} id={pk}: {', '.join(sorted(entry['fields']))}"
                )

            expected_fields = len(pending)
            if written_fields != expected_fields:
                raise CommandError(
                    f"Wrote {written_fields} fields, expected {expected_fields} "
                    f"-- rolling back."
                )

            # Re-read inside the transaction: confirms the intended values are
            # what actually landed before this becomes permanent.
            _pending_after, _applied_after, mismatches_after = self._plan(revert)
            if mismatches_after:
                for label, pk, field, expected, found in mismatches_after:
                    self._err(
                        f"    post-write mismatch {label} id={pk} {field}: "
                        f"expected {expected!r}, found {found!r}"
                    )
                raise CommandError("post-write verification failed -- rolling back.")
            if _pending_after:
                raise CommandError(
                    f"{len(_pending_after)} field(s) still unapplied after write "
                    f"-- rolling back."
                )

            self._verify_control(control_before, inside_transaction=True)

        self.stdout.write("")
        self._ok(
            f"{'Reverted' if revert else 'Applied'} {written_fields} field "
            f"change(s) across {len(by_row)} row(s). Committed."
        )

    # -- control -----------------------------------------------------------

    def _verify_control(self, before, inside_transaction=False):
        after = _snapshot(
            PokerTournament.objects.get(pk=CONTROL_PK), CONTROL_FIELDS
        )
        drifted = {f: (before[f], after[f]) for f in CONTROL_FIELDS if before[f] != after[f]}
        if drifted:
            for field, (old, new) in drifted.items():
                self._err(
                    f"    CONTROL DRIFT PokerTournament id={CONTROL_PK} "
                    f"{field}: {old!r} -> {new!r}"
                )
            raise CommandError(
                f"Control row PokerTournament id={CONTROL_PK} was modified "
                f"-- {'rolling back' if inside_transaction else 'aborting'}."
            )
        self._ok(
            f"Control verified unchanged: PokerTournament id={CONTROL_PK} "
            f"({len(CONTROL_FIELDS)} fields identical)."
        )
