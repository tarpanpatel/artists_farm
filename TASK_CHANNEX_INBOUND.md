# Task: Finish the Channex inbound booking path

**Repo:** `c:\xampp\htdocs\artists_farm` — branch **`channel-manager`**
(`git branch --show-current`; switch if needed).

**Read first:** `CLAUDE.md` (project rules — never touch production, don't commit
unless asked, minimal comments) and `CHANNEX_IMPLEMENTATION.md`.

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

---

## Background

Certification scenarios 7 & 8 (inbound bookings: new / modify / cancel) are done
and verified — three distinct revisions, all ACKed, guest row tracked correctly.

A review on 30 Aug 2026 then found five field-mapping bugs in
`php/channex/webhook_receiver.php` that the passing tests never caught, because
nothing asserted on the *values*. All five are now fixed:

| Bug | Cause |
|---|---|
| Bookings landed at 1/100th value | `amount` is `"480.00"` (major units, decimal string), code did `(int)$x / 100` |
| Every booking read as 1 guest | `occupancy` is an object, not an int; `(int)$array === 1` |
| Every booking marked prepaid | `payment_collect` ignored |
| Money columns went stale on modify | update branch moved `total_charge` only |
| Calendar showed "(Channex OTA)" for all | `ota_name` never read |

**The lesson driving this task:** the payload was never reconciled field-by-field
against our schema. Those five were found by dumping the real payload and reading
it against the `guests` table. There is more left unmapped — see Task A.

## Established facts — do not re-derive

Real payload shape, dumped from the live sandbox 30 Aug 2026
(`GET /api/v1/bookings/{id}` → `data.attributes`):

```
top-level: id, meta, status, services, currency, amount, agent, unique_id,
  inserted_at, channel_id, ota_reservation_code, ota_name, property_id,
  booking_id, arrival_date, arrival_hour, customer, departure_date, deposits,
  notes, ota_commission, payment_collect, payment_type, rooms, occupancy,
  guarantee, secondary_ota, acknowledge_status, has_unacked_revisions,
  raw_message, revision_id, is_crs_revision

amount          "480.00"        decimal string, MAJOR units
occupancy       {"adults":2,"children":0,"infants":0,"ages":[]}
payment_collect "property"      | "ota"
rooms[0]        { room_type_id, rate_plan_id, amount: "480.00",
                  days: {"2027-08-28":"120.00", ...},   <- keyed map
                  occupancy: {...}, checkin_date, checkout_date,
                  taxes: [], services: [], ota_commission, booking_room_id }
```

`room_type_id` is inside `rooms[0]`, **not** at the top level.

Sandbox objects (already provisioned — do not recreate):

```
property   4286428a-5561-4508-bd28-1f9ae55d8795   USD, single-unit
room_type  4ca732c0-6f4f-457c-9c48-396f3d784590
rate_plan  2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8
```

Creating a booking needs `ota_name: "Offline"` and `days` as a keyed map — every
other value 500s. Modify and cancel both need the **full create-shape payload**
(cancel adds `status: "cancelled"`). The channel cannot be activated
(`422 invalid_credentials`, no real OTA sandbox account) — expected, don't chase it.

Working scripts to copy from: `scratch/cert_scenarios_7_8.php` (full cycle through
the real receiver) and `scratch/test_channex_webhook.php` (fixture-driven, now
uses the real payload shape and asserts on values).

---

## Task A — map the fields we still drop

`SHOW COLUMNS FROM guests` includes columns the receiver never writes, even though
Channex sends the data:

1. **`adults` and `children`** — separate columns, both unwritten. We only set
   `no_of_guests`. Channex sends `occupancy.adults` / `occupancy.children`
   exactly. Write them.
2. **`per_night_charges`, `total_days`, `base_room_rent`** — derivable from
   `rooms[0].days` (a per-date rate map) and the date span. Check how a *direct*
   booking populates these (`php/guests/guests.php`, `add_guest`) and match that
   convention exactly — receipts and WhatsApp vouchers read these, so an OTA
   booking that leaves them empty renders a broken bill.
3. **`is_foreign_guest`** — Channex sends `customer.country`. Indian homestays
   must file a C-Form for foreign nationals, and this app already has
   `c_form_filed_at` / `c_form_number` / `c_form_document_url` plus a whole
   C-Form flow. An Airbnb booking by a foreign guest currently arrives unflagged,
   so it silently skips that compliance path. Set the flag when `country` is
   present and not India. Find how a direct booking sets it and reuse that logic —
   don't invent a second convention.
4. **`arrival_hour`** — operationally useful (staff need to know a 2am arrival).
   Decide where it belongs (`notes` / `guest_notes` are the likely homes) and say
   what you chose.

Do **not** add new DB columns for this task. If something genuinely has nowhere to
go (e.g. guest email — there is no column for it), list it in your report as a
recommendation rather than adding a column unasked.

**Verification:** extend `scratch/test_channex_webhook.php` with an assertion per
field, in the same style as the existing `1b`/`1c`/`1d`/`3b` checks. An assertion
that only prints a value is not an assertion — compare it and print PASSED/FAILED.

## Task B — prove a cancellation puts the nights back on sale

This is the revenue-critical one. A cancelled booking whose dates stay blocked on
Airbnb is lost income, and it fails silently.

The pieces look right individually: the cancel branch enqueues an availability
outbox item, and `computeCompressedAvailability()`
(`php/channex/ari_drain_worker.php:131`) filters on
`status IN ('Booked','Active','CheckedIn')`, correctly excluding `Cancelled`.
**Nothing has tested the chain end to end.**

Write a script that:
1. Creates a booking through the real API on untouched future dates, ingests it.
2. Confirms Channex now shows those nights unavailable
   (`GET /api/v1/availability` — check the actual param names against the API,
   don't guess).
3. Cancels it, ingests the cancellation.
4. Runs the drain worker and confirms the outbox row reaches `status = 'done'`
   with a `task_id`.
5. Confirms Channex shows the nights available again.

Report the actual availability values at steps 2 and 5. If step 5 still shows the
nights blocked, that is the finding — report it, then fix it.

## Task C — concurrent redelivery must not wedge the queue

Channex redelivers any revision it hasn't been ACKed for. `revision_id` carries a
UNIQUE constraint, so two concurrent deliveries of the same revision race: one
inserts, the other hits a duplicate-key error.

Establish what happens today. The idempotency check at the top of
`handleWebhook()` is a plain `SELECT` followed later by an `INSERT` — a classic
check-then-act gap. If the loser surfaces as a 500, Channex retries forever and
the revision never clears.

The correct behaviour is that the losing request returns **success** — the
revision *is* stored, just not by that request. Test it with two rapid
back-to-back calls, and if you can, genuinely concurrent ones (two PHP processes,
or `curl --parallel`). A sequential double-call only proves the happy path, so say
which you actually ran.

---

## Ground rules

- **Verify in the database, not from return values.** A receiver response of
  `{"status":"success","message":"Revision already processed (idempotent)"}` is
  what you get for re-sending an *unchanged* revision — it is not proof anything
  was ingested. This exact thing produced misleading "success" lines twice already.
- **Use dates no earlier test has used.** A prior test's guest row triggers a
  legitimate 409 from the overlap guard — correct behaviour, not a bug.
- If a task turns out to be a non-issue, say so plainly and move on. A clean
  "checked, already correct, here's the evidence" is a useful result.

## Deliverable

Per task: what you ran, what you observed, what you changed. Quote the actual DB
rows and API responses. Where you found nothing wrong, show the evidence that
convinced you.

Don't commit or deploy unless asked.
