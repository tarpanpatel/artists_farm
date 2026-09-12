# Pre-Launch Check

**Started:** 11 Sep 2026
**Why this file exists:** a run of bugs during The Artists' Farm onboarding were all
dangerous in the same way — they were *silent*, they reached a real guest-facing OTA
listing, and they were found by a human noticing something odd rather than by anything
in the system saying so. This is the shared working list for closing that class out
before launch.

Keep this file current. When something here is fixed, move it to **Closed** with the
date and what actually changed. When something new is found, add it with its failure
scenario — not just its name.

---

## 0. The pattern behind almost all of it

> **Every incident so far has been a comment or a document asserting a safety property
> that the code does not actually implement.**

Five separate instances, all found on 11 Sep 2026:

| Where | The claim | The reality |
|---|---|---|
| `php/api/router.php` (import case) | "there is no outward-facing write for the owner to consent to" | `createChannelMapping()` bound a fabricated ₹3,500 rate to the live Airbnb listing |
| `php/channex/content_sync.php` | guard blocks any price ≤ 0 | `ota_provisioner.php` wrote a fake ₹2,500 *upstream*, so the guard never saw a zero |
| `php/channex/ari_drain_worker.php` | "the loop below skips those dates" | it stripped the rate from the **entire** push, silently discarding real prices |
| `CHANNEX.md` | `channex_feed_drain.php` runs "every 5 min" | it was never in `getCronJobDefinitions()`, so it was never scheduled at all |
| `ChannelConnectionsPage.tsx` | green badge: listing is "Mapped & **Active**" | it only checked that a rate plan existed; the channel had never been activated and was pushing nothing |

Note the last one is the same failure wearing a UI costume: a *label* is just a comment
the customer can see. It was contradicting the channel status badge six inches above it.

**The lesson:** a comment is a claim about the past. It is not a test, and on this
codebase it has been wrong more often than not on exactly the paths that matter most.
Anything safety-critical needs an assertion that runs, not a paragraph that explains.

**This is the single highest-value item on the list** — see §3.

---

## 1. Closed (11 Sep 2026)

### 1.1 Fabricated prices pushed to a live Airbnb listing ✅
- `php/channex/content_sync.php` — removed `?: 3500` / `?: 2500`; a unit with no real
  price is parked at `sync_status = 'pending_price'` instead of getting a rate plan.
- `php/channex/ota_provisioner.php` (2 sites) — removed the sibling `?: 2500` fallbacks
  that wrote a fake price into a new room's `default_tariff` **before** the guard above
  ran, defeating it entirely.
- `php/channex/ota_provisioner.php` — added the `is_numeric()` guard the same file
  already applies to the same field 146 lines later. Without it a non-scalar shape from
  Channex (`{amount, currency}`) casts to `1.0` — a fabricated ₹1 rate that is `> 0`, so
  it passes every new guard and reaches the live listing.
- The already-leaked ₹3,500 on The Artists' Farm was corrected to ₹20,000 directly on
  the Channex rate plan and verified by readback.

### 1.2 Explicitly-priced dates silently not pushed ✅ (regression, same day)
`php/channex/ari_drain_worker.php` — the first version of the no-fake-price guard removed
`rate_per_night` from the whole push whenever the property's base tariff was ≤ 0. A
property with no base rate but a real ₹8,000 rule over Christmas pushed **no rate for
Christmas either**, then returned `[]` → `no_op` → `markRowsDone()`. The owner saw "saved
successfully", the outbox row read `done`, and the OTA kept the old price forever.

Now gated **per date**: a day priced by a real rule or floor pushes normally; only a day
whose sole possible price would be a non-existent base rate omits the key. Verified with
an isolated harness — the previously-broken property now emits the identical payload to
one that has a base rate.

### 1.3 Inbound OTA bookings were being thrown away on conflict ✅
`php/channex/webhook_receiver.php` — a booking arriving from Airbnb for already-booked
dates was rejected (409, rolled back, **nothing stored**). But that booking is already
sold: the OTA took the guest's money and sent a confirmation. Refusing to store it
locally doesn't un-sell the night, it just means nobody knows the guest is coming. And
because a rejected revision is never ACKed, Channex re-served it for ~30 minutes and then
dropped it from the feed permanently — the booking would be gone with no record anywhere.

Most likely trigger is **exactly the onboarding window**: a freshly imported property has
offline bookings in Ground Code that were never pushed to the OTA (import must never
push), so the OTA still shows those nights open and can genuinely sell one.

