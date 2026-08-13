# Ground Code Resort - AI Project Rules & Conventions

This file documents ALL project conventions and rules. Every AI agent must follow these rules without exception.

## ðŸŽ¨ UI & Design Rules

### Icon Library (CRITICAL)
- **Use ONLY Lucide React icons** (`lucide-react` package)
- NO other icon libraries (FontAwesome, Material-UI, etc.)
- Examples: `Building`, `Users`, `Calendar`, `LogOut`, `DollarSign`, etc.
- This includes: sidebar icons, button icons, navigation icons, property type icons
- Search Lucide docs: https://lucide.dev/

### Color & Styling
- Use Tailwind CSS only
- Follow existing color scheme: blue-600 (primary), emerald-600 (success), red-600 (error), amber-600 (warning)
- Dark mode support: use `dark:` prefix for all colors
- Always include dark theme variants

### Component Library (Tailwind only)
- No external UI component library - build everything with Tailwind CSS classes directly
- For hover tooltips, use the small `Tooltip.tsx` component (`src/components/Tooltip.tsx`): pure-Tailwind, CSS `group-hover`/`group-focus-within` reveal with a small arrow - e.g. `<Tooltip content="..."><span>Help?</span></Tooltip>`
- Tooltips render above the trigger and don't auto-flip; place them where they won't clip at the edge of a modal

### Date Format (CRITICAL)
- **Display format: DD/MM/YYYY** (e.g., `02/08/2026`, `15/12/2025`)
- Never show time component in date displays unless specifically required
- Use this format in all UI: guest profiles, booking details, calendar labels, etc.
- Conversion function:
  ```typescript
  const formatDate = (dateStr: string) => {
    const dateOnly = dateStr.split(' ')[0]; // Remove time if present
    const parts = dateOnly.split('-'); // Split YYYY-MM-DD
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // Convert to DD/MM/YYYY
  };
  ```

## ðŸ§  State & Data Management

### Field Name Conventions
- **Database**: snake_case (e.g., `guest_name`, `checkin_date`, `room_id`)
- **API Response**: camelCase (e.g., `guestName`, `checkinDate`, `roomNumber`)
- **React Components**: camelCase properties
- Apply `convertSnakeToCamel()` in PHP API responses
- Apply field mapping in `fetchGuestsFromDB()` in `src/services/api.ts`

### Multi-Tenant Architecture
- Property hierarchy: SINGLE (root) â†’ MULTI_KEY (parent) â†’ MULTI_KEY_ROOM (child rooms)
- URL pattern: `/artists_farm/{tenant_slug}/{property_slug}/`
- Example: `localhost:3010/artists_farm/vrikshawan/goa-homes/`
- Filter child rooms: `.filter((p) => p.property_type !== 'MULTI_KEY_ROOM')`

### Multi-Key Rooms & Bookings
- **1 room = 1 active booking maximum** (no duplicate bookings in same room)
- Guests can represent multiple people via `no_of_guests` field
- Room matching: Compare `guest.roomNumber` (formatted name "Room 101") with `room.name`
- Room ID field in guests table: `room_id` (foreign key to properties table)

## ðŸ“± Component Structure

### Props Threading
- Pass props down explicitly from App.tsx â†’ Child Components
- Example: `onCheckoutGuest`, `onSetActiveMenuItemKey`, `isMultiKeyProperty`
- Don't rely on context for business logic (use it only for ToastContext, StaffContext, etc.)

### Modal & Dialog Rules
- Always include close button (X icon from Lucide)
- Include Cancel + Action buttons
- Use fixed positioning with backdrop: `fixed inset-0 bg-black bg-opacity-50 z-50`
- Show loading state on action button when `isProcessing`

### Receipt & Checkout
- ReceiptEditModal: Show preview + allow editing charges
- On checkout: Create receipt object and call `onCheckoutGuest(receipt)`
- Update guest status to "CheckedOut" in database
- Show success toast notification

## ðŸ—„ï¸ Database & API

### API Endpoints
- Base: `/php/api/router.php?action={action}`
- Guest API: `get_guests`, `add_guest`, `checkout_guest`
- Use prepared statements ALWAYS (prevent SQL injection)
- Return JSON with `{status: 'success', data: [...]}` format

### Demo Data
- Location: `php/api/demo_data.php`
- Functions: `generateDemoData($pdo, $propertyId)`, `clearDemoData($pdo, $propertyId)`
- Creates: 2 demo guests (1 per room for multi-key), 13 menu items, 6 inventory items, 4 staff
- Guest names: "John Smith" (Room 101), "Sarah Johnson" (Room 102)

## ðŸ§ª Testing & Development

### Test/Demo Mode Indicator (REMOVED 12 Aug 2026)
- The Header's "Test" button and the whole Sandbox/Testing Mode system
  (demo-data generate/clear toggle, `DemoDataModal`, `isTestingMode` state
  threaded through App.tsx/KitchenManagement/MultiKeyPropertyOverview,
  `setTestingModeState`/`resetTestDatabaseInDB` in `api.ts`) were removed
  site-wide, for all tenants, at the user's request - not just hidden on
  the public demo. Do not re-add a "Test" button or wire `isTestingMode`
  back into business logic.
