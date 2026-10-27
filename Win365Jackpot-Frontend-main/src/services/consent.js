// src/services/consent.js
//
// COOKIE-CONSENT: the single source of truth for the visitor's cookie choice.
// The banner (components/CookieConsent.jsx) writes here; the first-party
// analytics client (services/analytics.js) reads analyticsAllowed() before it
// sends anything, so a visitor who rejects non-essential cookies produces no
// first-party analytics traffic at all.
//
// Stored in localStorage so the choice survives refreshes and return visits.
// The stored record is versioned: bump CONSENT_VERSION when the cookie
// disclosure materially changes and every visitor is re-asked, rather than a
// stale "accepted" made against an older policy being honoured silently.

const KEY = "w365_cookie_consent";
export const CONSENT_VERSION = 1;
const CONSENT_EVENT = "w365:consent-change";
const REOPEN_EVENT = "w365:consent-reopen";

// The first-party analytics identifiers (see services/analytics.js). Removed the
// moment a visitor rejects, so changing your mind from the footer link really
// does stop the tracking and forget the ids rather than just ceasing to add to them.
const ANALYTICS_LOCAL_KEYS = ["jw_anon_id"];
const ANALYTICS_SESSION_KEYS = ["jw_session_id", "jw_utm_first_touch"];
const ANALYTICS_SESSION_PREFIXES = ["jw_video_session:", "jw_video_impression:"];

// Returns 'accepted' | 'rejected', or null when the visitor has not chosen yet
// (or chose against an older policy version, which counts as "ask again").
export function getConsent() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || saved.v !== CONSENT_VERSION) return null; // stale policy → re-ask
    return saved.status === "accepted" || saved.status === "rejected" ? saved.status : null;
  } catch {
    // Storage blocked (private mode, etc.) → treat as "no choice yet": the
    // banner shows, and analytics stays at its default (allowed).
    return null;
  }
}

export function setConsent(status) {
  if (status !== "accepted" && status !== "rejected") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ status, v: CONSENT_VERSION, ts: Date.now() }));
  } catch { /* storage blocked — the banner simply reappears next load */ }
  if (status === "rejected") {
    try { ANALYTICS_LOCAL_KEYS.forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
    try {
      ANALYTICS_SESSION_KEYS.forEach(k => sessionStorage.removeItem(k));
      Object.keys(sessionStorage)
        .filter(k => ANALYTICS_SESSION_PREFIXES.some(p => k.startsWith(p)))
        .forEach(k => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
  }
  // Let same-tab listeners react immediately (storage events only fire in
  // OTHER tabs, so this custom event covers the tab that made the choice).
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { status } }));
  } catch { /* no window (SSR/tests) — nothing to notify */ }
}

// Analytics is OPT-IN: allowed only after the visitor has EXPLICITLY accepted.
// No choice yet → not allowed (nothing is sent until they choose). Rejected →
// not allowed. This is the stricter, consent-first default — a visitor is never
// tracked before they agree to it.
export function analyticsAllowed() {
  return getConsent() === "accepted";
}

// Subscribe to consent changes in the current tab. Returns an unsubscribe fn.
export function onConsentChange(handler) {
  const fn = (e) => handler(e?.detail?.status ?? getConsent());
  try { window.addEventListener(CONSENT_EVENT, fn); } catch { /* ignore */ }
  return () => { try { window.removeEventListener(CONSENT_EVENT, fn); } catch { /* ignore */ } };
}

// Ask the banner to open again (the footer's "Cookie settings" link). The
// stored choice stays in force until the visitor picks again.
export function reopenConsent() {
  try { window.dispatchEvent(new Event(REOPEN_EVENT)); } catch { /* ignore */ }
}

export { CONSENT_EVENT, REOPEN_EVENT };
