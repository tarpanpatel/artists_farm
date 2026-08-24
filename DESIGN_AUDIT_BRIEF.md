# Design Audit Sweep — Brief for ai2

**Objective**: Sweep `src/` for divergence from `DESIGN.md` + `CLAUDE.md`'s UI rules and fix it,
without asking per-page. Ground truth, in priority order:
1. `node_modules/flowbite-react/dist/components/*/theme.js` for exact classes.
2. `DESIGN.md`'s written rules.
3. https://flowbite.com/application-ui/demo/ for whole-page patterns.

Never use https://flowbite.com/docs/components/* — unreleased token system, see DESIGN.md's own
warning on this (confirmed 19 Aug 2026).

## Hard exclusion

`OperationalDashboard.tsx`'s "Booking Calendar Row" (the multi-room booking grid — color-coded
bookings, blocked dates, OTA-block conversion, edit modal) is **Protected** per CLAUDE.md. Do not
refactor, restyle, or otherwise modify this logic under any phase below, even where it visibly
diverges from a rule. Flag it in the tracking file, don't touch it. (`DateRangePicker.tsx` and
`TodayOverview.tsx` are NOT protected — they're in scope like anything else.)

## Page inventory

Don't hand-browse pages to find what exists. Pull the definitive list from `src/App.tsx`'s
menuItemKey routing map — grep for patterns like `tab: '.*', key: '` (e.g. the
`stock_requests`/`inventory` mapping) so nothing is missed by omission.

## Phases

Do these **in order**. One phase = one reviewable batch — don't mix fixes from different phases
in the same pass.

### 1. Tabs
Full spec: DESIGN.md's "Attached Tabs Specification":
- Every `<Tabs>` sitting directly above the card/table it controls must import
  `attachedTabsTheme` from `src/utils/tabsTheme.ts` (see `BillingCheckout.tsx` /
  `KitchenManagement.tsx` as correct reference implementations) — don't re-derive the theme
  object per page. **Not every `<Tabs>` qualifies** — top-level page tabs that don't sit
  directly on a card stay as-is (DESIGN.md's own qualifier).
- The card below the tabs gets `rounded-t-none border-t-0 -mt-px` — this is on the card, not
  something `attachedTabsTheme` controls, so it's easy to miss even when the theme import is
  correct.
- Every tab (active or inactive) has its own border — active tab is white/`dark:bg-gray-800`
  with no bottom border; inactive tabs are transparent with a bottom border.
- **Tab content isolation**: each `TabItem` stays childless — the actual tab content lives in
  the card below (driven by the same active-tab state), not inside the `Tabs` component's own
  tabpanel. This is a per-screen authoring choice, not something the shared theme enforces for
  you — check it explicitly, not just "did this import attachedTabsTheme."

Grep starting point: files using `<Tabs` without importing `attachedTabsTheme`, then judge each
against the "sits directly above a card" test before changing it.

### 2. Tables
Full spec: DESIGN.md's "DataTable & Table Log Specifications" — all 7 rules apply, not a subset:
1. **Vertical hierarchy, not equal stretches** — action/creation forms sit in a compact card on
   top, full-width DataTable below. Never side-by-side with equal-height containers.
2. **Uniform toolbar controls** — search/timeframe/category/export/action controls all `h-10`,
   `text-xs font-medium`, `rounded-lg`; date/timeframe selects `min-w-[200px]` minimum.
3. **`persistTableHead`** on every `<DataTable>` instance, no exceptions.
4. **Content-proportioned column widths** — banded widths per column type (ID/code, timestamp,
   category/status, monetary, description, actions) per the exact px ranges in DESIGN.md.
5. **Standard typography** — `text-xs font-semibold text-gray-900 dark:text-white` on primary
   cell values; no `font-mono` on IDs or fake blue links unless the ID actually navigates;
   `text-2xs text-gray-500 dark:text-gray-400` for secondary/subtitle metadata.
6. **Action buttons** — `<Button size="sm">` (`h-8`, `text-xs font-medium`, `whitespace-nowrap
   shrink-0`) for Edit/Delete/View, not hand-rolled `<button>`.
7. **Pagination dropdown** — opaque backgrounds (`#ffffff` light / `#1f2937` dark) and custom
   Flowbite arrows, never transparent/glitchy overlays.
8. **Column header titles never truncate** — check this separately from rule 4's width bands,
   satisfying one does not satisfy the other. `react-data-table-component`'s default header CSS
   ellipsizes single-line text, so a column sized correctly for its cell content can still clip
   its own header label (confirmed bug: `PettyCashManagement.tsx`'s Expenses table — Category/
   Total/Status columns are all within rule 4's documented width bands and still show
   "CATE...", "TOT...", "STATUS / MET..."). Fix by widening the column past the band, letting
   the header wrap to two lines (`white-space: normal` override), or shortening the label
   deliberately — not by leaving it accidentally cut off.
   **Fixed globally 21 Aug 2026** — `.rdt_columnText` in `src/custom.css` (NOT
   `customStyles.headCells`/`.rdt_TableCol` — the truncating CSS is on a separate inner element
   the library renders just for the label text; an override on the outer cell compiles fine and
   does nothing, which is exactly how this sat "documented as fixed" for days with zero actual
   effect anywhere, confirmed by a live screenshot of `CashDrawerManager.tsx` still truncating
   after this file's own Phase 2 had already been marked Completed for that exact file). Don't
   re-add a per-component fix — verify it's holding (render the page, check the header actually
   wraps instead of clipping) and move on, same as the checkbox fix below.
9. **Row selection, where a bulk action exists** — `selectableRows` + a `selectableRowsComponent`
   rendering flowbite-react's real `Checkbox` (see Phase 8 below), only on tables that have an
   actual bulk action to perform on the selection. Don't add checkboxes just to visually match
   the reference with nothing wired to consume them.
10. **Numbered pagination footer** — "Showing X-Y of Z" + page-number buttons, not just prev/next
    arrows. Every table currently uses `react-data-table-component`'s stock default (confirmed:
    zero hits for `paginationComponent` in `src/`). Build **one** shared numbered-pagination
    component, reuse it everywhere — same pattern as `attachedTabsTheme`.
