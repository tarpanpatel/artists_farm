# Channel Manager Integration — Implementation Brief

Written 30 Aug 2026 for the agent implementing this. Read it all before writing
code; several decisions here exist because the naive version fails Channex
certification and has to be rewritten.

---

## 0. Read first

- **`CLAUDE.md`** — project rules. Non-negotiable. Especially: never touch
  production; no "what this file does" comments; don't commit or deploy unless
  asked; don't modify `OperationalDashboard.tsx`'s booking-calendar logic.
- **`GEMINI_HANDOFF.md` section 7** — the standing quality bar. Short version:
  **prove it, don't assert it.** If a report says "verified", something was
  executed and its output read.
- **`ROADMAP.md`** — "Shipped 30 Aug 2026" documents the concurrency guards you
  must not bypass.

---

## 1. Why this exists

The app currently distributes to OTAs via **iCal only**:
- Inbound: 15-min cron (`sync_all_icals.php`)
- Outbound: a pull feed (`php/api/ical_export.php`) that Airbnb/Booking.com poll
  on *their* schedule — typically every 2–4 hours, outside our control.

So a direct booking is invisible to other channels for hours, and two OTAs can
sell the same night inside one polling window. **That is unfixable with iCal.**
A push-based channel manager (Channex) closes it.

**Business context**: the owner has 10 whole-property vacation rentals in Jaipur
(9 homestays + 1 farmhouse with a restaurant), all listed individually on
Airbnb. The app is also becoming a multi-tenant SaaS, so this must work
per-tenant, not just for one portfolio.

---

## 2. Verified facts — do not re-derive these

Established against the **live Channex sandbox** on 30 Aug 2026 (not from docs):

| Fact | Evidence |
|---|---|
| Base URL `https://staging.channex.io/api/v1` | 200 responses |
| Auth header is `user-api-key: <key>` | 200 vs 401 |
| `POST /properties` with `property_type: "villa"` | **201**, accepted natively |
| `POST /room_types` with `count_of_rooms: 1` | **201** |
| `room_kind: "whole_property"` | **422 invalid** — no such kind exists |
| `occ_children` and `occ_infants` are **required** | 422 "can't be blank" |
| Rates are in **minor units** (₹2,400 → `240000`) | accepted on rate plan |
| `sell_mode: "per_room"` | accepted |

**Conclusion**: a whole-property unit maps as
`property(villa) → room_type(count_of_rooms: 1, room_kind: "room") → rate_plan`.
There is no dedicated whole-property room kind; this is Channex's intended
shape for vacation rentals, and their certification notes explicitly permit
single-unit systems to "adapt to 1 unit / 1 rate plan and declare the adaptation".

### Channel creation — the API disagrees with the docs

Established 30 Aug 2026 by trial against the live sandbox. Channex's own written
guidance is wrong or incomplete on three points, each of which costs an hour if
you trust the docs:

1. **The field is `channel`, NOT `channel_type`.** Sending `channel_type`
   returns `{"channel":["can't be blank"]}`.
2. **`group_id` is REQUIRED.** Omitting it returns
   `"You not have access to requested group"` — which reads like an account
   permissions failure and will send you to support for nothing. It is not a
   permissions problem. Get the id from `GET /groups`; the property's own
   `relationships.groups` also carries it.
3. **`filter[property_id]=` silently returns an empty array** on `/channels`
   while the channels plainly exist. It does not error — it just lies. List
   unfiltered and match client-side, or you will "confirm" there are no channels
   and delete nothing while three sit there.

Valid `channel` codes, confirmed empirically (casing matters):

| Code | Result |
|---|---|
| `OpenChannel` | created — simulator, needs no OTA credentials |
| `AirBNB` | created (note the capitalisation; `Airbnb` is rejected) |
| `Expedia` | created |
| `BookingCom`, `Agoda` | recognised but HTTP 500 without real credentials |
| `Airbnb`, `Booking`, `Open`, `GMT`, `Simulator`, `TestChannel` | invalid |

