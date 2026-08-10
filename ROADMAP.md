# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Design consistency sweep — see DESIGN_CONSISTENCY_SWEEP.md

Full plan (conventions, grep-based discovery commands, known instances with
exact file:line) is in `DESIGN_CONSISTENCY_SWEEP.md` at the project root -
written as a standalone handoff doc, not duplicated here. Builds on
`CSS_THEMING_PLAN.md` (done - token infrastructure works correctly,
verified). Covers: button colors not matching their semantic role, the
random per-page card/section accent-color pattern (decided: drop it
entirely), a `font-mono` inconsistency affecting 113 instances across 21
files (same kind of element - e.g. a currency total - rendering in
different fonts depending which page you're on), emoji standing in for
Lucide icons, and a couple of remaining raw form elements.

### Tailwind animations — later, first concrete target identified

Noted for a future pass (11 Aug 2026, refined same day with a first real
target): consistent `animate-spin`-based loading/processing state for
every async action, using Tailwind's built-in animation utilities
(`animate-spin`/`animate-ping`/`animate-pulse`/`animate-bounce` - all
present unchanged in this app's Tailwind v4, same utilities the v1.x docs
show). Checked current state so this isn't starting from zero when
picked up: `animate-spin` is already used in 28 files, and there *is* a
dominant pattern (Lucide's `Loader2` icon + `animate-spin`, used
consistently in 8 of those) - but the other ~20 files spin something
else (a different icon, most likely), so it's not fully unified yet.
Revisit after the design consistency sweep above lands rather than in
parallel with it - same "stay inside Tailwind classes, no inline styles"
guardrail applies here too.

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
  validateEmail/String/Float/Date/URL/Boolean/Slug/JSON). Guest PII first
  pass shipped on 2026-08-11 (full details below); the remaining router
  actions are still unwired. Lower urgency than the staff-property item
  above — prepared statements already prevent SQL injection, so this is a
  data-integrity/UX gap, not a breach vector. A full pass across every
  action is a big audit; extend the pattern below module by module.

  **Shipped: guest PII first pass** — all edits in `php/guests/guests.php`:

  - Added `require_once __DIR__ . '/../security/input_validator.php';` next
    to the existing `schema_cache.php` require.
  - New helper `validateGuestPiiInput(array $input): array` — validates only
    the keys *present* in the payload and returns trimmed/normalised copies
    so callers merge the result over `$input` (`$input = array_merge($input,
    validateGuestPiiInput($input));`). Rules:
    - `guest_name`/`name` → `validateString(1..120)`; throws on blank.
    - `phone_number`/`contact` → `preg_replace('/\D/','')`, 7–15 digits
      required else throws; normalised digit string is what gets stored
      (`+91 98765-43210` → `919876543210`).
    - `checkin_date`/`expected_checkout` → accepts `Y-m-d` **or**
      `Y-m-d H:i:s` (time part is stripped with `explode(' ', $value)[0]`
      before running `validateDate('Y-m-d')`); original string preserved.
    - `no_of_guests` → `validateInteger(1..100)`.
    - `base_room_rent`/`advance_paid`/`total_charge`/`pending_amount` →
      `validateFloat(min 0)`.
    - `notes` (≤2000), `booking_source`/`advance_received_by`/
      `pending_received_by` (≤255) → `validateString` only when non-blank.
    - `is_foreign_guest` → `validateBoolean()` then coerced to int 0/1
      (`'yes'`/`'no'` rejected, only true/false/1/0/'1'/'0'/'' accepted).
    - Absent/empty/`null` fields are left untouched (no throw, no key added)
      so the pre-existing `?? default` fallbacks in add/update keep working.
    - Unknown keys in the payload are deliberately ignored (not validated).
  - New helper `validateGuestIdOrRespond($value, $fieldName = 'id')` →
    returns the validated positive integer, or emits HTTP 400
    `{'status':'error','message':'<field> is required | must be a positive
    integer'}` and returns `null`; every caller does `if ($guestId ===
    null) break;`.
  - Wired into `add_guest` and `update_guest` (PII validated first; also
    `$guestId = validateGuestIdOrRespond($input['id'] ?? null);` replacing
    the bare `$input['id']` read), plus `delete_guest`, `checkout_guest`,
    `checkin_guest`, `mark_c_form_filed`, `get_id_documents` (reads
    `$_GET['guest_id']`), `upload_id_document` (`guest_id` + `guest_index`
    via `validateInteger(1..100)`, wrapped in its own try/catch → 400),
    `delete_id_document`, `complete_checkin_verification` (`guest_id`).
  - `add_guest`/`update_guest` now guard `$input` with
    `if (!is_array($input)) $input = [];` before validation (malformed JSON
    body no longer causes warnings).
  - Invalid PII in add/update now returns HTTP 400 (not 500) with the
    validator's message; previously bad rows were written silently (any
    string into `no_of_guests`, arbitrary date formats, non-digit phone).
  - **Verification:** `& "C:\xampp\php\php.exe" -l php/guests/guests.php` →
    "No syntax errors detected". A throwaway CLI harness including
    `guests.php` ran 21 assertions, all passing (normalisation of a valid
    payload incl. phone `+91 98765-43210`→`919876543210`, `Y-m-d H:i:s`
    dates, multi-line notes; rejections for short phone, `11/08/2026` date,
    `no_of_guests` 0 and `abc`, negative amount, blank name, boolean `'yes'`;
    id helper accepting `'42'` and rejecting `'0'`/missing/`'abc'`; absent
    fields untouched, empty payload ok). Harness was deleted afterwards.
  - **Not yet browser-tested** (no live session available): add a guest,
    edit a guest, and complete a check-in from the real React app and
    confirm success with no stray 400s in the Network tab.
  - **Debug tips:** helpers live at the top of `php/guests/guests.php`,
    just below the `schema_cache.php`/`input_validator.php` requires. If a
    stored phone looks different from what staff entered, that's the
    normalised digit form by design. Date handling keeps the original
    string (incl. any time part) so the datetime check-in/check-out values
    the DB already stores still round-trip.
- **Default-admin bootstrap fallback** (`admin`/`root`/`9999999999`/any
  identifier containing `vrikshawan`, with passcode `123456` or `admin`) —
  deliberately left untouched. Unlike the removed bypass, this one is scoped
  to specific identifiers only, but it's still a hardcoded backdoor with no
  expiry. Worth a decision on whether/how to replace it with a real
  initial-setup credential, separately from everything above.

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

*Last Updated: 2026-08-11*
