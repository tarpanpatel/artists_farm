# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### 💳 SaaS Pricing Model & Rate Card Alignment (Monthly-Only Payments Policy)

- **Context & Decision**: Product decision confirmed that Ground Code operates strictly on **monthly billing/payments** — annual prepayment plans and annual discount structures are not offered.
- **Problem & Current Mismatch**:
  - The Root Admin Onboarding & Rate Card interface (`src/components/OnboardingManager.tsx` -> Tab 3: *Pricing & Per-Key Billing*) currently displays an **"Annual Discount (%)"** configuration input (set to 20%) alongside a **"Live Client Billing Simulator"** featuring a *"25-Room Resort (Annual with 20% Off)"* calculation (`calc25RoomsAnnual`).
  - `src/components/SubscriptionPanel.tsx` and `php/api/configuration.php` still compute `annual_discount_pct` and `annualTotal` estimates.
- **Action Items to Cross-Check & Update**:
  - [ ] **Cross-Check Rate Card Figures**: Audit base monthly tariff (currently ₹1,499/mo) and per-key/per-room fee (currently ₹50/mo per extra room above base occupancy) against revised operational costs and current homestay/resort customer acquisition goals.
  - [ ] **Retire Annual Billing Settings from Root Admin UI**:
    - Remove the "Annual Discount (%)" field from `OnboardingManager.tsx` (Tab 3).
    - Update the Live Client Billing Simulator to showcase monthly breakdowns exclusively (e.g. 5-Room Homestay vs. 15-Room Boutique Resort vs. 25-Room Resort, all strictly monthly).
  - [ ] **Align Tenant Subscription Panel**:
    - Strip annual equivalent estimates from `SubscriptionPanel.tsx` (`annualEstimate`, `annualTotal`, `billing_cycle === 'annual'`).
    - Standardize renewal displays strictly around the monthly billing cycle.
  - [ ] **Backend Configuration Cleanup (`php/api/configuration.php`)**:
    - Deprecate `annual_discount_pct` in default onboarding configuration envelopes and ensure rate cards strictly emit monthly per-key structures.

### 🔄 Root Dashboard Onboarding vs. Frontend Client Flows Alignment

- **Context & Goal**: Audit and reconcile all onboarding configuration, copy, trial cadences, and feature highlights managed in Root Dashboard (`src/components/OnboardingManager.tsx` -> `#onboarding`) with what actual tenant users experience in the frontend (`SelfOnboardingWizard.tsx`, `PropertySetupWizard.tsx`, `DemoOnboardingTour.tsx`, and `SubscriptionPanel.tsx`).
- **Problem & Identified Gaps**:
  - **Outdated Integration References**: Root Dashboard onboarding templates still instruct new hosts to *"connect Airbnb and Booking.com iCal feeds in Settings → Calendar Sync"*, whereas iCal has been decommissioned/archived in favor of Channex OTA Channel Manager.
  - **Cadence & Feature List Discrepancies**: Email/WhatsApp/Telegram cadence messages in Root Dashboard reference setup steps and terminology that need to strictly match the actual frontend wizard sequence (e.g. multi-room setup, Telegram staff alerts, staff roles, menu/kitchen setup).
  - **Brand Manifesto Compliance**: Ensure all onboarding messaging, tip sequences, and trial emails adhere to the Ground Code Brand Manifesto:
    - Punchy lines (<= 10 words per line).
    - Friendly homestay host tone (no corporate jargon).
    - Telegram strictly for staff operations; WhatsApp strictly for guests.
    - No fake placeholder URLs (`domain.com/path`).
- **Action Items to Audit & Tally**:
  - [x] **Tally Setup Checklist**: Map each onboarding email/cadence step (Day 1, Day 3, Day 7, Day 14, Day 21, Day 28, Day 30) against actual live screens and routes in the frontend app.
  - [x] **Replace Legacy Mentions**: Sweep `OnboardingManager.tsx` templates to remove all mentions of iCal / Calendar Sync feeds, replacing them with Channex Channel Manager and direct booking links.
  - [x] **Sync Default Modules & Rate Cards**: Verify that initial modules provisioned during onboarding (`property_modules`) and default expenses/bills match the rate cards and defaults shown in Root Admin.
  - [x] **Verify Dynamic Template Tags**: Ensure all dynamic placeholders in Root Dashboard (`{tenant_name}`, `{property_name}`, `{login_url}`, `{expires_at}`, `{support_phone}`) correctly populate with real data across all communication channels.

