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
