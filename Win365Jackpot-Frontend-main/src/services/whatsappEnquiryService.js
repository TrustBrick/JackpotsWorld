// src/services/whatsappEnquiryService.js
//
// WHATSAPP-CAPTURE: the near side of the wa.me handoff.
//
// A WhatsApp conversation happens between the visitor's phone and ours, on
// WhatsApp's servers. Nothing typed there reaches this site, and nothing can
// without Meta's Business Cloud API. So the lead is captured here, a moment
// before WhatsApp opens: a name and a number, written to our own database,
// so an enquiry survives whether or not the visitor ever presses send.
//
// Same apiPostAuthed shape as experienceService.sendExperienceEnquiry — the
// endpoint is public, and that helper attaches a bearer token only when the
// visitor happens to have one, which is exactly right: a signed-in member's
// enquiry gets attributed to their account server-side, an anonymous
// visitor's is accepted just the same.
import { apiPostAuthed } from './apiClient'
// Shared with analytics rather than re-derived: the press and any form that
// follows it must resolve to the same lead, which only works if both carry
// the same visitor and session ids.
import { getAnonId, getSessionId, getUtm } from './analytics'
import { getToken } from './authStorage'

const ENQUIRY_PATH = '/api/whatsapp-enquiries/'
const CLICK_PATH = '/api/whatsapp-enquiries/click/'
// Same base apiClient resolves, for the one call that cannot go through it.
const API_BASE = import.meta.env.VITE_API_URL || ''

// Remembering who someone is, so a visitor who asks about two packages is not
// interrogated twice. Per-browser only; it never leaves the device, and the
// server is still the record of every individual enquiry.
const REMEMBER_KEY = 'jw_wa_contact'

export function rememberedContact() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return (parsed && parsed.name && parsed.whatsapp_number) ? parsed : null
  } catch {
    // Private mode, blocked storage, or a value someone else wrote. Behaving
    // as though nobody is remembered is always safe.
    return null
  }
}

export function rememberContact(name, whatsapp_number) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ name, whatsapp_number }))
  } catch {
    // Not being able to remember costs one extra form next time. It must
    // never cost the handoff.
  }
}

export function forgetContact() {
  try { localStorage.removeItem(REMEMBER_KEY) } catch { /* see above */ }
}

/**
 * Send one lead.
 *
 * Returns a flat result the form can render directly: a 400 carries DRF's
 * per-field errors so the form can point at the field that needs fixing, and
 * a 429 is the rate limit, which deserves its own wording.
 *
 * NOTE the caller must open WhatsApp whether or not this succeeds. Losing a
 * lead is bad; a visitor who tapped WhatsApp and got nothing is worse.
 */
/**
 * WHATSAPP-LEADS: the context every lead carries, whether or not the visitor
 * ever fills anything in. Which button, what page, which campaign brought
 * them, and the ids that let a press and a later form become one lead.
 */
export function enquiryContext({ source = '', message = '', destinationNumber = '' } = {}) {
  const utm = getUtm()
  return {
    source,
    message,
    destination_number: String(destinationNumber || ''),
    page_path: typeof window !== 'undefined' ? window.location.pathname : '',
    referrer: typeof document !== 'undefined' ? (document.referrer || '') : '',
    anonymous_id: getAnonId(),
    session_key: getSessionId(),
    utm_source: utm.utm_source || '',
    utm_medium: utm.utm_medium || '',
    utm_campaign: utm.utm_campaign || '',
    utm_content: utm.utm_content || '',
    utm_term: utm.utm_term || '',
  }
}

/**
 * Record that a WhatsApp button was pressed, with no details attached.
 *
 * THE POINT: a visitor who declines the form, or is never shown one, still
 * told us which button they reached for — and that used to be thrown away
 * entirely. This keeps it.
 *
 * MUST NOT DELAY THE HANDOFF. Sent with `keepalive` and deliberately not
 * awaited by callers, so the browser is free to navigate to WhatsApp while
 * this is still in flight. `keepalive` is what lets the request survive that
 * navigation; a plain fetch would be cancelled. Every failure is swallowed —
 * a lost record must never cost the visitor their WhatsApp.
 */
export function recordWhatsAppClick(context) {
  try {
    const body = JSON.stringify(context)
    const headers = { 'Content-Type': 'application/json' }
    // apiPostAuthed is not used here: it awaits, retries and cannot set
    // keepalive, none of which suits a call made as the page is leaving.
    // The token key and API base still come from the same places it uses.
    const token = getToken('access')
    if (token) headers.Authorization = `Bearer ${token}`

    const url = `${API_BASE}${CLICK_PATH}`
    fetch(url, { method: 'POST', headers, body, keepalive: true }).catch(() => {})
  } catch {
    /* recording is never worth breaking a click over */
  }
}

export async function sendWhatsAppEnquiry(body) {
  const { ok, status, data } = await apiPostAuthed(ENQUIRY_PATH, body)
  if (ok) {
    return { ok: true, id: data?.id, message: data?.message || '' }
  }
  return {
    ok: false,
    status,
    fieldErrors: (data && typeof data === 'object' && !Array.isArray(data)) ? data : {},
    message:
      status === 429
        ? 'You have sent several enquiries already — opening WhatsApp now.'
        : 'We could not save that, but WhatsApp is opening anyway.',
  }
}
