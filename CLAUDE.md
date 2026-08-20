# Ground Code Resort - AI Project Rules & Conventions

This file documents ALL project conventions and rules. Every AI agent must follow these rules without exception.

## 🎨 UI & Design Rules

**`DESIGN.md` no longer maintains a separate hand-written design spec (removed 19 Aug 2026)** - the project now strictly follows Flowbite's own design system instead of a parallel rule set that had drifted out of sync with it (see `DESIGN.md` for what replaced it: pointers to `node_modules/flowbite-react/dist/components/*/theme.js` as the real ground truth, and to flowbite.com/application-ui/demo/ for whole-page patterns - **not** flowbite.com/docs/components/*, which is on an unreleased newer token system). Before building any new table, modal form, or summary-card UI, check what `flowbite-react` component already covers it rather than hand-rolling something.

### Protected Components (do not touch without explicit permission)
- **`MultiRoomCalendar.tsx`/`CalendarView.tsx`** (the multi-room booking calendar grid) - proprietary, custom-built PMS logic (booking grid rendering, date math). Never refactor, restyle, or otherwise modify these without the user explicitly asking - including as part of a broader Flowbite-migration sweep. `DateRangePicker.tsx` is NOT in this list - it's in scope for the Flowbite migration like any other shared component.

### Icon Library (CRITICAL)
- **Use ONLY Lucide React icons** (`lucide-react` package)
- NO other icon libraries (FontAwesome, Material-UI, etc.)
- Examples: `Building`, `Users`, `Calendar`, `LogOut`, `DollarSign`, etc.
- This includes: sidebar icons, button icons, navigation icons, property type icons
- Search Lucide docs: https://lucide.dev/

### Color & Styling
- Use Tailwind CSS only
- Follow existing color scheme: blue-600 (primary), emerald-600 (success), red-600 (error), amber-600 (warning)
- Dark mode support: use `dark:` prefix for all colors
- Always include dark theme variants

### Component Library (Flowbite React & Core Flowbite Code - Standard across entire site)
- **Core Flowbite Source Repository & Component Codes**:
  - Reference: **https://github.com/themesberg/flowbite/tree/main/content/components**
  - These are the standard, canonical Flowbite component codes and markup patterns to be used all over the site.
- **Standing rule (Active Full Site Migration)**: `flowbite-react` (+ the `flowbite` Tailwind plugin and official Flowbite markup patterns from the repo above) are the standard across all pages, modals, forms, and tables.
- For **new** components/screens, and anything getting rebuilt or updated: use official Flowbite components (forms, modals, inputs, checkboxes, dropdowns, tabs, buttons, badges, tables, tooltips, drawers, etc.) matching the core Flowbite implementation.
- The **existing** hand-built shared components (`src/components/Input.tsx`, `StyledSelect.tsx`, `Button.tsx`, `Tooltip.tsx`, etc.) are still in active use across most of the app and are NOT dead code - don't delete or bypass them ad hoc. They get replaced screen-by-screen as part of the migration.
- Always include dark theme variants (`dark:` prefix) and use Lucide icons (`lucide-react`).

### Category Filter Toggle Pattern
- On all screens with search and category filtering (e.g. `MenuManager.tsx`, `InventoryManagement.tsx`, `KitchenManagement.tsx`), category filter pills/bars **must not be open by default**.
- Provide a `<Filter className="w-4 h-4" />` toggle button immediately next to the search input.
- Reveal category pills only when the user clicks the filter toggle button.
- Show an active dot indicator on the filter button when a non-default category is filtered while the bar is collapsed.

### Date Format (CRITICAL)
- **Display format: DD/MM/YYYY** (e.g., `02/08/2026`, `15/12/2025`)
- Never show time component in date displays unless specifically required
- Use this format in all UI: guest profiles, booking details, calendar labels, etc.
- Conversion function:
  ```typescript
  const formatDate = (dateStr: string) => {
    const dateOnly = dateStr.split(' ')[0]; // Remove time if present
    const parts = dateOnly.split('-'); // Split YYYY-MM-DD
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // Convert to DD/MM/YYYY
  };
  ```

