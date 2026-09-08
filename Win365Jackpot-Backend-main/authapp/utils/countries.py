"""
authapp/utils/countries.py
─────────────────────────────────────────────────────────────────────────────
ISO 3166-1 alpha-2 code -> English country name, plus the vocabulary for
explaining a location we could NOT resolve.

WHY A DATA MODULE AND NOT A PACKAGE
───────────────────────────────────
`pycountry` / `django-countries` were considered and deliberately not added.
This is a static, complete standard that changes about once a decade; a new pip
dependency would be an install step on every Elastic Beanstalk instance and a
deploy risk, for a lookup table. What is below is the COMPLETE alpha-2 set
(249 entries — every officially assigned code), not a convenience subset, which
is the actual requirement: no visitor's country should render as a bare code
because their country was not one somebody thought to type out.

WHERE THE NAME REALLY COMES FROM
────────────────────────────────
This table is the FALLBACK, not the primary source. The geolocation provider
already returns a full country name and it is stored on
AnalyticsEvent.country_name / Visitor.country_name (see utils/geolocation.py).
`display_country()` below prefers that stored name and only falls back to this
table when a row has a code but no name — which is exactly the case for rows
written when country came from the Cloudflare CF-IPCountry header, and for
every row predating country_name. So the table earns its place covering
history, not by second-guessing the provider.

Codes are stored, names are displayed. Nothing here changes what the database
holds.
"""

# ISO 3166-1 alpha-2, officially assigned codes.
COUNTRY_NAMES = {
    "AD": "Andorra", "AE": "United Arab Emirates", "AF": "Afghanistan",
    "AG": "Antigua and Barbuda", "AI": "Anguilla", "AL": "Albania",
    "AM": "Armenia", "AO": "Angola", "AQ": "Antarctica", "AR": "Argentina",
    "AS": "American Samoa", "AT": "Austria", "AU": "Australia", "AW": "Aruba",
    "AX": "Åland Islands", "AZ": "Azerbaijan", "BA": "Bosnia and Herzegovina",
    "BB": "Barbados", "BD": "Bangladesh", "BE": "Belgium", "BF": "Burkina Faso",
    "BG": "Bulgaria", "BH": "Bahrain", "BI": "Burundi", "BJ": "Benin",
    "BL": "Saint Barthélemy", "BM": "Bermuda", "BN": "Brunei Darussalam",
    "BO": "Bolivia", "BQ": "Bonaire, Sint Eustatius and Saba", "BR": "Brazil",
    "BS": "Bahamas", "BT": "Bhutan", "BV": "Bouvet Island", "BW": "Botswana",
    "BY": "Belarus", "BZ": "Belize", "CA": "Canada", "CC": "Cocos (Keeling) Islands",
    "CD": "Congo (Democratic Republic)", "CF": "Central African Republic",
    "CG": "Congo", "CH": "Switzerland", "CI": "Côte d'Ivoire", "CK": "Cook Islands",
    "CL": "Chile", "CM": "Cameroon", "CN": "China", "CO": "Colombia",
    "CR": "Costa Rica", "CU": "Cuba", "CV": "Cabo Verde", "CW": "Curaçao",
    "CX": "Christmas Island", "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany",
    "DJ": "Djibouti", "DK": "Denmark", "DM": "Dominica", "DO": "Dominican Republic",
    "DZ": "Algeria", "EC": "Ecuador", "EE": "Estonia", "EG": "Egypt",
    "EH": "Western Sahara", "ER": "Eritrea", "ES": "Spain", "ET": "Ethiopia",
    "FI": "Finland", "FJ": "Fiji", "FK": "Falkland Islands", "FM": "Micronesia",
    "FO": "Faroe Islands", "FR": "France", "GA": "Gabon", "GB": "United Kingdom",
    "GD": "Grenada", "GE": "Georgia", "GF": "French Guiana", "GG": "Guernsey",
    "GH": "Ghana", "GI": "Gibraltar", "GL": "Greenland", "GM": "Gambia",
    "GN": "Guinea", "GP": "Guadeloupe", "GQ": "Equatorial Guinea", "GR": "Greece",
    "GS": "South Georgia and the South Sandwich Islands", "GT": "Guatemala",
    "GU": "Guam", "GW": "Guinea-Bissau", "GY": "Guyana", "HK": "Hong Kong",
    "HM": "Heard Island and McDonald Islands", "HN": "Honduras", "HR": "Croatia",
    "HT": "Haiti", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland",
    "IL": "Israel", "IM": "Isle of Man", "IN": "India",
    "IO": "British Indian Ocean Territory", "IQ": "Iraq", "IR": "Iran",
    "IS": "Iceland", "IT": "Italy", "JE": "Jersey", "JM": "Jamaica",
    "JO": "Jordan", "JP": "Japan", "KE": "Kenya", "KG": "Kyrgyzstan",
    "KH": "Cambodia", "KI": "Kiribati", "KM": "Comoros",
    "KN": "Saint Kitts and Nevis", "KP": "North Korea", "KR": "South Korea",
    "KW": "Kuwait", "KY": "Cayman Islands", "KZ": "Kazakhstan", "LA": "Laos",
    "LB": "Lebanon", "LC": "Saint Lucia", "LI": "Liechtenstein", "LK": "Sri Lanka",
    "LR": "Liberia", "LS": "Lesotho", "LT": "Lithuania", "LU": "Luxembourg",
    "LV": "Latvia", "LY": "Libya", "MA": "Morocco", "MC": "Monaco",
    "MD": "Moldova", "ME": "Montenegro", "MF": "Saint Martin (French part)",
    "MG": "Madagascar", "MH": "Marshall Islands", "MK": "North Macedonia",
    "ML": "Mali", "MM": "Myanmar", "MN": "Mongolia", "MO": "Macao",
    "MP": "Northern Mariana Islands", "MQ": "Martinique", "MR": "Mauritania",
    "MS": "Montserrat", "MT": "Malta", "MU": "Mauritius", "MV": "Maldives",
    "MW": "Malawi", "MX": "Mexico", "MY": "Malaysia", "MZ": "Mozambique",
    "NA": "Namibia", "NC": "New Caledonia", "NE": "Niger", "NF": "Norfolk Island",
    "NG": "Nigeria", "NI": "Nicaragua", "NL": "Netherlands", "NO": "Norway",
    "NP": "Nepal", "NR": "Nauru", "NU": "Niue", "NZ": "New Zealand",
    "OM": "Oman", "PA": "Panama", "PE": "Peru", "PF": "French Polynesia",
    "PG": "Papua New Guinea", "PH": "Philippines", "PK": "Pakistan",
    "PL": "Poland", "PM": "Saint Pierre and Miquelon", "PN": "Pitcairn",
    "PR": "Puerto Rico", "PS": "Palestine", "PT": "Portugal", "PW": "Palau",
    "PY": "Paraguay", "QA": "Qatar", "RE": "Réunion", "RO": "Romania",
    "RS": "Serbia", "RU": "Russia", "RW": "Rwanda", "SA": "Saudi Arabia",
    "SB": "Solomon Islands", "SC": "Seychelles", "SD": "Sudan", "SE": "Sweden",
    "SG": "Singapore", "SH": "Saint Helena, Ascension and Tristan da Cunha",
    "SI": "Slovenia", "SJ": "Svalbard and Jan Mayen", "SK": "Slovakia",
    "SL": "Sierra Leone", "SM": "San Marino", "SN": "Senegal", "SO": "Somalia",
    "SR": "Suriname", "SS": "South Sudan", "ST": "Sao Tome and Principe",
    "SV": "El Salvador", "SX": "Sint Maarten (Dutch part)", "SY": "Syria",
    "SZ": "Eswatini", "TC": "Turks and Caicos Islands", "TD": "Chad",
    "TF": "French Southern Territories", "TG": "Togo", "TH": "Thailand",
    "TJ": "Tajikistan", "TK": "Tokelau", "TL": "Timor-Leste",
    "TM": "Turkmenistan", "TN": "Tunisia", "TO": "Tonga", "TR": "Türkiye",
    "TT": "Trinidad and Tobago", "TV": "Tuvalu", "TW": "Taiwan",
    "TZ": "Tanzania", "UA": "Ukraine", "UG": "Uganda",
    "UM": "United States Minor Outlying Islands", "US": "United States",
    "UY": "Uruguay", "UZ": "Uzbekistan", "VA": "Holy See", "VC": "Saint Vincent and the Grenadines",
    "VE": "Venezuela", "VG": "Virgin Islands (British)", "VI": "Virgin Islands (U.S.)",
    "VN": "Vietnam", "VU": "Vanuatu", "WF": "Wallis and Futuna", "WS": "Samoa",
    "YE": "Yemen", "YT": "Mayotte", "ZA": "South Africa", "ZM": "Zambia",
    "ZW": "Zimbabwe",
}