A channel also needs `settings.hotel_code` before mapping is accepted, and
mapping goes in `settings.mapping` via `PUT /channels/{id}` — the documented
`POST /channels/{id}/map` endpoint returns 404.

There is a configured sandbox channel already in place:

```
Certification Simulator  (OpenChannel)
  id          3bde9156-1373-438b-ae47-c863d5f219f9
  hotel_code  CERT-TEST-001
  mapping     room_type 4ca732c0-6f4f-457c-9c48-396f3d784590 <-> ota_room_101
              rate_plan 2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8 <-> ota_rate_bar
```

**Known unresolved**: `is_active` will not flip via the API. `PUT` with
`is_active: true` returns HTTP 200 and the flag stays `false` — it is silently
ignored rather than rejected. Activation is presumably a dashboard action or
depends on a verified connection. Do not sink time into this; toggle it in the
UI.

Credentials: `php/config/channex_config.json` (gitignored by the blanket
`*.json` rule). **Never commit it or echo the key.**

A test property exists in the sandbox named **"Winter Garden (CLAUDE TEST)"**.
Remove with `php scratch/channex_model_test.php --cleanup`.

---

## 3. Certification requirements that dictate the design

Channex certifies by **watching a live screenshare** while the operator makes
changes in the real PMS UI. They reject integrations that look scripted.

Hard requirements:

1. **Event-driven push, never polling.** Changes push on save. A cron that scans
   the DB for changes is explicitly disallowed — and the existing iCal sync is
   exactly that pattern, so do not copy it.
2. **Batching / outbox.** Multiple room+rate updates group into batched calls.
   Ceiling: **20 ARI calls/minute**. No per-date or per-rate-plan loops.
3. **Exponential backoff** on HTTP 429 and 5xx.
4. **Booking feed with mandatory ACK** — webhook or
   `/api/v1/booking_revisions`, acknowledged only after the DB commit.

The eight certification scenarios, each triggered from the **PMS UI**, with the
returned Task ID (`data[0].id`) recorded:

| # | Trigger | Required request pattern |
|---|---|---|
| 1 | Push 500 days of inventory + rates + restrictions | **Exactly 2 API calls** (1 availability, 1 rates/restrictions) |
| 2 | Change one rate plan on one date | 1 call to `/restrictions` |
| 3 | Change several rate plans, single date, one save | 1 **batched** call |
| 4 | Change a 10–20 day range across plans | 1 batched call using `date_from`/`date_to` |
| 5 | Set min stay (2/3/5 nights) across plans | 1 batched call, `min_stay_through` or `min_stay_arrival` |
| 6 | Stop Sell / CTA / CTD | 1 batched call, `stop_sell` / `closed_to_arrival` |
| 7 | Receive a booking from a test channel | Ingest + ACK to `/booking_revisions/{id}/ack` |
| 8 | Modify dates/guests, then cancel | Consume revisions, update calendar, ACK |

> **Scenario 1 is the design constraint.** 500 days in *exactly 2 calls* forces
> run-length range compression from day one. Build the per-date version and you
> will rewrite it.

**PCI handling model — DECIDED 30 Aug 2026: masked cards.** Do not revisit or
build card handling.

The app stores no card data and will not start. On the certification form,
declare **masked cards**: the PMS receives only redacted card data from OTA
payloads, never stores or processes a real PAN, and therefore carries no PCI
compliance burden. No gateway, no tokenisation vendor (Tokenex / PCI Booking),
no audit scope.

Two consequences to build around rather than discover later:

- **Never persist a card number**, even if an OTA payload contains one. If a
  booking arrives with an unmasked PAN, drop the field before it reaches the
  database or any log — including Telescope. Treat that as a hard rule, not a
  preference; storing one silently would put the whole account in PCI scope.
- **Booking.com's virtual-card model won't work** for this property. Airbnb is
  unaffected (they collect from the guest and pay out to the owner's bank, so no
  card data ever arrives). Booking.com often expects the property to charge a
  virtual card, which masked cards makes impossible — so that channel must use
  either "payments by Booking.com", or on-arrival collection via the app's
  existing UPI QR flow (`src/utils/upiQrCode.tsx`). This is an operational
  choice for the owner, not something to solve in code.

