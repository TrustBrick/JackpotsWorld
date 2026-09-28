"""
/events and /promotions are left out of the sitemap while they have no active
rows. An empty listing renders only "No … available right now", which Search
Console flags as a Soft 404; advertising it in the sitemap asks Google to
index a page with nothing on it. They must come back as soon as one active
row exists.
"""
import datetime

from django.test import RequestFactory, TestCase

from authapp.models.events_models import CasinoEvent
from authapp.models.promotion_models import Promotion
from authapp.views.seo_views import sitemap_xml


def _sitemap():
    # __wrapped__ skips cache_page, so each call sees the current rows.
    return sitemap_xml.__wrapped__(RequestFactory().get('/sitemap.xml')).content.decode()


class SitemapEmptyListingTests(TestCase):
    def setUp(self):
        # Migrations seed demo rows; start from a known-empty state.
        CasinoEvent.objects.all().delete()
        Promotion.objects.all().delete()

    def test_empty_listings_are_left_out(self):
        body = _sitemap()
        self.assertNotIn('/events<', body)
        self.assertNotIn('/promotions<', body)
        self.assertIn('/poker<', body)

    def test_inactive_rows_count_as_empty(self):
        CasinoEvent.objects.create(name='Old', country='India',
                                   event_date=datetime.date(2026, 1, 1), is_active=False)
        Promotion.objects.create(title='Old', country='India', is_active=False)
        body = _sitemap()
        self.assertNotIn('/events<', body)
        self.assertNotIn('/promotions<', body)

    def test_listing_returns_with_first_active_row(self):
        event = CasinoEvent.objects.create(name='Goa Night', country='India',
                                           event_date=datetime.date(2026, 12, 1), is_active=True)
        promo = Promotion.objects.create(title='Welcome', country='India', is_active=True)
        body = _sitemap()
        self.assertIn('/events<', body)
        self.assertIn(f'/events/{event.id}<', body)
        self.assertIn('/promotions<', body)
        self.assertIn(f'/promotions/{promo.id}<', body)
