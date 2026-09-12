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

### 1.9 CLOSED 12 Sep 2026 — Import reports full success while silently dropping unpriced listings
**Was:** `php/channex/ota_provisioner.php`'s auto-import response said `status: 'success'`,
`rooms_count: <all listings>`, and "Property and rooms imported from Airbnb" even when a
listing's price couldn't be read and it was correctly skipped rather than given a
fabricated one — nothing told the owner. The exact same shape existed in a sibling path,
`channex_channel_save_mapping` (router.php, used by `ChannelConnectWizard.tsx`'s manual
"Connect a Channel" flow), where a `!$ratePlanId` room was silently `continue`d with zero
trace in the response.

**Fix:** both now report the skipped units by name (`pending_price_units` /
`skipped_no_price`) instead of a bare count, and both frontends (`PropertySetupWizard.tsx`'s
import result, `ChannelConnectWizard.tsx`'s mapping-save toast) show them explicitly instead
of a blanket success message. Still skips the same way — there's genuinely no rate plan to
bind yet — the fix is entirely about the owner being told.

**Deliberately NOT a hard block.** GO_LIVE_SPEC.md §1a.1 originally proposed making
acceptance mandatory *before* mapping can complete. What shipped is the softer half only:
visible, not prevented. A true hard block would mean touching `ChannelConnectWizard.tsx`'s
multi-step flow more invasively (a modal gate before Step 3 can proceed) - deferred as a
separate, deliberately scoped change so this fix could ship low-risk. See GO_LIVE_SPEC.md
Phase 2 for the remaining piece.

**Also shipped alongside this:** `channex_set_unit_price` (new endpoint) + inline price
entry on the new Go Live Status page (`#go_live`), so a unit named in one of the messages
above can be priced immediately without leaving the page. Writes `default_tariff` and
enqueues the same outbox 'rates' item `update_room_tariff` already does, so the existing
self-heal (§1.6 above) creates the real rate plan automatically. Verified by code reuse
(this is the identical side effect `update_room_tariff` has run in production already) -
**deliberately NOT live-tested against a real active channel**, to avoid triggering an
actual push to The Artists' Farm's live Airbnb connection as a side effect of testing.

### 1.10 CLOSED 12 Sep 2026 — The daily audit was structurally blind to single-unit properties
`channex_sync_audit.php`'s rate-coverage check joined rules to mappings with a bare
`LEFT JOIN room_rate_rules rr ON rr.room_id = m.room_id`. For a **single-unit property both
sides are NULL**, and in SQL `NULL = NULL` is NULL, not true — so the join matched nothing,
`MAX(end_date)` came back NULL, and it reported `covered_to: never`.

It could not see the rate rules of **any** single-unit property, and had been filing that
false alarm every morning. The MULTI_KEY half (real integer `room_id`) always worked, which
is exactly why nobody noticed.

**How it was found: the owner said "you're wrong, I always had dynamic pricing."** The
alert had been repeated back to them as established fact — The Artists' Farm has three
day-of-week rules (₹14,000 weekdays / ₹16,000 Fri+Sun / ₹21,000 Sat) running to 30 Mar 2027.
This is the §0 pattern in its most embarrassing form: not a comment claiming something the
code didn't do, but a *check* claiming to verify something it was incapable of seeing — and
a human trusting its output over their own knowledge of their business.

**Fixed:** the join is now NULL-safe *and* property-scoped (the old one matched on `room_id`
alone, so rules from another property's room could satisfy it wherever ids collide).
Extracted to `auditChannexRateCoverage()` in `php/channex/sync_audit.php` so it is testable,
and covered by invariant **B4**, mutation-tested. Verified against real staging data: the old
join flags The Artists' Farm, the new one correctly finds the coverage.

*Also fixed in passing:* `GROUP BY … name` resolved to the SELECT alias on MySQL but is
ambiguous on SQLite, so the query could not be tested at all. Now groups on the expression —
works on both, and is clearer regardless.

---

## 2. Open — ranked

### 2.1 🔴 Patel Colony's Airbnb is almost certainly not receiving bookings either
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

### 2.2 🟠 Automated invariant tests — first suite shipped, coverage still partial
**`php php/tests/test_channex_invariants.php`** (12 Sep 2026) — 9 checks, exit code for CI,
no MySQL and no network required. Covers: the fabricated-money-fallback pattern across all of
`php/channex/`; both import paths never activating or enqueueing ARI; CHANNEX.md's cron table
matching `getCronJobDefinitions()`; the 12 Sep rate-suppression regression and its inverse;
and `getMapping()`'s empty-rate-plan guard.

**Every check was mutation-tested** — each bug reintroduced deliberately to confirm the test
actually fails — and that mattered: the **first version of the money-fallback check silently
caught nothing**. PHP's tokenizer splits `?:` into separate `?` and `:` tokens, so a regex
for a literal `?:` never fired, and the suite reported a confident 9/9 PASS against a
deliberately reintroduced `?: 3500`. A test that cannot fail is this file's own §0 bug,
committed inside the file written to prevent it. **Mutation-test anything added here.**

**Still uncovered** (the reason this stays open rather than closing):
- A conflicting inbound OTA booking is stored rather than rejected (§1.3) — needs a webhook
  fixture substantial enough to drive `handleWebhook()`.
- The frontend invariants entirely — e.g. §1.7's badge, which was a UI label asserting an
  unchecked state. Nothing in this suite can see a `.tsx` file.
- Nothing runs this automatically yet. It is a command someone has to remember, which is a
  weaker version of the same problem. Wire it into `deploy-staging.ps1` as a pre-deploy gate
  (§3.3) so a failing invariant blocks the deploy rather than being available to check.

### 2.3 🟠 Overbooking conflicts are recorded but not shown in the UI
`guests.overbooking_conflict_with` is now written and alerted on, but no dashboard,
calendar, or booking list renders it. The alert is the only surface. A staff member who
misses the Telegram message has no in-app way to find the clash.

**Fix direction:** a red badge on the booking + a System Alerts row in
`OperationalDashboard.tsx` (which already merges guest and OTA alerts into one
severity-sorted list).

### 2.4 🟠 Wizard's post-import room refetch can't help a first-time import
**Where:** `src/components/PropertySetupWizard.tsx` (~lines 140, 284-291).

`isMultiKey` is derived from the `propertyType` **prop**, which is stale immediately
after an import that upgrades a SINGLE property to MULTI_KEY. So `buildStepDefs()` still
omits the `rooms` step, `freshRooms` is never rendered, and the refetch itself calls
`get_multikey_property` on a still-SINGLE property, which 404s and is swallowed. Harmless
(no crash) but it doesn't fix the symptom it was added for — it only works when the
property was *already* MULTI_KEY before the import.

**Fix direction:** set a local "property is now multi-key" flag from the import response
alongside `setFreshRooms`, and derive `isMultiKey` from that.

### 2.5 🟠 Plaintext password comparison still accepted at login
**Where:** `php/security/unified_login.php:96`

```php
($storedPassword && password_verify($passcode, $storedPassword)) ||
($storedPassword && $storedPassword === $passcode);   // <-- plaintext fallback
```

The third clause authenticates against an unhashed stored password. Presumably legacy
migration support. Before launch, confirm no tenant row still has a plaintext password,
then remove the clause.

### 2.6 🟡 Unverified: is the cron dispatcher actually running on the server?
Every piece of monitoring in this product — outbox health, sync audit, feed drain, licence
expiry, trial cadence — hangs off one dispatcher entry in the real crontab. If that entry
isn't installed on staging/production, **all of it is silently dead** and the Cron Jobs
admin page would still look populated.

- [ ] SSH to staging, `crontab -l`, confirm the dispatcher line exists and `cron_jobs`
      shows recent `last_run_at` values for each job.
- [ ] Same on production before launch.

*(Needs explicit go-ahead — read-only, but it's a server login.)*

### 2.7 🟡 Unverified: does anyone actually receive the alerts?
`php/errors/logger.php:127` short-circuits with `if (empty(wp_load_subscriptions())) return;`
— "nobody has tapped Enable Alerts yet". If no device is subscribed, every alert in §1.3,
§1.4 and all the health crons terminates silently, and the only remaining surface is a
Telescope page someone has to remember to open.

- [ ] Confirm at least one live Web Push subscription exists (ideally two devices).
- [ ] Send a test alert end-to-end and confirm it lands on a phone.

### 2.8 🟡 Airbnb `sync_all` locks the host out of their own calendar
Already documented in CHANNEX.md §6: connecting the channel switches the listing to
`sync_all`, which greys out manual date/price editing on Airbnb's own host portal. Seven
of ten connected listings are in this state. Whether a host can still edit their listing
*content* anywhere is **not established**. Settle this before more listings go live —
it's a support-load and trust issue, not a code bug.

### 2.9 🟡 OAuth state token exposed to the frontend
**Where:** `channex_channel_connection_status` (`router.php` ~line 5362) json_decodes and
forwards `channex_channel_connections.settings` verbatim, which contains
`{"oauth_token": "...", "link_generated_at": "..."}`.

Found 12 Sep 2026 while verifying the new `channex_go_live_status` endpoint doesn't leak
Channex's own live OAuth tokens (it doesn't — `ChannexChannelClient::getChannel()`'s
response carries one under `attributes.settings.tokens`, and that endpoint extracts only
`is_active`, never the raw response). This is a
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

Every item in §1 would have been caught before deploy by a check that runs.

**3.1 `php/tests/test_channex_invariants.php`** — built 12 Sep 2026. Run it with
`php php/tests/test_channex_invariants.php` (exit 0/1; no MySQL, no network).
- [x] No file under `php/channex/` contains a hardcoded money fallback. Walks the **token
      sequence**, not regex over text — see the warning in 3.1b, this is where the first
      attempt failed. One bug appeared in three files; this makes it unable to reappear quietly.
- [x] Both import paths (`autoProvisionPropertyFromAirbnb`,
      `autoCreateRoomsFromAirbnbListings`) never call `activateChannel()` or
      `enqueueOutboxItem()`. Brace-matched from tokens so a mention in a comment can't
      satisfy or trip it.
- [x] `computeCompressedRestrictions()` with a real rate rule and **no** base tariff still
      emits that rule's rate (the §1.2 regression, promoted from its repro harness) — plus
      the inverse: a date with no price of any kind emits no rate at all.
- [x] `getMapping()` returns null for a row with an empty `channex_rate_plan_id`, and still
      returns a genuine mapping unchanged.
- [ ] A conflicting inbound booking is stored, not rejected. **Not built** — needs a fixture
      substantial enough to drive `handleWebhook()`.
- [ ] Anything frontend. **Not built** — §1.7's badge was a UI label asserting an unchecked
      state, and nothing here can see a `.tsx` file.

**3.1b MUTATION-TEST EVERY CHECK YOU ADD.** Each of the checks above was verified by
deliberately reintroducing the bug and confirming the suite goes red. This is not ceremony:
**the first version of the money-fallback check silently caught nothing.** PHP's tokenizer
splits `?:` into separate `?` and `:` tokens, so a regex for a literal `?:` never matched,
and the suite reported a confident 9/9 against a deliberately planted `?: 3500`. A test that
cannot fail is §0's exact bug — a claim of safety that isn't real — committed inside the file
written to prevent it. Assume a new check is decorative until you have watched it fail.

**3.2 A doc-drift check.** ✅ Built — every job named in `CHANNEX.md`'s cron table must exist
in `getCronJobDefinitions()`. That single assertion would have caught §1.4.

**3.3 Run before every staging deploy.** ✅ Wired into `deploy-staging.ps1` as step 0b, before
the push — so a violated invariant stops the deploy while everything is still local, having
reached neither GitHub, staging, nor an OTA. Blocks on a real failure; warns and continues if
PHP isn't on PATH, because a gate that gets routinely bypassed protects nothing.

*Known limitation:* it runs against the **working tree**, while the deploy builds from the
committed state (uncommitted changes are stashed at step 2, after this). In the normal
commit-then-deploy flow these are identical. They diverge only if you deploy with uncommitted
changes present — which the script already warns about separately.

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
