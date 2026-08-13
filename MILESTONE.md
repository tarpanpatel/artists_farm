# Ground Code Resort â€” MILESTONE (Jul 28, 2026)

## Objective
Fix bugs, wire up dead buttons, build features, remove pages, and modernize UI across the Ground Code Resort management system.

## Architecture
- React 19 + TypeScript frontend (Vite build) served via `index.php` â†’ `dist/index.html`
- PHP + MySQL backend with action-based routing (`?action=add_guest`, etc.)
- Database: `artists_farm_resort` (local) / `artist_farm` (production) â€” auto-detected via hostname in `database.php`
- Users access site at `http://localhost:3000/artists_farm/`
- `_base` in `api.ts` detects Vite dev server (port 3000) and forces empty string
- All data must live in the database, not hardcoded in PHP or JS files
- Users/vendor/third-party entities in `payee_entities` table; staff in `staff_users`
- Expense items in `expense_items`; material categories in `material_categories`; catalog items in `req_catalog`
- Telescope Error Center is standalone PHP at `php/errors/index.php` (opens in new tab)
- Telegram templates stored in DB `system_telegram_templates`, resolved via `resolveTelegramTemplate()`
- **Users must upload PHP + dist/ files to production via cPanel FTP** after each session

---

## COMPLETED CHANGES (This Session)

### 1. `simple-datatables` Fully Removed
- `src/components/DataTable.tsx` â€” **DELETED**
- `src/main.tsx` â€” Removed simple-datatables CSS import and global init
- `package.json` â€” `npm uninstall simple-datatables` completed
- Zero references to `simple-datatables` or `DataTableWrapper` remain in `src/`

### 2. `react-data-table-component` Installed
- `npm install react-data-table-component` â€” v8.8.0 (resolved by npm)
- **v8.8.0 API difference**: Use `subHeader={<JSX />}` NOT `subHeader` boolean + `subHeaderComponent`
- **v8.8.0 subHeader default CSS**: Override via `customStyles.subHeader.style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' }` on every DataTable
- `@import "react-data-table-component/css"` in `src/index.css` line 2

### 3. All Tables Converted to react-data-table-component

#### a. Catalog Table (`InventoryManagement.tsx`)
- Columns: Image, Item Name, Category, Pack, Cost, Status, Actions
- Built-in `selectableRows` (no custom checkbox column)
- Category filter pills + search in DataTable subHeader
- `customStyles` with subHeader, headRow, headCells, cells, rows overrides
- Filter toolbar: `bg-slate-50 border-b border-slate-200`, `Filter` label
- `key={catalogTableKey}` for remount pattern (no `clearSelectedRows`)

#### b. Fulfill Table (`InventoryManagement.tsx`)
- Uses react-data-table-component with subHeader style override

#### c. Served Dishes Table (`KitchenManagement.tsx`)
- Uses `import DataTable from 'react-data-table-component'`
- No `useRef` or `useCallback` imports
- `subHeader` prop with style override

#### d. Stock Log / Inventory Table (`InventoryManagement.tsx`)
- Converted from raw HTML `<table>` to `react-data-table-component`
- Columns: Image, Item Name, Category, Current Stock, Min Threshold, Status (LOW/Adequate), Tracking
- SubHeader has search input + "Add Item" button
- Mobile cards preserved (md:hidden)
- Custom styles matching reactdatatable.com theme
- `paginationPerPage={15}`, `paginationRowsPerPageOptions={[15, 30, 50, 100]}`

#### e. Expense Item Registry (`ExpenseItemsManagement.tsx`)
- Fully rewritten with react-data-table-component
- Columns: #, Item Name (click-to-edit inline), Actions (Pencil/Trash2)
- SubHeader: "Add New Item" button â†’ inline text input + "Add" button + "X" cancel
- Search input, Refresh button, item count badge
- Auto-closing centered toast notification (2.5s, `animate-toast-in` keyframe)

### 4. UI Improvements
- `src/components/Header.tsx` â€” `onLogout?: () => void` in HeaderProps (fixed duplicate)
- `src/index.css` â€” Added `@keyframes toast-in` and `.animate-toast-in` class
- Category filter buttons styled to match reactdatatable.com (px-2.5 py-1 rounded-md text-xs font-medium border)
- Top-level catalog search removed (only in DataTable subHeader)
- "Manage Categories" button moved next to "Register New Item"

### 5. Lucide Icon Browser (`CustomCSSOverride.tsx`)
- Collapsible "Lucide Icon Browser" section below the CSS editor
- Complete library: ~3000 icons loaded dynamically (lazy import)
- Search by name, size slider (8-64px), stroke width (0.5-4), color picker (16 presets + custom)
- Click icon â†’ detail panel with preview + import/JSX copy buttons
- Paginated 120 per page with "Load More"

