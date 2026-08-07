# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Plain-Language UI Text + Centralized Strings File
UI copy is currently hardcoded inline across ~52 component files (e.g. "Authorization Role" in StaffManagement.tsx), written in formal/jargon-y English that's unfriendly to staff who aren't fluent readers. Two-part effort:
1. **Extract to one file**: `src/i18n/en.ts` - a flat, keyed strings object (e.g. `team_role: "Team Role"`) - components read from it instead of inlining text. Keyed (not just English-as-the-source) so a future `hi.ts` or similar can sit alongside it without a code rewrite, if translation is ever needed. No i18n library - single language, plain object, no added dependency.
2. **Reword toward plain English** as strings get extracted: "Authorization Role" -> "Team Role", "Current Resident Profile" -> "Guest Currently Staying", "KDS Queue" -> "Order Queue", and similar case-by-case simplifications flagged during each pass or from staff feedback.

Rolled out phased, not as one big-bang pass. Done so far:
- ✅ Sidebar/nav (`Navigation.tsx`)
- ✅ Guest Registration (`GuestManagement.tsx`)
- ✅ Operational Dashboard (`OperationalDashboard.tsx`)
- ✅ Staff & Payee Management (`StaffManagement.tsx`) - the original motivating "Authorization Role" example, now "Team Role"
- ✅ Platform Property Management (`PlatformPropertyManagement.tsx`)
- ✅ Telegram Notification Modal (`TelegramNotificationModal.tsx`)
- ✅ Receipt Edit & Checkout Modal (`ReceiptEditModal.tsx`)
- ✅ Audit Logs & Receipts View (`AuditLogsView.tsx`)
- ✅ Menu Manager (`MenuManager.tsx`)
- ✅ Analytics Dashboard (`AnalyticsDashboard.tsx`)
- ✅ iCal Sync Manager (`ICalSyncManager.tsx`)
- ✅ Tenant Dashboard (`TenantDashboard.tsx`)
- ✅ Petty Cash Management (`PettyCashManagement.tsx`)
- ✅ Custom CSS Override (`CustomCSSOverride.tsx`)
- ✅ Nav Menu Editor (`NavMenuEditor.tsx`)
- ✅ Today Overview (`TodayOverview.tsx`)
- ✅ Data Export Center (`DataExportCenter.tsx`)
- ✅ Telegram Setup Wizard (`TelegramSetupWizard.tsx`)
- ✅ Guest Billing & Checkout (`BillingCheckout.tsx`)
- ✅ Multi-Key Property Overview (`MultiKeyPropertyOverview.tsx`)
- ✅ Cash Drawer Manager (`CashDrawerManager.tsx`)
- ✅ Login Page (`LoginPage.tsx`)
- ✅ Root Admin Dashboard (`RootAdminDashboard.tsx`)
- ✅ Inventory Management (`InventoryManagement.tsx`)
- ✅ Kitchen Management (`KitchenManagement.tsx`)
- ✅ Default Expenses Manager (`DefaultExpensesManager.tsx`)
- ✅ Header (`Header.tsx`)
- ✅ Misc Charges Management (`MiscChargesManagement.tsx`)
- ✅ License Management (`LicenseManagement.tsx`)
- ✅ Theme Management (`ThemeManagement.tsx`)
- ✅ Guest History (`GuestHistory.tsx`)
- ✅ Email Settings Panel (`EmailSettingsPanel.tsx`)
- ✅ Date Picker (`DatePicker.tsx`)
- ✅ Expense Items Management (`ExpenseItemsManagement.tsx`)
- ✅ Check-in Verification Modal (`CheckinVerificationModal.tsx`)
- ✅ Service Requests Management (`ServiceRequestsManagement.tsx`)
- ✅ Loading/Error/Settings/Modal shared components (`LoadingSpinner`, `ErrorBoundary`, `AppearanceSettings`, `InvalidPropertyPage`, `LoadingScreen`, `SearchableSelect`, `GlobalModal`, `RoomSelectorModal`, `MultiKeyRoomDrawer`, `ConfirmDialogContext`, `StyledSelect`, `DataLoader`)
- ✅ Property Setup Wizard (`PropertySetupWizard.tsx`)
- ✅ No static UI text (nothing to extract): `ToggleSwitch.tsx`, `ToastContext.tsx`
- ✅ Date Range Picker (`DateRangePicker.tsx`)
- ✅ Demo Data Modal (`DemoDataModal.tsx`)
- ✅ Login Modal (`LoginModal.tsx`)
- ✅ Telegram Connection Settings (`TelegramConnectionSettings.tsx`)
- ✅ Root App Shell (`App.tsx`)

All 56 component files are now i18n-extracted (or verified to have no static UI text). Once a screen's strings are extracted, future wording tweaks on it are a one-line edit instead of a code hunt.

Note: duplicate-key sweep passed clean for the latest batch; the earlier 5-key regression was from overlapping commits and is already resolved.

### Pending DB Cleanup (writes blocked in-session, need to run manually)

Both root-caused and code-fixed already; only the one-time data cleanup itself
is outstanding - these are direct DB writes, not app-driven actions there's a
UI flow for yet.

1. **Duplicate `#staff_permissions` nav item.** `nav_menu_items` row `nav-23`
   ("Staff & Permissions") duplicates `nav-9` ("Staff & Payees Control") -
   same destination, no children. `DELETE FROM nav_menu_items WHERE
   unique_key = 'staff_permissions';` (one global row, applies platform-wide).
   Or: Root Admin → Edit Main Menu → trash icon on "Staff & Permissions" → Save.

2. **~154 fake attendance rows** planted by the `get_attendance` auto-seed bug
   (fixed in `php/staff/staff.php` - no longer seeds going forward) before it
   was caught. Contaminated properties (property 1/Jaipur's real staff
   IDs/names + hardcoded July 2026 dates, inserted under the wrong
   property_id): Mall Road Cottage, Goa, Goa Homes, Resort Hut, Winter Garen,
   Room 101, Room 102. Cleanup query:
   ```sql
   DELETE FROM staff_attendance
   WHERE attendance_date IN ('2026-07-14','2026-07-15')
     AND user_id IN (7,8,11,12,13,15,16,17,18,19,20)
     AND property_id != 1;
   ```
   (property_id = 1 is Jaipur, where this data is real and should stay.)

3. **Pre-existing guests with no room assigned** (e.g. "Hans Mueller" on Goa
   Homes) - `add_guest` never wrote `room_id` at all until now (see fix in
   `php/guests/guests.php`), so every booking made before this fix has
   `room_id = NULL` regardless of what room was actually picked at check-in.
   Not backfillable - there's no stored room name on these older rows to
   recover from. Also currently no UI to fix them: Edit Booking has no
   Assigned Room field for Multi-Key properties (only Guest Name/Dates/
   Phone/Number of Guests), even though `update_guest` already accepts
   `room_id`. Needs: an Assigned Room dropdown in Edit Booking (`selectedBooking`
   modal, `src/components/OperationalDashboard.tsx`) so staff can manually
   reassign these going forward.

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
