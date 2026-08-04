# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System.

---

## 🔴 Phase 1: Critical Fixes & User Flow Integrity

*Re-verified 2026-08-04 — all three items below were already resolved by earlier work, unrelated to this note. Keeping them logged rather than deleting, in case the underlying fix ever regresses.*

- [x] **Logout & Login Redirect Flow**
  - **Verified:** `logout.php`/`dashboard.php` now redirect to `/artists_farm/` and `/artists_farm/root_dashboard` (the React app's own routes), not the nonexistent `login.php`/`tenant_login.php` this item originally described.

- [x] **Icon Resolution Error (`Navigation.tsx`)**
  - **Verified:** No `Door` import exists in `Navigation.tsx` anymore — already using a valid Lucide icon.

- [x] **Active Resident Date-Range & Status Validation**
  - **Verified:** `OperationalDashboard.tsx` already does the full check — `g.status === 'Active' && today >= checkinDate && today < checkoutDate`. `MultiKeyPropertyOverview.tsx` filters by `room_id` and delegates to the same `OperationalDashboard` logic, so it inherits the fix.

---

## 🟡 Phase 2: Inactive UI Buttons & Backend API Implementations

- [x] **Room Name Editor API (`MultiKeyPropertyOverview.tsx`)** — *Done 2026-08-04*
  - **Was:** Frontend already called `action=update_room_name` correctly - no backend handler existed at all, so the call silently 400'd (default "Invalid action" response).
  - **Shipped as:** `updateRoomName()` in `php/api/multikey_properties.php` (scoped to `property_type = 'MULTI_KEY_ROOM'`, proper 404 if not found) + router dispatch. No frontend changes needed. Verified end-to-end through the real endpoint: rename, confirm in DB, rename back, plus both error paths (nonexistent room → 404, missing new_name → 400).

- [x] **Booking Management Actions (`OperationalDashboard.tsx`)** — *Done 2026-08-04*
  - **Was:** Both Save and Delete had real confirmation UI but were literal `// TODO` comments underneath — silently discarded whatever the user thought they'd just changed or removed.
  - **Shipped as:** Save wired to the already-existing (but never-connected) `handleUpdateGuest` in `App.tsx`, with the three previously-uncontrolled inputs (Guest Name/Phone/Number of Guests) converted to controlled state so their edited values are actually readable. Delete needed a new `delete_guest` action from scratch (`php/guests/guests.php` + router dispatch + `deleteGuestFromDB` in `api.ts`), threaded through `MultiKeyPropertyOverview` down to `OperationalDashboard`. Both now show success/error toasts and a loading state instead of failing silently. Verified through the real endpoint end-to-end (update persisted, delete removed the row, re-deleting an already-gone booking correctly 404s).

- [x] **Telegram Notification Template Sync (`TelegramNotificationModal.tsx`)** — *Done 2026-08-04*
  - **Was:** The Templates Catalog only ever displayed the hardcoded `FALLBACK_TEMPLATES` array — any template that existed only in the DB (like `kitchen_order_reminder`/`kitchen_pickup_reminder`, added earlier this session) was invisible in the editor even though it worked correctly at send time. An earlier note in this file claiming "no new UI needed" for those two templates was wrong.
  - **Shipped as:** `fetchTemplatesFromDB()` in `src/services/api.ts` (full records, not just content) merged into the catalog on mount — DB content/metadata overrides a matching hardcoded entry (preserving its inline-button config, since `system_telegram_templates` has no buttons column), and any DB-only key is appended as a new catalog entry. Re-fetches after a save so edits don't get clobbered by a later kitchen-module-toggle re-merge.

- [x] **Recipe Builder Stock Depletion (`KitchenManagement.tsx`)**
  - **Verified:** Already implemented — `depleteStockForDish()` in `src/services/api.ts` calls a `deplete_stock` action (`php/kitchen/menu.php`), wired into `handleMarkDishServed` for automatic BOM-based ingredient depletion when a dish is served.

- [x] **Dynamic Staff Meal Options (`KitchenManagement.tsx`)** — *Done 2026-08-04*
  - **Shipped as:** New `staff_meal_options` table (self-healing create + seed-on-first-use with the original two defaults, matching the `manager.php` seeding pattern), `get_staff_meal_options`/`add_staff_meal_option` actions in `php/kitchen/menu.php`. Saving a custom meal now persists it (previously vanished on refresh, same as everything below). Verified through the real endpoint: fetch auto-seeds, added option appears in the next fetch, dropdown in the browser shows exactly the two DB-seeded options.
  - **Found but out of scope for this pass:** `smLogs` (the "Monthly Tracking Log" of who ate what/when) is *also* 100% local-state-only with zero DB persistence — every logged staff meal vanishes on refresh, not just the options list. Worth its own item if this matters.

---

## 🟢 Phase 3: Enhancements & Platform Optimization

- [x] **Staff Meal Log Persistence (`KitchenManagement.tsx`)** — *Done 2026-08-04*
  - **Was:** The "Monthly Tracking Log" (`smLogs`) was entirely local React state, seeded from hardcoded demo rows — every meal logged via "Record Consumption" vanished on the next page refresh.
  - **Shipped as:** New `staff_meal_logs` table (property_id, staff_names, food_description, is_leftover_buffer, logged_at) + `get_staff_meal_logs`/`add_staff_meal_log` actions in `php/kitchen/menu.php`. Table now starts genuinely empty (no fake seed rows, unlike the options table — these are real logs) and fetches from DB on mount. Verified in-browser: logged a real meal, confirmed it appeared in the table, reloaded the page, confirmed the entry survived the reload.

- [ ] **Automated iCal Sync Background Worker**
  - **Action:** Set up a scheduled cron task or server background worker to automatically trigger `ical_sync.php` at regular intervals (e.g. every 15 minutes) for all connected Airbnb/Booking.com calendars.

- [x] **Multi-Property Financial Ledger Reports** — *Done 2026-08-04 (sub-key room comparison)*
  - **Shipped as:** New "Room-by-Room Performance Comparison" card in `AnalyticsDashboard.tsx`'s Bookings tab, visible only for MULTI_KEY parent properties (`isMultiKeyProperty` + `rooms` now threaded in from `App.tsx`'s `preloadedData.currentProperty`). Groups the existing `receipts` prop by `roomNumber` to show each sub-key room's booking count, revenue, and occupancy % (booked room-nights ÷ elapsed days in the selected date filter) side by side — no backend changes needed, all data was already present on `BillingReceipt`. Occupancy % is intentionally blank on "All Time" (no fixed period to divide by) with an inline explanation. Verified in-browser on Goa Homes (4 rooms) in both light and dark mode, and re-checked after switching the date filter to "This Month" to confirm the occupancy math updates correctly.
  - **Not done:** true cross-parent-property comparison (e.g. Goa Homes vs. a different tenant property) — each property is a fully isolated DB scope today, so that would need a new tenant-level aggregation endpoint. Sub-key rooms share one parent's data already, which is what this shipped.

