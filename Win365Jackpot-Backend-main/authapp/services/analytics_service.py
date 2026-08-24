"""
authapp/services/analytics_service.py
─────────────────────────────────────────────────────────────────────────────
ANALYTICS: ingestion + aggregation. All numbers the Admin dashboard shows come
from here, computed from real AnalyticsEvent rows — nothing is hard-coded, and
an empty database yields zeros, never demo figures.

Design notes:
  • Identity is ALWAYS derived server-side. `user` comes from the request's
    JWT (request.user); the client cannot set it. Anonymous visitors get a
    privacy-safe id from utils/anonymous_id. So a client can never attribute an
    event to another member.
  • No scheduler exists in this project (see the inspection report), so
    aggregation is computed on demand and cached in the existing DatabaseCache
    with a short TTL — never precomputed by a cron/Celery job.
  • Overview / URL / campaign rollups use COUNT/DISTINCT queries. Video metrics
    (retention, watch time) are reduced in Python from the (indexed, date- and
    content-scoped) event rows, to stay correct and portable rather than
    leaning on fragile JSON aggregation in the DB.
  • VISITOR-ANALYTICS: every ingested event now resolves to a Visitor and a
    VisitorSession (services/visitor_service.py) carrying the IP and the
    approximate location, and country/region/city are attached to EVERY event
    type rather than video ones only. Country no longer depends on a
    Cloudflare header being present — see the ingestion section below for the
    three defects that arrangement caused. None of it is ever accepted from
    the client; all of it is derived server-side.
"""
from datetime import datetime, time, timedelta

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone

from authapp.models.analytics_models import (
    AnalyticsEvent, Campaign, Visitor, VisitorSession,
    EVENT_PAGE_VIEW, EVENT_URL_CLICK, EVENT_CLICK, EVENT_VIDEO_START,
    EVENT_VIDEO_PROGRESS, EVENT_VIDEO_COMPLETE, EVENT_VIDEO_CLICK,
    EVENT_VIDEO_CTA_CLICK, EVENT_VIDEO_IMPRESSION, EVENT_VIDEO_PAUSE,
    EVENT_VIDEO_EXIT, EVENT_SIGNUP, EVENT_LOGIN, VIDEO_MILESTONES,
    CLICK_EVENT_TYPES,
    GEO_STATUS_SUCCESS, GEO_STATUS_PRIVATE_IP,
)
from authapp.services import visitor_service
from authapp.utils.anonymous_id import derive_anonymous_id
from authapp.utils.bot_detection import is_bot
from authapp.utils.user_agent import classify_user_agent

CONTENT_TYPE_VIDEO = "video"
VIDEO_CLICK_EVENT_TYPES = (EVENT_VIDEO_CLICK, EVENT_VIDEO_CTA_CLICK)

# Dashboard reads are cached briefly. Short enough that "real-time-ish" still
# holds, long enough to absorb a dashboard refresh storm.
_CACHE_TTL_SECONDS = 60

# The ANALYTICS_RESOLVE_LOCATION escape hatch still exists — it moved to
# utils/geolocation.py (GEO_LOOKUP_ENABLED), next to the call it actually
# guards, along with the geo cache that used to live here.


# ── Ingestion ────────────────────────────────────────────────────────────────
# Location resolution moved to services/visitor_service.py + utils/geolocation.py.
#
# WHAT CHANGED AND WHY — the previous implementation resolved region/city here,
# cached per SESSION, and read country from Cloudflare's CF-IPCountry header
# alone. Three defects came out of that arrangement and all three are fixed by
# the move:
#   1. CF-IPCountry is only sent when a zone has the "Add visitor location
#      headers" Managed Transform enabled, which is OFF by default. With it
#      off, country was permanently blank — and location_report then dropped
#      every row with `.exclude(country="")`, so the whole dashboard read
#      empty even for visitors whose city HAD resolved.
#   2. resolve_geo_location() already returned the provider's own country and
#      this module threw it away, so the one value that could have covered for
#      (1) was discarded.
#   3. Caching per session meant a returning visitor, and every visitor behind
#      a shared NAT, each paid a fresh external call — and a blank session id
#      disabled the cache entirely. It is now cached per IP, which is what the
#      provider's rate limit is actually counted against.
# Location is now resolved for EVERY event type, not just video ones, because
# a visitor list without locations was the original complaint.


def _visitor_key_for(request, provided_anonymous_id):
    """The opaque id identifying this browser. Client-supplied when valid,
    otherwise the salted daily IP+UA fallback — unchanged from before."""
    return derive_anonymous_id(request, provided_anonymous_id)


def match_campaign(utm_campaign, utm_source=None):
    """Resolve a defined Campaign from an inbound UTM. utm_campaign is the
    primary key; utm_source disambiguates if two campaigns share a name.
    Returns None for a UTM with no formal campaign — the event still keeps its
    raw utm_* so source/campaign analytics work regardless."""
    utm_campaign = (utm_campaign or "").strip()
    if not utm_campaign:
        return None
    qs = Campaign.objects.filter(utm_campaign=utm_campaign)
    if utm_source:
        exact = qs.filter(utm_source=utm_source).first()
        if exact:
            return exact
    return qs.first()


def _trim(v, n):
    return (v or "")[:n]


