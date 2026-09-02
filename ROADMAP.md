# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### 💬 Custom WhatsApp-Powered SaaS Customer Support Desk (Planned - Sep 2026)

- **Goal**: Build a 100% proprietary, zero-subscription customer support desk inside Ground Code powered directly by Meta's WhatsApp Cloud API (`php/whatsapp/sender.php`).
- **Host / Staff Experience**:
  - Front-desk and property owners message Ground Code on WhatsApp or via the in-app Help Drawer.
  - Automatically captures system diagnostics: property slug, active screen (e.g. `#bookings`, `#kitchen_kds`), user role, and browser info.
- **Inbound Webhook (`php/whatsapp/webhook.php`)**:
  - Meta Webhook endpoint verifying `hub.verify_token` and `hub.challenge`.
  - Inbound listener reverse-matches sender phone numbers against `tenants.phone` or `staff.phone` to attribute messages to the exact property (`Artists Farm Jaipur`).
  - Automatically creates/threads tickets in MySQL (`support_tickets` & `support_ticket_messages`).
  - Dispatches immediate Telegram alert to Root Admin bot:
    *"💬 Support Ticket #GC-1001 from Jaipur: 'Printer not printing KOT' [Reply in Dashboard]"*.
- **Root Admin Support Desk UI (`src/components/SupportDesk.tsx` in `RootAdminDashboard.tsx`)**:
  - Dedicated "Support Desk" tab with live unread badge count.
  - Split-view inbox: searchable conversation list with status filters (`Open`, `In Progress`, `Resolved`, `Closed`).
  - Two-way chat thread with client/admin bubbles and one-click `[Jump to Property]` diagnostic button.
  - Outbound reply box executing `sendWhatsAppDirectTextMessage()` to deliver replies straight to the host's WhatsApp in real time.
- **Database Schema (`php/schema/support_tickets.sql`)**:
  - `support_tickets` (`id`, `ticket_number`, `tenant_id`, `property_id`, `contact_phone`, `contact_name`, `status`, `priority`, `category`, `last_message_at`, `unread_admin_count`).
  - `support_ticket_messages` (`id`, `ticket_id`, `sender_type`, `sender_name`, `sender_phone`, `body`, `whatsapp_message_id`, `delivery_status`, `created_at`).

### Concurrency: what remains irreducible (audited 30 Aug 2026)

