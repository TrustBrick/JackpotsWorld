// src/hooks/useEnquiryMessage.js
//
// The prefilled WhatsApp text for one enquiry button, resolved from the Back
// Office rather than from a literal in the component that renders the button.
//
// WHY A HOOK AND NOT A FETCH AT CLICK TIME
// ─────────────────────────────────────────────────────────────────────────────
// Every enquiry button is an <a href="https://wa.me/...">, and that is worth
// keeping: it opens the native app on a phone and WhatsApp Web on a desktop,
// it middle-clicks, it right-click-copies, and it needs no JavaScript at the
// moment of the click. Resolving the message inside an onClick would mean
// building the URL after the user has already clicked, which is exactly the
// pattern that gets blocked as a popup. So the text has to be known at render
// time, which means a hook that re-renders when it arrives.
//
// WHAT HAPPENS BEFORE THE FETCH RESOLVES
// ─────────────────────────────────────────────────────────────────────────────
// The built-in defaults below are the strings these buttons shipped with, and
// they are also the values migration 0069 seeded the table with. A button
// therefore always has a working message: on first paint, if the request is
// slow, if the API is down, and if an admin deactivates a row. This is one
// fallback map next to one fetch, not a hardcoded message scattered through
// the components -- the components no longer contain any of this text.
//
// One request per page load, shared by every button on it, cached in module
// scope with the same in-flight de-duplication services/enquiryContact.js
// already uses for country detection.

import { useEffect, useState } from 'react'
// The app's shared read client: it owns the API base URL and a bounded
// retry-with-backoff (3 attempts). Reused rather than re-implemented so this
// endpoint behaves like every other public read on the site.
import { apiGet } from '../services/apiClient'

// Keys are the contract with the backend (authapp/migrations/0069). Values are
// what the site sent before these moved into the database.
export const DEFAULT_ENQUIRY_MESSAGES = {
  tour_packages_general:
    "Hi! I'm interested in your Offline Casino Tour Packages. Please share more details.",
  tour_package_named:
    "Hi! I'm interested in the *{package}* Offline Casino Tour Package. Please share more details.",
  cruise_package:
    "Hi! I'm interested in the *Cruise Offline Casino Package*. Please share more details.",
  footer_general:
    "Hi! I'd like to get in touch with Jackpots World 🎰",
  floating_button:
    "Hi! I'm interested in a casino package from jackpotsworld.com 🎰 Please help me!",
  package_purchase:
    "Hi! I'm interested in purchasing the *{package}* Offline Casino Tour Package ({price}). Please share more details.",
}

const ENDPOINT = '/api/enquiry-messages/'

let cache = null          // { key: template } once loaded
let inFlight = null       // shared promise while loading
const subscribers = new Set()

/**
 * Fills {placeholders} in a template.
 *
 * Deliberately not str.format-strict: an admin editing a message is not
 * writing code, and a message that mentions {price} where the call site only
 * supplied {package} must still open WhatsApp. An unknown placeholder is left
 * exactly as typed so the mistake is visible in the composer and fixable in
 * the Back Office, rather than throwing and leaving the button dead.
 */
export function renderEnquiryTemplate(template, vars = {}) {
  if (!template) return ''
  return String(template).replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
      ? String(vars[name])
      : whole,
  )
}

async function load() {
  const rows = await apiGet(ENDPOINT)
  const next = {}
  if (Array.isArray(rows)) {
    rows.forEach(r => { if (r?.key && r?.template) next[r.key] = r.template })
  }
  return next
}

/** Resolves to the loaded map, or {} when unavailable. Never rejects. */
export function fetchEnquiryMessages() {
  if (cache) return Promise.resolve(cache)
  if (inFlight) return inFlight
  inFlight = load()
    .then(next => {
      cache = next
      subscribers.forEach(notify => notify())
      return cache
    })
    .catch(() => {
      // Leave `cache` null so a later mount may retry, but resolve rather than
      // reject: callers fall back to the defaults and the button still works.
      return {}
    })
    .finally(() => { inFlight = null })
  return inFlight
}

/** The template for `key` right now, without waiting. */
export function getEnquiryTemplateSync(key) {
  return (cache && cache[key]) || DEFAULT_ENQUIRY_MESSAGES[key] || ''
}

/**
 * The rendered message for one enquiry button.
 *
 * `vars` fills the {placeholders} the message may contain. Pass it inline;
 * it is read during render, so a new object each time costs nothing.
 */
export default function useEnquiryMessage(key, vars = {}) {
  const [template, setTemplate] = useState(() => getEnquiryTemplateSync(key))

  useEffect(() => {
    let cancelled = false
    const sync = () => { if (!cancelled) setTemplate(getEnquiryTemplateSync(key)) }
    subscribers.add(sync)
    fetchEnquiryMessages().then(sync)
    return () => { cancelled = true; subscribers.delete(sync) }
  }, [key])

  return renderEnquiryTemplate(template, vars)
}
