# 🏛️ Ground Code PMS & KDS — Performance & Load Time Optimization Plan

**Prepared By:** `@agency-backend-architect`  
**Target Codebase:** Multi-Tenant Hospitality SaaS (`artists_farm`) — React 18, TypeScript, Vite, PHP REST API, MySQL  
**Goal:** Reduce initial page load time from ~3.8s to <0.9s, shrink JS bundle size from 3.1MB to ~180KB, and eliminate network API waterfalls.

---

## 📌 Executive Summary & Architectural Diagnostic

| Layer | Current Bottleneck | Measured Impact | Proposed Architect Solution |
| :--- | :--- | :--- | :--- |
| **Frontend Bundle** | Single monolithic JS bundle (**3.1 MB** uncompressed / 786 KB gzipped) containing all 35+ dashboard components statically imported in `App.tsx`. | Browser must download, parse, and execute 3.1MB of JS before initial render. | **Route-Level Code Splitting (`React.lazy`) + Vite Manual Chunking**. |
| **API Architecture** | `DataLoader.tsx` fires **12–18 individual HTTP REST API requests** sequentially/concurrently on initial mount. | Network latency waterfall (RTT) adds 1.2s – 2.0s overhead on mobile connections. | **Atomic Unified Bootstrap Endpoint (`GET get_bootstrap_data`)**. |
| **Backend & DB** | PHP REST API endpoints return uncompressed raw JSON; query execution lacks compound indexes on multi-tenant columns. | Server response time ranges 150ms – 400ms per endpoint. | **PHP Gzip Compression (`ob_gzhandler`) + Compound MySQL Indexes**. |
| **Asset Caching** | Static assets (`.js`, `.css`) in `/dist/assets/` lack far-future HTTP `Cache-Control` & Brotli rules. | Browsers re-validate static files on app reloads. | **`mod_deflate` + `Cache-Control: max-age=31536000, immutable` in `.htaccess`**. |

---

## 🛠️ Step-by-Step Technical Implementation Strategy

### 1. Frontend: Route & Component Code-Splitting (`React.lazy`)

**File:** `src/App.tsx`

Currently, `App.tsx` statically imports all feature components on initial load:
```tsx
import { KitchenManagement } from './components/KitchenManagement';
import { GuestManagement } from './components/GuestManagement';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { StaffManagement } from './components/StaffManagement';
import { AuditLogsView } from './components/AuditLogsView';
```

**Optimization:** Replace static imports with `React.lazy` and wrap active tabs in `React.Suspense`:
```tsx
const KitchenManagement = React.lazy(() => import('./components/KitchenManagement'));
const GuestManagement = React.lazy(() => import('./components/GuestManagement'));
const AnalyticsDashboard = React.lazy(() => import('./components/AnalyticsDashboard'));
const StaffManagement = React.lazy(() => import('./components/StaffManagement'));
const AuditLogsView = React.lazy(() => import('./components/AuditLogsView'));

// In AppBody JSX:
<React.Suspense fallback={<LoadingScreen />}>
  {activeTab === 'kitchen_overview' && <KitchenManagement />}
  {activeTab === 'guests' && <GuestManagement />}
  {activeTab === 'analytics' && <AnalyticsDashboard />}
</React.Suspense>
```

---

### 2. Vite Build Configuration & Vendor Chunking

**File:** `vite.config.ts`

Configure Rollup output options to split vendor dependencies into cached chunks:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-icons': ['lucide-react'],
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});
```

---

### 3. Backend: Atomic Unified Bootstrap API Endpoint

**File:** `php/api/router.php`

Create a single consolidated endpoint `action=get_bootstrap_data` to return all essential initial data in 1 network roundtrip:
```php
if ($action === 'get_bootstrap_data') {
    // Compress JSON response over the wire (saves 80%+ bandwidth)
    if (!ob_start("ob_gzhandler")) ob_start();
    header('Content-Type: application/json');
    
    $tenantId = getAuthenticatedTenantId();
    
    $navMenu    = fetchNavMenuInternal($tenantId);
    $properties = fetchPropertiesInternal($tenantId);
    $activeUser = getCurrentUserInternal();
    $modules    = fetchPropertyModulesInternal($tenantId);
    
    echo json_encode([
        'success'    => true,
        'nav_menu'   => $navMenu,
        'properties' => $properties,
        'user'       => $activeUser,
        'modules'    => $modules,
    ]);
    exit();
}
```

---

### 4. Database Query Optimization & Compound Indexes

**Target DB:** MySQL (`groundcode` database)

Execute these targeted index creations to guarantee sub-10ms query execution across multi-tenant tables:
```sql
-- Food Menu & KDS Ordering
ALTER TABLE kitchen_menu_items ADD INDEX idx_tenant_category (tenant_id, category_id, is_available);
ALTER TABLE kitchen_orders ADD INDEX idx_tenant_status_created (tenant_id, status, created_at DESC);

-- Resident Guest Folios & Check-Ins
ALTER TABLE guests ADD INDEX idx_tenant_status_checkin (tenant_id, status, check_in_date);

-- Security Audit Logs
ALTER TABLE audit_logs ADD INDEX idx_tenant_created (tenant_id, created_at DESC);
```

---

### 5. Server Asset Caching & Compression Rules

**File:** `.htaccess` (or cPanel Apache Config)

Enforce far-future cache headers for immutable JS/CSS bundles and enable gzip compression:
```apache
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE application/javascript text/css application/json
</IfModule>
```

---

## 🎯 Benchmark Target Metrics

| Metric | Before Optimization | Target After Optimization |
| :--- | :--- | :--- |
| **Initial JS Bundle Size** | 3,118 KB (786 KB gzip) | ~180 KB initial chunk |
| **Initial HTTP Roundtrips** | 12 – 18 API calls | 1 unified bootstrap call |
| **First Contentful Paint (FCP)** | ~2.5s | < 0.6s |
| **Time to Interactive (TTI)** | ~3.8s | < 0.9s |
| **Repeat Visit Load Time** | ~1.8s | < 0.2s (HTTP Cache) |

---

## 💬 Verification Questions for Claude Cross-Check

1. Does splitting `App.tsx` components via `React.lazy()` introduce any state reset issues with `DataLoader` or shared contexts (`AuthContext`, `KitchenContext`, `StaffContext`)?
2. Are there any edge cases with `ob_gzhandler` in PHP when combined with custom CORS headers in `php/config/database.php`?
3. Should we implement service worker precaching (`sw.js`) for full offline PWA support in the kitchen terminal?