Note also that Channex charges a flat platform fee with **no per-booking fee and
no commission**, so none of this affects the owner's no-commission model. OTA
commission is charged by the OTA and is identical whether distribution happens
via iCal, a channel manager, or manual entry.

---

## 4. Portability — build the seam deliberately

If Channex certification fails or the commercial terms don't work, roughly
**75–80% of this must survive**. Structure accordingly:

- Put all vendor-specific code behind a **`ChannelManagerAdapter` interface**,
  with `ChannexAdapter` as the first implementation. Swapping to SiteMinder /
  STAAH / AxisRooms should mean a new adapter, not a rewrite.
- **Portable** (keep regardless): the restrictions model, the outbox, range
  compression, backoff, booking ingestion with idempotency.
- **Vendor-specific** (throwaway): API client, UUID mapping, payload shapes,
  webhook parsing.

**Branching**: Phase 0 (restrictions) lands on `multi-tenant` because it is a
product feature worth having either way. Everything else goes on a
`channel-manager` branch, merged only once certified.

---

## 5. Phase 0 — restrictions model (ALREADY DONE, verify before building on it)

Completed 30 Aug 2026 on `multi-tenant`. `room_rate_rules` previously held only
`rate_per_night` + `rule_name`, so **certification scenarios 5 and 6 were
impossible** — the app had no concept of minimum stay or stop-sell.

Added (self-healing, key `schema_room_rate_rule_restrictions`), verified present
in the local DB:

```
min_stay_arrival     int NULL      -- applies only to stays STARTING on the date
min_stay_through     int NULL      -- applies to any stay SPANNING the date
max_stay             int NULL
stop_sell            tinyint NOT NULL DEFAULT 0
closed_to_arrival    tinyint NOT NULL DEFAULT 0
closed_to_departure  tinyint NOT NULL DEFAULT 0
rate_per_night       -- relaxed to NULL
```

Both min-stay variants exist because OTAs distinguish them and channel managers
ask which you support; supporting only one limits distribution.

`rate_per_night` became nullable so a rule can carry **only** restrictions
("3-night minimum over Diwali at the usual price"). `saveRateRule()` now
requires a rate **or** at least one restriction, and rejects
`max_stay < min_stay_arrival`. `getRateRules()` uses `SELECT r.*` so it returns
the new fields with no change.

### Phase 0 remaining work

- **`src/components/RateRuleModal.tsx`** — add the UI controls. This is what the
  certification auditor will watch you use, so it must be a real, usable form,
  not a debug panel. Needs: min-stay (with arrival/through choice), max stay,
  and toggles for stop-sell / CTA / CTD.
- **`availability.php`** (public page) should respect `stop_sell` — a night on
  stop-sell must not show as bookable.
- Consider whether `add_guest` should enforce `min_stay`/`closed_to_arrival` for
  direct bookings. **Ask the user** — enforcing it is defensible, but it changes
  booking behaviour and is not required for certification.

---

## 6. Phase 1 — transactional outbox (the core; build this next)

**The single most important design decision: write the outbox row in the same
DB transaction as the business change.**

`add_guest` is already transactional and holds a room-row lock. A booking insert
and its "availability changed" outbox row must commit atomically or not at all.
Otherwise the failure mode is silent and expensive: the booking saves, the push
fails, Channex still shows the night available, and an OTA sells it.

Suggested shape:

```sql
CREATE TABLE channex_outbox (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  room_id INT NULL,
  kind ENUM('availability','rates') NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  payload JSON NULL,
  status ENUM('pending','sending','done','failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_outbox_claim (status, next_attempt_at),
  INDEX idx_outbox_scope (property_id, room_id, kind, date_from, date_to)
);
```

**Enqueue at every write that changes availability or price** — miss one and
Channex silently drifts out of sync:

