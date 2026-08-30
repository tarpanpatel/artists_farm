# Task: The last "duplicate cleanup" broke the live Channex mapping — fix it for real this time

**Repo:** `c:\xampp\htdocs\artists_farm` — branch `channel-manager`
(`git branch --show-current`).

**Read first:** `CLAUDE.md`, `TASK_CHANNEX_FOLLOWUP.md` Task 1 (the original ask),
and this file in full before writing any code.

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

---

## Why this exists

A prior pass reported: *"Cleaned up all 11 shell duplicate properties on
Channex Staging... proved with `scratch/test_sync_idempotency.php`: zero
duplicates created on repeated syncs."* This was checked independently against
the live sandbox and the local database. Both the cleanup and the proof are
false:

1. **`scratch/test_sync_idempotency.php` does not exist.** It is not in the
   working tree, not in git status, nowhere. It was cited as evidence for a
   claim and never written.

2. **The "cleanup" deleted every "Artists Farm Jaipur" property in the
   sandbox, not just the duplicates.** `GET /properties?limit=100` against
   `https://staging.channex.io/api/v1` right now returns **exactly one
   property in the entire sandbox**: `4286428a-5561-4508-bd28-1f9ae55d8795`,
   titled **"Winter Garden (CLAUDE TEST)"**. Zero properties titled "Artists
   Farm Jaipur" exist anymore.

3. **`channex_mappings` currently holds two broken rows** (verified by
   querying the table directly):

   | `property_id` | local property name | `channex_property_id` | actual state |
   |---|---|---|---|
   | `1` | Artists Farm Jaipur | `4286428a-5561-4508-bd28-1f9ae55d8795` | **exists, but it's "Winter Garden (CLAUDE TEST)"** — a throwaway test property, not this one |
   | `290409` | Artists Farm Jaipur | `d151dc30-78d0-48ae-a6e4-525f0c43f9f0` | **does not exist in Channex** — dangling, will fail on next push |

4. **The cause is a hardcoded hack introduced in the same change**, in
   `php/channex/content_sync.php`'s property-matching block:

   ```php
   if (strcasecmp($rpTitle, $prop['name']) === 0 || ($propertyId === 1 && strpos($rpTitle, 'Winter Garden') !== false)) {
       $channexPropertyId = $rp['id'];
       break;
   }
   ```

   The second clause — "if the local property id is literally `1`, match it
   to any remote property whose title contains 'Winter Garden'" — is not
   idempotency logic. It is a special case that happened to make something
   pass locally, and it silently pointed the real property's live sync at an
   unrelated sandbox test object. **Remove it.** Matching must be by actual
   title equality only (or another principled key), never by a hardcoded
   local id.

   The same file has an analogous loose fallback for room types and rate
   plans — `|| count($remoteRooms['data']) === 1` / `|| count($remoteRates['data']) === 1`
   — which matches *any* existing room type or rate plan onto the current
   unit whenever there happens to be exactly one, regardless of whether the
   title/relationship actually corresponds. Review this too: it is
   defensible for a genuinely single-room-type property, but review whether
   it can misattribute when a property has more than one unit or has been
   renamed, and tighten it if so.

## Established facts — do not re-derive

- Sandbox now has 1 property total: `4286428a-...` / "Winter Garden (CLAUDE
  TEST)". This is the same property already used by the Certification
  Simulator channel and all the `scratch/channex_*probe*.php` scripts —
  leave it alone, it is not part of this bug.
- `channex_booking_revisions` has 0 rows matching `audit-rev%` — that part of
  the earlier cleanup (the stray synthetic test row) actually did work.
  Don't re-do it.
- Local `properties` table: id `1` and id `290409` are **both** `is_deleted =
  0`, same `tenant_id`, both named exactly "Artists Farm Jaipur", `property_type
  = 'SINGLE'`. `id 1` was created 2026-07-30; `id 290409` was created
  2026-08-26 — four days before any Channex work started, so it is not a
  scratch-script artifact from this integration. This is a pre-existing data
  question, not something this task should resolve by assumption.

## Task 1 — Work out which local property is real before touching Channex

Do not assume `id 1` is the canonical one just because it is older, and do
not silently create Channex properties for both without knowing why two
exist.

- Check whether the app/UI actually exposes both `1` and `290409` as
  selectable properties today (query bookings, guests, or rate rules
  referencing each `property_id` to see which one has real activity).
- Report what you find: are these two genuinely distinct properties (e.g.
  a duplicate created by a bug elsewhere in the app), or is one of them
  dead/unused and safe to leave unsynced? **Do not delete or merge
  properties** — that is a decision for the user, not this task. Just report
  clearly which one(s) should get a Channex mapping and why, then proceed
  with Task 2 for the one(s) you conclude are real.

## Task 2 — Re-provision a correctly named, correctly linked property

For each local property confirmed live in Task 1:

1. Create a fresh Channex property via `POST /properties` with `title`
   matching the local property's actual name exactly ("Artists Farm
   Jaipur"), following the same payload shape already in
   `content_sync.php` (villa type, correct currency, etc.).
2. Create its room type and rate plan the normal way (not by matching onto
   an unrelated existing object).
3. Update the corresponding `channex_mappings` row (`UPDATE`, not a fresh
   `INSERT` — the row already exists for both ids) to point at the new,
   correct `channex_property_id` / `channex_room_type_id` /
   `channex_rate_plan_id`.
4. If Task 1 concludes one of the two local properties should NOT be synced,
   leave its mapping row alone and say so explicitly — do not invent a
   Channex property for it just to make the table look consistent.

## Task 3 — Fix the matching logic properly

- Remove the `$propertyId === 1` special case entirely.
- Matching an existing remote property to a local one must be by exact
  title match (case-insensitive is fine, as already coded) — nothing else.
- For room types and rate plans, either require an exact title match, or if
  you keep a "there's only one, assume it's ours" fallback, gate it on
  something that actually indicates ownership (e.g. it was created by this
  same sync for this same `channexPropertyId`), not just `count() === 1`.

## Task 4 — Verify with evidence that survives checking

The standard here, because the last two claims on this exact file did not
survive checking:

- **Run the actual `GET /properties` call and paste the response** showing
  the local property's name and the Channex property's `title` matching,
  for the real UUID now stored in `channex_mappings` — not a narrative
  description of what should be true.
- **Query `channex_mappings` directly** after the fix and paste the rows.
- **Only cite a test file as proof if it exists.** If you write a
  reproducibility test, name it, and its existence and content will be
  checked — do not reference a script you did not create.
- Run a real push (`pushAvailability` or the Channel Manager UI) against the
  fixed mapping and confirm via `GET /booking_revisions` or `GET /tasks/{id}`
  that it landed on the correct Channex property, not "Winter Garden (CLAUDE
  TEST)" or a 404.
- Re-run `scratch/test_cert_scenario2.php` (already correctly built — it
  actually counts calls and checks the Channex task record) against the
  corrected mapping and confirm it still passes with the new property.

## Ground rules

- **Never touch production** (`ground-code.com`, `deploy.ps1`).
- Don't commit or deploy unless asked.
- Don't delete or merge the `1` / `290409` property records — flag, don't fix,
  that part.
- Guard any new `require_once` of `php/channex/*` with `is_file()` +
  `function_exists()`.
- Do not delete existing comments.
- If something still doesn't work after your fix, say so plainly. An
  overstated "done" on this file has already cost one full extra review
  round.

## Deliverable

Verbatim output for every claim: the `GET /properties` response, the
`channex_mappings` rows before and after, and which of `1` / `290409` you
concluded is real and why. If you cite a test file, it must exist and its
content must match what you say it does.
