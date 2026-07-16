from django.core.management.base import BaseCommand

from authapp.models import TourPackage
from authapp.models.landing_models import GiftStep, LandingSettings, Testimonial
from authapp.models.poker_models import PokerTournament
from authapp.models.events_models import CasinoEvent

# Several tables were created with CHARSET=latin1 on the original
# GoDaddy-hosted MySQL database. Emoji, star, and currency-symbol
# characters written to them were silently replaced with a literal "?"
# byte at INSERT time, years before the RDS migration -- the corruption
# was already baked into the GoDaddy dump these tables were seeded from,
# so the original characters are unrecoverable from the DB itself. This
# restores the known-correct values by matching each row on a field that
# ISN'T corrupted (name/label), so it's safe to re-run.
# One-off -- remove after running once against production.

TOUR_PACKAGE_FIXES = {
    "VIP":       {"icon": "🃏", "hotel": "Standard 3-Star (3N)"},
    "Classic":   {"icon": "🎴", "hotel": "Standard 4-Star (3N)"},
    "Premium":   {"icon": "🎲", "hotel": "Standard 5-Star (3N)"},
    "Prestige":  {"icon": "🏆", "hotel": "Executive 5-Star (3N)"},
    "Signature": {"icon": "✍️", "hotel": "Premium 5-Star (3N)"},
    "Elite":     {"icon": "💎", "hotel": "Suite 5-Star (3N)"},
    "Royal":     {"icon": "👑", "hotel": "Executive Suite 5-Star (4N)"},
    "Sovereign": {"icon": "⚜️", "hotel": "Presidential Suite (7N)", "badge": "Invite Only"},
}

GIFT_STEP_ICON_FIXES = {
    "Play & Win": "🎰",
    "Go Highroller": "💰",
    "Redeem Gifts": "🎁",
    "We Deliver": "🚀",
}


class Command(BaseCommand):
    help = "One-off: fixes mojibake ('?') across several tables. Remove after use."

    def handle(self, *args, **options):
        for name, fields in TOUR_PACKAGE_FIXES.items():
            updated = TourPackage.objects.filter(name=name).update(**fields)
            self._report("TourPackage", name, updated)

        for label, icon in GIFT_STEP_ICON_FIXES.items():
            updated = GiftStep.objects.filter(label=label).update(icon=icon)
            self._report("GiftStep", label, updated)

        ls = LandingSettings.objects.filter(pk=1).first()
        if ls:
            changed = []
            if "?" in (ls.hero_cta_primary_label or ""):
                ls.hero_cta_primary_label = "🎰 Register — FREE"
                changed.append("hero_cta_primary_label")
            if "?" in (ls.hero_cta_secondary_label or ""):
                ls.hero_cta_secondary_label = "Packages ✨"
                changed.append("hero_cta_secondary_label")
            if changed:
                ls.save(update_fields=changed)
            self.stdout.write(self.style.SUCCESS(f"LandingSettings: fixed {changed or 'nothing needed'}"))

        # Testimonial / PokerTournament / CasinoEvent: the corruption is a
        # lost currency symbol (always the Peso sign, ₱) embedded mid-string
        # rather than the whole field, and a real "?" is never immediately
        # followed by a digit in normal writing -- so this substitution is
        # safe to apply broadly rather than needing a per-row literal match.
        t_count = 0
        for t in Testimonial.objects.filter(amount_won__contains="?"):
            t.amount_won = self._fix_currency(t.amount_won)
            t.save(update_fields=["amount_won"])
            t_count += 1
        self.stdout.write(self.style.SUCCESS(f"Testimonial: fixed {t_count} row(s)"))

        p_count = 0
        for p in PokerTournament.objects.filter(name__contains="?"):
            p.name = self._fix_currency(p.name)
            if "?" in (p.description or ""):
                p.description = self._fix_currency(p.description)
                p.save(update_fields=["name", "description"])
            else:
                p.save(update_fields=["name"])
            p_count += 1
        self.stdout.write(self.style.SUCCESS(f"PokerTournament: fixed {p_count} row(s)"))

        e_count = 0
        for e in CasinoEvent.objects.filter(description__contains="?"):
            e.description = self._fix_currency(e.description)
            if "?" in (e.short_description or ""):
                e.short_description = self._fix_currency(e.short_description)
                e.save(update_fields=["description", "short_description"])
            else:
                e.save(update_fields=["description"])
            e_count += 1
        self.stdout.write(self.style.SUCCESS(f"CasinoEvent: fixed {e_count} row(s)"))

    def _report(self, model, key, updated):
        if updated:
            self.stdout.write(self.style.SUCCESS(f"{model}: fixed {updated} row(s) for '{key}'"))
        else:
            self.stdout.write(self.style.WARNING(f"{model}: no row found for '{key}'"))

    @staticmethod
    def _fix_currency(text):
        import re
        return re.sub(r"\?(?=\d)", "₱", text) if text else text
