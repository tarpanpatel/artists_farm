# Task: Make the certification evidence reproducible before the screenshare

**Repo:** `c:\xampp\htdocs\artists_farm` — branch **`channel-manager`** unless a
task says otherwise (`git branch --show-current`).

**Read first:** `CLAUDE.md` (project rules), `CHANNEX_IMPLEMENTATION.md` §3, and
`CHANNEX_AUDIT_REPORT.md` (now corrected — see "About the report" below).

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

---

## Where things stand

The integration works. Verified independently 30 Aug 2026, against the database
and the live sandbox rather than return values:

- **Live webhook path**: registered with Channex, parses the real envelope, pulls
  the revision via `GET /booking_revisions/:id`, persists, ACKs. Proven by
  `scratch/test_webhook_envelope_live.php` — guest 2378, `450.00`, 2 guests, ACKED.
- **Scenarios 2–5**: real. Channex's own task records show `success: true` with
  3 rate plans batched into one call (S3) and 2 plans with min-stay in one call (S5).
- **Scenario 1**: 500 days in exactly 2 calls, holds even with a dirty queue
  (`scratch/test_scenario1_dirty_queue.php`).
- **`availability.php`**: reads all six restriction columns and shows CTA/CTD/
  min-stay badges.

What remains is not new features. It is making the evidence hold up when someone
else is watching.

## About the report

`CHANNEX_AUDIT_REPORT.md` was corrected on review. Its Scenario 7 row cited
"guest row 2377, `acked_at 15:34:35`" — the booking and revision existed on
Channex, but **no such row existed in the local database or on staging**, and
local `MAX(guests.id)` was 2372, so 2377 was never created. That row now carries
reproducible evidence instead.

This is the fourth review round where a "verified" claim did not survive being
checked. The engineering has been consistently sound; the write-ups keep getting
ahead of it. **Task 5 below is about closing that gap structurally, and it is not
optional.**

---

## Task 1 — Re-runnable tests for scenarios 2 to 5

Right now the only evidence is Channex task IDs from a one-off run. Real evidence,
but not repeatable: if compression or batching regresses between now and the
audit, nobody finds out until the auditor is watching.

Write one test per scenario, modelled on `scratch/test_scenario1_dirty_queue.php`
(which is the pattern to copy — it seeds noise, runs, and asserts on measured
outcomes):

| # | Trigger | Must assert |
|---|---|---|
| 2 | One rate plan, one date | exactly **1** call to `/restrictions` |
| 3 | Several rate plans, one date, one save | exactly **1** batched call |
| 4 | A 15-day range across plans | exactly **1** batched call using `date_from`/`date_to` |
| 5 | Min stay 2/3/5 across plans | exactly **1** batched call carrying `min_stay_*` |

Assert the **measured call count**, not HTTP 200. `scratch/test_channex_live_sandbox.php`
is the cautionary example: it pushes one range for one plan and checks the status
code, so a per-date loop would pass it and fail certification.

The three rate plans already exist on the sandbox (`Standard`, `Non-Refundable`,
`Weekend Special`). Fetch the task record back (`GET /tasks/{id}`) and assert
`success: true`, `errors: []`, and the expected number of entries in
`payload.values` — that is Channex's own record and the strongest evidence available.

## Task 2 — Nobody has driven a single scenario from the UI

This is the largest remaining unknown, and it is what certification actually
tests: Channex watches an operator use the real PMS and rejects anything that
looks scripted.

Every scenario so far was proven by calling PHP directly. Confirm the UI path
produces the same result:

- Saving a rate rule in **Rate Rules** enqueues an outbox row, the event-driven
  drain fires, and the row reaches `status = 'done'` with a `task_id` — with
  nothing run by hand afterwards.
- The resulting call count matches the scenario requirement. A UI save that
  produces two calls where the scenario allows one fails, however correct the
  underlying adapter is.
- The **Channel Manager** screen's outbox table shows those task IDs.

Report which scenarios have a working UI trigger and which do not. If a scenario
has no UI path at all, say so — that is the single most useful thing you can find,
because it cannot be fixed during the screenshare.

## Task 3 — Finish the import guards

`router.php`'s `channex_push_ari` (line ~3777) wraps the `require_once` in
`is_file()`, then calls `enqueueOutboxItem(...)` and `new AriDrainWorker(...)`
unconditionally. If the file is missing, that is a fatal "Call to undefined
function", not the clean degradation the guard implies. Same in
`channex_retry_outbox`.

`CHANNEX_AUDIT_REPORT.md` §5 claims these branches "do not break" without the
Channex files. Make that true — guard the usage, not just the require — or
correct the claim.

## Task 4 — Clean up after tests

A revision row with the literal id `audit-rev-...` sits in the local database with
`ack_status = 'FAILED'`, left by a synthetic audit run. It will appear in the
Channel Manager outbox view, including during a screenshare.

Remove it, and make sure any test that writes rows cleans them up — several
existing scratch tests already do this correctly; follow that pattern.

## Task 5 — Evidence discipline (required, not optional)

For every claim you make in a report or summary, the standard is:

- **Verified in the database or against the live API**, never from a function's
  return value. `{"status":"success"}` is not evidence a row was written. The
  receiver returns success for an already-processed revision, which is how an
  idempotent no-op was once reported as a successful ingestion.
- **Quote the actual output.** Row contents, HTTP status, task record — verbatim,
  not paraphrased. An id you cannot produce from a query did not happen.
- **Name the artifact that reproduces it.** A claim with no re-runnable script is
  a claim someone has to take on trust, and the last four rounds show that is not
  safe.
- **If a step was not run, say so.** "Not tested" is a useful, respectable result.
  A green tick that does not survive checking costs far more than an honest gap,
  because it hides the real state until the worst possible moment.

## Task 6 — Move the AuthProvider fix to `multi-tenant`

`useAuthOptional` and the `ErrorBoundary` wrapping fixed a crash on the management
login page. That bug is **pre-existing and unrelated to Channex** — it came in with
commit `9f8827d7` and exists on `multi-tenant` too — but the fix currently lives
only on `channel-manager`, so it would be lost if the Channex work is abandoned.

Cherry-pick it onto `multi-tenant`: `src/contexts/AuthContext.tsx`,
`src/components/LoginPage.tsx`, and the `App.tsx` ErrorBoundary changes. Nothing
Channex-related should come with it. Confirm `tsc` is clean on that branch
afterwards, and that the management login page renders there.

---

## Ground rules

- Guard any new `require_once` of `php/channex/*` with `is_file()` +
  `function_exists()`. That directory does not exist on `multi-tenant`.
- **Do not delete existing comments.** Four rounds running, comments documenting
  past incidents have been stripped while editing nearby code. They are why the
  next person does not reintroduce the bug.
- **Never touch production** (`ground-code.com`, `deploy.ps1`).
- Don't commit or deploy unless asked.

## Deliverable

Per task: what you ran, the verbatim output, and which script reproduces it. For
Task 2, be explicit about which scenarios have a working UI trigger and which do
not — an accurate list of gaps is the deliverable, not a clean sweep.
