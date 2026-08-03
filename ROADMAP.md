# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System.

---

## 🔴 Phase 1: Critical Fixes & User Flow Integrity

- [ ] **Logout & Login Redirect Flow**
  - **Issue:** `logout.php` redirects to `/artists_farm/login.php` and `dashboard.php` redirects to `/artists_farm/tenant_login.php`, but neither `login.php` nor `tenant_login.php` exists at the root.
  - **Action:** Create a unified `login.php` page or configure `.htaccess` rewrite rules to route `/login` cleanly to the React frontend auth route without 404 errors.

- [ ] **Icon Resolution Error (`Navigation.tsx`)**
  - **Issue:** `lucide-react` does not export `Door` (causing ES module import failure and white-screen error in dev mode).
  - **Action:** Update import in `Navigation.tsx` from `Door` to `DoorOpen` or `DoorClosed`.

- [ ] **Active Resident Date-Range & Status Validation**
  - **Issue:** Room views display guests as active residents even if their checkout date has passed or if their status in DB defaulted to `Active`.
  - **Action:** Enforce strict filtering in `OperationalDashboard.tsx` and `MultiKeyPropertyOverview.tsx`:
    ```typescript
    const activeResident = guests.find(g => 
      g.status === 'Active' && 
      checkinDate <= today && 
      expectedCheckout >= today
    );
    ```

---

## 🟡 Phase 2: Inactive UI Buttons & Backend API Implementations

- [ ] **Room Name Editor API (`MultiKeyPropertyOverview.tsx`)**
  - **Button:** `Edit Name` on room header card.
  - **Action:** Implement `UPDATE properties SET name = ? WHERE id = ? AND property_type = 'MULTI_KEY_ROOM'` in `php/api/multikey_properties.php` and wire up the `onUpdateRoomName` handler.

- [ ] **Booking Management Actions (`OperationalDashboard.tsx`)**
  - **Buttons:** `Update Booking` and `Delete Booking`.
  - **Action:** Implement `update_booking` and `delete_booking` PHP API handlers in `php/guests/guests.php` and replace stubs at lines 518 & 577 in `OperationalDashboard.tsx`.

- [ ] **Telegram Notification Template Sync (`TelegramNotificationModal.tsx`)**
  - **Button:** `Load Templates`.
  - **Action:** Implement `fetchTemplatesFromDB()` in `src/services/api.ts` and connect it to `php/telegram/` API endpoints.

- [ ] **Recipe Builder Stock Depletion (`KitchenManagement.tsx`)**
  - **Button:** `Deplete Stock`.
  - **Action:** Create backend API action `deplete_recipe_stock` to reduce ingredient quantities in the `inventory` table based on dish recipe formulas.

- [ ] **Dynamic Staff Meal Options (`KitchenManagement.tsx`)**
  - **Dropdown:** Staff Meal Options.
  - **Action:** Replace hardcoded `smMealOptions` array with dynamic API endpoint `get_staff_meal_options`.

---

## 🟢 Phase 3: Enhancements & Platform Optimization

- [ ] **Automated iCal Sync Background Worker**
  - **Action:** Set up a scheduled cron task or server background worker to automatically trigger `ical_sync.php` at regular intervals (e.g. every 15 minutes) for all connected Airbnb/Booking.com calendars.

- [ ] **Multi-Property Financial Ledger Reports**
  - **Action:** Expand `AnalyticsDashboard.tsx` to include comparative revenue, occupancy rate breakdown, and expense totals across parent and sub-key properties.

- [ ] **Expense Item Icons in Frontend Dropdowns**
  - **Problem:** `getExpenseItemIcon()` (added in `src/utils/expenseIcons.ts`) currently only renders icons in `DefaultExpensesManager.tsx`'s card grid (Root Admin view). Wherever a guest-facing/staff-facing dropdown lists expense/misc-charge items — e.g. `GuestManagement.tsx`'s charge-category picker, `MiscChargesManagement.tsx`, `ExpenseItemsManagement.tsx` — options are still plain text.
  - **Action:** Since `StyledSelect` already accepts `React.ReactNode` for an option's `label`, wire `getExpenseItemIcon(item.label, item.category)` into each of those option lists the same way, so the icon shows consistently everywhere an expense item appears, not just the admin management screen.

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
  - **Shipped as:** `kitchen_order_reminder`/`kitchen_pickup_reminder` added to `system_telegram_templates` (seeded via `manager.php`'s default array for fresh installs) — they show up in the existing `TelegramNotificationModal.tsx` templates catalog/editor automatically, no new UI needed since that editor is already generic. **Still open:** service-request-created/fulfilled templates, blocked on that feature not existing yet.

- [ ] **Webhook (production) / Polling (local) Receive Path — Environment-Conditional**
  - **Action:** Mirror the existing `database.php` dev-vs-production detection pattern. On `localhost`/`127.0.0.1`/XAMPP, poll Telegram's `getUpdates` (triggered on page load or a short interval — no public HTTPS endpoint needed, works everywhere). On the real domain, register a proper webhook (instant, no polling delay). Both paths feed the same internal "new Telegram message/button-tap received" handler so the rest of the system (pairing codes, Mark Fulfilled callbacks) doesn't need to know which mode is active.
  - **Partial:** the Setup Wizard's pairing-code detection (below) implements an on-demand `getUpdates` poll (`pollAndMatchPairingCodes` in `php/telegram/pairing.php`), but that's scoped to pairing only, not the general environment-conditional dispatcher described here. A real production webhook path (`telegram_webhook.php`) already existed pre-session for button callbacks; the local/production auto-switch for it is still not built.

- [x] **Zero-Friction Telegram Setup Wizard (Critical for Tenant Onboarding)** — *Done 2026-08-03/04*
  - **Problem:** A non-technical tenant currently has no guided way to connect Telegram at all. A naive "create your own bot via BotFather, find your chat ID, paste your token" flow is realistically an hour+ of confusion for a non-tech-friendly user and a major onboarding drop-off risk.
  - **Shipped as:** `TelegramSetupWizard.tsx` — 3-step (Kitchen/Admin/Finance) guided flow with circles-with-text progress, auto-generated pairing codes, live pairing-status polling, one-tap test-send, and honest "no bot connected yet" messaging when the platform bot isn't configured. Bot username fetched live via `getMe` rather than hardcoded. **Still open:** "bring your own bot" advanced option (deferred, opt-in only — not started).
  - **Not yet verified live:** no real Telegram bot token is configured in the dev environment, so the actual group-pairing round trip has only been verified via simulated DB state, not a real Telegram message.

---

*Last Updated: August 2026*
