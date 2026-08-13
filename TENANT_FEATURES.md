# Ground Code â€” Tenant Feature Guide

A complete resort/property management system for tenants (property owners and operators). Log in with your mobile number / username and 6-digit passcode. Everything you do is saved instantly and backed by a full audit trail.

---

## 1. Dashboard & Daily Overview

- **Today's Check-ins & Pending Actions** â€” see who is arriving today, who is staying, and any pending tasks at a glance.
- **Guest Currently Staying** â€” live profile of the current resident, room, and billing status.
- **Live Kitchen Tickets** â€” active food orders in real time.
- **Booking Calendar** â€” upcoming and in-house bookings across all rooms.
- **Alerts** â€” system alerts including C-Form filing due dates, stale reminders, and expiring licenses.
- **Quick Actions** â€” jump straight to check-in, billing, kitchen, or inventory from the dashboard.

## 2. Guests & Booking Management

- **Guest Registration** â€” check in guests with name, phone, number of guests, room assignment, check-in/check-out dates, per-night rate, total charge, and advance paid.
- **Room Assignment** â€” single-key and multi-key (multi-room) properties; each room holds one active booking at a time (guests can represent multiple people).
- **Booking Calendar & Room Availability** â€” see which rooms are occupied on which dates before assigning.
- **Edit Bookings** â€” change guest name, phone, room, dates, charges, and advance.
- **Guest History** â€” full archive of past stays, with the option to check a guest back in.
- **Check-in Verification** â€” capture guest ID documents and flag C-Form filing requirements (important for foreign national guests).
- **C-Form Tracking** â€” mark and track C-Form filing status per guest.
- **Guest Notes** â€” record special requests or instructions on the booking.
- **Check-out** â€” automated final bill: room rent, food & incidentals, advance adjustment, GST tax breakdown, and custom adjustments. Preview and edit the receipt before finalising.
- **Receipts** â€” every check-out produces a printed/saveable receipt, archived in Past Billing Receipts.

## 3. Billing & Final Settlement

- **Multi-Room Billing Terminal** â€” handle billing for all in-house guests from one screen.
- **Accommodation Invoice Breakdown** â€” room rent Ã— nights, per guest.
- **Food Orders & Incidentals Log** â€” every dish and incidental charge is itemised.
- **Custom Adjustments** â€” add discounts, corrections, or extra charges at check-out.
- **Split Settlement** â€” split the final payment between multiple sources (cash / online / UPI QR / advance), with a split distribution matrix.
- **Tax (GST) Breakdown** â€” clear GST display on the final bill.
- **Payment Modes** â€” cash, online/UPI, QR code, or against advance deposit.
- **WhatsApp Voucher** â€” share the booking confirmation / final voucher to the guest's phone via WhatsApp with a customisable template.

## 4. Kitchen & Food Service

- **Take Food Orders (KOT)** â€” create kitchen orders from the food menu, per table or per room.
- **Live Kitchen Dashboard** â€” tickets queue in real time; update order status as items are prepared and served.
- **Order Item Status & Reminders** â€” mark each item served; set reminders and track stale/overdue tickets.
- **Staff Meals** â€” record staff meal consumption with custom meal templates.
- **Food Menu Manager** â€” add/edit menu items, categories, prices, images, availability; hide items without deleting.
- **Recipe Costing & Food Margin Builder** â€” build recipes with ingredients, yield factor, and servings; see cost per portion and profit margin.
- **Save Recipe Presets** â€” reuse recipes across dishes.
- **Served Logs** â€” every served dish is logged for analytics.

## 5. Inventory & Stock

- **Inventory Catalog** â€” register raw materials with unit (Kg/Gm/Ltr/Ml/Pack/Pcs/Box), category, and stock-alert boundaries.
- **Stock Requests / Requisitions** â€” staff request raw materials; requests flow into a **Fulfill Sheet** to record actual delivered quantity, cost price, and size.
- **Stock Log & Depletion** â€” stock is automatically depleted when dishes are served/consumed.
- **Kitchen Purchases** â€” record purchases, mark them paid, and split payment between **Farm Cash** and **Out-of-Pocket**.
- **Wastage Logs** â€” log spoiled/wasted stock.
- **Deficit / Shortfalls Log** â€” track items that ran out.
- **Material Categories** â€” add, rename, and manage categories; bulk-update items by category.
- **Stock Alerts** â€” automatic low-stock alerts based on your configured boundaries.

## 6. Expenses, Petty Cash & Cash Drawer

