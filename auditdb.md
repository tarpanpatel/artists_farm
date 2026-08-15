# 🗄️ MySQL Database Architecture & Performance Audit (`auditdb.md`)

> **Database**: `artists_farm_resort` (MySQL 8 / MariaDB via PHP PDO)  
> **Project**: Ground Code Resort Management (Multi-Tenant Hospitality PMS & KDS)  
> **Conducted by**: `agency-database-optimizer`  
> **Audit Date**: 14 August 2026

---

## 📊 1. Executive Summary & Health Metrics

| Metric | Current State | Target / Optimal | Status |
| :--- | :--- | :--- | :--- |
| **Total Tables** | **91 tables** (61 Core + 30 `test_*` tables) | 61 clean core tables | ⚠️ Redundant test tables in live DB |
| **Foreign Key Indexes** | 32 unindexed FK/scoping columns | 100% indexed join/filter columns | 🔴 High optimization potential |
| **Formal FK Constraints** | 16 constraints across 61 core tables | Formal FKs with `ON DELETE` rules | 🟡 Partial data integrity |
| **Storage Heavyweights** | `menu_items` (1.55 MB for 145 rows) | Offloaded binary/base64 assets | 🟡 Column bloat |
| **PDO Prepared Statements** | `ATTR_EMULATE_PREPARES => false` | Native server-side prepared statements | ✅ **Optimal** |

---

## 🚨 2. Unindexed Foreign Key & Filter Columns (32 Instances)

Every query filtering or joining on these columns triggers a **Full Table Scan (`ALL`)** in MySQL without using an index:

```text
├── guests.room_id                      (High: Executed on every calendar lookup & room allocation)
├── order_items.order_id                (Critical: Executed on every KDS ticket expansion & POS billing)
├── order_items.menu_item_id            (High: Dish sales reporting & recipe calculation)
├── billing_receipts.guest_id           (High: Folio checkout and guest payment history)
├── menu_items.category_id              (Medium: POS menu category switching)
├── cash_drawer_entries.staff_id        (High: Shift financial audit ledger)
├── guest_id_documents.property_id      (High: 24h ID verification cleanup & lookup)
├── staff_attendance.user_id            (High: Monthly staff attendance grid)
├── service_requests.room_id            (Medium: In-stay room service requests)
├── service_requests.telegram_chat_id   (Medium: Telegram dispatch lookups)
├── audit_logs.user_id                  (Low: User activity trail filtering)
├── kitchen_orders.guest_id             (High: Room service food billing)
├── kitchen_served_logs.order_id        (Medium: Order fulfillment history)
├── staff_advances.staff_id             (Medium: Staff salary ledger)
├── staff_meal_logs.property_id         (Medium: Daily meal log reconciliation)
└── telegram_pairing_codes.property_id  (Low: Bot pairing session resolution)
```

---

## ⚡ 3. High-Priority Indexing Migration Script (P1)

Execute the following SQL script to create optimal indexes for high-frequency join/filter paths:

```sql
-- 1. Guest & Calendar Occupancy Lookup (TodayOverview.tsx & BookingDetailsModal.tsx)
ALTER TABLE `guests` ADD INDEX `idx_guests_room_status` (`room_id`, `status`);
ALTER TABLE `guests` ADD INDEX `idx_guests_checkin_checkout` (`checkin_date`, `expected_checkout`);

-- 2. Kitchen KDS Orders & Itemization (KitchenManagement.tsx)
ALTER TABLE `order_items` ADD INDEX `idx_order_items_order_id` (`order_id`);
ALTER TABLE `order_items` ADD INDEX `idx_order_items_menu_item_id` (`menu_item_id`);
ALTER TABLE `kitchen_orders` ADD INDEX `idx_kitchen_orders_guest_id` (`guest_id`);
ALTER TABLE `kitchen_served_logs` ADD INDEX `idx_kitchen_served_order_id` (`order_id`);

-- 3. Billing, Receipts & Cash Drawers (BillingCheckout.tsx & CashDrawerManager.tsx)
ALTER TABLE `billing_receipts` ADD INDEX `idx_billing_receipts_guest_id` (`guest_id`);
ALTER TABLE `cash_drawer_entries` ADD INDEX `idx_cash_drawer_staff_id` (`staff_id`);

-- 4. Menu & Material Catalog Filtering (MenuManager.tsx & InventoryManagement.tsx)
ALTER TABLE `menu_items` ADD INDEX `idx_menu_items_category_id` (`category_id`);
ALTER TABLE `req_catalog` ADD INDEX `idx_req_catalog_category_id` (`category_id`);

-- 5. Staff Operations & Attendance (StaffManagement.tsx)
ALTER TABLE `staff_attendance` ADD INDEX `idx_staff_attendance_user_date` (`user_id`, `date`);
ALTER TABLE `staff_advances` ADD INDEX `idx_staff_advances_staff_id` (`staff_id`);
ALTER TABLE `staff_meal_logs` ADD INDEX `idx_staff_meal_logs_property_id` (`property_id`);

-- 6. Service Requests & Guest ID Security (ServiceRequestsManagement.tsx & GuestManagement.tsx)
ALTER TABLE `service_requests` ADD INDEX `idx_service_requests_room_status` (`room_id`, `status`);
ALTER TABLE `guest_id_documents` ADD INDEX `idx_guest_id_docs_property_id` (`property_id`);
ALTER TABLE `audit_logs` ADD INDEX `idx_audit_logs_user_id` (`user_id`);
```