## 🧠 State & Data Management

### Field Name Conventions
- **Database**: snake_case (e.g., `guest_name`, `checkin_date`, `room_id`)
- **API Response**: camelCase (e.g., `guestName`, `checkinDate`, `roomNumber`)
- **React Components**: camelCase properties
- Apply `convertSnakeToCamel()` in PHP API responses
- Apply field mapping in `fetchGuestsFromDB()` in `src/services/api.ts`

### Multi-Tenant Architecture
- Property hierarchy: SINGLE (root) → MULTI_KEY (parent) → MULTI_KEY_ROOM (child rooms)
- URL pattern: `/artists_farm/{tenant_slug}/{property_slug}/`
- Example: `localhost:3010/artists_farm/vrikshawan/goa-homes/`
- Filter child rooms: `.filter((p) => p.property_type !== 'MULTI_KEY_ROOM')`

### Multi-Key Rooms & Bookings
- **1 room = 1 active booking maximum** (no duplicate bookings in same room)
- Guests can represent multiple people via `no_of_guests` field
- Room matching: Compare `guest.roomNumber` (formatted name "Room 101") with `room.name`
- Room ID field in guests table: `room_id` (foreign key to properties table)

## 📱 Component Structure

### Props Threading
- Pass props down explicitly from App.tsx → Child Components
- Example: `onCheckoutGuest`, `onSetActiveMenuItemKey`, `isMultiKeyProperty`
- Don't rely on context for business logic (use it only for ToastContext, StaffContext, etc.)
- **Property-level settings fan out wide.** `propertyGstin`/`propertyMapsLink`/`propertyPhone`/`propertyWhatsappTemplate`/`propertyUpiId` all originate in `App.tsx` (from `preloadedData.currentProperty`) and pass through up to 3 wrapper components (`MultiKeyPropertyOverview` → `OperationalDashboard`/`BillingCheckout` → `GuestManagement`/`ReceiptEditModal`/`BookingDetailsModal`) before reaching the leaf that actually builds a WhatsApp share or voucher. When adding a new property-level setting that needs to reach a share/voucher screen, `grep` an existing one (e.g. `propertyUpiId`) across `src/` to find every call site that needs the new prop added - App.tsx alone has 4+ separate render call sites for the same component (main render, Global Add Booking Modal, etc.) and it's easy to miss one.

### Modal & Dialog Rules
- Always include close button (X icon from Lucide)
- Include Cancel + Action buttons
- Use fixed positioning with backdrop: `fixed inset-0 bg-black bg-opacity-50 z-50`
- Show loading state on action button when `isProcessing`

### Receipt & Checkout
- ReceiptEditModal: Show preview + allow editing charges
- On checkout: Create receipt object and call `onCheckoutGuest(receipt)`
- Update guest status to "CheckedOut" in database
- Show success toast notification

## ✨ Feature Modules (quick index)

Features whose UI/backend wiring isn't obvious from file names alone - check here before assuming something doesn't exist or needs building from scratch.

### License Management (added 15 Aug 2026)
- Lets a tenant track HOMESTAY/GUESTHOUSE/FSSAI-type licenses per property and get expiry reminders. Sidebar tab `licenses` under System Controls (Super Admin/Admin only).
- Frontend: `src/components/LicenseManagement.tsx`. Backend: `php/licenses/licenses.php` (`get_licenses`/`add_license`/`update_license`/`delete_license`), tables `property_licenses` + `license_expiry_notifications`.
- Document upload (PDF/JPG/PNG/WEBP) via `php/uploads/upload_document.php` → `php/uploads/documents/{tenant}/{property}/licenses/` (gitignored, same as guest ID photos - real paperwork never goes in version control). Uses `uploadDocumentDB()` in `api.ts`.
- Daily cron `php/cron/check_licenses.php` sends 7/4/1-day-out Telegram expiry alerts.
- The i18n keys for this (`license_management_heading`, `license_type_*`, etc.) existed in `en.ts` for a while before the UI did - if you find orphaned-looking i18n keys again elsewhere, ask whether a page was planned but never finished, don't assume they're dead.