- **Operational Expenses Ledger** â€” record every expense with amount, vendor/payee, category, and notes.
- **Expense Categories & Items** â€” pre-loaded defaults (salary, utilities, maintenance, etc.) plus your own custom categories; sync default expense templates.
- **Misc Charges / Extra Services** â€” reusable service templates (e.g., pet fee, extra bed) for billing.
- **Cash Drawer Manager** â€” record cash handovers between staff and manual balance adjustments.
- **Staff Cash Responsibility** â€” see each staff member's net cash balance; prevent handovers that exceed the balance.
- **Drawer Entry History** â€” full log of every handover and adjustment.

## 7. Staff & Payroll

- **Staff Directory** â€” add staff with roles: **Super Admin, Admin, Staff Supervisor, Staff Kitchen, Staff**.
- **Passcode Login for Staff** â€” each staff member logs in with their own mobile/username + 6-digit passcode.
- **Attendance** â€” daily attendance calendar and logs.
- **Payroll & Salaries** â€” monthly payout calculator, salary records, deductions.
- **Staff Advances** â€” give cash advances and track advances per month.
- **Payees (Vendors & Third Parties)** â€” register suppliers/vendors with UPI QR codes for easy payments.
- **Reset Staff Passcodes** â€” reset a staff member's passcode when needed.

## 8. Service Requests

- **Create Service Requests** â€” housekeeping, maintenance, and any custom service category.
- **Request Types Manager** â€” define your own service types and categories.
- **Status Workflow** â€” track pending â†’ fulfilled; stale requests surface as alerts.
- **Fulfill & Remind** â€” mark requests fulfilled and set reminders.

## 9. Analytics & Business Intelligence

- **BI Analytics Dashboard** â€” monthly bookings, revenue, and guest counts.
- **Room-by-Room Performance** â€” compare revenue/occupancy per room.
- **Food Menu Performance** â€” most popular dishes, quantity sold, revenue generated.
- **Kitchen Sales, Purchases & Net Profit** â€” food margins and profitability.
- **Expense Cost Breakdown** â€” total cost per expense item.
- **Profit & Loss Statement** â€” income vs. expenses for a selected month.
- **Balance Sheet** â€” assets, liabilities, and equity.
- **Cash Flow Statement** â€” cash in, cash out, net cash position.
- **Purchase Analytics** â€” spending patterns on stock and supplies.

## 10. Notifications & Integrations

- **Telegram Notifications** â€” automated alerts to Telegram groups, routed per area:
  - **Kitchen group** â€” new food orders / KOT tickets.
  - **Admin group** â€” guest check-ins, check-outs, and operational events.
  - **Finance group** â€” payments, expenses, and settlement activity.
- **Telegram Template Manager** â€” customise notification wording with variables, and preview live (admin-controlled permission).
- **Telegram Setup Wizard** â€” connect your own bot step by step.
- **iCal & OTA Channel Sync** â€” connect iCal feeds from booking/OTA channels to keep your calendar in sync.
- **WhatsApp Templates** â€” customise booking-confirmation and voucher messages.
- **Email (SMTP)** â€” configure SMTP for sending login credentials and notifications.
- **Forgot Passcode** â€” recover/reset your login passcode via registered email.

## 11. Customisation

- **Menu / Navigation Editor** â€” add, reorder (drag & drop), rename, and parent/child nest sidebar menu items; show/hide per role; add custom URLs and icons.
- **Themes & Appearance** â€” change accent colours, heading scale, dark-mode colours, fonts, sidebar background, card radius, and button styles.
- **Custom CSS Override** â€” power users can inject custom CSS; includes a built-in Lucide icon browser.
- **Property Settings** â€” property name, address, Google Maps link, other notes, phone, WhatsApp confirmation template, and Telegram template permission toggle.

## 12. Data, Backup & Audit

- **Data Export & Backup Center** â€” export to spreadsheets:
  - Accommodations booking spreadsheet (check-ins, occupancy, advances, food bills, room collections)
  - Kitchen purchases workbook
  - Property maintenance & utilities logs
  - Payroll & salaries registry
  - Master transaction ledger (room advances, settlements, food collections, purchases, expenses)
  - Full system snapshot backup (root admin)
- **Audit Trails** â€” every action is logged: guest check-ins/check-outs, bill modifications, food orders, inventory changes, staff attendance, login attempts, and operational activity â€” all timestamped with the user.
- **License Management** â€” manage property licenses with expiry tracking and alerts.

## 13. Multi-Property & Platform (Managed by Platform)

- Tenants can own **multiple properties**, each with its own slug, settings, staff, and data.
- **Property Setup Wizard** â€” guided 3-step setup: add the address, add team members, create your first room.
- **Root Admin Platform** â€” the platform team manages tenants, properties, module toggles (e.g., kitchen module on/off), themes, and full-platform analytics.
- Modules are per-property: a property without food service hides the entire kitchen/inventory workflow from the sidebar automatically.

---

*All data is stored per property in a secure multi-tenant database. Every write is protected (prepared statements, session + API-key authentication) and every action is traceable.*

