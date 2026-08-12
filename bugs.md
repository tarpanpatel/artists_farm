# Artists Farm Resort - Bug Report

**Generated:** 2026-08-12  
**Total Bugs:** 26 (5 Critical, 5 High, 10 Medium, 6 Low)

---

## 🔴 Critical Bugs

### 1. Multi-tenant guest data collision in `fetchGuestsFromDB`
**File:** `src/services/api.ts:833`  
**Lines:** 872, 858  
**Issue:** Deduplication key (`uniqueKey = name|phone|checkin|room`) doesn't include `property_id`. Guests from different properties with same name/phone/checkin/room will collide and one will be dropped.  
**Impact:** Data loss in multi-tenant deployments.

### 2. Room conflict check uses wrong identifier
**File:** `src/components/GuestManagement.tsx:834`  
**Lines:** 834-842  
**Issue:** Compares `g.roomNumber` (display name "Room 101") to form's `roomNumber`, but line 839 uses `(g as any).roomId` (DB PK). Mismatch between display name and DB ID causes false positives/negatives if room names aren't unique.

### 3. Checkout today guests lose distinction in tab filtering
**File:** `src/components/BillingCheckout.tsx:107,128`  
**Lines:** 107, 128, 146-151  
**Issue:** `getGuestDetailedStatus()` returns `'checkout_today'` but `getGuestTabCategory()` maps both `checkin_today` AND `checkout_today` to `'today'` tab. Badges correctly distinguish (line 149-151) but tab filtering loses it.

### 4. Guest status constants mismatch between frontend and backend
**File:** `src/components/GuestManagement.tsx:276` vs `php/guests/guests.php:274`  
**Issue:** Frontend checks `GUEST_STATUS_ACTIVE_LEGACY` ('Active') OR `GUEST_STATUS_CHECKED_IN` ('Checked In'). Backend uses `GUEST_STATUS_CHECKED_IN` ('CheckedIn') as canonical. Constants don't match.

### 5. Dead testing mode code still attached to every API request
**File:** `src/services/api.ts:181,188`  
**Lines:** 181-186, 188-197  
**Issue:** `isTestingModeActive()` reads `localStorage.getItem('artists_farm_testing_mode')` but CLAUDE.md confirms Test button and demo mode UI were removed (Aug 12, 2026). Nothing sets this flag, but `getTestingHeaders()` still attaches `X-Testing-Mode` header to every API call.

---

## 🟠 High Severity Bugs

### 6. CORS header defaults to production domain for unlisted origins
**File:** `php/config/database.php:27`  
**Issue:** `header('Access-Control-Allow-Origin: ' . (in_array($origin, $allowed_origins) ? $origin : 'https://artistic-sthan.com'))` - unlisted origins get production domain as allowed origin. Weird but not directly exploitable since credentials aren't sent for unlisted origins.

### 7. calculateGuestTotal uses per-night rate as full-stay fallback
**File:** `src/components/BillingCheckout.tsx:352`  
**Issue:** `const roomCharges = guest.totalAmount ?? guest.roomRate ?? 0;` - `roomRate` is per-night (from `per_night_charges`), `totalAmount` is full stay (`total_charge`). If `totalAmount` is 0, falls back to per-night rate → massive undercharge for multi-night stays.

### 8. GST calculation divides by nights twice if roomCharges is already per-night
**File:** `src/components/ReceiptEditModal.tsx:310-321`  
**Lines:** 316, 296  
**Issue:** `dailyRate = roomCharges / nightsForGst` but `roomCharges` at line 296 is `guest.roomRate || guest.totalAmount || 0`. If it's `roomRate` (per-night), dividing again by nights = wrong GST slab.

### 9. Check-in/out datetime concatenation misses time component
**File:** `src/components/GuestManagement.tsx:812-813`  
**Issue:** `const newCheckinStr = checkinTime ? \`${checkinDate} ${checkinTime}:00\` : checkinDate;` - if user doesn't select time, sends `YYYY-MM-DD` without time → backend may default to 00:00:00. `expectedCheckout` defaults to +2 days at 00:00:00.

### 10. Room guest filtering no null check on selectedRoom
**File:** `src/components/MultiKeyPropertyOverview.tsx:213-217`  
**Lines:** 216, 196  
**Issue:** `return guestRoomId && Number(guestRoomId) === Number(selectedRoom.id);` - if room not found, `selectedRoom` is undefined (caught at line 196) but no guard in filter callback.

---

## 🟡 Medium Severity Bugs

### 11. SQL returns property name as roomNumber for SINGLE property type
**File:** `php/guests/guests.php:207`  
**Issue:** `COALESCE(r.name, IF(p.property_type = 'SINGLE', p.name, 'Unassigned'))` - for SINGLE properties, shows property name as "roomNumber". Frontend expects "Room 101" format → display mismatch.

### 12. roomRate fallback logic treats "0.00" string as truthy
**File:** `src/services/api.ts:882-883`  
**Issue:** Comment says `per_night_charges` is legacy "0.00" string. Code uses `parseFloat(g.perNightCharges ?? g.per_night_charges ?? '0') || 0` - correctly handles "0.00" via `|| 0` after parseFloat, but complex and fragile.

### 13. Room number search case-sensitivity inconsistency
**File:** `src/components/BillingCheckout.tsx:242`  
**Issue:** `g.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())` - DB comparison is case-sensitive, frontend search is case-insensitive. Inconsistent behavior.