def record_event(request, *, event_type, content_type="", content_id="", url="",
                 referrer="", source="", utm=None, metadata=None,
                 anonymous_id=None, session_id="", campaign=None,
                 client_event_id=None, context=None, element_id="",
                 element_type="", element_label="", destination_url=""):
    """Persist one event with server-derived identity and context. Returns the
    row, or None if the request was filtered as a bot (§32).

    VIDEO-CLICK-ANALYTICS idempotency: when `client_event_id` is given, this
    is get_or_create rather than create — a retry, a duplicate React-effect
    fire, or a network-level resend that repeats the same key returns the
    original row instead of inserting a second one. The uniqueness is a real
    database constraint (see AnalyticsEvent.Meta), so this is safe even
    against two near-simultaneous requests, not just sequential ones. Absent
    (None) — the default, and every event type that doesn't request one —
    behaves exactly as before: a plain, unconditional insert.
    """
    ua = request.META.get("HTTP_USER_AGENT", "")
    if is_bot(ua):
        return None

    user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
    # The visitor key identifies the BROWSER and is always derived, whether or
    # not a member is signed in — a Visitor row is a device, not a person, so
    # a logged-in visit still belongs to one. `anonymous_id` on the event keeps
    # its original meaning (only set when there is no member) so every existing
    # unique-visitor aggregation counts exactly what it always did.
    visitor_key = _visitor_key_for(request, anonymous_id)
    anon = "" if user is not None else visitor_key

    utm = utm or {}
    if campaign is None:
        campaign = match_campaign(utm.get("utm_campaign"), utm.get("utm_source"))

    # LOCATION-ANALYTICS: resolved for every event type now, not just video —
    # see the note above _visitor_key_for. `context` is passed in by
    # record_batch so one ingest request resolves this once, not once per
    # event; a lone call (the campaign redirect, signup, login) resolves here.
    if context is None:
        context = visitor_service.build_context(
            request, visitor_key=visitor_key, session_key=_trim(session_id, 64) or visitor_key,
            referrer=referrer, landing_page=url, utm=utm,
        )

    if context is not None:
        device, browser, os_name = context.device_type, context.browser, context.operating_system
        country, country_name = context.country_code, context.country_name
        region, city = context.region, context.city
        visitor, session = context.visitor, context.session
    else:
        # Visitor resolution failed (a database problem). Still record the
        # event with everything we can derive without a write — losing the
        # location is far better than losing the event.
        device, browser, os_name = classify_user_agent(ua)
        country = visitor_service.cf_country(request)
        country_name, region, city = "", "", ""
        visitor, session = None, None

    fields = dict(
        user=user,
        anonymous_id=anon,
        session_id=_trim(session_id, 64),
        visitor=visitor,
        visitor_session=session,
        content_type=_trim(content_type, 40),
        content_id=_trim(str(content_id or ""), 120),
        url=_trim(url, 500),
        referrer=_trim(referrer, 500),
        source=_trim(source, 120),
        element_id=_trim(element_id, 120),
        element_type=_trim(element_type, 40),
        element_label=_trim(element_label, 200),
        destination_url=_trim(destination_url, 500),
        campaign=campaign,
        utm_source=_trim(utm.get("utm_source"), 100),
        utm_medium=_trim(utm.get("utm_medium"), 100),
        utm_campaign=_trim(utm.get("utm_campaign"), 150),
        utm_content=_trim(utm.get("utm_content"), 150),
        utm_term=_trim(utm.get("utm_term"), 150),
        device_type=_trim(device, 20),
        browser=_trim(browser, 40),
        operating_system=_trim(os_name, 40),
        country=_trim(country, 2),
        country_name=_trim(country_name, 100),
        region=_trim(region, 100),
        city=_trim(city, 100),
        metadata=metadata if isinstance(metadata, dict) else {},
    )

    client_event_id = (client_event_id or "").strip()[:64] or None
    if client_event_id is not None:
        obj, _created = AnalyticsEvent.objects.get_or_create(
            event_type=event_type, client_event_id=client_event_id, defaults=fields,
        )
        return obj
    return AnalyticsEvent.objects.create(event_type=event_type, client_event_id=None, **fields)


def record_batch(request, events):
    """Record a batch of validated ingest payloads, resolving the visitor and
    their location exactly ONCE for the whole request.

    This is the difference between one geolocation resolution per browser and
    one per event. A page load typically ships a page_view plus a handful of
    video milestones in a single POST; resolving per event would multiply
    every database write and cache read in visitor_service by the batch size
    for no new information, since every event in a batch comes from the same
    browser by construction (see services/analytics.js's baseEvent, which
    stamps the same visitor/session id on all of them).

    Events that disagree about identity — which should not happen, but a
    hand-crafted POST could — are grouped, and each distinct identity gets its
    own resolution. Returns the number of events actually recorded.

    `events` is a list of dicts as produced by AnalyticsEventIngestSerializer.
    Bots are dropped inside record_event and simply never count.
    """
    ua = request.META.get("HTTP_USER_AGENT", "")
    if is_bot(ua):
        return 0

    contexts = {}
    recorded = 0

    for d in events:
        visitor_key = _visitor_key_for(request, d.get("anonymous_id"))
        session_key = _trim(d.get("session_id"), 64) or visitor_key
        cache_key = (visitor_key, session_key)

        if cache_key not in contexts:
            utm = _utm_of(d)
            contexts[cache_key] = visitor_service.build_context(
                request,
                visitor_key=visitor_key,
                session_key=session_key,
                referrer=d.get("referrer", ""),
                landing_page=d.get("url", ""),
                utm=utm,
            )

        ev = record_event(
            request,
            event_type=d["event_type"],
            content_type=d.get("content_type", ""),
            content_id=d.get("content_id", ""),
            url=d.get("url", ""),
            referrer=d.get("referrer", ""),
            source=d.get("source", ""),
            utm=_utm_of(d),
            metadata=d.get("metadata") or {},
            anonymous_id=d.get("anonymous_id"),
            session_id=d.get("session_id", ""),
            client_event_id=d.get("client_event_id"),
            element_id=d.get("element_id", ""),
            element_type=d.get("element_type", ""),
            element_label=d.get("element_label", ""),
            destination_url=d.get("destination_url", ""),
            context=contexts[cache_key],
        )
        if ev is not None:
            recorded += 1

    return recorded


def _utm_of(d):
    return {
        "utm_source": d.get("utm_source", ""),
        "utm_medium": d.get("utm_medium", ""),
        "utm_campaign": d.get("utm_campaign", ""),
        "utm_content": d.get("utm_content", ""),
        "utm_term": d.get("utm_term", ""),
    }


def record_click(request, campaign, *, session_id="", anonymous_id="", client_event_id=None):
    """Record a url_click for a trackable campaign link (the redirect view
    calls this, then 302s to the campaign's backend-controlled destination)."""
    return record_event(
        request,
        event_type=EVENT_URL_CLICK,
        content_type="campaign",
        content_id=str(campaign.id),
        url=campaign.destination_url,
        # Also recorded as the click's destination so a campaign link shows up
        # in the click dashboard's element/destination breakdowns alongside
        # ordinary clicks, rather than only in the campaign report.
        destination_url=campaign.destination_url,
        element_id=f"campaign:{campaign.tracking_id}",
        element_type="campaign_link",
        element_label=campaign.name,
        source=campaign.utm_source,
        utm={
            "utm_source": campaign.utm_source, "utm_medium": campaign.utm_medium,
            "utm_campaign": campaign.utm_campaign, "utm_content": campaign.utm_content,
            "utm_term": campaign.utm_term,
        },
        campaign=campaign,
        session_id=session_id,
        anonymous_id=anonymous_id,
        client_event_id=client_event_id,
    )


