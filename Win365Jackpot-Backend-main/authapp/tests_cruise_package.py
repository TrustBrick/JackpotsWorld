"""The Cruise Offline Casino Package, which the Back Office now owns.

The point of this feature is that an admin can add, edit and delete the card
without a developer, so that is what these cover: the public read, the three
admin CRUD surfaces, who is allowed to touch them, and the two JSON list
columns — which are the only place this model does anything unusual.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models.landing_models import (
    CruisePackage,
    CruisePackageDetail,
    CruisePackageMedia,
)

User = get_user_model()

PUBLIC = "/api/cruise-packages/"
ADMIN = "/api/admin-panel/cruise-packages/"
ADMIN_DETAILS = "/api/admin-panel/cruise-package-details/"
ADMIN_MEDIA = "/api/admin-panel/cruise-package-media/"


class CruisePackageTestBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="cruise-admin@example.com", password="pw12345!", name="Cruise Admin",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        self.player = User.objects.create_user(
            email="cruise-player@example.com", password="pw12345!", name="Player",
        )
        # A canonical-host middleware rejects the default "testserver" Host
        # with a 400 before any view runs, so every request here needs a host
        # that is actually allowed.
        self.client = APIClient(HTTP_HOST="localhost")

        # 0102_seed_cruise_package ships a real row, and the migration chain
        # runs against the test database too — so every count and every
        # "the list is empty" assertion below would be off by that row.
        CruisePackage.objects.all().delete()

        self.package = CruisePackage.objects.create(
            title="Cruise Offline Casino Package",
            subtitle="International Waters",
            eyebrow_text="Limited Availability",
            highlights=["Luxury gaming at sea"],
            inclusions=["VIP Boarding Lounge", "24/7 Concierge"],
            cta_text="Enquire",
        )
        CruisePackageDetail.objects.create(
            package=self.package, icon_name="Ship", label="Transport",
            value="Luxury Cruise Ship", order=0,
        )

    def as_admin(self):
        self.client.force_authenticate(self.admin)


class PublicCruisePackageTests(CruisePackageTestBase):
    def test_returns_active_package_with_children_nested(self):
        res = self.client.get(PUBLIC)
        self.assertEqual(res.status_code, 200)
        rows = res.json()
        self.assertEqual(len(rows), 1)

        row = rows[0]
        self.assertEqual(row["title"], "Cruise Offline Casino Package")
        self.assertEqual(row["highlights"], ["Luxury gaming at sea"])
        self.assertEqual(len(row["inclusions"]), 2)
        # The children come nested, so the landing section needs one request
        # rather than three.
        self.assertEqual(len(row["details"]), 1)
        self.assertEqual(row["details"][0]["label"], "Transport")
        self.assertEqual(row["media"], [])

    def test_inactive_package_is_not_public(self):
        self.package.is_active = False
        self.package.save()
        self.assertEqual(self.client.get(PUBLIC).json(), [])

    def test_public_read_needs_no_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(PUBLIC).status_code, 200)

    def test_ordering_follows_order_column(self):
        # order is a PositiveIntegerField, so the new row sorts ahead by taking
        # 0 and pushing the original up — not by going negative, which the
        # column's CHECK constraint rejects.
        CruisePackage.objects.create(title="Second Sailing", order=0)
        self.package.order = 5
        self.package.save()
        titles = [r["title"] for r in self.client.get(PUBLIC).json()]
        self.assertEqual(titles, ["Second Sailing", "Cruise Offline Casino Package"])


class AdminCruisePackageCrudTests(CruisePackageTestBase):
    """Add, edit and delete — the whole reason this stopped being hardcoded."""

    def test_admin_can_add_a_package(self):
        self.as_admin()
        res = self.client.post(ADMIN, {
            "title": "Mediterranean Sailing",
            "subtitle": "Seven nights",
            "accent_color": "#f59e0b",
            "highlights": ["Barcelona to Rome"],
            "inclusions": ["Balcony cabin"],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(CruisePackage.objects.count(), 2)
        self.assertEqual(res.json()["accent_color"], "#f59e0b")

    def test_admin_can_edit_a_package(self):
        self.as_admin()
        res = self.client.patch(f"{ADMIN}{self.package.id}/", {
            "title": "Renamed Package",
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.package.refresh_from_db()
        self.assertEqual(self.package.title, "Renamed Package")

    def test_admin_can_delete_a_package_and_its_children(self):
        self.as_admin()
        res = self.client.delete(f"{ADMIN}{self.package.id}/")
        self.assertEqual(res.status_code, 204)
        self.assertEqual(CruisePackage.objects.count(), 0)
        # CASCADE, so no orphaned detail rows are left behind.
        self.assertEqual(CruisePackageDetail.objects.count(), 0)

    def test_admin_can_add_and_delete_a_detail_row(self):
        self.as_admin()
        res = self.client.post(ADMIN_DETAILS, {
            "package": self.package.id,
            "icon_name": "Wine",
            "label": "Drinks",
            "value": "Unlimited Premium Bar",
            "order": 1,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        new_id = res.json()["id"]
        self.assertEqual(self.package.details.count(), 2)

        self.assertEqual(self.client.delete(f"{ADMIN_DETAILS}{new_id}/").status_code, 204)
        self.assertEqual(self.package.details.count(), 1)

    def test_deactivating_hides_the_card_without_deleting_it(self):
        self.as_admin()
        self.client.patch(f"{ADMIN}{self.package.id}/", {"is_active": False}, format="json")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(PUBLIC).json(), [])
        self.assertEqual(CruisePackage.objects.count(), 1)


class CruisePackageListColumnTests(CruisePackageTestBase):
    """`highlights` and `inclusions` come from a "one per line" textarea, so
    blank lines and padding are the normal case rather than an error."""

    def test_blank_lines_and_padding_are_dropped(self):
        self.as_admin()
        res = self.client.patch(f"{ADMIN}{self.package.id}/", {
            "inclusions": ["  Port Excursions  ", "", "   ", "High Roller Rooms"],
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(
            res.json()["inclusions"], ["Port Excursions", "High Roller Rooms"],
        )

    def test_nested_structures_are_rejected(self):
        # A dict in here would render as [object Object] on the public page.
        self.as_admin()
        res = self.client.patch(f"{ADMIN}{self.package.id}/", {
            "highlights": [{"text": "nope"}],
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_empty_list_is_allowed(self):
        self.as_admin()
        res = self.client.patch(f"{ADMIN}{self.package.id}/", {
            "highlights": [],
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["highlights"], [])


class CruisePackagePermissionTests(CruisePackageTestBase):
    def test_anonymous_cannot_write(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(ADMIN, {"title": "x"}, format="json").status_code, (401, 403))
        self.assertIn(self.client.delete(f"{ADMIN}{self.package.id}/").status_code, (401, 403))

    def test_ordinary_player_cannot_write(self):
        self.client.force_authenticate(self.player)
        self.assertIn(self.client.post(ADMIN, {"title": "x"}, format="json").status_code, (401, 403))
        self.assertIn(
            self.client.post(ADMIN_MEDIA, {"package": self.package.id}, format="json").status_code,
            (401, 403),
        )

    def test_player_cannot_list_admin_endpoint(self):
        self.client.force_authenticate(self.player)
        self.assertIn(self.client.get(ADMIN).status_code, (401, 403))


class CruisePackageMediaTests(CruisePackageTestBase):
    def test_media_rows_appear_nested_in_the_public_payload(self):
        CruisePackageMedia.objects.create(
            package=self.package, media="landing/cruise-packages/x.jpg",
            media_type="image", label="Deck", order=0,
        )
        row = self.client.get(PUBLIC).json()[0]
        self.assertEqual(len(row["media"]), 1)
        self.assertEqual(row["media"][0]["label"], "Deck")
        self.assertEqual(row["media"][0]["media_type"], "image")

    def test_media_is_ordered(self):
        for i, label in enumerate(["third", "first", "second"]):
            CruisePackageMedia.objects.create(
                package=self.package, media=f"landing/cruise-packages/{label}.jpg",
                order={"first": 0, "second": 1, "third": 2}[label],
            )
        row = self.client.get(PUBLIC).json()[0]
        self.assertEqual([m["order"] for m in row["media"]], [0, 1, 2])
