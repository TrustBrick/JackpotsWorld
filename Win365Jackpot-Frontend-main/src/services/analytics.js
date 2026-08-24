// src/services/analytics.js
//
// ANALYTICS: the first-party, privacy-safe analytics client. It is completely
// separate from the affiliate ?ref/?campaign tracking in App.jsx (which is
// untouched) — general marketing/engagement analytics and affiliate-referral
// analytics are independent systems by design.
//
// Privacy: the visitor id is an opaque random token (no personal data), stored
// in localStorage so a refresh — or a return visit — is the SAME visitor, not
// a new one. No IP, no PII, nothing sensitive is ever sent from here; the
// server fills in coarse country/device from headers it already has.
//
// Volume: events are batched and flushed on an interval / when the tab is
// hidden, never one request per second. Video milestone de-duplication lives
// in useVideoAnalytics.js (per-session), so this module just ships what it is
// given.
//
// VIDEO-CLICK-ANALYTICS: click events (trackVideoClick / trackVideoCtaClick)
// and every video milestone carry a `client_event_id` — see mintActionId()
// below and the server's AnalyticsEvent.client_event_id. A retry of the same
// logical action (this exact click, this exact milestone) reuses the same id,
// so a duplicate request the server sees twice becomes one row, not two — the
// idempotency guarantee lives in a real DB constraint server-side, this is
// just what generates and reuses the key.
import { getToken } from "./authStorage";

const API = import.meta.env.VITE_API_URL || "";

const ANON_KEY = "jw_anon_id";        // localStorage — stable across sessions
const SESSION_KEY = "jw_session_id";  // sessionStorage — one browsing session
const UTM_KEY = "jw_utm_first_touch"; // sessionStorage — first-touch attribution

const FLUSH_INTERVAL_MS = 4000;
const FLUSH_AT = 10;   // flush early once this many are queued
const MAX_BATCH = 50;  // matches the server's per-request cap

function randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// Prefixed with a letter so it always matches the server's opaque-id shape
// ([A-Za-z0-9_-]{8,64}) and can never be mistaken for anything meaningful.
function getAnonId() {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = `v${randomId()}`; localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch { return `v${randomId()}`; }
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) { id = `s${randomId()}`; sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch { return `s${randomId()}`; }
}

// ── Click idempotency ────────────────────────────────────────────────────────
// One id per REAL user action, reused only while that action is still "in
// flight" from the user's perspective. A double-click, a duplicate React
// event fire, or a component re-render that re-attaches the same handler all
// land within this window and share one id (server dedupes to one row); a
// genuinely separate later click gets a new id (server counts it as a second
// click, correctly). This is deliberately about collapsing accidental
// duplicates of ONE click, never about limiting how many real clicks count.
const CLICK_DEBOUNCE_MS = 600;
const _lastClickId = new Map(); // key -> { id, at }