# ── Date ranges ──────────────────────────────────────────────────────────────
def resolve_range(range_key=None, start=None, end=None):
    """Return (start_dt, end_dt) as an aware [start, end) window. Presets:
    today, yesterday, 7d, 30d, this_month, last_month. `custom` uses start/end
    (YYYY-MM-DD, inclusive). Defaults to the last 30 days."""
    tz = timezone.get_current_timezone()
    today = timezone.localdate()

    def day_start(d):
        return timezone.make_aware(datetime.combine(d, time.min), tz)

    def next_day(d):
        return day_start(d + timedelta(days=1))

    key = (range_key or "30d").lower()
    if key == "today":
        return day_start(today), next_day(today)
    if key == "yesterday":
        y = today - timedelta(days=1)
        return day_start(y), next_day(y)
    if key in ("7d", "last_7_days", "7"):
        return day_start(today - timedelta(days=6)), next_day(today)
    if key in ("30d", "last_30_days", "30"):
        return day_start(today - timedelta(days=29)), next_day(today)
    if key == "this_month":
        return day_start(today.replace(day=1)), next_day(today)
    if key == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return day_start(last_prev.replace(day=1)), day_start(first_this)
    if key == "custom" and start and end:
        try:
            s = datetime.strptime(start, "%Y-%m-%d").date()
            e = datetime.strptime(end, "%Y-%m-%d").date()
            return day_start(s), next_day(e)
        except ValueError:
            pass
    return day_start(today - timedelta(days=29)), next_day(today)


def _events(start_dt, end_dt):
    return AnalyticsEvent.objects.filter(created_at__gte=start_dt, created_at__lt=end_dt)


# ── Unique counting (no anonymous↔member stitching, by decision) ─────────────
def _visitor_key(user_id, anonymous_id):
    return f"u{user_id}" if user_id else (anonymous_id or "")


def _unique_from_qs(qs):
    """(unique_visitors, unique_members) over a queryset, DB-side distinct."""
    member_ids = set(
        qs.filter(user__isnull=False).order_by().values_list("user_id", flat=True).distinct()
    )
    anon_ids = set(
        qs.filter(user__isnull=True).exclude(anonymous_id="")
          .order_by().values_list("anonymous_id", flat=True).distinct()
    )
    return len(member_ids) + len(anon_ids), len(member_ids)


def _cache_get_or_set(cache_key, producer):
    # Resilient by design: if the cache is unavailable (e.g. the DatabaseCache
    # table hasn't been created — createcachetable is a deploy step, not a
    # migration), analytics still works, just uncached, rather than 500ing.
    try:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        return producer()
    value = producer()
    try:
        cache.set(cache_key, value, _CACHE_TTL_SECONDS)
    except Exception:
        pass
    return value


def _rng_key(start_dt, end_dt):
    return f"{int(start_dt.timestamp())}_{int(end_dt.timestamp())}"


# ── Overview ─────────────────────────────────────────────────────────────────
def overview(start_dt, end_dt):
    def produce():
        qs = _events(start_dt, end_dt)
        page_views = qs.filter(event_type=EVENT_PAGE_VIEW)
        clicks = qs.filter(event_type=EVENT_URL_CLICK)
        # VISITOR-ANALYTICS: every kind of click, not just campaign-redirect
        # ones. `clicks` above stays scoped to url_click so total_url_clicks
        # keeps its original meaning for anything already reading it.
        all_clicks = qs.filter(event_type__in=CLICK_EVENT_TYPES)
        signups = qs.filter(event_type=EVENT_SIGNUP)

        unique_visitors, unique_members = _unique_from_qs(qs)
        click_unique_v, _ = _unique_from_qs(clicks)
        all_click_unique_v, _ = _unique_from_qs(all_clicks)

        # VIDEO ANALYTICS summary block. Goes through the same _reduce_video
        # used by videos_report/video_detail (not a second, parallel
        # computation) so "Completion Rate" and "CTR" mean exactly the same
        # thing here as they do on the Video Analytics tab — across every
        # video combined, since this card isn't scoped to one video.
        video_rows = _video_events(start_dt, end_dt).values_list(
            "event_type", "user_id", "anonymous_id", "metadata",
        )
        vm = _reduce_video(video_rows)

        return {
            # "Total Visitors" = distinct sessions (visits); "Unique Visitors"
            # = distinct people. Documented so the two cards never read as a
            # contradiction.
            "total_visitors": qs.exclude(session_id="").order_by().values("session_id").distinct().count(),
            "unique_visitors": unique_visitors,
            "unique_members": unique_members,
            "total_page_views": page_views.count(),
            "total_url_clicks": clicks.count(),
            "unique_clickers": click_unique_v,
            "total_clicks": all_clicks.count(),
            "unique_all_clickers": all_click_unique_v,
            "total_video_views": vm["total_views"],
            "unique_video_viewers": vm["unique_viewers"],
            "video_completion_rate": vm["completion_rate"],
            "total_video_clicks": vm["total_clicks"],
            "unique_video_clickers": vm["unique_clickers"],
            "video_ctr": vm["ctr"],
            "avg_video_watch_seconds": vm["avg_watch_seconds"],
            "new_members": signups.count(),
        }

    return _cache_get_or_set(f"analytics:overview:{_rng_key(start_dt, end_dt)}", produce)


# ── URL / source analytics ───────────────────────────────────────────────────
def urls_report(start_dt, end_dt):
    """One row per (utm_source, utm_medium, utm_campaign) seen in the window,
    covering both formally-defined campaigns and raw UTM traffic."""
    def produce():
        qs = _events(start_dt, end_dt).exclude(utm_campaign="")
        keys = qs.order_by().values_list("utm_source", "utm_medium", "utm_campaign").distinct()
        rows = []
        for source, medium, campaign in keys:
            group = qs.filter(utm_source=source, utm_medium=medium, utm_campaign=campaign)
            uv, um = _unique_from_qs(group)
            last = group.order_by("-created_at").values_list("created_at", flat=True).first()
            rows.append({
                "source": source, "medium": medium, "campaign": campaign,
                "clicks": group.filter(event_type=EVENT_URL_CLICK).count(),
                "unique_visitors": uv,
                "unique_members": um,
                "page_views": group.filter(event_type=EVENT_PAGE_VIEW).count(),
                "video_views": group.filter(event_type=EVENT_VIDEO_START).count(),
                "registrations": group.filter(event_type=EVENT_SIGNUP).count(),
                "last_activity": last.isoformat() if last else None,
            })
        rows.sort(key=lambda r: r["clicks"] + r["page_views"], reverse=True)
        return rows

    return _cache_get_or_set(f"analytics:urls:{_rng_key(start_dt, end_dt)}", produce)


