# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Google Drive photo archival — descoped, not started

Guest ID documents and expense invoice photos now relay to Telegram (see
git history, 10 Aug 2026); Google Drive archival on top of that was
explicitly descoped for now - no Drive integration exists in this
codebase. If picked up later, needs a Google Cloud service account + Drive
API credentials, a small PHP wrapper (folder-exists-or-create, then file
upload), and a shared path-building helper so both upload flows produce
the same structure:

```
{tenant_name}/{property_name}/{category}/{Month YYYY}/{descriptive_name}_{DD-MM-YYYY}_{HHMM}hrs.{ext}
```

Worked example (₹3000 diesel expense logged 12 July 2026, 2:00 PM):
```
Vrikshawan/Goa Homes/Expenses/July 2026/Diesel_12-07-2026_1400hrs.jpg
```
Guest ID documents would follow the same pattern under an `ID Documents`
category, e.g. `Vrikshawan/Goa Homes/ID Documents/July 2026/PriyaSharma_12-07-2026_1400hrs.jpg`.

Every relevant page already has its own datalog (expense date/category,
guest name/room, upload timestamp) to derive this path from - no new
fields needed, just wiring the existing values through, whenever this
gets picked back up.

### Security: open follow-ups from the 11 Aug 2026 auth audit

The critical items from that audit are fixed and shipped (see git history:
cross-tenant property-access gate, removed `123456` universal login
bypass, rate limiter on login). What's left, none of it fixed yet:

- **Login identifier wildcard bug.** `login_user` cleans the identifier to
  digits-only for phone matching; a non-numeric identifier (e.g. a username
  with no digits) collapses to an empty string, and the fallback
  `phone_number LIKE '%' . $mobileNumber` becomes `LIKE '%'` — matching *any*
  row with a non-null phone number instead of failing to match. Affects both
  the `users` and `staff_users` login queries. Not exploitable for
  passcode-free entry (the matched row's real passcode still has to match),
  but it means a username-style login attempt can land on an arbitrary
  unrelated account if that account's real passcode happens to guessed.
  Needs a proper fix (skip the phone LIKE clause entirely when the cleaned
  digit string is empty), not a drive-by one.
- **`resolveCallerTenantIds()` id-collision risk.** This existing helper
  (used by `isTenantAccessAllowed()`, unrelated to the new property gate
  above) joins `staff_users.id = session.user_id` regardless of whether the
  session actually authenticated via the `staff_users` table. `users.id` and
  `staff_users.id` are independent sequences that can collide (confirmed in
  this DB). The new `isPropertyAccessAllowed()` deliberately avoids this
  helper for that reason; `isTenantAccessAllowed()`'s other call sites still
  use it as-is and weren't audited for real-world impact.
- **Staff with multiple property assignments.** Some staff accounts have
  multiple `staff_users` rows (same person, one row per assigned property).
  Login only reads one row (`LIMIT 1`, no explicit order), so a multi-property
  staff member's session now gets locked to whichever single property that
  query happens to return — the other properties they're assigned to become
  unreachable for that session. Pre-existing limitation, just newly
  *enforced* (and therefore visible) now that property access is actually
  checked. Needs a real fix to the staff-property data model, not a config
  tweak.
- **`php/api/authenticate.php`** — a separate legacy endpoint still called by
  `LoginModal.tsx` (a secondary/session-timeout login modal, not the main
  `LoginPage.tsx` flow). Not covered by any of the above since it's a
  different file entirely from `router.php`'s action dispatch — not audited.
- **CSRF still unwired**, and it's a bigger lift than it looked: 61 raw
  `fetch()` calls across ~22 files (including the login screens themselves)
  bypass `src/services/api.ts`'s single `apiFetch()` chokepoint, so a
  token-header scheme needs either that refactor or a different mechanism
  (Origin/Referer allow-list check server-side, zero frontend changes).
  Recommended: the Origin/Referer approach, given the call-site fragmentation.
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

### Orphaned tenant-onboarding / property-approval subsystem — finish or remove

`php/modules/onboarding_workflow.php` (requestTenantOnboarding/
approveTenantOnboarding/rejectTenantOnboarding/getPendingOnboardingRequests)
and `php/modules/property_manager.php` (getAllProperties/getPropertyDetails/
getPendingPropertyRequests/approvePropertyRequest/rejectPropertyRequest/
deactivateProperty/requestPropertyModification/getPropertyRequestHistory)
are never `require`'d by `router.php` or anything else - fully unreachable
from the live app. Both were added in a single commit each on 31 Jul 2026
as part of the 6-digit passcode auth work and haven't been touched since,
while several unrelated features shipped in between - reads as parked
mid-stream rather than active WIP. Needs a decision: finish wiring the
approval workflow in, or delete both files if the feature's been
superseded/deprioritized.

### Remaining unused-code cleanup (lower priority)

The dead-code audit (10 Aug 2026) also flagged 173 unused local variables/
parameters/destructured props across `src/` (as opposed to the unused
*imports*, which are already cleaned up - and `isDarkMode`/`onToggleDarkMode`
in `Header.tsx`, removed 10 Aug 2026 along with the whole dark-mode toggle
feature). These need a per-file look rather than a bulk pass, because a
couple are props received but never used inside the component body - which
can mean either harmless leftover from a refactor or a real wiring bug.
Checked `onLogout` in `Header.tsx` - logout itself works fine (handled by
`TenantDashboard.tsx`/`RootAdminDashboard.tsx`/`PlatformPropertyManagement.tsx`,
which each call their own `onLogout()`), so Header's copy is just a
vestigial prop, not a bug. Safe to remove whenever the rest of this bucket
gets cleaned up.

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
