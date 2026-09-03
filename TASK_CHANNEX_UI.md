# Task: Make the Channex integration usable from the PMS UI

**Repo:** `c:\xampp\htdocs\artists_farm` — branch **`channel-manager`**
(`git branch --show-current`; switch if needed).

**Read first:** `CLAUDE.md` (project rules), `DESIGN.md` (UI conventions — read
before building any table, modal, card, or tab), and `CHANNEX_IMPLEMENTATION.md`
(sections 3 and 9 especially).

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key, never echo it in an API response.

---

## Why this exists

The Channex backend is built and proven: outbox, run-length compression, ARI
drain worker with task-id capture, webhook receiver with ACK state, and all
eight certification scenarios verified end to end against the live sandbox.

**But `grep -r channex src/` returns nothing.** There is no UI. Not a mapping
screen, not a push button, not a sync status panel.

That is fatal for certification. Channex certifies by **watching a live
screenshare while the operator drives the real PMS UI**, and they explicitly
reject integrations that look scripted (`CHANNEX_IMPLEMENTATION.md` §3). Every
scenario we have proven so far ran through a PHP script. An auditor watching the
screen today would see a PMS with no channel manager in it.

**Second problem, equally blocking:** nothing ever drains the outbox. Saving a
rate rule enqueues a row (`php/rates/rate_rules.php:237`), a booking change
enqueues a row (`php/channex/webhook_receiver.php`), and then they sit there.
`channex_outbox_drain` exists as a router action that **nothing calls**. So
scenarios 2–6 currently push nothing to Channex at all.

## What already exists — do not rebuild

| Piece | Location |
|---|---|
| Outbox enqueue + schema | `php/channex/outbox.php` (`enqueueOutboxItem`) |
| Drain worker, compression, task-id capture | `php/channex/ari_drain_worker.php` (`AriDrainWorker::processBatch`) |
| Availability computation | `computeCompressedAvailability()` in the same file |
| Content/mapping provisioning | `php/channex/content_sync.php` (`ChannexContentSyncer::syncProperty`) |
| Inbound bookings + ACK | `php/channex/webhook_receiver.php` |
| HTTP client | `php/channex/ChannexClient.php` |

Existing router actions (`php/api/router.php`), and that is the complete list:

- `channex_webhook` — public, inbound, secret-authenticated. Leave alone.
- `channex_content_sync` — provisions property/rooms/rate plans, writes `channex_mappings`.
- `channex_outbox_drain` — runs one drain batch, returns `{processed, groups}`.

Relevant tables: `channex_mappings` (`content_sync.php:12`), `channex_outbox`
(`outbox.php:12`), `channex_booking_revisions` (`webhook_receiver.php:15`).

---

## Task 1 — Backend actions the UI needs

Add to `php/api/router.php` alongside the three above.

**`get_channex_status`** — everything the screen renders in one call:
- whether `channex_config.json` exists and has an api key / webhook secret.
  Return **booleans only** (`has_api_key: true`), never the values.
- `channex_mappings` rows for this property (local room ↔ channex ids, sync_status,
  last_synced_at)
- the most recent ~50 `channex_outbox` rows (id, kind, date range, status,
  attempts, task_id, last_error, created_at)
- counts by status, so the UI can show "3 pending, 1 failed" without a second call

**`channex_push_ari`** — the scenario-1 trigger. Takes a property and a date
range, enqueues the work, drains, returns the task ids.

> **This is the hard requirement of the whole integration.** Scenario 1 pushes
> **500 days of availability + rates + restrictions in exactly 2 API calls** —
> one availability, one rates/restrictions. Enqueue **one** `availability` row
> and **one** `rates` row spanning the entire range and let the drain worker's
> existing run-length compression do the rest. If you find yourself enqueueing
> per-date or per-rate-plan rows, stop — that is the design error the whole
> outbox exists to prevent, and it fails certification outright.

Return the `task_id`s. The auditor looks them up in Channex's own logs; a push
whose task id was discarded cannot be evidenced.

**Make the drain event-driven.** After a rate-rule save commits
(`php/rates/rate_rules.php`), the outbox must actually drain — otherwise
scenarios 2–6 push nothing. Use `fastcgi_finish_request()` (already the pattern
in `channex_webhook`) so the user's save returns immediately and the push happens
after. **Do not add a cron that scans for changes** — polling is explicitly
disallowed by Channex and would fail certification even if it worked.

