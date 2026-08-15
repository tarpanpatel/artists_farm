# Workspace Agent Rules & Recommended Personas

- Do not open files in editor tabs when viewing or making code edits unless explicitly requested by the user.

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