# ── Campaign analytics (defined Campaign rows) ───────────────────────────────
def campaigns_report(start_dt, end_dt):
    def produce():
        rows = []
        for c in Campaign.objects.all():
            group = _events(start_dt, end_dt).filter(campaign=c)
            uv, um = _unique_from_qs(group)
            regs = group.filter(event_type=EVENT_SIGNUP).count()
            rows.append({
                "id": c.id, "name": c.name, "status": c.status,
                "utm_source": c.utm_source, "utm_medium": c.utm_medium,
                "utm_campaign": c.utm_campaign, "tracking_id": c.tracking_id,
                "destination_url": c.destination_url,
                "clicks": group.filter(event_type=EVENT_URL_CLICK).count(),
                "unique_visitors": uv,
                "page_views": group.filter(event_type=EVENT_PAGE_VIEW).count(),
                "video_views": group.filter(event_type=EVENT_VIDEO_START).count(),
                "registrations": regs,
                "conversion_rate": round(100.0 * regs / uv, 1) if uv else 0.0,
            })
        rows.sort(key=lambda r: r["clicks"], reverse=True)
        return rows

    return _cache_get_or_set(f"analytics:campaigns:{_rng_key(start_dt, end_dt)}", produce)


# ── Video analytics ──────────────────────────────────────────────────────────
def _video_events(start_dt, end_dt, content_id=None):
    qs = _events(start_dt, end_dt).filter(content_type=CONTENT_TYPE_VIDEO)
    if content_id is not None:
        qs = qs.filter(content_id=str(content_id))
    return qs


def _reduce_video(rows):
    """Python-side reduction over one video's events. Returns view/viewer/
    milestone/watch-time/click metrics. Milestones and clicks count DISTINCT
    viewers, so a duplicate event (should never happen — the client de-dupes,
    and client_event_id backs that with a real DB constraint for clicks) still
    cannot inflate anything.

    `rows` is (event_type, user_id, anonymous_id, metadata) tuples — one video
    scope at a time, so callers batch all of a window's video events in ONE
    query and group by content_id themselves (see videos_report) rather than
    calling this per-video-per-query.
    """
    starters, completers = set(), set()
    milestone_viewers = {m: set() for m in VIDEO_MILESTONES}
    play_clickers, cta_clickers = set(), set()
    total_views = 0
    total_play_clicks = 0
    total_cta_clicks = 0
    watch_by_viewer = {}  # visitor_key -> max watched seconds seen

    for ev_type, user_id, anon, meta in rows:
        vk = _visitor_key(user_id, anon)
        if ev_type == EVENT_VIDEO_START:
            total_views += 1
            starters.add(vk)
        elif ev_type == EVENT_VIDEO_COMPLETE:
            completers.add(vk)
        elif ev_type == EVENT_VIDEO_PROGRESS:
            pct = (meta or {}).get("percent")
            if pct in milestone_viewers:
                milestone_viewers[pct].add(vk)
        elif ev_type == EVENT_VIDEO_CLICK:
            total_play_clicks += 1
            play_clickers.add(vk)
        elif ev_type == EVENT_VIDEO_CTA_CLICK:
            total_cta_clicks += 1
            cta_clickers.add(vk)
        secs = (meta or {}).get("watched_seconds")
        if isinstance(secs, (int, float)) and secs >= 0:
            if vk not in watch_by_viewer or secs > watch_by_viewer[vk]:
                watch_by_viewer[vk] = secs

    unique_viewers = len(starters | completers | {v for s in milestone_viewers.values() for v in s})
    started = len(starters) or unique_viewers
    # "Completed" merges the explicit `ended` signal with reaching the 100%
    # playback milestone, so a viewer who scrubs straight to the end without
    # the element ever firing `ended` still counts (see VIDEO_MILESTONES).
    completed_viewers = completers | milestone_viewers.get(100, set())
    completed = len(completed_viewers)
    all_clickers = play_clickers | cta_clickers
    unique_clickers = len(all_clickers)
    total_clicks = total_play_clicks + total_cta_clicks
    avg_watch = round(sum(watch_by_viewer.values()) / len(watch_by_viewer), 1) if watch_by_viewer else 0.0
    return {
        "total_views": total_views,
        "unique_viewers": unique_viewers,
        "started": started,
        # Only the "reached N%" milestones below 100 — 100% is reported as
        # "completed" (merged with the `ended` event), matching how the
        # dashboard's own retention table is meant to read: 25/50/75% Reached,
        # then Completed, not a redundant near-duplicate "100% Reached" row.
        "milestones": {str(m): len(milestone_viewers[m]) for m in VIDEO_MILESTONES if m != 100},
        "completed": completed,
        "avg_watch_seconds": avg_watch,
        "completion_rate": round(100.0 * completed / started, 1) if started else 0.0,
        "total_clicks": total_clicks,
        "unique_clickers": unique_clickers,
        "play_clicks": total_play_clicks,
        "unique_play_clickers": len(play_clickers),
        "cta_clicks": total_cta_clicks,
        "unique_cta_clickers": len(cta_clickers),
        # CTR per the agreed definition: unique clickers / unique viewers, not
        # per-view — a viewer who plays a video three times and clicks once is
        # one click-through, not a third of one.
        "ctr": round(100.0 * unique_clickers / unique_viewers, 1) if unique_viewers else 0.0,
    }


def videos_report(start_dt, end_dt):
    def produce():
        # Single query over every video event in the window, grouped by
        # content_id in Python — NOT one query per video. The previous version
        # issued a query per distinct content_id (fine at a handful of videos,
        # but it's an N+1 that scales with catalogue size); this reads the
        # whole (indexed, date- and content_type-scoped) window once.
        qs = _video_events(start_dt, end_dt).exclude(content_id="")
        raw = qs.values_list("content_id", "event_type", "user_id", "anonymous_id", "metadata")

        by_video = {}
        for cid, ev_type, user_id, anon, meta in raw:
            by_video.setdefault(cid, []).append((ev_type, user_id, anon, meta))

        rows = []
        for vid, video_rows in by_video.items():
            m = _reduce_video(video_rows)
            rows.append({
                "content_id": vid,
                "total_views": m["total_views"],
                "unique_viewers": m["unique_viewers"],
                "reached_50": m["milestones"]["50"],
                "completed": m["completed"],
                "avg_watch_seconds": m["avg_watch_seconds"],
                "completion_rate": m["completion_rate"],
                "total_clicks": m["total_clicks"],
                "unique_clickers": m["unique_clickers"],
                "ctr": m["ctr"],
            })
        rows.sort(key=lambda r: r["total_views"], reverse=True)
        return rows

    return _cache_get_or_set(f"analytics:videos:{_rng_key(start_dt, end_dt)}", produce)


