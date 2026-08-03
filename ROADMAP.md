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

---

## 🔵 Phase 4: Staff Task & Service Request System (Telegram-Integrated)

- [ ] **Kitchen Order Reminders (Stale Order Nudge)**
  - **Problem:** An order (e.g. 2x noodles) has been sitting in "Pending" status a while with no chef action. Manager/waiter has no way to nudge the kitchen besides walking over.
  - **Action:** Add a "Send Reminder" button on pending kitchen order rows (visible once elapsed time crosses a DB-configurable threshold, not hardcoded) that posts a Telegram message to the property's kitchen chat referencing the specific order.

- [ ] **Ready-for-Pickup Reminders**
  - **Problem:** Chef marks a dish "Ready" but the server hasn't collected it from the pass yet.
  - **Action:** Same reminder mechanism as above, mirrored for the "Ready" → "Served" gap, notifying the server/floor staff Telegram chat instead of kitchen.

- [ ] **Generalized Guest Service Requests (Housekeeping, Maintenance, etc.)**
  - **Problem:** No way to log/track ad-hoc guest requests not tied to a kitchen order — e.g. guest in Room 101 calls for fresh towels. Currently manager has no system-tracked way to relay this to housekeeping or confirm it was completed.
  - **Action:** New `service_requests` table (property_id, room_id, request_type, description, requested_by, assigned_department, status, created_at, fulfilled_at, fulfilled_by, telegram_message_id) + UI to create a request (room + quick-pick or free-text description) → sends Telegram message with an inline "Mark Fulfilled" button to the assigned department's chat → staff taps it, status updates to Fulfilled, message edits to show who/when.
  - **Note:** requires a Telegram bot webhook (or polling `getUpdates`, simpler for local dev without a public HTTPS endpoint) to receive the button-tap callback and update the DB. See discussion in conversation for open design questions (department chat routing, whether reminders are automatic or manually triggered, per-property config).

- [ ] **Editable Message Templates for Reminders & Service Requests**
  - **Problem:** Kitchen reminder, ready-for-pickup reminder, service-request-created, and service-request-fulfilled messages must not be hardcoded strings in code (see [no-hardcoding principle]) — tenants should be able to customize wording per property.
  - **Action:** Extend the existing `telegram_templates` table (already created in the Phase 1 hardcoded-data refactor) with entries for these new message types, supporting placeholder variables (`{{room}}`, `{{item}}`, `{{elapsed_minutes}}`, `{{staff_name}}`, `{{guest_name}}`) that get substituted at send time. Add a template editor UI (likely inside `TelegramNotificationModal.tsx` or a new settings section) so tenant admins can edit wording without a developer.

- [ ] **Zero-Friction Telegram Setup Wizard (Critical for Tenant Onboarding)**
  - **Problem:** A non-technical tenant currently has no guided way to connect Telegram at all. A naive "create your own bot via BotFather, find your chat ID, paste your token" flow is realistically an hour+ of confusion for a non-tech-friendly user and a major onboarding drop-off risk.
  - **Design (shortest viable path — see conversation for full reasoning):**
    1. **Shared platform bot, not per-tenant bots.** Ship one bot the platform owns; tenants search for it by name and add it to their group like any contact. Eliminates the BotFather flow entirely for the default path.
    2. **Auto-detected chat ID, not manual lookup.** App generates a short one-time pairing code (e.g. `FARM-KITCHEN-8321`) shown in-app. Tenant creates their Telegram group, adds the bot, and pastes that one code as a message. App (via `getUpdates` poll or webhook) detects which chat received the code and auto-pairs that chat ID to the correct tenant + department — no numeric chat ID ever shown to the tenant.
    3. **One-tap "Send Test"** posts immediately into that specific group so the tenant gets instant, visible confirmation it worked.
    4. **Repeat per department** (Kitchen, Admin, Housekeeping, etc.) — same 3-step loop each time, all inside one guided in-app wizard with progress indicator.
    5. **Optional advanced path:** "bring your own bot" (paste a custom token from BotFather) for tenants who want their own branded bot name/avatar — not the default, offered as an opt-in for advanced users only.
  - **Action:** Build `TelegramSetupWizard.tsx` (step-by-step, one department at a time) + backend endpoints for code generation, `getUpdates` polling/pairing, and test-send. Depends on the webhook/polling decision from the Service Requests task above, since both features share the same "receive from Telegram" infrastructure.

---

*Last Updated: August 2026*