Now: the booking is stored, tagged with `guests.overbooking_conflict_with` (new
self-healing column), and announced loudly on **both** channels — Telegram to the
property's admin group, and Telescope `channel_manager` (which also reaches the admin's
phone by Web Push even if Telegram is misrouted). Neither booking is auto-cancelled;
only a human can decide who moves.

This is what CLAUDE.md's no-overlap rule already carved out: *"refusing to store one
would hide a real double-booking rather than fix it. The correct handling is to detect
and alert loudly."* The strict no-overlap rule still governs every path where Ground Code
**creates** the stay — `add_guest`/`update_guest` keep their hard 409s.

### 1.4 The safety net for missed bookings was never scheduled ✅
`php/cron/cron_jobs.php` — `channex_feed_drain` added to `getCronJobDefinitions()` at a
5-minute interval, and the seed marker bumped `v6 → v7` (without that bump the new job
would never be inserted — the exact trap that file's own comment warns about, which had
already caught two other jobs).

Until this, inbound OTA bookings depended **entirely** on Airbnb's webhook arriving and
succeeding first time. Any webhook missed during a deploy, restart or network blip was
unrecoverable after 30 minutes.

### 1.5 A NULL staff passcode signed anyone in with `123456` ✅
`php/security/unified_login.php:216` read `$staff['passcode'] ?? '123456'`. Any active
staff row whose passcode column was NULL could be logged into by anyone typing the
well-known default — the account least likely to have had a passcode deliberately chosen
was the easiest to walk into. Now a NULL/blank stored passcode means *this account cannot
be logged into*, and the comparison uses `hash_equals()`.

Same anti-pattern as the ₹3,500 rate: inventing a plausible value for a missing one,
where the honest answer is to refuse.

### 1.6 Empty rate-plan id treated as a live mapping ✅
`php/channex/ChannexAdapter::getMapping()` — a `pending_price` row is a real row carrying
an **empty** `channex_rate_plan_id`. Being truthy, it (a) permanently disabled the
"no mapping → re-sync" self-heal, so a unit stayed unpriced forever even after the owner
finally entered a rate, and (b) sent `rate_plan_id: ""` to Channex on every push,
failing forever — the same endless-retry shape as the documented "74th identical
attempt" incident. Now reported as "no mapping", which is the accurate answer and lets
the self-heal run.

### 1.7 Listings showed green "Mapped & Active" on a channel that was pushing nothing ✅
`src/components/ChannelConnectionsPage.tsx` — the per-listing badge read
`channex_rate_plan_id ? 'Mapped & Active' : ...`, so it went green the moment content sync
created a rate plan. It never checked activation at all.

Found live on Patel Colony: **7 listings all showing green "Mapped & Active" underneath an
Airbnb channel correctly labelled "Ready to activate"** — i.e. one page asserting two
contradictory things, with the reassuring one being false. Since an import deliberately
never activates (CHANNEX.md 5.4a), this is the *normal* post-import state, which is
exactly why it must not be painted as success.

Now derived from the connections list: "Live on N channels" (green) only when a channel is
genuinely `active`; "Mapped - not live yet" (amber) otherwise, with the subtitle spelling
out that rates and availability are not being sent yet.

### 1.8 Push gate displayed "N nights at ₹0" ✅
`src/components/PushConfirmationGate.tsx` — wrong twice over: it reads as "about to sell
these nights for nothing", and it isn't even what happens now (the rate is omitted, not
sent as 0). This gate exists to state a checkable fact about the push, so it now states
the real one.

---

## 2. Open — ranked

### 2.1 🔴 Import reports full success while silently dropping unpriced listings
**Where:** `php/channex/ota_provisioner.php` (~line 352 `if ($ratePlanId)`), response
built at the end of the same function.

A listing whose price can't be read — Airbnb omits `default_daily_price`, or the
`listing_details` call failed — now correctly refuses to fabricate a price, so it's
parked at `pending_price`, skips `createChannelMapping()`, and gets rewritten out of the
mapping table by `saveChannexChannelRoomMappings()` ("replace wholesale").

But the response still says `status: 'success'`, `rooms_count: <all listings>`, and
"Property and rooms imported from Airbnb." **Nothing tells the owner that 2 of their 7
listings have no channel mapping.** They find out at Go Live via a generic Channex 422
that never says "set a base price".

This is a behaviour change introduced by the fixes above — previously every room got a
(fake) price and a mapping, so the partial state didn't exist. The fix is correct; the
reporting has to catch up.

**Fix direction:** return the `pending_price` units in the import result and surface them
in the wizard as "needs a base price before this unit can go live."

