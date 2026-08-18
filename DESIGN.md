---
name: Ground Code PMS & Resort Management System
specification: Google Stitch DESIGN.md v1.0
theme:
  mode: dark-supported
  primary_color: "#3b82f6" # Blue 500
  secondary_color: "#10b981" # Emerald 500
  accent_amber: "#f59e0b" # Amber 500
  background_light: "#f8fafc" # Slate 50
  background_dark: "#0f172a" # Slate 900
  surface_light: "#ffffff"
  surface_dark: "#1e293b" # Slate 800
  border_light: "#e2e8f0" # Slate 200
  border_dark: "#334155" # Slate 700
typography:
  font_family: "Inter, system-ui, -apple-system, sans-serif"
  base_size: "14px"
  small_size: "12px"
  tooltip_size: "12px to 14px"
iconography:
  library: "lucide-react"
  rule: "Strictly use vector SVG icons from lucide-react. Do not render raw emojis in UI buttons, badges, or headers."
---

# Ground Code Design System & AI Guidelines (DESIGN.md)

This document defines the core visual design tokens, component architecture patterns, and UI rules for **Ground Code Multi-Tenant Resort Management System (PMS & KDS)**.

---

## 1. Iconography Standards
- **Primary Icon Library**: All component icons must be imported from `lucide-react`.
- **No Raw Emojis in UI**: Do not use unicode emojis (`⏱️`, `💳`, `📸`, `👤`, `✓`, `⚠️`) for interface controls, action buttons, status badges, or headers. Use Lucide SVG components (`Clock`, `CreditCard`, `QrCode`, `User`, `CheckCircle2`, `AlertCircle`).

---

## 2. Responsive Tables & Mobile Card Stacks
- **Dual Display Pattern**:
  - **Desktop (`md:` breakpoint and above)**: Render standard `<DataTable>` or tabular views.
  - **Mobile (`< md` breakpoint)**: Render card stacks (`md:hidden`) for maximum tap accessibility.
- **Top-Row Card Actions**: Action buttons (e.g. `Edit`, `Delete`, `Share`) in mobile cards must be placed in the top header row of the card.
- **10-Item Pagination**: Any list or table exceeding 10 entries (such as Served Dishes) must provide 10-item pagination with `Previous` / `Next` controls and a page counter (`Page X of Y`).

---

## 3. Modal Form Grid & Field Alignment
- **Spacious Desktop Grids**: Modal input fields on desktop screens must be arranged in uncrowded 2-column pairs (`grid grid-cols-1 sm:grid-cols-2 gap-3.5`).
- **No Squished Sub-Grids**: Never nest 2-column grids inside an existing 2-column grid cell (e.g., squishing passcodes into 1/4 width).
- **Checkbox Privilege Containers**: Checkbox rows (e.g. *Cash Handling User*, *Access All Properties*) must be rendered in structured, padded card containers (`min-h-[44px] bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-2.5`).

---

## 4. Stat KPI & Summary Metric Cards
- **Single Row Metric Bar**: Summary KPI card triplets (e.g., *Total Cash Collected*, *Total Handed Over*, *Net Cash In System*) must lay out in a single horizontal row (`grid grid-cols-3 gap-2 sm:gap-4`).
- **Responsive Padding**: Use responsive text scaling (`text-sm sm:text-2xl`), icon sizes (`w-3.5 h-3.5 sm:w-5 sm:h-5`), and padding (`p-2.5 sm:p-4`) so all 3 cards fit side-by-side cleanly without text truncation overflow.

---

## 5. Tooltips & Micro-Interactions
- **Legible Tooltip Typography**: Tooltips rendered via `<Tooltip>` must use legible font sizes (`text-xs sm:text-sm font-medium leading-normal`) with comfortable container padding (`px-3 py-2 max-w-xs sm:max-w-sm bg-slate-900/95 dark:bg-slate-800/95`).
- **Informational Badges**: Static non-interactive values (e.g. role titles, cash handling status) must be rendered as clean text rather than rounded button-style badges to avoid confusing users.

---

## 6. Section Headers & Horizontal Alignment Rules
- **Container Padding Integrity**: All sub-section headers (e.g. *Current Guest Served Dishes*, *Active System Users & Staff*, *Recent Receipt Audit Logs*) must include horizontal padding (`px-1`) matching the outer bounds of cards and search boxes below them. Never allow section titles to sit unpadded or flush against left margins.
- **Title & Pill Counter Hierarchy**: Section headers must feature bold title typography (`font-extrabold text-slate-900 dark:text-white text-sm tracking-wide`) accompanied by an aligned Lucide SVG icon and a structured pill badge counter (`text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60`).

---

## 7. Quantity Steppers & Mobile Cart Pull Tab
- **Square Quantity Step Buttons**: All `+` and `-` quantity steppers (in POS cards, cart rows, and order sheets) must use square shapes (`w-8 h-8 rounded-lg` / `w-9 h-9 rounded-xl font-extrabold flex items-center justify-center`) with generous touch targets. Do not use small circular pill buttons.
- **Top Pull-Tab Mobile Cart Handle**: Mobile cart bottom sheets must be expandable/collapsible via a top center pull-tab handle attached to the upper edge of the cart sheet featuring `<ChevronUp>` when collapsed and `<ChevronDown>` when expanded.

---

## 8. Navigation Tabs vs. Content Filter Buttons
- **Main Navigation Tabs (Tab Switchers)**:
  - Active Tab: Solid primary fill (`bg-blue-600 text-white shadow-xs font-bold`).
  - Inactive Tab: Clean outline / ghost button (`bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold`).
- **In-Page Content Filters (Category Pills, Status Filters)**:
  - Active Filter: Accent border & soft background tint (`border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 font-bold shadow-2xs`).
  - Unselected Filter: Ghost/outline button (`bg-transparent text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-medium`).

---

## 9. Card Elevation & Box Shadow Standard
- **Tailwind Box Shadow Standard**: All card containers across the application must adhere to the Tailwind CSS Box Shadow system (reference: [Tailwind CSS Box Shadow Documentation](https://tailwindcss.com/docs/box-shadow)).
- **Card Elevation Tokens**:
  - **Standard Cards & KPI Panels**: Styled with subtle elevation (`shadow-xs` / `shadow-sm`) combined with refined container borders (`border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl`).
  - **Interactive / Actionable Cards**: Enhanced with hover elevation transitions (`transition-all hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer`).
  - **Floating Drawers & Modals**: Higher elevation tiers (`shadow-xl` / `shadow-2xl`).
- **No Flat Unbounded Cards**: Cards must always present clear structural definition and elevation depth rather than appearing flat or boundary-less.

---

## 10. Unified Border Radius Standard
- **Single Universal Border Radius Rule**: EVERY element in the entire application that has a border radius—including outer card boxes, panels, section containers, bottom drawers, modals, buttons, form inputs, search bars, select dropdowns, navigation tabs, images, dish thumbnails, status badges, counter tags, and info labels—MUST use the exact same unified corner radius: **`rounded-xl` (12px / 0.75rem)**.
- **Absolute Visual Uniformity**: Zero variations in corner roundness are permitted across the site. Ad-hoc mixing of `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-2xl`, `rounded-3xl`, or capsule `rounded-full` shapes is strictly prohibited (with the sole exception of 1:1 circular user profile avatars and tiny notification dot indicators).

