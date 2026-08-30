# Task: Channex follow-up work — duplicate properties, stale fixes to land, and pre-certification cleanup

**Repo:** `c:\xampp\htdocs\artists_farm` — branch `channel-manager` unless a task
says otherwise (`git branch --show-current`).

**Read first:** `CLAUDE.md` (project rules), `CHANNEX_IMPLEMENTATION.md` §3,
`CHANNEX_AUDIT_REPORT.md`, and `TASK_CHANNEX_PRE_AUDIT.md` (the most recent prior
review — several items below come directly from its open tasks).

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

Work through the tasks in order. Each is independent enough to commit
separately if asked, but don't commit or deploy unless the user asks.

---

## Task 1 — Stop Channex property duplication and clean up the sandbox (NEW, do first)

### The bug

`ChannexContentSyncer::syncProperty()` in `php/channex/content_sync.php`
(lines 88-111) decides whether to create a property in Channex by checking
ONLY the local `channex_mappings` table:

```php
$mapStmt = $this->pdo->prepare("SELECT channex_property_id FROM channex_mappings WHERE property_id = ? LIMIT 1");
...
if (!$channexPropertyId) {
    $res = $this->client->post('properties', $propPayload);   // title = local property name
    $channexPropertyId = $res['data']['id'];
}
```

It never asks Channex itself whether a property with that title already
exists. Any time the local mapping row is missing (a wiped/reset
`channex_mappings` table, or testing against a different branch's DB state —
this repo has a second, independently evolved Channex implementation on
`multi-tenant` hitting the same staging sandbox account), the next sync
silently creates ANOTHER property in Channex instead of reusing the existing
one. This is not limited to a manual "Content Sync" button click either:
`ChannexAdapter::pushAvailability()` (`ChannexAdapter.php:30-35`) auto-calls
`syncContent()` whenever a mapping is missing, so an ordinary ARI push can
trigger it too.

There is also no locking around the check-then-create-then-save sequence.
Two overlapping calls can both pass the "no mapping yet" check, both create
a property in Channex, and the losing call's later insert/update (no
try/catch around it) can throw an uncaught `PDOException` on the mapping
table's `uniq_prop_room` unique key — a real error surfacing in the app, not
just leaked sandbox clutter.

**Observed evidence**: the property picker in Channex currently lists 7
duplicate "Artists Farm Jaipur" entries plus one "Winter Garden (CLAUDE
TEST)" (from an unrelated, already-known scratch test — see
`scratch/channex_model_test.php --cleanup`).

### Task 1a — Confirm and inventory

- Query the local `channex_mappings` table for the row belonging to the real
  "Artists Farm Jaipur" property and record its `channex_property_id` — that
  is the one currently wired to live pushes and must be preserved.
- `GET /properties` against the staging sandbox, filter by title "Artists
  Farm Jaipur", and list every matching property UUID with its
  `room_types`/`rate_plans` counts (so you can see which are fully populated
  vs. bare shells).
- Report the full list before touching anything.

### Task 1b — Clean up the duplicates

- `DELETE /properties/{id}` for every "Artists Farm Jaipur" duplicate EXCEPT
  the UUID identified in Task 1a.
- Do not touch the Certification Simulator's linked property
  (`4286428a-5561-4508-bd28-1f9ae55d8795`) or "Winter Garden (CLAUDE TEST)"
  unless asked.
- If a duplicate has an active channel or bookings attached, stop and report
  it instead of deleting — don't force through Channex's own safety checks.

### Task 1c — Fix the idempotency gap

Make `syncProperty()` actually idempotent against Channex, not just against
the local table:

