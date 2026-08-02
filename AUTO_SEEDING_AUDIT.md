# Auto-Seeding Code Audit

**Date:** 2026-08-02  
**Status:** ✅ Documented

This document lists all locations where the system automatically inserts default/demo data.

---

## 1. **REMOVED: Stock Requisitions** ❌ DELETED
**File:** `php/inventory/inventory.php:69-77`  
**Status:** ✅ REMOVED  
**What was inserted:**
- 3 default stock requisition entries (IDs: 1166, 1165, 1164)
- Items: Green Pea, Hari Mirchi, Black Pepper, Basmati Rice, Ajino Moto

**Action Taken:** Removed auto-seeding - new properties now start with empty stock logs

---

## 2. **Default Expenses (Seed File)**
**Files:** 
- `php/api/multikey_properties.php:9-12`
- `php/finance/petty_cash.php:7-10`
**Type:** Function include (not data insertion)  
**What:** Loads `php/seed/default_expenses.php` which contains 20 expense categories + 160+ items  
**When:** When MultiKey properties are created or when expense items are requested  
**Impact:** ✅ **INTENDED** - System default expenses should populate for all MultiKey properties

---

## 3. **Audit Logs - Demo Data**
**File:** `php/audit/audit.php:34-54`  
**Type:** Conditional seeding (appears to be test-related)  
**What:** Creates seed audit log entries  
**Condition:** Only when `$seedLogs` array is processed  
**Impact:** Needs review - unclear when this runs

---

## 4. **Guest Records - Demo Data**
**File:** `php/guests/guests.php:13-44`  
**Type:** Conditional seeding  
**What:** Creates seed guest records:
- 3 demo guests with check-in dates, room numbers, etc.  
**Condition:** When `get_guests` is called and table structure needs initialization  
**Impact:** ⚠️ **ISSUE** - New properties get 3 fake guest records

**Demo Guests:**
```php
[
  ['guest_name' => 'John Doe', 'phone_number' => '+1-234-567-8900', 'checkin_date' => '2025-10-01', 'expected_checkout' => '2025-10-05'],
  ['guest_name' => 'Jane Smith', 'phone_number' => '+1-987-654-3210', 'checkin_date' => '2025-10-02', 'expected_checkout' => '2025-10-06'],
  ['guest_name' => 'Bob Johnson', 'phone_number' => '+1-555-123-4567', 'checkin_date' => '2025-10-03', 'expected_checkout' => '2025-10-07']
]
```

---

## 5. **Kitchen Orders - Demo Data**
**File:** `php/kitchen/orders.php:14-44`  
**Type:** Conditional seeding  
**What:** Creates seed kitchen orders and order items  
**Condition:** When `get_orders` is called  
**Impact:** ⚠️ **ISSUE** - New properties get 3 fake orders + items

**Demo Orders:**
- Order 1001: Butter Chicken (2x), Garlic Naan (3x)
- Order 1002: Paneer Tikka (1x), Tandoori Roti (2x)
- Order 1003: Palak Paneer (2x), Basmati Rice (1x)

---

## 6. **Kitchen Menu Items - Demo Data**
**File:** `php/kitchen/orders.php:32-44` (inside order seeding)  
**Type:** Conditional seeding  
**What:** Creates seed menu items  
**Impact:** ⚠️ **ISSUE** - Menu gets pre-populated with items

---

## 7. **Staff Users - Demo Data**
**File:** `php/staff/staff.php:53-71`  
**Type:** Conditional seeding (test-mode only)  
**What:** Creates 5 demo staff users:
```
- Alice Johnson (Manager, Active)
- Bob Smith (Chef, Active)
- Carol White (Waiter, Active)
- David Brown (Cleaner, Active)
- Eve Davis (Assistant, Active)
```
**Condition:** Only in testing mode  
**Impact:** ✅ **SAFE** - Only in test mode

---

## 8. **Payees - Demo Data**
**File:** `php/staff/staff.php:72-81`  
**Type:** Conditional seeding (test-mode only)  
**What:** Creates 3 demo payees  
**Condition:** Only in testing mode  
**Impact:** ✅ **SAFE** - Only in test mode

---

