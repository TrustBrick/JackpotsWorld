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
  • VIDEO-CLICK-ANALYTICS / LOCATION-ANALYTICS: video_click and video_cta_click
    are recorded exactly like video_start/progress/complete — no new ingest
    path. Region/city are resolved server-side in record_event() via the
    existing utils/geolocation.py IP lookup (see _resolve_region_city below
    for the caching that makes this safe to call from a public, high-volume
    endpoint); country stays the free, instant Cloudflare header it always
    was. All three are attached to the event, never accepted from the client.
"""
from datetime import datetime, time, timedelta

from decouple import config
from django.core.cache import cache
from django.utils import timezone

from authapp.models.analytics_models import (
    AnalyticsEvent, Campaign,
    EVENT_PAGE_VIEW, EVENT_URL_CLICK, EVENT_VIDEO_START, EVENT_VIDEO_PROGRESS,
    EVENT_VIDEO_COMPLETE, EVENT_VIDEO_CLICK, EVENT_VIDEO_CTA_CLICK,
    EVENT_SIGNUP, EVENT_LOGIN, VIDEO_MILESTONES,
)
from authapp.utils.anonymous_id import derive_anonymous_id
from authapp.utils.bot_detection import is_bot
from authapp.utils.client_ip import get_client_ip
from authapp.utils.geolocation import resolve_geo_location
from authapp.utils.user_agent import classify_user_agent

CONTENT_TYPE_VIDEO = "video"
VIDEO_CLICK_EVENT_TYPES = (EVENT_VIDEO_CLICK, EVENT_VIDEO_CTA_CLICK)

# Dashboard reads are cached briefly. Short enough that "real-time-ish" still
# holds, long enough to absorb a dashboard refresh storm.
_CACHE_TTL_SECONDS = 60

# LOCATION-ANALYTICS: region/city resolution is an operational risk on the
# public ingest path (see _resolve_region_city) — this is the escape hatch.
# Flipping it off in an env var takes effect on the next request, no deploy,
# if the third-party lookup ever misbehaves in production. Country (the
# Cloudflare header) is unaffected either way — it's free and instant.
ANALYTICS_RESOLVE_LOCATION = config("ANALYTICS_RESOLVE_LOCATION", default=True, cast=bool)

# How long a session's resolved region/city is cached. Bounds the number of
# real ip-api.com calls to roughly one per NEW session (not one per event, and
# not one per returning session within the window) — see _resolve_region_city.
_GEO_CACHE_TTL_SECONDS = 60 * 60 * 6


# ── Ingestion ────────────────────────────────────────────────────────────────
def _clean_country(request):
    """Country from Cloudflare's edge header — no IP is read or stored. 'XX'
    (unknown) and 'T1' (Tor) are Cloudflare's non-country sentinels."""
    code = (request.META.get("HTTP_CF_IPCOUNTRY", "") or "").strip().upper()[:2]
    return "" if code in ("", "XX", "T1") else code


def _resolve_region_city(request, session_id):
    """Best-effort region/city via the existing utils/geolocation.py ip-api.com
    lookup, cached per session.

    OPERATIONAL NOTE — read before changing the cache TTL or removing the
    ANALYTICS_RESOLVE_LOCATION gate. The lookup is a *blocking* HTTP call with
    a 2.5s timeout, and this service runs behind only 3 gunicorn workers (see
    Procfile). Calling it on every ingested event would let a slow or
    misbehaving third party stall a third of the app's request capacity, and
    would blow through the free tier's ~45 req/min limit almost immediately
    under any real traffic. Two things bound that cost to roughly one real
    external call per NEW session (not per event, not per returning session):
    this cache (a session that already resolved its geo returns instantly on
    every later event for the rest of the TTL), and the fact that the caller
    (record_event) only invokes this for content_type="video" events, not
    every event type — page_view is far higher volume and doesn't need it for
    this feature. If ip-api.com ever degrades in production,
    ANALYTICS_RESOLVE_LOCATION=False in the environment turns this off on the
    next request with no deploy; country (the Cloudflare header) is
    unaffected either way.

    Never raises, never returns a raw IP — the IP is used only as transient
    input to the lookup (mirrors utils/anonymous_id.py's posture), and a
    failed/timed-out/unresolvable lookup yields {"region": "", "city": ""},
    which the read side renders as "Unknown" rather than fabricating a value.
    """
    if not ANALYTICS_RESOLVE_LOCATION:
        return {"region": "", "city": ""}

    cache_key = f"analytics:geo:{session_id}" if session_id else None
    if cache_key:
        try:
            cached = cache.get(cache_key)
        except Exception:
            cached = None
        if cached is not None:
            return cached

    ip = get_client_ip(request) or ""
    geo = resolve_geo_location(ip) if ip else {}
    result = {"region": geo.get("region", ""), "city": geo.get("city", "")}

    if cache_key:
        try:
            cache.set(cache_key, result, _GEO_CACHE_TTL_SECONDS)
        except Exception:
            pass
    return result


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
                 client_event_id=None):
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
    # Anonymous id only matters when there is no authenticated member.
    anon = "" if user is not None else derive_anonymous_id(request, anonymous_id)

    device, browser, os_name = classify_user_agent(ua)
    utm = utm or {}
    if campaign is None:
        campaign = match_campaign(utm.get("utm_campaign"), utm.get("utm_source"))

    # LOCATION-ANALYTICS: region/city only for video events — see
    # _resolve_region_city's operational note on why this isn't every event.
    region, city = "", ""
    if content_type == CONTENT_TYPE_VIDEO:
        geo = _resolve_region_city(request, session_id)
        region, city = geo["region"], geo["city"]

    fields = dict(
        user=user,
        anonymous_id=anon,
        session_id=_trim(session_id, 64),
        content_type=_trim(content_type, 40),
        content_id=_trim(str(content_id or ""), 120),
        url=_trim(url, 500),
        referrer=_trim(referrer, 500),
        source=_trim(source, 120),
        campaign=campaign,
        utm_source=_trim(utm.get("utm_source"), 100),
        utm_medium=_trim(utm.get("utm_medium"), 100),
        utm_campaign=_trim(utm.get("utm_campaign"), 150),
        utm_content=_trim(utm.get("utm_content"), 150),
        utm_term=_trim(utm.get("utm_term"), 150),
        device_type=_trim(device, 20),
        browser=_trim(browser, 40),
        operating_system=_trim(os_name, 40),
        country=_clean_country(request),
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


def record_click(request, campaign, *, session_id="", anonymous_id="", client_event_id=None):
    """Record a url_click for a trackable campaign link (the redirect view
    calls this, then 302s to the campaign's backend-controlled destination)."""
    return record_event(
        request,
        event_type=EVENT_URL_CLICK,
        content_type="campaign",
        content_id=str(campaign.id),
        url=campaign.destination_url,
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
        signups = qs.filter(event_type=EVENT_SIGNUP)

        unique_visitors, unique_members = _unique_from_qs(qs)
        click_unique_v, _ = _unique_from_qs(clicks)

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
    region/city that could not be resolved — see _resolve_region_city.

    One query, Python-reduced — same shape as _reduce_video/videos_report,
    and for the same reason: this can group by however many distinct
    (country, region, city) combinations exist without adding a query per
    group."""
    def produce():
        qs = _video_events(start_dt, end_dt, content_id).exclude(country="")
        raw = qs.values_list("country", "region", "city", "event_type", "user_id", "anonymous_id")

        tree = {}  # country -> region -> city -> {"viewers": set, "clicks": int, "clickers": set}
        for country, region, city, ev_type, user_id, anon in raw:
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
