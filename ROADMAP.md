# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Auto-relay uploaded photos (guest IDs + expense invoices/receipts) to Telegram + Google Drive

Every time a picture is uploaded in either of these two flows, it should be
(1) sent as an actual photo to the property's Telegram Admin channel - not
just a text notification like today - and (2) uploaded to Google Drive into
a consistent, browsable folder structure.

**In scope (uploads of "ids and invoices" specifically):**
- Guest ID documents - `CheckinVerificationModal.tsx` → `guests.php`
  `upload_id_document`. Today this only sends a *text* progress message to
  Telegram ("📸 ID Document Uploaded... 2/2 required ID(s) uploaded") - the
  photo itself never reaches Telegram.
- Expense Invoice Bill + Payment Screenshot - `PettyCashManagement.tsx`
  (compressed client-side to base64 before submit). Today these aren't sent
  to Telegram or anywhere else at all beyond the DB row.

Other upload points in the app (staff QR codes, menu/inventory item photos,
CSS import) are guest/expense-*unrelated* and out of scope here.

**Telegram part:** `php/telegram/sender.php` already has
`sendPropertyTelegramPhoto($pdo, $propertyId, $category, $filePaths, $caption, $templateKey)`
and `sendRawTelegramPhoto(...)` - this is a wiring job (call it from both
upload handlers with the actual image), not new infrastructure.

**Google Drive part is net-new** - no Drive integration exists in this
codebase yet. Needs: a Google Cloud service account + Drive API
credentials, a small PHP wrapper (folder-exists-or-create, then file
upload), and a shared path-building helper so both upload flows produce
the same structure:

```
{tenant_name}/{property_name}/{category}/{Month YYYY}/{descriptive_name}_{DD-MM-YYYY}_{HHMM}hrs.{ext}
```

Worked example (₹3000 diesel expense logged 12 July 2026, 2:00 PM):
```
Vrikshawan/Goa Homes/Expenses/July 2026/Diesel_12-07-2026_1400hrs.jpg
```
Guest ID documents would follow the same pattern under an `ID Documents`
category, e.g. `Vrikshawan/Goa Homes/ID Documents/July 2026/PriyaSharma_12-07-2026_1400hrs.jpg`.

Every relevant page already has its own datalog (expense date/category,
guest name/room, upload timestamp) to derive this path from - no new
fields needed, just wiring the existing values through.

### Needs Manual Verification

- **Telegram delivery on booking edits.** `update_guest` now diffs the
  pre-update row and pings the property's Admin Telegram channel with the
  changed fields (see `php/guests/guests.php`) - verified the diff logic
  runs cleanly and doesn't break the save (edited/reverted a live guest name
  with no errors), but actual message delivery to Telegram wasn't confirmed
  from this session (no visibility into the bot/chat from here). Same open
  question for the pre-existing new-booking and ID-upload notifications this
  pattern was copied from. Check the property's actual Admin Telegram chat
  after an edit to confirm the message arrives and reads correctly.

### Dark Mode Toggle — Revisit After 1 Week

- Dark mode toggle is **temporarily disabled** in the header. The toggle
  button is visible but non-functional, and `onToggleDarkMode` is a no-op.
  Revisit after **one week** to decide whether to re-enable the toggle or
  remove it entirely. Do not merge any dark-mode theme changes until then.

### CSV Export Consolidated

- Merged the Guest History CSV export into the Data Export Center's
  **Accommodations Booking Spreadsheet**. The export now includes Status,
  C-Form Status, and Filing Time in addition to the existing booking fields.
  Removed the duplicate "Export filtered list (CSV)" button from Guest History.

### Slot Usage Widget — Minimal Redesign

- Replaced the detailed Slot Usage widget on the Tenant Dashboard with a
  compact inline pill showing used/total slots and a slim progress bar.
  Removed the per-property breakdown tree to reduce visual noise.

---

*Last Updated: August 2026*
