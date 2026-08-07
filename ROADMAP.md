# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Pending DB Cleanup (writes blocked in-session, need to run manually)

Both root-caused and code-fixed already; only the one-time data cleanup itself
is outstanding - these are direct DB writes, not app-driven actions there's a
UI flow for yet.

1. **Duplicate `#staff_permissions` nav item.** `nav_menu_items` row `nav-23`
   ("Staff & Permissions") duplicates `nav-9` ("Staff & Payees Control") -
   same destination, no children. `DELETE FROM nav_menu_items WHERE
   unique_key = 'staff_permissions';` (one global row, applies platform-wide).
   Or: Root Admin → Edit Main Menu → trash icon on "Staff & Permissions" → Save.

2. **264 fake attendance rows** (re-counted 2026-08-07; an earlier pass had
   found ~154, undercounting because it missed rows under orphaned/deleted
   property_ids and a `property_id = 0` placeholder) planted by the
   `get_attendance` auto-seed bug (fixed in `php/staff/staff.php` - no
   longer seeds going forward) before it was caught. Spans 12 distinct
   property_ids - property 1/Jaipur's real staff IDs/names + hardcoded
   July 2026 dates, inserted under the wrong property_id each time. Cleanup
   query (already scoped correctly - no need to enumerate every property):
   ```sql
   DELETE FROM staff_attendance
   WHERE attendance_date IN ('2026-07-14','2026-07-15')
     AND user_id IN (7,8,11,12,13,15,16,17,18,19,20)
     AND property_id != 1;
   ```
   (property_id = 1 is Jaipur, where this data is real and should stay.)

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

---
*Last Updated: August 2026*
