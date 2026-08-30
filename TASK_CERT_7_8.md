# Task: Complete Channex certification scenarios 7 & 8

**Repo:** `c:\xampp\htdocs\artists_farm` — work on branch **`channel-manager`**
(check with `git branch --show-current`; switch if needed).

**Read first:** `CLAUDE.md` (project rules — never touch production, don't commit
unless asked, minimal comments) and `CHANNEX_IMPLEMENTATION.md` (integration brief).

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

---

## Background

This PMS is being certified against Channex (channel manager). Scenarios 1–6
(outbound rates/availability) are done and verified. Scenarios 7 & 8 cover
inbound booking ingestion:

- **7:** receive a new booking → ingest into our DB → send ACK
- **8:** receive a modification → ingest → ACK; then a cancellation → ingest → ACK

Certification requires recording the **booking id, revision id, and ACK result**
for each step.

## Sandbox objects (already provisioned — do not recreate)

```
property   4286428a-5561-4508-bd28-1f9ae55d8795   USD, single-unit
room_type  4ca732c0-6f4f-457c-9c48-396f3d784590   count_of_rooms: 1
rate_plan  2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8   USD
group      df43207a-cc42-497d-8813-6590744c748c
```

## Established facts — do not re-derive, this cost hours

`POST /api/v1/bookings` returned 500 for every documented payload. Two
undocumented requirements fix it:

1. **`days` is a keyed map, not an array of objects.** Channex's published docs
   show the form that fails:
   ```php
   'days' => ['2027-03-10' => '120.00', '2027-03-11' => '120.00']   // WORKS
   'days' => [['date' => '...', 'amount' => '...']]                  // 500
   ```
2. **`ota_name` must be `"Offline"`.** Thirteen OTA-style values (`OpenChannel`,
   `AirBNB`, `BookingCom`, `Booking.com`, `Direct`, `Manual`, `API`, the channel
   title, the channel UUID…) all return 500.

Working create payload:

```php
['booking' => [
  'property_id' => $PROP, 'ota_name' => 'Offline',
  'ota_reservation_code' => 'CERT-1234',
  'arrival_date' => '2027-03-10', 'departure_date' => '2027-03-13',
  'payment_collect' => 'property', 'currency' => 'USD',
  'customer' => ['name' => 'Cert', 'surname' => 'Guest', 'mail' => 'cert@example.com'],
  'rooms' => [[
    'room_type_id' => $RT, 'rate_plan_id' => $RP,
    'days' => ['2027-03-10' => '120.00', '2027-03-11' => '120.00', '2027-03-12' => '120.00'],
    'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
  ]],
]]
```

Do **not** send `status` or `total_price` on create.

**Modification is also solved:** `PUT /bookings/{id}` requires the **full
create-shape payload** with changed dates — not the partial payload the docs
imply. Verified: booking `14b84faa-2f85-4eff-8c6b-9e6b778e37ff` moved from
revision `d5eca2de-…` to a new revision `488e9457-…`, HTTP 200.

**Also note:** the channel (`3bde9156-…`) cannot be activated —
`422 invalid_credentials`, because we have no real OTA sandbox account. This is
expected and does **not** block scenarios 7–8. Don't try to fix it.

---

## What to do

### Step 1 — Solve cancellation

`PUT {"booking":{"status":"cancelled"}}` returns:

```
422 {"booking":{"currency":["can't be blank"],"arrival_date":[...],"ota_name":[...]}}
```

It almost certainly needs the **full create shape plus `status: "cancelled"`**,
matching the modification pattern. `DELETE /bookings/{id}` returns 404, so that
isn't the route. Confirm the working shape and verify it produces a **new
revision id**.

### Step 2 — Run the full cycle

`scratch/cert_scenarios_7_8.php` already creates a booking, fetches each
revision, and feeds it to the real `ChannexWebhookReceiver`. Update it with the
correct modify/cancel shapes and run it.

**Use dates no earlier test has used.** A prior test's guest row will otherwise
trigger a legitimate 409 from the overlap guard — that's correct behaviour, not
a bug.

### Step 3 — Fix a known gap

`guests.ota_reservation_code` stays NULL. The column exists and the API returns
the value; the receiver just never maps it. Read `payload.ota_reservation_code`,
falling back to `payload.system_id`.

---

## Verification — this is the part that matters

For each of the three steps, confirm **in the database**, not from a return value:

- A **new, distinct revision id** was generated. The receiver returns
  `{"status":"success","message":"Revision already processed (idempotent)"}` when
  handed the *same* revision again — that is **not** proof a modification was
  ingested. This exact thing produced three misleading "success" lines earlier.
- `guests` reflects the change: row created (7), dates updated (8a), status
  cancelled (8b).
- `channex_booking_revisions.ack_status = 'ACKED'` with `acked_at` set.

## Deliverable

Report: the booking id, all **three distinct** revision ids, ACK status per step,
and the resulting guest row state after each. State plainly what you executed and
what you observed — if a step didn't produce a new revision, say so rather than
reporting the idempotent response as success.

Don't commit or deploy unless asked.
