- DEPLOYMENT RULE: Never run a deployment script or server-sync command (e.g. deploy-staging.ps1) until you have asked the user in chat and gotten explicit approval for that specific deploy — every time, no carryover from a previous deploy. Never deploy automatically or proactively. Production (deploy.ps1 / ground-code.com) stays hard-blocked per CLAUDE.md regardless. See `.agents/rules/deploy_policy.md`.
- Do not open files in editor tabs when viewing or making code edits unless explicitly requested by the user.
- Strictly adhere to visual design tokens, iconography, modal form grid rules, and responsive mobile layouts defined in [DESIGN.md](file:///c:/xampp/htdocs/artists_farm/DESIGN.md).
- **Popover Only (No Generic Tooltips) Rule**: Never use basic `<Tooltip>` components or generic OS/browser `title="..."` attributes for UI tooltips, action icons, or hover cards. Everywhere across the site, interactive hover/click info cards must exclusively use `<Popover>` (`src/components/Popover.tsx`) following Flowbite Popover styling with structured header/body containers, dark mode tokens (`dark:bg-gray-800 dark:border-gray-700`), `rounded-lg`, and `shadow-lg`.
- Category Filter Toggle Rule: On all screens with search & category filtering (e.g. food menu, inventory, POS), category filters must not be open by default; they must be toggled open/closed via a `<Filter className="w-4 h-4" />` button next to the search input.
- **Date Year Display Rule (Site-Wide)**: Everywhere across the platform, dates formatted with ordinal day and month (e.g. "3rd Sep", "8th Sep") must strictly display the 4-digit year whenever the date is NOT in the current calendar year (e.g. "7th Jan 2027", "15th Dec 2025"). In the current year, omit the year for compact clarity ("3rd Sep", "8th Sep"). Always use the centralized `formatDateOrdinal()` helper in `src/utils/dateUtils.ts` to ensure consistent site-wide date rendering.
- DataTable & Table Log Rules (Universal):
  - **No Equal Height Stretches**: Never use equal-height side-by-side grids between action forms and table logs; place forms on top with the full-width log table below.
  - **Toolbar Standardization**: All toolbar elements (Search, Timeframe/Filter dropdowns, Export CSV, Action buttons) must share exact `h-10` height, `text-xs font-medium` typography, and `rounded-lg` borders. Timeframe dropdowns must have at least `min-w-[200px]` to avoid label truncation.
  - **Persistent Headers**: Always include `persistTableHead` on all `<DataTable>` components so column titles are permanently visible across all states.
  - **Horizontal Scroll Container**: Desktop `<DataTable>` must always be wrapped in a container with `overflow-x-auto` (e.g. `<div className="hidden md:block overflow-x-auto">`) so multi-column tables scroll cleanly on narrower screens without squishing headers.
  - **Content & Sort Icon Clearance Widths**: Column widths must fit cell content AND uppercase header titles with sort icons (~20px) and cell padding (IDs: 130–140px, Dates/Timestamps: 150–170px, Currency/Totals: 135–160px, Status/Method: 140–160px, Actions: 120–240px). Fluid description/name columns use `grow: 2` with `minWidth: '180px–220px'`.
  - **Header Text Whitespace**: Header cells enforce `white-space: nowrap !important; overflow: hidden; text-overflow: ellipsis; line-height: 1.3 !important;`. Header labels must never wrap character-by-character into single vertical letters.
  - **Typography Consistency**: ID and data cells use `text-xs font-semibold text-gray-900 dark:text-white` (never `font-mono` or fake blue links unless clickable). Subtitles use `text-2xs text-gray-500`.
- **Typography & Font Discipline Rule (Strict Limit)**: Never have more than 3 types of font sizes on any given screen or component layout (standardize strictly on: (1) Heading/Stat: `text-lg` or `text-base`, (2) Standard Body/Action: `text-xs`, (3) Micro/Tag/Badge: `text-2xs`). Never use more than 2 font families across the platform (Universal primary UI font: `Inter, sans-serif`; optional monospace/code font strictly for technical IDs or code snippets only).
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
- **All Badges Must Be Flowbite Default Badges Rule (Strict Standard)**: All badges, status chips, count tags, and indicator labels across the entire platform must strictly adhere to Flowbite's official Default Badge specifications ([https://github.com/themesberg/flowbite/blob/main/content/components/badge.md](https://github.com/themesberg/flowbite/blob/main/content/components/badge.md)).
  - **No Borders (Default Badges Have NO Borders)**: Flowbite Default Badges do **NOT** have borders. Never add `border` or `border-*` classes to default badges. They rely strictly on Flowbite's soft background fill and strong text color pairings (`bg-*-100 text-*-800 dark:bg-*-900 dark:text-*-300`).
  - **Standard Rounded Corners (NEVER `rounded-full`)**: Never use `rounded-full` (capsule/pill badges); Flowbite explicitly classifies `rounded-full` as a separate non-default pill variant (`## Pill badges`). All badges must strictly use Flowbite's default badge geometry with standard `rounded` (or `rounded-md`, 4px) corners, `text-xs font-medium` (or `text-2xs font-semibold`), and standard padding (`px-2.5 py-0.5 rounded` or `px-2 py-0.5 rounded`).
- **Non-Interactive Badges & Button Exclusivity Rule**: Badges (`<Badge>`) and status/count chips are strictly passive, non-interactive visual indicators. Anything that performs an action, triggers navigation, jumps dates (e.g. 'Today'), or opens dialogs must NEVER be rendered as a badge or in badge-like chip styles (`bg-blue-50 text-blue-600 rounded-md`). Interactive actions must strictly use formal Flowbite `<Button>` components (`variant="primary"`, `variant="secondary"`, `variant="outline"`, or `variant="ghost"`) so users have unambiguous visual button affordances.
- **Strict No Capsule / No Pill Buttons Rule (Flowbite Button Style)**: Action buttons must **never** be capsule or pill-shaped (`rounded-full`, `rounded-3xl`, or small custom heights where border radius curves ends into full hemispheres). Every action button across the platform must strictly use the standard Flowbite `<Button>` component (`src/components/Button.tsx`) with default `rounded-lg` geometry and standard heights (`h-8` for `size="sm"`, `h-10` for `size="md"`). Capsule (`rounded-full`) geometry is strictly reserved for circular avatar indicators or round icon chips. All badges, status chips, and count indicators must strictly use Flowbite's default badge style (`rounded` / `rounded-md`, never `rounded-full` pills) per the Badges Specification.
- **OTA Badges & Branding Rule**: Everywhere OTA sources and channel names are displayed across the site (e.g. Airbnb, Booking.com, Agoda, Expedia, Vrbo), they must strictly be rendered in a badge with a clean white background in light mode and gray-800 in dark mode (`bg-white text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700`), preceded by the official OTA platform brand logo before the name (e.g. `<OtaBadge>` / `<AirbnbIcon>` / `<BookingComIcon>`). Never render OTA badges with yellow/amber or colored backgrounds, and never display OTA names as plain unbranded text.
- **Universal Booking Card Consistency Rule**: All booking cards across the entire platform (Today, Upcoming, and Past tabs on both mobile stacks and desktop grids) must strictly look identical and use the unified `<BookingCard>` component (`src/components/BookingCard.tsx`). The card layout enforces:
  - **Header Row**: Guest name, `#ID`, optional room/cottage badge (`showRoomBadge={true}` for multi-room lists), guest count, contact action icons (WhatsApp/Call), and status badge stack on the right (`Checked In Today`, `Check-in Pending`, `ID Pending`, `C-Form`, etc.).
  - **Dates & Right-Aligned OTA Badge Container**: Stay dates on the left (`<Calendar /> Checkin → Checkout` + nights count below), with the official `<OtaBadge>` cleanly aligned on the **right side** of the dates container (`billing-checkout__guest-card-dates`). OTA badges must never be placed in the header row where they crowd the guest name.
  - **Financial Breakdown**: Room charges (omitted on OTA bookings when room charges equal total paid), food & incidentals (if > 0), paid amount (strictly labeled `Advance Paid:` for offline/direct bookings, and `Total Paid:` for OTA bookings), and amount due / refund due (highlighted only when balance exists).
  - **Action Buttons**: Standard Flowbite `<Button>` components (`variant="secondary"` View / View Booking + `<Button variant="warning">` Checkout when eligible).
  - **Guest Notes**: Sanitized OTA notes alert chip at the bottom.
  - **Search Empty State**: When any search/filter query is active, empty states across all tabs must strictly display `"No bookings found matching your criteria."` (`t('no_bookings_matching_criteria')`), never a misleading tab-specific "No bookings today."
- **No Hindi Localization Rule**: No need to work on or update the Hindi version (`src/i18n/hi.ts`) unless explicitly asked for by the user. Focus exclusively on the default English implementation (`src/i18n/en.ts`) and direct English UI text.
- **Archived/Redundant Features Rule**: Skip `_unwanted/` entirely during any site-wide sweep (design consistency, safe-area audits, refactors) — it holds features intentionally taken off the live site but kept on disk for possible future use (currently: `ai/`, `ical/`), each with its own `README.md` explaining what's archived vs. what's still live elsewhere. Check `CLAUDE.md`'s "Feature Modules" index and each archive's `README.md` before assuming a related-looking live file is fair game too — some backend files near an archived feature are still genuinely load-bearing for other things (see `_unwanted/ical/README.md` for a concrete example).
- **GroundCode Brand Manifesto Rule (Strict Compliance)**: Always strictly follow `GROUNDCODE_BRAND_MANIFESTO.md` and `.agents/rules/groundcode_brand_manifesto.md` across all marketing, landing pages, competitive comparisons, UI text, and customer communication:
  - **No line longer than 10 words**: Every bullet point, paragraph line, and value statement must be strictly <= 10 words. Punchy, short, and scannable.
  - **Maximum visuals, images, and icons — least words**: Favor diagrams, icon tiles, and interactive elements over heavy paragraphs.
  - **Friendly Homestay Host Tone**: Write like talking to a friendly homestay host, never like an academic whitepaper or corporate slide deck.
  - **No corporate jargon or lectures**: Never lecture about "money leakage" or "pennywise profit". Small business owners care most about operations ease.
  - **Never show fake URLs**: No `domain.com/path` or placeholder URLs in screenshots or cards.
  - **Never mention tablets**: Clients must feel their mobile phone is completely sufficient.
  - **Telegram strictly for staff operations**: Cleaners, caretakers, guards, cooks use Telegram with zero apps to install.
  - **WhatsApp strictly for guests**: Direct booking vouchers, checkout bills, and instant quotes only.
  - **Product Scope Honesty**: GroundCode actually has nearly everything a complete hotel PMS should have, ready for wide testing, but we deliberately start with smaller properties first for stability.

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
