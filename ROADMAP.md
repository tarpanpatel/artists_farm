# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### 💳 SaaS Pricing Model & Rate Card Alignment (Monthly-Only Payments Policy)

- **Context & Decision**: Product decision confirmed that Ground Code operates strictly on **monthly billing/payments** — annual prepayment plans and annual discount structures are not offered.
- **Action Items to Cross-Check & Update**:
  - [ ] **Cross-Check Rate Card Figures**: Audit base monthly tariff (currently ₹1,499/mo) and per-key/per-room fee (currently ₹50/mo per extra room above base occupancy) against revised operational costs and current homestay/resort customer acquisition goals.

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

### 🚀 Ground Code Pre-Launch Roadmap: Onboarding vs. Operational Finalisation

Clean division between **Part 1: Onboarding, Adding/Importing Properties & User Flow** (the primary product priority, given that 99.99% of prospective hosts already run on OTAs) and **Part 2: The Rest (Operational Refinements & Launch Finalisation)**.

---

### PART 1: 🏨 Onboarding, Adding/Importing Properties & User Flow

#### 1.2 Adding / Importing Properties: Automated Direct Provisioning
- **Current Code State**:
  - `PropertyCreationWizard.tsx` and `PropertySetupWizard.tsx` require 5 linear steps (Basics, Contact/Tax, Payments/UPI, Operations, Notes).
  - Adding a multi-key property requires manually creating the parent property, navigating to `MultiKeyPropertyOverview.tsx` to manually click "Add Room" for every single room, navigating to `ChannelConnectionsPage.tsx` to map each room, and finally opening `AirbnbConfigImportDrawer.tsx`.
  - `php/api/router.php:1280-1660` (`proposeAirbnbRoomConfig`) pulls capacity, check-in/out, prices, house rules, instructions, wifi, amenities, and bed layouts, but **does not import listing photos into the gallery**.
- **Friction & Flaws**:
  - **No Listing Photos**: Airbnb listing photos are left behind, leaving the direct booking engine (`/{slug}/#book`) blank without manual photo uploads.
- **What Could Be Done Better (The Architectural Solution)**:
  - [ ] **Listing Photos Auto-Import**:
    - Ingest listing image URLs from the Airbnb payload, save them to `php/uploads/images/{tenantSlug}/{propertySlug}/`, and populate the property image gallery.

#### 1.3 User Flow & Time-to-Value (First 5 Minutes Experience)
- **Current Code State**:
  - A user who finishes registration lands on `#dashboard`. If they haven't completed the multi-layer channel setup, the calendar is empty with no bookings, giving no immediate sense of accomplishment or live utility.
