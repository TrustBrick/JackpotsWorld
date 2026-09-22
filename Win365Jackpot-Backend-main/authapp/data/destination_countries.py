"""The destination countries the public site advertises.

Mirrors the footer's list (Win365Jackpot-Frontend-main/src/components/Footer.jsx,
PRIMARY_DESTINATIONS + EXTRA_DESTINATIONS). Back Office country dropdowns
offer every one of these, whether or not a Casino row exists there yet.

Values are what the country columns store, so the footer's "India (Goa)" is
"India" here — the spelling every seeded Casino row uses, which keeps a
country pick matching its casinos in the dependent casino dropdown.
"""

DESTINATION_COUNTRIES = [
    "Vietnam",
    "Macau",
    "India",
    "Sri Lanka",
    "Philippines",
    "Las Vegas",
    "Malaysia",
    "Singapore",
    "Armenia",
    "Georgia",
]
