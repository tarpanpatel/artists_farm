# Ground Code Design System (DESIGN.md)

**As of 19 Aug 2026, this project strictly follows Flowbite's own design system - `DESIGN.md` no
longer maintains a separate, hand-written set of design rules.** The previous version of this file
(23 numbered sections covering border radius, shadows, buttons, tabs, modals, etc.) has been
removed because several of its rules had drifted from - and were actively contradicting - Flowbite's
real defaults (most notably §10, which mandated a universal `rounded-xl`, the opposite of
Flowbite's real `rounded-lg` default; and the frontmatter's `base_size: "14px"`, the exact wrong
root font-size value that was found and removed from `src/index.css` this same day). Maintaining a
parallel spec that can silently drift out of sync with the actual library is worse than not having
one - it gives every future change a plausible-looking but wrong thing to match against.

## Where to look instead

- **Core Flowbite Source Repository & Component Codes**:
  https://github.com/themesberg/flowbite/tree/main/content/components
  These are the core canonical Flowbite component codes and markup patterns to be used across all screens on this site.
- **Component-level styling** (buttons, badges, modals, tabs, sidebars, cards, tables, inputs):
  `node_modules/flowbite-react/dist/components/<Component>/theme.js` in this repo is the ground
  truth for exactly what classes `flowbite-react` renders. Read the real file, don't guess.
- **Whole-page layout/spacing patterns**: https://flowbite.com/application-ui/demo/ and its
  sub-pages are real rendered application screens - useful for direct `getComputedStyle()`
  comparison via Playwright, not just visual screenshots (small px/color diffs don't show up in a
  screenshot).
