# Ground Code Resort - AI Project Rules & Conventions

This file documents ALL project conventions and rules. Every AI agent must follow these rules without exception.

## 🎨 UI & Design Rules

**All design, styling, icon, font, and component-library rules live in `DESIGN.md`** - that's the single source of truth for how things should look, kept in its own file so this always-loaded CLAUDE.md doesn't carry UI detail that most tasks don't need. Read `DESIGN.md` before building or touching any table, modal, tab bar, button, or summary-card UI.

### Protected Components (do not touch without explicit permission)
- **`OperationalDashboard.tsx`** (its "Booking Calendar Row" - the multi-room booking calendar grid: color-coded bookings, blocked dates, OTA-block conversion, edit modal) - proprietary, custom-built PMS logic. Reused per-room by `MultiKeyPropertyOverview.tsx` for the multi-key `#dashboard` view, not just the single-property dashboard. Never refactor, restyle, or otherwise modify this booking-calendar logic without the user explicitly asking - including as part of a broader Flowbite-migration sweep (corrected 21 Aug 2026 - this rule previously named `MultiRoomCalendar.tsx`/`CalendarView.tsx`, files that never existed anywhere in this repo's history, so the protection was silently not attached to anything real). `DateRangePicker.tsx` and `TodayOverview.tsx` are NOT in this list - they're in scope for the Flowbite migration like any other shared component.

### Flowbite Core Files vs. Overrides (MANDATORY - keep these separate, reaffirmed 22 Aug 2026)
- **Never edit Flowbite's own shipped files** (`node_modules/flowbite`, `node_modules/flowbite-react`) directly, and never copy their internals into this repo to "fix" them in place.
- **`src/index.css` is Flowbite/Tailwind bootstrap ONLY** - the `@import "tailwindcss"`, `@plugin`/`@source` lines, `@import "flowbite/src/themes/default"`, and the `@theme` token block, plus the one `:root` token short-circuit block that exists solely to make flowbite-datepicker's semantic tokens (`--color-brand`, etc.) resolve at all (see that file's own dated comment for the full why). It must stay the "wiring up the framework" file - swappable/upgradeable - never the place app-specific look-and-feel rules get interleaved in.
- **`src/custom.css` is where every actual app rule lives** instead - design tokens, datepicker/table/modal overrides, anything project-specific (this split was done deliberately 21 Aug 2026 for exactly this reason). Both are imported independently from `main.tsx`; neither depends on the other, so either can be read/edited alone.
- When a Flowbite-rendered element needs a fix or override (a flowbite-react component's own class, or a vanilla-JS library's template classes like flowbite-datepicker's `bg-brand`/`.datepicker-cell`), the override rule goes in `custom.css` - never inlined into `index.css`, and never patched at the source in `node_modules`.

## 🧠 State & Data Management

### Field Name Conventions
- **Database**: snake_case (e.g., `guest_name`, `checkin_date`, `room_id`)
- **API Response**: camelCase (e.g., `guestName`, `checkinDate`, `roomNumber`)
- **React Components**: camelCase properties
- Apply `convertSnakeToCamel()` in PHP API responses
- Apply field mapping in `fetchGuestsFromDB()` in `src/services/api.ts`

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
- **MANDATORY: every booking-dates picker must grey out + strike through + block already-booked days for the selected room** (added 22 Aug 2026, reported as "calendar ... booked dates should be greyed out and strikethrough and cant be selected"). Enforces the "1 room = 1 active booking" rule above at the UI level, not just server-side. Implemented via `DateRangePicker.tsx`'s `blockedDates` prop (array of `YYYY-MM-DD` strings) - it now feeds flowbite-datepicker's real `datesDisabled` option and is kept reactive (updates live if the room selection changes), with `.datepicker-cell.disabled` in `custom.css` giving it the grey-background + strikethrough look. This prop existed on the interface for a while but was silently unused/dead - a real bug, since every existing caller passing it (GuestManagement's Add Guest picker) was getting zero effect until this was wired up. When adding a new booking-dates picker: compute the blocked days from every OTHER active booking in the same room (see `getBlockedDateStrings()` in `GuestManagement.tsx` and `getEditBlockedDateStrings()` in `BookingDetailsModal.tsx`) and pass them through `blockedDates` - never ship one without it.

## 📱 Component Structure

### Props Threading
- Pass props down explicitly from App.tsx → Child Components
- Example: `onCheckoutGuest`, `onSetActiveMenuItemKey`, `isMultiKeyProperty`
- Don't rely on context for business logic (use it only for ToastContext, StaffContext, etc.)
- **Property-level settings fan out wide.** `propertyGstin`/`propertyMapsLink`/`propertyPhone`/`propertyWhatsappTemplate`/`propertyUpiId` all originate in `App.tsx` (from `preloadedData.currentProperty`) and pass through up to 3 wrapper components (`MultiKeyPropertyOverview` → `OperationalDashboard`/`BillingCheckout` → `GuestManagement`/`ReceiptEditModal`/`BookingDetailsModal`) before reaching the leaf that actually builds a WhatsApp share or voucher. When adding a new property-level setting that needs to reach a share/voucher screen, `grep` an existing one (e.g. `propertyUpiId`) across `src/` to find every call site that needs the new prop added - App.tsx alone has 4+ separate render call sites for the same component (main render, Global Add Booking Modal, etc.) and it's easy to miss one.

### Modal & Dialog Rules
See `DESIGN.md`'s "Flowbite Modals & Drawers Specification" - all modals/dialogs open as a right-side drawer, not a centered popup.

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

### Unconverted OTA Booking Alerts (added 22 Aug 2026)
- Warns staff when a synced OTA calendar hold (Airbnb/Booking.com/etc, see `ical_sync.php`) has already begun - present (guest may be in-house right now with zero booking record) or fully past (guest already left, still never recorded) - but was never converted into a real guest booking via "Convert to Booking". Deliberately excludes purely-future holds; those don't need attention yet.
- Dashboard: `OperationalDashboard.tsx`'s "System Alerts" panel (both the 5-row preview and the "All System Alerts" drawer) now merges guest-based alerts with these OTA-block alerts into one severity-sorted list via a `CombinedAlertItem` discriminated union (`kind: 'guest' | 'ota'`) - amber if the hold is still ongoing, red if it's fully elapsed. Computed client-side from `blockedDates` (already fetched for the calendar itself - `get_blocked_dates` only ever returns still-unclaimed holds, so no separate "not converted" check is needed, just a date filter). Its row action calls the shared `handleConvertOtaBlock()` helper (same `otaConversionTarget`/`ConvertOtaBookingModal` flow the calendar's own OTA chip already used) instead of `setSelectedBooking()`. Since `OperationalDashboard.tsx` is reused per-room inside `MultiKeyPropertyOverview.tsx` (see its protected-component note above), this also covers every room of a multi-key property automatically - no separate wiring needed in `TodayOverview.tsx`, which has no System Alerts panel of its own.
- Backend: `ICalSyncManager::getUnconvertedDueBlocks()` in `php/api/ical_sync.php` - the cross-property/cross-tenant equivalent of `getBlockedDates()` (which is intentionally single-property-scoped). Shares its platform-label-resolution logic with `getBlockedDates()` via the private `annotateEventSource()` helper rather than duplicating it.
- Telegram: daily cron `php/cron/check_unconverted_ota_bookings.php` sends one admin alert per still-unconverted due block, routed per-property the same way every other Telegram alert is (via the block's own room/property id, matching `guests.php`'s booking-notification convention - never the multi-key parent's id). Re-notifies at most once per 24h per block via the self-healing `ota_unconverted_notifications` dedupe table (`ICalSyncManager::ensureNotificationSchema()`, called both from the cron and from `ical_sync.php`'s own HTTP dispatch so it self-heals even if the cron was never scheduled on a given environment).

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
- Current real call sites (verified 21 Aug 2026, all passing `$propertyId`): `guests.php`, `receipts.php`, `petty_cash.php` (x5), plus `inventory.php` (kitchen purchase postings) and `walk_in_tabs.php` (walk-in tab billing) - check for new call sites with `grep -rn "postFinancialLedger(" php/` rather than trusting this list to stay complete.
- **Always pass `$propertyId` explicitly on every `postFinancialLedger()` call** - never rely on the default.

### Critical multi-step writes use transactions
- `add_guest` (`guests.php`) and `save_receipt`/checkout (`receipts.php`) wrap their INSERT + `postFinancialLedger()` call in `$pdo->beginTransaction()`/`commit()`, with `rollBack()` in the catch block (guarded by `$pdo->inTransaction()`). This is the pattern for any new write that represents one business event but touches more than one table - a booking or a settlement must land in full or not at all, never half-written.
- Telegram/WhatsApp notification calls stay **outside** the transaction (after `commit()`) - a failed notification must never roll back an already-successful booking/payment.

### Demo Data
- Location: `php/api/demo_data.php`
- Functions: `generateDemoData($pdo, $propertyId)`, `clearDemoData($pdo, $propertyId)`
- Creates: 2 demo guests (1 per room for multi-key), 13 menu items, 6 inventory items, 4 staff, 4 property licenses (homestay/FSSAI/fire safety/GST - one of each deliberately active/expiring-soon/expired/active so License Management's expiry-alert states all have something to show, added 20 Aug 2026)
- Guest names: randomly shuffled from a fixed pool of Indian names (e.g. Arjun Mehta, Priya Sharma, Rahul Verma...) in `demo_data.php`, not fixed names - don't assume a specific demo guest name will appear in a given room.

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

### Sidebar Shows Only "Kitchen" — Chronic Cold-Start Race (user-reported "since day one"; narrowed but NOT conclusively fixed, 22 Aug 2026)
- **Symptom**: on some page loads (not reliably reproducible on demand), the sidebar renders almost empty — just the synthetic "Kitchen" fallback node (`Navigation.tsx`'s `buildTree()` synthesizes one only when zero real nav items have loaded) — while Dashboard/Bookings/Team/Finances/Admin Control/etc. are all missing. Page content itself renders fine; only the sidebar's `navItems` came back empty.
- **Root cause**: a cold-start race in `DataLoader.tsx`'s parallel preload (`Promise.all` of nav items/telegram config/guests/receipts/menu). First found and partially fixed 13 Aug 2026 (stale-invocation token guard) and 15 Aug 2026 (`safeFetch()` failure-detection + background retry-and-patch-in). **Three separate self-correction layers already exist** for this exact symptom - DataLoader's own retry, `App.tsx`'s `preloadedData.navItems` re-sync effect, and `App.tsx`'s independent `loadWithRetry` 3-attempt nav-items effect - yet it kept recurring anyway, which is why the user asked for this to be tracked here instead of assumed-fixed.
- **The gap found 22 Aug 2026** (likely why it survived all three prior layers): `fetchNavMenuFromDB()` and its four DataLoader siblings (`fetchTelegramConfigDB`/`fetchGuestsFromDB`/`fetchReceiptsFromDB`/`fetchMenuFromDB`, all in `services/api.ts`) share one anti-pattern - each swallows any non-`'success'` backend response into an empty/default value **without ever throwing**. `DataLoader.tsx`'s `safeFetch()` can only detect a failure that surfaces as a *thrown* JS exception, so a backend response that comes back 200 with `status:'error'` (or any malformed shape) looks identical, from `safeFetch`'s point of view, to "genuinely zero items" - `anyRealDataFetchFailed` stays `false` and the retry-and-patch-in block never runs. Confirmed live: `nav_menu_items` holds a full, healthy, platform-wide-shared 25-row set (deliberately unscoped by `property_id` - see `get_nav_menu` in `php/kitchen/menu.php`), so an empty nav-items result reaching the frontend is *never* legitimately correct - unlike guests/receipts/menu, which genuinely can be empty for a quiet/new property.
- **Partial fix applied 22 Aug 2026**: `DataLoader.tsx` now wraps the nav-items fetch in its own local `safeFetchNavItems()` that treats an empty result the same as a thrown failure - nav items *only*. Guests/receipts/menu/telegram config were deliberately left on the old shared `fetchXFromDB()` behavior, since their emptiness genuinely can be legitimate and treating it as failure there would cause needless background retries. The underlying anti-pattern (silent-swallow-without-throw) still exists unchanged in all five `fetchXFromDB()` functions - dozens of other call sites (`App.tsx`, `KitchenManagement.tsx`, `ReceiptEditModal.tsx`, `TelegramSetupWizard.tsx`, `TelegramNotificationModal.tsx`) rely on exactly that "just return empty, never reject" contract with no `.catch()` of their own, so making these functions throw more broadly needs every one of those call sites audited first - don't do it as a quick follow-up without that audit.
- **Still open**: this is a timing/cold-start race by nature (slow/cold PHP-FPM worker, PHP session-file locking under concurrent requests, etc.) - it can't be deterministically reproduced on demand, so the 22 Aug fix closes a real, verified gap but is not proven to be the *only* remaining cause. If this is reported again after 22 Aug 2026, don't assume it's already fixed - check whether that occurrence has some OTHER path into an empty `navItems` (e.g. a request that genuinely threw, but arrived so late no retry budget remained) before concluding it's a new bug.

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

### telegram.php on Staging — Never Requires a Local Copy (IMPORTANT, 23 Aug 2026)
- CPGuard (this cPanel account's malware scanner) flags `telegram.php` as `{HEX}Malware.Expert.php.json.decode.file.getcontents.api.telegram` — its outbound `curl` to `api.telegram.org` with a bot token baked into the URL is structurally identical, to static analysis, to malware phoning home to a C2 server with a stolen key. Confirmed live via CPGuard's own Background Scanner Logs (cPanel → cPGuard → Virus Scanner → Background Scanner Logs): it re-scans and re-quarantines staging's copy every few minutes, not as a one-off.
- Only **production's** copy is whitelisted (support ticket BRX-3227572): `/home/apartment/public_html/php/telegram/telegram.php`. An earlier fix (17 Aug 2026) self-healed staging by *copying* production's bytes onto staging's own path whenever missing — this just handed the scanner a fresh target every single time, an unwinnable cycle against a scanner that re-scans that fast.
- **Fixed 23 Aug 2026**: staging (`APP_IS_STAGING_ENV`) now `require_once`s telegram.php straight from the whitelisted production path directly (see `router.php`, right after the kitchen/inventory/etc. requires) — it never creates or expects a local copy on staging's own disk at all, so there's no file left for CPGuard to catch in the first place. Path is root-admin-configurable (Root Dashboard → Telegram Templates → Telegram Platform Health, `system_settings` key `telegram_fallback_source_path`), falling back to the path above if nothing's been saved.
- **Gotcha this required fixing**: telegram.php itself does `require_once __DIR__.'/../modules/module_manager.php'` — and `__DIR__` reflects where a file *physically lives*, not who required it, so requiring telegram.php from its production path pulls in **production's** copy of `module_manager.php` too, a different absolute path than staging's own copy. `require_once`'s dedup is per-path, not per-symbol, and `module_manager.php`'s functions aren't `function_exists()`-guarded — so without a fix this is a fatal "Cannot redeclare function" on every staging request. Router.php's own later `require_once` of `module_manager.php` is now guarded with `if (!function_exists('isModuleAvailable'))` specifically to make this safe.
- `TelegramHealthPanel.tsx`'s "Local telegram.php present on disk" row is deliberately hidden on staging now (it would always read "Missing" by design, not as a failure) — the "Whitelisted source path" row is the one that actually matters there.
- If this pattern needs repeating for another file some day: don't reach for "copy it back" as the fix — that's the approach already proven to lose against a fast-rescanning scanner. Require directly from the whitelisted path, and watch for exactly this kind of cross-environment `__DIR__`-dependency collision.

### Console & Debugging
- Chrome remote debugging: `--remote-debugging-port=9222`
- Use `console.log()` for debugging (will be seen in browser DevTools)
- Check Network tab for API calls
- React DevTools Components tab to inspect props/state

## ⚠️ Common Mistakes (DO NOT REPEAT)

1. ❌ Using `lucide-react` icons in new/touched UI → `lucide-react` is deprecated site-wide (standing rule since 21 Aug 2026); use Flowbite's icon set instead (see DESIGN.md's "Icons" rule). Existing Lucide usage is still present across ~76 files and gets replaced screen-by-screen, not ripped out wholesale.
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
12. ❌ Adding a booking-dates `DateRangePicker` without passing `blockedDates` → already-booked days for that room must always render greyed-out/struck-through/unselectable (MANDATORY, see "Multi-Key Rooms & Bookings"), never silently selectable to create a double-booking.
13. ❌ Putting an app-specific override/fix into `src/index.css` (Flowbite/Tailwind bootstrap ONLY) instead of `src/custom.css`, or patching Flowbite's own files under `node_modules` → see "Flowbite Core Files vs. Overrides".
14. ❌ Hardcoding a raw `zIndex: N` in a React inline `style` object instead of a Tailwind `z-*` class → invisible to a `grep "z-\[?\d"` sweep of the app-wide z-index scale (documented in `custom.css` above `.fixed.inset-0.z-50`), so it silently drifts out of sync with it. Found 22 Aug 2026 in `src/components/Popover.tsx` (`zIndex: 99999` - the toasts/confirm-dialog "always on top" tier, on what's really an ordinary info bubble, so it rendered above every real drawer/modal in the app). When hunting a z-index bug, grep BOTH `z-\[?\d` (Tailwind classes) and `zIndex:` (inline styles) - only one is caught by the other.
15. ❌ Assuming a `trigger="hover"` popover/tooltip is safe as-is on mobile → touch browsers fire a synthetic mouseenter on tap but never a matching mouseleave (no cursor to leave with), so anything opened via `onMouseEnter` alone can get stuck open indefinitely, floating over whatever the same tap's `onClick` opens next. Any hover-triggered popover must also close itself on a click of its own trigger (see the fix in `Popover.tsx`'s `handleClick`), not rely on mouseleave/outside-click alone.
16. ❌ Passing `shadow-2xl` (or any `shadow-*`) via `className` on a flowbite-react `<Drawer>` without accounting for its closed state → **every** `<Drawer>` stays mounted in the DOM at all times (~36 call sites app-wide - Add Guest, Add Expense, booking details, etc.); flowbite-react's own `Drawer.js`/`theme.js` only toggle the drawer's *position* class between `transform-none` (open) and an off-screen translate class like `translate-x-full` (closed) based on `isOpen` - it never touches whatever `className` the call site passed. A `box-shadow` isn't clipped by `transform`, so `shadow-2xl`'s large blur radius (`0 25px 50px -12px`) kept painting ~30-40px into the visible viewport from the drawer's off-screen edge, full page height, on every screen that mounts one of these drawers (which is most of them) - regardless of scroll position, DevTools state, browser, or even device (reproduced identically on desktop Chrome AND mobile, since it's standards-compliant CSS, not a rendering bug). Misread for a long time as "a shadow/gradient on the right edge of the page" - a chronic, hard-to-place visual bug this project should recognize immediately if reported again, not re-diagnose as a scrollbar/GPU/hardware issue from scratch. **Fixed 22 Aug 2026** via a global override in `custom.css`: `[data-testid="flowbite-drawer"].translate-x-full` (and the `-translate-x-full`/`translate-y-full`/`-translate-y-full` equivalents for the other 3 drawer positions) forces `box-shadow: none` - only while one of flowbite-react's own "off" classes is present, so the drawer's shadow still renders normally once actually open. Root-caused by reading `node_modules/flowbite-react/dist/components/Drawer/{Drawer,theme}.js` (read-only, per the "never edit Flowbite's own files" rule below) to find the real class-toggling mechanism, not guessed.

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
  │   ├── Header.tsx                    (Navigation - no Test button, see "Test/Demo Mode Indicator (REMOVED)")
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

## 🌐 Localization & Language Rules (English Default)

- **No Hindi Localization unless explicitly requested**: There is no need to create, update, or translate strings into the Hindi version (`src/i18n/hi.ts`) unless the user explicitly asks for it. Focus all UI string additions, updates, and key definitions solely on the default English dictionary (`src/i18n/en.ts`) and direct English UI text.

## 🔄 Workflow for Code Changes

1. **Read** the existing code (understand conventions first)
2. **Check** this CLAUDE.md for relevant rules
3. **Implement** following ALL rules strictly
4. **Test** in browser (F12 → Console for errors)
5. **Verify** dark mode support
6. **Verify** Flowbite icons only (no new `lucide-react` usage)
7. **Verify** camelCase/snake_case consistency

---

**Last Updated**: 2026-08-22
**Project**: Ground Code Resort Management System
**Tech Stack**: React + TypeScript + Tailwind CSS + Flowbite React + Flowbite Icons (migrating off Lucide) + PHP + MySQL
