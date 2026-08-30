# Task: A stale outbox queue makes certification scenario 1 fail

**Repo:** `c:\xampp\htdocs\artists_farm` — branch **`channel-manager`**
(`git branch --show-current`; switch if needed).

**Read first:** `CLAUDE.md` (project rules) and `CHANNEX_IMPLEMENTATION.md` §3
(the certification scenarios).

---

## The problem

Certification scenario 1 is the hard one: pushing 500 days of availability +
rates + restrictions must leave in **exactly 2 Channex API calls** — one
availability, one rates/restrictions. More than 2 fails the scenario. The
auditor watches this happen live on a screenshare.

The compression that makes 2 calls possible already works, and the push action
(`channex_push_ari` in `php/api/router.php`) correctly enqueues exactly two
outbox rows for the whole range.

**But `AriDrainWorker::processBatch()` claims every pending row in the table,
not just the two the push enqueued.** So if anything else is sitting in
`channex_outbox` with status `pending`, `sending`, or `failed` when the operator
clicks Push, those rows drain in the same batch and the push fires more than 2
calls.

This is not hypothetical. Verified 30 Aug 2026: running
`scratch/test_scenario1_ui_push.php` without clearing first found **6 stale rows
left over from earlier work**. The test only reports a clean `groups: 2` because
it deletes them first — see the `DELETE FROM channex_outbox WHERE status IN
('pending','sending','failed')` near the top of that file, and the comment
explaining why it is there.

Stale rows accumulate easily and invisibly: every rate-rule save enqueues one,
every inbound booking or cancellation enqueues one, and anything that failed its
push stays `failed` and gets retried on the next drain. A demo that worked
yesterday can fail today because someone edited a rate in between.

## What to do

Pick one of these. **The first is better** — it makes the guarantee structural
rather than relying on an operator noticing a warning:

**Option A — scope the drain to the rows being pushed.** Give
`processBatch()` an optional list of outbox row ids, and have `channex_push_ari`
pass the two ids it just enqueued. Unrelated pending rows then drain on their own
schedule (the event-driven trigger after a rate-rule save) and can never inflate
a manual push. Keep the existing no-argument behaviour working unchanged — the
event-driven drain in `php/rates/rate_rules.php` and the `channex_outbox_drain`
action both call it with no arguments and must keep draining everything.

**Option B — block the push while the queue is dirty.** `get_channex_status`
already returns `counts` by status. Have the Channel Manager screen refuse to
push while `pending + sending + failed > 0`, with a "Clear queue first" action
that drains them separately. Weaker, because it depends on the operator reading
the warning under demo pressure, but acceptable if A turns out to be invasive.

Whichever you pick, the outcome must be: **clicking Push produces exactly 2 API
calls, regardless of what is already sitting in the outbox.**

## Verification

Do not just re-run the existing test — it deletes the stale rows, so it would
pass either way and prove nothing.

1. Deliberately dirty the queue first. Save a rate rule (or insert a few pending
   rows by hand) so `channex_outbox` has several `pending` rows.
2. **Then** run the 500-day push and confirm it still reports exactly 2 groups
   and 2 distinct task ids.
3. Confirm the unrelated pending rows are either untouched (Option A) or drained
   separately (Option B) — they must not be silently lost either way.
4. Confirm the event-driven drain still works: save a rate rule from the UI and
   check its outbox row reaches `status = 'done'` with a `task_id`, with nothing
   run by hand.
5. Re-run the suites: `scratch/test_scenario1_ui_push.php`,
   `scratch/test_channex_compression.php`, `scratch/test_channex_webhook.php`,
   `scratch/test_cancel_availability_flow.php`.
6. `php -l` on every PHP file touched; `npx tsc --noEmit -p tsconfig.json` clean.

## Ground rules

- **Verify against the database and the Channex API, not return values.** Three
  review rounds on this integration have each turned up "passing" results that
  were wrong — a fixture asserting a payload shape Channex never sends, an
  idempotent response read as proof of ingestion, and a `SELECT` of a column that
  does not exist.
- Guard any new `require_once` of `php/channex/*` with `is_file()` +
  `function_exists()`. That directory does not exist on `multi-tenant`, and an
  unguarded require there takes down rate-rule saving entirely — it has happened.
- **Never touch production** (`ground-code.com`, `deploy.ps1`).
- Don't commit or deploy unless asked.

## Deliverable

Which option you took and why. The actual call count from a push run against a
**deliberately dirty** queue — that is the whole point of the task, so if you
only tested against a clean one, say so.
