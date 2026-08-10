# Artists Farm Resort - AI Project Rules & Conventions

This file documents ALL project conventions and rules. Every AI agent must follow these rules without exception.

## 🎨 UI & Design Rules

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

## 🧠 State & Data Management

### Field Name Conventions
- **Database**: snake_case (e.g., `guest_name`, `checkin_date`, `room_id`)
- **API Response**: camelCase (e.g., `guestName`, `checkinDate`, `roomNumber`)
- **React Components**: camelCase properties
- Apply `convertSnakeToCamel()` in PHP API responses
- Apply field mapping in `fetchGuestsFromDB()` in `src/services/api.ts`

### Multi-Tenant Architecture
- Property hierarchy: SINGLE (root) → MULTI_KEY (parent) → MULTI_KEY_ROOM (child rooms)
- URL pattern: `/artists_farm/{tenant_slug}/{property_slug}/`
- Example: `localhost:3010/artists_farm/vrikshawan/goa-homes/`
- Filter child rooms: `.filter((p) => p.property_type !== 'MULTI_KEY_ROOM')`

### Multi-Key Rooms & Bookings
- **1 room = 1 active booking maximum** (no duplicate bookings in same room)
- Guests can represent multiple people via `no_of_guests` field
- Room matching: Compare `guest.roomNumber` (formatted name "Room 101") with `room.name`
- Room ID field in guests table: `room_id` (foreign key to properties table)

## 📱 Component Structure

### Props Threading
- Pass props down explicitly from App.tsx → Child Components
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

## 🗄️ Database & API

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

## 🧪 Testing & Development

### Test/Demo Mode Indicator
- Test button in Header should show **visual indicator** when test mode is active
- Use checkmark icon ✓ or different background color to show status
- Example: "Test ✓" when enabled, "Test" when disabled

### Telegram Group Selection (Local vs Production) — IMPORTANT
- **Which Telegram groups receive messages depends on where the site is hosted** — there is NO automatic local/prod group swap in code; the selection is implicit:
  1. **Primary: per-property DB config** (`property_modules.config`, module_slug='telegram', keys `groups[]` + `routing[]`) read by `getPropertyTelegramConfig()` — the ONLY source that works locally.
  2. **Legacy fallback: env constants** (`TELEGRAM_KITCHEN_CHAT_ID` / `TELEGRAM_ADMIN_CHAT_ID` / `TELEGRAM_FINANCE_CHAT_ID` from `php/telegram/config.php`) used by `legacyCategoryChatId()` in `sender.php` only when the DB has no routing entry.
- **DB differs by environment** (`php/config/database.php`): localhost/127.0.0.1/192.168.* → `artists_farm_resort`; anything else (cPanel) → `apartment_site`. So local and prod each have their OWN `property_modules.config` and can (should) target different groups.
- **`.env.example` documents the intended group sets**:
  - Local dev (active lines): kitchen=-5511705268, admin=-5362212071, finance=-5511705268 (demo groups)
  - Production (commented, uncomment on cPanel): kitchen=-5456387701, admin=-5415746187, finance=-5303969309
- **Gotcha**: local XAMPP loads NO `.env` (no dotenv loader) → `getenv()` returns null → env fallback is dead locally, so DB config is authoritative. On cPanel the `.env` values ARE set and the fallback also works.
- Always verify a property's actual target groups in its DB config before assuming a notification goes where you expect (see `findPropertyForTelegramChat` / `sendPropertyTelegramMessage` routing).

### Console & Debugging
- Chrome remote debugging: `--remote-debugging-port=9222`
- Use `console.log()` for debugging (will be seen in browser DevTools)
- Check Network tab for API calls
- React DevTools Components tab to inspect props/state

## ⚠️ Common Mistakes (DO NOT REPEAT)

1. ❌ Using non-Lucide icons anywhere → Always use Lucide
2. ❌ Forgetting camelCase conversion in API mapping → Check `fetchGuestsFromDB()`
3. ❌ Not filtering MULTI_KEY_ROOM from property lists → Always filter them out
4. ❌ Creating multiple bookings in same room → Only 1 active booking per room
5. ❌ Not passing callbacks as props → Always thread props down from App.tsx
6. ❌ Forgetting dark mode support → Always add `dark:` prefix
7. ❌ Not showing Test mode status → Add visual indicator to Test button
8. ❌ Assuming component state without checking props → Always verify what's actually being passed

##  Power Shell commands
- allow all powershell commands

## 📋 File Organization

```
src/
  ├── App.tsx                           (Main app, routes, state management)
  ├── components/
  │   ├── BillingCheckout.tsx           (Multi-room billing terminal)
  │   ├── ReceiptEditModal.tsx          (Receipt preview & edit)
  │   ├── GuestManagement.tsx           (Guest registration & checkout)
  │   ├── Header.tsx                    (Navigation + Test button)
  │   └── ...
  ├── services/
  │   └── api.ts                        (API calls, field mapping)
  └── types/
      └── index.ts                      (TypeScript interfaces)

php/
  ├── api/
  │   ├── router.php                    (Main API dispatcher)
  │   └── demo_data.php                 (Demo data generation)
  ├── guests/
  │   └── guests.php                    (Guest management endpoints)
  └── config/
      └── database.php                  (DB connection)
```

## 🔄 Workflow for Code Changes

1. **Read** the existing code (understand conventions first)
2. **Check** this CLAUDE.md for relevant rules
3. **Implement** following ALL rules strictly
4. **Test** in browser (F12 → Console for errors)
5. **Verify** dark mode support
6. **Verify** Lucide icons only
7. **Verify** camelCase/snake_case consistency

---

**Last Updated**: 2026-08-02
**Project**: Artists Farm Resort Management System
**Tech Stack**: React + TypeScript + Tailwind CSS + Lucide Icons + PHP + MySQL