def video_detail(start_dt, end_dt, content_id):
    raw = list(
        _video_events(start_dt, end_dt, content_id)
        .values_list("event_type", "user_id", "anonymous_id", "metadata")
    )
    m = _reduce_video(raw)
    started = m["started"] or 1
    # Retention as a % of everyone who started, from real events.
    retention = [{"stage": "Started", "count": m["started"], "pct": 100.0}]
    for ms in VIDEO_MILESTONES:
        if ms == 100:
            continue
        c = m["milestones"][str(ms)]
        retention.append({"stage": f"{ms}%", "count": c, "pct": round(100.0 * c / started, 1)})
    retention.append({"stage": "Completed", "count": m["completed"], "pct": round(100.0 * m["completed"] / started, 1)})
    return {
        "content_id": str(content_id),
        "total_views": m["total_views"],
        "unique_viewers": m["unique_viewers"],
        "video_starts": m["started"],
        "avg_watch_seconds": m["avg_watch_seconds"],
        "completion_rate": m["completion_rate"],
        "retention": retention,
        "total_clicks": m["total_clicks"],
        "unique_clickers": m["unique_clickers"],
        "play_clicks": m["play_clicks"],
        "unique_play_clickers": m["unique_play_clickers"],
        "cta_clicks": m["cta_clicks"],
        "unique_cta_clickers": m["unique_cta_clickers"],
        "ctr": m["ctr"],
        "locations": location_report(start_dt, end_dt, content_id=content_id),
    }


# ── Location analytics ───────────────────────────────────────────────────────
def location_report(start_dt, end_dt, content_id=None):
    """Country -> region -> city breakdown of video viewers/clicks in the
    window. content_id=None covers every video (the dashboard's aggregate
    "Viewers by Country"); a specific content_id scopes it to one video (the
    per-video location panel). "Unknown" (never a fabricated value) covers a
    country/region/city that could not be resolved.

    NOTE — the `.exclude(country="")` that used to be on this query is gone,
    deliberately. It silently discarded every event whose country had not
    resolved, which (because country came only from a Cloudflare header that
    the zone was not sending) meant EVERY event: the report rendered empty
    even for visitors whose region and city had resolved perfectly well. An
    unresolved country is now its own "Unknown" bucket, so the numbers add up
    to the real total and a resolution problem is visible in the UI instead of
    being hidden as an absence.

    One query, Python-reduced — same shape as _reduce_video/videos_report,
    and for the same reason: this can group by however many distinct
    (country, region, city) combinations exist without adding a query per
    group."""
    def produce():
        qs = _video_events(start_dt, end_dt, content_id)
        raw = qs.values_list("country", "region", "city", "event_type", "user_id", "anonymous_id")

        tree = {}  # country -> region -> city -> {"viewers": set, "clicks": int, "clickers": set}
        for country, region, city, ev_type, user_id, anon in raw:
            country = country or "Unknown"
            region = region or "Unknown"
            city = city or "Unknown"
            vk = _visitor_key(user_id, anon)
            node = (
                tree.setdefault(country, {})
                    .setdefault(region, {})
                    .setdefault(city, {"viewers": set(), "clicks": 0, "clickers": set()})
            )
            if ev_type == EVENT_VIDEO_START:
                node["viewers"].add(vk)
            elif ev_type in VIDEO_CLICK_EVENT_TYPES:
                node["clicks"] += 1
                node["clickers"].add(vk)

        countries = []
        for country, regions in tree.items():
            country_viewers, country_clickers, country_clicks = set(), set(), 0
            region_rows = []
            for region, cities in regions.items():
                region_viewers, region_clickers, region_clicks = set(), set(), 0
                city_rows = []
                for city, d in cities.items():
                    city_rows.append({
                        "city": city,
                        "viewers": len(d["viewers"]),
                        "clicks": d["clicks"],
                        "unique_clickers": len(d["clickers"]),
                    })
                    region_viewers |= d["viewers"]
                    region_clickers |= d["clickers"]
                    region_clicks += d["clicks"]
                city_rows.sort(key=lambda r: r["viewers"], reverse=True)
                region_rows.append({
                    "region": region,
                    "viewers": len(region_viewers),
                    "clicks": region_clicks,
                    "unique_clickers": len(region_clickers),
                    "cities": city_rows,
                })
                country_viewers |= region_viewers
                country_clickers |= region_clickers
                country_clicks += region_clicks
            region_rows.sort(key=lambda r: r["viewers"], reverse=True)
            countries.append({
                "country": country,
                "viewers": len(country_viewers),
                "clicks": country_clicks,
                "unique_clickers": len(country_clickers),
                "regions": region_rows,
            })
        countries.sort(key=lambda r: r["viewers"], reverse=True)
        return countries

    scope = str(content_id) if content_id is not None else "all"
    return _cache_get_or_set(f"analytics:locations:{scope}:{_rng_key(start_dt, end_dt)}", produce)


# ── Member engagement ────────────────────────────────────────────────────────
def member_engagement(user, start_dt=None, end_dt=None):
    """Engagement summary for one authenticated member. Only the legitimate
    business signals — never message content or anything sensitive."""
    qs = AnalyticsEvent.objects.filter(user=user)
    if start_dt and end_dt:
        qs = qs.filter(created_at__gte=start_dt, created_at__lt=end_dt)
    watched = qs.filter(content_type=CONTENT_TYPE_VIDEO)
    # Sum the max watched-seconds per video (avoids double-counting a session's
    # repeated progress pings).
    per_video = {}
    for vid, meta in watched.values_list("content_id", "metadata"):
        secs = (meta or {}).get("watched_seconds")
        if isinstance(secs, (int, float)) and secs > 0:
            per_video[vid] = max(per_video.get(vid, 0), secs)
    last = qs.order_by("-created_at").values_list("created_at", flat=True).first()
    return {
        "user_id": user.id,
        "user_uid": getattr(user, "user_uid", ""),
        "email": user.email,
        "urls_clicked": qs.filter(event_type=EVENT_URL_CLICK).count(),
        "page_views": qs.filter(event_type=EVENT_PAGE_VIEW).count(),
        "videos_watched": watched.filter(event_type=EVENT_VIDEO_START).order_by().values("content_id").distinct().count(),
        "videos_completed": watched.filter(event_type=EVENT_VIDEO_COMPLETE).order_by().values("content_id").distinct().count(),
        "total_watch_seconds": round(sum(per_video.values()), 1),
        "logins": qs.filter(event_type=EVENT_LOGIN).count(),
        "last_activity": last.isoformat() if last else None,
    }