---

## 🔄 4. Query Refactoring: Correlated Subquery in `get_tenants`

### Problem:
In `php/api/router.php` (lines 1390–1401), `get_tenants` executes a nested correlated subquery **for every single tenant row**:

```sql
-- ❌ BEFORE: O(N * M) nested correlated subqueries
SELECT t.*,
(SELECT COALESCE(SUM(
    CASE
        WHEN p.property_type = 'MULTI_KEY' THEN
            (SELECT COUNT(*) FROM properties r WHERE r.parent_property_id = p.id AND r.property_type = 'MULTI_KEY_ROOM' AND r.is_deleted = 0)
        ELSE 1
    END
), 0) FROM properties p WHERE p.tenant_id = t.id AND (p.property_type IS NULL OR p.property_type != 'MULTI_KEY_ROOM') AND p.is_active = 1) AS slots_used
FROM tenants t 
ORDER BY t.name ASC;
```

### Optimized Single-Pass Query:
```sql
-- ✅ AFTER: Single-pass LEFT JOIN with pre-aggregated room counts (O(N) complexity)
SELECT 
    t.*,
    COALESCE(SUM(
        CASE 
            WHEN p.property_type = 'MULTI_KEY' THEN COALESCE(r.room_count, 0)
            WHEN p.id IS NOT NULL THEN 1
            ELSE 0
        END
    ), 0) AS slots_used
FROM tenants t
LEFT JOIN properties p ON p.tenant_id = t.id AND (p.property_type IS NULL OR p.property_type != 'MULTI_KEY_ROOM') AND p.is_active = 1
LEFT JOIN (
    SELECT parent_property_id, COUNT(*) AS room_count 
    FROM properties 
    WHERE property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0 
    GROUP BY parent_property_id
) r ON r.parent_property_id = p.id
GROUP BY t.id
ORDER BY t.name ASC;
```

---

## 🧹 5. Redundant Test Tables Cleanup (30 Tables)

The live database currently contains 30 `test_*` tables left behind from testing sandbox creation. Dropping these restores schema cleanliness and reduces metadata cache overhead:

```sql
DROP TABLE IF EXISTS 
    test_audit_logs, 
    test_billing_receipts, 
    test_cash_drawer_entries, 
    test_expense_item_prices, 
    test_expense_items, 
    test_farm_utility_expenses, 
    test_financial_ledger, 
    test_guests, 
    test_inventory_items, 
    test_inventory_price_history, 
    test_kitchen_orders, 
    test_kitchen_purchases_log, 
    test_kitchen_wastage_logs, 
    test_material_categories, 
    test_menu_categories, 
    test_menu_items, 
    test_miscellaneous_catalog, 
    test_nav_menu_items, 
    test_order_items, 
    test_orders, 
    test_payee_entities, 
    test_petty_cash, 
    test_registry_payees, 
    test_req_catalog, 
    test_staff_advances, 
    test_staff_attendance, 
    test_staff_users, 
    test_stock_requisitions, 
    test_system_telegram_templates, 
    test_users;
```

---

## 💾 6. Table Storage Bloat: `menu_items`

* **Observation**: `menu_items` contains only 145 records but consumes **1,552 KB** of disk space (~10.7 KB per row).
* **Cause**: Dish images are stored inline as Base64 data URIs inside a `TEXT`/`LONGTEXT` column.
* **Remediation**:
  1. Offload uploaded dish images to disk storage (`php/uploads/menu/`).
  2. Store only relative URL paths (`VARCHAR(255)`) in the database.
  3. This will shrink table size from **1,552 KB → ~48 KB**, drastically improving cache efficiency.

---

## 🗺️ 7. Existing Formal Foreign Key Constraints

The 16 active formal foreign keys currently defined in the database:

| Child Table & Column | Parent Table & Column |
| :--- | :--- |
| `ical_synced_events.sync_config_id` | `ical_sync_configs.id` |
| `ical_sync_configs.property_id` | `properties.id` |
| `license_expiry_notifications.license_id` | `property_licenses.id` |
| `license_expiry_notifications.property_id` | `properties.id` |
| `properties.tenant_id` | `tenants.id` |
| `properties.parent_property_id` | `properties.id` |
| `property_audit_log.property_id` | `properties.id` |
| `property_licenses.property_id` | `properties.id` |
| `property_modules.property_id` | `properties.id` |
| `property_requests.tenant_id` | `tenants.id` |
| `property_requests.property_id` | `properties.id` |
| `property_requests.reviewed_by` | `users.id` |
| `property_shared_data.property_id` | `properties.id` |
| `tenant_users.tenant_id` | `tenants.id` |
| `tenant_users.user_id` | `users.id` |
| `users.default_tenant_id` | `tenants.id` |

---

## 📋 8. Prioritized Execution Checklist

- [ ] **Phase 1 (Immediate)**: Run the P1 Indexing Script to optimize calendar, KDS, and checkout queries.
- [ ] **Phase 2 (Performance)**: Update `get_tenants` in `php/api/router.php` with the single-pass JOIN query.
- [ ] **Phase 3 (Cleanup)**: Drop the 30 redundant `test_*` tables from the primary `artists_farm_resort` database.
- [ ] **Phase 4 (Storage)**: Migrate `menu_items` Base64 image strings to filesystem paths.
