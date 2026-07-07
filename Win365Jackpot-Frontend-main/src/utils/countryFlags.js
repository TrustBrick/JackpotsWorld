// src/utils/countryFlags.js
// Converts an ISO-3166 alpha-2 country code (e.g. "IN", "VN") into its flag
// emoji using Unicode regional indicator symbols. Works for any country the
// admin enters — no hardcoded name list needed ("unlimited countries").
export function flagFromCountryCode(code) {
  if (!code || code.length !== 2) return ''
  const points = [...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0))
  return String.fromCodePoint(...points)
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