A full multi-user concurrency audit was done 30 Aug 2026 (prompted by "what
happens with ~10 staff working at once - 2 taking food orders, 3 serving via
web/Telegram, 3-4 taking and editing bookings"). Every *in-app* race found was
fixed and individually proven with real concurrent DB connections - see the
"Shipped 30 Aug 2026" section below. Load itself was never the issue (10 users
against a 15s KDS poll is trivial); correctness under concurrency was.

**What CANNOT be fixed in this codebase, and why - do not re-litigate:**

- **The outbound OTA window.** iCal is pull-only: Airbnb/Booking.com poll our
  export feed on *their* schedule (typically every 2-4h) and we cannot push to
  them. So a direct booking taken now is invisible to those channels for hours.
  Shrinking our own inbound sync (15 min) does nothing about this half.
- **Two OTAs selling the same night inside one polling window.** Neither knew
  about the other at the time of sale. By the time we learn of it, two real
  guests hold two real third-party confirmations.
- **An OTA booking is a third-party commitment.** Once Airbnb confirms to a
  guest it binds regardless of our DB, so the app can only ever detect+alert,
  never reject - and it must not reject, since refusing to store it would hide
  a real double-booking instead of surfacing it.

The only true fix for all three is replacing iCal with native OTA APIs or a
channel manager (push-based). That's a product/integration project, not a bug
fix - see the channel-manager note below. Until then the mitigation is
operational, not technical: treat the conflict alert as an emergency, and avoid
listing the last available room on multiple OTAs at once in high season.

**Channel manager evaluation (if OTA volume ever justifies it).** The right
shape for this app is a *white-label channel-manager API for PMS vendors*, not
an end-user channel manager. Channex.io fits architecturally (WhiteLabel plan
aimed exactly at PMS providers, ~$130/mo + $7/hotel, ~60 channels) but its
published channel list does not clearly include MakeMyTrip or Goibibo - likely
the highest-volume OTAs for Jaipur/Goa properties, which would leave the
biggest channel still on manual iCal. India-capable alternatives worth pricing
alongside it: SaasAro (explicitly sells a channel-manager API for PMS
providers), AxisRooms, STAAH. **The qualifying question for every vendor is the
same: "do you offer a white-label API for PMS vendors, AND do you connect
natively to MakeMyTrip and Goibibo?"** - that intersection is narrower than it
looks.

**Still open (needs a product decision, not research):** nothing blocking. The
lost-update guard shipped below is optimistic (reject + reload); a
field-level merge was deliberately NOT built, since silently auto-merging money
fields is worse than asking a human.

### Pre-Launch: Dedicated Test Sandbox Property + Telegram Groups

**Deferred on purpose - user wants this done just before the site actually launches, not now.**

Found 29 Aug 2026: a scripted photo-relay verification test (see the "Telegram photo relay"
entry below) created a fake guest ("Claude Photo Relay Test Guest") and its placeholder ID
photo landed in the real "Admin Farm Group" Telegram channel for the Jaipur property. Root
cause isn't a code bug - `complete_checkin_verification` correctly relays whatever real file
was actually uploaded (`php/guests/guests.php` ~line 1261). The gap is that staging currently
doubles as the de facto live system for these early properties (real staff/owners are plausibly
the actual members of these Telegram groups pre-launch), and nothing in the app currently
distinguishes "a property real people are watching" from "a property safe to throw test data
at." Staging's DB is already properly isolated from production (fixed 24 Aug 2026 migration -
that part is fine); this is specifically about Telegram groups (and, more generally, any
property real users are actively watching) receiving test noise.

**Planned fix, to do just before launch**: create one dedicated test/sandbox property with its
own throwaway Telegram groups (Admin/Finance/Kitchen as applicable) that no real staff/owner is
ever added to, and make that the only target for any future scripted or manual verification
test - never an existing real-named property (Jaipur, Sea View Villa, etc.), even on staging.
User has confirmed they'll create the new Telegram group(s) themselves. No code change
required for this alone (it's a data/config setup task - a property row + its
`property_modules.config` Telegram routing), unless a stronger technical guardrail (e.g.
tagging real properties as "protected" and refusing to run test-triggering actions against
them in code) is wanted later - that was discussed as a further-out, bigger option, not part of
this planned fix.

### Security & Architecture Follow-ups

- **Input Validator Expansion**: Core operational modules (Guests, Petty Cash, Staff, Licenses, Receipts, Walk-in Tabs, Inventory, Rates) are 100% wired and verified. Minor admin/theme settings can be extended as needed.

### Security: open follow-ups from the 11 Aug 2026 auth audit

