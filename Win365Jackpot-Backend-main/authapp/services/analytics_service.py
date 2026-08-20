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
"""
from datetime import datetime, time, timedelta

from django.core.cache import cache
from django.utils import timezone

from authapp.models.analytics_models import (
    AnalyticsEvent, Campaign,
    EVENT_PAGE_VIEW, EVENT_URL_CLICK, EVENT_VIDEO_START, EVENT_VIDEO_PROGRESS,
    EVENT_VIDEO_COMPLETE, EVENT_SIGNUP, EVENT_LOGIN, VIDEO_MILESTONES,
)
from authapp.utils.anonymous_id import derive_anonymous_id
from authapp.utils.bot_detection import is_bot
from authapp.utils.user_agent import classify_user_agent

CONTENT_TYPE_VIDEO = "video"

# Dashboard reads are cached briefly. Short enough that "real-time-ish" still
# holds, long enough to absorb a dashboard refresh storm.
_CACHE_TTL_SECONDS = 60


# ── Ingestion ────────────────────────────────────────────────────────────────
def _clean_country(request):
    """Country from Cloudflare's edge header — no IP is read or stored. 'XX'
    (unknown) and 'T1' (Tor) are Cloudflare's non-country sentinels."""
    code = (request.META.get("HTTP_CF_IPCOUNTRY", "") or "").strip().upper()[:2]
    return "" if code in ("", "XX", "T1") else code


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
                 anonymous_id=None, session_id="", campaign=None):
    """Persist one event with server-derived identity and context. Returns the
    row, or None if the request was filtered as a bot (§32)."""
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

    return AnalyticsEvent.objects.create(
        event_type=event_type,
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
        metadata=metadata if isinstance(metadata, dict) else {},
    )


def record_click(request, campaign, *, session_id="", anonymous_id=""):
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
        starts = qs.filter(event_type=EVENT_VIDEO_START)
        completes = qs.filter(event_type=EVENT_VIDEO_COMPLETE)
        signups = qs.filter(event_type=EVENT_SIGNUP)

        unique_visitors, unique_members = _unique_from_qs(qs)
        start_count = starts.count()
        complete_count = completes.count()
        click_unique_v, _ = _unique_from_qs(clicks)
        view_unique_v, _ = _unique_from_qs(starts)

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
            "total_video_views": start_count,
            "unique_video_viewers": view_unique_v,
            "video_completion_rate": round(100.0 * complete_count / start_count, 1) if start_count else 0.0,
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
    milestone/watch-time metrics. Milestones count DISTINCT viewers, so a
    duplicate milestone event (should never happen — the client de-dupes)
    still cannot inflate anything."""
    starters, completers = set(), set()
    milestone_viewers = {m: set() for m in VIDEO_MILESTONES}
    total_views = 0
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
        secs = (meta or {}).get("watched_seconds")
        if isinstance(secs, (int, float)) and secs >= 0:
            if vk not in watch_by_viewer or secs > watch_by_viewer[vk]:
                watch_by_viewer[vk] = secs

    unique_viewers = len(starters | completers | {v for s in milestone_viewers.values() for v in s})
    started = len(starters) or unique_viewers
    completed = len(completers)
    avg_watch = round(sum(watch_by_viewer.values()) / len(watch_by_viewer), 1) if watch_by_viewer else 0.0
    return {
        "total_views": total_views,
        "unique_viewers": unique_viewers,
        "started": started,
        "milestones": {str(m): len(milestone_viewers[m]) for m in VIDEO_MILESTONES},
        "completed": completed,
        "avg_watch_seconds": avg_watch,
        "completion_rate": round(100.0 * completed / started, 1) if started else 0.0,
    }


def videos_report(start_dt, end_dt):
    def produce():
        # NOTE: the .order_by() before .distinct() is load-bearing, here and in
        # every other distinct() in this module. AnalyticsEvent orders by
        # -created_at by default; Django appends an ORDER BY column to the
        # SELECT list, so a DISTINCT without clearing it de-duplicates
        # (content_id, created_at) pairs and returns one row per event.

        qs = _video_events(start_dt, end_dt).exclude(content_id="")
        video_ids = list(qs.order_by().values_list("content_id", flat=True).distinct())
        rows = []
        for vid in video_ids:
            raw = list(
                qs.filter(content_id=vid).values_list("event_type", "user_id", "anonymous_id", "metadata")
            )
            m = _reduce_video(raw)
            rows.append({
                "content_id": vid,
                "total_views": m["total_views"],
                "unique_viewers": m["unique_viewers"],
                "reached_50": m["milestones"]["50"],
                "completed": m["completed"],
                "avg_watch_seconds": m["avg_watch_seconds"],
                "completion_rate": m["completion_rate"],
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
        c = m["milestones"][str(ms)]
        retention.append({"stage": f"{ms}%", "count": c, "pct": round(100.0 * c / started, 1)})
    retention.append({"stage": "Completed", "count": m["completed"], "pct": round(100.0 * m["completed"] / started, 1)})
    return {
        "content_id": str(content_id),
        "total_views": m["total_views"],
        "unique_viewers": m["unique_viewers"],
        "avg_watch_seconds": m["avg_watch_seconds"],
        "completion_rate": m["completion_rate"],
        "retention": retention,
    }


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
