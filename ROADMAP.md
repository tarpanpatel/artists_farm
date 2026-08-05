# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### iCal Feed URL broken on Vite dev server (wrong base path)
The "Copy Feed URL" / per-room export URL on the iCal Sync Manager page hardcodes `${window.location.origin}/artists_farm/php/api/ical_export.php?...` (`ICalSyncManager.tsx:97` and `:631`), instead of using the already-exported `API_ROOT_BASE` from `services/api.ts` that every other API call in the app goes through. `API_ROOT_BASE` resolves dynamically per environment - empty string on the Vite dev server (ports 3000/5173/5174/8080), since the dev proxy only intercepts requests starting with `/php/...`; `/artists_farm` on production. The iCal export URL always hardcodes the `/artists_farm/` prefix regardless of environment, so in dev it never matches the proxy's `/php` rule and Vite's SPA fallback serves the React app itself instead of forwarding to the PHP script. Confirmed live: visiting `http://localhost:3000/artists_farm/php/api/ical_export.php?property=jaipur` (a copied Feed URL) renders the full dashboard UI, not calendar (.ics) data. Works correctly in production today (Apache/`.htaccess` happens to resolve `/artists_farm/php/...` fine there), so real OTA syncing isn't broken yet - but it makes the Feed URL untestable during local dev, and the duplicated/hardcoded base-path logic is exactly the kind of divergence that could silently break production too if the `.htaccess` rewrite rules ever change. Fix: swap both hardcoded URLs to use `API_ROOT_BASE`, matching every other endpoint in the app.

### WhatsApp Business API Integration - booking confirmation LIVE, 2 templates left
Guest-facing notifications via WhatsApp, via the WhatsApp Business Platform (Meta Graph API). Alongside, not replacing, the existing Telegram integration (which is staff/admin-facing, not guest-facing).

Registered sender:
- Display name: Artists Farm
- Number: +91 99831 96863
- Phone Number ID: 1232057176655692

Status:
- `php/whatsapp/sender.php` built (mirrors `php/telegram/sender.php`'s shape) - `sendWhatsAppTemplateMessage()`, phone number normalization to E.164, permanent token read from `WHATSAPP_ACCESS_TOKEN` env var or untracked `php/config/whatsapp_token.php` (same pattern as `DB_PASSWORD`).
- **Booking confirmation: done and confirmed live.** `new_booking_cofirmation` template approved by Meta and wired into `add_guest` - real message sent and accepted (HTTP 200, `message_status: accepted`) on the first live retest after approval.
- Remaining: `food_order_update` and `checkout_bill` templates (specs already drafted) - need creating in WhatsApp Manager (Utility category, same process as the first one) and wiring into the kitchen order-status-change and checkout flows respectively.

### Data Export Center: whole-year and custom date-range exports
The Data Export & Backup Center (Accommodations Booking Spreadsheet, Property Maintenance & Utilities Logs, Payroll & Salaries Registry, Master Transaction Ledger) currently only exports one calendar month at a time (Target Statement Month + Year pickers). Add two more export scopes: a full calendar year in one export, and an arbitrary custom date range (start date -> end date) for ad-hoc reporting periods that don't align to a month or year boundary.

### Plain-Language UI Text + Centralized Strings File
UI copy is currently hardcoded inline across ~52 component files (e.g. "Authorization Role" in StaffManagement.tsx), written in formal/jargon-y English that's unfriendly to staff who aren't fluent readers. Two-part effort:
1. **Extract to one file**: create `src/i18n/en.ts` - a flat, keyed strings object (e.g. `team_role: "Team Role"`) - and have components read from it instead of inlining text. Keyed (not just English-as-the-source) so a future `hi.ts` or similar can sit alongside it without a code rewrite, if translation is ever needed. No i18n library needed for now - single language, plain object, no added dependency.
2. **Reword toward plain English** as strings get extracted: "Authorization Role" -> "Team Role", and similar case-by-case simplifications flagged during the pass or from staff feedback.
Roll out phased, not as one big-bang pass: start with the screens staff touch daily (sidebar/nav, Guest Registration, Operational Dashboard), extract + reword those, then expand outward. Once the file exists, future wording tweaks are a one-line edit instead of a code hunt.

---
*Last Updated: August 2026*
