# Kilo Task Instructions & Implementation Roadmap (kilo1.md)

> **Context**: Ground Code Resort Management (Multi-Tenant Hospitality PMS & KDS)  
> **Target Persona**: Full-Stack Senior Developer & Database Optimizer  
> **Output Rule**: Output surgical diffs only. Do not rewrite entire files.

---

## 🎯 Active Tasks for Kilo

### Task 1: Fix Staff Attendance Demo Seeding (`demo_data.php`)
* **Problem**: `staff_attendance.user_id` column is typed as `INT(11)`, but demo staff user IDs are strings like `DEMO-xxxxx`.
* **Instructions**:
  1. In `php/api/demo_data.php` (or wherever demo attendance is seeded), use the numeric auto-increment `id` of the created `staff_users` rows (or fetch `SELECT id FROM staff_users WHERE property_id = ?`).
  2. Generate 14 days of realistic clock-in / clock-out records for active property staff.
  3. Ensure attendance statuses (`Present`, `Late`, `Half Day`, `Absent`) match the UI attendance log in `StaffManagement.tsx`.

---

### Task 2: Realistic iCal Feed & Blocked-Dates Seeding
* **Goal**: Seed realistic OTA calendar synchronization for demo properties.
* **Instructions**:
  1. **Table `ical_sync_configs`**:
     - Insert 2 connected channels per demo property:
       - Channel 1: `Airbnb Calendar` (`feed_url: https://www.airbnb.com/calendar/ical/...`, `sync_interval: 15`, `is_active: 1`)
       - Channel 2: `Booking.com Calendar` (`feed_url: https://admin.booking.com/hotel/hoteladmin/ical.html?...`, `sync_interval: 30`, `is_active: 1`)
  2. **Table `ical_synced_events`**:
     - Insert 3–5 realistic future and past synced reservation blocks (`summary: 'Airbnb Reservation - John Doe'`, `start_date`, `end_date`, `room_id`).
  3. Verify that synced events render as blocked/occupied dates on the multi-key calendar (`TodayOverview.tsx` / `ICalSyncManager.tsx`).

---

### Task 3: Security Hardening (Identity & Access Control)
* **Goal**: Close the 2 vulnerabilities flagged in the IAM security audit.
* **Instructions**:
  1. **Remove `X-Admin-Username` Header Trust**:
     - In `php/api/router.php` (around lines 443–453), remove the fallback check reading `$_SERVER['HTTP_X_ADMIN_USERNAME']`.
     - Platform admin rights must derive **strictly** from `$_SESSION['is_platform_admin']` or `$_SESSION['role'] === 'root_admin'`.
  2. **Harden Session Cookie Options**:
     - In `php/api/authenticate.php` and `php/api/router.php`, update `setcookie('artists_farm_session', ...)` to pass modern cookie options:
       ```php
       $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? 80) == 443;
       setcookie('artists_farm_session', session_id(), [
           'expires' => time() + 86400 * 7,
           'path' => '/',
           'secure' => $isHttps,
           'httponly' => true,
           'samesite' => 'Lax'
       ]);
       ```

---

## 🛡️ Role & Architecture Invariants (Keep in Mind)

* **Real Roles**:
  - `Root Admin` (Platform scope, `is_platform_admin = 1`)
  - `Super Admin` (Tenant owner, `default_tenant_id = T`)
  - `Admin` (Property administration)
  - `Staff Supervisor` (Operations & roster management)
  - `Staff Kitchen` (Kitchen KDS & inventory only)
  - `Staff` (General tasks)
* **Capability Flags**:
  - `is_financial_handler` (Staff permitted to access Cash Drawer & record petty cash)
  - `access_all_properties` (Staff permitted across all properties of the tenant)
* **UI Modals**: Must use `z-60` or higher to sit on top of fixed header (`z-57`) and sidebar (`z-[56]`).
