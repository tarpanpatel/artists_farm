- DEPLOYMENT RULE: Only execute deployment scripts or server sync commands (e.g. deploy-staging.ps1, deploy-production.ps1) when the user explicitly asks to deploy/publish. Never deploy automatically or proactively.
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
- **Buttons Everywhere (No Plain Linked Text for Actions) Rule**: Everywhere across the site, interactive primary and secondary actions (e.g. "Open Property", "Manage", "View Details", "Save", "Create", "Edit") must strictly be rendered as formal Flowbite `<Button>` components (`variant="primary"`, `variant="secondary"`, etc.) rather than plain linked text, colored anchor links (`text-teal-600`, `text-blue-600`), or clickable text spans. Users must always have clear visual button affordances so they unambiguously know what is clickable.
- **Horizontal Space-Saving Card Layout Rule**: Resource, property, and entity cards (such as in property pickers, selection dialogs, and overview lists) must arrange the icon on the left with title and slug/metadata placed horizontally to the right of the icon (`flex items-center gap-3`), accompanied by an explicit action button on the right. Never vertically stack icons above titles in full-width list cards when horizontal placement saves vertical space and prevents unnecessary vertical scrolling.
- **Action Button Hierarchy & Ghost Button Usage**:
  - **Primary CTA (`variant="primary"`)**: High-intent primary action (e.g. "Open Property", "Save Changes", "Create Booking"). Solid filled Flowbite blue. Exactly 1 dominant primary action per card or view group.
  - **Secondary Action (`variant="secondary"`)**: Form/modal cancel, secondary options, auxiliary filters. Outlined/bordered button.
  - **Secondary Edit Action (`variant="edit"`)**: Specifically reserved for Edit actions (`bg-blue-50 border border-blue-200 text-blue-700`). Never use primary blue for editing.
  - **Ghost Action (`variant="ghost"`)**: Lightweight utility actions (header Back navigation, dismiss actions, table row quick icons, header logout). Keeps the layout feeling light, airy, and modern without heavy visual borders competing with content, while ensuring full button ergonomics (touch sizing, hover pill highlight, focus states).
  - **Destructive Action (`variant="danger"` or `variant="ghost"` with red tokens)**: Delete or Log Out actions must strictly use red styling tokens (`text-red-600 dark:text-red-400` or `hover:text-red-600 dark:hover:text-red-400` / `hover:bg-red-50 dark:hover:bg-red-950/40`) to clearly signify destructive or session-terminating actions.
- **Card Action Buttons & Secondary Edit Button Rule**: Edit buttons are secondary management actions and must **never** use primary button styling (e.g. solid filled primary blue). Primary actions on resource cards (e.g., "Open Property", "Manage") use `<Button variant="primary">`, while edit actions use `<Button variant="secondary">` (or `<Button variant="outline">`).
- **Red Delete & Logout Action Icons Rule**: All delete action icons/buttons and logout action icons/buttons across the platform must strictly use red styling tokens (`text-red-600 dark:text-red-400` or `hover:text-red-600 dark:hover:text-red-400`) to clearly signify destructive or session-terminating actions.
- **No Icon Swap on Mobile & Delete Trash Can Icon Rule**: Icons for actions (Delete, Edit, View, Settings, etc.) must NEVER change, swap, or degrade between desktop and mobile screen sizes. Specifically, Delete action buttons across all tables, cards, and drawers must ALWAYS use a standard Trash Can icon (`Trash2`), never a cross/close (`X`) icon.
- **Wizard Stepper Completion Status Rule**: A wizard step must NEVER show as complete (green) unless its required data is actually filled in. Any skipped, passed, or incomplete step with missing data MUST show in **Orange/Amber** (`bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-2 border-amber-500`) with an incomplete indicator icon (`AlertCircle`), and connect via an amber line (`bg-amber-400`). Only fully completed steps render in green (`CheckCircle2`).
- **Unified Loading Ring Spinner Rule**: Always use the standard Flowbite `<Loader2 className="... animate-spin" />` component for all loading states across the platform (splash screens, cards, tables, drawers, and buttons). Never build custom CSS border-t/border-r spinner rings.
- **Flowbite Toast Styling Standard Rule**: All toast notifications across the entire platform (success, error/danger, warning, interactive feedback) must strictly follow the official Flowbite Toast component specifications ([https://flowbite.com/docs/components/toast/](https://flowbite.com/docs/components/toast/)) using `<Toast>` / `<ToastToggle>` or `src/components/ToastContext.tsx`. Never build custom unstyled centered floating green pills, ad-hoc alert toasts, or borderless toast notifications. Toasts must always feature: (1) `rounded-lg` container with dark mode token support (`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg`), (2) `w-8 h-8 rounded-lg` colored icon badge chip (`bg-green-100 text-green-500 dark:bg-green-800 dark:text-green-200` for success, `bg-red-100 text-red-500 dark:bg-red-800 dark:text-red-200` for error, `bg-orange-100 text-orange-500 dark:bg-orange-700 dark:text-orange-200` for warning), (3) `ms-3 text-sm font-normal text-gray-900 dark:text-white` body typography, and (4) standard dismiss toggle button.
- **Bordered Count & Number Badges Rule**: All count pills, number badges, and indicator badges across the entire site (including tab counters, card header counts, alert badges, notification counts, filter count pills, and table status/number badges) must strictly have borders (e.g. `border border-blue-200 dark:border-blue-800`, `border border-slate-200 dark:border-slate-700`, `border border-red-200 dark:border-red-800`, `border border-amber-200 dark:border-amber-800`, `border border-emerald-200 dark:border-emerald-800`, `border border-gray-200 dark:border-gray-700`). Never render a count badge with a solid or pastel background without its corresponding border token in both light and dark modes.
- **Non-Interactive Badges & Button Exclusivity Rule**: Badges (`<Badge>`) and status/count chips are strictly passive, non-interactive visual indicators. Anything that performs an action, triggers navigation, jumps dates (e.g. 'Today'), or opens dialogs must NEVER be rendered as a badge or in badge-like chip styles (`bg-blue-50 text-blue-600 rounded-full`). Interactive actions must strictly use formal Flowbite `<Button>` components (`variant="primary"`, `variant="secondary"`, `variant="outline"`, or `variant="ghost"`) so users have unambiguous visual button affordances.
- **No Hindi Localization Rule**: No need to work on or update the Hindi version (`src/i18n/hi.ts`) unless explicitly asked for by the user. Focus exclusively on the default English implementation (`src/i18n/en.ts`) and direct English UI text.
- **Archived/Redundant Features Rule**: Skip `_unwanted/` entirely during any site-wide sweep (design consistency, safe-area audits, refactors) — it holds features intentionally taken off the live site but kept on disk for possible future use (currently: `ai/`, `ical/`), each with its own `README.md` explaining what's archived vs. what's still live elsewhere. Check `CLAUDE.md`'s "Feature Modules" index and each archive's `README.md` before assuming a related-looking live file is fair game too — some backend files near an archived feature are still genuinely load-bearing for other things (see `_unwanted/ical/README.md` for a concrete example).

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

## 5. Legal, QA & Infrastructure
- **`agency-legal-counsel`**
  - **Use:** SaaS Terms of Service, Privacy Policies, data protection compliance, FSSAI/police register regulations, and contract templates.
- **`agency-qa-automation-engineer`**
  - **Use:** End-to-end automated testing, regression test suites for reservation booking grids, KDS kitchen orders, and petty cash reconciliations.
- **`agency-devops-engineer`**
  - **Use:** Local server architecture, Apache/MySQL performance tuning, SSL security configuration, database backup routines, and environment management.
