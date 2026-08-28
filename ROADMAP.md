# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## ðŸŸ¢ Open Items
---top priority starts---

### Button styling inconsistency across pages (confirmed 28 Aug 2026 via code audit)

Real and widespread, not a one-off - checked ~10 "Edit" action call sites across
`StaffManagement.tsx`, `InventoryManagement.tsx`, `LicenseManagement.tsx`, `MenuManager.tsx`,
`ExpenseItemsManagement.tsx`, `DefaultBillsManager.tsx`, `SystemStockManager.tsx`,
`PettyCashManagement.tsx`, `PlatformPropertyManagement.tsx`. What actually varies (icon *shape*
is NOT the problem - `Pencil`/`Edit2` are aliases for the same icon):
- **Variant choice is inconsistent for the identical action**, sometimes within the same file -
  e.g. `StaffManagement.tsx:997` uses `Button variant="primary"` for Edit, `:1114` uses
  `variant="secondary"` plus a hardcoded `text-blue-600` override, for the same edit action.
- **Many call sites bypass the shared `Button` component entirely** - raw `<button>`s with
  hand-rolled Tailwind colors instead of design tokens (`DefaultBillsManager.tsx:296`,
  `SystemStockManager.tsx:409`, `PettyCashManagement.tsx:2216`'s sky-colored pill,
  `InventoryManagement.tsx:1687`, `StaffManagement.tsx:1723`'s mobile card).
- **Icon size drifts** between `w-3`, `w-3.5`, and `w-4` for what should be the same-size icon.
- **Text+icon vs. icon-only** varies with no clear rule (e.g. `PlatformPropertyManagement.tsx:1043`
  has a label, `:2169` is icon-only for the same action elsewhere in the file).

Not yet fixed - fixing this properly means picking ONE canonical Edit-button pattern (variant,
icon, size) and sweeping every call site above onto it, including migrating the raw-`<button>`
sites onto the shared `Button` component. A real but mechanical multi-file sweep, not a design
decision.

### 🔭 Telescope Error Center mobile polish (narrowed 28 Aug 2026 - most of this already shipped)

This item used to describe a full ground-up mobile overhaul as "not started." A code audit
28 Aug 2026 found dated comments (24-27 Aug 2026) showing most of it already landed: sticky
swipeable portal tabs with unread-count badges and scroll-snap (`index.php:270-282`), a 44px
touch-target header for Live Polling/Push/Reset/Back (`index.php:245-258`), and a mobile bottom
sheet for log details with "Copy Stack Trace"/"Copy Full Payload" buttons (`index.php:313-324`,
`1029-1067`). PWA push (`sw-telescope.js`) formats notifications with a 1-tap deep link, and
`manifest.json`/`index.php` already set the dark theme tokens and `viewport-fit=cover`.

**What's actually still left**, precisely:
1. Mobile log cards have no expandable stack-trace preview inline - the trace only appears after
   opening the bottom sheet, not as a quick expand on the card itself.
2. Telescope login screen (`telescope_auth.php`) has no show/hide password toggle anywhere in the
   file, and its submit button/input aren't confirmed at the 44px touch-target size the main
   dashboard already has.
3. The search bar (`index.php:500`) has no clear ("×") icon and no `autofocus`.
4. Date filtering is a `<select>` dropdown (`index.php:376-381`), not the described one-tap
   quick-date chips (Today/Yesterday/Last 7 Days/Custom) - functionally equivalent, just not the
   touch-chip UI originally asked for.
5. `sw-telescope.js` handles push notifications but has **no `fetch` listener or cache strategy at
   all** - there is no offline fallback, only push handling.
6. Tailwind is loaded via the `cdn.tailwindcss.com` runtime script, not a prebuilt bundle - the
   opposite of the "lightweight" goal this item originally asked for; the code has its own comment
   (`index.php:216-239`) acknowledging the `!important` specificity fights this causes.

---top priority ends--- 

### Tab/count numbers should render as a real badge, not plain "(N)" text (reported 28 Aug 2026, screenshot-driven: "Live Tickets (2)", Bookings' "Past (1)")

Site-wide, not a single-file fix - a tab label with a trailing count currently renders as plain
parenthetical text glued onto the label string (e.g. `` `${label}${count > 0 ? ` (${count})` : ''}` ``,
see `KitchenManagement.tsx:1414`'s Live Tickets tab and the equivalent pattern in `GuestManagement.tsx`'s
Today/Upcoming/Past booking tabs), instead of a visually distinct badge (pill/circle) next to the
label. A broad grep for this same `${...}${count > 0 ? \` (${count})\` : ''}`-shaped pattern turned up
16 files with the same construction (`TodayOverview.tsx`, `TelegramNotificationModal.tsx`,
`OperationalDashboard.tsx`, `App.tsx`, `ServiceRequestsManagement.tsx`, `PettyCashManagement.tsx`,
`InventoryManagement.tsx`, `BookingDetailsModal.tsx`, `BillingCheckout.tsx`, `CashDrawerManager.tsx`,
`KitchenManagement.tsx`, `GuestManagement.tsx`, `ICalSyncManager.tsx`, `LicenseManagement.tsx`,
`StaffContext.tsx`, `AIChatWidget.tsx`) - re-grep when this is picked up rather than trusting this list
to still be complete/accurate by then.

**Not blocked by Flowbite** (checked `node_modules/flowbite-react/dist/components/Tabs/TabItem.d.ts`):
`TabItem`'s `title` prop is typed `ReactNode`, not `string` - so a real badge element can be composed
directly into it (`title={<span className="flex items-center gap-1.5">{label}<span className="...badge
pill...">{count}</span></span>}`) rather than needing a workaround. Telescope's error console
(`php/errors/index.php`) already has its own unread-count badge convention on its portal tabs
(mentioned elsewhere in this file) - worth checking whether that visual style is the one to reuse here
for consistency, or whether DESIGN.md should get a new documented "count badge" token pair instead of
this sweep inventing its own.

Not yet started - explicitly deferred, only tracked here per request ("don't do now, put it into
todo").

### OTA double-booking conflicts are never detected or alerted (found 26 Aug 2026)

**The gap**: `php/api/ical_sync.php` contains zero overlap/conflict logic. Two OTA feeds can both
hold the same room on the same night and the app renders them as two silently stacked bars on the
multi-room calendar - visually easy to mistake for a layout quirk rather than what it actually is:
a guest who will arrive to an already-occupied room.

**Why this can't be fixed the same way staff bookings are.** `add_guest`/`update_guest` hard-block
overlaps with a 409 (verified working 26 Aug 2026 - see CLAUDE.md's strict rule), because those
are stays *this app* is creating. An Airbnb hold overlapping a Booking.com hold is different: both
were already sold on someone else's platform before the sync ever ran. Refusing to store the
second one would only hide a real double-booking that has already happened. So the requirement is
**detect + alert loudly**, never suppress.

**Suggested shape** (not yet built): a cross-feed overlap scan per room (half-open comparison -
`a.start < b.end && a.end > b.start`, so same-day turnover is correctly NOT a conflict), surfaced
as a top-severity row in `OperationalDashboard.tsx`'s "System Alerts" panel alongside the existing
unconverted-OTA alerts, plus a Telegram admin alert on the daily cron (same per-property routing
convention as `check_unconverted_ota_bookings.php`). Treat as higher severity than an unconverted
block - this one has a hard arrival date attached to it.

**Note on the sighting that surfaced this** (26 Aug 2026): the live example on `luxe-stays`
(Room 101, Airbnb 3-6 Sep vs Booking.com 5-7 Sep, both holding 5 Sep) turned out to be **stale
demo data**, not a live generator bug - those demo configs were seeded 15 Aug 2026 12:13, while
`demo_data.php`'s cross-feed overlap fix (sharing `$placedRanges` across both feeds of a room)
landed 17 and 20 Aug. The generator is correct now; regenerating demo data clears it. The missing
detection above is the real, still-open finding - it applies to genuine non-demo feeds too.

### Feature: Shareable availability & rates page + Pricing Mode on the calendars (requested 25 Aug
2026, decisions settled + design locked 28 Aug 2026 - not yet built)

**The use case**: a staff member is talking to a prospective customer who asks "which rooms are
free, and what's the price?" Rather than typing it out room by room, they share one link. Must work
for both a SINGLE property (one calendar) and a MULTI_KEY property (a "multicalendar" - rooms as
rows, days as columns).

**The 3 decisions this was originally blocked on (25 Aug 2026) are now settled** (28 Aug 2026):

1. **Rates**: adds a real date-range rate-rule layer (`room_rate_rules` table) alongside the
   existing flat `default_tariff`, behind a per-property `pricing_mode` ('flat'/'variable') toggle
   - one toggle per property (not per room); each room keeps independent prices either way.
2. **Delivery**: not a PNG at all anymore - a **live public webpage** (`availability.php`, no
   login, same pattern as the existing "Share Menu" `food_menu.php`), reached via a shareable link
   that always reflects current DB state. This sidesteps the wa.me-can't-attach-an-image problem
   entirely - it's a link, not a file.
3. **Layout**: calendar grid, confirmed - rooms-as-rows/days-as-columns for MULTI_KEY, single
   calendar for SINGLE. One month at a time with Prev/Next, not a multi-month view (a rooms × days
   grid is already wide).

**New this round**: bulk price editing happens **directly on the existing Booking Calendars**
(`TodayOverview.tsx` / `OperationalDashboard.tsx`) via a new "Bookings / Pricing" view toggle -
not a separate settings screen. Date-range selection on the calendar reuses this app's own
flowbite-datepicker range-select convention (click start day, then end day - same as
`DateRangePicker.tsx`'s existing pattern); locking in a range opens a centered Modal to set the
nightly rate + optional label, with a room checklist ("Also apply to: [ ] Room 102 ...") so one
Save can bulk-apply the same range+rate across multiple rooms at once. `OperationalDashboard.tsx`
is a protected component (see CLAUDE.md) - extending it here is explicitly authorized, scoped to
an additive toggle + new render branch only, with the existing Booking Calendar Row logic
untouched.

**Non-negotiable constraint, unchanged**: the public page shows only *available / not available* +
price - never guest names, booking sources, phone numbers, or anything else that leaks one guest's
data to a prospective customer. Enforced structurally (the SQL never selects that data at all), not
just visually.

**Full architecture** (data model, API actions, exact UI flow, file list, verification plan) is
written up in a Claude Code plan file from the 28 Aug 2026 session - re-derive from this summary
plus a fresh look at `food_menu.php` (the pattern to mirror), `php/licenses/licenses.php` (the
self-healing-module pattern to mirror), and `TodayOverview.tsx`/`OperationalDashboard.tsx` (where
the Pricing view toggle goes) when this is picked up.

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

*Last Updated: 2026-08-28*

