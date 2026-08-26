- STRICT NO DEPLOYMENT RULE: Never execute any deployment scripts or server sync commands (e.g. deploy-staging.ps1, deploy-production.ps1). Work strictly on local environment only.
- Do not open files in editor tabs when viewing or making code edits unless explicitly requested by the user.
- Strictly adhere to visual design tokens, iconography, modal form grid rules, and responsive mobile layouts defined in [DESIGN.md](file:///c:/xampp/htdocs/artists_farm/DESIGN.md).
- **Popover Only (No Generic Tooltips) Rule**: Never use basic `<Tooltip>` components or generic OS/browser `title="..."` attributes for UI tooltips, action icons, or hover cards. Everywhere across the site, interactive hover/click info cards must exclusively use `<Popover>` (`src/components/Popover.tsx`) following Flowbite Popover styling with structured header/body containers, dark mode tokens (`dark:bg-gray-800 dark:border-gray-700`), `rounded-lg`, and `shadow-lg`.
- Category Filter Toggle Rule: On all screens with search & category filtering (e.g. food menu, inventory, POS), category filters must not be open by default; they must be toggled open/closed via a `<Filter className="w-4 h-4" />` button next to the search input.
- DataTable & Table Log Rules (Universal):
  - **No Equal Height Stretches**: Never use equal-height side-by-side grids between action forms and table logs; place forms on top with the full-width log table below.
  - **Toolbar Standardization**: All toolbar elements (Search, Timeframe/Filter dropdowns, Export CSV, Action buttons) must share exact `h-10` height, `text-xs font-medium` typography, and `rounded-lg` borders. Timeframe dropdowns must have at least `min-w-[200px]` to avoid label truncation.
  - **Persistent Headers**: Always include `persistTableHead` on all `<DataTable>` components so column titles are permanently visible across all states.
  - **Horizontal Scroll Container**: Desktop `<DataTable>` must always be wrapped in a container with `overflow-x-auto` (e.g. `<div className="hidden md:block overflow-x-auto">`) so multi-column tables scroll cleanly on narrower screens without squishing headers.
  - **Content & Sort Icon Clearance Widths**: Column widths must fit cell content AND uppercase header titles with sort icons (~20px) and cell padding (IDs: 130–140px, Dates/Timestamps: 150–170px, Currency/Totals: 135–160px, Status/Method: 140–160px, Actions: 120–240px). Fluid description/name columns use `grow: 2` with `minWidth: '180px–220px'`.
  - **Header Text Whitespace**: Header cells enforce `white-space: nowrap !important; overflow: hidden; text-overflow: ellipsis; line-height: 1.3 !important;`. Header labels must never wrap character-by-character into single vertical letters.
  - **Typography Consistency**: ID and data cells use `text-xs font-semibold text-gray-900 dark:text-white` (never `font-mono` or fake blue links unless clickable). Subtitles use `text-2xs text-gray-500`.
- **Card Action Buttons & Secondary Edit Button Rule**: Edit buttons are secondary management actions and must **never** use primary button styling (e.g. solid filled primary blue). Primary actions on resource cards (e.g., "Open Property", "Manage") use `<Button variant="primary">`, while edit actions use `<Button variant="secondary">` (or `<Button variant="outline">`).
- **Red Delete & Logout Action Icons Rule**: All delete action icons/buttons and logout action icons/buttons across the platform must strictly use red styling tokens (`text-red-600 dark:text-red-400` or `hover:text-red-600 dark:hover:text-red-400`) to clearly signify destructive or session-terminating actions.
- **No Icon Swap on Mobile & Delete Trash Can Icon Rule**: Icons for actions (Delete, Edit, View, Settings, etc.) must NEVER change, swap, or degrade between desktop and mobile screen sizes. Specifically, Delete action buttons across all tables, cards, and drawers must ALWAYS use a standard Trash Can icon (`Trash2`), never a cross/close (`X`) icon.
- **No Hindi Localization Rule**: No need to work on or update the Hindi version (`src/i18n/hi.ts`) unless explicitly asked for by the user. Focus exclusively on the default English implementation (`src/i18n/en.ts`) and direct English UI text.

---

# Active SaaS Engineering & Product Personas

This workspace is a **Multi-Tenant Hospitality & Resort Management SaaS (PMS & KDS)** built with **React, TypeScript, Tailwind CSS, Vite, PHP, and MySQL (91 tables)**. The following 15 specialized agency personas are curated and active for this project:

## 1. Core Development & Full-Stack
- **`agency-senior-developer`**
  - **Use:** Full-stack implementation specialist across React components, Tailwind styling, Livewire/PHP endpoints, and modular features.
- **`agency-frontend-developer`**
  - **Use:** React 18, TypeScript strict typing, responsive dashboard layouts, modal/drawer interactions, and client state management.
- **`agency-backend-architect`**
  - **Use:** Modular PHP REST API endpoints (`php/api/router.php`, `php/billing/`, `php/kitchen/`), routing, and multi-tenant data isolation.
- **`agency-database-optimizer`**
  - **Use:** MySQL schema design, query optimization, indexing strategies, PDO transaction integrity, and migration scripts.
- **`agency-code-reviewer`**
  - **Use:** Code quality inspection, bug detection, regression checking, and maintainability reviews.
- **`agency-minimal-change-engineer`**
  - **Use:** Surgical, minimum-viable diffs to fix issues without unintended side-effects or refactor cascades.

## 2. UI / UX & Design
- **`agency-ui-designer`**
  - **Use:** Visual design system, dark mode tokens, typography hierarchy, and clean hotel/resort management dashboard aesthetics.
- **`agency-ux-architect`**
  - **Use:** Front-desk and reservation UX, multi-room calendars, check-in/check-out flows, KDS boards, and inventory workflows.
- **`agency-ui-finish-gate-reviewer`**
  - **Use:** Production finish gate review to catch unpolished states, awkward alignments, or inconsistent UI before shipping.

## 3. Security & Multi-Tenancy
- **`agency-identity-access-engineer`**
  - **Use:** Multi-tenant RBAC, real backend system roles (Root Admin, Super Admin, Admin, Staff Supervisor, Staff Kitchen, Staff), financial handler flags, and session cookies.
- **`agency-application-security-engineer`**
  - **Use:** Defensive application security, API authorization checks, CSRF/CORS origin verification, and input validation.
- **`agency-secrets-credential-hygiene-engineer`**
  - **Use:** Safeguarding database credentials, WhatsApp Business API tokens, and Telegram bot secrets.

## 4. SaaS Business, Billing & Domain Workflows
- **`agency-payments-billing-engineer`**
  - **Use:** Subscription tiers, tenant license management, GST calculation, billing receipts, invoices, and payment gateway integration.
- **`agency-hospitality-guest-services`**
  - **Use:** Hotel/Resort domain expertise: guest folios, ID document uploads, room tariffs, meal logs, petty cash drawers, and housekeeping service requests.
- **`agency-product-manager`**
  - **Use:** SaaS feature roadmapping, tenant module toggles (`property_modules`), user onboarding, and operational prioritization.
