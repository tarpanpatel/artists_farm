# User Roles & Permissions

Source of truth for what each login role can/cannot do. Started 23 Aug 2026 from the platform-wide
`nav_menu_items` table plus direct code inspection (`GuestManagement.tsx`, `BookingDetailsModal.tsx`,
`BillingCheckout.tsx`, `StaffManagement.tsx`, `KitchenManagement.tsx`) — then revised in-place against
the intended policy as stated directly by the product owner. Where the two disagree, **the rule
stated by the product owner is what's documented as correct**, with a flag on whether the code/DB
currently matches it yet.

**Assignable roles today** (`StaffManagement.tsx`'s `roleOptions`): `Admin`, `Staff Supervisor`,
`Staff Kitchen`, `Staff` — in privilege order per `ROLE_HIERARCHY`. Two legacy role strings
(`Manager`, `Chef`) still appear in some nav items' role lists from before the role system was
consolidated, but neither is offered when creating/editing a staff account anymore.

> ⚠️ **Enforcement caveat**: everything below (except where noted) is enforced by **hiding the nav
> tab / UI control**, not by a backend permission check. `router.php` only verifies which *property*
> a session may touch, not which *role-gated feature within it*. A restricted role's account could
> still call a hidden action directly (e.g. via devtools) today — these lists describe the
> intended/normal workflow, not a hard security boundary, unless a line says otherwise.

> ⚠️ **Known live bug (not a role issue)**: a "Past Guests" sidebar item is currently showing up in
> at least the `Staff` role's nav on staging. Per a code comment in `GuestManagement.tsx`, this was a
> **removed feature** (the old GuestHistory/"Past Guests" archive view) — the nav entry pointing to
> it was never cleaned up and shouldn't exist for *any* role anymore. This needs deleting from the
> `nav_menu_items` row itself (or via the Nav Menu Editor), not a `roles_json` tweak — flag for
> follow-up, not yet fixed.

---

## Root Admin / Super Admin

**Can do everything, in every property.** Not detailed further per your request.

---

## Admin

Full day-to-day property control.

**Can do:**
- Dashboard
- Bookings — view, add, edit, upload guest ID docs, file/manage C-Form, check guests in, checkout &
  settle bill
- Service Requests
- Kitchen — full module (Food Orders, Staff Meals, Stock Requests, Kitchen Wastage, Edit Kitchen
  Stock, Edit Food Menu, mark orders served)
- Recipes / Dish Recipes (Auto-Stock builder)
- Expenses, Finances
- Edit Property
- Team & Access — create/edit Staff, Staff Supervisor, and Staff Kitchen accounts
- Attendance Calendar
- **Telegram Alerts** — Admin + Super Admin are the *only* two roles with Telegram access, full stop
- Extra Charges & Fees
- Property Licenses

**Cannot do:**
- Reports & Earnings (analytics dashboard) — Super Admin only
- Past Bills & Receipts (audit log) — Super Admin only
- Download Data & Excel (export center) — Super Admin only

---

## Staff Supervisor

Money/attendance-oriented role. **Does not have a Bookings tab at all.**

**Can do:**
- Dashboard
- Service Requests
- Kitchen (overview tab) + Staff Meals
- Expenses, Finances
- Attendance Calendar

**Cannot do:**
- Bookings (no guest/booking access of any kind)
- Food Orders, Stock Requests, Kitchen Wastage, Edit Food Menu, Edit Kitchen Stock, Recipes
- Team & Access, Edit Property, **Telegram Alerts**, Extra Charges & Fees, Property Licenses
- Reports & Earnings, Past Bills & Receipts, Download Data & Excel

---

## Staff Kitchen

Kitchen-operations role with **read-only** booking visibility — not a front-desk role.

**Can do:**
- Dashboard
- Bookings — **view only.** No uploading guest ID docs, no C-Form, no check-in, no checkout.
  ✅ *Enforced* as of 24 Aug 2026 (see changelog) across every surface that opens a booking:
  `BookingDetailsModal.tsx` (23 Aug), and `BillingCheckout.tsx`'s own room-card/Past-bookings-table
  buttons plus its `MobileBookingCardStack.tsx` (24 Aug) - the Edit/Checkout buttons there opened
  the booking modal/checkout flow directly and had no role check of their own, so the 23 Aug fix
  alone didn't close this path.
- Kitchen — **everything** in the module: Food Orders, Staff Meals, Stock Requests, Kitchen Wastage,
  Edit Kitchen Stock, Edit Food Menu, mark orders served

**Cannot do:**
- Recipes / Dish Recipes (Auto-Stock builder) — **Super Admin + Admin only.**
  ⚠️ *Contradicts current DB data* — the live `nav_menu_items` row for this item currently includes
  `Staff Kitchen` in its `roles_json` (confirmed in local dev DB), which is the opposite of this
  rule. Needs the nav item's role list corrected via the Nav Menu Editor (or a DB fix) — flagged for
  follow-up, not yet fixed.
- Service Requests
- Expenses, Finances, Attendance Calendar
- Team & Access, Edit Property, **Telegram Alerts**, Extra Charges & Fees, Property Licenses
- Reports & Earnings, Past Bills & Receipts, Download Data & Excel

---

## Staff

Most restricted role — front-desk/booking duties plus a slice of kitchen visibility. No money access.

**Can do:**
- Dashboard
- Bookings — view bookings, upload guest ID docs, file/manage C-Form, check guests in
- Kitchen — **limited, order-status visibility only**: see which orders are currently live/in
  progress, see which have been served, and mark an order as served.
  ⚠️ *Not yet enforced/available in code* — Staff currently has **no** kitchen tab or dashboard
  widget access at all (`kitchenAccessAllowed` in `App.tsx` requires visibility on the `Food Orders`
  nav item, which `Staff` isn't in — same reason the Dashboard's "Live Kitchen Tickets" panel shows
  "Kitchen access not available for your role" instead of tickets). Documented as intended policy per
  you; this needs a new, narrower view/permission built (live + served orders and a "mark served"
  action only — not full kitchen management), not just flipping an existing flag. Flag when ready to
  build it.
- Service Requests

**Cannot do:**
- **Checkout & settle bill** — intended policy per you, ⚠️ **not yet enforced in code today.**
  `BookingDetailsModal.tsx`'s "Checkout & Settle Bill" button and `BillingCheckout.tsx`'s settle flow
  have no role check at all right now — only a stay-status/date check, unrelated to who's logged in.
  A Staff-role login can currently checkout a guest through the normal UI.
- Kitchen — full module (Food Orders creation, Stock Requests, Kitchen Wastage, Edit Food
  Menu/Stock, Recipes) beyond the limited live/served view above
- Expenses, Finances, Attendance Calendar
- Team & Access, Edit Property
- **Telegram Alerts**, Extra Charges & Fees, Property Licenses
- Reports & Earnings, Past Bills & Receipts, Download Data & Excel

---

## Cross-cutting modifiers (independent of role)

- **"Financial Handler" flag** (`isFinancialHandler` / `is_financial_handler`) — per-account toggle
  controlling whether that person appears in "who received this payment" dropdowns (advance /
  pending / expenses) in Guest Management, Receipts, and Petty Cash. Independent of role — e.g. a
  `Staff` or `Staff Kitchen` account can be marked a financial handler even without a Finances tab.
- **"Access All Properties" flag** (`access_all_properties`) — whether a staff login is locked to one
  property or can move between every property under the tenant. Also independent of role.

## Changelog (every real change applied, so this file and the Nav Menu Editor stay honest)

All role→nav-item mappings live in the single `nav_menu_items` DB table (`roles_json` column per
row) and are fully editable later via the Root Admin's **Nav Menu Editor** — nothing about roles is
hardcoded outside that table except the base `roleOptions` list in `StaffManagement.tsx` (the 4
assignable role *names* themselves) and `NavMenuEditor.tsx`'s own fallback role list (kept in sync
with that same set, only used if `get_system_roles` fails to load). So every fix below that touches
`roles_json` is automatically visible/editable in the Nav Menu Editor once applied — no separate
wiring needed there.