- **What Could Be Done Better (The Architectural Solution)**:
  - [ ] **Immediate Calendar Hydration (Day-1 Bookings Backfill)**:
    - Upon channel connection, trigger an immediate sync of current and upcoming reservations via Channex feed so the front-desk calendar ([TodayOverview.tsx](file:///c:/xampp/htdocs/artists_farm/src/components/TodayOverview.tsx)) displays real in-house guests and future check-ins immediately.
  - [ ] **Instant Staff Telegram Onboarding**:
    - As soon as the owner imports their property, surface a friendly 1-tap modal:
      *"Connect Your Staff on Telegram — No apps to install"*.
    - Caretakers and cooks scan the QR code, tap `/start`, and are instantly wired for check-in alerts and KOT food orders.

---

### PART 2: ⚙️ The Rest — Day-to-Day Operations & Launch Finalisation

*(Audit Note: Features verified already live in code — such as Header Property Switcher, Mobile Bottom Nav direct Kitchen tab & FAB, dynamic UPI QR blocks, recipe stock depletion, and WhatsApp voucher templates — are preserved as-is and excluded from this TODO list).*

#### 2.1 Food Ordering & KDS Polish
- [ ] **Mobile Take Order "Quick Favorites" Row**:
  - Add a persistent top bar of top 10 homestay staples (Masala Chai, Coffee, Toast, Maggi, Poha, Aloo Paratha, Thali, Mineral Water) in `KitchenManagement.tsx` for 1-tap addition while staff are taking orders poolside/table-side.
- [ ] **One-Tap Dietary & Preparation Tag Chips**:
  - Add instant chips (`[Jain]`, `[Less Spicy]`, `[Extra Spicy]`, `[No Sugar]`, `[Room Delivery]`) appended to item notes with a single tap, eliminating typing on mobile keyboards.

#### 2.2 Inventory & Petty Cash Bridge (Homestay Operational Reality)
- [ ] **Unified "Record Market Purchase" Modal (Stock In + Cash Out in 1 Flow)**:
  - Caretakers buying milk, eggs, bread, or vegetables from local markets currently have to record cash out in Petty Cash and stock count in Inventory separately.
  - Create a single unified drawer: Caretaker enters item ("Milk 10L"), total cost (₹600), and uploads receipt photo.
  - System simultaneously increments inventory stock count AND logs a debit entry in the Petty Cash ledger in one motion.

#### 2.4 Pre-Flight Launch Verification Checklist
- [ ] **Interactive Pre-Flight Health Dashboard (`#preflight`)**:
  - Self-diagnostics screen that verifies all property connections before the host goes live:
    - ✅ Property details & location coordinates valid.
    - ✅ All rooms mapped with active rate plans.
    - ✅ UPI ID & QR payment block verified.
    - ✅ Telegram staff bot connected & responding.
    - ✅ WhatsApp Business API credentials verified.
    - ✅ Channex OTA connection active and in sync.
- [ ] **Automated Nightly Cloud Database Backups**:
  - Nightly background cron creating an encrypted SQL dump stored in off-site archive / Admin Telegram channel at 03:00 AM.

### 🛡️ Codebase Audit & System Hardening Roadmap (Sep 2026)

Comprehensive architectural, security, database, and frontend audit conducted September 2026 across all 91 MySQL tables, PHP backend APIs, and React/Flowbite components.

#### Phase 1: P0 Security & Data Protection
- [ ] **Purge Plaintext Credentials from Document Root** — STILL OPEN, re-verified 8 Sep 2026 rather than assumed: `id_rsa` and `sftp-config.json` are **still present on disk in the document root**. They are gitignored (`.gitignore:53`, plus the blanket `*.json` on line 10) and blocked from the web by `.htaccess` (line 9 denies `sql|env|key|pem|log|sh|lock|local`, line 19 denies `id_rsa|sftp-config.json|logs.json` by name), so this is no longer a remote-download risk — but a plaintext private key still sits inside the web root, and anything that bypasses `.htaccess` (a server misconfig, a second vhost, a backup archive) exposes it. Remaining work unchanged: move them out of the docroot and rotate.

#### Phase 2: P1 Reliability, RBAC & API Error Handling
- [ ] **Asynchronous Webhook & Alert Dispatch**:
  - Decouple synchronous Meta WhatsApp call in `php/guests/guests.php:877-881` and Telegram call in `php/kitchen/orders.php:250` so slow external APIs do not block user HTTP requests.

#### Phase 3: Database & Indexing Optimization
- [ ] **Atomic Claim Locks in Telegram Outbox (`php/telegram/sender.php`)**:
  - Introduce `FOR UPDATE` or atomic status update to `sending` in `drainTelegramOutbox` to prevent duplicate message dispatch across concurrent workers.

#### Phase 4: Frontend UI/UX & Flowbite Polish
- [ ] **Eliminate Residual Native `title="..."` Attributes** — PARTIALLY done (`19d14e3a` / `d5eb961f` swept several files); do not close it yet. Recounted 8 Sep 2026 across the ten originally-named files: `AIChatWidget.tsx`, `OperationalDashboard.tsx`, `PlatformPropertyManagement.tsx` and `TodayOverview.tsx` are now clean, but **13 instances remain** — `InventoryManagement.tsx` (5), `ServiceRequestsManagement.tsx` (4), `CashDrawerManager.tsx` (1), `ChannelManager.tsx` (1), `MiscChargesManagement.tsx` (1), `PageHeader.tsx` (1). The count went UP against the original "11 instances", so re-count before trusting either number.
- [ ] **Add Border Tokens to Unbordered Badges (7 instances)**:
  - Add explicit borders (e.g. `border border-amber-200 dark:border-amber-800`, `border border-gray-200 dark:border-gray-600`) to badge chips in `AnalyticsDashboard.tsx`, `AuditLogsView.tsx`, `KitchenManagement.tsx`, `PettyCashManagement.tsx`, `TelegramConnectionStatus.tsx`, and `TelegramNotificationModal.tsx`.

---

*Last Updated: 2026-09-08*

