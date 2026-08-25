# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## ðŸŸ¢ Open Items
---top priority starts---
:All buttons should be same tyled everywhere. For exampke edit button styling is different on different pages.

### Root Admin Dashboard: page title overlaps platform title on scroll (reported 25 Aug 2026)

On Root Admin pages (reported live on "Tenants & Properties"), scrolling
up causes the page's own sticky topbar ("Tenants & Properties" -
`RootAdminDashboard.tsx`'s `<header className="... sticky top-0 z-20 ...">`)
to visually overlap the "Ground Code Platform / Administration Dashboard"
banner that sits as the first element of that section's own scrollable
content (`PlatformPropertyManagement.tsx` - only file matching that text).
Not reproduced/diagnosed yet - two likely candidates worth checking first:
(a) a z-index conflict if PlatformPropertyManagement's banner has its own
sticky/fixed positioning competing with the topbar's `z-20`, or (b) the
classic sticky-stacking issue where two sequential sticky elements need an
explicit `top` offset on the second one (`top-[<first element's height>]`)
or they occupy the same scroll-pinned position. Same general family of bug
as this session's other safe-area/header fixes today, but a distinct root
cause - not yet investigated.

### 🔭 Mobile-First Telescope Error Center & Diagnostic Console

Complete mobile-first overhaul of the **Telescope Error Center** standalone PWA dashboard (`php/errors/index.php`), login screen (`php/errors/telescope_auth.php`), and push notification system (`php/errors/sw-telescope.js`) to provide an instant, smartphone-optimized debugging and error inspection console for resort developers and admins:

1. **Mobile-First Telescope Dashboard Layout (`php/errors/index.php`)**:
   - **Sticky Mobile Navigation & Portal Selector**: Implement a horizontal swipeable portal tab bar (`JS Browser`, `PHP`, `SQL`, `Requests`, `Security`, `404`, `Email`, `Telegram`) with unread error counters and smooth scroll snapping on mobile viewports (< 768px).
   - **Compact Header & Touch Actions**: Streamline the top header with touch-optimized 44px buttons for Live Polling toggle, Push Notifications, Reset Logs, and Back to App navigation.
   - **Mobile Card-Based Log Feed**: Replace multi-column desktop tables on mobile with high-density log cards displaying severity pills (`CRITICAL`, `ERROR`, `WARNING`, `INFO`), timestamp, origin tag, and expandable stack trace previews.
   - **Mobile Bottom Sheet for Log Details**: Replace modal dialogs on smartphone screens with a smooth slide-up bottom sheet (`detailModal`), featuring 1-tap "Copy Stack Trace" and "Copy Request Payload" buttons.

2. **Mobile Search & Date Filter Bar**:
   - Touch-friendly search bar with instant clear icon (`x`) and auto-focus for mobile keyboards.
   - Quick date timeframe chips (`Today`, `Yesterday`, `Last 7 Days`, `Custom`) with single-tap switching on mobile devices.

3. **Touch-Optimized Telescope Auth Gate (`php/errors/telescope_auth.php`)**:
   - Mobile-first login screen layout with responsive card scaling, auto-focused password input, show/hide password toggle, and clear touch targets.

4. **PWA Mobile Push & Offline Reliability (`sw-telescope.js` & `manifest.json`)**:
   - Mobile PWA installability with dark theme styling (`#0b0f19`), responsive viewport meta tags (`viewport-fit=cover`), and touch app icons.
   - Mobile lock-screen formatted Web Push notifications with 1-tap deep link to open the exact error entry in Telescope.

5. **Design System & Performance Compliance**:
   - Lightweight, dependency-free Tailwind styling matching Flowbite dark mode tokens (`#0f172a`, `#1f2937`, `rounded-lg`).
   - Touch-first hit areas (minimum 44px x 44px) across all buttons, selects, and inputs.

---top priority ends--- 

### Documentation: short file-purpose header comments

