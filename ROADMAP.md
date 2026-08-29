# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

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
  exercised through the real browser app 23 Aug 2026 (Playwright, permitted
  this session): logged in as Root Admin, Staff Kitchen, and Staff
  Supervisor across two different properties, clicked through Dashboard/
  Bookings/Kitchen/Team pages for each - no unexpected 401/403 on any action
  that should have worked for that role. Not yet an exhaustive dedicated
  pass through every page/action combination, so leaving this open rather
  than marking it fully done.
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
- **Property-access gate, real browser click-through** - the curl/API-level
  verification above (this item and the two Telegram items) is now
  confirmed solid, including a fresh cross-tenant denial re-test 29 Aug 2026.
  What's still not done is an actual browser session (no Playwright/browser
  tool was available in the session that did the 29 Aug 2026 pass) -
  see 23 Aug 2026's partial Playwright pass below for the last time a real
  browser was used. If a future session has browser tooling available, a
  dedicated click-through (not just spot checks) would close this out fully.

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

