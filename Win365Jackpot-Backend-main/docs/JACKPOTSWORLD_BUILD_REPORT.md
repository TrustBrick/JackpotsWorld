# JackpotsWorld — Build Report

Andhar Bahar, affiliate multi-game commission, dynamic FAQs, live-support call
control, and the System Logs / Video Analytics audit.

**Test baseline:** 734 tests before this work, 883 after (+149). The same 7
failures before and after, all environmental — see [§21](#21-tests-performed).

---

## 1. Files changed

### Backend — modified
| File | Change |
|---|---|
| `authapp/models/__init__.py` | Register the new models |
| `authapp/models/call_models.py` | Hold/transfer columns, `display_status`, extended `VoiceCallSettings`, hold/resume/transfer audit events |
| `authapp/models/affiliate_models.py` | `game` on `ReferralCommission` and `AffiliateClickLog` |
| `authapp/models/commission_rule_models.py` | `game` scope on `CommissionRule`, `game` on `CommissionLedgerEntry`, rescaled specificity weights |
| `authapp/models/landing_models.py` | `andhar_bahar` added to `SectionMedia.SECTION_CHOICES` |
| `authapp/models/andhar_bahar_models.py` | `AndharBaharRegistration`; sign-up hero copy defaults + `signup_prompt` |
| `authapp/serializers/andhar_bahar_serializers.py` | `is_registered`/`can_register` on events; member + admin registration serializers |
| `authapp/views/andhar_bahar_views.py` | Register / my-registrations / Back Office registrations views |
| `authapp/url_patterns/andhar_bahar_urls.py` | Registration routes |
| `authapp/models/offline_deposit.py` | `game` column + index |
| `authapp/services/analytics_service.py` | **CTR root-cause fix**, `_pct()` guard, country names, Unknown reasons, `urls_report` removed |
| `authapp/services/commission_engine_service.py` | `game` threaded through `evaluate()` → ledger → money row |
| `authapp/services/commission_rule_service.py` | `game` in `resolve_rule()` / `has_commission_rule()` |
| `authapp/services/voice_call_service.py` | Call-restriction gate on `initiate_call`, hold closed on call end |
| `authapp/services/live_chat_service.py` | `ChatRestricted`, chat gate in `get_or_create_active_session` |
| `authapp/views/analytics_views.py` | `AdminAnalyticsUrlsView` removed |
| `authapp/views/affiliate_views.py` | `AffiliateInsightsView`, `AffiliateProgramStatsView`, referral-link game capture |
| `authapp/views/admin_offline_deposit_views.py` | `game` read and passed at all three commission trigger sites |
| `authapp/views/voice_call_views.py` | Hold config + `calls_allowed` on the call-config endpoint |
| `authapp/views/live_chat_views.py` | 403 + player-safe message on `ChatRestricted` |
| `authapp/views/landing_views.py` | Section-media admin bases reused by Andhar Bahar |
| `authapp/views/seo_views.py`, `views/spa_seo.py` | `/andhar-bahar` sitemap + route metadata |
| `authapp/serializers/voice_call_serializers.py` | `display_status`, hold/transfer fields |
| `authapp/serializers/user_serializers.py` | `country_display` |
| `authapp/consumers/live_chat_consumer.py` | Per-agent socket group for named transfers |
| `authapp/url_patterns/{analytics,affiliate,voice_call}_urls.py`, `urls.py` | Route wiring |
| `authapp/management/commands/sweep_expired_calls.py` | Drives `sweep_expired_holds()` |
| `authapp/tests_landing_wording.py` | Guard extended to read frontend component sources (§22) |

### Backend — created
`constants/games.py` · `constants/__init__.py` · `models/andhar_bahar_models.py` ·
`models/faq_models.py` · `models/support_communication_models.py` ·
`serializers/andhar_bahar_serializers.py` · `serializers/faq_serializers.py` ·
`serializers/call_control_serializers.py` · `services/affiliate_dashboard_service.py` ·
`services/call_control_service.py` · `services/communication_restriction_service.py` ·
`views/andhar_bahar_views.py` · `views/faq_views.py` · `views/call_control_views.py` ·
`url_patterns/andhar_bahar_urls.py` · `url_patterns/faq_urls.py` · `utils/countries.py` ·
`.ebextensions/02_cron.config`

### Frontend — modified
`App.jsx` (routes, incl. the two Andhar Bahar auth routes) · `components/Navbar.jsx` (nav) ·
`components/BusinessModelFAQ.jsx` (dynamic) · `pages/AuthPage.jsx` (section-aware `tab`/`returnTo`/`prompt`) ·
`pages/AndharBahar.jsx` (registration flow) · `services/apiClient.js` (`apiGetMaybeAuthed`, `authKey`) ·
`services/teenPattiService.js` (member-scoped reads — §14) · `admin/components/SharedUI.jsx` (`Table` empty state — §14) ·
`components/Testimonials.jsx` (fabricated winners removed — see §22) ·
`pages/Affiliates.jsx` · `services/landingService.js` · `services/voiceCallService.js` (hold engine) ·
`hooks/useVoiceCall.js` (hold/transfer) · `components/support/ActiveCallModal.jsx` ·
`components/support/CallHistoryList.jsx` · `components/ChatBot.jsx` ·
`components/support/ServiceRequestConversation.jsx` · `admin/AdminPanel.jsx` · `admin/constants.js` ·
`admin/context/AdminVoiceCallContext.jsx` · `admin/tabs/SystemLogsTab.jsx` · `admin/tabs/UsersTab.jsx` ·
`admin/tabs/content/ManageContentTab.jsx` (+`listParams`, multi-select) ·
`admin/tabs/analytics/{AnalyticsShared,AnalyticsOverviewTab,VideoAnalyticsTab,VisitorAnalyticsTab}.jsx` ·
`affiliate/AffiliatePanel.jsx` · 24 × `i18n/locales/*/common.json`

### Frontend — created
`pages/AndharBahar.jsx` · `pages/AndharBaharAuth.jsx` · `services/andharBaharService.js` ·
`components/AffiliateSupportedGames.jsx` · `admin/tabs/content/AndharBaharRegistrationsTable.jsx` ·
`components/support/TransferCallModal.jsx` · `components/support/IncomingTransferModal.jsx` ·
`admin/tabs/content/AndharBaharManageTab.jsx` · `admin/tabs/content/FaqManageTab.jsx` ·
`admin/tabs/content/LiveSupportSettingsTab.jsx` · `admin/components/PlayerCommunicationPanel.jsx` ·
`affiliate/tabs/InsightsTab.jsx`

### Frontend — deleted
`components/AffiliateFloatingCards.jsx` (fabricated + triple-rendered — see §5) ·
`admin/tabs/analytics/UrlAnalyticsTab.jsx`

---

## 2. Database migrations

| Migration | What |
|---|---|
| `0085_andhar_bahar_faq_game_and_support_comms` | All new tables + columns |
| `0086_seed_andhar_bahar_faq_and_rescale_specificity` | Seeds FAQs/highlights/steps; **rescales `CommissionRule.specificity`** |
| `0087_andhar_bahar_section_media` | `andhar_bahar` section choice |
| `0088_offline_deposit_game` | `OfflineDepositLog.game` |
| `0089_andhar_bahar_vip_host_cta` | Repoints the default CTA at the in-page concierge |
| `0090_default_max_hold_seconds` | 0 → 120s, now that the sweep enforces it |
| `0091_close_holds_on_ended_calls` | Closes holds left open by calls that ended |
| `0092_andhar_bahar_registration` | `AndharBaharRegistration` table |
| `0093_andhar_bahar_signup_copy` | Sign-up hero copy defaults + `signup_prompt` column |
| `0094_andhar_bahar_signup_copy_data` | Moves existing rows onto the new copy — **only** fields still holding the exact old default, so an edited row is never overwritten |

All reversible. 126 migrations apply cleanly on an empty database; applied to
local MySQL and verified.

> **0086 is the one that must not be skipped.** `specificity` is a denormalised
> column recomputed only in `save()`. 0085 doubled the affiliate/casino/country
> weights to make room for `game`, so without the rescale old rows (0–7 scale)
> would be compared against new ones (0–15) and commission precedence would be
> silently wrong. The rescale is a monotonic no-op in behaviour.

---

## 3. APIs

### Added
```
GET    /api/andhar-bahar/content/              public — whole page in one payload
GET    /api/andhar-bahar/events/               public, filterable
GET    /api/andhar-bahar/events/filters/       public
GET    /api/andhar-bahar/events/<id>/          public
POST   /api/andhar-bahar/events/<id>/register/ IsAuthenticated
GET    /api/andhar-bahar/my-registrations/     IsAuthenticated, own rows only
GET    /api/faqs/?category=                    public
GET    /api/affiliate/program-stats/           public, supported games only
GET    /api/affiliate/insights/                IsAffiliate
GET    /api/live-chat/communication-status/    IsAuthenticated, own account

GET/PATCH        /api/admin-panel/andhar-bahar/content/
GET/POST         /api/admin-panel/andhar-bahar/{highlights,steps,events,media}/
GET/PATCH/DELETE /api/admin-panel/andhar-bahar/{highlights,steps,events,media}/<id>/
GET              /api/admin-panel/andhar-bahar/registrations/       ?event=&status=&q=
GET/PATCH        /api/admin-panel/andhar-bahar/registrations/<id>/  no POST, no DELETE
GET/POST         /api/admin-panel/faqs/
GET/PATCH/DELETE /api/admin-panel/faqs/<id>/
POST             /api/admin-panel/faqs/reorder/
POST   /api/admin-panel/live-chat/calls/<id>/hold/
POST   /api/admin-panel/live-chat/calls/<id>/resume/
POST   /api/admin-panel/live-chat/calls/<id>/transfer/
GET    /api/admin-panel/live-chat/calls/<id>/transfers/
POST   /api/admin-panel/live-chat/transfers/<id>/{accept,decline,cancel}/
GET    /api/admin-panel/live-chat/transfer-targets/
GET    /api/admin-panel/live-chat/call-control-config/
GET/POST         /api/admin-panel/support-departments/
GET/PATCH/DELETE /api/admin-panel/support-departments/<id>/
GET/PATCH        /api/admin-panel/live-support-settings/
GET/POST         /api/admin-panel/players/<id>/communication/
GET              /api/admin-panel/players/<id>/communication/history/
```

### Modified
`/api/live-chat/calls/config/` — adds hold config + `calls_allowed`.
`/api/admin-panel/analytics/videos/[<id>/]`, `/analytics/overview/`,
`/analytics/locations/`, `/analytics/visitor-locations/`, `/analytics/clicks/` —
exposure metrics, both CTRs, full country names, Unknown reasons.

### Removed
`/api/admin-panel/analytics/urls/`

---

## 4. Andhar Bahar

Route `/andhar-bahar`, nav entry in place of **Contacts** (the footer it scrolled
to is untouched and still reachable). Page sections: hero → intro → how a round
works → highlights → destinations/events → FAQ → closing CTA.

**Nothing on the page is hardcoded copy.** Every headline, paragraph, CTA label,
*CTA target*, benefit card, step, event and FAQ comes from
`GET /api/andhar-bahar/content/`. The only literals in `pages/AndharBahar.jsx`
are structural labels ("Loading…", "Try again") and a deliberately thin offline
fallback (hero only) so a live nav link never renders a blank column.

Back Office → **Andhar Bahar**: Page Content · How To Play · Highlights ·
Events · **Registrations** · Hero Media. Add / edit / delete / enable / disable /
reorder throughout — except Registrations, which is read-only plus two editable
fields (see below).

### The hero asks for the sign-up
The hero opens with the question the section is actually for — *"Are you an
Andhar Bahar player?"* — and says what signing up gets you: the events, the
venues, and where tables are live. The primary CTA points at
`/andhar-bahar/sign-up`. All of it is Back Office copy, including a
`signup_prompt` field for the banner shown to signed-out visitors; migration
0094 moves existing rows onto the new wording **only where the field still holds
the exact old default**, so a row an admin had already edited is never
overwritten.

### Its own sign-up / sign-in doorway
`/andhar-bahar/sign-up` and `/andhar-bahar/sign-in` render `AuthPage` with the
Andhar Bahar prompt above it, and return the visitor to `/andhar-bahar`
afterwards instead of the generic dashboard.

**One account, not a second user system.** These are a different *doorway* to
the same registration — same `User`, same tokens, same everything. A separate
account per game would mean a player with three logins, three wallets and three
KYC records; nothing about "a sign-up page for this section" asks for that.

### Registrations
`AndharBaharRegistration` — **interest capture, exactly like Poker**, not a
booking. An `AndharBaharEvent` still has no seats and no confirmation IDs, so
there is nothing to reserve; what a registration records is *this member wants
to be told about this event*, and a host works the list from Back Office.

- `unique_together (event, user)` is the hard guard; the view uses
  `get_or_create`, so a double-submit reads as "already registered" (200,
  `created: false`) rather than an error or a second row.
- A non-public event 404s rather than 403s — whether a draft exists is not a
  visitor's business. A finished event 409s (`event_completed`).
- `is_registered` / `can_register` ride on the event payload, so the card knows
  its own state without a second request. `can_register` mirrors the server-side
  gate and is **advisory only** — the view re-checks.
- `admin_note` is staff context about a member and is **absent from the member's
  own serializer**, not merely hidden in the UI.
- Back Office → Registrations is a dedicated read-only table with an inline
  status select and a note field, filterable by status and searchable by member
  name / email / UID / event name (server-side, paginated). It is deliberately
  **not** `ManageContentTab`: that component offers Create and Delete, and the
  backend exposes neither (`ListAPIView` + `RetrieveUpdateAPIView`), so those
  buttons would render and then 405. Poker's table exists for the same reason.
- Only `status` and `admin_note` are writable. Who registered for what is a
  fact — `read_only_fields` covers everything else server-side.

Reuses rather than duplicates: `Casino` for venues, `SectionMedia` for hero
media, the Teen Patti event-status vocabulary, `ManageContentTab` for CRUD,
`PageHeader`/`SectionHeroMedia`/`casino-card` for styling.

**Still seatless by design** — an `AndharBaharEvent` is a destination/date
showcase. Teen Patti's seat accounting and confirmation IDs are deliberately
*not* copied: registering interest is not claiming a seat, and inventing seat
counts nothing enforces would leave a half-built booking flow behind.

No claim on the page asserts an outcome; a test (`test_no_seeded_copy_claims_an_outcome`)
fails if "guaranteed"/"sure win"/"risk-free" is ever seeded into the defaults.

---

## 5. Affiliate changes

### The duplicate players — root cause
`AffiliateFloatingCards.jsx` did two things wrong at once:

1. **Fabricated data.** Names, cities, referral counts and commission figures
   were generated with `Math.random()` on every page load, under the heading
   "Affiliates Earning Right Now". Nobody in it existed.
2. **The duplicate render.** `InfiniteScrollStrip` built
   `[...cards, ...cards, ...cards]` to fake an infinite loop, so **each card
   appeared three times on screen simultaneously**. React did not warn, because
   the key appended the array index — three renders of one person looked like
   three distinct keys.

The component is **deleted**, not hidden.

### What stands there now: the three games
It was first replaced with real aggregate counts — active partners, players
referred, countries reached, under "Where Our Partners Reach". Those numbers
were genuine, but they were the wrong thing to publish on a recruitment page and
**have since been removed on request**. `AffiliateSupportedGames.jsx` now renders
one card per game — Poker, Teen Patti, Andhar Bahar — each saying what a referred
player would actually come for, with a link to that section.

`GET /api/affiliate/program-stats/` was slimmed to match: it returns
`supported_games` and nothing else. No counts are computed for nobody, and a
public, unauthenticated endpoint discloses that much less about the business.
The list comes from `constants/games.py`, so adding a game to the platform adds
it to the page with no frontend change.

**No headline percentage appears anywhere on it.** Commission varies by game,
country, destination and tier and is set per affiliate, so any single number
there would be invented; the card footer says rates are confirmed with an
account manager, and an affiliate's real rates stay behind `IsAffiliate` on the
insights endpoint. Verified: 0 duplicated cards, 0 fabricated figures.

### New metrics (affiliate panel → **Insights**)
Total/active referrals (active = a 30-day recency window, not `is_active`, which
counted every un-banned account) · conversion rate · lifetime/pending/paid/rejected
earnings · commission by game, status and type · top performing game · monthly
performance · recent activity · tier progress · supported games with live rates ·
per-game referral links with copy · click conversion.

Every number is a real row. Where data does not exist the payload returns `null`
and the UI renders an honest empty state — `top_game` is `null` until real
attributed activity exists, `tier` is `null` unless a tiered rule actually
applies, and a game with no matching rule reads "As agreed" rather than an
invented percentage.

Added as a **new tab** beside Overview rather than a rewrite, so the shipped
Overview payload is untouched. Both share their funnel maths through
`affiliate_stats_service`, so they cannot disagree about "qualified".

---

## 6. Commission architecture

The existing three-layer stack is **unchanged and still resolves in the same
order**: `CommissionRule` → `CommissionPlan` → `AffiliateProfile.commission_rate`.

`game` is a **fourth scope dimension** on `CommissionRule`, worth 1, while the
other three weights were doubled:

```
affiliate 8 · casino 4 · country 2 · game 1
```

Doubling is a monotonic rescale, so **every pre-existing rule keeps its exact
relative position**. `game` can only break a tie within a level — a global
"Poker 5%" rule does not leapfrog an affiliate-specific arrangement, and
`country=India + game=poker` (3) beats plain `country=India` (2). `game=""`
means "any game", which is what every rule written before this carries.

**Attribution is about activity, not marketing.** `AffiliateClickLog.game`
records what the referral link was promoting; `CommissionLedgerEntry.game` and
`ReferralCommission.game` record which game the qualifying activity actually
happened in. A player referred through a poker link who plays Andhar Bahar
generates Andhar Bahar commission. Captured at the offline-deposit / rolling-points
form — the only moment anyone actually knows.

The four concerns stay separate, as asked:
**A** rules (`CommissionRule`) · **B** ledger (`CommissionLedgerEntry`) ·
**C** earnings (`ReferralCommission`, `AffiliateProfile.total_earned`) ·
**D** manual adjustments (`manual_commission_service`, untouched).

Idempotency is unchanged: `uniq_commission_ledger_reference` on
(affiliate, player, type, reference). Verified — processing one bet slip five
times creates one ledger row and one money row.

---

## 7. FAQ

`FAQ` model, one table scoped by `category` (landing / affiliate / andhar_bahar).
Back Office → **FAQs**: add, edit, delete, enable/disable, feature, and a
**reorder control** that posts the whole ordered id list to
`/api/admin-panel/faqs/reorder/` in one transaction.

> **On the landing four.** They were hardcoded, and the comment said why: they
> are the compliance statement of what this business is *not* ("Is JackpotsWorld
> an online casino? No."), and must not vanish because an API call failed. They
> are now editable, and that reasoning is honoured two ways rather than by
> refusing: migration 0086 seeds the exact originals verbatim, and the component
> keeps them as an **offline fallback** rendered whenever the API returns nothing.
> So the failure mode the original comment guarded against still cannot happen.
> Editing them is now a deliberate act with an audit trail (`updated_by`).

Frontend: accessible accordion (`aria-expanded` / `aria-controls` / `role=region`),
smooth open/close, `pre-line` answers, mobile responsive.
**Verified dynamic end-to-end** — a row inserted directly into the database
appeared on the live page after reload, with no code change.

---

## 8. Live call architecture

Built on the app's **existing WebRTC stack**. No telephony provider is involved
and none is required. Audio is peer-to-peer; Django Channels carries signaling
only. No new credentials, no new external dependency.

### Hold / unhold — real, not decorative
There is no media server, so server-side mixing (and therefore server-injected
hold music) is impossible. What is implemented instead genuinely stops audio:

* **Server** (`CallSession.is_on_hold`) is the single authority — set in a
  conditional UPDATE, recorded as a `CallHoldEvent`, pushed to both endpoints
  and the desk. Neither browser decides; both are told.
* **Agent browser** disables its outbound audio track and mutes the inbound one.
* **Customer browser** mutes inbound audio and plays the configured hold audio
  locally, looping, until resume.

On hold the customer genuinely cannot hear the agent, the agent genuinely cannot
hear the customer, and the customer genuinely hears the hold track. The call
stays `connected` throughout — the peer connection is never torn down, the
recording keeps running, and resume is a track toggle rather than a renegotiation.

State lives on the server so an agent whose tab crashes cannot strand a customer
on hold: `max_hold_seconds` (default 120s) lets the server end it, recorded with
`auto_resumed=True`. Enforced by `sweep_expired_calls`, scheduled every minute
via `.ebextensions/02_cron.config`.

**Hold audio rights:** no audio file is bundled. An admin uploads their own, and
with none configured clients fall back to a WebAudio-synthesised periodic tone —
not a recording, so no rights attach.

### Forwarding / escalation — real
A transfer moves the **same `CallSession`** to a different agent. One ticket, one
row, one recording, continuous duration.

1. Agent A forwards to a named agent or a department. The customer goes on hold
   (`reason="transfer"`), `is_transferring` is set, a `CallTransfer` row is
   created. Its `pending_key` is under a unique constraint, so two agents
   pressing Forward at the same instant produce exactly one pending transfer —
   a database guarantee, not a check-then-insert.
2. The target is rung: their own socket group for a named transfer, every
   eligible member for a department.
3. First to accept wins, via the same conditional-UPDATE race `accept_call()`
   already uses. `CallSession.receiver` is reassigned in that UPDATE — **that is
   what actually moves the call**, because the consumer authorises signaling
   membership against `receiver` on every frame, so A is dropped and B admitted.
4. Both endpoints renegotiate; the customer comes off hold.
5. A declined or timed-out transfer returns the call to A and lifts only the
   hold *the transfer imposed*. The failed attempt stays as a row.

Department membership is intersected with call eligibility, so adding a finance
user to a department cannot make them answerable for calls.

### Who is offered — two signals, weighted differently
The picker lists only colleagues who can take the call **now**, and the two
inputs are deliberately not treated alike:

| Signal | Source | Weight |
|---|---|---|
| **On a call** | live `CallSession` rows (`busy_agent_ids`) | **Hard** — hidden from the picker *and* refused by `request_transfer` (409 `target_on_a_call`) |
| **Offline** | `SupportAgentPresence` (WebSocket) | **Soft** — hidden from the picker, but never refused |

Busy is always correct and has no infrastructure dependency. Offline does: a
dropped socket or a reconnect in flight reads exactly like an empty chair, so
refusing on it would block transfers that would have worked — and an absent
agent already degrades gracefully, since the ring lapses and the call returns
to the original agent.

With **no presence rows at all** (realtime off, layer unavailable) the presence
filter stands down entirely: that means presence is not being tracked, not that
the whole desk went home, and filtering there would make forwarding impossible
for everyone. Department routing uses the busy signal only, for the same
reason — a blinking socket must not make a staffed department refuse a forward.

Availability decides who is **offered**; eligibility still decides who is
**allowed** to accept. An agent who comes free a second before clicking Accept
is not refused for having been busy when the card was drawn.

### Finding the right colleague
The picker searches **name, email, department and role**, case-insensitively,
on any substring — so `priya`, `kumar`, `rahul.k@example.com`, `priya.sharma`,
`@example.com`, `kyc` and `support` all match. It shows a live match count and
a clear button, because a search that silently returns nothing is
indistinguishable from one that broke.

Two inconsistencies were fixed here, mirror images of each other: **email was
searchable but never displayed** (so you could match on a field you could not
see to confirm — exactly the case two colleagues sharing a first name creates),
and **role was displayed but not searchable** (a colleague with no department
shows their role, and typing it matched nothing). Each agent row now carries
the email beneath the name, suppressed only when the name *is* the email, which
is the server's fallback for an agent with no name set.

### Statuses
`display_status` composes one word from `status` plus the orthogonal flags:
**Ringing · Connected · On Hold · Forwarding · Forwarded · Ended · Missed ·
Failed · Rejected · Cancelled.** Forwarding outranks hold (a forwarded call is
also held; "on hold" would be true and misleading). "Forwarded" is an *outcome* —
a terminal call that ended on a different agent than it started with.
"Calling" is the caller-side reading of `ringing`, rendered by the customer
widget from its own phase; one row cannot be two words at once.

Hold and transfer are **not statuses** by design — modelling them as such would
break every `status == "connected"` check in the stack and tear the recorder
down mid-call.

Recorded: every hold period with duration and who resumed it, every transfer
attempt including declines and timeouts, and `CallEvent` timeline entries so a
call reads as one ordered sequence.

---

## 9. Player communication restrictions

`PlayerCommunicationRestriction` — one row per (user, channel), plus an
append-only `PlayerCommunicationRestrictionLog`.

Back Office → **Users → [player] → Support access**: enable/disable chat and
calls independently, set an expiry, record a reason and an internal note, write
a player-facing message, and view the full history.

**One function decides and every gate calls it** — `check(user, channel)`
combines the platform switch, working hours (calls only), and the player's own
row. Enforced in `live_chat_service.get_or_create_active_session` and
`voice_call_service.initiate_call`, so a player calling the API directly is
still refused. The widget hiding the button is presentation, not the gate.

**Expiry is evaluated on read** — no scheduler. A restriction that lapsed thirty
seconds ago is already lifted the next time the player tries.

**`reason` and `admin_note` are never sent to a player.** Only `player_message`
(or the configured default) is, and a test asserts the internal text never
appears in any player-facing response.

---

## 10. Live Support settings

Back Office → **Live Support Settings**, backed by the existing
`VoiceCallSettings` singleton (extended, not duplicated — a second settings model
would mean two places to look for "is calling on?").

Availability (chat/calls on/off, working hours, holiday mode, ring timeout) ·
Hold (enabled, audio upload with in-page preview, message, maximum) ·
Forwarding (enabled, ring timeout) · Departments (roster, ring timeout, order) ·
Every player-facing message (offline, queue, chat-disabled, call-disabled,
call-unavailable) · Recording.

---

## 11. System Logs changes

**URL Analytics removed** — sidebar tab, component, `AdminAnalyticsUrlsView`,
the `/analytics/urls/` route and the `urls_report` aggregation.

Deliberately **kept**, because other analytics depend on them:
`EVENT_URL_CLICK` and `CampaignClickRedirectView` (Campaign Analytics counts
those events), and the `utm_*` columns (read by `campaigns_report` and campaign
matching). A test now asserts the UTM data still lands on the event — proof the
removal took the report and not the data.

Remaining seven sections verified working: Overview · Campaign Analytics ·
Video Analytics · Member Analytics · Visitor Analytics · Click Analytics ·
Diagnostic.

---

## 12. Video CTR — root cause

CTR was `unique_clickers / unique_viewers`, where "viewers" meant everyone who
had **played** the video. Two faults compounded:

1. **`video_click` is, by its own definition, the gesture that starts playback**
   ("tap on the poster/native controls to start or resume"). On a click-to-play
   video that same gesture also produced the `video_start` that put the viewer
   in the denominator. The numerator was largely a subset of the denominator by
   construction, so CTR sat pinned near 100% however the video performed — and
   could **exceed** 100%, since a tap that never resulted in playback, or a CTA
   click, has no matching start.

2. **`video_impression` was ingested, stored, and never read.** The client has
   always emitted it — once per video per tab session, when the player is at
   least half on screen — and the vocabulary comment that introduced it says
   plainly it is *"the denominator for a view-through rate"*. `_reduce_video()`
   handled start/complete/progress/click/cta_click and silently dropped
   impression, pause and exit.

**The fix is reading the signal that was already being collected**, not a formula
tweak. Exposure is now the denominator:

```
unique_exposed = impression viewers ∪ players ∪ clickers
ctr        = unique clickers / unique_exposed      ("Unique CTR")
total_ctr  = total clicks    / total impressions   ("Total CTR")
```

The union matters: a play or a click is itself proof of exposure, so a missing
impression event can never push CTR over 100%.

Unique CTR stays the headline (someone who plays three times and clicks once is
one click-through). Total CTR is reported beside it and *can* legitimately exceed
100% — which is exactly why the two are labelled separately rather than blended.
`has_impression_data` keeps it honest: with no impressions, Total CTR is `null`
and the dashboard shows a dash, not a fabricated 0%.

Also now surfaced: impressions, unique impressions, people exposed, view-through
rate, pauses, exits.

**Verified against real records:** 10 impressions + 2 clickers → **20.0%**,
end to end through the live service. Under the old formula this same data
returned **0%** — nobody played, so its denominator was zero.

---

## 13. Country names & "Unknown"

`authapp/utils/countries.py` — the **complete ISO 3166-1 alpha-2 set (249
officially assigned codes)**, not a convenience subset. Shipped as a data module
rather than a new pip dependency: it is a static standard, and a new dependency
is an install step on every EB instance and a deploy risk for a lookup table.

Precedence in `display_country()`: the provider's own stored `country_name` →
this table → the raw code → "Unknown". An unrecognised code shows *itself*
(`XK → XK`) rather than being hidden behind "Unknown". The database still stores
codes; this is display only, resolved once server-side rather than in each of the
several places that render a country.

Applied to: video location report, visitors-by-country, clicks-by-country,
visitor list, visitor detail, and the admin Users list (`country_display`).

### What "Unknown" actually means here
Not renamed — **investigated**. The reason was already recorded at lookup time on
`Visitor.geo_status`; it was just never surfaced. Each bucket now carries an
`unknown_reasons` breakdown:

| status | shown as |
|---|---|
| `private_ip` | Local / private network |
| `failed` | Geo-location lookup failed |
| `unavailable` | Geo-location unavailable |
| `success` (blank country) | Provider returned no country |
| no Visitor row | No location recorded |

**On this deployment's data**, every un-geolocated row is explained: 850 events
`private_ip` (developer/local traffic — `utils/geolocation.is_private_ip`
deliberately never sends those to the provider) and 99 `no_visitor` (rows
predating visitor tracking). Previously this rendered as a bare "Unknown: 13"
with no way to tell those apart. No IP is exposed.

---

## 14. Bugs discovered during the audit

| # | Bug | Fix |
|---|---|---|
| 1 | **CTR numerator inside its own denominator** — pinned near/above 100% | §12 |
| 2 | **`video_impression` collected and never aggregated** | §12 |
| 3 | `video_pause` / `video_exit` ingested, never reported | Now counted |
| 4 | Retention funnel's `started or 1` reported 100% of nothing on an empty window | `_pct()` guard |
| 5 | Country rendered as a raw ISO code | §13 |
| 6 | "Unknown" collapsed five distinct causes into one bucket | §13 |
| 7 | **Affiliate cards rendered 3× each** (`[...cards, ...cards, ...cards]`) | Component deleted |
| 8 | **Affiliate cards were `Math.random()` fabrications** presented as real | Replaced with real aggregates |
| 9 | "Active Referrals" read `is_active` — counted every un-banned account | 30-day recency window |
| 10 | `is_on_hold` never cleared when a call **ended** — `live_hold_seconds` grew forever | Closed on end + migration 0091 |
| 11 | `max_hold_seconds` default 0 with nothing enforcing it | 120s + sweep (0090) |
| 12 | Andhar Bahar CTA pointed at `/#contact` — a hash React Router ignores, so it read as "go home" | Repointed at the in-page concierge (0089) |
| 13 | **Forwarding reported as "on hold"** — a transfer sets both flags; caught by a test I wrote | Forwarding outranks hold |
| 14 | `display_status` never reached the history UI | Exposed on the serializer + rendered |
| 15 | `specificity` rescale would have silently reordered commission precedence | Migration 0086 |
| 16 | **Migration 0080's cleanup was incomplete** — it deleted six fabricated testimonial rows but missed the component's hardcoded copy, and that component's own filter guaranteed the copy would render | §22 |
| 17 | **`Testimonials.jsx` scroll strips**: 60 `Math.random()` people with invented winnings and stock face photos, each rendered 3× | Strips deleted |
| 18 | The wording guard read only the database, by its own admission — the exact gap that let 16 survive | Now reads component sources too |
| 19 | **The forward picker offered agents already on a call with a player** — it filtered on role and active only, never on whether they could answer. Forwarding to one rang nobody and left the customer on hold until the window lapsed | Hidden from the picker and refused server-side (§8) |
| 20 | *Introduced then corrected during this work:* treating "offline" as hard as "on a call" broke 14 existing transfer tests and would have made forwarding impossible whenever presence was unavailable | Signals split by reliability (§8) |
| 21 | Forward picker searched **email but never showed it**, so a match could not be confirmed | Email rendered under the name (§8) |
| 22 | Forward picker **showed role but would not search it** — a colleague with no department displays "support", and typing it matched nothing | Role added to the search (§8) |
| 23 | **`is_registered` could never be true on the game pages.** The event payloads carry `is_registered` / `my_confirmation_id` / `can_register`, all computed server-side from `request.user` — but the frontend fetched those endpoints with `apiGet`, which sends **no `Authorization` header**. Every request arrived anonymous, so a member who had already registered was still shown "Register". Pre-existing on **Teen Patti** (its card and details page both read those fields) and inherited by Andhar Bahar | New `apiGetMaybeAuthed` in `apiClient.js` sends the token when there is one and still works without; caches keyed by `authKey()` so a signed-out visitor is never served a signed-in payload and a cached "Registered" cannot survive a sign-out |
| 24 | **Every admin table's `emptyText` was dead code.** `SharedUI.Table` rendered `children \|\| <empty row>`, and every one of its 23 callers passes `items.map(...)` — an **empty array, which is truthy**. An empty list therefore showed a blank table body instead of the message each caller had carefully written | `Table` now tests the array's length; all 23 tables get their empty state back from one fix |

---

## 15. Security

* Every admin endpoint on `IsAdminOrSuperAdmin`; affiliate endpoints on
  `IsAffiliate`. Asserted by tests, including that a signed-in player gets 403.
* **Affiliates cannot change their own commission rate** — no affiliate-facing
  write path to `CommissionRule`; asserted.
* **Players cannot lift their own restriction** — admin-only endpoint; asserted.
* Call control is narrower than call visibility: only the agent *currently on*
  a call may hold, resume or forward it (`_require_controlling_agent`).
* Internal notes never reach players (service + serializer, both asserted).
  This now covers Andhar Bahar too: `admin_note` on a registration is **absent
  from the member's own serializer**, not merely hidden by the UI, and a test
  asserts the text never appears in the member's payload.
* **Andhar Bahar registration is member-scoped both ways.** `my-registrations`
  filters to `request.user`; the Back Office list is `IsAdminOrSuperAdmin` and
  asserted to 403 for a signed-in player on both GET and PATCH.
* **Registration cannot be reassigned.** `event` and `user` are in
  `read_only_fields`, so a PATCH naming another member or event is accepted and
  silently ignored rather than moving the row — asserted.
* `can_register` on the event payload is **advisory**: the register view
  re-checks status, active flag and completion itself, so a tampered client
  gains nothing.
* `apiGetMaybeAuthed` never widens access — it is only for `AllowAny` routes
  that answer slightly differently for a signed-in member, and degrades to the
  public answer when the token is missing or expired. Its cache is keyed on
  whether a token was present, never on the token itself, so no credential
  reaches a cache key.
* No provider credentials introduced; no secret added to any response — the
  existing config-payload allowlist test was extended rather than removed.
* Commission duplication prevented by a real database constraint.
* Analytics idempotency via `client_event_id`.

---

## 16. Responsiveness

Verified at 375×812 with a fresh mount: Andhar Bahar page, Affiliates page, and
the Back Office Andhar Bahar / FAQs / Live Support Settings / System Logs tabs —
**no horizontal page overflow** anywhere. Wide analytics tables scroll inside
their own `overflow-x: auto` container.

> Framer-motion entrance animations freeze mid-flight in the in-app preview pane
> because it starves `requestAnimationFrame`. Confirmed environmental: the
> pre-existing, untouched Poker page shows `opacity: 0` on its heading in the
> same pane. Real browsers are unaffected.

---

## 17. Tests performed

**901 tests, 7 failures — the same 7 as the 734-test baseline before this work.**

| Failure | Why it is environmental |
|---|---|
| 3 × `tests_spa_routing` | `FRONTEND_DIST_DIR` defaults one level too high. **Re-run with it set: 6/6 pass.** |
| 4 × `tests_voice_call_concurrency` | `TransactionTestCase`s racing real connections against a unique constraint; SQLite is single-writer. Need MySQL. |

New: `tests_video_ctr` (11) · `tests_call_control` (53) · `tests_andhar_bahar` (47) ·
`tests_affiliate_insights` (31) · `tests_user_country_display`. Plus a 37-check
acceptance audit exercising the real services — **37/37 pass**.

Andhar Bahar registration coverage specifically: interest captured · a second
submit is a friendly no-op, not a duplicate row · anonymous refused · draft
event 404s · finished event 409s · the card reports the member's own state ·
an anonymous visitor is never reported as registered · `my-registrations` is
scoped to the requester · **the member's serializer never carries
`admin_note`** · Back Office lists and works the lead · who-registered-for-what
cannot be rewritten · the table is admin-only for both GET and PATCH · the hero
asks for the sign-up · the CTA points at the section's own route · the prompt is
Back Office editable.

Manual verification: nav (Contacts gone, Andhar Bahar present and highlighted,
no duplicates) · Andhar Bahar page rendering from the database · FAQ dynamism
proven by a direct DB insert appearing on the live page · 0 duplicated cards on
Affiliates · URL Analytics gone with 7 sections intact · CTR 20% on the worked
example · production build clean (prod Turnstile key present once, no localhost
leak).

Browser-verified end to end for this round: new hero copy served from the
database · signed-out visitor sees the sign-up banner and "Sign Up To Register" ·
`/andhar-bahar/sign-up` and `/andhar-bahar/sign-in` each open on the right tab
with the prompt · registering as a member writes the row and the card flips to
**Registered** · signing out returns the card to "Sign Up To Register" with no
cached registered state · Back Office → Registrations lists the member, filters
by status, searches by email and by UID, shows its empty state on no match, and
persists both the status select and the note field · Users / Manage Poker /
Teen Patti / FAQs tables still render rows after the shared `Table` fix ·
Affiliates shows the three game cards and none of the removed headings.

> The in-app browser pane runs with `document.hasFocus() === false`, so its
> synthetic clicks and `.focus()`/`.blur()` calls do not reach React (React 17+
> maps `onBlur` to `focusout`). Interactions above were driven by dispatching
> the real events; a failure to respond to a synthetic click in that pane is a
> harness artefact, not a page bug.

---

## 18. External services & environment variables

**No new external service is required.** Call forwarding and hold run on the
existing WebRTC stack.

No new environment variables. Existing ones remain relevant:

| Variable | Effect |
|---|---|
| `VOICE_CALL_RECORDING_ENABLED` | Hard master switch above the Back Office recording toggle |
| `VOICE_CALL_RING_TIMEOUT_SECONDS` | Default ring window (Back Office can override) |
| `WEBRTC_TURN_URLS` / `WEBRTC_TURN_STATIC_AUTH_SECRET` | **Still required for cross-network calls.** Without a TURN relay, calls between peers behind symmetric/CGNAT still fail — unchanged by this work, and still outstanding. |
| `ANALYTICS_RESOLVE_LOCATION` | Geo lookups on/off |
| `ANALYTICS_IP_RETENTION_DAYS` | IP retention |

---

## 19. Remaining limitations

1. **TURN relay still unprovisioned.** Cross-network calls fail without it.
   Pre-existing; hold and forwarding inherit it, since both run over the same
   peer connection.
2. **Hold audio must be uploaded.** Nothing is bundled; without an upload,
   callers hear a synthesised tone.
3. **Andhar Bahar nav label is the Latin name in all 24 locales.** Some game
   names are transliterated (`teenPatti` is `तीन पत्ती` in Hindi). Inventing 24
   transliterations without a speaker to check them risked shipping a wrong one;
   zh-CN already keeps "Teen Patti" in Latin. Commission proper translations
   whenever you like — the key is in place.
4. **`/teen-patti` has no SEO entry.** Pre-existing gap: it is absent from
   `STATIC_ROUTES` and `ROUTE_SEO`. `/andhar-bahar` was added to both. Left
   alone as an unrequested change to an existing page.
5. *(Resolved — see §22.)* `Testimonials.jsx` has been cleaned.
6. **Per-game attribution is captured at the offline-deposit form.** Entries
   recorded without a game are attributed to none — honest, and priced by
   game-agnostic rules exactly as before. Historical commission carries no game
   and is reported under "Not attributed" rather than backfilled.
7. **Voice-call concurrency tests need MySQL** to run locally.
8. **No frontend test runner exists in this repo** (`npm run check` is a static
   identifier/TDZ guard, not a test suite). Bug 23 — a frontend fetch that
   silently dropped the auth header — is therefore guarded by the documented
   rule on `apiGetMaybeAuthed` and by browser verification, not by an automated
   test. Worth a runner if this recurs.

---

## 20. Deploying

```bash
python manage.py migrate            # 0085–0091
python manage.py createcachetable   # if not already present
```

The `.ebextensions/02_cron.config` job (`sweep_expired_calls`, every minute)
is what ends holds nobody came back from — **a hold has no lazy read path, so
without it a customer whose agent's tab crashed waits on hold indefinitely.**

> **Committing the frontend bundle:** `jackpotsworld_frontend_dist` is tracked.
> The rebuild deletes old hashed assets and writes new untracked ones, so stage
> with **`git add -A`** — `git commit -am` stages only the deletions plus an
> `index.html` pointing at files the commit does not contain, and production
> serves a white screen.

---

## 22. Testimonials

`Testimonials.jsx` carried the same defect as the affiliate strip, twice over.

**Correction to an earlier statement of mine:** I said this was "on the landing
page". It is not. Commit `fccf4a6` (28 Aug, *"drop two landing sections"*)
unmounted it and left the file behind, and nothing imports it — it is absent
from the built bundle. **The fabricated cards were never rendering on the live
site.** The cleanup is still worth having, because the file is a remount away
from being live and the model, Back Office tab and API endpoint behind it are
all still maintained.

### Removed
1. **Two infinite-scroll "winner" strips.** Sixty cards from `makeScrollCard()`,
   every field `Math.random()`: name, city, flag, game, destination, and a
   winnings figure between $500 and $28,000 — each wearing a `randomuser.me`
   stock portrait of a real-looking face, under "🏆 Winner Stories". Rendered
   `[...cards, ...cards, ...cards]`, so each fabricated person appeared **three
   times at once**.
2. **Six hardcoded fallback testimonials** — the exact rows migration 0080
   deleted from the database as fabricated social proof ("Rajesh K. won
   $10,200 in Macau"). **This is the real bug:** 0080 removed the data and
   missed the component's copy, and the validation filter (which required
   `won` *and* `dest`) then guaranteed the copy would win — the two real rows
   carry no winnings figure, so they were dropped and the fabrications took
   their place.
3. **Headings asserting gambling outcomes** — "REAL WINNERS, REAL STOREIS"
   (also a typo) and "Thousands have won. You could be next."

### Kept and corrected
The carousel is Back Office managed and stays. A testimonial now requires a
**name and text** — not a winnings figure. `amount_won` remains a field and
still renders if an admin fills it in; it is simply no longer *required*, which
is what was forcing invented ones into the gap. The destination badge stays
(where a member went is a fact this business arranged); the winnings half is
gone. Headings now describe the trip and the concierge service. Avatars fall
back to initials — no stock portrait is ever substituted for a real person.

**With no testimonials, the section renders nothing.** An empty section is the
correct look for a platform that has not collected any yet.

### The guard that would have caught it
`tests_landing_wording` previously stated it checked "what the API will actually
serve, **not what a constant in a component says**" — precisely the gap. It now
reads the component sources too, with comments stripped so documenting a removal
does not trip it. **Proven, not assumed:** injecting `Rajesh K. / $10,200` back
into the file makes it fail; removing it makes it pass.

### Still outstanding — your call
Two rows named **"Claude QA Valid"** and **"Claude QA Valid Small"** sit in the
production `Testimonial` table: leftover QA artifacts from an earlier session,
with no city and no text. They are harmless (the filter drops them, so they
never render) but they are test data in a production database. I have not
deleted them — removing rows from your database is not mine to do unprompted.
Say the word and they are gone.
