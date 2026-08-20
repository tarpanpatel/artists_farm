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
- **Icons**: `lucide-react` only, no raw emojis in UI controls - see CLAUDE.md's "Icon Library"
  section, which already states this independent of any Flowbite-specific guidance.
- **Colors/dark-mode/z-index/etc.**: still governed by CLAUDE.md's relevant sections (`UI & Design
  Rules`, the documented z-index scale in `src/index.css`) - those weren't part of the removed
  design-rule set and remain in force.

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
4. **Content-Proportioned Column Widths**:
   - Column widths must fit their underlying content:
     - **ID / Code Columns**: `width: '110px–120px'`, `minWidth: '100px'`
     - **Timestamp / Date Billed**: `width: '140px–160px'`, `minWidth: '130px'`
     - **Category / Status**: `width: '120px–160px'`, `minWidth: '110px'`
     - **Monetary Totals**: `width: '110px–130px'`, `minWidth: '100px'`, with `tabular-numbers font-semibold`
     - **Primary Description / Name Columns**: Fluid `grow: 2` with `minWidth: '180px–220px'` to comfortably absorb all remaining horizontal space
     - **Actions Column**: Sized to fit contained buttons (`width: '110px–185px'`) with `whitespace-nowrap flex items-center gap-2` to prevent button text wrapping.
5. **Standard Typography**:
   - All cell primary values use standard application font (`text-xs font-semibold text-gray-900 dark:text-white`).
   - Do NOT use `font-mono` on ID fields or fake blue links unless the ID actively navigates or opens a dedicated record modal.
   - Secondary subtitle metadata uses `text-2xs text-gray-500 dark:text-gray-400`.
6. **Action Buttons**:
   - Use standard `<Button size="sm">` (`h-8`, `text-xs font-medium`, `whitespace-nowrap shrink-0`) for Edit, Delete, or View actions.
7. **Pagination Dropdown**:
   - Rows-per-page dropdown is styled with opaque backgrounds (`#ffffff` light / `#1f2937` dark) and custom Flowbite arrows so options never render with transparent or glitchy overlays.

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