# ── Visitor analytics ────────────────────────────────────────────────────────
# Everything below reads Visitor / VisitorSession rows. It is the half the
# dashboard was missing entirely: the flat event table could count actions but
# could not answer "who came, from where, and what did they do while here".
#
# NOT CACHED, unlike the rollups above. These are filtered, paginated,
# operator-driven queries — an admin narrowing to one country and paging
# through the result wants the answer for the filter they just typed, not a
# 60-second-old answer for a different one. They are indexed instead (see
# Visitor.Meta / VisitorSession.Meta).

# Bounds every visitor-list page. A dashboard request must never be able to
# ask for the whole table.
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25


def _visitors_in_window(start_dt, end_dt):
    """Visitors with ANY activity in the window — last_seen inside it, not
    first_seen. A visitor who arrived last month and came back today belongs
    in today's report."""
    return Visitor.objects.filter(last_seen__gte=start_dt, last_seen__lt=end_dt)


def _apply_visitor_filters(qs, *, country=None, region=None, city=None,
                           device=None, source=None, search=None):
    """Admin filters, applied identically wherever visitors are listed or
    counted so a filtered list and a filtered total can never disagree."""
    if country:
        qs = qs.filter(country_code__iexact=country)
    if region:
        qs = qs.filter(region__iexact=region)
    if city:
        qs = qs.filter(city__iexact=city)
    if device:
        qs = qs.filter(device_type__iexact=device)
    if source:
        qs = qs.filter(traffic_source__icontains=source)
    if search:
        # Matches the visitor handle the admin actually sees, plus the address.
        qs = qs.filter(
            Q(visitor_id__icontains=search) | Q(ip_address__icontains=search)
        )
    return qs


def visitors_overview(start_dt, end_dt):
    """Top-line visitor KPIs for the window.

    Every number is a real count over stored rows. There is deliberately no
    "total visitors vs unique visitors" pair here: a visitor IS unique by
    definition (one row per browser), so publishing both would mean inventing
    a difference. The honest decomposition is new vs returning, which is what
    this returns.
    """
    visitors = _visitors_in_window(start_dt, end_dt)
    sessions = VisitorSession.objects.filter(
        started_at__gte=start_dt, started_at__lt=end_dt,
    )
    events = _events(start_dt, end_dt)

    visitor_count = visitors.count()
    new_visitors = visitors.filter(first_seen__gte=start_dt).count()

    click_qs = events.filter(event_type__in=CLICK_EVENT_TYPES)
    video_starts = events.filter(event_type=EVENT_VIDEO_START)

    return {
        "visitors": visitor_count,
        "new_visitors": new_visitors,
        # Derived, not separately counted, so the three can never disagree.
        "returning_visitors": max(0, visitor_count - new_visitors),
        "sessions": sessions.count(),
        "page_views": events.filter(event_type=EVENT_PAGE_VIEW).count(),
        "clicks": click_qs.count(),
        "unique_clickers": click_qs.exclude(visitor__isnull=True)
                                   .order_by().values("visitor_id").distinct().count(),
        "video_viewers": video_starts.exclude(visitor__isnull=True)
                                     .order_by().values("visitor_id").distinct().count(),
        "video_views": video_starts.count(),
        # Operational honesty: how much of the window's location data actually
        # resolved. An admin seeing "Unknown" everywhere can tell from this
        # whether the provider is failing or the traffic is genuinely local.
        "geo_resolved": visitors.filter(geo_status=GEO_STATUS_SUCCESS).count(),
        "geo_unresolved": visitors.exclude(geo_status=GEO_STATUS_SUCCESS).count(),
    }


def visitor_list(start_dt, end_dt, *, page=1, page_size=DEFAULT_PAGE_SIZE, **filters):
    """One page of the Recent Visitors table, newest activity first."""
    page = max(1, int(page or 1))
    page_size = min(MAX_PAGE_SIZE, max(1, int(page_size or DEFAULT_PAGE_SIZE)))

    qs = _apply_visitor_filters(_visitors_in_window(start_dt, end_dt), **filters)
    total = qs.count()

    offset = (page - 1) * page_size
    rows = list(qs.order_by("-last_seen")[offset:offset + page_size])

    # Per-visitor activity counts in ONE query for the whole page rather than
    # one query per row — the difference between 3 queries and 3 + 3N.
    counts = _activity_counts([v.id for v in rows], start_dt, end_dt)

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
        "results": [_visitor_row(v, counts.get(v.id, {})) for v in rows],
    }


def _activity_counts(visitor_ids, start_dt=None, end_dt=None):
    """{visitor_id: {page_views, clicks, video_views, ...}} for a set of
    visitors, in a single grouped query."""
    if not visitor_ids:
        return {}
    qs = AnalyticsEvent.objects.filter(visitor_id__in=visitor_ids)
    if start_dt and end_dt:
        qs = qs.filter(created_at__gte=start_dt, created_at__lt=end_dt)

    out = {}
    rows = (
        qs.order_by()
          .values("visitor_id", "event_type")
          .annotate(n=Count("id"))
    )
    for row in rows:
        bucket = out.setdefault(row["visitor_id"], {})
        bucket[row["event_type"]] = row["n"]
    return out


def _summarise_counts(by_type):
    return {
        "page_views": by_type.get(EVENT_PAGE_VIEW, 0),
        "clicks": sum(by_type.get(t, 0) for t in CLICK_EVENT_TYPES),
        "video_views": by_type.get(EVENT_VIDEO_START, 0),
        "video_completions": by_type.get(EVENT_VIDEO_COMPLETE, 0),
    }


def _visitor_row(v, by_type):
    """The list-row shape. IP included — this is only ever serialised by an
    admin-gated endpoint (see analytics_views.py)."""
    row = {
        "visitor_id": v.visitor_id,
        "short_id": v.short_id,
        "ip_address": v.ip_address,
        "location": v.location_label(),
        "country_code": v.country_code,
        "country_name": v.country_name,
        "region": v.region,
        "city": v.city,
        "geo_status": v.geo_status,
        "device_type": v.device_type,
        "browser": v.browser,
        "operating_system": v.operating_system,
        "traffic_source": v.traffic_source,
        "first_seen": v.first_seen.isoformat(),
        "last_seen": v.last_seen.isoformat(),
    }
    row.update(_summarise_counts(by_type))
    return row


# Human-readable labels for the timeline. Kept next to the timeline builder so
# a new event type shows up as its raw name (honest) rather than silently
# rendering blank.
_TIMELINE_LABELS = {
    EVENT_PAGE_VIEW: "PAGE_VIEW",
    EVENT_CLICK: "CLICK",
    EVENT_URL_CLICK: "URL_CLICK",
    EVENT_VIDEO_IMPRESSION: "VIDEO_IMPRESSION",
    EVENT_VIDEO_START: "VIDEO_START",
    EVENT_VIDEO_PROGRESS: "VIDEO_PROGRESS",
    EVENT_VIDEO_COMPLETE: "VIDEO_COMPLETE",
    EVENT_VIDEO_PAUSE: "VIDEO_PAUSE",
    EVENT_VIDEO_EXIT: "VIDEO_EXIT",
    EVENT_VIDEO_CLICK: "VIDEO_CLICK",
    EVENT_VIDEO_CTA_CLICK: "VIDEO_CTA_CLICK",
    EVENT_SIGNUP: "SIGNUP",
    EVENT_LOGIN: "LOGIN",
}

