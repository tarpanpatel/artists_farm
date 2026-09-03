# Channex.io Channel Manager Integration: Technical & Commercial Spike

**Date**: 30 August 2026  
**Scope**: Evaluation, Data Modeling, Ingestion Architecture, & Commercial Analysis (No live production wiring).  
**References**:
- Channex REST API & verified payload shapes (`daviesevan-svg/channex-claude-skill`).
- Artists Farm PMS codebase (`availability.php`, `php/rates/rate_rules.php`, `php/guests/guests.php`, `php/api/ical_sync.php`).

---

## 1. Technical Evaluation

### Question 1: Does the Data Model Fit?
**Answer: Yes, cleanly for both `SINGLE` (whole-property) and `MULTI_KEY` (multi-room) properties.**

* **Channex Hierarchy**: `Property` (UUID) $\rightarrow$ `Room Type` (UUID) $\rightarrow$ `Rate Plan` (UUID).
* **Artists Farm PMS Hierarchy**:
  1. **Single-Key Properties** (`property_type = 'SINGLE'`): The entire property is rented as one unit with 0 child rooms in the `rooms` table.
     - *Mapping*: 1 Channex Property $\rightarrow$ 1 Channex Room Type (`title = property.name`, `count_of_rooms = 1`, `room_kind = "room"`) $\rightarrow$ 1+ Rate Plans (`Standard Rate`, `Non-Refundable`).
     - *Cleanliness*: In Channex, a whole-home villa/homestay is represented natively with `count_of_rooms = 1`.
  2. **Multi-Key Properties** (`property_type = 'MULTI_KEY'`): Property contains multiple child rooms/villas (`rooms` table).
     - *Mapping*: 1 Channex Property $\rightarrow$ $N$ Channex Room Types (1 per `room_id`, `count_of_rooms = 1` or category grouped) $\rightarrow$ Rate Plans per room type.

---

### Question 2: Can We Push Availability + Rates + Restrictions?
**Answer: Yes, with field-level delta scoping and date-range compression.**

* **Availability**: Pushed to `POST /api/v1/availability`.
  - For single properties, `availability: 1` when vacant, `availability: 0` when booked/blocked.
* **Rates & Restrictions**: Pushed to `POST /api/v1/restrictions`.
  - Driven directly by our existing engine (`php/rates/rate_rules.php` + default room tariff).
  - Supports:
    - Base rate (`rate` in minor units / cents/paise).
    - `min_stay_arrival` (mapped from rule minimum stay).
    - `stop_sell` (mapped from rule block/closed status).
    - `closed_to_arrival` / `closed_to_departure`.
* **Optimization**:
  - Channex accepts field-level partial updates (a payload with only `rate` does not clobber `min_stay`).
  - Run-length range compression (`date_from` to `date_to`) avoids sending individual days.
  - Past dates (`date < today`) must be filtered before pushing.

---

### Question 3: How Do Inbound Bookings Arrive and Map to `guests`?
**Answer: Inbound Revisions Feed / Webhook with Ack-After-Apply and Concurrency Locking.**

* **Transport**:
  - Webhook delivery (`POST https://staging.ground-code.com/php/api/channex_webhook.php`) or polling `GET /api/v1/booking_revisions/feed`.
  - **Ack-after-apply**: Revisions are acknowledged via `POST /api/v1/booking_revisions/{id}/ack` ONLY after the database transaction commits.
* **Concurrency & Integrity (Critical)**:
  - Inbound booking creation **must reuse** `add_guest` logic from `php/guests/guests.php` using pessimistic row locking (`SELECT ... FOR UPDATE` on the property/room) to prevent double bookings under high concurrency.
  - Idempotency is maintained by storing `channex_booking_id` and `channex_revision_id`.
  - OTA modifications inspect `expected_updated_at` before applying changes.

---

### Question 4: Real Integration Effort Estimate
**Total Estimate: 5–7 Engineering Days**

| Phase | Component | Scope | Estimate |
|---|---|---|---|
| **1. Core Client & Mapping** | `php/channex/channex_client.php` | API client, JSON:API wrapper, retry/backoff, tenant credential storage (`channex_mappings` table). | 1.5 Days |
| **2. Content & Rate Plan Sync** | `php/channex/content_sync.php` | Idempotent provisioning of Properties, Room Types, and Rate Plans from local DB. | 1.0 Day |
| **3. Outbound ARI Push** | `php/channex/ari_pusher.php` | Real-time push on booking creation/cancellation and rate rule edits; debounced bulk pusher. | 1.5 Days |
| **4. Inbound Booking Ingestion** | `php/channex/webhook_handler.php` | Webhook receiver, `SELECT ... FOR UPDATE` booking insertion into `guests`, OTA payment parsing, acking. | 1.5 Days |
| **5. Testing & UI Controls** | `src/components/ChannexSyncModal.tsx` | Staging sandbox testing (Booking.com, Airbnb simulators), error logging, manual sync trigger. | 1.0 Day |

---

## 2. Commercial & Operational Analysis

### 1. Billing Classification: Hotel ($7/mo) vs Vacation Rental ($0.50/unit/mo)
* **Structure**: Channex charges a **Whitelabel Platform Fee** ($130/month) plus a per-property or per-unit monthly fee.
* **Classification**:
  - Standalone villas and homestays are registered as **Vacation Rental Units** ($0.50/unit/month).
  - Multi-room boutique hotels/resorts are billed under the **Hotel Property** tier ($7.00/property/month).
* **Cost Impact**:
  - For a portfolio of 15 whole-property villas: $130 (base) + 15 × $0.50 = **$137.50 / month**.
  - No per-booking fees or commissions are charged by Channex.

### 2. MakeMyTrip / Goibibo (MMT) Connectivity
* **Integration**: Supported via Channel Code `GMT`.
* **Owner Requirements**:
  - The property owner must have an existing contracted **Ingot / MMT Extranet account** with a valid Hotel ID.
  - Channex connects via MMT's Channel Manager API using the owner's credentials.
  - Sub-10 unit properties can connect as long as they are live on MMT Extranet.

### 3. Airbnb Connectivity
* **Integration**: Direct official 2-way API partner.
* **Host Requirements**:
  - Standard Airbnb Host accounts are supported via OAuth connection.
  - Professional Host tools are automatically enabled upon connecting a channel manager.
  - Transitioning off iCal removes calendar sync delays and allows instant booking with automated rate sync.

### 4. Hidden Costs & Considerations
* **No Setup Fees**: Channex does not charge onboarding fees.
* **Staging Sandbox**: Free test environment (`staging.channex.io`) for end-to-end booking simulations.
* **Commission Neutral**: Moving from iCal to Channel Manager API does not increase standard OTA commissions.