| Hook | File | Note |
|---|---|---|
| Booking created | `php/guests/guests.php` `add_guest` | inside the existing transaction |
| Booking edited | `add_guest`'s sibling `update_guest` | **two ranges** — the old dates AND the new ones |
| Checkout / cancel / delete | `guests.php`, `receipts.php` | availability returns |
| Rate rule saved/deleted | `php/rates/rate_rules.php` | rates + restrictions |
| OTA block converted | `ical_sync.php` conversion path | |

**The drain worker** (a real queue worker, not a change-detecting cron — the
distinction matters for certification):
- Claim pending rows (`FOR UPDATE SKIP LOCKED` if available, else a `sending`
  status flip) so two workers can't double-send.
- **Coalesce**: merge overlapping/adjacent ranges for the same room+kind, then
  compress contiguous dates with identical values into `date_from`/`date_to`.
  This is what makes scenario 1 fit in 2 calls.
- Respect 20 calls/min.
- Exponential backoff on 429/5xx via `next_attempt_at`; give up to `failed`
  after N attempts and surface it (Telescope) rather than failing silently.

---

## 7. Phase 2–5 outline

**Phase 2 — adapter + client** (`php/channex/`): `ChannelManagerAdapter`
interface; `ChannexClient` handling auth, JSON, retry/backoff. Reuse the curl
style already in `php/telegram/sender.php`.

**Phase 3 — content sync**: idempotently provision property → room type → rate
plan from local properties; persist UUIDs in a `channex_mappings` table
(local id ↔ Channex UUID). Must be safe to re-run.

**Phase 4 — outbound ARI**: the drain worker calling
`POST /availability` and `POST /restrictions`. Field-level partial updates —
sending only `rate` must not clobber `min_stay`. Filter past dates before
pushing.

**Phase 5 — inbound bookings**: webhook endpoint on staging (already publicly
reachable at `https://staging.ground-code.com`) or the revisions feed.
- **ACK only after the DB transaction commits.**
- **Booking creation must reuse `add_guest`'s locking guard** — take the
  room/property row lock, then re-check overlap with `... FOR UPDATE`. A plain
  `SELECT` is NOT sufficient: this DB runs REPEATABLE READ where a plain read is
  a non-locking snapshot, and it was **proven** to let two concurrent bookings
  both pass and both insert. Do not write a separate INSERT path.
- Idempotency on `channex_booking_id` + `channex_revision_id` — revisions can be
  redelivered.
- Modifications use the existing `expected_updated_at` optimistic token; a stale
  write returns `409 code=stale_booking`.

---

## 8. Environment notes

- **Local**: XAMPP, MariaDB 10.4, DB `artists_farm_resort`. Node is on PATH in
  PowerShell, **not** Git Bash. Bash lacks `grep`/`cat`/`head`/`wc`/`find`.
  PowerShell 5.1 has no `&&`, no ternary; use `curl.exe` for HTTP.
- **Staging**: `staging.ground-code.com`, DB `staging_groundcode` (isolated from
  production's `groundcode`). Tenant slug is **`artists-farm`** — NOT
  `artists-farm-platform`, which is the *local* value. Wrong slug returns 403,
  and reading `.data.Count` off that error gives `0`, which looks exactly like
  "no records". **Always check `status === 'success'` before trusting a count.**
- Staging deploys pull from **`origin/multi-tenant`** (`git reset --hard`), so
  work must be committed *and pushed* to appear. `deploy-staging.ps1` never
  touches production.
- That host's SSH is currently **intermittent**. If a deploy fails at the swap
  step, the uploaded tarball persists — just retry the swap, don't re-upload.
- After frontend changes: `npx tsc --noEmit -p tsconfig.json`. Baseline is **0**.

---

## 9. Definition of done

Not "it compiles". For each phase: the change works when actually exercised, it
doesn't break a neighbouring case, it obeys `CLAUDE.md`, and the report
separates what was **proved** from what was **assumed**.

For certification specifically, "done" means the eight scenarios were triggered
**from the real UI** and produced the required request patterns — verified by
inspecting the actual outgoing payloads, not by reading the code and concluding
it should work.