# A single visitor's timeline is bounded: a bot-ish or very long-lived visitor
# could otherwise have tens of thousands of events, and no admin reads that.
MAX_TIMELINE_EVENTS = 500


def visitor_detail(visitor_id, start_dt=None, end_dt=None):
    """Full profile + chronological timeline for one visitor, or None if no
    such visitor exists."""
    v = Visitor.objects.filter(visitor_id=visitor_id).first()
    if v is None:
        return None

    events = AnalyticsEvent.objects.filter(visitor=v)
    if start_dt and end_dt:
        events = events.filter(created_at__gte=start_dt, created_at__lt=end_dt)

    by_type = {}
    for row in events.order_by().values("event_type").annotate(n=Count("id")):
        by_type[row["event_type"]] = row["n"]

    sessions = list(v.sessions.order_by("-started_at")[:50])

    pages = list(
        events.filter(event_type=EVENT_PAGE_VIEW)
              .order_by().values("url").annotate(n=Count("id")).order_by("-n")[:50]
    )

    videos_viewed = (
        events.filter(event_type=EVENT_VIDEO_START)
              .order_by().values("content_id").distinct().count()
    )
    videos_completed = (
        events.filter(event_type=EVENT_VIDEO_COMPLETE)
              .order_by().values("content_id").distinct().count()
    )

    timeline = _build_timeline(events)

    detail = {
        "visitor_id": v.visitor_id,
        "short_id": v.short_id,
        "ip_address": v.ip_address,
        # Named so the UI cannot present it as a precise position. The
        # coordinates are a city centroid from an IP lookup — see
        # utils/geolocation.py.
        "approximate_location": v.location_label(),
        "country_code": v.country_code,
        "country_name": v.country_name,
        "region": v.region,
        "region_code": v.region_code,
        "city": v.city,
        "timezone": v.timezone_name,
        "latitude": v.latitude,
        "longitude": v.longitude,
        "isp": v.isp,
        "geo_status": v.geo_status,
        "first_seen": v.first_seen.isoformat(),
        "last_seen": v.last_seen.isoformat(),
        "device_type": v.device_type,
        "browser": v.browser,
        "operating_system": v.operating_system,
        "traffic_source": v.traffic_source,
        "referrer": v.first_referrer,
        "landing_page": v.landing_page,
        "utm_source": v.utm_source,
        "utm_medium": v.utm_medium,
        "utm_campaign": v.utm_campaign,
        "utm_content": v.utm_content,
        "utm_term": v.utm_term,
        "session_count": v.sessions.count(),
        "sessions": [
            {
                "session_id": s.session_id,
                "started_at": s.started_at.isoformat(),
                "last_activity_at": s.last_activity_at.isoformat(),
                "landing_page": s.landing_page,
                "referrer": s.referrer,
                "traffic_source": s.traffic_source,
                "location": s.location_label(),
                "ip_address": s.ip_address,
            }
            for s in sessions
        ],
        "pages_viewed": [{"url": p["url"], "views": p["n"]} for p in pages],
        "timeline": timeline,
        "timeline_truncated": len(timeline) >= MAX_TIMELINE_EVENTS,
    }
    detail.update(_summarise_counts(by_type))

    # Applied AFTER the shared summary, deliberately. _summarise_counts is
    # event-count based, which is right for the list ("how much activity"),
    # but on one visitor's profile "Videos Viewed: 3" has to mean three
    # DISTINCT videos — a viewer who re-watched one video is not three
    # viewings of three videos. Same for completions.
    detail["videos_viewed"] = videos_viewed
    detail["video_completions"] = videos_completed
    return detail


def _build_timeline(events):
    """Chronological activity for one visitor — what happened, when, where."""
    rows = events.order_by("-created_at")[:MAX_TIMELINE_EVENTS]
    out = []
    for e in rows:
        meta = e.metadata or {}
        entry = {
            "at": e.created_at.isoformat(),
            "event_type": e.event_type,
            "label": _TIMELINE_LABELS.get(e.event_type, e.event_type.upper()),
            "url": e.url,
            "session_id": e.session_id,
            # The location AS RECORDED AT THE TIME, from the event's own
            # columns rather than the visitor's current location — a visitor
            # who has since moved must not have their history rewritten.
            "location": _event_location(e),
        }
        if e.event_type in CLICK_EVENT_TYPES:
            entry["element_label"] = e.element_label
            entry["element_id"] = e.element_id
            entry["element_type"] = e.element_type
            entry["destination_url"] = e.destination_url
        if e.content_type == CONTENT_TYPE_VIDEO:
            entry["video_id"] = e.content_id
            entry["video_title"] = meta.get("title", "")
            if "percent" in meta:
                entry["percent"] = meta["percent"]
            if "watched_seconds" in meta:
                entry["watch_duration"] = meta["watched_seconds"]
            if "position" in meta:
                entry["watch_position"] = meta["position"]
        out.append(entry)
    return out


def _event_location(e):
    parts = [p for p in (e.city, e.region, e.country_name or e.country) if p]
    return ", ".join(parts) if parts else "Unknown"