- **23 Aug 2026 — `php/kitchen/menu.php`, new `nav_menu_self_heal_v3` block** (one-time, self-heals
  on every environment the next time `get_nav_menu` runs there, same pattern as the existing `v2`
  block just above it):
  - Deletes the orphaned **"Past Guests"** nav item outright (matched by title/unique_key/tab_key
    pattern, since its exact row id is unknown from local — it doesn't exist in local's DB at all,
    staging-only drift).
  - Sets **Telegram Alerts**' `roles_json` to `["Super Admin","Admin"]` — full overwrite, no
    exceptions for any other role.
  - Sets **Dish Recipes (Auto-Stock)**'s `roles_json` to `["Super Admin","Admin"]`, removing
    `Staff Kitchen` (this one was wrong in local's DB too, not just staging).
- **23 Aug 2026 — `src/components/Navigation.tsx`**: fixed a sidebar tree-building bug where a
  child nav item visible to a role whose *parent* item isn't (e.g. `Attendance Calendar` under
  `Team & Access`, for `Staff Supervisor`) was silently promoted to a root-level sidebar item
  instead of staying grouped. `buildTree()` now creates a `groupOnly` shell for the invisible parent
  (borrowing its title/icon/category from the unfiltered nav list) purely so the child still nests
  visually — clicking that shell's header only expands/collapses, it doesn't navigate anywhere
  (App.tsx's own route guard would've bounced them back out anyway, but there's no reason to make it
  look clickable in the first place). Live-verified: as `Staff Supervisor`, "Team" now renders as an
  expandable group with "Attendance Calendar" nested inside it, and clicking "Attendance Calendar"
  still correctly opens the real page.