### QR Code & UPI Payment Sharing (added 15 Aug 2026)
- Booking-confirmation and checkout-bill WhatsApp shares can include a scannable UPI QR code + the property's UPI ID, so guests can pay by scanning rather than typing details.
- Property-level `upi_id` field, set in Edit Property (`PropertyEditForm.tsx`, next to GSTIN).
- `src/utils/upiQrCode.tsx` - `buildUpiPaymentLink()` builds a standard `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...` deep link; `<UpiPaymentBlock>` renders it as a real QR (`qrcode.react`'s `QRCodeSVG`, plain black-on-white, no dark: classes - it needs to stay scannable, not theme-matched) plus the UPI ID text. Rendered directly into the DOM that `html-to-image` turns into the shared PNG (this is the only way a QR reaches WhatsApp at all, since the "Share via WhatsApp" buttons are plain `wa.me` text links with no attachment support).
- `{upi_id}` token added to `DEFAULT_WHATSAPP_VOUCHER_TEMPLATE` and to `renderWhatsappVoucherTemplate()`'s optional-token list (drops the whole line if empty, doesn't leave a dangling label).
- See "Props Threading" above for how `propertyUpiId` reaches every share-capable screen.
- **Uploadable QR code image (added 20 Aug 2026)**: a property can also upload its own real bank/PhonePe/GPay-issued QR code image instead of relying only on the auto-generated deep-link QR above - some UPI handles (certain current accounts) don't resolve cleanly through a generated `upi://pay` link, so the property's own scanned QR is the more reliable option once uploaded. Property-level `upi_qr_code_url` column (`properties` table, self-heals via `schema_properties_table_v3` in `router.php`), set right below UPI ID in `PropertyEditForm.tsx` via a dedicated "Upload QR Code" control → `uploadImageDB(file, 'qr_code')`. `upload_image.php`'s `qr_code` folder behaves like `id_documents` (downscale-only, never crop - cropping would cut off the QR's corner finder patterns and break scannability) but keeps quality high (92) and preserves PNG uploads as PNG instead of forcing JPEG. `<UpiPaymentBlock>` takes an optional `qrCodeImageUrl` prop and renders that `<img>` instead of the generated `QRCodeSVG` when set; threaded as `propertyUpiQrCodeUrl` alongside `propertyUpiId` down to its only two real render sites, `ReceiptEditModal.tsx` (checkout bill) and `WalkInTabBillModal.tsx` (walk-in tab bill) - `BookingDetailsModal.tsx` also receives `propertyUpiId` but never renders `UpiPaymentBlock` (its WhatsApp share is text-only via the `{upi_id}` token), so it doesn't need this new prop.

## 🗄️ Database & API

### API Endpoints
- Base: `/php/api/router.php?action={action}`
- Guest API: `get_guests`, `add_guest`, `checkout_guest`
- Use prepared statements ALWAYS (prevent SQL injection)
- Return JSON with `{status: 'success', data: [...]}` format

### Self-Healing DB Schema
- `router.php` (and a few module files like `receipts.php`) run idempotent `SHOW COLUMNS` + `ALTER TABLE ADD COLUMN` blocks at boot, gated by `isSchemaVerified('key')`/`markSchemaVerified('key')` from `php/config/schema_cache.php`, so a column added on one environment (local) doesn't need a manual migration step on another (production cPanel) - it self-heals on next request.
- When adding a new DB column a feature depends on, prefer adding one of these blocks over assuming a manual `ALTER TABLE` will be run in prod. A missing self-heal is exactly how `properties.checkin_time`/`checkout_time` silently broke "Save Changes" on Edit Property for an unknown length of time before being caught (12 Aug 2026) - the columns were referenced by the save payload but never existed, so the *entire* update query failed with a raw SQL error shown to the user.