# ── Location analytics (site-wide, all visitors) ─────────────────────────────
def visitor_locations(start_dt, end_dt, **filters):
    """Visitors by country -> region -> city, over ALL visitors in the window.

    Distinct from location_report() above, which answers a narrower question
    (where the VIDEO viewers were) and is driven by event rows. This one is
    driven by Visitor rows, so it covers everyone who came, whether or not
    they touched a video — which is what the "Visitors by Country" dashboard
    asks for.

    Unresolved values are bucketed as "Unknown" rather than dropped, so the
    country totals always add up to the visitor total. A row is never
    fabricated: if the provider never returned a city, the city is "Unknown",
    not a plausible one.
    """
    qs = _apply_visitor_filters(_visitors_in_window(start_dt, end_dt), **filters)

    rows = (
        qs.order_by()
          .values("country_code", "country_name", "region", "city", "geo_status")
          .annotate(n=Count("id"))
    )

    tree = {}
    for r in rows:
        # A private/local address is its own honest bucket — not "Unknown",
        # which would imply we tried to look it up and failed.
        if r["geo_status"] == GEO_STATUS_PRIVATE_IP:
            code, name = "--", "Local / Private Network"
        else:
            code = r["country_code"] or "??"
            name = r["country_name"] or r["country_code"] or "Unknown"
        region = r["region"] or "Unknown"
        city = r["city"] or "Unknown"

        country = tree.setdefault(code, {"country": name, "code": code, "visitors": 0, "regions": {}})
        country["visitors"] += r["n"]
        reg = country["regions"].setdefault(region, {"region": region, "visitors": 0, "cities": {}})
        reg["visitors"] += r["n"]
        cty = reg["cities"].setdefault(city, {"city": city, "visitors": 0})
        cty["visitors"] += r["n"]

    out = []
    for country in tree.values():
        regions = []
        for reg in country["regions"].values():
            cities = sorted(reg["cities"].values(), key=lambda c: c["visitors"], reverse=True)
            regions.append({"region": reg["region"], "visitors": reg["visitors"], "cities": cities})
        regions.sort(key=lambda r: r["visitors"], reverse=True)
        out.append({
            "country": country["country"],
            "country_code": country["code"],
            "visitors": country["visitors"],
            "regions": regions,
        })
    out.sort(key=lambda c: c["visitors"], reverse=True)
    return out


# ── Click analytics ──────────────────────────────────────────────────────────
def clicks_report(start_dt, end_dt, *, country=None, city=None, device=None, page_path=None):
    """Clicks broken down by element, page, country, city, device and day.

    "Unique clickers" everywhere means DISTINCT VISITORS, never distinct
    events — the two differ by exactly the repeat clicks that make a CTA look
    more popular than it is.
    """
    qs = _events(start_dt, end_dt).filter(event_type__in=CLICK_EVENT_TYPES)
    if country:
        qs = qs.filter(country__iexact=country)
    if city:
        qs = qs.filter(city__iexact=city)
    if device:
        qs = qs.filter(device_type__iexact=device)
    if page_path:
        qs = qs.filter(url__startswith=page_path)

    def group(field, label_key, limit=50):
        rows = (
            qs.order_by()
              .values(field)
              .annotate(clicks=Count("id"), unique_clickers=Count("visitor", distinct=True))
              .order_by("-clicks")[:limit]
        )
        return [
            {label_key: r[field] or "Unknown",
             "clicks": r["clicks"],
             "unique_clickers": r["unique_clickers"]}
            for r in rows
        ]

    # Clicks per day, for the trend line. Grouped in Python off a single
    # values_list rather than with TruncDate so the result is identical on
    # SQLite (tests) and MySQL (production) — database date functions differ
    # in their timezone handling, and a report that disagrees with itself
    # between environments is worse than one extra pass over the rows.
    per_day = {}
    for created in qs.order_by().values_list("created_at", flat=True):
        key = timezone.localtime(created).date().isoformat()
        per_day[key] = per_day.get(key, 0) + 1

    return {
        "total_clicks": qs.count(),
        "unique_clickers": qs.exclude(visitor__isnull=True)
                             .order_by().values("visitor_id").distinct().count(),
        "by_element": _clicks_by_element(qs),
        "by_page": group("url", "page"),
        "by_country": group("country", "country"),
        "by_city": group("city", "city"),
        "by_device": group("device_type", "device"),
        "over_time": [{"date": d, "clicks": n} for d, n in sorted(per_day.items())],
    }


def _clicks_by_element(qs, limit=50):
    """One row per tracked element, labelled by what the visitor actually saw.

    Grouped on element_id (stable) but displayed by element_label (readable),
    taking the most recent label seen for an id so a renamed button stays one
    row instead of splitting into two.
    """
    rows = list(
        qs.exclude(element_id="")
          .order_by()
          .values("element_id", "element_type")
          .annotate(clicks=Count("id"), unique_clickers=Count("visitor", distinct=True))
          .order_by("-clicks")[:limit]
    )
    if not rows:
        return []

    # Labels for the whole page in ONE query. Doing this per row would be a
    # query per element on a dashboard endpoint. Ordered oldest-first so that
    # later assignments win, leaving the MOST RECENT label for each id.
    labels = {}
    label_rows = (
        qs.filter(element_id__in=[r["element_id"] for r in rows])
          .exclude(element_label="")
          .order_by("created_at")
          .values_list("element_id", "element_label")
    )
    for element_id, label in label_rows:
        labels[element_id] = label

    return [
        {
            "element_id": r["element_id"],
            "element_type": r["element_type"],
            # Falls back to the id, never to a blank cell — an unlabelled
            # control is still identifiable.
            "element_label": labels.get(r["element_id"]) or r["element_id"],
            "clicks": r["clicks"],
            "unique_clickers": r["unique_clickers"],
        }
        for r in rows
    ]


# ── Per-video viewer locations ───────────────────────────────────────────────
def video_viewers(content_id, start_dt, end_dt, *, country=None, city=None, device=None):
    """Who watched one video, and from where.

    UNIQUE VIEWERS, explicitly: a viewer is counted ONCE per video no matter
    how many events their playback produced. video_start / 25 / 50 / 75 /
    complete are five events describing one person, and counting them as five
    viewers is exactly the miscount this exists to prevent — every number
    below counts DISTINCT visitors, never rows.
    """
    qs = _video_events(start_dt, end_dt, content_id)
    if country:
        qs = qs.filter(country__iexact=country)
    if city:
        qs = qs.filter(city__iexact=city)
    if device:
        qs = qs.filter(device_type__iexact=device)

    starts = qs.filter(event_type=EVENT_VIDEO_START)
    completes = qs.filter(event_type=EVENT_VIDEO_COMPLETE)

    def distinct_visitors(queryset):
        return queryset.exclude(visitor__isnull=True).order_by().values("visitor_id").distinct().count()

    by_country = (
        starts.order_by()
              .values("country", "country_name")
              .annotate(viewers=Count("visitor", distinct=True))
              .order_by("-viewers")
    )
    countries = []
    for r in by_country:
        code = r["country"] or ""
        cities = (
            starts.filter(country=code)
                  .order_by().values("city")
                  .annotate(viewers=Count("visitor", distinct=True))
                  .order_by("-viewers")[:25]
        )
        countries.append({
            "country_code": code or "??",
            "country": r["country_name"] or code or "Unknown",
            "viewers": r["viewers"],
            "cities": [
                {"city": c["city"] or "Unknown", "viewers": c["viewers"]}
                for c in cities
            ],
        })

    return {
        "video_id": content_id,
        "total_views": starts.count(),
        "unique_viewers": distinct_visitors(starts),
        "completed": distinct_visitors(completes),
        "by_country": countries,
    }