### 2.2 🔴 Patel Colony's Airbnb is almost certainly not receiving bookings either
**Status:** `ready_to_activate` — correct and deliberate (import must never activate), but
the consequences need confirming and acting on.

Per Channex's own Airbnb channel documentation, **activation gates both directions**, not
just outbound: activating "starts exchanging data with the channel", deactivating means
"the connection stops sending updates", and an inactive mapped connection is documented as
not receiving bookings. Their setup guide lists "load the existing reservations" as a step
*after* activation.

If that reading is right, then for Patel Colony right now:
- Nothing goes **out** to Airbnb (no availability, no rates) — certain.
- Nothing comes **in** from Airbnb — likely. Any Airbnb booking made today would exist on
  Airbnb and be invisible in Ground Code.

**The compounding risk at Go Live:** if bookings have been accumulating on Airbnb that
Ground Code never received, activating pushes Ground Code's availability view — which
shows those nights as *free* — straight over real, sold reservations. That is the
double-booking scenario, at scale, triggered by the act of going live.

Mitigations already in place: `loadFutureReservations()` is called during import to backfill
existing reservations, and the Push Confirmation Gate shows the dates about to be opened.
Neither is a substitute for checking.

- [ ] Confirm against the live Channex channel whether inbound is genuinely off while
      `ready_to_activate` (docs reading above is indicative, not verified against our account).
- [ ] Before activating Airbnb on Patel Colony: run `loadFutureReservations()` again and
      reconcile Airbnb's calendar against Ground Code's, date by date.
- [ ] Decide whether Patel Colony's Airbnb should be live at all right now — if it is
      meant to be selling, it currently isn't.

### 2.3 🔴 No automated invariant tests — see §3
The systemic fix. Everything in §1 was found by reading code, which does not scale and
already missed things twice in one day.

### 2.4 🟠 Overbooking conflicts are recorded but not shown in the UI
`guests.overbooking_conflict_with` is now written and alerted on, but no dashboard,
calendar, or booking list renders it. The alert is the only surface. A staff member who
misses the Telegram message has no in-app way to find the clash.

**Fix direction:** a red badge on the booking + a System Alerts row in
`OperationalDashboard.tsx` (which already merges guest and OTA alerts into one
severity-sorted list).

### 2.5 🟠 Wizard's post-import room refetch can't help a first-time import
**Where:** `src/components/PropertySetupWizard.tsx` (~lines 140, 284-291).

`isMultiKey` is derived from the `propertyType` **prop**, which is stale immediately
after an import that upgrades a SINGLE property to MULTI_KEY. So `buildStepDefs()` still
omits the `rooms` step, `freshRooms` is never rendered, and the refetch itself calls
`get_multikey_property` on a still-SINGLE property, which 404s and is swallowed. Harmless
(no crash) but it doesn't fix the symptom it was added for — it only works when the
property was *already* MULTI_KEY before the import.

**Fix direction:** set a local "property is now multi-key" flag from the import response
alongside `setFreshRooms`, and derive `isMultiKey` from that.

### 2.6 🟠 Plaintext password comparison still accepted at login
**Where:** `php/security/unified_login.php:96`

```php
($storedPassword && password_verify($passcode, $storedPassword)) ||
($storedPassword && $storedPassword === $passcode);   // <-- plaintext fallback
```

The third clause authenticates against an unhashed stored password. Presumably legacy
migration support. Before launch, confirm no tenant row still has a plaintext password,
then remove the clause.

### 2.7 🟡 Unverified: is the cron dispatcher actually running on the server?
Every piece of monitoring in this product — outbox health, sync audit, feed drain, licence
expiry, trial cadence — hangs off one dispatcher entry in the real crontab. If that entry
isn't installed on staging/production, **all of it is silently dead** and the Cron Jobs
admin page would still look populated.

- [ ] SSH to staging, `crontab -l`, confirm the dispatcher line exists and `cron_jobs`
      shows recent `last_run_at` values for each job.
- [ ] Same on production before launch.