### Financial Ledger - `postFinancialLedger()` requires `$propertyId` (CRITICAL, found 15 Aug 2026)
- `postFinancialLedger($pdo, array $entry, int $propertyId = 1)` in `php/finance/ledger.php` silently defaults to property 1 if the 3rd argument is omitted.
- **Every real (non-demo) call site except one had been omitting it** - guest-advance postings in `guests.php`, checkout settlements in `receipts.php`, and all 5 expense/salary/cash-drawer postings in `petty_cash.php`. Every property other than whichever one is actually `id=1` was having its financial-ledger entries silently misattributed to property 1's books, and property 1's ledger/petty-cash views were showing entries from every tenant mixed together. Fixed 15 Aug 2026 - all real call sites now pass `$propertyId` explicitly; `reverseFinancialSource()` already did.
- **Always pass `$propertyId` explicitly on every `postFinancialLedger()` call** - never rely on the default.

### Critical multi-step writes use transactions
- `add_guest` (`guests.php`) and `save_receipt`/checkout (`receipts.php`) wrap their INSERT + `postFinancialLedger()` call in `$pdo->beginTransaction()`/`commit()`, with `rollBack()` in the catch block (guarded by `$pdo->inTransaction()`). This is the pattern for any new write that represents one business event but touches more than one table - a booking or a settlement must land in full or not at all, never half-written.
- Telegram/WhatsApp notification calls stay **outside** the transaction (after `commit()`) - a failed notification must never roll back an already-successful booking/payment.