### 💬 Custom WhatsApp-Powered SaaS Customer Support Desk (Planned - Sep 2026)

- **Goal**: Build a 100% proprietary, zero-subscription customer support desk inside Ground Code powered directly by Meta's WhatsApp Cloud API (`php/whatsapp/sender.php`).
- **Host / Staff Experience**:
  - Front-desk and property owners message Ground Code on WhatsApp or via the in-app Help Drawer.
  - Automatically captures system diagnostics: property slug, active screen (e.g. `#bookings`, `#kitchen_kds`), user role, and browser info.
- **Inbound Webhook (`php/whatsapp/webhook.php`)**:
  - Meta Webhook endpoint verifying `hub.verify_token` and `hub.challenge`.
  - Inbound listener reverse-matches sender phone numbers against `tenants.phone` or `staff.phone` to attribute messages to the exact property (`Artists Farm Jaipur`).
  - Automatically creates/threads tickets in MySQL (`support_tickets` & `support_ticket_messages`).
  - Dispatches immediate Telegram alert to Root Admin bot:
    *"💬 Support Ticket #GC-1001 from Jaipur: 'Printer not printing KOT' [Reply in Dashboard]"*.
- **Root Admin Support Desk UI (`src/components/SupportDesk.tsx` in `RootAdminDashboard.tsx`)**:
  - Dedicated "Support Desk" tab with live unread badge count.
  - Split-view inbox: searchable conversation list with status filters (`Open`, `In Progress`, `Resolved`, `Closed`).
  - Two-way chat thread with client/admin bubbles and one-click `[Jump to Property]` diagnostic button.
  - Outbound reply box executing `sendWhatsAppDirectTextMessage()` to deliver replies straight to the host's WhatsApp in real time.
- **Database Schema (`php/schema/support_tickets.sql`)**:
  - `support_tickets` (`id`, `ticket_number`, `tenant_id`, `property_id`, `contact_phone`, `contact_name`, `status`, `priority`, `category`, `last_message_at`, `unread_admin_count`).
  - `support_ticket_messages` (`id`, `ticket_id`, `sender_type`, `sender_name`, `sender_phone`, `body`, `whatsapp_message_id`, `delivery_status`, `created_at`).

### 📊 Indian Hospitality Strategic Workflows (Planned - Sep 2026)

#### 1. ⚡ Offline-Resilient Room Status & Arrival Cache (Remote Internet Drops)
- **Goal**: Allow remote resort and farmstay front-desk staff (Jim Corbett, Coorg, Udaipur, Lonavala) to continue front-desk operations (view room allocations, lookup guest contact numbers, review arrival manifests, and queue check-ins) even during 2-to-4 hour broadband/fiber drops.
- **Location**: `sw.js` + `src/services/offlineCache.ts` + `OperationalDashboard.tsx`.
- **Core Deliverables**:
  - **IndexedDB Local Storage (`groundcode_offline_pms`)**:
    - Maintains a local mirror of `today_stay_manifest`:
      - Current in-house guests and room assignments.
      - Today's upcoming arrivals with contact phone numbers and balance due.
      - Room inventory availability map for today + tomorrow.
    - Automatically refreshed in background on every successful fetch of this property's own operational data (`get_all_tenants` is a Root-Admin-only platform action, corrected 3 Sep 2026 - the property app never calls it).
  - **Proactive Offline Visual Affordance**:
    - When `navigator.onLine === false` or API fetches fail:
    - Display a persistent amber indicator badge at the top:
      *"⚡ Offline Mode: Operating from local snapshot (Last updated: today at 14:30). Arrivals & room allocations are accessible."*
    - Switches timeline/grid to read-only cached view, preventing blank screen lockouts.
  - **Offline Check-In Outbox Queue**:
    - If staff clicks "Mark Checked In" during an outage, store action in IndexedDB store `offline_action_outbox` (`id`, `action`, `guest_id`, `timestamp`).
    - When network connectivity restores (`window.addEventListener('online')`), automatically drain outbox queue to `php/api/router.php?action=checkin_guest` and toast *"Synced 2 offline check-ins to server"*.

