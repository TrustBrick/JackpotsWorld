"""Close the hold on calls that ended while held.

`is_on_hold` had no code path that cleared it when the call itself ended —
resume cleared it, the sweep cleared it, hanging up did not. `live_hold_seconds`
adds "now minus hold_started_at" whenever the flag is set, so every one of these
rows reported a hold duration that grew for as long as the row existed: call #43
ended at 11:29 and was still reporting two more seconds of hold every two
seconds. Any hold-time reporting over call history was wrong for exactly these
calls.

voice_call_service now closes the period as part of ending a call. This closes
the ones already in the database, at the moment each call actually ended:

  * the open CallHoldEvent gets `resumed_at` = the call's `ended_at` and the
    duration that implies — no `resumed_by`, `auto_resumed` left False, because
    nobody resumed it and no timeout fired; the hold simply ran until the call
    did;
  * the call gets `is_on_hold` cleared, `hold_started_at` cleared, and that
    duration added to `total_hold_seconds`.

Not reversible in a way worth writing: restoring the flag would restore the bug,
and the recorded durations are the true ones.
"""

from django.db import migrations


TERMINAL = ("ended", "missed", "rejected", "cancelled", "failed")


def close_stale_holds(apps, schema_editor):
    CallSession = apps.get_model("authapp", "CallSession")
    CallHoldEvent = apps.get_model("authapp", "CallHoldEvent")

    for call in CallSession.objects.filter(is_on_hold=True, status__in=TERMINAL):
        when = call.ended_at or call.hold_started_at
        if when is None:
            # No timestamp to close against — clear the flag so the duration
            # stops growing, and leave the total alone rather than guess.
            CallSession.objects.filter(pk=call.pk).update(
                is_on_hold=False, hold_started_at=None,
            )
            continue

        event = (
            CallHoldEvent.objects
            .filter(call_id=call.pk, resumed_at__isnull=True)
            .order_by("-held_at")
            .first()
        )
        started = event.held_at if event is not None else call.hold_started_at
        elapsed = max(int((when - started).total_seconds()), 0) if started else 0

        if event is not None:
            event.resumed_at = when
            event.duration_seconds = elapsed
            event.save(update_fields=["resumed_at", "duration_seconds"])

        CallSession.objects.filter(pk=call.pk).update(
            is_on_hold=False,
            hold_started_at=None,
            total_hold_seconds=int(call.total_hold_seconds or 0) + elapsed,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0090_default_max_hold_seconds"),
    ]

    operations = [
        migrations.RunPython(close_stale_holds, migrations.RunPython.noop),
    ]