- Before creating, check for an existing remote property with a matching
  title (or persist a stronger local guarantee — e.g. a unique constraint
  plus a transaction/advisory lock around the check-then-create-then-save
  block so two concurrent calls can't both pass the check).
- Handle the duplicate-key path explicitly instead of letting it throw: if
  the INSERT/UPDATE fails because another request already wrote the
  mapping, re-read the mapping that won and use it — don't leave an
  orphaned Channex property behind.

### Task 1d — Prove it

Write a reproducible test (model it on `scratch/test_scenario1_dirty_queue.php`'s
style — seed the failure condition, run, assert on actual API/DB state) that
fires `syncProperty()` concurrently (or repeatedly against a cleared mapping
row) for the same property and asserts **exactly one** property exists in
Channex afterward, not just that the call returned success.

---

## Task 2 — Finish and verify re-runnable tests for certification scenarios 2–5

`TASK_CHANNEX_PRE_AUDIT.md` Task 1 asked for one test per scenario, modelled
on `scratch/test_scenario1_dirty_queue.php`, asserting the **measured call
count** (not HTTP 200). Files named `scratch/test_cert_scenario2.php` through
`scratch/test_cert_scenario5.php` already exist in the working tree — **do
not assume they are correct or complete.** Open each one and confirm:

- It asserts the actual number of Channex API calls (or `GET /tasks/{id}`
  records with `success: true` and the expected `payload.values` count), not
  just a 200 status — `scratch/test_channex_live_sandbox.php` is the
  cautionary example of a test that would pass a broken implementation.
- It uses the three real sandbox rate plans (`Standard`, `Non-Refundable`,
  `Weekend Special`) for scenarios 3–5, which require multiple rate plans.
- Running it against a **dirty** queue (existing pending/failed outbox rows)
  still reports the correct call count — the same class of bug fixed in
  `TASK_OUTBOX_SCOPE.md` for scenario 1.

Report which of the four already work correctly, which need fixes, and fix
the ones that don't.

---

## Task 3 — Cherry-pick the AuthProvider crash fix onto `multi-tenant`

`TASK_AUTHPROVIDER_CRASH.md` describes a live crash (`useAuth must be used
within AuthProvider`) on the management login page, unrelated to Channex,
present on both branches. It was fixed on `channel-manager`
(`useAuthOptional()` in `AuthContext.tsx` / `LoginPage.tsx`, plus
`ErrorBoundary` wrapping in `App.tsx`) but **confirmed still missing on
`multi-tenant`** as of this writing (`git show multi-tenant:src/contexts/AuthContext.tsx`
has no `useAuthOptional`).

Follow `TASK_AUTHPROVIDER_CRASH.md` in full — it has its own verification
steps (load all four affected routes, confirm no console error, confirm
`sessionMismatchNotice` still works on the property path). Cherry-pick only
the auth/error-boundary fix; nothing Channex-related should come with it,
since `multi-tenant` doesn't have the `php/channex/` directory.

---

## Task 4 — Remove the stray synthetic audit row

`TASK_CHANNEX_PRE_AUDIT.md` Task 4: a revision row with the literal id
`audit-rev-...` sits in the local database with `ack_status = 'FAILED'`,
left over from a synthetic audit run. It will appear in the Channel
Manager's outbox view, including during a live screenshare.

Find and remove it, and confirm no other scratch/test script left similar
rows behind (several already clean up after themselves correctly — follow
that pattern for any that don't).

---

## Task 5 — Playwright pre-check of the UI trigger path (not the real certification run)

`TASK_CHANNEX_PRE_AUDIT.md` Task 2 flags that **nobody has driven a single
certification scenario from the actual PMS UI** — everything so far was
proven by calling PHP directly. The real certification screenshare must
still be run by a human (Channex rejects anything that looks scripted), so
this task is a pre-check to catch bugs before that happens, not a
replacement for it.

Using Playwright (or whatever browser automation is already set up in this
repo), drive the **Channel Manager** screen (`#channel_manager`) and the
**Rate Rules** modal through each scenario's UI action, then verify the
resulting outbox row reaches `status = 'done'` with a `task_id`, with
nothing run by hand afterward:

- Saving a rate rule in Rate Rules enqueues an outbox row and the
  event-driven drain fires on its own.
- The Scenario 1 bulk-push button in Channel Manager produces exactly 2
  calls and displays both task IDs.
- The outbox table in the UI shows the task IDs matching what the API
  actually returned.

Report which scenarios have a working UI trigger and which do not — an
honest list of gaps is the deliverable, not a clean sweep. If something
only works when called directly from PHP and not from the UI, that is the
single most useful thing to find here, because it cannot be fixed during
the real screenshare.

---

## Ground rules (apply to all tasks above)

- **Verify against the database and the live API, not return values.** Four
  review rounds on this integration have each turned up "passing" results
  that were not: a fixture asserting a payload shape Channex never sends, an
  idempotent response read as proof of ingestion, a `SELECT` of a column
  that does not exist, and a webhook path that rejected every real delivery.
- **Do not delete existing comments.** Explanatory comments document past
  incidents; they are why the next person doesn't reintroduce the bug.
- Guard any new `require_once` of `php/channex/*` with `is_file()` +
  `function_exists()` — that directory does not exist on `multi-tenant`.
- **Never touch production** (`ground-code.com`, `deploy.ps1`).
- Don't commit or deploy unless asked.

## Deliverable

Per task: what you ran, the verbatim output (HTTP status, DB rows, task
IDs), and which script/file reproduces it. Where something still doesn't
work, say so plainly — an accurate "still failing" is worth more than a
green tick that doesn't survive checking.
