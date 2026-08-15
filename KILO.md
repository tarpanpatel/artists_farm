# Kilo Agent Guidelines & Token-Optimization Rules

> **Project**: Ground Code Resort Management (Multi-Tenant Hospitality PMS & KDS)  
> **Tech Stack**: React 18, TypeScript, Tailwind CSS, Vite, PHP 8.2, MySQL (91 Tables, PDO)

---

## ⚡ Token-Saving & Output Directives (CRITICAL)

When working on this repository, strictly adhere to these rules to minimize token usage:

1. **Surgical Diffs Only**:
   - **NEVER output entire files** or full component rewrites.
   - Output only the specific function, JSX block, or unified diff with 2–3 lines of surrounding context.
2. **Zero Conversational Filler**:
   - Skip pleasantries, introductions, and verbose post-code explanations.
   - Provide only: File path -> Code diff / snippet -> 1-sentence rationale (if non-obvious).
3. **Direct File Targeting**:
   - Reference exact line numbers and component names (e.g., `BookingDetailsModal.tsx:L530-580`).

---

## 🏗️ Architecture & Conventions

### 1. Multi-Tenancy & Security
* **Tenant Isolation**: Every database read/write must validate `tenant_id` and `property_id`.
* **Roles**: `Super Admin` (tenant owner), `Root Admin` (platform owner), `Cashier`, `Receptionist`.
* **Endpoints**: Handled in `php/api/router.php`. Use prepared statements (`PDO::prepare`) for all queries.

### 2. UI & Component Standards
* **Modals & Overlays**: Must use `z-60` or higher to sit above the fixed Header (`z-57`) and Sidebar (`z-[56]`).
* **Styling**: Tailwind CSS with dark-mode tokens (`dark:bg-slate-800`, `dark:text-slate-200`, `dark:border-slate-700`).
* **Icons**: `lucide-react` only.
* **Touch Targets**: Minimum `44px` clickable hit area for mobile usability.
* **Loading States**: Gate empty states (`data.length === 0`) on `loading` flags (`inventoryLoading`, `ordersLoading`, `pettyCashLoading`) to prevent UI flash.

---

## 📂 Key Directory Map

```text
├── src/
│   ├── components/       # UI components, modals, and operational dashboards
│   │   ├── TodayOverview.tsx        # Multi-key 60-day visual occupancy calendar
│   │   ├── BookingDetailsModal.tsx  # Universal booking details & edit modal (z-60)
│   │   ├── GuestManagement.tsx      # Check-in/out, folios, guest IDs
│   │   ├── KitchenManagement.tsx    # KDS order tickets & kitchen POS
│   │   ├── StaffManagement.tsx      # Staff users, roles, and payee registry
│   │   ├── CashDrawerManager.tsx    # Cash shift sessions and reconciliations
│   │   └── TenantDashboard.tsx      # Root multi-tenant dashboard & property switcher
│   ├── contexts/         # State providers (Auth, Finance, Kitchen, Inventory, Modules)
│   ├── services/api.ts   # Client fetch functions & endpoints
│   └── types.ts          # Core TypeScript interface definitions
└── php/
    ├── api/router.php    # Central API router & action handlers
    ├── config/database.php # MySQL PDO connection & CORS headers
    └── database/         # Schema definitions & migrations
```

---

## 💬 Efficient Prompting Cheat-Sheet

* **Bug Fix**: `Fix [issue] in @file:line. Minimal diff only.`
* **New Feature**: `Add [feature] to @file. Follow existing Tailwind & TypeScript types. Output changed blocks only.`
* **DB Query**: `Write PDO query in php/api/router.php for [action] with tenant isolation.`
