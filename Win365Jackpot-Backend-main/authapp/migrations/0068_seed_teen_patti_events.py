"""Seed a starting set of Teen Patti events.

The Teen Patti page had no events at all, so it rendered its empty state on
every environment. These are real TeenPattiEvent rows written through the same
model the Back Office manages, not fixtures the frontend special-cases: they
appear under Admin → Teen Patti, they can be edited, unpublished or deleted
there like any other event, and the public page picks them up through the
normal /api/teen-patti/ list.

Dates are computed relative to the moment the migration runs rather than
hardcoded, so a deploy in any month produces a sensible spread — three events
already under way and four ahead of them. `status` is left on the auto-managed
"published" value and the live/upcoming/completed split is derived from those
dates on every read (TeenPattiEvent.derive_status), so nothing here has to
claim a status that will later be untrue; the live ones roll over to completed
on their own once their end date passes.

Idempotent via get_or_create on `name`, so re-running is a no-op, and the
reverse deletes only these seven names — an admin's own events, and any edits
made to these, are never touched. Deliberately no image/banner: this project
has repeatedly lost uploaded media on instance replacement, and a seeded row
pointing at a file nobody uploaded would render as a broken image. The cards
already handle an imageless event.
"""
from datetime import datetime, time as dt_time, timedelta
from decimal import Decimal

from django.db import migrations
from django.utils import timezone


# (name, event_type, country, city, venue, day_offset, duration_days,
#  start_hh, end_hh, entry_fee, prize_pool, max_participants, featured, short, long)
EVENTS = [
    # ── Under way now. Each of these starts on an earlier day and ends on a
    #    later one, so they read as live at any hour the migration runs — a
    #    start time later today would leave them "upcoming" until it passed.
    ("Teen Patti Royal Night", "Tournament", "India", "Goa", "Deltin Royale",
     -1, 3, 20, 2, "250.00", "25000.00", 120, True,
     "Three nights of high-stakes Teen Patti aboard Goa's flagship floating casino.",
     "Our signature Teen Patti tournament returns to Deltin Royale for three consecutive "
     "nights. Rebuys stay open through the first two levels each evening, and the final "
     "table plays out live on the top deck."),

    ("VIP Teen Patti Championship", "Championship", "Sri Lanka", "Colombo", "Bellagio Casino",
     -1, 3, 19, 1, "500.00", "60000.00", 80, True,
     "An invitation-tier championship for Colombo's highest-volume Teen Patti players.",
     "The VIP Championship runs across two evenings at Bellagio Casino. Seats are limited "
     "to eighty players, with hospitality, table service and a dedicated host included in "
     "the entry."),

    ("Midnight Teen Patti Masters", "Masters", "Nepal", "Kathmandu", "Casino Mahjong",
     -2, 4, 23, 4, "150.00", "12000.00", 60, False,
     "A single overnight session — one seat, one buy-in, last player standing.",
     "Freezeout format with no rebuys. Registration closes at midnight and play continues "
     "until a single player holds every chip on the floor."),

    # ── Ahead: comfortably in the future ─────────────────────────────────
    ("Teen Patti Gold Tournament", "Tournament", "India", "Goa", "Big Daddy Casino",
     6, 2, 18, 0, "300.00", "40000.00", 150, True,
     "Two days of tournament Teen Patti with a guaranteed gold-tier prize pool.",
     "The Gold Tournament runs a deep structure across two days, with day-one flights "
     "seating a hundred and fifty players and the survivors returning for the day-two "
     "final."),

    ("Royal Table Challenge", "Challenge", "Sri Lanka", "Colombo", "Casino Marina",
     13, 1, 20, 2, "200.00", "18000.00", 90, False,
     "A one-night challenge event played entirely at the Royal Tables.",
     "Every seat is at a Royal Table from the first hand. Ninety players, one evening, "
     "and a prize pool that pays the top twelve finishers."),

    ("High Stakes Teen Patti Night", "High Roller", "Nepal", "Kathmandu", "Casino Royale",
     20, 1, 21, 3, "1000.00", "100000.00", 40, True,
     "Forty seats, four figures to enter, six figures on the table.",
     "The highest buy-in Teen Patti event on our calendar. Forty seats only, with the "
     "full prize pool paid across the final table."),

    ("VIP Teen Patti Weekend", "Weekend Series", "India", "Sikkim", "Casino Deltin Denzong",
     27, 3, 17, 1, "750.00", "150000.00", 100, True,
     "A full weekend series in Sikkim — three days, three formats, one leaderboard.",
     "Turbo on Friday, deep-stack on Saturday, freezeout on Sunday, with a leaderboard "
     "running across all three. Entry covers every day of the series."),
]

SEEDED_NAMES = [row[0] for row in EVENTS]


def seed_events(apps, schema_editor):
    TeenPattiEvent = apps.get_model("authapp", "TeenPattiEvent")
    Casino = apps.get_model("authapp", "Casino")
    today = timezone.now().date()

    for (name, event_type, country, city, venue, day_offset, duration, start_hh,
         end_hh, entry_fee, prize_pool, max_participants, featured, short, long_desc) in EVENTS:
        start_date = today + timedelta(days=day_offset)
        end_date = start_date + timedelta(days=max(duration - 1, 0))

        # Link the managed Casino row when one matches, so the event joins the
        # existing venue catalogue instead of sitting on free text alone.
        # `venue` is populated either way as the human-readable fallback.
        casino = Casino.objects.filter(country=country, name=venue).first()

        # Write the status the dates already imply rather than leaving every
        # row on "published" for the promoter to correct later. That promoter
        # (services/teenpatti_service.refresh_event_statuses, run by the
        # sync_teenpatti_statuses command) still owns this column from here on
        # and moves these to completed in its own time. This only avoids
        # seeding a row that is under way while claiming it has not started —
        # which is exactly what the public ?status= filter reads.
        starts_at = timezone.make_aware(
            datetime.combine(start_date, dt_time(hour=start_hh)),
            timezone.get_default_timezone(),
        )
        ends_at = timezone.make_aware(
            datetime.combine(end_date, dt_time(hour=end_hh) if end_hh else dt_time.max),
            timezone.get_default_timezone(),
        )
        now = timezone.now()
        if now < starts_at:
            seeded_status = "published"
        elif now <= ends_at:
            seeded_status = "live"
        else:
            seeded_status = "completed"

        TeenPattiEvent.objects.get_or_create(
            name=name,
            defaults={
                "description": long_desc,
                "short_description": short,
                "country": country,
                "city": city,
                "casino": casino,
                "venue": venue,
                "start_date": start_date,
                "end_date": end_date,
                "start_time": f"{start_hh:02d}:00:00",
                # An end hour lower than the start hour means the session runs
                # past midnight; end_date already carries the extra day.
                "end_time": f"{end_hh:02d}:00:00",
                "entry_fee": Decimal(entry_fee),
                "currency": "USD",
                "prize_pool": Decimal(prize_pool),
                "max_participants": max_participants,
                "current_participants": 0,
                "event_type": event_type,
                "status": seeded_status,
                "is_featured": featured,
                "is_active": True,
                "registration_open": True,
            },
        )


def unseed_events(apps, schema_editor):
    """Removes only the seven rows this migration introduced, by name. An
    event an admin created — or one of these that was renamed — is left
    alone."""
    TeenPattiEvent = apps.get_model("authapp", "TeenPattiEvent")
    TeenPattiEvent.objects.filter(name__in=SEEDED_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0067_manual_bonus_commission"),
    ]

    operations = [
        migrations.RunPython(seed_events, unseed_events),
    ]
