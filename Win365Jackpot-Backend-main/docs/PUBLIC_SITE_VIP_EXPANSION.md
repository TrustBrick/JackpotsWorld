# Public Website — VIP Destination & Lifestyle Expansion

Evolving the public site from a casino-focused website into a premium VIP
destination platform, **without reducing the offline casino identity**.

Answers §23 of the brief, point by point.

---

## 1. What I found in the existing public website

`/` renders `pages/LandingPage.jsx` — eleven sections: Hero → ReferralJourney →
CountryPackages → FeaturedDestinationShowcase → a 3-column grid (GlobalReach /
Events preview / Promotions preview) → Gifts → VIPLevels → WhyChooseUs →
BusinessModelFAQ → Register → Footer.

**The most important find:** `CountryPackages.jsx` (1,170 lines) is not one
section but **three** — `#packages` (Destinations), `#vip-services` (a
category-filtered VIP gallery) and `#packages-all` (Tour Packages), plus a
`CruiseCarousel`. Its gallery already carried **"Private Jet"** and **"Luxury
Cruises"** tiles under a `Luxury Travel` category, and `TourPackage` already
modelled flight / hotel / food / spa / shopping / visa. Luxury travel was not
absent — it was present but shallow, and its imagery was a hardcoded array
rather than Back Office content.

**Back Office** was already the right shape: Content Management → *Landing
Page* is a registry of 16 sub-views (`LandingManageTab.jsx`), each driven by the
generic `ManageContentTab`. Destinations, Destination Media, Premium Partners,
Tour Packages, VIP Gallery, Featured Showcase and Enquiry Messages were all
editable there.

**Enquiry flow** is WhatsApp: `<a href="wa.me/…">` with the message text from the
`EnquiryMessage` table via `useEnquiryMessage`, and the number resolved per
visitor by `enquiryContact.js` (Sri Lanka gets a local number). A
`cruise_package` message key already existed.

**Design system:** gold `#D4AF37` + `casino.dark/mid/card/border`, Manrope
throughout, and `casino-card` / `btn-gold` / `btn-outline-gold` / `gold-text`
utilities, all theme-variable driven.

