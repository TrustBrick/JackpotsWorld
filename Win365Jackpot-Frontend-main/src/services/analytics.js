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

function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!queue.length || typeof fetch === "undefined") return;
  const events = queue.splice(0, MAX_BATCH);
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
    }).catch(() => {});
  } catch { /* never let analytics throw into the app */ }
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
export function trackVideoEvent(type, { contentId, percent, watchedSeconds, duration, title, contentKind } = {}) {
  const metadata = {};
  if (percent != null) metadata.percent = percent;
  if (watchedSeconds != null && isFinite(watchedSeconds)) metadata.watched_seconds = Math.max(0, Math.round(watchedSeconds));
  if (duration != null && isFinite(duration)) metadata.duration = Math.max(0, Math.round(duration));
  if (title) metadata.title = String(title).slice(0, 200);
  if (contentKind) metadata.content_kind = contentKind;
  enqueue(baseEvent(type, { content_type: "video", content_id: String(contentId || ""), metadata }));
}

// signup/login are low-frequency and want their auth token, so flush at once.
export function trackSignup() { trackEvent("signup"); flush(); }
export function trackLogin() { trackEvent("login"); flush(); }