Fixed and shipped, see git history for details on each: cross-tenant
property-access gate; removed the `123456` universal login bypass;
rate limiter on login; `ical_sync.php`'s missing auth check; the login
identifier wildcard bug (fixed in both `router.php` and its unpatched
duplicate `authenticate.php`, which also got a rate limiter sharing
`router.php`'s bucket); CSRF protection via an Origin/Referer allow-list;
`resolveCallerTenantIds()`'s id-collision risk, plus a property-gate
regression that fix surfaced (tenant admins briefly couldn't list their
own tenant's properties); the hardcoded emergency-admin backdoor
(`admin`/`root`/`9999999999`/`vrikshawan` + `123456`/`admin`) replaced
with a real env-controlled `EMERGENCY_ADMIN_PASSWORD`; a live
unauthenticated password-reset endpoint (`reset_tenant_pass.php`) found
and archived; staff "Access All Properties" (tenant-scoped multi-property
staff logins via a new property picker, replacing the old single-property
`LIMIT 1` lock); and (29 Aug 2026) the login-logic duplication itself -
`router.php`'s `login_user` action and `authenticate.php` now both call
one shared `performUnifiedLogin()` (`php/security/unified_login.php`)
instead of carrying independent copies. Worth doing precisely because the
two copies had already drifted in real, live ways by the time this ran:
`authenticate.php` was missing `full_name` in the session and
`can_switch_properties`/`tenant_id`/`tenant_slug` in two of its responses,
skipped audit_logs/TelescopeLogger success logging on 3 of 4 branches and
ALL failure branches, returned a distinct "Invalid 6-digit passcode" 401
on a wrong-passcode-but-real-username attempt (an account-enumeration
leak `router.php` never had) that also exited before ever reaching the
emergency-admin check (so a legitimate emergency password could be
rejected outright if the typed identifier happened to match a staff
username), and caught only `PDOException` instead of the general
`Exception` `router.php` catches (a non-PDO exception would have gone
completely uncaught). All of this was merged to the more-complete/more-
secure behavior and verified live through both entry points with real
accounts (tenant admin, access-all-properties staff, and regular staff) -
identical response bodies confirmed byte-for-byte, the previously-missing
audit_logs rows now appear for both success and failure on `authenticate.php`,
and the wrong-passcode-for-real-username case now returns the same generic
message `router.php` always used. The emergency-admin branch itself
wasn't live-tested (no `EMERGENCY_ADMIN_PASSWORD` configured on local
XAMPP) - low risk, since it's the same code just relocated, not rewritten.

What's still open: nothing load-bearing. **General input-format validation**
(`php/security/input_validator.php` - validateEmail/String/Float/Date/URL/
Boolean/Slug/JSON) is now wired across every core operational module -
Guests (11 Aug 2026), Petty Cash (21 Aug 2026, `validatePettyCashInput()`),
then Staff/Licenses/Receipts/Walk-in Tabs/Inventory/Rates (verified 29 Aug
2026 via direct `grep` - each has its own `validateXInput()` genuinely
called via `$input = array_merge($input, validateXInput($input));` in its
add/update action, not just declared and unused). `InputValidator::
validateString()` itself was also fixed along the way (byte-length vs
character-length, affects every module using it). Only minor admin/theme
settings screens remain unwired, and those aren't a priority - prepared
statements already prevent SQL injection, so this was always a data-
integrity/UX gap, not a breach vector.

### Needs Manual Verification

- **Property-access gate, real browser session.** Re-verified via curl again
  21 Aug 2026 (cross-tenant read+write denial for a real tenant-scoped
  account, plus the staff-with-no-property/no-tenant edge case both against
  its own tenant's properties and against the default-fallback property) -
  still holding correctly, no regressions. Also traced a suspected gap
  (`getCurrentPropertyId()` defaulting to property `jaipur` when no
  `property_slug` signal is present at all) and confirmed it's NOT reachable
  through the real app: `apiFetch()` always sets `property_slug` to
  something (a real slug, or a reserved sentinel like `tenant_dashboard`
  that resolves to `$propertyId = 0` on purpose), so the fallback path only
  fires for a raw/manual API call, never the actual frontend. Partially
  exercised through the real browser app 23 Aug 2026 (Playwright): logged in
  as Root Admin, Staff Kitchen, and Staff Supervisor across two different
  properties, clicked through Dashboard/Bookings/Kitchen/Team pages for each
  - no unexpected 401/403. Fully closed out 29 Aug 2026 - see the dedicated
  entry below for the exhaustive cross-tenant pass.
- ✅ **Telegram delivery on booking edits** - CONFIRMED WORKING, 29 Aug 2026.
  Created a real guest, performed a genuine authenticated `update_guest` call
  (real login, real CSRF token, real session) changing `no_of_guests` 1→3,
  confirmed via Telescope's `telegram` portal that 2 real `sendMessage HTTP
  200` deliveries fired to the property's real Admin chat at the matching
  timestamp. Test guest and both real Telegram messages cleaned up
  afterward.
- ✅ **Telegram photo relay (guest ID documents + expense invoices)** -
  CONFIRMED WORKING, 29 Aug 2026, with a real bug found and fixed along the
  way. ID-document relay: uploaded a real file via `upload_image.php`,
  triggered `complete_checkin_verification`, confirmed a real `sendPhoto
  HTTP 200` to the Admin chat and that the source file was auto-deleted
  afterward. Expense-invoice relay initially FAILED live with `HTTP 400:
  can't parse entities` - root-caused to a bug in `restoreEmojis()`
  (`php/telegram/templates.php`): its regex for `NEW FINANCIAL TRANSACTION`,
  `TOTAL CREDITED`, `AMOUNT MOVEMENT:`, and `DEBIT AMOUNT:` spliced its own
  `</b>` right after the label, but the real templates have more bold
  content after the label (`(EXPENSE)`, `₹{amount}`, etc.) before their own
  closing tag - producing a dangling duplicate `</b>` whenever a property's
  stored template had the legacy "?"-corrupted-emoji prefix these regexes
  exist to repair. Fixed by dropping the hardcoded `</b>` from those 4
  replacements (letting the original text's own trailing close do the job);
  re-ran the real `add_petty_cash` flow end-to-end and confirmed `sendPhoto
  HTTP 200` to the Finance chat. All test rows (`farm_utility_expenses`,
  `financial_ledger`, `expense_item_prices`, test guest + ID doc row) and
  both real Telegram test messages cleaned up afterward.
- ✅ **Staff "Access All Properties," real session walkthrough** - CONFIRMED
  WORKING, 29 Aug 2026 (API-level, no browser tool available this session -
  see note below). Logged in as a real `access_all_properties` staff account
  (tenant `vrikshawan`, home property `Resort Hut`). `get_tenant_properties`
  correctly listed every top-level property under that tenant (`Resort Hut`
  + `Goa Homes`) and was correctly denied for a foreign tenant. Switched to
  the sibling property `Goa Homes` (never this account's own `property_id`)
  using the exact same session cookie - `check_session` resolved it with no
  mismatch and `can_switch_properties: true`, and `get_guests` against it
  returned real, correctly-scoped data (HTTP 200) with zero re-authentication.
  The same session was then correctly denied (403, "Access denied for this
  property") when requesting a property under a *different* tenant -
  cross-tenant isolation holds even for an all-properties account. Along the
  way, confirmed a pre-existing DB quirk is harmless: a `users`-table row
  happens to share the username "Rohit" with an unrelated `staff_users` row
  of the same name - logging in with the bare name matches the `users` row
  first (by design, `users` is checked before `staff_users`), not a code bug,
  just a reason to always test with a phone-number identifier when it's
  ambiguous.
- ✅ **Property-access gate + Staff "Access All Properties," real browser
  click-through** - CONFIRMED WORKING, 29 Aug 2026, via an actual Playwright
  browser session (a second Claude Code session with the Playwright MCP
  server connected, handed the task since the session doing the rest of
  this day's work didn't have it attached). Checkout confirmed on
  `multi-tenant` @ `1ccda8d9` (includes the login-logic de-dup above). Both
  items fully PASS:
  - **Staff switcher**: logged in as the same `9828111111`/`vrikshawan`
    access-all-properties account used in the curl pass above. Property
    picker correctly showed exactly `Resort Hut` + `Goa Homes` (nothing
    cross-tenant). Picked `Goa Homes` (not the account's own home property)
    - landed directly in its dashboard with no second passcode prompt. The
    header's "Switch property" icon is visible for this account and swaps
    between the two with no re-auth; direct URL navigation between the two
    property URLs while logged in also works with no re-auth.
  - **Cross-tenant denial**: navigating to a property under a *different*
    tenant (`artists-farm-platform`/`jaipur`) while on the `vrikshawan`
    session renders the login gate, not Jaipur's real dashboard/data - zero
    leak. `check_session` reports `session_property_mismatch: true`;
    `get_guests` for `jaipur` 403s; the `vrikshawan` session itself survives
    the visit intact (back to `resort-hut` still logged in).
  - **Three real observations surfaced, not failures** (worth a UX pass
    later, not urgent): (1) the cross-tenant "denial" is a generic login
    gate, not an explicit "you don't have access to this property" message
    - isolation is intact but the user gets no explanation. (2) `login_user`
    returns `success:true` even when posted with a `property_slug` the
    credential can't access (verified: `vrikshawan` creds + `property_slug=
    jaipur` still logs in) - the mismatch is only caught downstream by
    `check_session`/the property-access gate, not rejected up front with a
    clear message. (3) The local dev server matters for this kind of test:
    the Apache `/artists_farm/` subfolder path can't run the SPA correctly
    (`index.php`/`.htaccess` hardwire domain-root asset paths, throwing
    `Unexpected token '}'` console errors) - the browser session had to
    target the Vite dev server directly (`:3000`) to get a working app at
    all. Anyone doing browser verification locally should do the same, and
    those specific console errors on the Apache path are a known
    environment quirk, not an app bug, if seen again.

## ✅ Shipped 30 Aug 2026 - multi-user concurrency audit

Every item below was reproduced with real concurrent DB connections *before*
fixing, and re-run *after* to prove the fix - not reasoned about and assumed.

- **Double-booking race in `add_guest`/`update_guest` (`php/guests/guests.php`)**
  - the single most serious finding, and a direct violation of CLAUDE.md's
  "a room must NEVER have two overlapping bookings" rule. The overlap guard was
  a plain `SELECT`, which under this DB's REPEATABLE READ isolation is a
  *non-locking snapshot read*: two staff booking the same room for the same
  dates both passed the check and both inserted. Proven live - and worse than a
  normal race, because the losing transaction kept reading its frozen snapshot
  even *after* the other committed, so the window was the whole transaction,
  not milliseconds. Fixed by (1) taking an exclusive row lock on the room (or
  the property, for whole-property bookings) so concurrent attempts serialize,
  and (2) making the overlap check itself `FOR UPDATE`, which is a "current
  read" that sees latest-committed rows and gap-locks the range. Neither alone
  suffices. `update_guest` additionally had **no transaction at all**, so any
  lock would have been released immediately - it's now transactional, commits
  before the Telegram sends (so a hanging API call can't hold the room lock),
  and rolls back on error. Re-tested: the scenario that produced 2 overlapping
  bookings now produces 1, with the second attempt correctly 409ing.
  - **No DB-level backstop is possible.** Preventing overlapping ranges needs
    exclusion constraints, which are PostgreSQL-only; MySQL/MariaDB has no
    equivalent (a trigger could fake it but is fragile). The application-level
    lock is the real guarantee here - don't assume a constraint is also
    catching this.
- **Whole-property (SINGLE) bookings had NO overlap check at all** - the guard
  sat inside `if ($roomId !== null)`, and a SINGLE property's bookings carry no
  room_id, so 4 real properties could be double-booked freely (not even racily
  - deterministically). Now guarded, deliberately scoped to genuinely SINGLE
  properties: a MULTI_KEY property can also hold legacy room_id-NULL rows
  ("Other / Unassigned Rooms") which must NOT block each other.
- **Duplicate serve records from a Telegram double-tap
  (`php/telegram/webhook_handler.php`)** - "read status, check not-served,
  write" with no guard, while a Telegram inline button stays tappable for
  everyone in the group forever and the KDS only refreshes every 15s. Two staff
  tapping the same dish both wrote a `served_logs` row (a phantom second
  serving in the KDS report) plus a duplicate audit row. Fixed by making the
  UPDATE conditional and using `rowCount()` to decide who actually claimed it;
  the loser falls through to the existing "already marked as served" reply. The
  bulk "Serve All" path had the same shape (its UPDATE was already conditional,
  so only the *logging* duplicated - easy to miss) and is now wrapped in a
  transaction with a `FOR UPDATE` read.
- **iCal export published sold nights as available (`php/api/ical_export.php`)**
  - the highest-impact fix here, and NOT a race: a 100%-of-the-time hole. The
  feed exported only the `guests` table, so an OTA hold synced in but not yet
  manually clicked through "Convert to Booking" was advertised to every *other*
  channel as free. Measured on `resort-hut` at the time of the fix: **1 direct
  booking was being exported while 13 genuinely-sold nights were published as
  available.** Unconverted holds are now exported too (excluding already-
  converted ones, to avoid a duplicate VEVENT for one stay, and anything in the
  past). Wrapped so a missing/empty sync table can never 500 the whole feed -
  an OTA getting an error would treat everything as free, strictly worse than
  publishing just the direct bookings.
- **iCal UID collision (same file)** - UIDs were `md5(propertyId + start + end)`,
  so two stays sharing dates (two rooms on a whole-property feed, or a direct
  booking alongside an OTA hold) produced an *identical* UID. iCal consumers
  dedupe by UID, so one silently vanished from the feed and its nights were
  advertised as free. UID is now per-booking.
- **Silent lost updates on concurrent booking edits** - `update_guest`
  overwrites every column from the submitted form, so two staff editing one
  booking meant the later save silently discarded the earlier one: no error, no
  warning, discovered only when a guest turns up on the wrong date. Added an
  `updated_at TIMESTAMP(6)` version column (self-healing schema,
  `ensureGuestConcurrencySchema()`); the client echoes back the value it loaded
  and a stale save is rejected with `409 code=stale_booking` and a
  reload-and-re-apply message. Fractional seconds are deliberate - a 1-second
  TIMESTAMP would let two saves in the same second share a token, exactly the
  fast double-save this catches. **Backwards compatible by design**: a client
  that sends no token (older cached bundle, an integration, the OTA-conversion
  path) keeps old last-write-wins behaviour rather than being hard-failed.
  Verified through the real HTTP endpoint: A's change survived, B's stale save
  was rejected, B's retry with a fresh token succeeded.
  - `updateGuestInDB()` now **throws with the backend's real message** instead
    of collapsing every failure into `false` - its only caller turned that into
    a generic "Failed to update booking", which would have hidden the one
    message that actually tells the user what to do.

**Corrected along the way** (an earlier claim in this same audit was wrong):
`add_guest` *does* have a server-side OTA-block check - it's wired end-to-end
to a real user-facing warning toast (`overlap_warning` → `api.ts` → `App.tsx`).
It is deliberately **advisory, not blocking**, because staff may already know a
block is stale (guest cancelled by phone, feed hasn't resynced). That's a sound
decision and was left alone rather than "fixed" into a hard block.

**Verified NOT a problem** (checked, already correct - don't re-investigate):
PHP session locking. `router.php` calls `session_write_close()` early, so
concurrent requests don't serialize behind each other; without it 10 users
would feel constant freezing.

## ✅ Resolved 29 Aug 2026 (found via investigation, no code change needed)

- **Telescope Error Center mobile polish** (all 5 items from the "narrowed 28
  Aug 2026" list). Checked the actual code before starting work on any of
  them - all 5 were already fully built, each with an inline comment
  literally citing "roadmap item N": (1) mobile stack-trace preview via a
  native `<details>/<summary>` (`index.php:961`, no JS needed for expand/
  collapse), (2) `telescope_auth.php`'s password field already has a working
  show/hide toggle with eye/eye-slash SVGs, (3) the search bar already has
  `autofocus` plus a working clear button (`searchClearBtn`/
  `clearSearchInput()`), (4) mobile-only quick-date chips
  (`#timeframeChips`, `setTimeframeChip()`) already exist and drive the same
  underlying `<select>` the desktop view uses, (5) `sw-telescope.js` already
  implements stale-while-revalidate shell caching (deliberately excluding
  any `action=` request, so live log data is never served stale) and is
  actually registered (`index.php:1178`). Nothing left to build - the
  "top priority" listing here was stale documentation, not real remaining
  work.

## ✅ Resolved 28 Aug 2026 (found via investigation, no code change needed)

- **Root Admin Dashboard scroll overlap** (originally reported 25 Aug 2026, "page title overlaps
  platform title on scroll"). Root-caused via git history: `PlatformPropertyManagement.tsx` used
  to render its own `sticky top-0 z-40` "Ground Code Platform / Administration Dashboard" banner
  (added before 13 Aug 2026, commit `4d9a12a`) with no `top` offset, stacking directly against
  `RootAdminDashboard.tsx`'s `sticky top-0 z-20` topbar (`RootAdminDashboard.tsx:591`) - both
  candidate theories were right at once (no offset between the two sticky elements, compounded by
  the banner's higher z-index painting over the topbar). That whole `<header>` block was deleted
  the very next day (26 Aug, commit `3358760`) as incidental cleanup in an unrelated Telegram
  feature commit, with no commit message connecting it to this bug - so by the time this was
  investigated, the banner no longer existed at all (confirmed: `PlatformPropertyManagement.tsx`
  has no banner today, and its old i18n strings `platform_title`/`admin_dashboard_subtitle` are
  now orphaned, referenced nowhere). Nothing to build. **If this banner is ever reintroduced**, give
  it `top-[calc(4rem+env(safe-area-inset-top,0px))]` (matching the topbar's own height) and a
  z-index ≤ 20, or the exact same overlap will come back.

## ✅ Shipped 29 Aug 2026 (verified via a second Claude Code session's audit)

- **OTA double-booking conflict detection + alerting** - fully built, not just partially done as an
  earlier same-day recheck first reported. Two halves, both real:
  - **Frontend**: `OperationalDashboard.tsx`'s alert computation (`conflictAlerts`) reimplements the
    overlap scan client-side (`s1 < e2 && e1 > s2`, half-open) directly against `blockedDates`/
    `guests` - no new API call needed, matching the existing unconverted-OTA-alert's own "compute
    from data already loaded for the calendar" pattern. Rendered in both the 5-row preview and the
    full "Booking Alerts" drawer (`combinedAlerts.slice(0,5)`/`combinedAlerts.map`), listed first
    (top severity) among alert kinds.
  - **Backend + Telegram**: `ical_sync.php`'s `getOTAConflicts()` (cross-OTA and OTA-vs-guest
    overlap queries) is called from inside the *existing* `check_unconverted_ota_bookings.php` cron
    (not a new file - a "Double-Booking Conflicts Check" section appended to it), reusing the same
    `ota_unconverted_notifications` dedupe table with a synthetic key so it inherits the identical
    24h-cooldown behavior with zero new schema. Verified live: ran the cron for real, it executed
    cleanly and correctly reported 0 conflicts against current real data (consistent with the 26 Aug
    finding that the only observed conflict was stale demo data).
  - One real SQL bug found and fixed in a *related* file during this audit (`availability.php`'s
    rate-rules query had an unparenthesized `OR ... AND` operator-precedence bug) - `ical_sync.php`'s
    own queries were checked for the same class of bug and are correctly parenthesized throughout.

## ✅ Verified 23 Aug 2026 (real browser session, Playwright, permitted this session)

Removed from the open list below per this file's own convention (shipped items are removed, see
git history) - kept here as a short record of what was actually exercised and what was found:

- **Room default tariff** - fully confirmed live on a real multi-key property (`luxe-stays`):
  selected Room 102 (tariff ₹5300) in Add Booking, Room Rent correctly pre-filled; switched to
  Room 105 (tariff ₹5100), Room Rent correctly updated to the new room's rate (not stuck on the
  first pick, confirming the earlier code-only fix holds up live).
- **Guest PII input validation** - confirmed both directions live on `jaipur`: a name with an
  apostrophe + accented character ("D'Souza Müller") plus a dash-formatted phone
  ("98765-43210") saved successfully end-to-end (`add_guest` → 200, guest visible correctly); a
  too-short phone ("12345") correctly got rejected with a clear 400 ("Phone number must be 7 to
  15 digits").
- **Two new real bugs found and fixed in the process** (not on the original checklist - surfaced
  only by actually driving the browser):
  1. **Phone input truncation with any separator character.** Every "10-digit mobile number"
     field site-wide (`GuestManagement.tsx` x2, `BookingDetailsModal.tsx`, `AccountSettings.tsx`,
     `ConvertOtaBookingModal.tsx`, `PropertyEditForm.tsx`, `PlatformPropertyManagement.tsx`,
     `StaffManagement.tsx` x3) paired a `maxLength={10}` HTML attribute with an onChange that
     strips non-digits then slices to 10 - but `maxLength` counts *raw* typed characters before
     that stripping runs, so a formatted number like "98765-43210" (11 raw chars) got truncated to
     10 raw chars first ("98765-4321") and only then digit-stripped, silently dropping the
     trailing digit ("987654321", 9 digits saved instead of 10). Reproduced live, fixed by
     removing the redundant/harmful `maxLength` at all 9 sites (the `.slice(0, 10)` in the
     onChange already caps to 10 real digits correctly on its own).
  2. **Phantom booking on a rejected Add Guest.** `handleAddGuest` (`App.tsx`) optimistically added
     the new guest to local state, then called `addGuestToDB()` - which silently swallowed ANY
     failure (thrown error or a real `{status:'error'}` rejection) into a bare `{id: null}`, no
     exception, no rollback. `GuestManagement.tsx`'s submit handler compounded this by calling
     `onAddGuest()` without awaiting it at all, then unconditionally showing "Guest booked
     successfully!" and resetting the form. Net effect, reproduced live: a booking that the
     backend genuinely rejected (invalid phone) still appeared as a fully real booking everywhere
     (Dashboard Alerts, calendar, Arrivals count) with a success toast, indistinguishable from one
     that actually saved - until the next page reload silently dropped it. Fixed the whole chain:
     `addGuestToDB()` now throws with the real backend message; `handleAddGuest()` is `async`,
     awaits it, and rolls back the optimistic state add on failure; `GuestManagement.tsx`'s submit
     now `await`s + shows the real error instead of a hardcoded success toast. Three other call
     sites that wrap `onAddGuest` in a modal-closing callback (`BillingCheckout.tsx`,
     `OperationalDashboard.tsx` x2) updated to match - two now `await` and only close on success,
     one (OTA-block conversion, which deliberately stays fire-and-forget to avoid an unrelated
     refetch race - see its own comment) got a `.catch()` so a real failure still reaches the user
     as a toast instead of vanishing silently. Re-tested live after the fix: the same rejected
     booking no longer appears anywhere, confirmed empty in the DB too.

---

## Still open (not covered above)

- ✅ **Staff "Access All Properties," real session walkthrough** - see the
  "Needs Manual Verification" entry above, confirmed 29 Aug 2026 (API-level;
  a literal browser click-through is still the one thing left, noted there).

---

*Last Updated: 2026-08-29*

