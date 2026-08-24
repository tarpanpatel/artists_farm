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

> 📌 **Standing rule (stated explicitly 24 Aug 2026): the nav tree's shape must never change per
> role, only which existing nodes within that one fixed tree are visible.** When a role needs
> access to one page inside an existing group (e.g. "Food Orders" inside "Kitchen"), grant that
> role the existing child node (and its parent, if a route guard needs the parent's own roles too -
> see `App.tsx`'s `isRouteAllowed()` special-case for `take_food_order`/`kitchen_orders`) - never
> invent a parallel/standalone nav item that duplicates part of the tree just to avoid touching the
> real hierarchy. The reasoning: a role's permissions grow over time as product needs change, and if
> that growth ever changes the *shape* of their menu (a shortcut item today, nested under a real
> group tomorrow), the role's users have to relearn their own navigation - whereas visibility-only
> changes just make more of an already-familiar tree light up. Got this wrong once already (see the
> "Kitchen Order Status" changelog entries below, corrected same day) - don't repeat it.

> ⚠️ **Enforcement caveat**: everything below (except where noted) is enforced by **hiding the nav
> tab / UI control**, not by a backend permission check. `router.php` only verifies which *property*
> a session may touch, not which *role-gated feature within it*. A restricted role's account could
> still call a hidden action directly (e.g. via devtools) today — these lists describe the
> intended/normal workflow, not a hard security boundary, unless a line says otherwise.

> ⚠️ **Known live bug (not a role issue)**: a "Past Guests" sidebar item was showing up in at least
> the `Staff` role's nav on staging. Per a code comment in `GuestManagement.tsx`, this was a
> **removed feature** (the old GuestHistory/"Past Guests" archive view) — the nav entry pointing to
> it was never cleaned up and shouldn't exist for *any* role anymore. **Fix shipped 23 Aug 2026**
> (`nav_menu_self_heal_v3` block, `php/kitchen/menu.php`) — deletes the row outright the next time
> `get_nav_menu` runs on an environment that hasn't seen this version yet. That code has been live
> (deployed to staging) since 23 Aug 19:15, and `get_nav_menu` fires on effectively every page load,
> so it has almost certainly already self-corrected on staging by now — but this wasn't re-checked
> against a real staging login as part of the 24 Aug pass below (needs a browser session to confirm
> the row is actually gone from staging's `nav_menu_items`, not just from local's).

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
  ✅ *Fixed 23 Aug 2026* via the same `nav_menu_self_heal_v3` block referenced above (full
  `roles_json` overwrite to `["Super Admin","Admin"]`, dropping `Staff Kitchen`). Re-confirmed
  correct directly against local's `nav_menu_items` table on 24 Aug 2026. Same staging-verification
  caveat as the Past Guests note above — the code has been deployed since 23 Aug and should have
  self-corrected, just not re-checked against a real staging login yet.
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
  progress, see which have been served, and mark a dish as served.
  ✅ *Built and live-verified 24 Aug 2026, corrected same day* — **standing product rule (stated
  explicitly 24 Aug 2026): the nav tree's shape must never change for a role, only which existing
  nodes are visible.** A role with access to Food Orders only reaches it via **Kitchen > Food
  Orders**, same path every other kitchen-enabled role already uses - never a standalone/parallel
  nav item - specifically so that if that role is later granted more kitchen access, its sidebar
  just gains siblings under the same already-familiar "Kitchen" parent instead of the whole menu
  shape changing out from under them. (An earlier same-day version of this got that wrong - built a
  standalone "Kitchen Order Status" top-level item - caught in review and reverted before it shipped
  anywhere beyond local dev; see the changelog entry below for the correction.)
  - `php/kitchen/menu.php`'s `nav_menu_self_heal_v5` grants `Staff` the real `take_food_order`
    (child, "Food Orders") and `kitchen_overview` (parent, "Kitchen") rows directly - both are
    needed: `canSeeNavKey()`/`kitchenAccessAllowed`/the sidebar's own filtering all key off the
    child's roles, but `App.tsx`'s `isRouteAllowed()` has a special-case bypass for exactly these
    two keys that deliberately checks the *parent's* roles instead (its own 23 Aug comment explains
    why) - granting only one of the two either hides the link or shows it but bounces the click back
    to Dashboard.
  - `KitchenManagement.tsx`'s `isRestrictedStaffKitchenView` flag (`activeRole === 'Staff'`) does
    the actual UI restriction once inside: forces the "Live Tickets" tab regardless of entry key
    (every other role's "Food Orders" click defaults to the "Take Order"/POS tab instead - Staff
    never sees a tab switcher at all, so that default had to be overridden), hides the Cancel-order
    button, hides "Mark Ready"/reminder/delete on not-ready items (shown as a plain "Preparing"
    badge instead), and shows only "Mark Served" on an already-ready item - reusing the exact same
    `handleMarkDishServed()` the full Kitchen view already uses. The served-dishes table
    (`CurrentGuestServedDishes`) below the ticket grid renders unchanged, satisfying "see which have
    been served" for free.
  - Live-verified via the header's "View site as a specific role" preview (Staff): sidebar showed
    exactly Dashboard/Bookings/Service Requests/**Kitchen → Food Orders** (badge count included, no
    standalone item, no Stock Requests/Staff Meals/etc. siblings); a seeded test order rendered with
    the not-ready item action-less and the ready item showing only "Mark Served"; clicking it wrote
    a real `Served` status + timestamp to `order_items` in the DB - not just a build check.
  - **Side effect, expected and correct**: the Dashboard's "Live Kitchen Tickets" widget
    (`kitchenAccessAllowed`, keyed off the same `take_food_order` row) now also shows real tickets
    for Staff instead of "Kitchen access not available for your role" - this naturally follows from
    Staff having real (if restricted) access to that nav node now, rather than being a separate gap
    to track.
- Service Requests

**Cannot do:**
- **Checkout & settle bill** — intended policy per you. ✅ *Enforced as of 23-24 Aug 2026* — both
  `BookingDetailsModal.tsx` (`canCheckoutBooking`, 23 Aug) and `BillingCheckout.tsx`
  (`canCheckoutBookingRole`, 24 Aug, also threaded into `MobileBookingCardStack.tsx` as its
  `canCheckout` prop) now hide the Checkout button/action for both `Staff` and `Staff Kitchen`,
  independent of the pre-existing stay-status/date check. Re-confirmed by reading the current code
  on 24 Aug 2026 (this file's own 24 Aug changelog entry had already documented the
  `BillingCheckout`/`MobileBookingCardStack` half of this fix; this "Cannot do" line just hadn't been
  updated to match). Still only build-verified, not re-tested against a real `Staff` login in a
  browser — see the changelog note on the 24 Aug entry below.
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
- **24 Aug 2026 — full re-audit of this file's own flagged items** (prompted by "fix these bugs"
  after reviewing this file): every ⚠️ line above was re-checked directly against the current code,
  not re-derived from memory of what was flagged before.
  - Confirmed **already fixed in code** (no new change needed this pass): the Past Guests nav-item
    deletion and Dish Recipes `roles_json` fix (both via `nav_menu_self_heal_v3`, live since 23 Aug
    19:15), and Staff's Checkout & Settle Bill lockout (`canCheckoutBooking` /
    `canCheckoutBookingRole`, also already live). This file's own "Cannot do"/"known bug" wording for
    those three had simply gone stale relative to the code — updated in place above.
  - **Still genuinely open, confirmed by re-reading `App.tsx`**: Staff's kitchen order-status view
    (`kitchenAccessAllowed` still gates on `take_food_order` nav visibility, which `Staff` is
    deliberately excluded from) - this is real feature work, not a stale-doc issue, see the
    Open follow-ups section below.
  - **Not independently re-verified this pass** (no staging login / browser session used): whether
    the Past Guests row and Dish Recipes `roles_json` fix have actually executed against staging's
    live DB (as opposed to just being deployed code that *should* have self-healed by now), and
    whether the checkout-button hiding actually renders correctly for a real Staff/Staff Kitchen
    login rather than just being correct by code inspection. Flag for a Playwright pass against
    staging next time that's authorized.
- **24 Aug 2026 — built the "Staff kitchen order-status view" open follow-up, v1** (see the Staff
  role's Kitchen bullet above for the full writeup): new `staff_kitchen_status` nav item
  (`nav_menu_self_heal_v4`, `php/kitchen/menu.php`) + `isRestrictedStaffKitchenView` gating inside
  `KitchenManagement.tsx`'s existing KDS view, rather than a second UI built from scratch. Live
  browser-verified (Playwright, local, via "View site as a specific role" → Staff): sidebar,
  restricted ticket actions, and the untouched full/Admin KDS view (regression-checked side by
  side) all matched expectations from a real seeded test order, not just a code read-through.
- **24 Aug 2026 — corrected the above, same day**: the standalone top-level `staff_kitchen_status`
  item violated a standing rule stated explicitly by you - nav tree *shape* must never change per
  role, only node *visibility* within the one fixed tree, so a role gaining more access later gains
  siblings under an already-familiar parent instead of a suddenly-different menu shape. Fixed via
  `nav_menu_self_heal_v5` (deletes the v4 row, grants `Staff` the real `take_food_order` +
  `kitchen_overview` rows instead) and a `KitchenManagement.tsx` change so "Food Orders" defaults to
  the Live Tickets tab (not Take Order) specifically for the restricted role. Also updated
  `Navigation.tsx`'s synthetic cold-start-race placeholder for the "Kitchen" root node to include
  `Staff`, matching the real DB row, so the sidebar doesn't flicker "Kitchen" in/out for that role
  during the brief window before real nav data loads. Re-verified live the same way as v1 above,
  this time confirming the sidebar renders as **Kitchen → Food Orders** (nested, badge-counted, no
  standalone item) and that "Mark Served" writes a real `Served` status + timestamp to `order_items`
  through that path.

*(none currently — see the 24 Aug 2026 changelog entry below for the item that used to be here)*