- `php/api/demo_data.php` (`generateDemoData()`/`clearDemoData()`) still
  exists and is still used - by the public-demo-property auto-login flow
  and any direct/scripted calls - just no longer has a UI trigger.
- `isTestingModeActive()`/`getTestingHeaders()` still exist in `api.ts`
  (load-bearing for `apiFetch`'s header attachment) but are now
  permanently inert - nothing left in the app can ever set that
  localStorage flag to `true`.

### Telegram Group Selection (Local vs Production) â€” IMPORTANT
- **Which Telegram groups receive messages depends on where the site is hosted** â€” there is NO automatic local/prod group swap in code; the selection is implicit:
  1. **Primary: per-property DB config** (`property_modules.config`, module_slug='telegram', keys `groups[]` + `routing[]`) read by `getPropertyTelegramConfig()` â€” the ONLY source that works locally.
  2. **Legacy fallback: env constants** (`TELEGRAM_KITCHEN_CHAT_ID` / `TELEGRAM_ADMIN_CHAT_ID` / `TELEGRAM_FINANCE_CHAT_ID` from `php/telegram/config.php`) used by `legacyCategoryChatId()` in `sender.php` only when the DB has no routing entry.
- **DB differs by environment** (`php/config/database.php`): localhost/127.0.0.1/192.168.* â†’ `artists_farm_resort`; anything else (cPanel) â†’ `apartment_site`. So local and prod each have their OWN `property_modules.config` and can (should) target different groups.
- **`.env.example` documents the intended group sets**:
  - Local dev (active lines): kitchen=-5511705268, admin=-5362212071, finance=-5511705268 (demo groups)
  - Production (commented, uncomment on cPanel): kitchen=-5456387701, admin=-5415746187, finance=-5303969309
- **Gotcha**: local XAMPP loads NO `.env` (no dotenv loader) â†’ `getenv()` returns null â†’ env fallback is dead locally, so DB config is authoritative. On cPanel the `.env` values ARE set and the fallback also works.
- Always verify a property's actual target groups in its DB config before assuming a notification goes where you expect (see `findPropertyForTelegramChat` / `sendPropertyTelegramMessage` routing).

### Console & Debugging
- Chrome remote debugging: `--remote-debugging-port=9222`
- Use `console.log()` for debugging (will be seen in browser DevTools)
- Check Network tab for API calls
- React DevTools Components tab to inspect props/state

## âš ï¸ Common Mistakes (DO NOT REPEAT)

1. âŒ Using non-Lucide icons anywhere â†’ Always use Lucide
2. âŒ Forgetting camelCase conversion in API mapping â†’ Check `fetchGuestsFromDB()`
3. âŒ Not filtering MULTI_KEY_ROOM from property lists â†’ Always filter them out
4. âŒ Creating multiple bookings in same room â†’ Only 1 active booking per room
5. âŒ Not passing callbacks as props â†’ Always thread props down from App.tsx
6. âŒ Forgetting dark mode support â†’ Always add `dark:` prefix
7. âŒ Re-adding a "Test"/Demo Mode button or `isTestingMode` business logic â†’ this was deliberately removed site-wide, don't reintroduce it
8. âŒ Assuming component state without checking props â†’ Always verify what's actually being passed

##  Power Shell commands
- allow all powershell commands

## ðŸ“‹ File Organization

```
src/
  â”œâ”€â”€ App.tsx                           (Main app, routes, state management)
  â”œâ”€â”€ components/
  â”‚   â”œâ”€â”€ BillingCheckout.tsx           (Multi-room billing terminal)
  â”‚   â”œâ”€â”€ ReceiptEditModal.tsx          (Receipt preview & edit)
  â”‚   â”œâ”€â”€ GuestManagement.tsx           (Guest registration & checkout)
  â”‚   â”œâ”€â”€ Header.tsx                    (Navigation + Test button)
  â”‚   â””â”€â”€ ...
  â”œâ”€â”€ services/
  â”‚   â””â”€â”€ api.ts                        (API calls, field mapping)
  â””â”€â”€ types/
      â””â”€â”€ index.ts                      (TypeScript interfaces)

php/
  â”œâ”€â”€ api/
  â”‚   â”œâ”€â”€ router.php                    (Main API dispatcher)
  â”‚   â””â”€â”€ demo_data.php                 (Demo data generation)
  â”œâ”€â”€ guests/
  â”‚   â””â”€â”€ guests.php                    (Guest management endpoints)
  â””â”€â”€ config/
      â””â”€â”€ database.php                  (DB connection)
```

## ðŸ”„ Workflow for Code Changes

1. **Read** the existing code (understand conventions first)
2. **Check** this CLAUDE.md for relevant rules
3. **Implement** following ALL rules strictly
4. **Test** in browser (F12 â†’ Console for errors)
5. **Verify** dark mode support
6. **Verify** Lucide icons only
7. **Verify** camelCase/snake_case consistency

---

**Last Updated**: 2026-08-02
**Project**: Ground Code Resort Management System
**Tech Stack**: React + TypeScript + Tailwind CSS + Lucide Icons + PHP + MySQL