export function mintActionId(key) {
  const now = Date.now();
  const prev = _lastClickId.get(key);
  if (prev && now - prev.at < CLICK_DEBOUNCE_MS) {
    prev.at = now; // still the same physical click attempt; extend the window
    return prev.id;
  }
  const id = `c${randomId()}`;
  _lastClickId.set(key, { id, at: now });
  return id;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

// Capture UTM once per session (first-touch). A later navigation with different
// (or no) UTM never overwrites the campaign the visitor actually arrived on.
export function captureUtm(search) {
  try {
    if (sessionStorage.getItem(UTM_KEY)) return;
    const params = new URLSearchParams(search || (typeof window !== "undefined" ? window.location.search : ""));
    const utm = {};
    UTM_KEYS.forEach(k => { const v = params.get(k); if (v) utm[k] = v.slice(0, 150); });
    if (Object.keys(utm).length) sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch { /* storage blocked — attribution simply degrades to none */ }
}

function getUtm() {
  try { return JSON.parse(sessionStorage.getItem(UTM_KEY) || "{}"); } catch { return {}; }
}

// ── Batch queue ──────────────────────────────────────────────────────────────
let queue = [];
let flushTimer = null;

// A batch is retried only on a clear failure signal — a network-level
// rejection (fetch itself threw/rejected), or an explicit 429/5xx status —
// never on "the response body looked odd", since the ingest endpoint is
// deliberately best-effort about individual malformed events within an
// otherwise-successful request (retrying those would just fail the same way
// again). Bounded and backed off so a real outage can't turn into a runaway
// retry storm; after the cap, the batch is dropped, same as before this
// existed — best-effort was always the design, this only shrinks how often
// "best-effort" means "silently lost" for the ordinary case of a transient
// blip or a 429 from AnalyticsIngestThrottle (e.g. a shared office/mobile NAT
// briefly over the per-IP rate limit).
//
// Retries scheduled from a visibilitychange/pagehide-triggered flush may
// never actually run if the page is torn down before the timer fires — that
// is an inherent limit of a page that's closing, not something this can fix
// without a persistent offline queue (out of scope here).
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [3000, 8000, 20000];

function sendBatch(events, attempt = 0) {
  if (typeof fetch === "undefined") return;
  const headers = { "Content-Type": "application/json" };
  // When signed in, attach the token so signup/login and member engagement
  // attribute to the real account — identity is still re-derived server-side.
  const token = getToken("access");
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    fetch(`${API}/api/analytics/event/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ events }),
      keepalive: true, // let it complete even if the page is unloading
    }).then(res => {
      if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < MAX_RETRY_ATTEMPTS) {
        scheduleRetry(events, attempt);
      }
    }).catch(() => {
      if (attempt < MAX_RETRY_ATTEMPTS) scheduleRetry(events, attempt);
    });
  } catch { /* never let analytics throw into the app */ }
}

function scheduleRetry(events, attempt) {
  const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
  setTimeout(() => sendBatch(events, attempt + 1), delay);
}

function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!queue.length || typeof fetch === "undefined") return;
  const events = queue.splice(0, MAX_BATCH);
  sendBatch(events, 0);
}

function enqueue(event) {
  queue.push(event);
  if (queue.length >= FLUSH_AT) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);
}

function baseEvent(type, extra = {}) {
  const loc = typeof window !== "undefined" ? window.location : { pathname: "", search: "" };
  return {
    event_type: type,
    anonymous_id: getAnonId(),
    session_id: getSessionId(),
    url: `${loc.pathname}${loc.search}`.slice(0, 500),
    referrer: (typeof document !== "undefined" ? document.referrer : "").slice(0, 500),
    ...getUtm(),
    ...extra,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────
export function trackPageView(path) {
  const loc = typeof window !== "undefined" ? window.location : { pathname: "", search: "" };
  enqueue(baseEvent("page_view", { url: (path || `${loc.pathname}${loc.search}`).slice(0, 500) }));
}

export function trackEvent(type, extra) {
  enqueue(baseEvent(type, extra));
}

// One entry point for the video hook. `metadata` carries only the numeric
// milestone/watch signals the dashboard needs.
export function trackVideoEvent(type, { contentId, percent, watchedSeconds, duration, position, title, contentKind, clientEventId } = {}) {
  const metadata = {};
  if (percent != null) metadata.percent = percent;
  if (watchedSeconds != null && isFinite(watchedSeconds)) metadata.watched_seconds = Math.max(0, Math.round(watchedSeconds));
  if (duration != null && isFinite(duration)) metadata.duration = Math.max(0, Math.round(duration));
  // Where the playhead was when this happened — the useful half of a pause or
  // an exit, which are otherwise just "it stopped".
  if (position != null && isFinite(position)) metadata.position = Math.max(0, Math.round(position));
  if (title) metadata.title = String(title).slice(0, 200);
  if (contentKind) metadata.content_kind = contentKind;
  const extra = { content_type: "video", content_id: String(contentId || ""), metadata };
  if (clientEventId) extra.client_event_id = clientEventId;
  enqueue(baseEvent(type, extra));
}

// VIDEO-CLICK-ANALYTICS: a real user gesture on the player itself (see
// useVideoAnalytics.js, which calls this on the video element's own `click`).
export function trackVideoClick(contentId, { title, contentKind } = {}) {
  const clientEventId = mintActionId(`video_click:${contentId}`);
  trackVideoEvent("video_click", { contentId, title, contentKind, clientEventId });
  // Clicks are a direct engagement/business signal (unlike a milestone ping),
  // so send promptly rather than waiting for the batch window — mirrors
  // trackSignup/trackLogin below.
  flush();
}

// A click on a call-to-action associated with a video (e.g. a promotion's
// "Claim Bonus" button rendered next to its video). Not every video has one —
// callers only call this where a CTA actually exists.
export function trackVideoCtaClick(contentId, { title, contentKind } = {}) {
  const clientEventId = mintActionId(`video_cta_click:${contentId}`);
  trackVideoEvent("video_cta_click", { contentId, title, contentKind, clientEventId });
  flush();
}

// ── General click tracking ───────────────────────────────────────────────────
// VISITOR-ANALYTICS: the ordinary "a visitor clicked a tracked control" signal.
//
// This is the piece the click dashboard was missing entirely: before it, the
// only click events in the system were the campaign-redirect `url_click` (which
// only fires from a trackable marketing link) and the two video-specific ones,
// so almost every button and link on the site produced no click data at all.
//
// De-duplication is the whole reason this goes through mintActionId rather than
// posting directly. All of these collapse into ONE recorded click:
//   • a physical double-click
//   • a React re-render that re-fires the same handler
//   • a component remount that re-attaches a listener
//   • an event that bubbles through two handlers
//   • a network retry of the batch that carried it
// because they all land inside mintActionId's debounce window and therefore
// share one client_event_id, which the server's UNIQUE(event_type,
// client_event_id) constraint resolves to a single row. A genuinely separate
// later click falls outside the window, mints a new id, and is counted — this
// only ever removes accidental duplicates, never real repeat engagement.
//
// `elementId` should be a STABLE identifier for the control (not a generated
// DOM id that changes per render, which would fragment its click history into
// one row per render). `label` is what the visitor actually saw.
export function trackClick(elementId, { label, type = "button", destination, path } = {}) {
  const id = String(elementId || "").slice(0, 120);
  if (!id) return;  // an unidentifiable click is not worth a row
  const clientEventId = mintActionId(`click:${id}`);
  const loc = typeof window !== "undefined" ? window.location : { pathname: "", search: "" };
  enqueue(baseEvent("click", {
    element_id: id,
    element_type: String(type || "").slice(0, 40),
    element_label: String(label || "").slice(0, 200),
    destination_url: String(destination || "").slice(0, 500),
    url: (path || `${loc.pathname}${loc.search}`).slice(0, 500),
    client_event_id: clientEventId,
  }));
  // Clicks are a direct engagement signal and the visitor may be navigating
  // away in the next instant — send now rather than waiting for the window.
  flush();
}

// ── Video engagement beyond start/progress/complete ──────────────────────────
// All three are emitted by useVideoAnalytics.js; they are exported here so the
// hook has a single place to send from, per §26 (no raw fetch() in components).
export function trackVideoImpression(contentId, { title, contentKind, clientEventId } = {}) {
  trackVideoEvent("video_impression", { contentId, title, contentKind, clientEventId });
}

export function trackVideoPause(contentId, { title, contentKind, position, duration } = {}) {
  trackVideoEvent("video_pause", { contentId, title, contentKind, position, duration });
}

export function trackVideoExit(contentId, { title, contentKind, position, duration, watchedSeconds } = {}) {
  trackVideoEvent("video_exit", { contentId, title, contentKind, position, duration, watchedSeconds });
  // An exit is usually the page going away, so it must not sit in the queue.
  flush();
}

// signup/login are low-frequency and want their auth token, so flush at once.
export function trackSignup() { trackEvent("signup"); flush(); }
export function trackLogin() { trackEvent("login"); flush(); }