11. **Desktop table / mobile card split** — `hidden md:block` desktop `<DataTable>` paired with
    `md:hidden` mobile card list at the same breakpoint. Already the convention on ~9 files
    (`KitchenManagement.tsx`, `BillingCheckout.tsx`, `StaffManagement.tsx`,
    `InventoryManagement.tsx`, `PettyCashManagement.tsx`, `AuditLogsView.tsx`,
    `CashDrawerManager.tsx`, `MiscChargesManagement.tsx`, `ICalSyncManager.tsx`) — check every
    other `<DataTable>` has it too. Each of those 9 currently hand-rolls its own card markup and
    pagination slicing with no shared component — when fixing a table missing this split, extract
    a shared mobile-card component rather than adding a 10th hand-rolled copy.

### 3. Buttons
Zero box-shadow anywhere, in any state. Hand-rolled action `<button>`s (grep for `shadow-`
near `<button`) migrate to `src/components/Button.tsx` — don't hand-copy its color classes onto
a raw `<button>`.

### 4. Modals / Drawers
Full spec: DESIGN.md's "Flowbite Modals & Drawers Specification":
- **Right position** — `<Drawer position="right" open={...} onClose={...}>`, not a centered
  `<Modal>`.
- **Structure** — header with title/icon/close `X`; scrollable body
  `flex-1 overflow-y-auto p-4`; fixed footer with Cancel + Action buttons
  (`p-4 border-t ... flex justify-end gap-2 bg-gray-50 dark:bg-gray-850`).
- **Z-index** — `z-58` per the app's z-index layering scale.
- **In-drawer management** — when a drawer presents a list of entities (custom service types,
  material categories, payment accounts), users must be able to add new items directly from
  inside the drawer via an inline creation form at the top, alongside inline edit/delete — don't
  make them close the drawer and open a separate "Add" modal.

### 5. Tooltips / Popovers
Grep for `title="` — zero native browser tooltips allowed anywhere in the UI. Replace with
Flowbite Popover styling per DESIGN.md's spec (container/header/body classes, hover vs click
trigger).

### 6. Category Filter Toggle Pattern
Every screen with search + category filtering: pills collapsed by default, a `Filter` toggle
button next to the search input, active-dot indicator when collapsed with a non-default category
selected.

### 7. Single Calendar spec
Non-Protected calendars only (see Hard exclusion above) — Card container, toolbar, day-of-week
columns, cell treatment per DESIGN.md's "Single Calendar Specification".

**Also in this phase, found 21 Aug 2026**: raw `<input type="date">`/`type="datetime-local">`
fields open the browser's own OS-level picker, not Flowbite — visually inconsistent by
construction. Full spec + fix pattern: DESIGN.md's "Date/Time Input Fields". Two known instances:
`KitchenManagement.tsx:2446` (Staff Meals, `datetime-local`) and `PettyCashManagement.tsx:1825`/
`1832` (Edit Expense modal, `date` + `time`). Swap the date half to flowbite-react's `Datepicker`
component; **`Datepicker` has no time support**, so a paired `type="time"` input stays for the
time half — don't try to force the whole field through `Datepicker` alone. Grep
`type=["'](date|datetime-local)["']` across `src/` to confirm scope hasn't grown beyond these two
files before starting.

### 8. Form Controls (checkboxes, radios, toggles, selects)
**Not covered by DESIGN.md's written sections at all** — this phase has no prose spec to quote,
only the theme.js files. Read them, don't guess from memory — **but reading theme.js is not
enough on its own, see the correction below before doing anything else in this phase.**
- `node_modules/flowbite-react/dist/components/Checkbox/theme.js` — `rounded`, not circular.
- `node_modules/flowbite-react/dist/components/Radio/theme.js` — `rounded-full`. This one is
  *correctly* circular — don't "fix" radios to be square, only checkboxes were wrong.
