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

Remaining: ~26 component files. Once a screen's strings are extracted, future wording tweaks on it are a one-line edit instead of a code hunt.

---
*Last Updated: August 2026*
