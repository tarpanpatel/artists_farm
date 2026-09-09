# Channex Channel Manager — Everything We Know

**Read this file before touching anything Channex-related.** It is the single source of
truth for how the integration is built, what has already been proven true (so it isn't
re-derived), and which mistakes have already cost real money or real OTA data.

Last verified against the live staging account: **6 September 2026.**

Companion docs, each with a narrower job:

| File | When to read it |
|---|---|
| `CHANNEX.md` (this file) | Always, first. Architecture, verified facts, safety rules. |
| `CHANNEX_IMPLEMENTATION.md` | The original design brief — why the outbox/adapter shape was chosen. |
| `CHANNEX_AUDIT_REPORT.md` | Certification-readiness audit and the 8 certification scenarios. |
| `CHANNEX_GO_LIVE_CHECKLIST.md` | Only when moving from the staging Channex account to production. |
| `.claude/skills/channex-pms-integration/references/api.md` | Raw endpoint/payload shapes. |
| https://docs.channex.io | Append `.md` to any page URL for clean markdown. `sitemap.md` lists every page. |

---

## 1. What this integration is

Ground Code pushes availability, rates and restrictions (ARI) to Channex; Channex fans
them out to Airbnb / Booking.com / etc.; OTA bookings come back as *revisions*.

```
     BOOKING OR RATE CHANGE                         OTA BOOKING ARRIVES
              |                                              |
   enqueueOutboxItem() inside the                    Channex webhook
   caller's own DB transaction                    (carries revision_id)
              |                                              |
        channex_outbox                            webhook_receiver.php
              |                                    handleWebhook()
   triggerEventDrivenChannexDrain()                        |
   -> worker_runner.php (loopback, 6s debounce)     GET revision -> apply
              |                                     -> commit -> THEN ack
     AriDrainWorker::processBatch()                         |
     coalesce + run-length compress                  drainFeed() cron
              |                                    every 5 min = backstop
        ChannexAdapter
              |
        ChannexClient  --->  Channex REST v1
```

Two rules that shape everything else:

1. **The outbox row is written inside the same transaction as the business change.** A
   booking that commits always has its ARI event queued. Nothing is pushed inline from a
   request handler.
2. **The revision feed is a 30-minute window, not a durable queue.** An unacked revision
   is re-served for ~30 minutes and then dropped for good. Ack promptly, drain until
   empty, alert on failure.

---

## 2. File map

### Backend — `php/channex/`

| File | Lines | Role |
|---|---|---|
| `ChannelManagerAdapter.php` | 39 | Vendor-agnostic interface (`syncContent`, `pushAvailability`, `pushRestrictions`, `acknowledgeRevision`). The portability seam — keep Channex specifics out of it. |
| `ChannexClient.php` | 184 | HTTP: `user-api-key` header, `{"data": ...}` unwrapping, backoff on 429/5xx, proactive rate ceiling. |
| `ChannexChannelClient.php` | 227 | The **Channel API** (connecting OTAs), layered on `ChannexClient`. All Airbnb-specific actions live here. |
| `ChannexAdapter.php` | 264 | Payload formatting, minor-unit conversion, mapping lookup, webhook registration. |
| `outbox.php` | 303 | `enqueueOutboxItem()`, `getChannexPushRoomIds()`, field diffing, drain trigger, rate-push alerts. |
| `ari_drain_worker.php` | 669 | `processBatch()`, availability/restriction computation, range compression. The engine. |
| `push_preflight.php` | 180 | Push Confirmation Gate (§5.4b): `buildChannexPushPreflight()` (read-only — what a push would send) and `requireChannexPushConfirmation()` (the server-side gate). |
| `content_sync.php` | 346 | Idempotently provisions Channex property → room types → rate plans; persists UUIDs. |
| `channel_connections.php` | 154 | Per-OTA connection state and room-code mappings (distinct from content sync). |
| `webhook_receiver.php` | 769 | Inbound bookings: `handleWebhook()`, `drainFeed()`, row locks, idempotency. |
| `worker_runner.php` | 118 | Standalone background runner; returns 200 immediately, then works. |

### Crons — `php/cron/`

| File | Cadence | Purpose |
|---|---|---|
| `channex_feed_drain.php` | every 5 min | Backstop for missed webhooks. Two cycles fit inside the 30-min expiry. |
| `channex_outbox_health.php` | hourly | Watches the **plumbing**: stuck, abandoned, or failing outbox rows. |
| `channex_sync_audit.php` | daily 06:20 | Watches the **data**: does Channex actually match us? |