### Demo Data
- Location: `php/api/demo_data.php`
- Functions: `generateDemoData($pdo, $propertyId)`, `clearDemoData($pdo, $propertyId)`
- Creates: 2 demo guests (1 per room for multi-key), 13 menu items, 6 inventory items, 4 staff, 4 property licenses (homestay/FSSAI/fire safety/GST - one of each deliberately active/expiring-soon/expired/active so License Management's expiry-alert states all have something to show, added 20 Aug 2026)
- Guest names: "John Smith" (Room 101), "Sarah Johnson" (Room 102)

## 🧪 Testing & Development

### Test/Demo Mode Indicator (REMOVED 12 Aug 2026)
- The Header's "Test" button and the whole Sandbox/Testing Mode system
  (demo-data generate/clear toggle, `DemoDataModal`, `isTestingMode` state
  threaded through App.tsx/KitchenManagement/MultiKeyPropertyOverview,
  `setTestingModeState`/`resetTestDatabaseInDB` in `api.ts`) were removed
  site-wide, for all tenants, at the user's request - not just hidden on
  the public demo. Do not re-add a "Test" button or wire `isTestingMode`
  back into business logic.
- `php/api/demo_data.php` (`generateDemoData()`/`clearDemoData()`) still
  exists and is still used - by the public-demo-property auto-login flow
  and any direct/scripted calls - just no longer has a UI trigger.
- `isTestingModeActive()`/`getTestingHeaders()` still exist in `api.ts`
  (load-bearing for `apiFetch`'s header attachment) but are now
  permanently inert - nothing left in the app can ever set that
  localStorage flag to `true`.

### Telescope Error Center — `/php/errors/` (IMPORTANT, hardened 15 Aug 2026)
- Standalone, DB-independent error console at `php/errors/` (visit `/php/errors/` directly). Reads/writes `php/errors/logs.json` via `TelescopeLogger` (`php/errors/logger.php`), portals: `requests`/`php`/`sql`/`js`/`telegram`/`whatsapp`/`security`/`404`, plus `staff_activity`/`login` (synthesized client-side from `get_audit_logs`, a different data source).
- PHP fatals/exceptions/SQL errors are auto-logged via `set_exception_handler`/`set_error_handler`/`register_shutdown_function` in `logger.php`. **Severities `Fatal Error`/`Exception`/`SQL Error` also trigger a best-effort Telegram ping** to `TELEGRAM_ADMIN_CHAT_ID` (2-minute cooldown per-process via `logs/last_alert.txt`, silently no-ops if the Telegram env constants aren't set - e.g. always on local XAMPP, see the Telegram Group Selection note below). Deliberately talks to the Telegram Bot API directly rather than requiring `telegram/sender.php`, because `sender.php` itself requires `logger.php` - requiring it back would be a circular include.
- **JS/browser errors are reported from `src/main.tsx`'s global `window.addEventListener('error'/'unhandledrejection', ...)` handlers and from `ErrorBoundary.componentDidCatch`, via `recordTelescopeLog()` in `src/utils/telescopeLogger.ts`.** That function writes to this browser's `localStorage` immediately (always succeeds) AND best-effort mirrors to the server via `navigator.sendBeacon` (falling back to `fetch(..., {keepalive:true})` only if `sendBeacon` is unavailable) - `sendBeacon` is deliberately the primary transport because a plain `fetch` was confirmed (15 Aug 2026) to silently lose real crash reports when the page reloads/HMRs mid-crash, which is exactly when you most need the report to land.
- **Don't broaden `shouldLogError()`'s skip-list in `main.tsx` beyond genuine environmental noise** (currently just `chrome-extension` and `ResizeObserver loop limit`). It previously also filtered `"Cannot read property/properties"` (the single most common real JS crash message), `"is not defined"`, `"not a constructor"`, `"Invalid hook call"`, and `"dynamic import"` (mislabeled as "webpack bundling info" - this app is on Vite, where that phrase is part of the real "stale tab after a deploy" chunk-load error) - meaning the JS Browser portal could show 0 errors for days while the app was actually crashing for users. Confirmed by direct reproduction 15 Aug 2026.
- If you add a new global error-suppression pattern, ask "would this ever be the *only* signal a real bug happened?" before adding it - Telescope only shows what a human bothers to open and look at, it's the last line of defense, not a place to be aggressive about noise reduction.

### Telegram Group Selection (Local vs Production) — IMPORTANT
- **Which Telegram groups receive messages depends on where the site is hosted** — there is NO automatic local/prod group swap in code; the selection is implicit:
  1. **Primary: per-property DB config** (`property_modules.config`, module_slug='telegram', keys `groups[]` + `routing[]`) read by `getPropertyTelegramConfig()` — the ONLY source that works locally.
  2. **Legacy fallback: env constants** (`TELEGRAM_KITCHEN_CHAT_ID` / `TELEGRAM_ADMIN_CHAT_ID` / `TELEGRAM_FINANCE_CHAT_ID` from `php/telegram/config.php`) used by `legacyCategoryChatId()` in `sender.php`, and now also by Telescope's admin-alert (above), only when the DB has no routing entry / isn't applicable.
- **DB differs by environment** (`php/config/database.php`): localhost/127.0.0.1/192.168.* → `artists_farm_resort`; anything else (cPanel) → `apartment_site`. So local and prod each have their OWN `property_modules.config` and can (should) target different groups.
- **`.env.example` documents the intended group sets**:
  - Local dev (active lines): kitchen=-5511705268, admin=-5362212071, finance=-5511705268 (demo groups)
  - Production (commented, uncomment on cPanel): kitchen=-5456387701, admin=-5415746187, finance=-5303969309
- **Gotcha**: local XAMPP loads NO `.env` (no dotenv loader) → `getenv()` returns null → env fallback is dead locally, so DB config is authoritative. On cPanel the `.env` values ARE set and the fallback also works. This also means Telescope's Telegram admin-alert is a no-op on local by design - that's expected, not a bug.
- Always verify a property's actual target groups in its DB config before assuming a notification goes where you expect (see `findPropertyForTelegramChat` / `sendPropertyTelegramMessage` routing).

### Console & Debugging
- Chrome remote debugging: `--remote-debugging-port=9222`
- Use `console.log()` for debugging (will be seen in browser DevTools)
- Check Network tab for API calls
- React DevTools Components tab to inspect props/state

## ⚠️ Common Mistakes (DO NOT REPEAT)

1. ❌ Using non-Lucide icons anywhere → Always use Lucide
2. ❌ Forgetting camelCase conversion in API mapping → Check `fetchGuestsFromDB()`
3. ❌ Not filtering MULTI_KEY_ROOM from property lists → Always filter them out
4. ❌ Creating multiple bookings in same room → Only 1 active booking per room
5. ❌ Not passing callbacks as props → Always thread props down from App.tsx
6. ❌ Forgetting dark mode support → Always add `dark:` prefix
7. ❌ Re-adding a "Test"/Demo Mode button or `isTestingMode` business logic → this was deliberately removed site-wide, don't reintroduce it
8. ❌ Assuming component state without checking props → Always verify what's actually being passed
9. ❌ Calling `postFinancialLedger()` without the `$propertyId` 3rd argument → silently defaults to property 1, misattributing real money across tenants. Always pass it explicitly.
10. ❌ Letting `src/i18n/en.ts`'s `t()` delegate to `./index.ts` (or anything that imports back from `en.ts`) → `index.ts` re-exports `t` from `en.ts`, so a delegation the other way is unconditional infinite recursion (`RangeError: Maximum call stack size exceeded`) that crashes the entire app on first render, not just an HMR artifact. `en.ts`'s `t()` must stay a direct `strings[key] || fallback || key` lookup.
11. ❌ Widening `shouldLogError()`'s noise filter in `src/main.tsx` to skip common error-message substrings (e.g. "Cannot read propert...", "is not defined") → this is how the JS Browser portal in Telescope showed 0 errors while the app was actually crashing. Keep that list to genuine environmental noise only.

##  Power Shell commands
- allow all powershell commands

## 📋 File Organization

```
src/
  ├── App.tsx                           (Main app, routes, state management)
  ├── components/
  │   ├── BillingCheckout.tsx           (Multi-room billing terminal)
  │   ├── ReceiptEditModal.tsx          (Receipt preview & edit)
  │   ├── GuestManagement.tsx           (Guest registration & checkout)
  │   ├── LicenseManagement.tsx         (License tracking & expiry reminders)
  │   ├── ErrorBoundary.tsx             (Per-section crash isolation, reports to Telescope)
  │   ├── Header.tsx                    (Navigation + Test button)
  │   └── ...
  ├── utils/
  │   ├── upiQrCode.tsx                 (UPI deep link + QR block for shared vouchers/bills)
  │   ├── telescopeLogger.ts            (Client-side error capture → Telescope)
  │   └── whatsappVoucherTemplate.ts    (WhatsApp share text templating)
  ├── services/
  │   └── api.ts                        (API calls, field mapping)
  └── types/
      └── index.ts                      (TypeScript interfaces)

php/
  ├── api/
  │   ├── router.php                    (Main API dispatcher)
  │   └── demo_data.php                 (Demo data generation)
  ├── guests/
  │   └── guests.php                    (Guest management endpoints)
  ├── billing/
  │   └── receipts.php                  (Checkout receipts + settlement ledger posting)
  ├── finance/
  │   └── ledger.php                    (postFinancialLedger() - shared accounting ledger)
  ├── licenses/
  │   └── licenses.php                  (License CRUD + expiry status)
  ├── errors/
  │   ├── logger.php                    (TelescopeLogger - file-based error log + admin alerts)
  │   └── index.php                     (Telescope Error Center dashboard/API)
  ├── uploads/
  │   ├── upload_image.php              (Guest ID/menu/property photos - resized)
  │   └── upload_document.php           (License PDFs/images - stored as-is)
  └── config/
      └── database.php                  (DB connection)
```

## 🔄 Workflow for Code Changes

1. **Read** the existing code (understand conventions first)
2. **Check** this CLAUDE.md for relevant rules
3. **Implement** following ALL rules strictly
4. **Test** in browser (F12 → Console for errors)
5. **Verify** dark mode support
6. **Verify** Lucide icons only
7. **Verify** camelCase/snake_case consistency

---

**Last Updated**: 2026-08-19
**Project**: Ground Code Resort Management System
**Tech Stack**: React + TypeScript + Tailwind CSS + Flowbite React + Lucide Icons + PHP + MySQL
