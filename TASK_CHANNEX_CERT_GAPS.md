# Task: Close the real certification gaps the audit report missed

**Repo:** `c:\xampp\htdocs\artists_farm` — branch **`channel-manager`**
(`git branch --show-current`; switch if needed).

**Read first:** `CLAUDE.md` (project rules), `CHANNEX_IMPLEMENTATION.md` §3 (the
real scenario list), and `.claude/skills/channex-pms-integration/references/api.md`.

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

---

## Why this exists

`CHANNEX_AUDIT_REPORT.md` says "ALL SCENARIOS VERIFIED & PASSING". A review on
30 Aug 2026 checked its claims against the code and the live sandbox. The
engineering underneath is largely solid, but the report is wrong in ways that
matter, and two genuine blockers were hiding behind the green rows.

**Do not treat that report as a baseline.** Task 4 corrects it, after the real
work is done.

## Established facts — verified 30 Aug 2026, do not re-derive

These cost real time to pin down. Several are counter-intuitive.

- **Rate units differ per endpoint, and the current code is CORRECT on both.**
  Do not "fix" either one.
  - `POST /rate_plans` → `options[].rate` is **MAJOR** units, decimal string
    (`"2400.00"`).
  - `POST /restrictions` (ARI) → `rate` is **MINOR** units (integer cents), which
    is why `ChannexAdapter::pushRestrictions()` multiplies by 100. Confirmed by
    reading it back: a 3500 tariff pushed through the drain worker returns
    `"rate":"3500.00"` from `GET /restrictions`.
- **`GET /restrictions` requires `filter[restrictions]`** (e.g.
  `&filter[restrictions]=rate,min_stay_arrival,stop_sell`), not `restrictions=`.
  Without it you get a 400 that does not explain itself.
- **Channex webhooks carry no signature.** There is no HMAC. The shared-secret
  header (`X-Channex-Webhook-Secret`, set via the `headers` object at
  registration and checked with `hash_equals` in `router.php`) is the correct
  mechanism. Nothing to implement here — only the report's claim is wrong.
- Creating a booking needs `ota_name: "Offline"` and `days` as a keyed map.
  Modify and cancel both need the full create-shape payload.
- The channel cannot be activated (`422 invalid_credentials`, no real OTA
  sandbox account). Expected — don't chase it.

---

## Task 1 — The live webhook path is broken (do this first)

**Scenarios 7 and 8 are not actually proven.** Every test to date built the
receiver's *internal* shape by hand and called `handleWebhook()` directly. What
Channex really POSTs is an envelope
(`.claude/skills/channex-pms-integration/references/api.md:298`):

```json
{"event": "booking",
 "payload": {"booking_id": "...", "property_id": "...", "revision_id": "..."},
 "user_id": null, "timestamp": "2026-..."}
```

Fed that, the receiver returns:

```
{"status":"error","http_code":400,"message":"Missing revision ID or booking ID"}
```

`handleWebhook()` looks for `booking_revision` / `data` / a booking-shaped body
and finds none of them, so **every real delivery would be rejected**. On top of
that, `GET /webhooks` currently returns **0 registered webhooks**, so nothing is
being delivered at all.

Fix both:

1. Parse the real envelope. Take `payload.revision_id` and, per the API
   reference, **`GET /booking_revisions/:id` and treat that as the source of
   truth** — the webhook is a notification, not the data. Keep the existing
   shapes working too; the test suite and cert scripts feed them.
2. Skip events you caused: `user_id` null or your own id means the change
   originated from this PMS (see `api.md:305`).
3. Register the webhook with Channex (`POST /webhooks`) with the shared secret in
   its `headers`, `event_mask` covering
   `booking_new;booking_modification;booking_cancellation`. Make this idempotent
   and re-runnable — ideally a button or action, since the callback URL differs
   per environment and staging's will change.

**Verify over real HTTP.** Calling `handleWebhook()` in-process is exactly the
blind spot that hid this. POST an envelope to the actual
`router.php?action=channex_webhook` endpoint, with and without the secret header,
and confirm: 401 without it, and with it a guest row created plus
`ack_status = 'ACKED'`.

## Task 2 — Scenarios 2 to 5 have never been tested