**A constraint worth naming:** `tests_landing_wording.py` holds a
`BANNED_PHRASES` list that fails the build on unsupported claims ("fully
licensed and regulated", "Asia's #1", "Casino Gaming Across"…) and scans
frontend sources for fabricated social proof. §19's content rule was already
enforced by a test. All new copy is written to pass it.

---

## 2. Existing sections preserved

**Every one.** Verified in the browser after the change — all nine pre-existing
landing anchors still render: `#hero`, `#packages`, `#vip-services`,
`#packages-all`, the events grid, `#gifts`, `#vip`, `#why`, `#register`, plus
the footer and 14 WhatsApp links.

The **header navigation is byte-for-byte unchanged** — Home, VIP Levels,
Affiliates, Poker, Teen Patti, Andhar Bahar, Why Us, Register, Gifts all
confirmed present.

The **hero is untouched**: its animated globe, video background, dynamic Back
Office settings, stats and CTA routing all work exactly as before.

The only edit to an existing file's markup was adding `id="events-preview"` to
the events grid `<div>` so the overview band can link to it. No component
inside it changed.

---

## 3. Existing components and systems reused

| Reused | Instead of |
|---|---|
| `ManageContentTab` | A bespoke admin CRUD per pillar |
| `useEnquiryMessage` / `useEnquiryNumber` / `buildWhatsAppLink` | A second enquiry mechanism |
| The `open-chat` event | A second live-support widget |
| `useAutoFetch` | A bespoke fetch hook |
| `apiGet` / `apiPostAuthed` / `createCache` | New HTTP plumbing |
| `casino-card`, `btn-gold`, `btn-outline-gold`, `gold-text` | New button and card styles |
| `Destination` (FK) | A second country/destination list |
| `EnquiryMessage` | Hardcoded WhatsApp text |
| `SharedUI` `Table` / `Pagination` / `rowHover` | A bespoke admin table |
| `Experience` model, via `category` | Six near-identical models |

`apiPostAuthed` is reused for the public enquiry POST because it attaches the
bearer token only when one exists and posts fine without — exactly right here.
It was reused rather than cloned under a better name, since an identical second
helper is one more thing to keep in step.

---

## 4. New sections created

1. **Beyond the Casino** (`#beyond-the-casino`) — the overview band under the
   hero, built to the supplied design reference. Six signposts: Offline
   Casinos, Luxury Travel, Hotels & Resorts, VIP Concierge, Events, Dining &
   Entertainment. **Offline casinos leads the row** deliberately.
2. **Luxury Travel** (`#luxury-travel`) — alternating full-width panels with an
   oversized index numeral. Private jets and cruises.
3. **Hotels & Resorts** (`#stays`) — an editorial list: hairline rule, index in
   the margin, letterbox image strip inside the prose column.
4. **Dining & Entertainment** (`#dining-entertainment`) — a horizontal rail of
   tall narrow cards; the only horizontal movement on the page.
5. **VIP Concierge** (`#vip-concierge`) — centred and quiet, closing the
   destination story before the page returns to the existing VIP membership
   sections.

Each has its own visual identity (§15) while sharing the gold, the dark ground
and the type. **Each renders nothing at all when its Back Office rows are
empty**, so no section can leave a stray heading on the page.

**Typography:** Playfair Display for display headings only; Manrope keeps all
body copy, buttons, navigation and the entire Back Office. Fallback chain is
`Georgia, 'Times New Roman', serif`, so a blocked font CDN still lands on a
serif rather than collapsing to the body sans.

---

## 5. Back Office functionality extended

Landing Page gained two sub-views:

- **Experiences** — five pillar tabs (Beyond the Casino, Luxury Travel, Hotels
  & Resorts, Dining & Entertainment, VIP Concierge) over one `ManageContentTab`,
  with `listParams` narrowing the list and a locked hidden `category` forcing
  the pillar on create so a card cannot land in the wrong section.
- **Experience Enquiries** — a dedicated read-only lead table with inline status
  and host notes, filterable by pillar and status, searchable, paginated.
  Deliberately **not** `ManageContentTab`, which offers Create and Delete that
  the backend does not support.

Every string the five public sections render is a row in these tables —
titles, subtitles, body copy, CTA labels, **CTA targets**, icons, accent
colours and images.

---

## 6. New data, models and API endpoints

**Models** (one new module, `experience_models.py`):

- `Experience` — one card in one pillar. `category` separates the five
  sections rather than five models existing.
- `ExperienceEnquiry` — the lead a visitor sends.

**Migrations** `0095`–`0098`, all reversible and verified reversing cleanly:

| Migration | What |
|---|---|
| `0095_experiences` | Both tables + the category/active/order index |
| `0096_seed_experiences` | 15 pillar cards, service-level copy only |
| `0097_experience_overview_category` | Adds the `overview` category |
| `0098_seed_beyond_the_casino` | The six overview signposts |

**Endpoints:**

```
GET  /api/experiences/                        public — all pillars, grouped
POST /api/experiences/enquiries/              public, throttled 6/hour

GET/POST         /api/admin-panel/experiences/            ?category=
GET/PATCH/DELETE /api/admin-panel/experiences/<id>/
GET              /api/admin-panel/experience-enquiries/   ?category=&status=&q=
GET/PATCH        /api/admin-panel/experience-enquiries/<id>/   no POST, no DELETE
```

**Security posture on the new public write endpoint** — the first
unauthenticated POST on this site:

- `category`, `experience_title`, `user` and `status` are **derived
  server-side**, never accepted from the body. A crafted POST cannot open an
  enquiry that claims to be already contacted, mislabel its pillar, plant a
  staff note, or impersonate a member. Asserted by four tests.
- Rate-limited per IP (per account when signed in) via a new
  `ExperienceEnquiryThrottle`, configurable by `EXPERIENCE_ENQUIRY_RATE`.
- `submitted_ip` exists for throttling only and is absent from every
  serializer — asserted.
- An enquiry cannot be deleted; working it means moving it to contacted or
  closed.
- Only `status` and `admin_note` are writable in Back Office. What somebody
  asked for is a fact.

---

## 7. Existing functionality affected

Two shared files changed, both **fixes rather than modifications**:

- `src/admin/components/SharedUI.jsx` — `Table` tested `children ||`, and every
  one of its 23 callers passes `items.map(...)`, an **empty array, which is
  truthy**. Every admin table's `emptyText` was dead code and an empty list
  rendered a blank body. One fix, 23 tables.
- `src/services/apiClient.js`, `teenPattiService.js` — `is_registered` could
  never be true on the game pages, because those payloads are computed from
  `request.user` but were fetched with no `Authorization` header. Pre-existing
  on Teen Patti, fixed there too.

Otherwise: `LandingPage.jsx` (imports + one `id`), `index.css` (additive),
`index.html` (one font link), `LandingManageTab.jsx` (two sub-view entries),
`ManageContentTab.jsx` (a `hidden` field type). Nothing was removed.

---

## 8. Tests performed

**945 backend tests, 7 failures — the same 7 environmental ones as the
pre-existing baseline** (3 SPA-routing needing `FRONTEND_DIST_DIR`, which pass
with it set; 4 voice-call concurrency needing MySQL row locks). No regressions.

**48 new tests** in `tests_experiences.py`, covering the public payload,
enquiry capture, forgery resistance, throttling, Back Office permissions, the
overview band, and the seeded copy's claim surface.

`npm run check` clean (257 files); production build clean.

**Browser-verified after the change:**

- All 9 pre-existing landing sections present; all 5 new sections present;
  footer and 14 WhatsApp links intact.
- All 9 navigation items unchanged.
- 11 existing routes render: `/poker`, `/teen-patti`, `/andhar-bahar`,
  `/events`, `/promotions`, `/affiliates`, `/sign-in`, `/sign-up`,
  `/affiliate-register`, `/cookies-policy`, `/privacy-policy`.
- Enquiry flow end to end: modal opens with the right service, fields hold
  their values, submit saves, success screen shows, WhatsApp handoff builds
  with the correct per-country number and the Back Office template.
- The saved row carried correctly **derived** category and title, `status=new`
  and `user=None` for an anonymous send.
- "Talk To A VIP Host" fires the existing `open-chat` event — no second
  support system.
- Modal closes cleanly and restores body scroll.
- Mobile (375px): band goes 2-up, no horizontal page scroll, all cards fit.
- Back Office → Landing Page → Experiences shows five pillar tabs with the six
  overview cards in order.
- All six overview cards carry a decoding image (0 broken).
- All 8 derived chips are real `<button>` elements, tabbable, and each opens
  the enquiry for **that** service — verified "Cruise Journeys" and "Casino
  Introductions" each open their own modal.
- All 6 Explore buttons still scroll to their target section.

Verification data was removed afterwards.

---

## 9. Remaining limitations

1. **All six overview cards now carry a photograph.** VIP Concierge uses the
   private wine cellar; Events uses the live stage performance. **The Events
   image is the same photograph "Shows & Performances" uses** further down the
   page — there is no second event photograph in the repo. Uploading one
   against the Events card in Back Office replaces it and removes the
   repetition.
2. **Three pillar cards still have none** — Live Music, Suites & Private
   Villas, Arrival & Departure Nights. There is no live-music photograph and
   only one genuine resort image, which went to the lead Stays card rather than
   being repeated. These render type-only by design and look finished.
3. **Named partner-casino photographs are deliberately unused.** Venetian,
   Bellagio, Solaire and the rest would assert an accommodation or dining
   arrangement with that property that nobody has confirmed exists.
4. **`dance-1.jpg` is 4.4 MB at 4032×3024** and `lounge-1.jpg` 1.6 MB at
   2700×1800. This is **pre-existing** — the VIP gallery already loads both on
   the same page, and the new sections reuse the cached bytes (verified: second
   fetches return `304`). Downscaling both to ~1600px would cut roughly 5 MB
   off the landing page for no visible quality loss. Not done, as it touches
   shared assets outside this brief.
5. **No per-destination page yet.** §7's "each destination should *eventually*
   connect to" is structurally ready — `Experience` has a nullable `Destination`
   FK — but `/destinations/:slug` is not built, per the agreed scope.
6. **No frontend test runner exists** in this repo (`npm run check` is a static
   identifier/TDZ guard). The frontend behaviour above is guarded by browser
   verification, not automated tests.
7. **Screenshots could not be captured.** The preview pane returned black
   frames and then render timeouts throughout; its own diagnostic says the
   window being behind another can stop the page drawing. All verification
   above is DOM-based, which is reliable, but a visual pass by eye is still
   worth doing.

---

## 10. Visual verification

Not available — see limitation 7. Everything asserted in §8 was verified
through the DOM and the database rather than by image.

---

## Content discipline

No seeded row names a venue, operator, price, availability or licence.
Asserted by tests: every seeded card has an empty `partner`, empty `city` and
null `destination`, and the combined seeded copy contains none of "we own",
"our fleet", "our hotel", "our restaurant", "our ship", "our aircraft",
"licensed", "guaranteed", "best price" or "cheapest".

The casino card says plainly: *"We make the introduction; the venue runs the
floor."*

Every CTA on the new sections says **Enquire**, never Book — nothing here is
bookable through the site, and the enquiry modal states that nothing is booked
or charged from the form.
