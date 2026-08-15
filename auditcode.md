# 🔍 Web Application Code Review & Architecture Audit (`auditcode.md`)

> **Application**: Ground Code Resort Management (Multi-Tenant Hospitality PMS & KDS)  
> **Target Scope**: Live Web App Only (`src/` React Frontend + `php/` Runtime REST APIs)  
> **Conducted by**: `agency-code-reviewer`  
> **Audit Date**: 14 August 2026

---

## 🌟 Web App Quality Assessment

The core web application is **robust, feature-complete, and well-tailored to multi-tenant resort workflows**. Key operational flows—such as the KDS kitchen order lifecycle, 60-day occupancy calendar, cash shift reconciliation, and dynamic guest folios—are mature and responsive.

This audit focuses **strictly on the live webapp runtime** (72 UI components, 6 React contexts, API service layer, and backend API routing).

---

## 🚦 Live Webapp Findings Matrix

| Priority | Issue Count | Web App Area | Impact |
| :--- | :---: | :--- | :--- |
| 🔴 **Blockers (Must Fix)** | **3** | Runtime Crash in iCal, TS Strict Error, API Header Security | Immediate user-facing impact or security vulnerability |
| 🟡 **Suggestions (Should Fix)** | **4** | Monolith API Routing, Dynamic Import Optimization, API Error Masking, Base64 Bloat | Performance, maintainability, and user feedback clarity |
| 💭 **Nits (Nice to Have)** | **3** | SPA State Refreshes vs Page Reloads, Unused Imports, Modal Transitions | Visual polish and code hygiene |

---

## 🔴 1. Critical Webapp Blockers (Must Fix)

