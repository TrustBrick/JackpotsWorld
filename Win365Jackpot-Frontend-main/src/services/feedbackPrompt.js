// VISITOR-FEEDBACK: when the site asks for feedback on its own.
//
// Pages call requestFeedback(trigger) the moment a visitor finishes
// something — an enquiry, a registration, a sign-up — and FeedbackWidget
// decides whether and when to actually show the prompt. The rules, so it
// never feels like nagging:
//
//   • at most one prompt per visit (browser session);
//   • none for 14 days after the visitor sends feedback, or after they close
//     the prompt twice;
//   • never in the first 20 seconds on the site;
//   • never while a dialog, the chat window or the cookie banner is open
//     (it waits for them to close, for up to 30 minutes);
//   • never on sign-in, affiliate or admin pages, and on the player dashboard
//     only for the moments that happen there (a deposit or withdrawal request,
//     the end of a support call).
//
// Every read and write is wrapped: private mode or blocked storage just
// means the visitor is not prompted, never that something breaks.

import { apiPostAuthed } from './apiClient'
import { resolveLocation } from '../i18n/locations'
import i18n from '../i18n'

export const REQUEST_EVENT = 'jw:feedback-request'

const SESSION_START = 'jw_fb_session_start'
const SESSION_ASKED = 'jw_fb_asked'
const PENDING = 'jw_fb_pending'
const STATE = 'jw_fb_state'

const MIN_TIME_ON_SITE_MS = 20 * 1000
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000
const PENDING_TTL_MS = 30 * 60 * 1000
const DISMISSALS_BEFORE_SNOOZE = 2

// The app's own routes (App.jsx) where a prompt would be in the way.
const NO_PROMPT_PATHS = [
  /^\/admin-panel/, /^\/super-admin/, /^\/affiliate-panel/,
  /^\/affiliate-login/, /^\/affiliate-register/, /\/sign-(in|up)$/,
]
// The player dashboard is off limits, except for the moments that only happen there.
const DASHBOARD_PATH = /^\/dashboard/
const DASHBOARD_TRIGGERS = new Set(['deposit', 'withdrawal', 'support_call'])

const read = (store, key, fallback = null) => {
  try { const v = store.getItem(key); return v == null ? fallback : JSON.parse(v) } catch { return fallback }
}
const write = (store, key, value) => {
  try { store.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}
const remove = (store, key) => { try { store.removeItem(key) } catch { /* ignore */ } }

// The visit starts the first time this module loads in the tab's session.
try {
  if (!sessionStorage.getItem(SESSION_START)) sessionStorage.setItem(SESSION_START, String(Date.now()))
} catch { /* ignore */ }

export function promptAllowedOnPath(path = window.location.pathname, trigger = '') {
  if (DASHBOARD_PATH.test(path)) return DASHBOARD_TRIGGERS.has(trigger)
  return !NO_PROMPT_PATHS.some(rx => rx.test(path))
}

/** Something on screen the prompt must not cover. */
export function somethingIsOpen() {
  return !!document.querySelector('[aria-modal="true"], [data-feedback-blocker]')
}

function snoozed() {
  const state = read(localStorage, STATE, {})
  return !!state.snoozeUntil && state.snoozeUntil > Date.now()
}

function visitAgeMs() {
  const start = Number(read(sessionStorage, SESSION_START, 0)) || Date.now()
  return Date.now() - start
}

/** Ask for feedback because the visitor just finished something. */
export function requestFeedback(trigger) {
  if (read(sessionStorage, SESSION_ASKED, false) || snoozed()) return
  write(sessionStorage, PENDING, { trigger, at: Date.now() })
  try { window.dispatchEvent(new Event(REQUEST_EVENT)) } catch { /* ignore */ }
}

/**
 * The pending prompt, if it may be shown right now; null otherwise.
 * Expired requests are dropped.
 */
export function promptReadyToShow() {
  const pending = read(sessionStorage, PENDING)
  if (!pending) return null
  if (Date.now() - pending.at > PENDING_TTL_MS || read(sessionStorage, SESSION_ASKED, false) || snoozed()) {
    remove(sessionStorage, PENDING)
    return null
  }
  if (visitAgeMs() < MIN_TIME_ON_SITE_MS) return null
  if (!promptAllowedOnPath(window.location.pathname, pending.trigger) || somethingIsOpen() || document.hidden) return null
  return pending
}

/** The prompt is on screen — it counts as this visit's one ask. */
export function markPromptShown(trigger) {
  write(sessionStorage, SESSION_ASKED, true)
  remove(sessionStorage, PENDING)
  trackPromptEvent(trigger, 'shown')
}

/**
 * Tell the server the popup appeared or was closed unanswered, so Back Office
 * can show a response rate per moment. Fire-and-forget: never throws.
 */
export function trackPromptEvent(trigger, event) {
  if (!trigger) return
  try { apiPostAuthed('/api/feedback/prompt-event/', { trigger, event }).catch(() => {}) } catch { /* ignore */ }
}

/** The visitor sent feedback (prompted or not): leave them alone for a while. */
export function markFeedbackSent() {
  write(localStorage, STATE, { snoozeUntil: Date.now() + SNOOZE_MS, dismissals: 0 })
  write(sessionStorage, SESSION_ASKED, true)
  remove(sessionStorage, PENDING)
}

/** The visitor closed the prompt without answering. */
export function markPromptDismissed(trigger) {
  trackPromptEvent(trigger, 'dismissed')
  const state = read(localStorage, STATE, {})
  const dismissals = (state.dismissals || 0) + 1
  write(localStorage, STATE, dismissals >= DISMISSALS_BEFORE_SNOOZE
    ? { snoozeUntil: Date.now() + SNOOZE_MS, dismissals: 0 }
    : { ...state, dismissals })
}

/**
 * For hand-offs that leave the site (WhatsApp opens in another tab or app):
 * ask once the visitor comes back, if they were away long enough to have
 * actually used it.
 */
export function requestFeedbackOnReturn(trigger, { minAwayMs = 4000 } = {}) {
  let leftAt = null
  const onChange = () => {
    if (document.hidden) { leftAt = Date.now(); return }
    if (leftAt && Date.now() - leftAt >= minAwayMs) {
      document.removeEventListener('visibilitychange', onChange)
      requestFeedback(trigger)
    }
  }
  document.addEventListener('visibilitychange', onChange)
  // Give up quietly if they never leave or never return within the hour.
  setTimeout(() => document.removeEventListener('visibilitychange', onChange), 60 * 60 * 1000)
}

/**
 * POST one piece of feedback, with where it came from attached.
 * Resolves { ok, status, data }; never throws.
 */
export async function sendFeedback(fields) {
  const location = resolveLocation(i18n.language)
  return apiPostAuthed('/api/feedback/', {
    ...fields,
    message: (fields.message || '').trim(),
    page_path: window.location.pathname,
    language: i18n.language || '',
    country_code: (location?.country || '').toUpperCase(),
  }).catch(() => ({ ok: false, status: 0, data: {} }))
}
