// src/utils/countryFlags.js
// Only the locations ticker's own country set is imported by name (rather
// than pulling in flag-icons' full ~250-flag stylesheet/asset set, which
// would bloat the bundle with flags this app never shows) — flagIconUrl()
// falls back to undefined for any other code, so callers should fall back
// to flagFromCountryCode() for codes outside this curated set.
import flagVN from 'flag-icons/flags/4x3/vn.svg'
import flagMO from 'flag-icons/flags/4x3/mo.svg'
import flagIN from 'flag-icons/flags/4x3/in.svg'
import flagLK from 'flag-icons/flags/4x3/lk.svg'
import flagPH from 'flag-icons/flags/4x3/ph.svg'
import flagUS from 'flag-icons/flags/4x3/us.svg'
import flagMY from 'flag-icons/flags/4x3/my.svg'
import flagSG from 'flag-icons/flags/4x3/sg.svg'
import flagAM from 'flag-icons/flags/4x3/am.svg'
import flagGE from 'flag-icons/flags/4x3/ge.svg'
import flagKZ from 'flag-icons/flags/4x3/kz.svg'

// Converts an ISO-3166 alpha-2 country code (e.g. "IN", "VN") into its flag
// emoji using Unicode regional indicator symbols. Works for any country the
// admin enters — no hardcoded name list needed ("unlimited countries").
export function flagFromCountryCode(code) {
  if (!code || code.length !== 2) return ''
  const points = [...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0))
  return String.fromCodePoint(...points)
}

// Real SVG flag artwork (from the `flag-icons` package) for spots where an
// actual flag image is preferred over the emoji glyph above — some
// platforms/fonts (older Windows/Chromium, many Linux desktops, some Android
// WebViews) render regional-indicator emoji as plain letter codes ("US",
// "SG") instead of a picture.
const FLAG_ICON_URLS = {
  VN: flagVN, MO: flagMO, IN: flagIN, LK: flagLK, PH: flagPH,
  US: flagUS, MY: flagMY, SG: flagSG, AM: flagAM, GE: flagGE,
  KZ: flagKZ,
}

export function flagIconUrl(code) {
  return code ? FLAG_ICON_URLS[code.toUpperCase()] : undefined
}

// Convenience map for the countries this platform already operates in —
// used to pre-fill the country_code field in the admin "Manage Promotions"
// form so flags render correctly without the admin needing to know ISO codes.
export const KNOWN_COUNTRY_CODES = {
  India: "IN",
  "Sri Lanka": "LK",
  Vietnam: "VN",
  Macau: "MO",
  Philippines: "PH",
}
