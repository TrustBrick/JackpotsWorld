# Scheduled jobs

Three periodic jobs keep Poker and Teen Patti current. All three are **Django
management commands**, not Celery tasks — this deployment has no Celery broker
or worker process, and introducing one for three cron-shaped jobs would mean a
new always-on process (and cost) for no functional gain. Every command is
idempotent and safe to run repeatedly or concurrently with itself.

| Command | Suggested cadence | What it does |
|---|---|---|
| `python manage.py sync_poker` | hourly | Fetches every enabled `PokerSource`, normalises + dedupes results into `PENDING_REVIEW`, writes a `PokerSyncLog` per source, notifies staff. Also refreshes event statuses. |
| `python manage.py sync_poker --statuses-only` | every 15 min | Refreshes only upcoming/live/completed from event dates. Cheap; no outbound requests. |
| `python manage.py sync_teenpatti_statuses` | every 15 min | Promotes Teen Patti events published → upcoming → live → completed, notifying registrants when an event goes live. |
| `python manage.py sync_teenpatti_statuses --remind` | once daily | The above, plus a "your event starts soon" notification for events inside the next 24h. |
| `python manage.py sweep_expired_calls` | every minute | VOICE-CALL: marks voice calls whose ring window has lapsed as `missed`. Cheap; no outbound requests. |

`sweep_expired_calls` is a safety net rather than the primary mechanism. Every
read path already expires a lapsed call lazily
(`voice_call_service.expire_if_due`), so this only matters for a ring nobody
ever looks at again — a customer whose browser died mid-call with no agent
opening the panel. Without it that row stays `ringing`, holding its
conversation's single active-call slot and blocking the next call. Unlike the
sync jobs below it is safe to run on every instance: each transition is a
conditional `UPDATE` against a still-ringing row and it sends no
notifications.

A failing source never aborts a run: `sync_poker` catches per source, records
the error on `PokerSource.error_message` and in `PokerSyncLog`, and continues.

## Elastic Beanstalk

EB has no built-in scheduler for a web tier, so use cron on the instance. Add
a `.ebextensions` file (this repo does not ship one — enable it deliberately,
since a second instance would otherwise double-run the jobs):

```yaml
# .ebextensions/02_cron.config
files:
  "/etc/cron.d/jackpotsworld_sync":
    mode: "000644"
    owner: root
    group: root
    content: |
      # m h dom mon dow user command
      0  *    * * * root . /var/app/venv/*/bin/activate && cd /var/app/current && python manage.py sync_poker >> /var/log/jw_sync.log 2>&1
      */15 *  * * * root . /var/app/venv/*/bin/activate && cd /var/app/current && python manage.py sync_teenpatti_statuses >> /var/log/jw_sync.log 2>&1
      30 6    * * * root . /var/app/venv/*/bin/activate && cd /var/app/current && python manage.py sync_teenpatti_statuses --remind >> /var/log/jw_sync.log 2>&1

commands:
  remove_old_cron:
    command: "rm -f /etc/cron.d/jackpotsworld_sync.bak"
```

**If the environment is ever scaled past one instance**, move these to a
dedicated EB *worker* environment (or gate them on the leader instance);
otherwise every instance runs every job, which would produce duplicate
"starting soon" notifications. The sync itself is safe — ingest is keyed on
`(source, source_event_id)` — but notifications are not deduplicated.

## Running manually

```bash
python manage.py sync_poker --source 3          # one source only
python manage.py sync_poker --no-notify         # skip the staff notification
python manage.py sync_teenpatti_statuses --remind --within-hours 48
```

An admin can also trigger a sync from the Back Office (**Manage Poker →
Sources → Sync now / Sync All**), which runs the same code path synchronously.

## Limitations

- **No free structured poker-event source exists.** WSOP, PokerStars, GGPoker,
  Triton and WPT publish no open event API, and their schedule pages are
  ToS-protected — this codebase deliberately ships no HTML-scraping connector.
  Public poker RSS is *news*, not calendars: it yields a title, date and link,
  so those events land in `PENDING_REVIEW` with blank buy-in/venue/prize-pool
  for an admin to complete. **Manual Back Office entry is the primary path.**
- A licensed/paid feed can be added later as one new connector class in
  `authapp/services/poker_sources/` plus a `PokerSource` row — no change to
  the ingest pipeline, review workflow or UI.
- `settings.POKER_RSS_FEEDS` is still honoured: any URL listed there is adopted
  as a `PokerSource` on the first sync run, so the previous configuration keeps
  working.
