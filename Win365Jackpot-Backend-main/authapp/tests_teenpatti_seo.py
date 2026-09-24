"""
/teen-patti/<id> gets the same server-rendered head and sitemap treatment as
events, promotions and poker: public statuses are indexable and listed, and
draft/cancelled/inactive events are neither (the API 404s them too).
"""
import datetime

from django.test import TestCase

from authapp.models.teenpatti_models import TeenPattiEvent
from authapp.views import spa_seo
from authapp.views.seo_views import sitemap_xml
from django.test import RequestFactory


def _event(**kw):
    defaults = dict(
        name='Goa Teen Patti Night', country='India', city='Goa',
        start_date=datetime.date(2026, 11, 1), status='upcoming', is_active=True,
    )
    defaults.update(kw)
    return TeenPattiEvent.objects.create(**defaults)


class TeenPattiSeoTests(TestCase):
    def _head(self, path):
        return '\n'.join(spa_seo.head_tags_for(path))

    def test_public_event_gets_indexable_head_and_keywords(self):
        ev = _event()
        head = self._head(f'/teen-patti/{ev.id}')
        self.assertIn('index, follow', head)
        self.assertNotIn('noindex', head)
        self.assertIn('Goa Teen Patti Night', head)
        self.assertIn(f'https://jackpotsworld.vip/teen-patti/{ev.id}', head)
        self.assertIn('name="keywords"', head)
        self.assertIn('teen patti', head)
        self.assertIn('"@type":"Event"', head)

    def test_non_public_events_stay_noindex(self):
        for kwargs in ({'status': 'draft'}, {'status': 'cancelled'}, {'is_active': False}):
            with self.subTest(**kwargs):
                ev = _event(**kwargs)
                head = self._head(f'/teen-patti/{ev.id}')
                self.assertIn('noindex, nofollow', head)
                self.assertNotIn('Goa Teen Patti Night', head)

    def test_unknown_id_stays_noindex(self):
        self.assertIn('noindex, nofollow', self._head('/teen-patti/999999'))

    def test_sitemap_lists_only_public_events(self):
        public = _event()
        draft = _event(status='draft')
        hidden = _event(is_active=False)
        response = sitemap_xml.__wrapped__(RequestFactory().get('/sitemap.xml')) \
            if hasattr(sitemap_xml, '__wrapped__') else sitemap_xml(RequestFactory().get('/sitemap.xml'))
        body = response.content.decode()
        self.assertIn(f'/teen-patti/{public.id}<', body)
        self.assertNotIn(f'/teen-patti/{draft.id}<', body)
        self.assertNotIn(f'/teen-patti/{hidden.id}<', body)
        self.assertIn('/teen-patti<', body)