### Blocker 1: Runtime `ReferenceError` Crash on Copying iCal Feed URL
* **Component**: [src/components/ICalSyncManager.tsx:L738-L741](file:///c:/xampp/htdocs/artists_farm/src/components/ICalSyncManager.tsx#L738-L741)
* **What Happens**: In the iCal Sync tab, clicking the "Copy" button on any room export URL immediately throws an unhandled JavaScript `ReferenceError: copyToClipboard is not defined` / `isCopied is not defined`, crashing the React render tree for the user.
* **Root Cause**: The helper function and copy state were never declared inside the component.
* **Drop-in Solution**:
  ```tsx
  // Add state inside ICalSyncManager.tsx:
  const [copiedRoomId, setCopiedRoomId] = useState<number | null>(null);

  const copyToClipboard = async (text: string, roomId?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      if (roomId) setCopiedRoomId(roomId);
      showToast('Export URL copied to clipboard!', { type: 'success' });
      setTimeout(() => setCopiedRoomId(null), 2000);
    } catch {
      showToast('Failed to copy URL', { type: 'error' });
    }
  };

  // Update button render (Line 741):
  <button onClick={() => copyToClipboard(roomExportUrl, room.id)}>
    {copiedRoomId === room.id ? t('copied_button', 'Copied') : t('copy_button', 'Copy')}
  </button>
  ```

---

### Blocker 2: TypeScript Compiler Error in Service Request Types
* **Component**: [src/components/ServiceRequestTypesManager.tsx:L144-L153](file:///c:/xampp/htdocs/artists_farm/src/components/ServiceRequestTypesManager.tsx#L144-L153)
* **What Happens**: Passing an `id` property to `saveServiceRequestTypeInDB()` fails TypeScript compilation (`TS2353: Object literal may only specify known properties`).
* **Root Cause**: `api.ts`'s type signature for `saveServiceRequestTypeInDB` only accepts `{ type_id, category, label }`.
* **Drop-in Solution**:
  ```tsx
  // In ServiceRequestTypesManager.tsx:
  await saveServiceRequestTypeInDB(
    {
      type_id: rt.typeId,
      category: editingCategory.trim(),
      label: editingLabel.trim(),
    },
    Number(selectedPropertyId)
  );
  ```

---

### Blocker 3: Client Header Bypass on Tenant Authorization
* **Backend Endpoint**: [php/api/router.php:L443-L453](file:///c:/xampp/htdocs/artists_farm/php/api/router.php#L443-L453)
* **What Happens**: `isTenantAccessAllowed()` reads the unauthenticated request header `HTTP_X_ADMIN_USERNAME`. If set to any root admin username, it grants full root admin cross-tenant bypass without validating session cookies or passcodes.
* **Root Cause**: A temporary fallback added for local proxying was left active in production routing.
* **Drop-in Solution**:
  - Remove lines 441–453 in `php/api/router.php`. Authorization must derive **strictly** from verified `$_SESSION['is_platform_admin']`.

---

## 🟡 2. Performance & Architecture Suggestions

### Suggestion 1: Vite Bundle Optimization (Eliminate Duplicate Imports)
* **Components**: `src/components/CustomCSSOverride.tsx`, `src/components/BillingCheckout.tsx`
* **Observation**: `lucide-react` and `GuestManagement.tsx` are dynamically imported in child modals while already statically bundled in `App.tsx`.
* **Impact**: Vite emits `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings because the code is already pulled into the main chunk, preventing real bundle splitting.
* **Solution**: Use direct static imports for shared icons and subcomponents.

---

### Suggestion 2: API Client Error Feedback vs. Silent Empty Fallbacks
* **Service**: [src/services/api.ts](file:///c:/xampp/htdocs/artists_farm/src/services/api.ts)
* **Pattern**: When backend fetches fail (e.g. 500 error or network disconnect), catch blocks log to `console.error` and return `[]` or `null`.
* **User Impact**: The webapp displays a false "No records found" empty state instead of alerting the user that the server was unreachable.
* **Solution**: Propagate error states or trigger `showToast('Network error, please retry', { type: 'error' })`.

---

### Suggestion 3: Decomposing the 2,773-Line `router.php` Dispatcher
* **Backend**: [php/api/router.php](file:///c:/xampp/htdocs/artists_farm/php/api/router.php)
* **Observation**: Modular handlers already exist for `php/guests/`, `php/billing/`, and `php/kitchen/`. However, `router.php` still contains ~1,500 lines of inline tenant CRUD, staff updates, and license management.
* **Solution**: Extract tenant actions into `php/tenants/tenants.php` and staff actions into `php/staff/staff_router.php`, keeping `router.php` strictly as a ~250-line dispatcher.

---

### Suggestion 4: Dish Image Storage (Base64 Database Bloat)
* **Component**: `src/components/MenuManager.tsx` / `menu_items` table
* **Observation**: Storing Base64 image strings directly in MySQL inflates `menu_items` to 1.55 MB for only 145 items.
* **Solution**: Upload image files to `php/uploads/menu/` via multipart upload and store relative URLs in the database.

---

## 💭 3. UX & Cleanliness Nits

1. **SPA Native Updates vs. `window.location.reload()`**:
   - In `TenantDashboard.tsx` and `StaffManagement.tsx`, several modal callbacks trigger a full browser reload. Using context refresh methods (`refreshProperties()`, `refreshStaff()`) provides an instant, smooth SPA transition.
2. **Unused Imports Cleanup**:
   - Clean up unused icon imports (e.g. `Share2` in `ICalSyncManager.tsx`).
3. **Session Cookie Security Transport**:
   - Add `secure` and `SameSite=Lax` parameters to `setcookie()` in `authenticate.php` and `router.php`.

---

## 🏆 Verified Positive Webapp Patterns

1. **Self-Healing Demo Data**: `reconcileDemoGuestStatuses()` in `guests.php` prevents stale checkout state automatically.
2. **Synchronous Calendar Alignment**: `TodayOverview.tsx` using `useLayoutEffect` + `scrollIntoView` delivers smooth initial calendar positioning.
3. **SQL Injection Defense**: 100% of runtime webapp queries use parameterized PDO statements (`$pdo->prepare`).
4. **Lightweight CSRF Layer**: `CSRFHandler::validateRequest()` effectively protects all state-changing webapp mutations.

---

## 📋 Web App Fix Checklist

- [ ] **Step 1**: Fix `copyToClipboard` in [ICalSyncManager.tsx](file:///c:/xampp/htdocs/artists_farm/src/components/ICalSyncManager.tsx#L738).
- [ ] **Step 2**: Remove extra `id` in [ServiceRequestTypesManager.tsx](file:///c:/xampp/htdocs/artists_farm/src/components/ServiceRequestTypesManager.tsx#L146).
- [ ] **Step 3**: Remove `X-Admin-Username` header check in [router.php](file:///c:/xampp/htdocs/artists_farm/php/api/router.php#L443).
- [ ] **Step 4**: Verify clean compilation via `npx tsc --noEmit` and `npm run build`.
