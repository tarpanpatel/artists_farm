# Comprehensive Channex Channel Manager Integration Audit Report

**Date:** 30 August 2026 (certification passed 2 September 2026 — see update below)  
**Environment:** Staging Sandbox (`https://staging.channex.io/api/v1`)  
**Target:** Official Channex PMS Certification (Scenarios 1–8)  
**Status:** **CERTIFIED (2 Sep 2026).** All 8 scenarios passed the live screenshare audit. Production credentials (API key, base URL, webhook secret) requested from Channex and pending — see "Post-certification" below. The "Known gaps" row below is now historical: it describes the pre-certification sandbox state, not the current one.

---

## 1. Executive Summary & Readiness Score

| Component | Status | Verification & Evidence |
|---|---|---|
| **Architecture & Adapter Pattern** | Verified | Clean adapter pattern (`ChannelManagerAdapter`, `ChannexAdapter`, `ChannexClient`) |
| **Outbox & Range Compression** | Verified | 500 days compressed into **exactly 2 API calls**; scoped drain guarantees 2 calls even on dirty queues |
| **Two-Way Booking Sync (Inbound/Outbound)** | Verified | Real sandbox lifecycle: New Booking $\rightarrow$ Modification $\rightarrow$ Cancellation all `ACKED` |
| **Live Webhook Path** | Verified | Real HTTP endpoint verified: rejects without secret header (401), accepts envelope (200), fetches revision from API, and sets `ack_status = 'ACKED'` |
| **Outbound Call Counts (Scenarios 1–5)** | Verified | Measured on live sandbox: Scenario 1 = 2 calls; Scenarios 2, 3, 4, 5 = 1 call each |
| **Stay Restrictions & Direct Availability** | Verified | `room_rate_rules` & `availability.php` enforce and display `stop_sell`, `min_stay_arrival`, `min_stay_through`, `max_stay`, `closed_to_arrival`, `closed_to_departure` |
| **PMS Dashboard UI (`#channel_manager`)** | Verified | Full Flowbite screen with connection metrics, 500d bulk push, mappings, & outbox logs |
| **Type Safety & Build Status** | Verified | `npx tsc --noEmit` passed (0 errors); `npm run build` succeeds |
| **Known gaps** | Open | Channel activation blocked (`422 invalid_credentials`, no OTA sandbox account). Scenarios 2–5 are evidenced by Channex task records rather than re-runnable tests. No scenario has yet been driven from the UI by a human |

---

## 2. Core Backend Engine Audit (`php/channex/`)

1. **`ChannexClient.php`**:
   - Connects to `https://staging.channex.io/api/v1` using `user-api-key` header.
   - Implements exponential backoff on HTTP `429` (rate limit) and `5xx` server errors.
   - Timeout handling (40s) and cURL error recovery.
2. **`content_sync.php`**:
   - Synchronizes local property structure, room types, and rate plans to Channex.
   - Persists mappings into `channex_mappings` with NULL-safe deduplication.
3. **`outbox.php`**:
   - Captures inventory and pricing changes inside calling database transactions (`add_guest`, `update_guest`, `cancel_guest`, `rate_rules`).
   - Transaction rollback leaves 0 orphan outbox rows; commit leaves exactly the required rows.
4. **`ari_drain_worker.php`**:
   - Run-length date compressor merges contiguous spans into single `date_from`/`date_to` payload blocks.
   - **Scoped Drain Support**: `processBatch(int $limit = 50, ?array $specificIds = null)` locks only the target row IDs (`FOR UPDATE`), guaranteeing Scenario 1 bulk push never absorbs unrelated queue items.
   - Captures async Channex Task UUIDs (`task_id`) from API responses for audit evidence.
5. **`webhook_receiver.php`**:
   - **Shared-Secret Authentication**: Header `X-Channex-Webhook-Secret` compared with `hash_equals()`.
   - **Notification Envelope Parsing**: Parses Channex envelope (`{"event": "booking", "payload": {"booking_id": "...", "revision_id": "..."}}`) and pulls the canonical revision from `GET /booking_revisions/:id`.
   - **State Machine Tracking**: Records `ack_status = 'PENDING' | 'ACKED' | 'FAILED'`, `ack_attempts`, `acked_at`, `ack_error`.
   - **Post-Commit ACK**: Sends `POST /booking_revisions/{id}/ack` only after the DB transaction commits.
   - **Data Mapping**: Extracts `ota_reservation_code`, detects foreign guests via `customer.country`, and establishes the guest ledger.
   - **Inventory Recalculation**: Enqueues availability recalculation outbox items on new bookings and cancellations.

---

## 3. Official Certification Scenarios Matrix (1 to 8)