- **23 Aug 2026 — `src/components/BookingDetailsModal.tsx`**: booking actions are now actually
  gated by role (previously documented as intended-but-unenforced, now real). Reads `activeRole`
  directly from `AuthContext` (same pattern `Navigation.tsx` already uses for its own role
  filtering) rather than threading a new prop through every render call site.
  - `Staff Kitchen` is now genuinely view-only: no Upload Guest ID, C-Form actions, Mark Checked In,
    Checkout & Settle Bill, Delete, or Edit - only the read-only field display and Share remain.
  - `Staff` keeps everything except Checkout & Settle Bill, which is now hidden for both `Staff`
    and `Staff Kitchen`.
  - Live-verified as `Staff Kitchen` (Abhijeet): sidebar correctly shows only Dashboard/Bookings/
    Kitchen, matching this table.
- **24 Aug 2026 — `src/components/BillingCheckout.tsx` + `src/components/MobileBookingCardStack.tsx`**:
  closed a gap the 23 Aug `BookingDetailsModal.tsx` fix didn't cover — reported live via screenshot
  (Staff Kitchen login, "Bookings" page) showing fully-enabled Edit/Checkout buttons on every room
  card. Root cause: `BillingCheckout.tsx`'s own room-card grid and Past-bookings table render their
  own Edit/Checkout `<Button>`s that call `handleEditGuest`/`handleEditAndCheckoutGuest` directly
  (opening `BookingDetailsModal`/`ReceiptEditModal` themselves) - the buttons themselves had no role
  check, only `BookingDetailsModal`'s *internal* actions did, so the outer buttons stayed visible and
  the Checkout one opened `ReceiptEditModal` without ever passing through that gate at all. Same gap
  existed a second time in `MobileBookingCardStack.tsx` (the phone-viewport card stack for the
  Upcoming/Past tabs), independently of the desktop cards.
  - Fix mirrors `BookingDetailsModal.tsx`'s exact `activeRole`-from-`AuthContext` pattern
    (`isStaffKitchenRole` / `canActOnBooking` / checkout-role boolean), computed once in
    `BillingCheckout.tsx` and passed down to `MobileBookingCardStack` as new `canEdit`/`canCheckout`
    props (both default `true`, so no other caller of that component is affected).
  - `Staff Kitchen`: both room-card and Past-bookings-table actions collapse to a single "View
    Booking" button (Eye icon) that still opens the same modal - it's already read-only there per the
    23 Aug fix - rather than hiding the row action entirely, matching "can view, can't edit" policy.
  - `Staff`: keeps "Edit"/"Edit Booking", loses the "Checkout" button specifically (room-card grid
    only ever showed Checkout when the guest's stay-status already allowed it - that stay-status
    check is unchanged, this just adds the role check as a second, independent condition).
  - Not yet live-verified against a real Staff Kitchen/Staff login on this specific page (build
    verified only) - worth confirming next time either role is available to test with, the way
    Abhijeet's login confirmed the 23 Aug fix.

## Open follow-ups (not yet built — real feature work)

1. **Staff kitchen order-status view** — live orders, served orders, and a "mark served" action
   only (not the full Kitchen module). Doesn't exist as a scoped-down view today; needs a new nav
   entry + a restricted rendering path, most likely inside `KitchenManagement.tsx` gated on
   `activeRole === 'Staff'`, reusing its existing order/served-log data and `handleMarkDishServed`
   rather than building fetch logic from scratch.
