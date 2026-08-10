# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Store uploaded images in per-tenant/per-property folders, not one shared pool

Corrected finding (11 Aug 2026 - an earlier version of this note wrongly
claimed menu/catalog images aren't optimized before storage; checked the
actual backend and they are): `php/uploads/upload_image.php` already
resizes/crops/compresses server-side regardless of what the frontend
sends - menu photos center-crop to 400x300, catalog/kitchen-stock photos
to 300x100, both re-encoded as JPEG at quality 85; ID documents downscale
(never crop) to a 1600px max dimension plus get a separate 300px
thumbnail. That part is already done and doesn't need touching.

What's actually missing: storage is completely flat and **not scoped to
tenant/property at all**. Every property's menu photos land in the same
shared `php/uploads/images/menu/` folder (same for `catalog/` and
`id_documents/`), distinguished only by a random 24-hex-char filename -
no isolation, no way to see or clean up one tenant's images separately
from another's.

Requested structure: `{tenant_slug}/{property_slug}/{category}/{filename}`,
e.g. `vrikshawan/goa-homes/food_menu/image-x.jpg` for a menu photo,
`vrikshawan/goa-homes/kitchen_stock/image-x.jpg` for a catalog item,
`vrikshawan/goa-homes/id_documents/image-x.jpg` for a guest ID - same
rule applied per category, just a different subfolder name for each.

Implementation notes for whoever picks this up: `upload_image.php`
currently takes only `image` + `folder` (menu/catalog/misc/id_documents)
in the POST body, no property/tenant context at all, and doesn't
`require` `database.php` or start a session - it would need to resolve
`tenant_slug`/`property_slug` (either via `property_resolver.php`'s
existing pattern, same as `router.php`/`ical_sync.php`, or explicit slug
fields the frontend already has via `getPropertyAndRoomSlugs()`) and
build `$uploadDir` from that instead of the current flat
`__DIR__ . '/images/' . $folder`. Existing already-uploaded images stay
wherever they are unless a one-off migration script moves them - not
required for new uploads to start using the new structure.

### Security: open follow-ups from the 11 Aug 2026 auth audit

The critical items from that audit are fixed and shipped (see git history:
cross-tenant property-access gate, removed `123456` universal login
bypass, rate limiter on login, `ical_sync.php`'s missing auth check -
found while checking on the iCal Sync feature separately the same day,
same fix shape extracted into `php/security/access_control.php` so both
files share it instead of router.php-only; swept for other standalone
endpoints with the same gap via `grep -rn "getCurrentPropertyId($pdo)"`,
none found. Also fixed: the login identifier wildcard bug - a non-numeric
identifier collapsed `$mobileNumber` to an empty string, and the fallback
`phone_number LIKE '%' . $mobileNumber` became `LIKE '%'`, matching *any*
row with a non-null phone number. Both the `users` and `staff_users`
login queries now skip the phone-matching clause entirely when there's no
actual digit string to match against, falling back to exact `username =`
only. Curl-verified: a nonexistent non-numeric identifier tried against
two different real accounts' real passcodes now correctly fails on both;
real username login, real phone-number login, and the default-admin
bootstrap fallback all still work unchanged. Also fixed: CSRF protection,
via an Origin/Referer allow-list check in `php/config/database.php`
(reuses the same `$allowed_origins` the existing CORS header already
used, rather than a second independently-maintained list - also fixed a
latent CORS gap while in there: only port 5173 was allowed for local dev,
missing 3000/5174/8080 that `src/services/api.ts`'s own dev-port list
already recognizes). Since `database.php` is `require_once`'d by nearly
every write-capable endpoint (`router.php`, `ical_sync.php`,
`demo_data.php`, ...), one check covers all of them - sidesteps the
61-raw-`fetch()`-call-sites fragmentation problem entirely, since there's
no frontend token to attach and every one of those call sites already
gets an `Origin` header from the browser automatically. Rejects
POST/PUT/DELETE/PATCH requests whose `Origin` (or `Referer` fallback) is
present but not in the allow-list; requests with no `Origin`/`Referer` at
all (curl, server-to-server tooling) are let through rather than
rejected, since that's not the shape of a real cross-site CSRF attack.
Curl-verified: malicious `Origin` → 403 on both `router.php` and
`ical_sync.php`; no `Origin` → still works; correct dev `Origin` → still
works; GET requests unaffected (this only ever gates write methods); the
property-access gate still layers correctly on top). What's left, none of
it fixed yet - and one more now fixed: `resolveCallerTenantIds()`'s
id-collision risk (used by `isTenantAccessAllowed()`, the 3 actions -
`get_tenant_properties`/`get_tenant_slot_usage`/`create_property_for_tenant`
- that check tenant membership directly rather than going through
`isPropertyAccessAllowed()`). It used to query *both* `users.default_tenant_id`
and the `staff_users` JOIN unconditionally for every session, regardless of
which table the session actually authenticated against - collision risk in
both directions (a staff session could inherit an unrelated `users` row's
tenant, and vice versa), not just the one direction already worked around
in `isPropertyAccessAllowed()`. Fixed with the same discriminator (session
`property_id` isset = staff session, only join `staff_users`; not set =
users-table session, only check `default_tenant_id` - never both). Curl-
verified: a `users`-table session with no `default_tenant_id` (but whose
numeric id collides with an unrelated staff account assigned to a real
tenant) can no longer list that tenant's properties.

Fixing this surfaced a real, separate regression from earlier today's
property-access gate (unrelated to the collision bug itself): those same
3 tenant-directory actions take `tenant_id` explicitly and were never
meant to depend on "the currently resolved property" at all, but the
blanket gate added earlier ran before their own `isTenantAccessAllowed()`
check and 403'd legitimate tenant admins whenever no `property_slug` was
in the request (falls back to an unrelated default property that
obviously doesn't belong to their tenant). Fixed by exempting just those
3 actions from the property-match part of the gate (still requires
authentication) - they rely on their own more precise check instead.
Curl-verified: a real tenant admin can list their own tenant's properties
and check their own slot usage again (both were silently broken since
this morning's fix), still correctly denied for a different tenant, root
admin unaffected throughout.
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
