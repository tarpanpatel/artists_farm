# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## ðŸŸ¢ Open Items

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
  the full implementation); the remaining router actions are still
  unwired. Lower urgency - prepared statements already prevent SQL
  injection, so this is a data-integrity/UX gap, not a breach vector. A
  full pass across every action is a big audit; extend the pattern
  module by module.

### Needs Manual Verification

- **Guest PII input validation, real browser session.** The new
  `validateGuestPiiInput()` / `validateGuestIdOrRespond()` wiring in
  `php/guests/guests.php` (see Security section above) was unit-tested via a
  CLI harness (21/21 passing) but not exercised through the React app. Add a
  guest (all fields), edit a guest, and complete a check-in in a live
  session; watch the Network tab for unexpected 400s. Most likely to surface:
  the phone-normalisation (digits only) if any page sends an already-normal
  phone with dashes/spaces and the UI compares raw input to stored output.
- **Property-access gate, real browser session.** The new universal
  `isPropertyAccessAllowed()` check (see Security section above) was
  verified thoroughly via curl against every login type (root admin, tenant
  admin, staff, staff with no property/tenant) and the property-setup
  wizard's pre-auth path, all behaving as expected â€” but not yet exercised
  through the actual React app in a browser (no Playwright this session, per
  standing instruction). Do one full normal session end-to-end: log in as
  each role you actually use day-to-day and click through a few pages,
  watching the Network tab for any unexpected 401/403 on an action that used
  to work. Most likely-to-surface issue: a page that calls an action with a
  `property_slug` the logged-in session doesn't own (shouldn't happen in
  normal use, but worth confirming nothing in the frontend does this today).
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
- **Room default tariff, real browser session.** Verified via direct
  database checks and matching the exact queries the API uses (set a real
  room's/property's `default_tariff`, confirmed it round-trips correctly,
  reset it afterward) but never clicked through in the UI. For a multi-key
  property: open Rooms management, set a tariff on a room via the inline
  edit (pencil icon), confirm it saves and displays; open Add Booking,
  select that room, confirm the Room Rent field pre-fills with that tariff
  and is still editable; select a different room and confirm the rate
  updates to *that* room's tariff. For a single property: set a tariff via
  Edit Property, confirm it saves. Also worth confirming the field is
  correctly hidden on a MULTI_KEY *parent* property's own Edit Property
  form (only its rooms should show the field, not the parent itself).

---

*Last Updated: 2026-08-12 (morning)*