Those last two exist because **every Channex bug found so far has been silent.**

### Frontend — `src/components/`

`ChannelConnectionsPage.tsx` (list/status) · `ChannelConnectWizard.tsx` (connect flow, Go
Live) · `PushConfirmationGate.tsx` (§5.4b — the gate both push paths open) ·
`ChannelManager.tsx` (manual push, mapping) · `AirbnbConfigImportDrawer.tsx`
(import proposals) · `OnboardingChannelStep.tsx` (connect during setup) ·
`icons/AirbnbIcon.tsx`, `icons/BookingComIcon.tsx`.

### Database

| Table | Holds |
|---|---|
| `channex_mappings` | Content sync: local property/room → Channex property/room-type/rate-plan UUIDs, plus **`sell_mode`** (the remote plan's real mode). |
| `channex_channel_connections` | One row per OTA connection: channel UUID, group id, status, settings (incl. OAuth tokens). |
| `channex_channel_room_mappings` | Local room ↔ external room/rate codes, per connection. |
| `channex_outbox` | Pending ARI events: kind, date range, payload, status, attempts, `task_id`. |
| `channex_booking_revisions` | Inbound revisions with ack status — idempotency and audit. |
| `channex_rate_push_alerts` | Every completed rate push, surfaced to the owner in-app. |

### Router actions

~35 actions in `php/api/router.php`, all prefixed `channex_`. The connection lifecycle:
`channex_channels_available` → `channex_channel_start_airbnb` /
`channex_channel_airbnb_connection_link` → `channex_channel_mapping_details` →
`channex_channel_save_mapping` → `channex_channel_check_readiness` →
`channex_channel_activate`. Plus `channex_push_preflight` (read-only, feeds the gate),
`channex_push_ari`, `channex_outbox_drain`,
`channex_retry_outbox`, `channex_webhook`, `channex_drain_feed`,
`channex_import_airbnb_room_config`, `channex_airbnb_listing_locations` (read-only, the picker's
background address lookup).

---

## 3. Configuration

Credentials live in **`php/config/channex_config.json`** — **gitignored, never commit it,
never paste a key into any tracked file.**

```json
{ "api_key": "...", "base_url": "https://staging.channex.io/api/v1" }
```

Default when the file is missing: staging. Production is `https://app.channex.io/api/v1`
and is a **separate account with separate UUIDs** — every mapping must be reset when
switching. See `CHANNEX_GO_LIVE_CHECKLIST.md`; do not improvise that migration.

---

## 4. Verified facts — do not re-derive these

**Transport**

- Auth is the `user-api-key` header. Responses wrap in `{"data": ...}`; errors are
  `{"errors": {code, title, details}}`.
- Rate limit is **20 ARI calls/minute** (certification test 12). `ChannexClient` enforces a
  proactive per-process ceiling *before* sending, not just backoff after a 429 — a single
  `processBatch()` drain is the real burst risk, not scattered traffic.
- **Money is in MINOR units** (paise/cents) at the API boundary and nowhere else. Never let
  two money conventions travel through the codebase.
- **Never send past dates.** Channex rejects them.
- Restrictions are **partial updates** — send only the fields that changed
  (`computeTouchedFields()`); a price edit must not clobber min-stay or closures.
- Range compression compares the **whole value object**, not just the rate.
- `GET /restrictions` requires `filter[restrictions]=rate` (or similar) — 400 without it.

**Channel API (connecting OTAs)**

- `room_type_code` / `rate_plan_code` are **integers**. Sending strings makes Channex file
  the mapping under "removed rates" and the OTA shows "Not mapped".
- `group_id` is required on channel create and must be one the account can access.
- `DELETE /channels/:id` returns 422 while the channel is active — deactivate first.
- Channels are created **inactive**; `POST /channels/:id/activate` goes live and triggers a
  full ARI synchronisation.

**Per-person pricing**

- Requires `sell_mode: "per_person"` on the rate plan with one `options` entry per
  occupancy. Restrictions then take a **`rates` ARRAY** of `{occupancy, rate}` instead of a
  scalar `rate`.
- **Emission is gated on `channex_mappings.sell_mode`** — the recorded *remote* mode — never
  on whether the property has an `extra_guest_charge`. Deriving it locally sends a
  per-occupancy array to a plan that is still `per_room`, and **every rate push for that
  property fails** until the plan is switched. Patel Colony's 18 plans are all `per_room`
  today, so the per-person path is built but dormant.

---

## 5. Hard safety rules

These are not style preferences. Each one is here because it already went wrong.

### 5.1 Never hardcode `room_id = null` for a property-wide push

`channex_mappings` is per-room once a property has real `MULTI_KEY_ROOM` children, so
`getMapping(propertyId, null)` finds nothing, the push returns `success: false`, and
`processBatch()` marks the rows failed **silently** while activation still reports success.
This shipped once: Patel Colony went live on Airbnb and Booking.com with **AVL=0 on every
room, every date.** Always resolve rooms through `getChannexPushRoomIds($pdo, $propertyId)`.

### 5.2 Ask before ANY wide availability or rate push — every single time

Ground Code knows about its own bookings and its own blocks. It has **zero visibility into
a date the host blocked directly on the OTA's own calendar.** A wide "open everything" push
silently reopens those. This happened: a corrective push reopened manually-blocked Airbnb
dates, and was only recoverable because the host happened to have left notes on them.

Before any broad push, ask whether manual blocks exist on the OTA, get the dates, and record
them in Ground Code first so they round-trip correctly.

### 5.3 A corrective push run by an agent bypasses every in-app guard

`ChannelConnectWizard.tsx`'s consent checkboxes and `ChannelManager.tsx`'s `confirm()` dialog
only cover actions taken **through the app**. A one-off server-side script reaches the OTA
with no prompt at all — which is how a rate push once reached Airbnb with the owner finding
out only by noticing it themselves.

- **The agent must ask the user before running any corrective/fix push. Reporting it
  afterwards is not the same thing and is not sufficient.**
- As a backstop that doesn't depend on anyone remembering: `recordRatePushAlert()` fires from
  the single chokepoint every push passes through (`processBatch()`, after a `kind='rates'`
  group succeeds), and `Header.tsx` surfaces it as a real modal on the owner's next visit.

### 5.4 Consent gates are enforced on both sides

Any code path that can push a wide rate or availability update needs a consent gate enforced
**server-side**, not only in the UI — a checkbox once existed on `channex_channel_activate`
whose value was never sent, so the gate looked real and enforced nothing.

**The current mechanism is the typed confirmation in §5.4b.** From 3–9 Sep 2026 it was two
booleans (`confirmed_existing_bookings`, `confirmed_rate_fallback`); those are gone, and
sending them now does nothing. The both-sides rule is what carries forward, not the field
names.

**The rate-fallback risk it guards:** `computeCompressedRestrictions()` falls back to the
property's flat `default_tariff` for any date with no `room_rate_rules` row. A property with
no rates entered yet pushes that flat number over the entire range, overwriting pricing
already set on the OTA.

### 5.4a An import must never push, and must never activate

Adding a property from an OTA reads. It does not write. **`autoProvisionPropertyFromAirbnb()`
must never push ARI and must never call `activateChannel()`** — it imports content, maps rooms,
pulls existing reservations, parks the connection at `ready_to_activate`, and stops.

Activating *is* a write. Channex documents it as "the connection starts exchanging data with the
channel: a full synchronisation pushes availability, rates and restrictions", so there is no
"activate but push nothing":

| | consequence |
|---|---|
| activate + push our view | reopens dates blocked directly on Airbnb (§5.2) and flattens per-date pricing we cannot read back (§6) |
| activate + push nothing | Channex syncs its empty state — AVL=0 on every room, every date (the Patel Colony incident) |

Both are outward-facing damage from an action the owner only asked to *import*. Going live is a
separate, deliberate step through `channex_channel_activate`, which is where the readiness check,
the two consent gates and the pre-activation push belong.

The import path therefore takes **no consent gates** — there is nothing outward-facing to consent
to, and asking anyway is theatre that trains owners to tick past real warnings. Between 8 and 9
Sep 2026 it did activate, and required both gates for that reason.

Ongoing operational pushes (a booking, a rate edit) still enqueue while the channel is inactive.
That is fine and in fact desirable: Channex sends nothing to an inactive channel, so its inventory
is simply warm and correct by the time the owner goes live.

### 5.4a-ii One property = one location, and the import must say so

Added 9 Sep 2026. Listings selected in a single import become rooms of a **single** property, and
staff, expenses, kitchen and menu all attach to the **parent** — so one property per *location* is
what lets an owner run a separate team and separate books per site. Owners do not work this out on
their own, and the wrong shape is expensive to unwind once bookings and ledger rows have
accumulated against it.

- **`SelfOnboardingWizard.tsx` step 3** shows the guidance above the listing checkboxes (before the
  decision, not after), plus a live prompt on ANY multi-listing selection — it names the cities when
  they genuinely differ, and otherwise asks outright, because this screen still uses the cheap
  listings call and `city` cannot separate two buildings in one city. **It has its own older copy of
  the listing UI** rather than the shared `AirbnbListingPicker.tsx`, which is why it does not get
  that picker's coordinate-based grouping; folding it onto the picker is tracked in ROADMAP.md.
- **`AirbnbListingPicker.tsx`** (creation + setup wizards) groups by the listings' REAL addresses,
  fetched in the background via `channex_airbnb_listing_locations` and clustered within 250m — see
  §6, "Where a listing actually is". Its default selection pre-ticks the largest single place, so
  the owner opts INTO mixing locations rather than out of it. Verified live 9 Sep 2026 on this
  account: 10 listings resolve to 3 places (7 / 2 / 1), where city alone had said "Jaipur" for 9.
- **`city` is a weak proxy — never block or auto-split on it.** Two buildings in the same city are
  still two locations for staffing purposes; this account's own Patel Colony and Winter are both in
  Jaipur. The banner is the real safeguard; the city check only catches the worst case.
- **`OnboardingChannelStep.tsx`'s "1-Click Import" has no listing picker at all** — it posts no
  `selected_listing_ids`, so `autoProvisionPropertyFromAirbnb()` imports **every** listing on the
  account into that one property. It now says so before it is pressed. Adding a real picker there
  is still outstanding.

### 5.4a-iii One listing belongs to exactly one property

Added 9 Sep 2026. A listing already imported into one property cannot be imported into another.
Two Ground Code properties mapped to the same Airbnb listing both believe they own that calendar
and both push availability and rates to it — the losing push silently reopens or reprices nights
the other just set. That is a double-booking generator.

- `getClaimedChannexListings($pdo, $tenantId, $excludePropertyId, $channelCode)`
  (`channel_connections.php`) resolves who owns what. `channex_channel_mapping_details` returns it
  as `claimed_listings` so the picker greys those rows out and **names the owning property** —
  "already imported" with no owner leaves the operator hunting.
- **`autoProvisionPropertyFromAirbnb()` refuses them server-side with a 409.** The greying is the
  courtesy; this is the guarantee (§5.4 — a client-only gate on this integration failed once).
- **MUST be filtered by `channel_code`.** `external_room_code` is namespaced per channel: an
  Airbnb listing id on an Airbnb connection, a Booking.com room code on a Booking.com one,
  unrelated integer spaces. An unfiltered query returned **8 claims for 7 rooms** on this account,
  counting Patel Colony's Booking.com codes as Airbnb listing ids. Verified after the fix: 7
  claims, and Winter Garden / Winter Garden Studio / The Artists' Farm correctly stay selectable.
- **`$excludePropertyId` is required** so a property re-running its own import is not blocked by
  itself. Verified: importing into Patel Colony blocks 0 of its own listings.

### 5.4b The Push Confirmation Gate

Added 9 Sep 2026. Every wide push — Go Live (`channex_channel_activate`) and the manual
"Push Availability, Rates & Restrictions" (`channex_push_ari`) — goes through
`PushConfirmationGate.tsx`, backed by `php/channex/push_preflight.php`.

**It replaced the two consent checkboxes from 3 Sep; it is not layered on top of them.** Those
named the right risks but as claims to tick. Three confirmations in a row teach people to click
through all three, including the one that matters.

| Step | Kind | What it does |
|---|---|---|
| 1. Rates | **verified by us** | Lists the nights with no explicit `room_rate_rules` price and the exact `default_tariff` that would be sent for them. A flat-rate property correctly reports its whole range. |
| 2. Openings | **attested, but concrete** | Lists every date about to be marked bookable. We cannot see the host's manual OTA blocks (§5.2), so only they can catch this — but scanning a date list works where agreeing to a paragraph does not. |
| 3. Typed | **the gate** | The property's own NAME, not a fixed word. A fixed word becomes muscle memory, and pushing to the wrong property is as damaging as pushing the wrong values. Case/space/apostrophe tolerant on both sides. |

Non-negotiables:

- **The preflight reads through `computeRateCoverage()` / `computeCompressedAvailability()` —
  the same methods the push itself uses.** A preview computed a second way will eventually
  disagree with the push, which is worse than showing nothing. `buildRulesByDate()` was
  extracted from `computeCompressedRestrictions()` for exactly this.
- **Enforced server-side** via `requireChannexPushConfirmation()`, per §5.4. The preflight
  itself is read-only and makes no network call.
- **The confirm button is greyed but never natively `disabled` while merely unconfirmed** — a
  disabled button swallows the click and explains nothing. `busy` is a real disable.
- **A push cannot be confirmed before the preflight loads.** Typing a name to approve contents
  you were never shown is the checkbox problem again.
- **It does not cover a push run from a server-side script** (§5.3). Ask the user first, every
  time.

Incremental pushes from ordinary operations (a booking, a rate edit) are deliberately NOT
gated — that is the integration doing its job.

### 5.5 "Remove" on a connection is real and irreversible

It deletes the actual Channex channel object and every room mapping on Channex's side. A
working, fully-mapped Airbnb connection was deleted this way and had to be re-authorised and
re-mapped from scratch. Don't click through it while debugging.

### 5.6 An import may fill in blanks, never overwrite identity

`name` and `slug` are how staff, guests, URLs and every OTA mapping refer to a property. An
Airbnb import once renamed a MULTI_KEY parent to a single listing's title
("Guest suite in Jaipur"), and it reached the **public booking engine**, visible to guests.
`applyToProperty()` now refuses the `name` write server-side. See CLAUDE.md's own hard rule.

### 5.7 Verify on Channex, not on our own success toast

After any activate or push, check Channex's Inventory tab or do a real `GET availability` /
`GET tasks/:id`. A push can fail server-side without the caller surfacing it — that is
exactly how 5.1 stayed invisible.

### 5.8 Production is off limits

Never deploy or write to production (`ground-code.com`). CLAUDE.md's hard rule governs; only
the user's own manual edit to that file can lift it. Staging is fine with explicit approval.

---

## 6. Airbnb specifics

Verified live against the connected account on **6 September 2026**.

### What is readable

| Source | Data |
|---|---|
| `GET /channels/:id/action/listings` | One call, whole account. **Exactly eight fields, verified live 9 Sep 2026** — `id`, `type`, `title`, `city`, `quality_status`, `country_code`, `occupancies` (valid guest counts, max = capacity), `synchronization_category`. **No street address and no coordinates**: `city` is the ONLY location it carries, so it cannot tell two buildings in one city apart (see the location note below). |
| `GET /channels/:id/action/listing_details?listing_id=X` | Per listing. Real location — `street`, `apt`, `city`, `state`, `zipcode`, `lat`, `lng`, `country_code` (verified live 9 Sep 2026) — plus `person_capacity`, `rooms[]` with real bed configuration, `bedrooms`/`beds`/`bathrooms`, ~30 `amenities`, `images[]` (34 on one listing, 4 URL sizes each), `descriptions` (10 fields), `booking_settings`, `pricing_settings`, `availability_rules`, wifi credentials, `house_manual`, `directions`, cancellation policy, guest controls, superhost/rating data. |
| `GET /channels/:id` | **Already carries `rate_plans[].settings` for every listing** — `availability_rule`, `pricing_setting`, `promotions[]`, `published`. No per-listing call needed for those. |
| `GET /channels/:id/mappings/:id/pricing_settings` | Currency, `default_daily_price`, `weekend_price`, `guests_included`, `price_per_extra_person`, `standard_fees[]`, `pass_through_taxes`, `default_pricing_rules`, `min_stay_type`. |
| `GET /channels/:id/mappings/:id/availability_settings` | `booking_lead_time`, `default_min_nights`/`default_max_nights`, `day_of_week_min_nights[7]`, `day_of_week_check_in[7]`, `day_of_week_check_out[7]`, `turnover_days`, `max_days_notice`, `seasonal_min_nights`. |
| `POST /channels/:id/execute/load_future_reservations` | Pulls reservations that predate the connection. **Nothing does this automatically** — the revisions feed holds only *unacknowledged* events, so a listing's existing bookings never appear on their own. |

The `:id` for the settings endpoints is the **rate plan id** from
`channel.attributes.rate_plans[].id`. `GET /channels/:id/mappings` itself returns 404.

**Where a listing actually is — verified live 9 Sep 2026, all 10 listings on this account.**
Only `listing_details` knows. Measured against real data:

| Place | Listings | Coordinates | Zip | `city` |
|---|---|---|---|---|
| Patel Colony | 7 | 26.9152, 75.7997 | 302001 | Jaipur |
| Winter Garden | 2 | 26.8931, 75.7777 | 302019 | Jaipur |
| The Artists' Farm | 1 | 26.8366, 75.6329 | 302026 | Bhankrota |

Three genuinely separate properties, 2.4km and 20km apart — and `city` says "Jaipur" for two of
them. That is why the import picker's old city-based grouping never warned when Winter Garden was
selected alongside Patel Colony's listings.

- **Cluster by coordinates, never by street text.** Those 7 co-located listings report FOUR
  different street strings (`3, Patel Colony` / `22, Patel Colony` / `Patel Colony Road` /
  `Sardar Patel Marg`) while sitting within ~30m of each other. Street is fine as a *label*, useless
  as a *key*. `AirbnbListingPicker.tsx` clusters within 250m, falling back to zipcode then city for
  any listing whose details did not resolve — never merging an unmeasured listing into a cluster.
- **It costs one call per listing**, so it is a separate read-only action
  (`channex_airbnb_listing_locations`) that the picker fetches in the BACKGROUND and re-groups when
  it lands — not extra fields on `channex_channel_mapping_details`, which the picker blocks on.
- **`getMultipleListingDetails()` can silently drop listings under load.** `getConcurrent()` sets
  `CURLOPT_TIMEOUT = 12`; a cold run took 12,018ms and returned 8 of 10, the immediate retry took
  2,549ms and returned all 10. A dropped listing is omitted, never guessed at — but
  `proposeAirbnbRoomConfig()` shares this call, so a slow Airbnb means a room can import without its
  pricing/capacity data. Check counts, do not assume the batch was complete.

### What is writable

`PUT .../pricing_settings`, `PUT .../availability_settings`, `PUT .../booking_settings`
(write-only — its GET returns 404), plus `publish` / `unpublish`. So occupancy pricing,
stay rules and check-in times **can** be pushed back to Airbnb.

**Not writable:** capacity, photos, descriptions, bed layout, amenities, title. Those are
read-only from Channex.

### Airbnb quirks that have already caused bugs

- **Airbnb has no `mapping_details` endpoint at all.** Listings are discovered via
  `action/listings`. Don't reach for the Booking.com flow.
- **Connect via `POST /meta/airbnb/connection_link`** — a real, 2-hour, Channex-tracked
  link. Never hand-build an Airbnb OAuth URL.
- **Pricing fields are nested under `pricing_settings`, not at the top level.** The importer
  originally read them off the listing root, matched nothing, and silently proposed only
  check-in/out times. Found only by *running* the deployed function, not by reading it.
- **`cleaning_fee` and `security_deposit` can be `null` while the real fee sits in
  `standard_fees[]`** with `fee_type: "PASS_THROUGH_CLEANING_FEE"`. We currently read only
  the flat field, so a fee set that way is missed.
- **Times are hours, not times.** `check_in_time_start` is `"13"` (string),
  `check_out_time` is `11` (int), and `check_in_time_end` can be the literal `"FLEXIBLE"`.
  `airbnbNormalizeHour()` returns null for non-numeric — do not coerce to `00:00`.
- **Airbnb's own data is not authoritative.** Measured against this account, 5 of 10
  capacities disagreed with the owner, in both directions. The importer **proposes**; the
  owner confirms. Capacity is deliberately reported as context and never written.
- **Airbnb's per-date calendar prices CANNOT be read.** Only the listing's
  `default_daily_price`, `weekend_price`, extra-person charge and pricing rules are
  available; `pricing_settings` are "stored on the mapping — nothing is requested from
  Airbnb." So a host who has tuned individual dates or seasons on the Airbnb calendar has
  pricing we cannot see, and our first rate push **replaces it**. This is the pricing twin
  of the manually-blocked-dates problem in §5.2, and it is why applying an imported price
  never pushes on its own.

### Sync category — verified live 9 Sep 2026

Airbnb has exactly **two** sync settings for API-connected listings, and **neither lets the
software manage availability while the host keeps nightly pricing**:

| Setting | Software controls | Host keeps on Airbnb |
|---|---|---|
| `sync_all` ("Everything") | listing details, photos, pricing, calendar | nothing — those fields grey out |
| Pricing & Availability ("Limited") | pricing and availability | content, booking settings, discounts, fees, taxes |

So there is no platform-level escape from the rate-overwrite risk in §5.4 — it has to be
handled by process, which is what §5.4b does.

`synchronization_category` is readable per listing on `action/listings`. Measured on the
connected account: **7 of 10 listings are `sync_all`**; three carry no category at all
(unmapped on this channel), including **The Artists' Farm** and both Winter Garden listings.

**Open question this raises:** under `sync_all`, Airbnb greys out photos and listing content
and expects the software to supply them — but we deliberately never import or manage photos
(§8.6). Whether that leaves a host unable to edit their own listing content on Airbnb without
gaining that ability here is **not yet established**. Worth settling before more listings go
live. Channex's docs do not document choosing the category, and `ChannexChannelClient` has no
method for it.

### Deliberately out of scope

- **Guest messaging and reviews.** Channex supports both for Airbnb (`GET /reviews`,
  `GET /message_threads`, replies, an Airbnb-only guest-review submission), and our Airbnb
  OAuth scope already grants `messages_read messages_write` — but both return **403** on our
  key because they are a **paid Channex feature**. The owner's decision (6 Sep 2026): the app
  does not need them. Don't build against them, and don't file the 403 as a bug.
- **Reputation data** — superhost flag, `is_guest_favorite`, quality percentage, and
  `reservation_issues` (low review ratings, complaint tags). Readable, but nothing in Ground
  Code has any use for it. Decided 6 Sep 2026: never imported.

---

## 6a. The pricing model — Ground Code is the source of truth

Decided 6 Sep 2026. The intended lifecycle:

```
  first-time setup          ongoing
  ----------------          -------
  Airbnb listing            owner edits price in Ground Code
        |                             |
   import (owner ticks)          outbox -> Channex
        |                             |
   default_tariff  ------------>  every connected OTA
```

- **Import seeds the base price once**, at setup: `pricing_settings.default_daily_price`
  → `properties.default_tariff`, per room, proposed and ticked like every other field.
  After that, Ground Code is where prices are edited and Channex fans them out.
- **`default_tariff` is a safety net, not a price that gets pushed.**
  `computeCompressedRestrictions()` reads `room_rate_rules` first and only falls back to
  `default_tariff` for a date with no rule (§5.4). Patel Colony has 366 daily rules per room
  covering a full year, so its fallback is never reached inside the pushed range — verified
  6 Sep 2026 against a live `GET /restrictions`, which returned the calendar's own values
  (₹1,776–₹1,973) and not the stored ₹2,400. The import matters most for a **newly connected
  property with no rate calendar yet**, which is exactly the onboarding case it was built for.
- **Do not push after an import, and do not prompt for it.** The value came from the channel,
  so sending it back is a no-op there; and on a property with a full rate calendar it is
  never sent at all. A push prompt at that moment invites a wide outward write for no gain.
- **Airbnb's `default_daily_price` is the LISTING SETTING, not the live calendar price.**
  Once Channex has pushed per-date rates, what a guest sees is the pushed calendar, while
  `default_daily_price` still reports whatever the host originally set. On an
  already-connected property the imported number can therefore be stale — another reason it
  is a proposal, and another reason first-time import is its real use case.
- **`room_rate_rules` is never written by an import.** The rate calendar stays hand-tuned;
  only the flat base rate is seeded.
- **`weekend_price` is not imported.** It would need a `days_of_week` rule plus a date span
  to apply it over, and there is no sensible span to invent.
- **Applying a price does not push it.** `applyAirbnbRoomConfig()` returns `priced_rooms`
  and the drawer then asks the owner in so many words, spelling out that the push replaces
  per-date pricing on every connected channel. Reuses `channex_push_ari`, so there is still
  exactly one push path.
- **An imported Airbnb price may carry that channel's commission.** The host often inflates
  an OTA price to absorb the cut, so it may not be what they want quoted to a direct guest
  on the booking engine. That is why it stays a per-room tick-box, never an auto-apply.

## 7. Debugging playbook

**Assume silence, not errors.** Start here:

1. `channex_outbox` — rows with `status='failed'`, high `attempts`, or a `last_error`.
2. `channex_booking_revisions` — `ack_status`, `ack_error`, anything unacked and older than
   30 minutes (that revision is already lost from the feed; recover via a time-scoped
   `GET /bookings?filter[inserted_at][gte]=<outage_start>`, not a periodic sweep).
3. `php/cron/channex_outbox_health.php` and `channex_sync_audit.php` output.
4. Telescope (`/php/errors/`) for the PHP/SQL side.
5. A live readback from Channex — never trust a 200.

**Probing safely:** read-only scripts on staging are fine and are the fastest way to settle a
question. Use a throwaway rate plan/channel for shape-probing writes so a live connected
channel isn't disturbed. Never probe against production.

---

## 8. Open items

- `content_sync.php` writes rate-plan `options[].rate` as a major-unit string (`"2400.00"`)
  while the API reference says minor units on write. Flagged, unresolved.
- `booking_settings` has no GET — current values can only be read from
  `listing_details.booking_settings`.
- **Import roadmap** (agreed 6 Sep 2026, in order). The test for each field: would the owner
  otherwise type it, does something in Ground Code actually read it, and is Airbnb
  authoritative for it?
  1. ~~Wifi, house manual, arrival directions~~ — **done 6 Sep 2026.** `wifi_network` /
     `wifi_password` / `house_manual` columns, `directions` → the existing `instructions`
     field, all surfaced on the WhatsApp voucher via optional tokens.
  2. ~~Descriptions~~ — **done 6 Sep 2026.** `description` + `house_rules` columns, rendered
     on the public booking page under the room name.
  3. ~~Amenities and bed configuration~~ — **done 6 Sep 2026.** `amenities` and
     `bed_configuration` as JSON TEXT, plus `bedrooms` / `beds_count` / `bathrooms`. Shown
     as a facts line ("2 guests · 1 bedroom · 1 Double Bed · 1.5 baths") and amenity chips.
  4. **Stay rules** — `default_min_nights` / `default_max_nights` are now imported, stored and
     editable, but **deliberately NOT wired into the ARI push**. Feeding them into
     `computeCompressedRestrictions()` as a fallback (the way `default_tariff` already works)
     would change what goes out to every connected OTA, which needs its own sign-off under
     §5.2/5.3. Still outstanding.
  5. ~~The `standard_fees` cleaning-fee gap~~ — **done 6 Sep 2026.** Falls back to a flat
     `PASS_THROUGH_CLEANING_FEE` entry when the flat `cleaning_fee` field is null. Zero-amount
     entries are ignored: that means "no fee configured", and adopting it would propose
     "Cleaning fee: 0" against a stored 0 on every listing.
  6. **Photos — CLOSED 6 Sep 2026. Decision: we do NOT import Airbnb photos. Do not reopen.**
     Raised, chased, and settled the same day. The owner's ruling was final and unambiguous:
     *"no it cant so close this."* No import path is to be built — not download, not hotlink,
     not "just the URLs". Treat `images[]` as read-only reference data at most.

     The reasoning, kept so nobody re-litigates it from scratch: `images[]` carries ~34 per
     listing with four URL sizes, a caption, a category and a `room_id`. Airbnb's API Terms of
     Service (https://www.airbnb.com/help/article/3418) define "Content" in §1.1 as "text,
     photos, audio, video, or other materials or information" — listing photos are squarely
     Content — and §2.2(A) prohibits using the API to "scrape, collect, or use the Scopes or
     any Content" for "retaining static copies or building databases", as well as "copying,
     modifying, or creating derivative works". §2.2(V) separately prohibits anything that
     "rebrands or repackages Content accessed through the API", and on termination all Content
     must be destroyed within 30 days. That reads against downloading and storing them, and
     hotlinking onto a Ground Code-branded booking page is arguably the "repackages Content"
     case, so neither route was clearly safe.

     **The supported way a property gets pictures is the owner uploading their own.** That is
     not a workaround — it is the correct route: the photos are the host's own copyrighted
     work, and what the terms govern is the ROUTE, not the image. The same photo supplied from
     the owner's own files carries no API obligation at all. The importer may still *report*
     what the listing holds ("your Airbnb listing has 34 photos") purely to prompt that upload.

     Not legal advice; this records a product decision the owner has made and closed.

  **Never import:** identity (`name`/`slug`), capacity as a write, reputation, reviews and
  messages, Airbnb pricing rules / weekly-monthly factors / pass-through taxes, promotions.
- **Guest info is per-ROOM, not per-property.** Confirmed live 6 Sep 2026: Patel Colony's
  seven rooms have seven different wifi networks (`Artistic_sthan`, `Artistic_sthan_ground`,
  `Artistic_Sthan_5G`, `Artistic_Sthan_22`, …). Storing any of this on the MULTI_KEY parent
  would put the wrong network on six of seven vouchers.
- Airbnb's `availability_rules` map almost one-to-one onto `room_rate_rules`
  (`min_stay_arrival`, `min_stay_through`, `max_stay`, `closed_to_arrival`,
  `closed_to_departure`, `days_of_week`) — but Airbnb's are property-wide defaults while ours
  are dated ranges, so importing them needs a decision about what span to write.
- Check-in time discrepancy: all 7 Patel Colony rooms store 14:00 against Airbnb's 13:00.
- Some rooms on another Channex property still sit at `occ_adults = 6` with no local capacity.

---

## 9. Working agreement

- **If you don't know how something in Channex works, ask the user directly rather than
  experimenting against a live connection.** This is their real inventory on real OTAs.
- Prefer reading the live API over trusting memory or docs — this file exists because
  several "obvious" assumptions turned out to be wrong when actually run.
- When something here is proven wrong, correct it *in this file* with the date, rather than
  leaving the next session to rediscover it.
