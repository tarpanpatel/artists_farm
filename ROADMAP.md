# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Enhancements & Platform Optimization

- [ ] **GST Billing Support**
  - **Problem:** No way to generate a GST-compliant bill for guests who need one (common for business travelers billing their company). No GSTIN field exists anywhere in the backend yet.
  - **Action:** Add a GSTIN field on `properties` (the property's own registration number, needed on any GST invoice regardless of guest) and an optional per-guest/per-receipt GSTIN + billing name (for guests who want the invoice addressed to their company, not themselves personally) - likely on `guests` or captured at checkout time on the receipt record. Frontend: an optional "GST Bill" toggle in the checkout/receipt flow that, when the guest provides a GSTIN, generates a proper tax invoice (property GSTIN, guest/company GSTIN, tax breakdown - CGST/SGST or IGST depending on same-state vs. inter-state) instead of the regular receipt. Needs the correct GST rate(s) for this business category - not hardcoded, should come from a config value so it can be updated if rates change.

### Staff Task & Service Request System (Telegram-Integrated)

**Design decisions locked in (2026-08-03):**
- Exactly 3 Telegram groups per tenant, no more: **Kitchen, Admin, Finance** — matches the 3 chat-ID columns already on `properties` (`telegram_kitchen_chat_id`/`telegram_admin_chat_id`/`telegram_finance_chat_id`). No new department table needed. Ready-for-pickup nudges and service requests (housekeeping etc.) route to **Admin**; kitchen order nudges route to **Kitchen**.
- Any logged-in staff member can create a service request — no role restriction.
- Every reminder/nudge message is always specific (references the exact order/item/room/request) — never a generic "you have pending tasks" message.
- Webhook vs. polling: build both, environment-conditional (see below) — testing locally now, but must also work once deployed to the real domain, same pattern as the existing `database.php` localhost-vs-production detection.

- [ ] **Generalized Guest Service Requests (Housekeeping, Maintenance, etc.)**
  - **Problem:** No way to log/track ad-hoc guest requests not tied to a kitchen order — e.g. guest in Room 101 calls for fresh towels. Currently manager has no system-tracked way to relay this to housekeeping or confirm it was completed.
  - **Action:** New `service_requests` table (property_id, room_id, request_type, description, requested_by, status, created_at, last_reminder_at, fulfilled_at, fulfilled_by, telegram_message_id) + UI (any staff) to create a request (room + quick-pick or free-text description) → sends Telegram message to the **Admin** chat with an inline "Mark Fulfilled" button → staff taps it, status updates to Fulfilled, message edits to show who/when. Uses the same shared nudge engine for follow-up reminders if left unfulfilled. Not started.

- [ ] **Webhook (production) / Polling (local) Receive Path — Environment-Conditional**
  - **Action:** Mirror the existing `database.php` dev-vs-production detection pattern. On `localhost`/`127.0.0.1`/XAMPP, poll Telegram's `getUpdates` (triggered on page load or a short interval — no public HTTPS endpoint needed, works everywhere). On the real domain, register a proper webhook (instant, no polling delay). Both paths feed the same internal "new Telegram message/button-tap received" handler so the rest of the system (pairing codes, Mark Fulfilled callbacks) doesn't need to know which mode is active.
  - **Partial:** the Setup Wizard's pairing-code detection implements an on-demand `getUpdates` poll (`pollAndMatchPairingCodes` in `php/telegram/pairing.php`), but that's scoped to pairing only, not the general environment-conditional dispatcher described here. A real production webhook path (`telegram_webhook.php`) already existed pre-session for button callbacks; the local/production auto-switch for it is still not built.

---
*Last Updated: August 2026*
