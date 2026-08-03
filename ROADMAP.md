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

*Last Updated: August 2026*