# ── "Unknown" is not one thing ──────────────────────────────────────────────
# A blank country on an analytics row can mean several genuinely different
# things, and collapsing them into one "Unknown" bucket is what made the
# dashboard impossible to act on: "our geo provider is rate-limited" and "this
# visitor was on the office LAN" need completely different responses.
#
# These labels mirror utils/geolocation.py's own status vocabulary exactly,
# which is the whole point — the reason is recorded at resolution time on
# Visitor.geo_status, so the dashboard reports what actually happened rather
# than guessing after the fact.
UNKNOWN_LABEL = "Unknown"

UNKNOWN_REASON_LABELS = {
    "private_ip": "Local / private network",
    "failed": "Geo-location lookup failed",
    "unavailable": "Geo-location unavailable",
    # No Visitor row to read a status from at all — an event recorded while
    # visitor resolution itself was failing (see record_event's fallback
    # branch), or a row written before visitor tracking existed.
    "no_visitor": "No location recorded",
    "success": "Provider returned no country",
}

# Shown when the code is absent and no reason could be determined either.
UNKNOWN_REASON_DEFAULT = "Reason not recorded"


def country_name(code, fallback=""):
    """Full English name for an ISO alpha-2 code.

    Returns `fallback` (default "") for an unknown or empty code rather than
    inventing a name — a code we do not recognise is a fact worth showing as
    itself.
    """
    if not code:
        return fallback
    return COUNTRY_NAMES.get(str(code).strip().upper(), fallback)


def display_country(code, stored_name="", unknown_label=UNKNOWN_LABEL):
    """The string to put in front of an admin for one (code, stored_name) pair.

    Precedence, and why:
      1. `stored_name` — what the geolocation provider itself said. It is real
         data about this specific lookup, so it outranks any table.
      2. this module's table, keyed by the code.
      3. the raw code, if it is not one we recognise — better to show "XK"
         than to claim we do not know the country when we plainly have one.
      4. `unknown_label`, only when there is genuinely nothing.
    """
    stored_name = (stored_name or "").strip()
    if stored_name:
        return stored_name
    code = (code or "").strip().upper()
    if not code:
        return unknown_label
    return COUNTRY_NAMES.get(code, code)


def unknown_reason_label(geo_status):
    """Human-readable explanation for a row with no country, from the geo
    status recorded when the lookup was attempted."""
    if not geo_status:
        return UNKNOWN_REASON_DEFAULT
    return UNKNOWN_REASON_LABELS.get(str(geo_status), UNKNOWN_REASON_DEFAULT)