#### 3. 📱 Pre-Arrival Guest Self Check-In Link (WhatsApp Digital Registration Card)
- **Goal**: Eliminate the 25-minute check-in bottleneck at the resort gate when large families or villa groups arrive with 10+ people by allowing guests to register and upload IDs prior to arrival.
- **Location**: Public route `/register/:token` (or `public/guest_checkin.php`) + `php/guests/self_registration.php` + `BookingDetailsModal.tsx`.
- **Core Deliverables**:
  - **Cryptographic Tokenized Booking Link**:
    - Add `registration_token` (random 32-char hex / UUIDv4) to `guests` table.
    - Public mobile-responsive URL: `https://ground-code.com/register/<token>` (no login required, secured by token).
  - **1-Click WhatsApp Invitation**:
    - Button inside `BookingDetailsModal.tsx` and `OperationalDashboard.tsx`: `[Share Self Check-in Link via WhatsApp]`.
    - Triggers WhatsApp template via `sendWhatsAppDirectTextMessage()`:
      *"Namaste {{1}}, welcome to {{2}}! To ensure an instant check-in upon arrival, please tap here to register your group and upload your IDs: https://ground-code.com/register/{{3}}"*
  - **Touch-First Mobile Registration Card (Guest View)**:
    - Displays property banner, booking stay dates, and villa/room name.
    - Form fields: Primary guest address, nationality, purpose of visit, vehicle number (for resort parking).
    - Camera upload: Direct snapshot or file upload of Aadhaar / Driving License / Passport.
    - If Foreign Guest: Captures Passport Number, Visa Number, Expiry, Place of Issue, Date of Arrival in India (automatically pre-populates Form-C FRRO compliance!).
    - Digital signature: Touch-friendly signature canvas pad.
  - **Instant PMS Update & Telegram Alert**:
    - On submission, stores files following the existing convention (`php/uploads/images/{tenantSlug}/{propertySlug}/id_documents/`, corrected 3 Sep 2026 - not a separate `guest_ids/` path), automatically sets `idVerificationStatus = 'Complete'`, and updates Form-C metadata.
    - Sends Telegram notification to property staff bot:
      *"✅ Self Check-In Done: {{guest_name}} for {{room_name}} has uploaded ID and signed registration card."*


### Pre-Launch: Dedicated Test Sandbox Property + Telegram Groups

**Deferred on purpose - user wants this done just before the site actually launches, not now.**

Found 29 Aug 2026: a scripted photo-relay verification test (see the "Telegram photo relay"
entry below) created a fake guest ("Claude Photo Relay Test Guest") and its placeholder ID
photo landed in the real "Admin Farm Group" Telegram channel for the Jaipur property. Root
cause isn't a code bug - `complete_checkin_verification` correctly relays whatever real file
was actually uploaded (`php/guests/guests.php` ~line 1261). The gap is that staging currently
doubles as the de facto live system for these early properties (real staff/owners are plausibly
the actual members of these Telegram groups pre-launch), and nothing in the app currently
distinguishes "a property real people are watching" from "a property safe to throw test data
at." Staging's DB is already properly isolated from production (fixed 24 Aug 2026 migration -
that part is fine); this is specifically about Telegram groups (and, more generally, any
property real users are actively watching) receiving test noise.

**Planned fix, to do just before launch**: create one dedicated test/sandbox property with its
own throwaway Telegram groups (Admin/Finance/Kitchen as applicable) that no real staff/owner is
ever added to, and make that the only target for any future scripted or manual verification
test - never an existing real-named property (Jaipur, Sea View Villa, etc.), even on staging.
User has confirmed they'll create the new Telegram group(s) themselves. No code change
required for this alone (it's a data/config setup task - a property row + its
`property_modules.config` Telegram routing), unless a stronger technical guardrail (e.g.
tagging real properties as "protected" and refusing to run test-triggering actions against
them in code) is wanted later - that was discussed as a further-out, bigger option, not part of
this planned fix.

### 🛡️ Codebase Audit & System Hardening Roadmap (Sep 2026)

Comprehensive architectural, security, database, and frontend audit conducted September 2026 across all 91 MySQL tables, PHP backend APIs, and React/Flowbite components.

#### Phase 1: P0 Security & Data Protection
- [ ] **Block Web Access to Sensitive Files (`.htaccess`)**:
  - Add deny rules for `.json`, `.sql`, `.log`, `.env`, `.key`, `.pem`, and `id_rsa`. Block direct web downloads of `sftp-config.json`, `id_rsa`, and `php/errors/logs.json`.
- [ ] **Purge Plaintext Credentials from Document Root**:
  - Remove `sftp-config.json` and `id_rsa` from root, rotate compromised credentials, and migrate secrets to protected storage / environment variables.