## 9. **Attendance Records - Demo Data**
**File:** `php/staff/staff.php:262-281`  
**Type:** Conditional seeding (test-mode only)  
**What:** Creates demo attendance logs  
**Condition:** Only in testing mode  
**Impact:** ✅ **SAFE** - Only in test mode

---

## 10. **Inventory Category Names - Seed Data**
**File:** `php/inventory/inventory.php:371-385`  
**Type:** Conditional seeding  
**What:** Creates default ingredient categories:
```
- Produce
- Meat & Poultry
- Dairy & Eggs
- Pantry Staples
- Spices & Seasonings
```
**Condition:** When inventory is accessed and categories table is empty  
**Impact:** ✅ **INTENDED** - Kitchen categories should exist

---

## 11. **Default Properties - Database Init**
**File:** `php/config/database.php:64-85`  
**Type:** One-time setup (INSERT IGNORE)  
**What:** Creates 2 default properties (if they don't exist):
- 'Artists Farm Jaipur' (slug: jaipur)
- 'Artists Farm Goa' (slug: goa)
**Impact:** ✅ **SAFE** - Uses INSERT IGNORE, won't overwrite existing

---

## 12. **Property Modules Auto-Enable**
**File:** `php/api/router.php:369`  
**Type:** On property creation  
**What:** Enables kitchen module by default:
```php
INSERT INTO property_modules (property_id, module_slug, is_enabled) VALUES (?, 'kitchen', 1)
```
**Impact:** ✅ **INTENDED** - Kitchen should be enabled by default

---

## 13. **Super Admin User - On Property Creation**
**File:** `php/api/router.php:362`  
**Type:** On property creation  
**What:** Creates Super Admin staff user for new property  
**Impact:** ✅ **INTENDED** - Property needs admin user

---

## Summary Table

| Type | File | Data | Status | Impact |
|------|------|------|--------|--------|
| Stock Requisitions | inventory.php | 3 fake orders | ❌ REMOVED | Clean |
| Guests | guests.php | 3 demo guests | ⚠️ REVIEW | Messy |
| Kitchen Orders | orders.php | 3 demo orders | ⚠️ REVIEW | Messy |
| Kitchen Menu | orders.php | Items | ⚠️ REVIEW | Messy |
| Staff Users | staff.php | 5 users | ✅ TEST ONLY | Safe |
| Payees | staff.php | 3 payees | ✅ TEST ONLY | Safe |
| Attendance | staff.php | Logs | ✅ TEST ONLY | Safe |
| Inventory Categories | inventory.php | 5 categories | ✅ INTENDED | Good |
| Default Properties | database.php | 2 properties | ✅ SAFE | Good |
| Property Modules | router.php | Kitchen enabled | ✅ INTENDED | Good |
| Admin User | router.php | Super Admin | ✅ INTENDED | Good |

---

## ⚠️ Issues Requiring Fix

### Issue 1: Guest Records Auto-Seeding
**File:** `php/guests/guests.php:13-44`  
**Problem:** New properties get 3 fake guest records  
**Recommendation:** Remove or make conditional (testing mode only)

### Issue 2: Kitchen Orders Auto-Seeding
**File:** `php/kitchen/orders.php:14-44`  
**Problem:** New properties get 3 fake orders with items  
**Recommendation:** Remove or make conditional (testing mode only)

### Issue 3: Kitchen Menu Auto-Seeding
**File:** `php/kitchen/orders.php:32-44`  
**Problem:** Menu gets pre-populated  
**Recommendation:** Remove or make conditional (testing mode only)

---

## ✅ Fixed

- ✅ **Stock Requisitions** - REMOVED (section 1)
- ✅ **Guest Records** - REMOVED (section 4)  
- ✅ **Kitchen Orders** - REMOVED (section 5)
- ✅ **Kitchen Menu Items** - REMOVED (section 6)

---

## 📋 Action Summary

**Files Modified:**
1. `php/inventory/inventory.php` - Removed stock requisition seeding
2. `php/guests/guests.php` - Removed 10 demo guest records
3. `php/kitchen/orders.php` - Removed 11 demo orders + 25 order items

**Result:** 
✅ New properties now start completely clean with **zero demo/fake data**