### 6. Pages Removed from React Site
- **Audit Logs** (nav-17b, uniqueKey: audit_logs_main) â€” REMOVED
- **Staff Activity Trail** (nav-17c, uniqueKey: staff_activity_trail) â€” REMOVED
- **Error Logs** (nav-27, uniqueKey: errors) â€” REMOVED
- Nav items removed from hardcoded `navItems` in App.tsx
- Route entries removed from both hash route maps in App.tsx
- NavMenuEditor FULL_NAV_OPTIONS entries removed
- `errors` removed from `TabType` union in Navigation.tsx
- **DB override filter**: `App.tsx:456` filters out `['audit_logs_main', 'staff_activity_trail', 'errors']` when loading nav from DB
- **Kept**: Past Receipts Log, Login Logs, System Health (still route to audit_logs tab)

### 7. Telescope Logging (No Changes Needed)
- All logging already goes through `recordTelescopeLog()` in `telescopeLogger.ts`
- Writes to both `localStorage` and PHP backend (`/php/errors/index.php?action=log_event`)
- `addAuditLogDB()` still writes to MySQL for Data Export Center
- PHP logger at `php/errors/logger.php` auto-catches PHP exceptions/errors

### 8. Served Logs API Added
- `php/kitchen/orders.php` â€” Added `get_served_logs` and `add_served_log` endpoints
- Creates `served_logs` table automatically if not exists
- `php/api/router.php` â€” Added routing cases for both actions
- `src/services/api.ts` â€” Added `fetchServedLogsFromDB()` and `addServedLogToDB()` functions

---

## PREVIOUSLY COMPLETED (From Prior Sessions)
- Category duplication fix, GlobalModal mounted, Expense save fix
- Register New Material persistence, Food menu passcode gate
- Browser autofill fix, 18 Telegram templates seeded
- Telegram webhook fix, Bill preview text color
- Telescope Error Center standalone, 3 orphan modals wired
- Testing Mode restricted, Food order category grouping
- Mobile scroll-to-top, PHP save_nav_menu orphan delete
- React 19 removeChild fix, Sidebar dynamic rewrite + auto-expand + auto-scroll
- API port 3000 fix, Menu hierarchy dropdown, Staff type fix
- PHP served_logs endpoints, Attendance Calendar button removed, StaffManagement adjacent JSX fix

---

## KEY TECHNICAL NOTES
- **`subHeader` vs `subHeaderComponent`**: v8.8.0 uses `subHeader={<JSX />}` NOT `subHeaderComponent`
- **Double checkbox bug**: Library's `selectableRows` renders its own checkbox â€” do NOT add a custom Select column
- **First selection flicker**: Don't use `clearSelectedRows`. Use `key={counter}` + increment counter to force remount
- **subHeader default styles**: Must override on EVERY DataTable or you get padding/background
- **reactdatatable.com styling**: headCells `11px weight-600 color-slate-500`, cells `13px color-slate-700 padding-12px`, headRow bg `#f8fafc`, rows `min-height-56px`
- **Dynamic Lucide import**: `import('lucide-react')` won't create separate chunk since lucide is statically imported elsewhere â€” this is fine, icons still load correctly

## Files Modified (This Session)
- `src/components/InventoryManagement.tsx` â€” Catalog table + Stock Log table converted; category filters; removed standalone search
- `src/components/KitchenManagement.tsx` â€” Served Dishes table converted
- `src/components/ExpenseItemsManagement.tsx` â€” Fully rewritten with react-data-table-component
- `src/components/CustomCSSOverride.tsx` â€” Lucide icon browser added
- `src/components/Header.tsx` â€” Fixed duplicate onLogout
- `src/components/Navigation.tsx` â€” Removed `errors` from TabType
- `src/components/NavMenuEditor.tsx` â€” Removed 3 nav options (Audit Logs, Error Logs)
- `src/main.tsx` â€” Removed simple-datatables imports
- `src/index.css` â€” Added react-data-table-component CSS import + toast-in keyframe
- `src/App.tsx` â€” Removed 3 nav items, 3 route entries, DB filter for removed items, default tab update
- `src/services/api.ts` â€” Added fetchServedLogsFromDB, addServedLogToDB
- `php/kitchen/orders.php` â€” Added get_served_logs, add_served_log endpoints
- `php/api/router.php` â€” Added routing for served log actions
- `package.json` â€” simple-datatables removed, react-data-table-component added
- `src/components/DataTable.tsx` â€” DELETED

## Deployment Checklist
1. Run `npx tsc --noEmit` â€” must be clean
2. Run `npx vite build` â€” must succeed
3. Upload `dist/` folder via cPanel FTP
4. Upload changed PHP files (`php/kitchen/orders.php`, `php/api/router.php`)

