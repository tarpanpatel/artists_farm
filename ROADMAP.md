# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Kitchen Orders: running "served" history, sunk to the bottom
Kitchen Live Orders currently shows served items struck-through inside their original order card. There used to be a running table (react-data-table-component, same pattern as Guest History) listing every dish served since the guest checked in, with served rows sinking to the bottom instead of staying pinned inside their order card - so staff can see the full serving history for a stay at a glance, not just per-order. Restore that view.

### Staff Advances: move off localStorage onto the database
Staff advances (Monthly Payout Calculator, "+ Advance") are stored entirely in browser localStorage (`staff_advances`), not in any DB table. Consequences: doesn't sync across devices/terminals (an advance given from one browser is invisible on another), fragile (cleared browser data or a new device silently loses the record), and feeds directly into the real pendingPayout (money owed) calculation - so losing it has real financial consequences, not just a display glitch. Symptom already seen live: a stale/orphaned advance entry whose staffId no longer matches any current staff member, so it can never be attributed to a row in the payout table above and just sits in the flat "Advances This Month" list underneath, disconnected. Needs a real `staff_advances` table + API (mirroring the pattern used for petty cash/financial ledger entries) so advances are durable, property-scoped, and properly tied to a staff_id foreign key.

### WhatsApp Business API Integration
Add WhatsApp as a notification/alert channel alongside the existing Telegram integration (same event types: new bookings, kitchen orders, service requests, financial transactions, etc.), likely via the WhatsApp Business Platform (Cloud API). Registered sender to use:
- Display name: Artists Farm
- Number: +91 99831 96863
- Phone Number ID: 1232057176655692

### Data Export Center: whole-year and custom date-range exports
The Data Export & Backup Center (Accommodations Booking Spreadsheet, Property Maintenance & Utilities Logs, Payroll & Salaries Registry, Master Transaction Ledger) currently only exports one calendar month at a time (Target Statement Month + Year pickers). Add two more export scopes: a full calendar year in one export, and an arbitrary custom date range (start date -> end date) for ad-hoc reporting periods that don't align to a month or year boundary.

### Plain-Language UI Text + Centralized Strings File
UI copy is currently hardcoded inline across ~52 component files (e.g. "Authorization Role" in StaffManagement.tsx), written in formal/jargon-y English that's unfriendly to staff who aren't fluent readers. Two-part effort:
1. **Extract to one file**: create `src/i18n/en.ts` - a flat, keyed strings object (e.g. `team_role: "Team Role"`) - and have components read from it instead of inlining text. Keyed (not just English-as-the-source) so a future `hi.ts` or similar can sit alongside it without a code rewrite, if translation is ever needed. No i18n library needed for now - single language, plain object, no added dependency.
2. **Reword toward plain English** as strings get extracted: "Authorization Role" -> "Team Role", and similar case-by-case simplifications flagged during the pass or from staff feedback.
Roll out phased, not as one big-bang pass: start with the screens staff touch daily (sidebar/nav, Guest Registration, Operational Dashboard), extract + reword those, then expand outward. Once the file exists, future wording tweaks are a one-line edit instead of a code hunt.

---
*Last Updated: August 2026*
