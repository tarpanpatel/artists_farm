# ðŸ—ºï¸ Ground Code â€” Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Ground Code** SaaS Resort Management System. Completed items are removed once shipped â€” see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

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

### Security & Architecture Follow-ups

- **Input Validator Expansion**: Core operational modules (Guests, Petty Cash, Staff, Licenses, Receipts, Walk-in Tabs, Inventory, Rates) are 100% wired and verified. Minor admin/theme settings can be extended as needed.
---

*Last Updated: 2026-09-03*