| Scenario | Objective | Requirement | Test / Verification Evidence | Measured Calls | Status |
|---|---|---|---|---|---|
| **Scenario 1** | Initial Bulk ARI Push | 500 days in **exactly 2 API calls** | Tested with dirty queue (5 pre-existing pending rows). Scoped drain sent 1 availability (`Task ID: f0083fc2-7172-4720-af8b-8d2f021c8ddd`) + 1 restrictions (`Task ID: 1d7b7799-0c4d-47bd-8ff8-b41ff355a2a3`) | **2 calls** | **PASS** |
| **Scenario 2** | Change 1 Rate Plan on 1 Date | Exactly 1 call to `/restrictions` | Pushed single rate plan on single date $\rightarrow$ `Task ID: 21693cfa-de55-40ee-9797-c409e02941b7`. Read back via `GET /restrictions` returned `$175.00` | **1 call** | **PASS** |
| **Scenario 3** | Change Multiple Rate Plans, Single Date | Exactly 1 batched call | Pushed 3 rate plans (`Standard`, `Non-Refundable`, `Weekend`) in 1 batched array $\rightarrow$ `Task ID: 70995208-7460-4f11-be30-2e948f047c91` | **1 call** | **PASS** |
| **Scenario 4** | Change a 15-Day Range Across Plans | Exactly 1 batched call using `date_from`/`date_to` | Pushed 15-day range across multiple rate plans in 1 batched array $\rightarrow$ `Task ID: 612e41a5-9ccb-40f8-9f09-988c00c5dc09` | **1 call** | **PASS** |
| **Scenario 5** | Set Min Stay Across Plans | Exactly 1 batched call with `min_stay_arrival`/`min_stay_through` | Pushed 2/3 nights min stay across plans in 1 batched array $\rightarrow$ `Task ID: 08ac08e8-567e-468a-8260-90e569cbe0c4` | **1 call** | **PASS** |
| **Scenario 6** | Stop Sell / CTA / CTD | 1 batched call with composite restrictions | `room_rate_rules` carries all 6 restriction columns; `computeCompressedRestrictions()` compresses and dispatches. `availability.php` displays CTA/CTD/Min-Stay badges on public direct-booking page | **1 call** | **PASS** |
| **Scenario 7** | Inbound Booking Ingestion & ACK | Ingest booking + ACK to `/booking_revisions/{id}/ack` | Reproducible via `scratch/test_webhook_envelope_live.php`: booking `1f370817-b542-47e0-95b8-851f5c199e33` $\rightarrow$ Channex envelope (ids only) $\rightarrow$ revision `a9884ca1-ea82-49fe-a28a-200872b87636` pulled from `GET /booking_revisions/:id` $\rightarrow$ guest row 2378 persisted (450.00, 2 guests, 450.00 pending) $\rightarrow$ `ack_status = 'ACKED'`, `acked_at 2026-08-30 15:56:10`. Verified in the database, not from the return value | **Inbound** | **PASS** |
| **Scenario 8** | Inbound Modification & Cancellation | Consume revisions, update calendar, ACK each | Tested live sandbox lifecycle: <br>• **8a (Modify)**: `PUT /bookings/{id}` $\rightarrow$ Revision `009e4c81-...` $\rightarrow$ `ACKED`<br>• **8b (Cancel)**: `PUT /bookings/{id}` (`status = 'cancelled'`) $\rightarrow$ Revision `812f7eae-...` $\rightarrow$ `status = 'Cancelled'` $\rightarrow$ inventory freed $\rightarrow$ `ACKED` | **Inbound** | **PASS** |

---

## 4. Frontend & User Interface Implementation (`src/`)

1. **Navigation & Access Control**:
   - Registered `#channel_manager` route in `src/App.tsx` and `src/components/Navigation.tsx`.
   - Access restricted to `Super Admin` and `Admin`.
2. **Channel Manager Screen (`src/components/ChannelManager.tsx`)**:
   - **Connection Status Cards**: Displays real-time API connection state, environment mode, mapped units count, and outbox metrics (`Done`, `Pending`, `Failed`).
   - **Scenario 1 Bulk Push Panel**: Date range picker (default 500 days) with preset buttons. Displays returned Channex Task IDs with one-click copy buttons.
   - **Content Sync Button**: Provisions/maps property structures with confirmation modal and toast notifications.
   - **Mapped Units Table**: Displays local rooms mapped to Channex Property UUID, Room Type UUID, and Rate Plan UUID.
   - **Outbox Queue Table**: Standardized `h-10` toolbar, status filter pills, search input, task ID copy buttons, error modals, and row retry actions.
3. **Resilience & Error Boundaries**:
   - Fixed `useAuth()` crash on management routes via `useAuthOptional()` in `src/contexts/AuthContext.tsx` and `src/components/LoginPage.tsx`.
   - Wrapped all non-property return branches in `src/App.tsx` with `<ErrorBoundary section="...">` and `<ToastProvider>`.

---

## 5. Security & Operating Constraints

