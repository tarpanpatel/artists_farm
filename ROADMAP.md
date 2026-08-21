# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## ðŸŸ¢ Open Items
---top priority starts---
:All buttons should be same tyled everywhere. For exampke edit button styling is different on different pages.

---top priority ends--- 

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

- **Guest PII input validation, real browser session.** Re-tested 21 Aug
  2026 via curl against the live `add_guest` endpoint (not just the CLI
  harness): confirmed invalid input is correctly rejected (bad phone, bad
  date, out-of-range guest count, negative money, overlong name) and
  legitimate input isn't wrongly blocked (apostrophes, formatted phone
  numbers with spaces/dashes/+, accented names, datetime-string check-in
  values). Found and fixed a real bug in the process:
  `InputValidator::validateString()` measured length with `strlen()`
  (bytes), not characters, so any multi-byte name - Hindi, French accents,
  anything outside plain ASCII - could get wrongly rejected as "too long"
  well under its actual character count (a 63-character Devanagari name is
  169 UTF-8 bytes, over the 120 limit meant for 120 *characters*). Fixed to
  `mb_strlen`; verified via clean file-based UTF-8 payloads after an early
  false alarm turned out to be the test's own shell mangling the input, not
  the app. Still not exercised through the React app in a browser (no
  Playwright this session). Add a guest (all fields), edit a guest, and
  complete a check-in in a live session; watch the Network tab for
  unexpected 400s. Most likely to surface: the phone-normalisation (digits
  only) if any page sends an already-normal phone with dashes/spaces and the
  UI compares raw input to stored output.
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
  fires for a raw/manual API call, never the actual frontend. Still not
  exercised through the actual React app in a browser (no Playwright this
  session either, per standing instruction) - the below is unchanged:  Do
  one full normal session end-to-end: log in as each role you actually use
  day-to-day and click through a few pages, watching the Network tab for any
  unexpected 401/403 on an action that used to work. Most likely-to-surface
  issue: a page that calls an action with a `property_slug` the logged-in
  session doesn't own (shouldn't happen in normal use, but worth confirming
  nothing in the frontend does this today).
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
- **Room default tariff, real browser session.** Re-tested 21 Aug 2026, this
  time through the actual `action=update_room_tariff` HTTP endpoint (not
  just matching the underlying SQL against the DB directly, which is what
  the earlier "verified" pass above actually did) - and that distinction
  mattered: found `update_room_tariff` was fully implemented in
  `multikey_properties.php` and called by `RoomsManagement.tsx`'s inline
  editor, but **missing from `router.php`'s dispatch switch entirely**, so
  every real save silently fell through to a generic status response and
  did nothing. A DB-level check that only replicates the target SQL can
  never catch a dispatch-layer bug like this - it never goes near the actual
  routing. Fixed (case added) and verified live (set → confirmed in DB →
  reverted). Also found and fixed a second, real bug while tracing the Add
  Booking pre-fill: `GuestManagement.tsx`'s `handleRoomChange()` only
  auto-filled the Room Rent field from a room's `default_tariff` when the
  field was still exactly `0`, so it worked for whichever room got picked
  *first* but never updated again when switching to a different room
  (stale previous room's rate stayed). Fixed by tracking whether the staff
  member actually typed a value, instead of inferring it from the field
  being non-zero. Single-property tariff (`update_property`) and the
  field being hidden on a MULTI_KEY parent's own Edit Property form both
  reconfirmed working correctly. **Still not clicked through in the UI**
  (no Playwright this session) - the pre-fill fix in particular was fixed
  by code tracing only, not empirically re-run in a browser. For a
  multi-key property: open Rooms management, set a tariff on a room via
  the inline edit (pencil icon), confirm it saves and displays; open Add
  Booking, select that room, confirm the Room Rent field pre-fills with
  that tariff and is still editable; select a different room and confirm
  the rate updates to *that* room's tariff, not the first one picked.

---

*Last Updated: 2026-08-12 (morning)*