The audit report renumbered the scenarios and assigned inbound booking work to
slots 2, 3 and 4 — which is really scenarios 7 and 8, already counted. The real
requirements (`CHANNEX_IMPLEMENTATION.md` §3) are all **outbound call-count**
tests, and none has been run:

| # | Trigger | Requirement |
|---|---|---|
| 2 | Change one rate plan on one date | 1 call to `/restrictions` |
| 3 | Change several rate plans, single date, one save | **1 batched call** |
| 4 | Change a 10–20 day range across plans | 1 batched call using `date_from`/`date_to` |
| 5 | Set min stay (2/3/5 nights) across plans | 1 batched call, `min_stay_through`/`min_stay_arrival` |

`scratch/test_channex_live_sandbox.php` is the closest thing and it does not
count calls — it pushes one range for one rate plan and checks HTTP 200. A
per-date or per-rate-plan loop would sail through it and fail certification.

Note scenarios 3, 4 and 5 all require **multiple rate plans**. The sandbox
currently has one (`2d0dfacb-…`). Provision at least two more, then write a test
per scenario that asserts the **actual outbound call count**, the way
`scratch/test_scenario1_dirty_queue.php` does for scenario 1 — copy its approach.

If a scenario turns out to need more than one call as currently built, say so.
That is a finding, not a failure, and it is far better to learn it now than on
the screenshare.

## Task 3 — `availability.php` ignores every restriction except stop_sell

`availability.php` (repo root, the public direct-booking page) handles
`stop_sell` and nothing else — no `min_stay_arrival`, `min_stay_through`,
`max_stay`, `closed_to_arrival`, `closed_to_departure`. Confirmed: zero matches
for any of them in that file.

So a date you have told every OTA requires a 3-night minimum will happily take a
1-night direct booking. The restriction is real on the channel and fiction on
your own site.

`room_rate_rules` already carries all six columns; see
`computeCompressedRestrictions()` in `ari_drain_worker.php:222` for how they are
read. Apply the same rules to what the public page offers.

**Direct bookings are deliberately NOT min-stay enforced at
`add_guest`** — the user was asked and said no. This task is about what the
public availability page *displays as bookable*, not about blocking staff.
Do not change `add_guest`.

## Task 4 — Correct the audit report

Only after 1–3. `CHANNEX_AUDIT_REPORT.md` currently states as verified:

- **"HMAC SHA256 signature verification"** — false. It is a static shared-secret
  header compared with `hash_equals`. The only `hash_hmac` in the repo is in
  `web_push.php`, unrelated. Materially weaker (replayable, does not authenticate
  the body) and the kind of claim that surfaces badly in a security review.
- **"dispatches Telegram alert"** on inbound bookings — false. Zero Telegram
  references in `webhook_receiver.php`.
- **"`availability.php` enforce `stop_sell`, `min_stay_arrival`, etc."** — false
  for everything but `stop_sell` (Task 3).
- **The scenario matrix** — renumbered, so it banks the same inbound work five
  times and reports untested outbound scenarios as PASS.
- **"Next Steps → connect your Airbnb test credentials"** — that is the blocked
  step (`422 invalid_credentials`), not a checkbox.

Rewrite it so each row states what was actually executed and how it was verified.
A row saying "not yet tested" is worth more than a green tick that does not hold,
because the screenshare will find out either way.

---

## Ground rules

- **Verify against the database and the live API, not return values.** Four
  review rounds on this integration have each turned up "passing" results that
  were not: a fixture asserting a payload shape Channex never sends, an
  idempotent response read as proof of ingestion, a `SELECT` of a column that
  does not exist, and now a webhook path that rejects every real delivery.
- **Do not delete existing comments.** Three rounds running, explanatory comments
  documenting past incidents have been stripped while editing nearby code. They
  are why the next person does not reintroduce the bug.
- Guard any new `require_once` of `php/channex/*` with `is_file()` +
  `function_exists()` — that directory does not exist on `multi-tenant`.
- **Never touch production** (`ground-code.com`, `deploy.ps1`).
- Don't commit or deploy unless asked.

## Deliverable

Per task: what you ran, what you observed, what changed. For Task 1, the HTTP
status and resulting DB state from a real POST to the endpoint. For Task 2, the
actual call count per scenario. Where something still does not work, say so
plainly — an accurate "still failing" is the point of this whole task.
