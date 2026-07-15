from django.core.management.base import BaseCommand

from authapp.models import TourPackage

# The `authapp_tourpackage` table was created with CHARSET=latin1 on the
# original GoDaddy-hosted MySQL database. Emoji/star characters written to
# it (e.g. the star in "Standard 3★ (3N)") were silently replaced with a
# literal "?" byte at INSERT time, years before the RDS migration — the
# corruption was already baked into the GoDaddy dump this table was seeded
# from, so the original characters are unrecoverable from the DB. This
# restores the known-correct text using only plain ASCII, so it can't be
# mangled again regardless of the column's charset. `icon` is cleared to
# "" rather than re-populated with an emoji — the frontend now falls back
# to a bundled SVG icon (by package name) whenever `icon` is empty, so the
# icon renders correctly without depending on this latin1 column at all.
# One-off — remove after running once against production.
FIXES = {
    "VIP":       {"icon": "", "hotel": "Standard 3-Star (3N)"},
    "Classic":   {"icon": "", "hotel": "Standard 4-Star (3N)"},
    "Premium":   {"icon": "", "hotel": "Standard 5-Star (3N)"},
    "Prestige":  {"icon": "", "hotel": "Executive 5-Star (3N)"},
    "Signature": {"icon": "", "hotel": "Premium 5-Star (3N)"},
    "Elite":     {"icon": "", "hotel": "Suite 5-Star (3N)"},
    "Royal":     {"icon": "", "hotel": "Executive Suite 5-Star (4N)"},
    "Sovereign": {"icon": "", "hotel": "Presidential Suite (7N)"},
}


class Command(BaseCommand):
    help = "One-off: fixes mojibake ('?') in TourPackage icon/hotel fields. Remove after use."

    def handle(self, *args, **options):
        for name, fields in FIXES.items():
            updated = TourPackage.objects.filter(name=name).update(**fields)
            if updated:
                self.stdout.write(self.style.SUCCESS(f"Fixed {updated} row(s) for '{name}'"))
            else:
                self.stdout.write(self.style.WARNING(f"No TourPackage row found for '{name}'"))