Every source file in `src/` and `php/` should carry a short (1-3 line)
comment at the top describing what it does - its role in the app, not a
restatement of the filename and not a changelog. Files that already have a
clear top-of-file summary comment should be left as is, not duplicated or
rewritten. Match whatever comment style is already used in that part of the
codebase (JSDoc-style `/** ... */` for `.tsx`/`.ts`, `/* ... */` for `.php`) -
comment-only, no logic/formatting/import changes. Handed off to `ai2` (22 Aug
2026) to run across the codebase; not yet verified done.

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
and archived; and staff "Access All Properties" (tenant-scoped
multi-property staff logins via a new property picker, replacing the old
single-property `LIMIT 1` lock). True de-duplication of the now-twice-fixed
login logic (`router.php` and `authenticate.php` still independently
carry the same code, which is exactly how one drifted unpatched from the
other) is worth doing, just bigger scope than any single pass so far.

What's still open:

- **General input-format validation** (`php/security/input_validator.php` -
  validateEmail/String/Float/Date/URL/Boolean/Slug/JSON). Guest PII first
  pass shipped 11 Aug 2026 (`php/guests/guests.php` - see git history for
  the full implementation). Second module wired 21 Aug 2026:
  `php/finance/petty_cash.php`'s `add_petty_cash`/`update_petty_cash`
  (`validatePettyCashInput()`, same first-pass/merge-over-`$input` pattern) -
  rejects negative/non-numeric amounts, malformed dates, overlong
  category/description/vendor text; verified live via curl (valid entry
  succeeds, each invalid case 400s with a clear message) and confirmed the
  validation runs *before* `reverseFinancialSource()` on updates, so a
  rejected correction can't leave the ledger half-reversed with nothing to
  replace it. Also fixed `InputValidator::validateString()` itself along
  the way (see Guest PII entry below) - byte-length vs character-length,
  affects every module using it, not just guests. Remaining router actions
  (staff, licenses, receipts, walk-in tabs, inventory, ...) are still
  unwired. Lower urgency - prepared statements already prevent SQL
  injection, so this is a data-integrity/UX gap, not a breach vector. A
  full pass across every action is a big audit; extend the pattern
  module by module.

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
- **Telegram delivery on booking edits.** `update_guest` now diffs the
  pre-update row and pings the property's Admin Telegram channel with the
  changed fields (see `php/guests/guests.php`) - verified the diff logic
  runs cleanly and doesn't break the save (edited/reverted a live guest name
  with no errors), but actual message delivery to Telegram wasn't confirmed
  from this session (no visibility into the bot/chat from here). Same open
  question for the pre-existing new-booking notification this pattern was
  copied from. Check the property's actual Admin Telegram chat after an
  edit to confirm the message arrives and reads correctly.
- **Telegram photo relay (guest ID documents + expense invoices).** Both
  flows send the actual photo, not just a text notification (see git
  history, 10 Aug 2026) - traced end-to-end but never live-tested, since
  that would post a real message to the property's actual Telegram chat.
  Upload an ID document and an expense invoice for a live property and
  confirm the photo (not just text) lands in the right chat.
- **Staff "Access All Properties," real browser session.** Verified at the
  API/curl level (see Security section above) but not clicked through in a
  browser. Check the toggle on the Create/Update Staff forms, log in as a
  flagged staff account, confirm the property picker shows every property
  under the tenant and none from other tenants, pick one and confirm it
  lands in that property's dashboard already logged in (no second login
  prompt), then navigate directly to a different property in the same
  tenant's URL and confirm that also just works without re-authenticating.

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

- **Staff "Access All Properties," real browser session.** Verified at the
  API/curl level (see Security section above) but not clicked through in a
  browser. Check the toggle on the Create/Update Staff forms, log in as a
  flagged staff account, confirm the property picker shows every property
  under the tenant and none from other tenants, pick one and confirm it
  lands in that property's dashboard already logged in (no second login
  prompt), then navigate directly to a different property in the same
  tenant's URL and confirm that also just works without re-authenticating.

---

*Last Updated: 2026-08-23*