- **Masked Cards Model**: The PMS receives only masked card data from OTAs, never stores or processes raw PANs, and carries zero PCI compliance burden.
- **Environment Isolation**: API credentials stored in `php/config/channex_config.json` (gitignored).
- **Import Guards**: All requires of `php/channex/*` are protected with `is_file()` and `function_exists()` so branches without Channex files do not break.
- **Production Protection**: Zero modifications to production deployment scripts or live hosts.

---

## 6. Official Certification Screenshare Protocol

During the 30-minute certification screenshare with the Channex auditor:
1. **Scenario 1**: Open **System Controls $\rightarrow$ Channel Manager**, click **Push 500 Days**, and provide the auditor with the 2 generated Task IDs.
2. **Scenarios 2–6**: Use the **Rate Rules** modal to create/update rates and stay restrictions, then verify the generated Task IDs in the Outbox Log.
3. **Scenarios 7–8**: Trigger test bookings from the Channex Sandbox Simulator (`ota_name: "Offline"`) and verify live ingestion on the PMS Calendar and ACK status in the revisions log.

---

## 7. Post-certification — pending production go-live (added 2 Sep 2026)

**Certification passed.** Waiting on Channex to issue production credentials
(API key, base URL — likely `https://app.channex.io/api/v1` mirroring the
staging→app naming pattern, and a separate production `webhook_secret`).
Switching environments is config-only: `ChannexClient.php` reads all three
from `php/config/channex_config.json` and has no staging/production branching
in code.

**Correction to §4's branching note**: "merged only once certified" means
merged into **`multi-tenant`**, not `main` — `main` is an ancient,
undeployed, single-property snapshot (last commit 29 Jul 2026, no
`AuthContext`). `multi-tenant` is the actual product trunk; `channel-manager`
is `multi-tenant` + this integration. See the repo-layout memory / `git
worktree list` for the standing `artists_farm-mt` checkout on `multi-tenant`.

**Merge-readiness check (2 Sep 2026, dry-run in a disposable worktree, no
branch touched):** `channel-manager` is 133 commits ahead of `multi-tenant`,
and 14 behind — trying the merge produces conflicts in exactly 6 files:

| File | Nature |
|---|---|
| `sw.js` | Cosmetic — both branches independently bumped `CACHE_NAME` to `v23` for unrelated reasons, then `channel-manager` bumped again to `v24`. Resolve by bumping to `v25` with a comment covering both. |
| `src/components/LoadingScreen.tsx` | `multi-tenant` still has `rounded-2xl` on the boot logo; `channel-manager`'s latest commit deliberately removed rounded-corner styling from brand logo elements. Keep the removal. |
| `src/App.tsx` | Real conflict, not mechanical: `multi-tenant` still imports and renders `AIChatWidget`; `channel-manager` replaced it with the Help/FAQ `LegalDrawer` swap (2 Sep 2026, "remove all AI chat code from the site"). Needs a decision — does that removal apply product-wide, or was it scoped to this branch only? |
| `src/components/LoginPage.tsx` | 4 hunks — `multi-tenant`'s autofill-misfire fix + `useAuthOptional`/`ErrorBoundary` wrapping vs. `channel-manager`'s own login changes. Not yet triaged line-by-line. |
| `availability.php`, `php/rates/rate_rules.php` | Expected — both branches evolved the restrictions/outbox feature independently after the Phase 0 split (§5). `channel-manager`'s version is the later, more complete implementation (full restriction display; diff-scoped outbox enqueue comparing old vs. new rule state) and should win almost entirely; fold in `multi-tenant`'s "optional-require guard" comment/fix for `rate_rules.php` if `channel-manager` doesn't already have equivalent protection against a missing `php/channex/` directory. |

Nothing else conflicts — the other ~120 commits on each side (PWA/login/PMS
fixes on `multi-tenant`; the rest of the Channex build-out on
`channel-manager`) merge cleanly. Not yet resolved on the real branch —
this needs the `src/App.tsx` product decision above before merging for real,
and this checkout currently has unrelated uncommitted work in progress
(`src/components/LegalDrawer.tsx` / new `src/data/helpManual.ts` — a Help/FAQ
knowledge-base rewrite) that must not be swept into that merge.

**Sequence once production credentials arrive:**
1. Store the production key/URL/secret in a production-only
   `channex_config.json` (never committed).
2. Resolve the `multi-tenant` merge above and merge `channel-manager` in.
3. Deploy to production (`ground-code.com` / `deploy.ps1`) — this integration
   has never touched production; only staging so far.
4. Connect the real Airbnb/Booking.com listings per property inside the
   Channex dashboard — everything certified ran against the sandbox's
   Offline test channel / Certification Simulator property, not a live OTA.
5. Flip `ICAL_BLOCKING_ENABLED` back to `true` in
   `src/constants/featureFlags.ts`.
6. Settle Booking.com's payment handling per property (masked-cards breaks
   their virtual-card model) before that channel specifically goes live.
7. Watch the outbox and webhook ACK status closely on the first real
   bookings — everything tested so far was sandbox volume.
