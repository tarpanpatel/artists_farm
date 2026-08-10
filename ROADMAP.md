# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Security: open follow-ups from the 11 Aug 2026 auth audit

Fixed and shipped, see git history for details on each: cross-tenant
property-access gate; removed the `123456` universal login bypass;
rate limiter on login; `ical_sync.php`'s missing auth check; the login
identifier wildcard bug (fixed in both `router.php` and its unpatched
duplicate `authenticate.php`, which also got a rate limiter sharing
`router.php`'s bucket); CSRF protection via an Origin/Referer allow-list;
`resolveCallerTenantIds()`'s id-collision risk, plus a property-gate
regression that fix surfaced (tenant admins briefly couldn't list their
own tenant's properties). True de-duplication of the now-twice-fixed
login logic (`router.php` and `authenticate.php` still independently
carry the same code, which is exactly how one drifted unpatched from the
other) is worth doing, just bigger scope than any single pass so far.

What's still open:

- **Staff with multiple property assignments.** Some staff accounts have
  multiple `staff_users` rows (same person, one row per assigned property).
  Login only reads one row (`LIMIT 1`, no explicit order), so a multi-property
  staff member's session now gets locked to whichever single property that
  query happens to return — the other properties they're assigned to become
  unreachable for that session. Pre-existing limitation, just newly
  *enforced* (and therefore visible) now that property access is actually
  checked. Needs a real fix to the staff-property data model, not a config
  tweak.
- **General input-format validation** (`php/security/input_validator.php` -
  validateEmail/String/Float/Date/URL/Boolean/Slug/JSON) still unwired
  across ~166 router actions. Lower urgency than the above — prepared
  statements already prevent SQL injection, so this is a data-integrity/UX
  gap, not a breach vector. A full pass across every action is a big audit;
  worth scoping down to a first pass (e.g. guest PII fields) rather than
  doing all 166 at once.
- **Default-admin bootstrap fallback** (`admin`/`root`/`9999999999`/any
  identifier containing `vrikshawan`, with passcode `123456` or `admin`) —
  deliberately left untouched. Unlike the removed bypass, this one is scoped
  to specific identifiers only, but it's still a hardcoded backdoor with no
  expiry. Worth a decision on whether/how to replace it with a real
  initial-setup credential, separately from everything above.

### Needs Manual Verification

- **Property-access gate, real browser session.** The new universal
  `isPropertyAccessAllowed()` check (see Security section above) was
  verified thoroughly via curl against every login type (root admin, tenant
  admin, staff, staff with no property/tenant) and the property-setup
  wizard's pre-auth path, all behaving as expected — but not yet exercised
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

---

*Last Updated: August 2026*