Guard every new `require_once` of `php/channex/*` with `is_file()` +
`function_exists()`, the way `multi-tenant`'s copy of `rate_rules.php` already
does. `php/channex/` does not exist on `multi-tenant`, and an unguarded require
there takes down rate-rule saving entirely — that exact regression already
happened once.

## Task 2 — The Channel Manager screen

New sidebar tab. Adding one means three things, not just a component:

1. An `INSERT IGNORE INTO nav_menu_items` in `php/kitchen/menu.php` (see the
   block at line 257 for the exact column shape). Note `nav_menu_items` is
   deliberately **shared platform-wide**, not property-scoped.
2. Tab wiring in `src/App.tsx` (grep `licenses` — it appears at lines 254, 518,
   1357, 2546; the `licenses` tab is the cleanest recent example to copy).
3. The component itself.

Restrict to Super Admin / Admin in `roles_json`, and put it under System Controls
next to License Management.

What the screen shows:

- **Connection status** — config present, property mapped, and the Channex
  property / room-type / rate-plan ids per room. A clear "not connected" state
  when `channex_mappings` is empty.
- **Sync Content** button → `channex_content_sync`. This is what creates the
  mapping in the first place.
- **Push Availability & Rates** — a date range plus a push button →
  `channex_push_ari`. Use the shared `DateRangePicker`. This is the control the
  auditor watches for scenario 1, so it must handle a 500-day range without
  complaint. (`blockedDates` does not apply — this is not a booking picker.)
- **Sync activity table** — outbox rows with status, date range, **task id**, and
  error. This is where the auditor reads Task IDs off the screen, so make the id
  visible and copyable, not truncated into uselessness.
- **Retry** on a failed row, and a manual drain, for when a push needs re-running
  mid-demo.

Follow `DESIGN.md`. Specifics that bite: **Flowbite icons only** — `lucide-react`
is uninstalled, a Lucide import will not compile. Page padding
`px-4 sm:px-6 lg:px-8`, section cards `p-4 sm:p-6`. Modals open as right-side
drawers. Add `dark:` classes to match surrounding code (they are inert app-wide
but the codebase is written with them — do not re-enable dark mode). English
strings only, `src/i18n/en.ts`; do **not** touch `hi.ts`.

## Task 3 — `availability.php` must respect `stop_sell`

`availability.php` (repo root, the public direct-booking page) has no reference
to `stop_sell` at all. A night stop-sold to stop OTA sales still shows bookable
on your own page — a direct booking can land on a night deliberately closed,
which is a genuine overbooking path.

`room_rate_rules` already carries `stop_sell`; see how
`computeCompressedAvailability()` in `ari_drain_worker.php:148` reads it.

Unrelated to certification. Do it anyway — it is a real bug.

---

## Verification

1. `php -l` on every PHP file touched.
2. `npx tsc --noEmit -p tsconfig.json` — must be clean.
3. **Count the API calls for scenario 1.** Push 500 days from the UI and prove it
   produced exactly **2** Channex calls — one availability, one rates. Log the
   outbound calls or read them back; do not assume the compression worked because
   the button turned green. This is the single most likely thing to be quietly
   wrong.
4. Run the existing suites — they must still pass:
   `scratch/test_channex_webhook.php`, `scratch/test_cancel_availability_flow.php`,
   `scratch/test_concurrent_webhook.php`, `scratch/test_channex_compression.php`.
5. Save a rate rule **from the UI** and confirm the outbox row reaches
   `status = 'done'` with a `task_id` on its own, with nothing run by hand.
6. Walk scenarios 1–6 through the UI and record the task id for each. If a
   scenario has no UI path, say so plainly rather than running a script and
   reporting it as passing.

## Ground rules

- **Verify in the database and against the Channex API, not from return values.**
  A green toast is not evidence. Two review rounds on this integration have
  already turned up "passing" results that were wrong — a fixture asserting a
  payload shape Channex never sends, and an idempotent response being read as
  proof of ingestion.
- **Never touch production** (`ground-code.com`, `deploy.ps1`) under any
  circumstance. Staging only, and only if asked.
- Don't commit or deploy unless asked.

## Deliverable

Per task: what you built, what you ran, what you observed. For scenario 1, state
the actual call count and the task ids. Where something is not yet reachable from
the UI, say which scenario and why — an honest gap is more useful than a green
line that hides one.