- [ ] **Expense Item Icons in Frontend Dropdowns**
  - **Problem:** `getExpenseItemIcon()` (added in `src/utils/expenseIcons.ts`) currently only renders icons in `DefaultExpensesManager.tsx`'s card grid (Root Admin view). Wherever a guest-facing/staff-facing dropdown lists expense/misc-charge items — e.g. `GuestManagement.tsx`'s charge-category picker, `MiscChargesManagement.tsx`, `ExpenseItemsManagement.tsx` — options are still plain text.
  - **Action:** Since `StyledSelect` already accepts `React.ReactNode` for an option's `label`, wire `getExpenseItemIcon(item.label, item.category)` into each of those option lists the same way, so the icon shows consistently everywhere an expense item appears, not just the admin management screen.

- [ ] **GST Billing Support**
  - **Problem:** No way to generate a GST-compliant bill for guests who need one (common for business travelers billing their company). No GSTIN field exists anywhere in the backend yet.
  - **Action:** Add a GSTIN field on `properties` (the property's own registration number, needed on any GST invoice regardless of guest) and an optional per-guest/per-receipt GSTIN + billing name (for guests who want the invoice addressed to their company, not themselves personally) - likely on `guests` or captured at checkout time on the receipt record. Frontend: an optional "GST Bill" toggle in the checkout/receipt flow that, when the guest provides a GSTIN, generates a proper tax invoice (property GSTIN, guest/company GSTIN, tax breakdown - CGST/SGST or IGST depending on same-state vs. inter-state) instead of the regular receipt. Needs the correct GST rate(s) for this business category - not hardcoded, should come from a config value so it can be updated if rates change.

---

## 🔵 Phase 4: Staff Task & Service Request System (Telegram-Integrated)

**Design decisions locked in (2026-08-03):**
- Exactly 3 Telegram groups per tenant, no more: **Kitchen, Admin, Finance** — matches the 3 chat-ID columns already on `properties` (`telegram_kitchen_chat_id`/`telegram_admin_chat_id`/`telegram_finance_chat_id`). No new department table needed. Ready-for-pickup nudges and service requests (housekeeping etc.) route to **Admin**; kitchen order nudges route to **Kitchen**.
- Any logged-in staff member can create a service request — no role restriction.
- Every reminder/nudge message is always specific (references the exact order/item/room/request) — never a generic "you have pending tasks" message.
- Webhook vs. polling: build both, environment-conditional (see below) — testing locally now, but must also work once deployed to the real domain, same pattern as the existing `database.php` localhost-vs-production detection.

- [x] **Shared Reminder/Nudge Engine (used by all three reminder types below)** — *Done 2026-08-04*
  - **Behavior:** Auto-nudge fires every N minutes (default 5, per-property configurable setting — not hardcoded) while an item stays unaddressed. A manual "Send Reminder" tap sends immediately *and* resets the auto-nudge countdown, so the next nudge (auto or manual) is N minutes from whichever reminder — auto or manual — fired most recently, not from the original event time.
  - **Shipped as:** `order_items.last_reminder_at` (+ `ready_at`), `check_stale_reminders`/`update_item_reminder_timestamp` actions in `php/kitchen/orders.php`, a 60s poll in `KitchenManagement.tsx`. `reminderThresholdMinutes` lives in the property's telegram config, editable in Connection Settings. **Caveat:** still page-open-triggered, not a true server cron — same accepted tradeoff as the iCal sync gap below, since no background worker exists yet.

- [x] **Kitchen Order Reminders (Stale Order Nudge)** — *Done 2026-08-04*
  - **Problem:** An order (e.g. 2x noodles) has been sitting in "Pending" status a while with no chef action. Manager/waiter has no way to nudge the kitchen besides walking over.
  - **Shipped as:** Manual "Send Reminder" button (amber Bell icon) on pending order rows + auto-fire via the nudge engine, both referencing the specific order/dish/table/elapsed-time, to the **Kitchen** chat.

- [x] **Ready-for-Pickup Reminders** — *Done 2026-08-04*
  - **Problem:** Chef marks a dish "Ready" but the server hasn't collected it from the pass yet.
  - **Shipped as:** Same nudge engine, mirrored for Ready → Served, to the **Admin** chat, with a "Tap when Served" inline button. Fixed a real underlying bug along the way: "Ready" status previously only lived in React state and reverted to Pending-looking on page refresh — now persisted server-side (`item_status`/`ready_at`).

- [ ] **Generalized Guest Service Requests (Housekeeping, Maintenance, etc.)**
  - **Problem:** No way to log/track ad-hoc guest requests not tied to a kitchen order — e.g. guest in Room 101 calls for fresh towels. Currently manager has no system-tracked way to relay this to housekeeping or confirm it was completed.
  - **Action:** New `service_requests` table (property_id, room_id, request_type, description, requested_by, status, created_at, last_reminder_at, fulfilled_at, fulfilled_by, telegram_message_id) + UI (any staff) to create a request (room + quick-pick or free-text description) → sends Telegram message to the **Admin** chat with an inline "Mark Fulfilled" button → staff taps it, status updates to Fulfilled, message edits to show who/when. Uses the same shared nudge engine for follow-up reminders if left unfulfilled. Not started.

- [x] **Editable Message Templates for Reminders** — *Done 2026-08-04 (reminders only)*
  - **Problem:** Kitchen reminder, ready-for-pickup reminder, service-request-created, and service-request-fulfilled messages must not be hardcoded strings in code (see [no-hardcoding principle]) — tenants should be able to customize wording per property.
  - **Shipped as:** `kitchen_order_reminder`/`kitchen_pickup_reminder` added to `system_telegram_templates` (seeded via `manager.php`'s default array for fresh installs). Correction to an earlier note here claiming "no new UI needed" — that was wrong, the catalog only showed hardcoded templates at the time; it now correctly shows and lets you edit both (see the Phase 2 Template Sync fix below). **Still open:** service-request-created/fulfilled templates, blocked on that feature not existing yet.

- [ ] **Webhook (production) / Polling (local) Receive Path — Environment-Conditional**
  - **Action:** Mirror the existing `database.php` dev-vs-production detection pattern. On `localhost`/`127.0.0.1`/XAMPP, poll Telegram's `getUpdates` (triggered on page load or a short interval — no public HTTPS endpoint needed, works everywhere). On the real domain, register a proper webhook (instant, no polling delay). Both paths feed the same internal "new Telegram message/button-tap received" handler so the rest of the system (pairing codes, Mark Fulfilled callbacks) doesn't need to know which mode is active.
  - **Partial:** the Setup Wizard's pairing-code detection (below) implements an on-demand `getUpdates` poll (`pollAndMatchPairingCodes` in `php/telegram/pairing.php`), but that's scoped to pairing only, not the general environment-conditional dispatcher described here. A real production webhook path (`telegram_webhook.php`) already existed pre-session for button callbacks; the local/production auto-switch for it is still not built.

- [x] **Zero-Friction Telegram Setup Wizard (Critical for Tenant Onboarding)** — *Done 2026-08-03/04*
  - **Problem:** A non-technical tenant currently has no guided way to connect Telegram at all. A naive "create your own bot via BotFather, find your chat ID, paste your token" flow is realistically an hour+ of confusion for a non-tech-friendly user and a major onboarding drop-off risk.
  - **Shipped as:** `TelegramSetupWizard.tsx` — 3-step (Kitchen/Admin/Finance) guided flow with circles-with-text progress, auto-generated pairing codes, live pairing-status polling, one-tap test-send, and honest "no bot connected yet" messaging when the platform bot isn't configured. Bot username fetched live via `getMe` rather than hardcoded. **Still open:** "bring your own bot" advanced option (deferred, opt-in only — not started).
  - **Not yet verified live:** no real Telegram bot token is configured in the dev environment, so the actual group-pairing round trip has only been verified via simulated DB state, not a real Telegram message.

---

## 🟣 Phase 5: Guest ID Verification & Check-in Compliance (Telegram-Integrated)

**Design intent (2026-08-04):** Managed as its own compliance-tracking system (same "list of items with a status" shape as the Expenses management pages), not folded into the general check-in form. Guest count (from `guests.no_of_guests`) determines how many ID documents are required per booking — a booking isn't "complete" until every guest on it has an uploaded ID.

- [x] **Check-in ID Upload Flow** — *Done 2026-08-04*
  - **Problem:** No system-tracked way to confirm every guest on a booking has had their ID photographed and filed at check-in — currently informal/paper-based or untracked entirely.
  - **Shipped as:** `CheckinVerificationModal.tsx`, opened via a new "Check-in ID Verification" status button (Pending/Complete badge) inside the existing Edit Booking modal in `OperationalDashboard.tsx`. Renders one upload slot per `numberOfGuests` (no hardcoded single-guest assumption); each slot uploads to the existing `upload_image.php` endpoint (extended with an `id_documents` folder mode — downscale-only up to 1600px, never cropped, unlike the menu/catalog thumbnails, since ID photos must stay legible) then saves the returned URL via a new `upload_id_document` action. New self-healing `guest_id_documents` table (id, guest_id, property_id, guest_index, file_path, uploaded_at, uploaded_by; unique on guest_id+guest_index so re-uploading a slot replaces it) and `id_verification_status` column on `guests` (`Pending`/`Complete`, independent of booking `status`) in `php/guests/guests.php`. "Check-in Complete" is disabled until `guest_id_documents` count ≥ `no_of_guests`; `complete_checkin_verification` re-validates that server-side before flipping the status (never trusts the client count). Status badge updates live across the whole component tree the instant verification completes, via a new `onGuestVerificationUpdated` callback threaded App.tsx → OperationalDashboard.tsx and App.tsx → MultiKeyPropertyOverview.tsx → OperationalDashboard.tsx (the latter path's `onUpdateBooking`/`onDeleteBooking` were themselves discovered disconnected at the App.tsx call sites while wiring this — fixed at the same time, since Booking Management Actions were silently non-functional for every multi-key property until now).
  - **Pre-existing bugs found and fixed while building this** (none were caused by this feature, but the ID upload flow was the first caller to actually exercise these code paths end-to-end): (1) `php/uploads/.htaccess` blocked `.php` execution for the entire `php/uploads/` directory it lived in, including `upload_image.php` itself — every image upload (menu items, catalog, this feature) 403'd unconditionally. Moved the `.htaccess` down into `php/uploads/images/` so it only blocks execution of untrusted uploaded files, not the trusted handler. (2) The `gd` PHP extension was commented out in `php.ini`, so even past the 403 fix, every upload fatal-errored on `imagecreatefromstring()`. Enabled it and restarted Apache. (3) `upload_image.php`'s returned `url` was built by string-diffing the file path against `DOCUMENT_ROOT`, which silently never matched on Windows (backslash paths vs. forward-slash `DOCUMENT_ROOT`) and returned a raw absolute filesystem path instead of a URL. Rebuilt from `SCRIPT_NAME` instead (the URL path Apache actually used to reach the script), which is deployment-path-agnostic. (4) PNG uploads routed through the JPEG-save branch renamed the file path from `.png` to `.jpg` *after* writing to disk, so the reported filename never matched what was actually saved — reordered so the rename happens before the write. (5) `fetchGuestsFromDB()` in `api.ts` rebuilds guest objects field-by-field rather than passing the API response through, so the newly-added `idVerificationStatus` field was silently dropped on every fetch — the status badge showed "Complete" immediately after saving (from local state) but reverted to "Pending" on the next page load until this was added to the mapper.
  - **Verified:** end-to-end via curl (upload → save → fetch → complete, including the "0 of N uploaded" and "1 of 2 uploaded" rejection paths, plus delete/re-upload) and in-browser via Playwright on Goa Homes/Room 101 — uploaded a real file through the actual file input, watched the thumbnail/date/counter update, completed verification, confirmed the badge updated live in the parent modal, then did a **hard page reload** and confirmed the "Complete" status and uploaded document both genuinely persisted (this is what caught bug #5 above). Test data cleaned up from the DB and filesystem after.

- [ ] **Telegram Notification on Completion**
  - **Action:** The moment the last required ID for a booking is uploaded and "Check-in Complete" is tapped, send a message to the property's **Admin** chat with the guest name/room and the uploaded ID photo(s) attached. Needs a new `sendTelegramPhoto`/`sendTelegramMediaGroup` helper in `php/telegram/sender.php` (the existing `sendRawTelegramMessage` is text-only) and a new editable template (see the no-hardcoding principle — same pattern as the Kitchen reminder templates) for the caption text.

- [ ] **Next-Morning Pending Reminder**
  - **Problem:** If IDs weren't uploaded at check-in time, nobody currently gets reminded to go back and complete it.
  - **Action:** Reuses the Shared Reminder/Nudge Engine's `last_reminder_at` pattern, but with a fixed "next morning" trigger instead of a rolling N-minute interval — needs its own scheduled check (e.g. "guests with `id_verification_status = 'Pending'` and `checkin_date` before today, not yet reminded today"), sent to the **Admin** chat, referencing the specific guest/room. Same underlying gap as the rest of the Reminder Engine and the Phase 3 iCal sync task: no real background worker exists yet, so this needs that same eventual cron solution — a page-load-triggered check doesn't reliably fire "next morning" the way a real scheduled job would.
  - **Action:** Staff resolves a pending reminder by opening that booking's "Complete Check-in" flow from the app (same UI as above) and uploading the outstanding ID(s), which flips `id_verification_status` to `Complete` and stops further reminders for that booking.

---

*Last Updated: August 2026*
