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

---

*Last Updated: August 2026*