- [ ] **Delete / Secure Unauthenticated Debug & Reset Scripts**:
  - `php/admin/reset_staging_jaipur.php` (unauthenticated remote table wipe).
  - `php/api/debug_guests.php` & `php/api/diagnostic.php` (unauthenticated sensitive guest data exposure).
  - `php/api/test_nav_menu.php` (hardcodes platform_admin session).

#### Phase 2: P1 Reliability, RBAC & API Error Handling
- [ ] **Enforce Staff Management RBAC (`php/staff/staff.php:200-337`)**:
  - Add caller role validation in `handleStaffRequests` so low-privilege `Staff` cannot escalate their own role to `Admin`, grant `accessAllProperties`, or alter salaries.
- [ ] **Fix Kitchen Order Transactions & Silent Failure Swallowing (`php/kitchen/orders.php:203-254`)**:
  - Wrap `create_order` in `$pdo->beginTransaction() ... commit()`.
  - Remove fake KOT ID generation on `catch (PDOException $e)` that falsely reports success on DB write failures.
- [ ] **Fix Cross-Tenant IDOR on Kitchen Items (`php/kitchen/orders.php:415-419`)**:
  - Scope `update_order_item_status` query via join with `orders` to ensure `o.property_id = ?`.
- [ ] **Asynchronous Webhook & Alert Dispatch**:
  - Decouple synchronous Meta WhatsApp call in `php/guests/guests.php:877-881` and Telegram call in `php/kitchen/orders.php:250` so slow external APIs do not block user HTTP requests.
- [ ] **Validate Telegram Webhook Secret Token (`php/telegram/telegram_webhook.php`)**:
  - Verify `X-Telegram-Bot-Api-Secret-Token` on inbound bot webhooks.

#### Phase 3: Database & Indexing Optimization
- [ ] **Execute Performance Indexing Migration**:
  - `ALTER TABLE guests ADD INDEX idx_guests_room_lookup (property_id, room_id, status, checkin_date, expected_checkout);`
  - `ALTER TABLE property_modules ADD INDEX idx_module_slug_enabled (module_slug, is_enabled);`
  - `ALTER TABLE service_requests ADD INDEX idx_svc_req_prop_status_created (property_id, status, created_at);`
  - `ALTER TABLE service_requests ADD INDEX idx_svc_req_room (property_id, room_id);`
  - `ALTER TABLE billing_receipts ADD INDEX idx_receipts_prop_created (property_id, created_at);`
  - `ALTER TABLE financial_ledger ADD INDEX idx_ledger_prop_occurred (property_id, occurred_at);`
  - `ALTER TABLE financial_ledger ADD INDEX idx_ledger_source (property_id, source_type, source_id);`
- [ ] **Fix SARGability Anti-Pattern in Financial Ledger (`php/finance/petty_cash.php:963`)**:
  - Replace `DATE_FORMAT(occurred_at, '%Y-%m') = ?` with date range boundaries (`occurred_at BETWEEN ? AND ?`) to leverage index.
- [ ] **Atomic Claim Locks in Telegram Outbox (`php/telegram/sender.php`)**:
  - Introduce `FOR UPDATE` or atomic status update to `sending` in `drainTelegramOutbox` to prevent duplicate message dispatch across concurrent workers.

#### Phase 4: Frontend UI/UX & Flowbite Polish
- [ ] **Eliminate Residual Native `title="..."` Attributes (11 instances)**:
  - Replace with Flowbite `<Popover>` in `AIChatWidget.tsx`, `CashDrawerManager.tsx`, `ChannelManager.tsx`, `InventoryManagement.tsx`, `MiscChargesManagement.tsx`, `OperationalDashboard.tsx`, `PageHeader.tsx`, `PlatformPropertyManagement.tsx`, `ServiceRequestsManagement.tsx`, and `TodayOverview.tsx`.
- [ ] **Add Border Tokens to Unbordered Badges (7 instances)**:
  - Add explicit borders (e.g. `border border-amber-200 dark:border-amber-800`, `border border-gray-200 dark:border-gray-600`) to badge chips in `AnalyticsDashboard.tsx`, `AuditLogsView.tsx`, `KitchenManagement.tsx`, `PettyCashManagement.tsx`, `TelegramConnectionStatus.tsx`, and `TelegramNotificationModal.tsx`.

---

*Last Updated: 2026-09-07*