*(Needs explicit go-ahead — read-only, but it's a server login.)*

### 2.8 🟡 Unverified: does anyone actually receive the alerts?
`php/errors/logger.php:127` short-circuits with `if (empty(wp_load_subscriptions())) return;`
— "nobody has tapped Enable Alerts yet". If no device is subscribed, every alert in §1.3,
§1.4 and all the health crons terminates silently, and the only remaining surface is a
Telescope page someone has to remember to open.

- [ ] Confirm at least one live Web Push subscription exists (ideally two devices).
- [ ] Send a test alert end-to-end and confirm it lands on a phone.

### 2.9 🟡 Airbnb `sync_all` locks the host out of their own calendar
Already documented in CHANNEX.md §6: connecting the channel switches the listing to
`sync_all`, which greys out manual date/price editing on Airbnb's own host portal. Seven
of ten connected listings are in this state. Whether a host can still edit their listing
*content* anywhere is **not established**. Settle this before more listings go live —
it's a support-load and trust issue, not a code bug.

### 2.10 🟡 OAuth state token exposed to the frontend
**Where:** `channex_channel_connection_status` (`router.php` ~line 5362) json_decodes and
forwards `channex_channel_connections.settings` verbatim, which contains
`{"oauth_token": "...", "link_generated_at": "..."}`.

Found 12 Sep 2026 while verifying the new `channex_go_live_status` endpoint doesn't leak
Channex's own live OAuth tokens (it doesn't — see §1.1 in the Go Live work). This is a
different, lower-severity token: a single-use CSRF/state nonce Ground Code generates
itself for the Airbnb OAuth landing round-trip (`channex_airbnb_oauth_landing`,
verified with `hash_equals()` against what the redirect carries back). Not a live bearer
token — but there's no reason it should reach the browser at all, and "no reason to
expose it" is the same standard the rest of this file holds everything else to.

**Fix direction:** strip `settings` (or allowlist only non-sensitive keys) before this
endpoint's response is built, the same way `channex_go_live_status` already only ever
extracts the one field it needs from `ChannexChannelClient::getChannel()` rather than
forwarding that response raw.

---

## 3. The systemic fix: make the invariants executable

Every item in §1 would have been caught before deploy by a check that runs. Proposed, in
priority order:

**3.1 A `php/tests/test_channex_invariants.php` suite** asserting the things that are
currently only claimed in comments:
- [ ] No file under `php/channex/` contains a numeric fallback near a money field
      (grep-level: `default_tariff.*\?[:?]\s*[0-9]{2,}`). This one bug appeared in three
      files; a grep assertion makes it permanently unable to reappear quietly.
- [ ] The import path (`autoProvisionPropertyFromAirbnb`) never calls `activateChannel()`
      or `enqueueOutboxItem()`.
- [ ] `computeCompressedRestrictions()` with a real rate rule and **no** base tariff still
      emits that rule's rate. *(This is the §1.2 regression — it had a working repro
      harness; promote it into the suite.)*
- [ ] `getMapping()` returns null for a row with an empty `channex_rate_plan_id`.
- [ ] A conflicting inbound booking is stored, not rejected.

**3.2 A doc-drift check.** Every job named in `CHANNEX.md`'s cron table must exist in
`getCronJobDefinitions()`. That single assertion would have caught §1.4.

**3.3 Run both before every staging deploy**, not just before production — staging is
where these are actually found.

**3.4 One regression test per incident, from here on.** The rule: when something breaks,
the fix isn't done until there's a check that fails if it comes back. A CLAUDE.md
paragraph explains; it doesn't run.

---

## 4. Launch-readiness checklist

Nothing here is a code change — these are the "is it actually on?" checks that the code
cannot answer for itself.

- [ ] Cron dispatcher installed and firing on production (§2.6)
- [ ] At least one Web Push subscription live, tested end-to-end (§2.7)
- [ ] For every connected property: Channex Inventory tab shows AVL open on dates that
      should be open (never trust a "success" toast — CHANNEX.md's standing rule)
- [ ] For every connected property: no `channex_outbox` rows in `failed`, and none with
      high `attempts`
- [ ] No `channex_mappings` row stuck at `sync_status = 'pending_price'` for a property
      that is live
- [ ] Every live unit has a real `default_tariff` **or** full rate-rule coverage
- [ ] No staff row with a NULL passcode (§1.5 — refuses login now, so it'd read as a
      lockout rather than a breach, but fix the data too)
- [ ] No tenant row with a plaintext password (§2.5)
- [ ] Confirm with the owner which dates they blocked **directly on the OTA** before any
      wide push — Ground Code cannot see those and will reopen them

---

## 5. Notes for whoever picks this up

- **Staging only.** Never deploy to production, never run `deploy.ps1` — that rule is in
  CLAUDE.md and only the user's own manual edit to that file can change it.
- **Ask before any corrective push** to a live OTA channel, every single time. A
  server-side script bypasses every in-app confirmation gate.
- **Verify by readback, not by a 200.** Multiple incidents here returned success while
  doing nothing.
- The `?: <number>` pattern near money is this codebase's most repeated dangerous idiom.
  When in doubt, refuse rather than invent.