- **Do NOT use flowbite.com/docs/components/* pages as ground truth.** As of 19 Aug 2026 those
  pages use a newer, unreleased "Design System" (custom tokens like `bg-brand`, `text-heading`,
  `rounded-base`) that doesn't exist in the `flowbite-react` npm package this app depends on
  (confirmed `0.12.17` is both installed and the latest published version). Comparing against those
  pages produces false mismatches. See project memory `flowbite_design_system_gap` for the full
  detail if this needs re-verifying later.
- **Icons (CRITICAL - standing rule since 21 Aug 2026)**: Use Flowbite's icon set - see the
  [Flowbite icons reference](https://github.com/themesberg/flowbite/blob/main/content/customize/icons.md).
  No raw emojis in UI controls either. `lucide-react` is being phased out project-wide and must not
  be used for any new or touched UI - do not reintroduce Lucide imports in new components. Migration
  is in progress, not done: as of 21 Aug 2026 `lucide-react` is still a dependency and still imported
  in ~76 files across `src/`. Replace icons screen-by-screen as you touch a file - don't do a mass
  find-replace sweep unless explicitly asked for one.
- **Fonts**: Flowbite's default fonts everywhere.
- **Component library**: `flowbite-react` (+ the `flowbite` Tailwind plugin and the official markup
  patterns linked above) is the standard for all new, rebuilt, or updated components, modals, forms,
  and tables. The **existing** hand-built shared components (`src/components/Input.tsx`,
  `StyledSelect.tsx`, `Button.tsx`, etc.) are still in active use across most of the
  app and are **not** dead code - don't delete or bypass them ad hoc. They get replaced
  screen-by-screen as part of the migration, same as icons. (`Tooltip.tsx` was this list's one
  exception - deleted 24 Aug 2026 once the "no `<Tooltip>` components" rule below was finally
  enforced everywhere, leaving it with zero real usages left to bypass.)
- **Dark mode**: every color utility needs a `dark:` variant - no exceptions.
- **Z-index**: governed by the scale documented directly in `src/index.css` - never adjust
  header/sidebar/modal z-index in isolation.
- **Colors**: not a separate hand-picked palette - follow `flowbite-react`'s own semantic color
  tokens per `node_modules/flowbite-react/dist/components/*/theme.js` rather than hand-picking
  Tailwind color classes, same ground-truth approach as everything else here.

## If a genuinely new, non-Flowbite-covered pattern comes up

Prefer whatever `flowbite-react` itself offers (check its component list before hand-rolling
something). If there's truly no Flowbite equivalent for a pattern this app needs (e.g. the
proprietary multi-room booking calendar - see CLAUDE.md's "Protected Components" note), build it
with plain Tailwind utility classes matching Flowbite's general visual language (the gray/blue
palette, `rounded-lg`, `shadow-md`, the spacing scale already visible throughout
`node_modules/flowbite-react/dist/components/*/theme.js`) rather than inventing a new one-off style.

## Category Filter Toggle Pattern (Search & Filter Bar)

On screens with search and category filtering (e.g. `MenuManager.tsx`, `InventoryManagement.tsx`, `KitchenManagement.tsx`):
- Category filter pills/bars **must not be open by default**.
- Display a filter toggle button (`<Filter className="w-4 h-4" />`) immediately to the right of the search input box.
- The category filter pills bar/carousel is revealed **only when the user clicks the filter toggle button**.
- Active filter indication: When a non-default category is selected and the filter bar is collapsed, display an active dot indicator on the filter toggle button.

## Tooltips & Popovers Specification (Flowbite Popover Standard)

Canonical reference: https://github.com/themesberg/flowbite/blob/main/content/components/popover.md

- **Never use generic OS/browser `title="..."` attributes or basic `<Tooltip>` components** for UI information, tooltips, or hover alerts.
- All hover tooltips and interactive micro-cards across the site must strictly use `<Popover>` (`src/components/Popover.tsx`) styling:
  - **Container**: `bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs`
  - **Header** (when titled): `px-3 py-2 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-white rounded-t-lg`
  - **Body**: `px-3 py-2 text-gray-600 dark:text-gray-300`
  - **Trigger**: Support `trigger="hover"` for informative popover tooltips and `trigger="click"` for action popovers.

## Single Calendar Specification (Flowbite Application UI Demo Calendar)

Canonical reference: https://flowbite.com/application-ui/demo/pages/calendar/

All single monthly calendars across the platform (such as single-room booking calendars, operational overview calendars, and attendance views) must follow the Flowbite Application UI Calendar layout:
- **Card Container**: `bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden`
- **Toolbar / Header**:
  - Month & year title (`text-base sm:text-lg font-bold text-gray-900 dark:text-white`) paired with navigation buttons (`<`, `>` chevron controls) and a quick `"Today"` jump button.
  - Context badges or action buttons aligned cleanly on the right.
- **Day-of-Week Columns**:
  - 7-column header grid (`grid grid-cols-7 border-y border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 py-2.5`) with uppercase tracking (`text-xs font-semibold uppercase tracking-wider text-center text-gray-500 dark:text-gray-400`).
- **Calendar Grid & Cells**:
  - 7-column grid using standard Flowbite grid dividers (`grid grid-cols-7 divide-x divide-y divide-gray-200 dark:divide-gray-700 border-b border-gray-200 dark:border-gray-700`).
  - Leading/trailing inactive cells: `min-h-[100px] p-2 bg-gray-50/50 dark:bg-gray-800/40`.
  - Active cells: `min-h-[100px] p-2 bg-white dark:bg-gray-800 flex flex-col justify-between`.
  - Today date badge: highlighted with a blue circular badge (`inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shadow-xs`).
  - Event / Booking pills: `rounded-md px-2 py-1 text-xs font-medium shadow-2xs` using Flowbite semantic color tokens (`blue`, `purple`, `emerald`, `amber`, `gray`).

## Date/Time Input Fields (found 21 Aug 2026)

The spec above governs full monthly **calendar views**. It says nothing about single date/time
**input fields**, which is why two raw native inputs slipped through every prior pass unflagged:
`KitchenManagement.tsx`'s Staff Meals "Date & Time of Record" (`type="datetime-local"`) and
`PettyCashManagement.tsx`'s Edit Expense modal (`type="date"` + `type="time"`). A raw
`type="date"`/`type="datetime-local"` input opens the browser's own OS-level picker (Chrome's
month grid + scrollable hour/minute columns) — not Flowbite, not stylable past the
`::-webkit-calendar-picker-indicator` icon (see `src/index.css`'s existing "Global Date Input"
block), and visually inconsistent with the rest of the app by construction, not by mistake.

**Rule**: any single date-entry field uses flowbite-react's real `Datepicker` component
(`node_modules/flowbite-react/dist/components/Datepicker`), not a raw `<input type="date">`.
**Caveat**: `Datepicker`'s props (`value`/`onChange`: `Date | null`, `minDate`, `maxDate`, etc.)
are date-only — no time support at all. For a field that needs a time component too (Staff Meals,
PettyCash's expense time), pair `Datepicker` for the date half with a separate `type="time"` input
for the time half (still native, still opens an OS picker, but it's a narrower, unavoidable gap —
flowbite-react has no Timepicker) rather than leaving the whole field as `type="datetime-local"`.

## DataTable & Table Log Specifications

Canonical Flowbite Datatables reference: https://github.com/themesberg/flowbite/blob/main/content/components/tables.md

All log tables, financial ledgers, receipts, and management tables across the application must adhere strictly to these rules:
1. **Vertical Hierarchy over Equal Stretches**:
   - Never stretch action forms and log tables side-by-side with equal height containers.
   - Action/Creation forms sit naturally on top in a compact card, followed by the full-width DataTable below.
2. **Standardized Toolbar Heights & Controls**:
   - All top-bar controls (Search input, timeframe selectors, category/payment dropdowns, Export CSV, and Action buttons) must share uniform `h-10` (40px) height, `text-xs font-medium`, `rounded-lg` borders, and cohesive hover/focus states.
   - Timeframe and date filter selects must specify at least `min-w-[200px]` to prevent month/year strings from truncating.
3. **Persistent Column Headers**:
   - Always include `persistTableHead` on all `<DataTable>` instances so column headers remain permanently visible during search, filter, and pagination changes.
4. **Content-Proportioned Column Widths & Sort Icon Clearances**:
   - Column widths must fit their underlying content AND their full uppercase header title with sort icon clearance:
     - **ID / Code Columns**: `minWidth: '130px–140px'` (never < 130px on sortable IDs)
     - **Timestamp / Date Billed / Checkout**: `minWidth: '150px–170px'`
     - **Category / Status / Payment Method**: `minWidth: '140px–160px'`
     - **Monetary Totals & Currency Columns** (e.g. `Stay Tariff`, `Food & Extras`, `Total Earned (₹)`, `Pending Payout (₹)`): `minWidth: '135px–160px'` with `tabular-numbers font-semibold`
     - **Primary Description / Name Columns**: Fluid `grow: 2` with `minWidth: '180px–220px'` to comfortably absorb remaining horizontal space without collapsing
     - **Actions Column**: Sized to fit contained buttons (`minWidth: '120px–240px'`) with `whitespace-nowrap flex items-center gap-2` to prevent button label wrapping.
5. **Standard Typography**:
   - All cell primary values use standard application font (`text-xs font-semibold text-gray-900 dark:text-white`).
   - Do NOT use `font-mono` on ID fields or fake blue links unless the ID actively navigates or opens a dedicated record modal.
   - Secondary subtitle metadata uses `text-2xs text-gray-500 dark:text-gray-400`.
6. **Action Buttons**:
   - Use standard `<Button size="sm">` (`h-8`, `text-xs font-medium`, `whitespace-nowrap shrink-0`) for Edit, Delete, or View actions.
7. **Pagination Dropdown**:
   - Rows-per-page dropdown is styled with opaque backgrounds (`#ffffff` light / `#1f2937` dark) and custom Flowbite arrows so options never render with transparent or glitchy overlays.
8. **Column Header Titles Never Truncate or Wrap Letter-by-Letter**:
   - **Horizontal Scroll Wrapper Requirement**: Every desktop `<DataTable>` must live inside a container with `overflow-x-auto` (e.g. `<div className="hidden md:block overflow-x-auto">`) so that wide multi-column tables scroll horizontally smoothly instead of shrinking column widths below their minimum readable size.
   - **Header Text Whitespace**: Both `src/utils/tableStyles.ts` (`headCells`) and `src/custom.css` (`.rdt_columnText`) enforce `white-space: nowrap !important; overflow: hidden; text-overflow: ellipsis; line-height: 1.3 !important;`. Header labels must NEVER break or wrap character-by-character into single vertical letters.
   - **Sortable Header Clearance**: `react-data-table-component` renders a sort arrow icon (~20px) inside sortable column headers alongside the 24px–28px cell padding. Sizing sortable columns with at least `minWidth: '130px–160px'` (per Rule 4) guarantees full header titles (`Receipt ID`, `Date Billed`, `Stay Tariff`, `Grand Total`, `Total Earned (₹)`) display completely without truncation or ellipses.
9. **Row Selection** (reference: flowbite.com/application-ui/demo/e-commerce/transactions/,
   added 21 Aug 2026) - only on tables where a real bulk action exists (bulk delete, bulk
   export-selected, bulk status change). `selectableRows` + a `selectableRowsComponent` that
   renders `flowbite-react`'s real `Checkbox` (see "Form Controls" above - never
   `react-data-table-component`'s native default). Don't add selection checkboxes to a table
   just to visually match the reference if nothing actually consumes the selection - check what
   bulk action would attach before enabling this on a given table.
10. **Numbered Pagination Footer** (same reference) - "Showing X-Y of Z" plus page-number
    buttons, not just prev/next arrows. Every table in the app currently uses
    `react-data-table-component`'s stock default pagination component (confirmed 21 Aug 2026:
    zero hits for `paginationComponent` anywhere in `src/`). Build one shared numbered-pagination
    component and pass it as `paginationComponent` on every `<DataTable>`, the same "one shared
    object, import it everywhere" pattern as `attachedTabsTheme` - don't re-derive it per page.
11. **Desktop Table / Mobile Card Split** (per [[mobile_first_requirement]] - a real Tailwind
    breakpoint swap, not just responsive classes on the table itself) - every `<DataTable>` needs
    a `hidden md:block` desktop table paired with a `md:hidden` mobile card list at the same
    breakpoint. This is already the convention on ~9 of the app's biggest table screens
    (`KitchenManagement.tsx`, `BillingCheckout.tsx`, `StaffManagement.tsx`,
    `InventoryManagement.tsx`, `PettyCashManagement.tsx`, `AuditLogsView.tsx`,
    `CashDrawerManager.tsx`, `MiscChargesManagement.tsx`, `ICalSyncManager.tsx`) - it just was
    never written down, so nothing enforces it on tables that don't have it yet. **Gap found
    21 Aug 2026**: each of those 9 files hand-rolls its own card markup and its own manual
    pagination slicing independently - there is no shared mobile-card component, so the
    breakpoint strategy is consistent but the actual card look can still drift page to page.
    When touching this rule, prefer extracting one shared component over adding a 10th hand-rolled
    copy.

## Attached Tabs Specification (Default Variant)

Canonical Flowbite Tabs reference: https://github.com/themesberg/flowbite/blob/main/content/components/tabs.md

All primary sub-page and section tab bars across the platform (e.g. `#take_food_order` / `#kitchen_orders` in `KitchenManagement.tsx`, Master Materials vs Categories in `InventoryManagement.tsx`, Appearance/Theme settings, the booking-status tabs in `BillingCheckout.tsx`) start from `variant="default"` on `<Tabs>`, but where a tab bar sits directly above the card/table it controls, it must use the **attached-tabs** treatment rather than Flowbite's bare default styling - reference implementation: `src/utils/tabsTheme.ts`'s `attachedTabsTheme` (20 Aug 2026, superseding the earlier plain bottom-border spec this section used to describe). Import that constant rather than re-deriving the theme object per page.
- **Tabs always sit on the card, never inside it**: the `<Tabs>` and the card/table below it are siblings with zero gap between them (no shared border/bg wrapper around both - that reads as "tabs stuck inside a box", not "tabs attached to the box"). The card gets `rounded-t-none border-t-0 -mt-px`: `rounded-t-none` since the tabs own the rounded top edge of the whole unit, `border-t-0` because the card's own default top border would otherwise draw a second dividing line right under the tabs (found 21 Aug 2026 - `attachedTabsTheme` only controls the *tabs'* borders, not the card's own default 4-sided one), and `-mt-px` to close any hairline gap high-DPI rounding can leave.
- **Every tab has its own border, active or inactive** - not just the container. This is what lets an inactive tab read as a distinct, closed tab shape next to the open one, unlike Flowbite's stock default variant which puts no border on inactive tabs at all.
- **Active tab**: white background (`dark:bg-gray-800`, matching the card's own background) and **no bottom border** - the tab visually "opens" straight into the card below it with no dividing line. This is the actual mechanism behind "sitting on the card", not just visual proximity.
- **Inactive tabs**: fully transparent background (no fill) so only the border outline shows, plus a bottom border (closing the box) that the active tab deliberately omits.
- **Tab Content Isolation**: each `TabItem` stays childless where the tab bar is attached to a card this way - the actual tab content lives in the card below (driven by the same active-tab state), not as the `Tabs` component's own tabpanel. This still leaves a real, empty `[role="tabpanel"]` div in the DOM (Flowbite always renders one per tab) - the app-wide `[role="tabpanel"] { padding-top: 0.5rem !important }` rule doesn't know it's empty and was inserting a real 8px gap under the tab row on every page using this pattern until `[role="tabpanel"]:empty { padding-top: 0 !important }` was added in `index.css` to exempt it (found 21 Aug 2026).

## Buttons

- **No button ever has a box-shadow**, in any state (default/hover/active/focus) - flat fill + border only. This is a deliberate departure from Flowbite's own `Button` theme.js, which puts `shadow-sm` on its base and additional `shadow-sm`/`shadow-xs` on solid color variants; the shared `src/components/Button.tsx` explicitly cancels all of it with `shadow-none` per color (20 Aug 2026).
- Any hand-rolled `<button>` styled to look like an action button (rather than a plain icon-only control) should be migrated to `src/components/Button.tsx` when touched, both for this shadow rule and for the DataTable Action Buttons rule below - don't hand-copy its color classes onto a raw `<button>`.

## Form Controls (Checkboxes, Radios, Toggles, Selects)

Ground truth is the theme.js files directly - `node_modules/flowbite-react/dist/components/
{Checkbox,Radio,ToggleSwitch,Select}/theme.js` - not memory or assumption, same method as
everything else in this file. **But reading theme.js text is not sufficient on its own - see the
correction below.**

- **Checkbox**: theme.js says `rounded`, not circular. A checkbox styled as a circle is a bug,
  not a variant (found 21 Aug 2026: `InventoryManagement.tsx`'s `selectableRows` DataTable had no
  `selectableRowsComponent`, so `react-data-table-component` rendered its own native checkbox
  instead of routing through this theme at all - check any `selectableRows` DataTable for the
  same gap).
  - **Correction, same day**: a checkbox using the exact correct component and exact correct
    `rounded` class was *still* found rendering as a full circle (`KitchenManagement.tsx`'s Staff
    Meals screen). Root cause: this project imports Flowbite's own theme package
    (`@import "flowbite/src/themes/default"` in `src/index.css`), and that package's
    `default.css` sets `--radius: 8px` as the token the bare `rounded` utility maps to - genuinely
    Flowbite's own current default, not a project misconfiguration (confirmed by measuring
    flowbite.com's own live checkbox demo, which renders ~4px, not circular - so this is a real
    gap in Flowbite's own theme.js not accounting for its own token at checkbox scale, not
    intended behavior to match). 8px radius on a 16px (`w-4 h-4`) checkbox is exactly 50% - a
    mathematical circle. **Fixed** with a global override in `src/index.css`:
    `input[type='checkbox'] { border-radius: 4px !important; }` - scoped to checkboxes only,
    never touches Radio's legitimate `rounded-full`.
  - **The actual lesson**: matching theme.js's literal class name text is necessary but **not
    sufficient**. This exact component read as compliant from source alone. Verify any shape/size
    claim by actually rendering the page and checking `getComputedStyle(el).borderRadius` (or a
    screenshot) - not by reading class names against theme.js text.
- **Radio**: `rounded-full` - circular is correct here, don't "fix" radios to match checkboxes.
- **ToggleSwitch**: pill-shaped track, its own shape family - for genuine on/off switches, not a
  checkbox substitute.
- **Select**: `rounded-lg` field.

## Flowbite Modals & Drawers Specification (Right Slide-over Drawers)

Canonical Flowbite Drawer reference: https://github.com/themesberg/flowbite/blob/main/content/components/drawer.md

All action modals, creation forms, and secondary management dialogs across the site (e.g. `New Service Request`, `Manage Custom Types`, item configurations, edit sheets):
- **Right Position**: Modals and form dialogs must open as a **Right-Side Drawer** (`<Drawer position="right" open={...} onClose={...}>`).
- **Structure**:
  - Top header with title, iconography, and explicit close button (`X`).
  - Scrollable content body (`flex-1 overflow-y-auto p-4`).
  - Fixed footer with Cancel & Action buttons (`p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850`).
- **Z-Index**: Modals and right drawers operate at `z-58` per application z-index layering scale.
- **In-Drawer Management**: When a drawer presents a list of entities (such as custom service types, material categories, or payment accounts), users must be able to **add new items directly from inside the drawer** via an inline creation form at the top, alongside inline edit and delete actions.

**Exception - confirmation/alert prompts (no form fields)**: a dialog that's fundamentally a yes/no or OK prompt - not a data-entry form or a list - is a centered `flowbite-react` `<Modal size="md|lg" popup dismissible className="z-9999 ...">`, not a right-side drawer, even though several of these were briefly rebuilt as drawers on 22 Aug 2026 during the drawer sweep. Reverted 23 Aug 2026 (explicit user report + screenshot): a short prompt in a full-height drawer left most of the drawer an empty void, with Cancel/Confirm stranded far below the message - a bad fit, unlike this rule's other drawers, which hold genuine multi-field forms or lists. `z-9999` (not `z-58`) matches custom.css's own z-index scale, which already reserves an "always on top" tier for toasts + the confirm dialog, so it stacks above an already-open drawer/page-modal.
- `ConfirmDialogContext.tsx` - the app-wide `useConfirm()`/`confirm()`/`alertModal()` dialog ("Delete this booking?", "Remove this feed?", etc.) - use this one for any NEW short plain-string confirmation, don't hand-roll another.
- `GlobalModal.tsx` - the app-wide `window.alert`/`window.showConfirm`/`window.showAlert` dialog (legacy call sites, e.g. `InventoryManagement.tsx`'s "Delete category?").
- `TenantDashboard.tsx`'s Delete Property / Not Enough Slots / Upgrade Package dialogs - kept as their own custom Modals (richer content than a plain string - a bulleted consequences list, conditional notes) rather than migrated onto `ConfirmDialogContext`, but still modals, not drawers. That file's Add Property and Edit Property dialogs are genuine multi-field forms and correctly stay Drawers.