- `node_modules/flowbite-react/dist/components/ToggleSwitch/theme.js` — pill-shaped track,
  different shape family again, for genuine on/off switches (not a checkbox substitute).
- `node_modules/flowbite-react/dist/components/Select/theme.js` — `rounded-lg` field.

**Checkbox circular-shape bug: fixed globally, 21 Aug 2026 — don't re-derive a per-component fix.**
Root cause was one level deeper than any single component: this project imports Flowbite's own
theme package (`@import "flowbite/src/themes/default"` in `src/index.css`), whose `default.css`
sets `--radius: 8px` as the token the bare `rounded` utility maps to. On a 16px (`w-4 h-4`)
checkbox, 8px radius is exactly 50% — a circle — **even on a checkbox using the exact correct
component and exact correct `rounded` class**, which is exactly what was found on
`KitchenManagement.tsx`'s Staff Meals screen and is why a prior pass through this file describing
those checkboxes as "already correctly rounded" was wrong — it read the class name, not the
rendered result. Fixed with one global override, already in `src/index.css`:
`input[type='checkbox'] { border-radius: 4px !important; }` — scoped to checkboxes only, verified
not to affect Radio. **Don't add a second, redundant per-component fix for this** — just confirm
via `getComputedStyle(el).borderRadius` on a couple of pages that it's holding, then move on.

**The actual lesson for this whole phase (and arguably every phase)**: matching theme.js's class
name text is necessary but **not sufficient**. Verify shape/size/spacing claims by rendering the
page and checking computed style or a screenshot — not by reading source against theme.js text.

**Still open**: `InventoryManagement.tsx`'s "Master Materials Catalog" `<DataTable selectableRows
...>` (~line 1377) has no `selectableRowsComponent` prop, so `react-data-table-component` renders
its own native default checkbox for row selection — it never goes through flowbite-react's
`Checkbox` theme at all (though it'll now inherit the global radius fix above regardless, since
that's a bare `input[type='checkbox']` selector — verify that's actually true rather than assuming
it, then decide if the native-vs-flowbite-component gap still needs its own fix beyond shape,
e.g. focus ring styling, checked-state icon). Grep the whole app for `selectableRows` (currently
the only hit) to confirm scope hasn't grown.

### 9. Icon migration (separate phase, do last)
`lucide-react` → Flowbite icons. This is bigger and riskier than the others: Flowbite ships raw
SVGs, not a React component library like `lucide-react`, so each swap needs a real SVG
substitute wired up (check `src/utils/iconResolver.tsx` for any existing pattern before
inventing one), not a mechanical import rename. Go screen-by-screen as each file is touched for
other reasons — **not** a mass find-replace sweep, per CLAUDE.md's standing rule, even though
this brief is an explicit go-ahead for the other 8 phases.

## Tracking

Maintain `DESIGN_AUDIT.md` at repo root — one row per phase × per file, checked off as fixed.
This is what makes the sweep resumable across sessions and lets the user see progress without
opening each page themselves.

## Verification

After each phase, actually run the app and visually check 2–3 representative pages that phase
touched — not just "the diff compiles." Tailwind class correctness doesn't guarantee visual
correctness — this isn't a hypothetical: a checkbox using the exact correct flowbite-react
component with the exact correct `rounded` class, matching theme.js literally, still rendered as
a full circle in production (see Phase 8) — the bug was in how the project's own imported
Flowbite theme package defines its default radius token, invisible from reading any component's
source code. Reading class names against theme.js text tells you the code matches the spec; it
does not tell you what actually renders. When a rule is about shape, size, spacing, or anything
else visual, confirm it with `getComputedStyle()` on the real rendered element or a screenshot —
not by re-reading the same source file more carefully.

**Second confirmed instance, 21 Aug 2026 — this keeps happening, take it seriously.** Phase 2's
column-header-truncation rule (rule 8) was written up as required, referenced against a specific
file (`PettyCashManagement.tsx`), and `DESIGN_AUDIT.md` marked that file's whole Phase 2 row
"Completed ✅" — but the fix was never actually applied anywhere, on any file, because the
obvious-looking fix location (`customStyles.headCells` / `.rdt_TableCol`) isn't where
`react-data-table-component` actually puts the truncating CSS (a separate inner element,
`.rdt_columnText`, styled via the library's own bundled stylesheet). A change to the wrong
element compiles, looks plausible in a diff, and does *nothing* — and nobody caught it because
nobody rendered the page and looked. Found only because the user screenshotted a completely
different file (`CashDrawerManager.tsx`) months later and asked why the columns were still
unreadable. **Before marking any row "Completed" in `DESIGN_AUDIT.md`, actually load that exact
page and look at it** — nothing short of that catches this class of bug, and "it's the same
pattern as a file I already fixed" is exactly the assumption that let it ship broken everywhere.

## Guardrails

- Small batches. Don't touch dozens of files in one uncommitted pile.
- Don't commit or deploy without being asked, per standing house rule.
- Flag ambiguous cases (DESIGN.md's rule doesn't clearly apply, or conflicts with something
  page-specific) instead of guessing silently.