### 14. selectedGuestId initializes once, never updates when guests change
**File:** `src/components/KitchenManagement.tsx:691`  
**Issue:** `const [selectedGuestId] = useState<string>(checkedInGuests[0]?.id || '');` - initializes once. If checked-in guests change, `selectedGuestId` stays stale.

### 15. todayGuests filter includes "Active" status guests regardless of dates
**File:** `src/components/Header.tsx:71-76`  
**Lines:** 73-75  
**Issue:** Line 75 includes `g.status === GUEST_STATUS_ACTIVE_LEGACY` - catches "Active" status guests even if checkin/checkout dates don't match today.

### 16. API base URL resolution fails on non-standard dev ports
**File:** `src/services/api.ts:10-15`  
**Issue:** `_isDev` checks ports 3000/5173/5174/8080 only. Port 3001, 4000, etc. → `_isDev = false` → `_base` tries to extract from pathname. Fragile for non-standard dev ports.

### 17. Default room selection useEffect has no cleanup for rooms changes
**File:** `src/components/GuestManagement.tsx:169-199`  
**Issue:** Multiple conditions but no cleanup if `rooms` changes. `preSelectRoom` is room NAME but line 177 checks `r.name === preSelectRoom`. Line 182 falls back to using `preSelectRoom` directly (could be slug, not name).

### 18. sendPropertyTelegramMessage deduplicates chatIds silently
**File:** `php/telegram/sender.php:125-141`  
**Lines:** 138  
**Issue:** `array_unique($chatIds)` - if same chatId in multiple groups, only sends once. Could be intentional but not documented.

### 19. buildRoomGroups match order prioritizes single-property incorrectly
**File:** `src/components/BillingCheckout.tsx:305-309`  
**Lines:** 270  
**Issue:** `rooms.length === 0` check at line 270 means single-property ALWAYS matches first room. If `rooms.length > 0` and guest has `room_id`, matches by ID - correct but order matters.

### 20. Stock depletion matches menu item by name only (case-insensitive)
**File:** `src/components/KitchenManagement.tsx:253-259`  
**Issue:** `menu.find((m) => m.name.toLowerCase() === item.name.toLowerCase())` - if two menu items have same name (different categories), picks first. No `categoryId` or `menuItemId` match.

---

## 🟢 Low Severity / Code Quality Issues

### 21. FormatDateDDMMYYYY doesn't handle all input formats
**File:** `src/utils/dateUtils.ts:11-33`  
**Issue:** Handles `DD/MM/YYYY`, `DD MMM YYYY`, `YYYY-MM-DD`, and JS Date parse. May fail on edge cases like `DD-MM-YYYY` or timestamps with milliseconds.

### 22. convertSnakeToCamel doesn't handle nested objects
**File:** `php/guests/guests.php:7-14`  
**Issue:** Only converts top-level keys. Nested objects/arrays keep snake_case. Frontend expects camelCase throughout.

### 23. No TypeScript types for API response shapes
**File:** `src/services/api.ts`  
**Issue:** Functions return `Promise<any[]>` or `Promise<any>`. No strict typing for API responses → runtime errors not caught at compile time.

### 24. useEffect dependencies missing in several components
**Files:** Multiple  
**Issue:** Several `useEffect` hooks have `// eslint-disable-next-line react-hooks/exhaustive-deps` comments suppressing warnings. May cause stale closures.

### 25. Hardcoded magic strings for status values
**Files:** `src/constants/guestStatus.ts`, `php/config/guest_status.php`  
**Issue:** Status strings duplicated between frontend constants and PHP constants. Single source of truth missing.

### 26. No input sanitization on guest name/notes in frontend
**Files:** `src/components/GuestManagement.tsx:892-894`  
**Issue:** Guest name/notes inserted directly into React state and sent to API. Backend validates but frontend shows raw input in UI before save → potential XSS if rendered unsafely elsewhere.

---

## Summary by File

| File | Critical | High | Medium | Low | Total |
|------|----------|------|--------|-----|-------|
| `src/services/api.ts` | 2 | 1 | 1 | 1 | 5 |
| `src/components/GuestManagement.tsx` | 1 | 1 | 2 | 2 | 6 |
| `src/components/BillingCheckout.tsx` | 1 | 1 | 2 | 1 | 5 |
| `src/components/ReceiptEditModal.tsx` | 0 | 1 | 0 | 0 | 1 |
| `src/components/MultiKeyPropertyOverview.tsx` | 0 | 1 | 0 | 0 | 1 |
| `src/components/KitchenManagement.tsx` | 0 | 0 | 2 | 1 | 3 |
| `src/components/Header.tsx` | 0 | 0 | 1 | 0 | 1 |
| `src/utils/dateUtils.ts` | 0 | 0 | 0 | 1 | 1 |
| `php/guests/guests.php` | 0 | 0 | 1 | 1 | 2 |
| `php/config/database.php` | 0 | 1 | 0 | 0 | 1 |
| `php/telegram/sender.php` | 0 | 0 | 1 | 0 | 1 |
| **Total** | **5** | **5** | **10** | **6** | **26** |

---

## Most Impactful Bugs (Fix First)

1. **Multi-tenant guest data collision** (`api.ts:872`) - Data loss in production
2. **Room conflict check wrong identifier** (`GuestManagement.tsx:834`) - Booking conflicts missed
3. **Per-night vs full-stay charge confusion** (`BillingCheckout.tsx:352`, `ReceiptEditModal.tsx:316`) - Revenue calculation errors
4. **Testing mode dead code** (`api.ts:181`) - Unnecessary header on every request
5. **Guest status constant mismatch** (frontend vs backend) - Status filtering broken