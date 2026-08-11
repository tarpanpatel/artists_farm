/**
 * API service helper for Artists Farm Resort PHP/MySQL backend.
 */

import { PropertyTelegramConfig } from '../types';

// Dynamically resolve the API base to handle subfolder deployment (e.g. /artists_farm/)
// On Vite dev server (ports 3000, 5173, 5174, 8080), the proxy handles /php routing, so _base must be empty.
// On production (XAMPP, cPanel), derive _base from the URL path by going up to the app root (/artists_farm/).
const _isDev = ['3000', '5173', '5174', '8080'].includes(window.location.port.toString());
const _base = _isDev ? '' : (() => {
  const path = window.location.pathname.replace(/#.*$/, '');
  const match = path.match(/^(.*?\/artists_farm)(\/|$)/);
  return match ? match[1] : '/artists_farm';
})();
const API_BASE = `${_base}/php/api/router.php`;
const UPLOAD_BASE = `${_base}/php/uploads/upload_image.php`;
// Shared, route-independent base path for anything under /php/ (e.g. telescopeLogger's
// error-reporting endpoint) - resolves correctly from any route (/root_dashboard/,
// /tenant_dashboard/, /{tenant}/{property}/{room}/, etc.), unlike deriving it from the
// current page's URL segments.
export const API_ROOT_BASE = _base;
// NOTE: API_KEY removed from frontend - use session auth instead (cookies)

// Path segments that are real app directories/routes, never a property slug.
const RESERVED_PATH_SEGMENTS = new Set(['php', 'dist', 'assets', 'icons', 'api', 'backups', 'node_modules', 'artists_farm', 'login', 'platform_property_management', 'tenant_dashboard', 'root_dashboard']);

/**
 * Identifies which property (e.g. "goa", "jaipur") this browser tab is on, mirroring the
 * priority order php/config/property_resolver.php uses server-side: an explicit
 * ?property_slug= query param first, then the URL path segment written by the
 * .htaccess multi-tenant rewrite. Falls back to 'default' when no slug is present
 * (e.g. the primary property served at the app root, or during local dev).
 * Used to namespace per-property browser storage (see AuthContext) so logging out
 * of one property's tab doesn't affect a tab open on a different property.
 */
export function getPropertySlug(): string {
  if (typeof window === 'undefined') return 'default';

  const pathname = window.location.pathname.replace(/#.*$/, '');
  
  // If we are on a reserved route, return that route name instead of checking query params
  if (pathname.includes('/root_dashboard/')) return 'root_dashboard';
  if (pathname.includes('/platform_property_management/')) return 'platform_property_management';
  if (pathname.includes('/tenant_dashboard/')) return 'tenant_dashboard';
  if (pathname.includes('/login/')) return 'login';

  const fromQuery = new URLSearchParams(window.location.search).get('property_slug');
  if (fromQuery) return fromQuery.toLowerCase();

  const segments = pathname.split('/').filter(Boolean).filter((seg) => !seg.includes('.'));

  // For URLs like /artists_farm/vrikshawan/resort-hut/ or /vrikshawan/resort-hut/
  // Property slug is the LAST valid segment (resort-hut)
  // Iterate backwards, skip reserved segments and tenant slug
  const validSegments: string[] = [];
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (!RESERVED_PATH_SEGMENTS.has(lower) && /^[a-z0-9_-]+$/.test(lower)) {
      validSegments.push(lower);
    }
  }

  // If we have 2 valid segments: [tenant, property] - return the property (last one)
  // If we have 1 valid segment: [property] - return it
  if (validSegments.length >= 1) {
    return validSegments[validSegments.length - 1];
  }

  return 'default';
}

/**
 * For MultiKey properties: get both property slug and optional room slug
 * URL: /artists_farm/{tenant}/{property}/{room_optional}
 * Returns: { propertySlug: "goa-home", roomSlug: "room101" or null }
 */
export function getPropertyAndRoomSlugs(): { propertySlug: string; roomSlug: string | null; tenantSlug: string | null } {
  if (typeof window === 'undefined') return { propertySlug: 'default', roomSlug: null, tenantSlug: null };

  const pathname = window.location.pathname.replace(/#.*$/, '');
  
  // If we are on a reserved route, return that route name instead of checking query params
  if (pathname.includes('/root_dashboard/')) return { propertySlug: 'root_dashboard', roomSlug: null, tenantSlug: null };
  if (pathname.includes('/platform_property_management/')) return { propertySlug: 'platform_property_management', roomSlug: null, tenantSlug: null };
  if (pathname.includes('/tenant_dashboard/')) return { propertySlug: 'tenant_dashboard', roomSlug: null, tenantSlug: null };
  if (pathname.includes('/login/')) return { propertySlug: 'login', roomSlug: null, tenantSlug: null };

  const fromQuery = new URLSearchParams(window.location.search).get('property_slug');
  if (fromQuery) return { propertySlug: fromQuery.toLowerCase(), roomSlug: null, tenantSlug: null };
  const segments = pathname.split('/').filter(Boolean).filter((seg) => !seg.includes('.'));

  const validSegments: string[] = [];
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (!RESERVED_PATH_SEGMENTS.has(lower) && /^[a-z0-9_-]+$/.test(lower)) {
      validSegments.push(lower);
    }
  }

  // validSegments format: [tenant, property] or [tenant, property, room] or [property] or [property, room]
  // We need to detect if last segment is a room or property
  // For now, assume: if we have 3+ segments, last is room, second-to-last is property
  // If we have 2 segments, could be [tenant, property] or [property, room]
  // If we have 1 segment, it's [property]

  if (validSegments.length >= 3) {
    // [tenant, property, room]
    return {
      tenantSlug: validSegments[validSegments.length - 3],
      propertySlug: validSegments[validSegments.length - 2],
      roomSlug: validSegments[validSegments.length - 1],
    };
  } else if (validSegments.length === 2) {
    // [tenant, property] - can't have [property, room] without at least 3 segments
    return {
      tenantSlug: validSegments[0],
      propertySlug: validSegments[1],
      roomSlug: null,
    };
  } else if (validSegments.length === 1) {
    return {
      tenantSlug: null,
      propertySlug: validSegments[0],
      roomSlug: null,
    };
  }

  return { propertySlug: 'default', roomSlug: null, tenantSlug: null };
}

/**
 * Get the selected room slug from URL hash (e.g., #room-101)
 * Used for hash-based routing within MultiKey property pages
 * Only returns room slugs, NOT tab names (dashboard, guests, etc.)
 * Returns null if no hash or hash is a reserved tab name
 */
export function getRoomSlugFromHash(validRoomSlugs?: string[]): string | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash.substring(1); // Remove leading #
  if (!hash || hash === 'overview') return null;

  // Reserved names that are NOT room slugs (tab names, etc.)
  const reserved = new Set([
    'dashboard', 'guests', 'kitchen', 'inventory', 'petty_cash', 'staff',
    'analytics', 'audit_logs', 'export', 'menu_manager', 'telegram', 'ical_sync'
  ]);

  if (reserved.has(hash.toLowerCase())) {
    return null;
  }

  // If validRoomSlugs provided, only accept hashes that match actual room slugs
  if (validRoomSlugs) {
    return validRoomSlugs.includes(hash) ? hash : null;
  }

  // Basic validation: room slugs are alphanumeric with hyphens
  if (/^[a-z0-9_-]+$/.test(hash)) {
    return hash;
  }

  return null;
}

/**
 * Navigate to a room in the current MultiKey property using hash routing
 * Usage: navigateToRoomHash('room-101') → sets URL hash to #room-101
 */
export function navigateToRoomHash(roomSlug: string | null): void {
  if (typeof window === 'undefined') return;

  if (roomSlug) {
    window.location.hash = roomSlug;
  } else {
    window.location.hash = '';
  }
}

export function isTestingModeActive(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('artists_farm_testing_mode') === 'true';
  }
  return false;
}

export function setTestingModeState(active: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('artists_farm_testing_mode', active ? 'true' : 'false');
    document.cookie = `artists_farm_testing_mode=${active ? '1' : '0'}; path=/; max-age=31536000`;
  }
}

export function getTestingHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };
  if (isTestingModeActive()) {
    headers['X-Testing-Mode'] = '1';
  }
  // NOTE: Removed API-Key header - use session auth (cookies) instead
  // Add X-Property-Slug header for multi-tenancy resolution on the backend
  headers['X-Property-Slug'] = getPropertySlug();
  return headers;
}

// In-memory cache for static catalog GET requests (30-second TTL)
const apiCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 30000;

// Whitelist of static catalog endpoints safe to cache
const CACHEABLE_ACTIONS = new Set([
  'get_material_categories',
  'get_misc_catalog',
  'get_expense_item_prices',
  'get_available_icons',
  'get_icon_search_tags',
  'get_system_roles'
]);

export function clearApiCache(actionPrefix?: string) {
  if (!actionPrefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.includes(actionPrefix)) {
      apiCache.delete(key);
    }
  }
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const customHeaders = (init?.headers as Record<string, string>) || {};
  const urlObj = new URL(url, window.location.origin);
  urlObj.searchParams.set('property_slug', getPropertySlug());
  const action = urlObj.searchParams.get('action') || '';
  const cacheKey = urlObj.toString();
  const isCacheable = method === 'GET' && CACHEABLE_ACTIONS.has(action);

  // Clear cache on write operations (POST, PUT, DELETE)
  if (method !== 'GET') {
    clearApiCache();
  }

  // Return cached response if available and fresh for whitelisted static GET requests
  if (isCacheable && apiCache.has(cacheKey)) {
    const entry = apiCache.get(cacheKey)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return new Response(JSON.stringify(entry.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      apiCache.delete(cacheKey);
    }
  }

  const response = await fetch(urlObj.toString(), {
    ...init,
    credentials: 'include',
    headers: getTestingHeaders(customHeaders),
  });

  if (isCacheable && response.ok) {
    try {
      const cloned = response.clone();
      const json = await cloned.json();
      apiCache.set(cacheKey, { timestamp: Date.now(), data: json });
    } catch {
      // Ignore JSON parse errors for non-JSON responses
    }
  }

  return response;
}

export const fetchCurrentProperty = async (): Promise<any | null> => {
  try {
    const response = await apiFetch(`${API_BASE}?action=get_current_property`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error("Error fetching current property:", error);
    return null;
  }
};

export async function resetTestDatabaseInDB(): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=reset_test_database`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    if (json.status === 'success') {
      return { success: true, message: json.message };
    } else {
      return { success: false, message: json.message || 'Server returned error status' };
    }
  } catch (err: any) {
    console.error('Failed to reset test database:', err);
    return { success: false, message: err?.message || 'Network or response parse error' };
  }
}

export interface StockRequestSheet {
  id: string;
  status: string;
  date: string;
  items: string[];
}

export async function fetchStockRequestsFromDB(): Promise<StockRequestSheet[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_stock_requests`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch stock requests from DB:', err);
  }
  return [];
}

export async function createStockRequestInDB(sheet: StockRequestSheet): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=create_stock_request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sheet),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to create stock request in DB:', err);
    return false;
  }
}

export async function updateStockRequestStatusInDB(id: string, status: string, items: string[]): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_stock_request_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, items }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update stock request status in DB:', err);
    return false;
  }
}

export async function fetchExpensesFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_petty_cash`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map(item => ({
        id: item.id || `pc-${Date.now().toString().slice(-4)}`,
        date: item.date || item.expense_date || new Date().toISOString().split('T')[0],
        costCategory: item.category || 'Other',
        category: item.category || 'Other',
        description: item.description || item.category || 'Operational Outflow',
        vendor: item.vendor || item.vendor_name || 'Manager',
        paidBy: item.vendor || item.vendor_name || 'Manager',
        amount: Number(item.amount) || 0,
        paymentMode: item.payment_mode || item.paymentMode || 'Cash',
        type: 'Expense'
      }));
    }
  } catch (err) {
    console.error('Failed to fetch expenses from DB:', err);
  }
  return [];
}

export async function addExpenseToDB(entry: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_petty_cash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add expense to DB:', err);
    return false;
  }
}

export async function updateExpenseInDB(entry: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_petty_cash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update expense in DB:', err);
    return false;
  }
}

export async function deleteExpenseFromDB(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_petty_cash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete expense from DB:', err);
    return false;
  }
}

function dataUriToBlob(dataUri: string): Blob {
  const [header, base64] = dataUri.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// Accepts a File directly (preferred - skips the base64 round-trip entirely)
// or a base64 data URI (for call sites that already hold one for a preview).
// Either way this sends multipart/form-data, not JSON - a base64 data URI is
// ~33% larger than the raw bytes, and json_decode()-ing that whole string
// server-side was a real, measured contributor to upload latency.
// Downscales an image client-side, before it ever crosses the network, so a
// multi-MB phone camera photo doesn't have to fully upload before the server
// gets a chance to resize it. Caps the long edge at maxDim (default matches
// the server's own id_documents target, so this isn't even doing redundant
// work - the server-side resize becomes a no-op for anything this already
// shrank). Never upscales, never crops (cropping is a deliberate per-folder
// choice the server makes for menu/catalog thumbnails - this only exists to
// avoid uploading more bytes than needed). Falls back to the original file
// on any error so a resize failure never blocks the upload itself.
export async function resizeImageFile(file: File, maxDim: number = 1600): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (width <= maxDim && height <= maxDim) {
      bitmap.close?.();
      return file; // already small enough - don't re-encode for no reason
    }
    const scale = maxDim / Math.max(width, height);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();
    // Preserve PNG (transparency) if that's what came in; everything else
    // becomes JPEG, which is what actually shrinks a multi-MB photo.
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mime, mime === 'image/jpeg' ? 0.9 : undefined)
    );
    if (!blob) return file;
    const newName = file.name.replace(/\.\w+$/, mime === 'image/png' ? '.png' : '.jpg');
    return new File([blob], newName, { type: mime });
  } catch (err) {
    console.error('Client-side image resize failed, uploading original file:', err);
    return file;
  }
}

export async function uploadImageDB(image: File | string, folder: 'menu' | 'catalog' | 'misc' | 'id_documents' = 'misc'): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('image', image instanceof File ? image : dataUriToBlob(image));
    formData.append('folder', folder);
    const res = await apiFetch(UPLOAD_BASE, {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();
    if (json.status === 'success' && json.url) {
      // json.url is built server-side from the backend's own SCRIPT_NAME, which
      // on this dev setup is the sibling `-ai2` folder the Vite proxy rewrites
      // requests into (e.g. /artists_farm-ai2/php/uploads/images/...) - not
      // reachable directly from the browser, since only /php/... and
      // /artists_farm/php/... are actually proxied. Re-root it onto the same
      // _base this frontend already uses for the upload request itself: '' in
      // dev (matches the /php proxy rule), '/artists_farm' in production
      // (where SCRIPT_NAME already matches _base and this is a no-op).
      const uploadsPath = json.url.replace(/^.*(\/php\/uploads\/.*)$/, '$1');
      return `${API_ROOT_BASE}${uploadsPath}`;
    }
    console.error('Image upload failed:', json.message);
    return null;
  } catch (err) {
    console.error('Failed to upload image:', err);
    return null;
  }
}

export async function fetchExpenseItemPricesFromDB(): Promise<Record<string, number>> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_expense_item_prices`);
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch expense item prices from DB:', err);
  }
  return {};
}

export async function fetchMaterialCategoriesFromDB(): Promise<{ id: number; name: string; is_ingredient: number }[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_material_categories`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch material categories:', err);
  }
  return [];
}

export async function toggleIngredientCategoryInDB(id: number, is_ingredient: boolean): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=toggle_ingredient_category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_ingredient }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to toggle ingredient category:', err);
    return false;
  }
}

export async function updateMaterialCategoryInDB(id: number, name: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_material_category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update material category:', err);
    return false;
  }
}

export async function deleteMaterialCategoryFromDB(id: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_material_category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete material category:', err);
    return false;
  }
}

export async function addMaterialCategoryToDB(name: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_material_category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add material category:', err);
    return false;
  }
}

export async function fetchMiscCatalogFromDB(): Promise<{ id: string | number; label: string; default_amount: number; category: string; description?: string }[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_misc_catalog`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch misc catalog from DB:', err);
  }
  return [];
}

export async function fetchWastageLogsFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_wastage_logs`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch wastage logs from DB:', err);
  }
  return [];
}

export async function createWastageLogDB(log: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=create_wastage_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to create wastage log in DB:', err);
    return false;
  }
}

export async function fetchKitchenPurchasesFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_kitchen_purchases`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch kitchen purchases from DB:', err);
  }
  return [];
}

export async function createKitchenPurchaseDB(purchase: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=create_kitchen_purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchase),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to create kitchen purchase in DB:', err);
    return false;
  }
}

export async function bulkUpdateKitchenPurchasesDB(payload: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=bulk_update_kitchen_purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to bulk update kitchen purchases in DB:', err);
    return false;
  }
}

export async function deleteKitchenPurchaseDB(payload: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_kitchen_purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete kitchen purchase in DB:', err);
    return false;
  }
}

export async function addCatalogItemDB(payload: { name: string; category: string; price?: number; packSize?: number; unit?: string; imagePath?: string }): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_catalog_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add catalog item to DB:', err);
    return false;
  }
}

export async function updateCatalogItemDB(payload: { id: number; name: string; category: string; price?: number; unit?: string; imagePath?: string }): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_catalog_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update catalog item in DB:', err);
    return false;
  }
}

export async function deleteCatalogItemDB(id: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_catalog_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete catalog item from DB:', err);
    return false;
  }
}

export async function bulkUpdateCatalogCategoryDB(payload: { ids: number[]; category: string }): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=bulk_update_catalog_category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to bulk update catalog categories in DB:', err);
    return false;
  }
}

export async function fetchGuestsFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_guests`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      const seenIds = new Set<string>();
      const seenKeys = new Set<string>();
      const result: any[] = [];

      for (const g of json.data) {
        const id = String(g.id || g.ID || '');
        const name = (g.guestName || g.guest_name || g.name || 'Guest').trim();
        const phone = (g.phoneNumber || g.phone_number || g.contact || '').trim();
        const checkin = (g.checkinDate || g.checkin_date || g.check_in || '').split(' ')[0];
        const room = (g.roomNumber || g.room_number || 'Unassigned').trim();

        // Filter out invalid/orphaned system placeholders ("Guest" or blank with no contact number)
        if ((name.toLowerCase() === 'guest' || name === '' || name.toLowerCase() === 'unassigned') && (!phone || phone.length < 10)) {
          continue;
        }

        // 1. Deduplicate by ID
        if (id && seenIds.has(id)) continue;

        // 2. Deduplicate by unique business key (name + phone + checkin + room)
        const uniqueKey = `${name.toLowerCase()}|${phone}|${checkin}|${room.toLowerCase()}`;
        if (phone && checkin && seenKeys.has(uniqueKey)) continue;

        if (id) seenIds.add(id);
        if (phone && checkin) seenKeys.add(uniqueKey);

        result.push({
          id: id || `g-${Date.now()}-${Math.random()}`,
          guestName: name,
          phoneNumber: phone,
          checkinDate: g.checkinDate || g.checkin_date || g.check_in || '',
          expectedCheckout: g.expectedCheckout || g.expected_checkout || '',
          checkoutDate: g.checkoutDate || g.checkout_date || g.check_out || '',
          roomNumber: room,
          roomId: g.roomId || g.room_id || null,
          status: g.status || 'Checked In',
          notes: g.notes || g.guestNotes || g.guest_notes || g.miscArrangements || g.misc_arrangements || '',
          bookingSource: g.bookingSource || g.booking_source || '',
          numberOfGuests: Number(g.noOfGuests || g.no_of_guests || g.total_guests || g.adults || 0),
          // add_guest/update_guest only ever write base_room_rent - per_night_charges
          // is a legacy column nothing populates, so it's always the string "0.00".
          // A plain `||` chain treats that as truthy (non-empty string) and masks the
          // real base_room_rent value, silently zeroing Room Rent on every refetch.
          // Parse to numbers and only fall through on an actual zero/missing value.
          roomRate: (parseFloat(g.perNightCharges ?? g.per_night_charges ?? '0') || 0)
            || (parseFloat(g.baseRoomRent ?? g.base_room_rent ?? '0') || 0),
          advanceAmount: Number(g.advancePaid || g.advance_paid || 0),
          advanceReceivedBy: g.advanceReceivedBy || g.advance_received_by || '',
          pendingAmount: Number(g.pendingAmount || g.pending_amount || 0),
          pendingReceivedBy: g.pendingReceivedBy || g.pending_received_by || '',
          foodBill: Number(g.totalFood || g.total_food || 0),
          totalAmount: Number(g.totalCharge || g.total_charge || 0),
          paymentStatus: g.paymentStatus || g.payment_status || g.status || 'Pending',
          idVerificationStatus: g.idVerificationStatus || g.id_verification_status || 'Pending',
          isForeignGuest: !!(g.isForeignGuest ?? g.is_foreign_guest),
          cFormFiledAt: g.cFormFiledAt || g.c_form_filed_at || null,
        });
      }

      return result;
    }
  } catch (err) {
    console.error('Failed to fetch guests from DB:', err);
  }
  return [];
}

export async function addGuestToDB(guest: {
  guest_name?: string;
  name?: string;
  phone_number?: string;
  checkin_date?: string;
  expected_checkout?: string;
  checkout_date?: string;
  room_number?: string;
  status?: string;
  notes?: string;
  booking_source?: string;
  no_of_guests?: number;
  base_room_rent?: number;
  advance_paid?: number;
  advance_received_by?: string;
  total_charge?: number;
  pending_amount?: number;
  pending_received_by?: string;
  is_foreign_guest?: boolean;
}): Promise<string | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guest),
    });
    const json = await res.json();
    if (json.status === 'success') {
      return json.id || null;
    }
  } catch (err) {
    console.error('Failed to add guest to DB:', err);
  }
  return null;
}

export async function updateGuestInDB(guest: {
  id: string;
  guest_name?: string;
  phone_number?: string;
  checkin_date?: string;
  expected_checkout?: string;
  room_id?: number;
  no_of_guests?: number;
  base_room_rent?: number;
  total_charge?: number;
  advance_paid?: number;
  advance_received_by?: string;
  pending_received_by?: string;
  booking_source?: string;
  notes?: string;
  is_foreign_guest?: boolean;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guest),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update guest in DB:', err);
    return false;
  }
}

export async function checkoutGuestInDB(guestId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=checkout_guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guestId }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to checkout guest in DB:', err);
    return false;
  }
}

// update_guest never writes the status column (it only touches booking
// details), so flipping a Booked guest to Checked In has to go through this
// dedicated action instead - see checkin_guest in guests.php.
export async function checkinGuestInDB(guestId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=checkin_guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guestId }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to check in guest in DB:', err);
    return false;
  }
}

export async function markCFormFiled(guestId: string, filed: boolean = true): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=mark_c_form_filed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guestId, filed }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update C-Form filing status:', err);
    return false;
  }
}

export async function deleteGuestFromDB(guestId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guestId }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete guest/booking in DB:', err);
    return false;
  }
}

export interface GuestIdDocument {
  id: number;
  guestIndex: number;
  filePath: string;
  uploadedAt: string;
}

export async function fetchIdDocumentsFromDB(guestId: string | number): Promise<GuestIdDocument[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_id_documents&guest_id=${guestId}`);
    const json = await res.json();
    return json.status === 'success' && Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    console.error('Failed to fetch ID documents:', err);
    return [];
  }
}

export async function saveIdDocumentToDB(guestId: string | number, guestIndex: number, filePath: string): Promise<{ success: boolean; message?: string; document?: GuestIdDocument }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=upload_id_document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id: guestId, guest_index: guestIndex, file_path: filePath }),
    });
    const json = await res.json();
    // Backend now returns the saved row directly - lets the caller update
    // local state without a separate re-fetch of the whole document list.
    return { success: json.status === 'success', message: json.message, document: json.data };
  } catch (err) {
    console.error('Failed to save ID document:', err);
    return { success: false, message: 'Network error while saving ID document' };
  }
}

export async function deleteIdDocumentFromDB(docId: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_id_document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: docId }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete ID document:', err);
    return false;
  }
}

export async function completeCheckinVerificationDB(guestId: string | number): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=complete_checkin_verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id: guestId }),
    });
    const json = await res.json();
    return { success: json.status === 'success', message: json.message };
  } catch (err) {
    console.error('Failed to complete check-in verification:', err);
    return { success: false, message: 'Network error while completing verification' };
  }
}

export async function fetchOrdersFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_orders`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data
        .map((o: any) => ({
          id: String(o.id || ''),
          guestId: String(o.guest_id || ''),
          guestName: (o.guest_name || 'Walk-in').trim(),
          roomNumber: (o.room_number || '').trim(),
          items: Array.isArray(o.items)
            ? o.items
                .filter((it: any) => (it.name || it.item_name) && Number(it.quantity) > 0)
                .map((it: any) => ({
                  id: it.id != null ? Number(it.id) : undefined,
                  name: (it.name || it.item_name || '').trim(),
                  quantity: Math.max(1, Number(it.quantity) || 1),
                  unitPrice: Math.max(0, Number(it.unit_price || it.price) || 0),
                  itemStatus: it.item_status || 'Pending',
                  readyAt: it.ready_at || null,
                  lastReminderAt: it.last_reminder_at || null,
                }))
            : [],
          status: o.status || 'Pending',
          orderTime: o.order_time || '',
          totalAmount: Math.max(0, Number(o.total_amount) || 0),
        }))
        .filter((o) => o.items.length > 0 || o.totalAmount > 0);
    }
  } catch (err) {
    console.error('Failed to fetch orders from DB:', err);
  }
  return [];
}

export async function updateOrderItemStatus(itemId: number, status: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_order_item_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, status }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update order item status:', err);
    return false;
  }
}

export async function updateItemReminderTimestamp(itemId: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_item_reminder_timestamp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update item reminder timestamp:', err);
    return false;
  }
}

export interface StaleReminderItem {
  item_id: number;
  order_id: string | number;
  dish_name: string;
  quantity: number;
  room_no: string;
  elapsed_minutes: number;
  item_index?: number;
}

export async function checkStaleReminders(thresholdMinutes: number): Promise<{ pending: StaleReminderItem[]; ready: StaleReminderItem[] }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=check_stale_reminders&threshold_minutes=${thresholdMinutes}`);
    const json = await res.json();
    if (json.status === 'success' && json.data) return json.data;
  } catch (err) {
    console.error('Failed to check stale reminders:', err);
  }
  return { pending: [], ready: [] };
}

export interface ServiceRequest {
  id: number;
  propertyId: number;
  roomId: number | null;
  roomName: string;
  requestType: string;
  description: string;
  requestedBy: string;
  status: 'Pending' | 'Fulfilled';
  createdAt: string;
  lastReminderAt: string | null;
  fulfilledAt: string | null;
  fulfilledBy: string | null;
  scheduledAt: string | null;
}

export interface StaleServiceRequestItem {
  id: number;
  request_type: string;
  description: string;
  requested_by: string;
  room_name: string;
  elapsed_minutes: number;
  scheduled_at: string | null;
}

export interface ServiceRequestType {
  id: number;
  propertyId: number;
  typeId: string;
  category: string;
  label: string;
  isSystemDefault: boolean;
  displayOrder: number;
}

export async function fetchServiceRequestTypesFromDB(propertyId?: number): Promise<ServiceRequestType[]> {
  try {
    const qs = propertyId ? `&property_id=${propertyId}` : '';
    const res = await apiFetch(`${API_BASE}?action=get_service_request_types${qs}`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch service request types:', err);
  }
  return [];
}

export async function saveServiceRequestTypeInDB(
  type: {
    type_id: string;
    category: string;
    label: string;
  },
  propertyId?: number,
): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=save_service_request_type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...type, ...(propertyId ? { property_id: propertyId } : {}) }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to save service request type:', err);
    return false;
  }
}

export async function deleteServiceRequestTypeInDB(id: number, propertyId?: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_service_request_type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...(propertyId ? { property_id: propertyId } : {}) }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete service request type:', err);
    return false;
  }
}

export async function fetchServiceRequestsFromDB(status?: string): Promise<ServiceRequest[]> {
  try {
    const qs = status ? `&status=${encodeURIComponent(status)}` : '';
    const res = await apiFetch(`${API_BASE}?action=get_service_requests${qs}`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch service requests:', err);
  }
  return [];
}

export async function createServiceRequestInDB(request: {
  room_id?: number | null;
  request_type: string;
  description?: string;
  requested_by: string;
  scheduled_at?: string | null;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=create_service_request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to create service request:', err);
    return false;
  }
}

export async function fulfillServiceRequestInDB(id: number, fulfilledBy: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=fulfill_service_request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fulfilled_by: fulfilledBy }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to fulfill service request:', err);
    return false;
  }
}

export async function updateServiceRequestReminderTimestamp(id: number): Promise<void> {
  try {
    await apiFetch(`${API_BASE}?action=update_service_request_reminder_timestamp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  } catch (err) {
    console.error('Failed to update service request reminder timestamp:', err);
  }
}

export async function checkStaleServiceRequests(thresholdMinutes: number): Promise<StaleServiceRequestItem[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=check_stale_service_requests&threshold_minutes=${thresholdMinutes}`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to check stale service requests:', err);
  }
  return [];
}

export async function fetchInventoryFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_inventory`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((i: any) => ({
        id: String(i.id || ''),
        name: i.name || i.item_name || '',
        category: i.category || 'General',
        categoryId: Number(i.category_id) || 1,
        currentStock: Number(i.quantity || i.current_stock) || 0,
        unit: i.unit || i.unit_label || 'Kg',
        minThreshold: Number(i.min_threshold) || 10,
        lastRestocked: i.last_restocked || '',
        costPerUnit: Number(i.cost_per_unit) || 0,
        imagePath: i.image_path || i.imageUrl || '',
      }));
    }
  } catch (err) {
    console.error('Failed to fetch inventory from DB:', err);
  }
  return [];
}

export async function updateInventoryStockInDB(id: string, quantity: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), quantity }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update inventory stock in DB:', err);
    return false;
  }
}

export async function fetchAttendanceFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_attendance`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((a: any) => ({
        id: String(a.id || ''),
        date: a.date || a.attendance_date || '',
        staffId: String(a.staffId || a.user_id || ''),
        staffName: a.staffName || 'Staff',
        status: a.status || 'Present',
      }));
    }
  } catch (err) {
    console.error('Failed to fetch attendance from DB:', err);
  }
  return [];
}

export async function fetchAuditLogsFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_audit_logs`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((l: any) => ({
        id: String(l.id || ''),
        timestamp: l.timestamp || '',
        user: l.user || 'System',
        action: l.action || '',
        ip_address: l.ip_address || '',
        browser: l.browser || '',
        os: l.os || '',
        device_type: l.device_type || 'desktop',
        status: l.status || 'Success',
        module: l.module || '',
        user_agent: l.user_agent || '',
      }));
    }
  } catch (err) {
    console.error('Failed to fetch audit logs from DB:', err);
  }
  return [];
}

export async function fetchReceiptsFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_receipts`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((r: any) => ({
        id: r.id || '',
        guestId: r.guest_id || '',
        guestName: r.guest_name || r.user || '',
        roomNumber: r.room_number || '',
        checkinDate: r.checkin_date || '',
        checkoutDate: r.checkout_date || '',
        roomRatePerNight: Number(r.room_rate_per_night || 0),
        nightsCount: Number(r.nights_count || 0),
        roomRent: Number(r.room_rent || 0),
        roomTotal: Number(r.room_total || 0),
        foodTotal: Number(r.food_total || 0),
        kitchenTotal: Number(r.kitchen_total || 0),
        miscTotal: Number(r.misc_total || 0),
        discount: Number(r.discount || 0),
        grandTotal: Number(r.grand_total || 0),
        advancePaid: Number(r.advance_paid || 0),
        paymentMethod: r.payment_method || 'Cash',
        status: r.status || 'Paid',
        paidAt: r.paid_at || r.timestamp || '',
        gstEnabled: r.gst_enabled == 1,
        gstRate: Number(r.gst_rate || 0),
        gstAmount: Number(r.gst_amount || 0),
        gstCgst: Number(r.gst_cgst || 0),
        gstSgst: Number(r.gst_sgst || 0),
        gstAccommodationRate: Number(r.gst_accommodation_rate || 0),
        gstFoodRate: Number(r.gst_food_rate || 0),
        gstAccommodationAmount: Number(r.gst_accommodation_amount || 0),
        gstFoodAmount: Number(r.gst_food_amount || 0),
        gstTaxType: r.gst_tax_type || 'cgst_sgst',
        gstIgst: Number(r.gst_igst || 0),
        guestGstin: r.guest_gstin || '',
        guestBillingName: r.guest_billing_name || '',
      }));
    }
  } catch (err) {
    console.error('Failed to fetch receipts from DB:', err);
  }
  return [];
}

export async function fetchMenuFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_menu`);
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    if (json && json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    // Return empty array gracefully if module disabled or network error
  }
  return [];
}

export async function addMenuItemDB(item: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_menu_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add menu item to DB:', err);
    return false;
  }
}

export async function updateMenuItemDB(id: number, updated: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_menu_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updated }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update menu item in DB:', err);
    return false;
  }
}

export async function deleteMenuItemDB(id: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_menu_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete menu item in DB:', err);
    return false;
  }
}

export async function dedupMenuDB(): Promise<{ removed: number, remaining: number }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=dedup_menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    return json.status === 'success' ? { removed: json.removed ?? 0, remaining: json.remaining ?? 0 } : { removed: 0, remaining: 0 };
  } catch (err) {
    console.error('Failed to dedup menu items:', err);
    return { removed: 0, remaining: 0 };
  }
}

export async function fetchNavMenuFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_nav_menu`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch nav menu from DB:', err);
  }
  return [];
}

// Returns the current property's modules with their enabled state (system_modules
// joined against property_modules, see php/modules/module_manager.php).
export async function fetchPropertyModulesFromDB(): Promise<{ slug: string; is_enabled: boolean }[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_property_modules`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      // Map API response to expected format (module_slug → slug, convert is_enabled to boolean)
      return json.data.map((mod: any) => ({
        slug: mod.module_slug || mod.slug,
        is_enabled: Boolean(mod.is_enabled),
      }));
    }
  } catch (err) {
    console.error('Failed to fetch property modules from DB:', err);
  }
  return [];
}

export async function saveNavMenuDB(items: any[]): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=save_nav_menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to save nav menu in DB:', err);
    return false;
  }
}

export async function fetchStaffUsersFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_users`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch staff users from DB:', err);
  }
  return [];
}

export async function addStaffUserDB(user: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add staff user to DB:', err);
    return false;
  }
}

export async function updateStaffUserDB(id: string, updated: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updated }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update staff user in DB:', err);
    return false;
  }
}

export async function deleteStaffUserDB(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete staff user in DB:', err);
    return false;
  }
}

export async function fetchPayeesFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_payees`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch payees from DB:', err);
  }
  return [];
}

export async function addPayeeDB(payee: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_payee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payee),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add payee to DB:', err);
    return false;
  }
}

export async function deletePayeeDB(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_payee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete payee in DB:', err);
    return false;
  }
}

export async function fetchStaffAdvancesFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_staff_advances`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch staff advances from DB:', err);
  }
  return [];
}

// Returns the DB-assigned id (staff_advances.id is an auto-increment column
// backing an existing table, not a client-generated one) on success, or null.
export async function addStaffAdvanceToDB(advance: {
  staffId: string;
  staffName: string;
  amount: number;
  date: string;
  month: string;
  reason: string;
  addedBy: string;
}): Promise<string | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_staff_advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(advance),
    });
    const json = await res.json();
    return json.status === 'success' ? String(json.id) : null;
  } catch (err) {
    console.error('Failed to add staff advance to DB:', err);
    return null;
  }
}

export async function deleteStaffAdvanceFromDB(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_staff_advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete staff advance in DB:', err);
    return false;
  }
}

export async function saveReceiptToDB(receipt: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=save_receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receipt),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to save receipt to DB:', err);
    return false;
  }
}

export async function sendTelegramAlertDB(payload: {
  eventType: string;
  category: string;
  message: string;
  replyMarkup?: any;
  templateKey?: string;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=send_telegram_alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to send Telegram alert via backend proxy:', err);
    return false;
  }
}

export async function fetchTelegramConfigDB(): Promise<PropertyTelegramConfig> {
  const fallback: PropertyTelegramConfig = { enabled: true, botToken: null, groups: [], routing: {} };
  try {
    const res = await apiFetch(`${API_BASE}?action=get_telegram_config`);
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      return { ...fallback, ...json.data, routing: json.data.routing || {} };
    }
  } catch (err) {
    console.error('Failed to fetch Telegram config from DB:', err);
  }
  return fallback;
}

export async function saveTelegramConfigDB(config: PropertyTelegramConfig): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=save_telegram_config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to save Telegram config to DB:', err);
    return false;
  }
}

// --- Zero-Friction Telegram Setup Wizard ---

export async function fetchTelegramBotIdentity(): Promise<{ username: string; name: string | null } | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_bot_identity`);
    const json = await res.json();
    return json.status === 'success' ? json.data : null;
  } catch (err) {
    console.error('Failed to fetch Telegram bot identity:', err);
    return null;
  }
}

export interface TelegramPairingStatus {
  status: 'pending' | 'paired' | 'confirmed' | 'expired' | 'not_found';
  chatId?: string | null;
  groupKey?: string;
  groupName?: string;
}

export async function generateTelegramPairingCode(groupKey: string, groupName: string): Promise<string | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=generate_pairing_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupKey, groupName }),
    });
    const json = await res.json();
    return json.status === 'success' ? json.code : null;
  } catch (err) {
    console.error('Failed to generate Telegram pairing code:', err);
    return null;
  }
}

export async function checkTelegramPairingStatus(code: string): Promise<TelegramPairingStatus> {
  try {
    const res = await apiFetch(`${API_BASE}?action=check_pairing_status&code=${encodeURIComponent(code)}`);
    const json = await res.json();
    if (json.status === 'success' && json.data) return json.data as TelegramPairingStatus;
  } catch (err) {
    console.error('Failed to check Telegram pairing status:', err);
  }
  return { status: 'not_found' };
}

export async function confirmTelegramPairing(code: string): Promise<{ success: boolean; chatId?: string; message?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=confirm_pairing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const json = await res.json();
    return { success: json.status === 'success', chatId: json.chatId, message: json.message };
  } catch (err) {
    console.error('Failed to confirm Telegram pairing:', err);
    return { success: false };
  }
}

export async function sendTelegramTestMessage(chatId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=send_telegram_test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    });
    const json = await res.json();
    return { success: json.status === 'success', message: json.message };
  } catch (err) {
    console.error('Failed to send Telegram test message:', err);
    return { success: false };
  }
}

export async function addAuditLogDB(log: {
  action: string;
  user?: string;
  user_id?: string;
  timestamp?: string;
  ip_address?: string;
  user_agent?: string;
  browser?: string;
  os?: string;
  device_type?: string;
  status?: string;
  module?: string;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_audit_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add audit log to DB:', err);
    return false;
  }
}

// Telegram template resolver — fetches from DB via manager.php and caches
let _templateCache: Record<string, string> | null = null;

export async function resolveTelegramTemplate(dbKey: string, variables: Record<string, string>): Promise<string | null> {
  try {
    if (!_templateCache) {
      const res = await apiFetch(`${API_ROOT_BASE}/php/telegram/manager.php?action=get_templates`);
      const json = await res.json();
      if (json.success && json.templates) {
        _templateCache = {};
        for (const key of Object.keys(json.templates)) {
          _templateCache[key] = json.templates[key].content;
        }
      }
    }
    if (_templateCache && _templateCache[dbKey]) {
      let msg = _templateCache[dbKey];
      for (const [varName, varValue] of Object.entries(variables)) {
        msg = msg.replace(new RegExp(`\\{${varName}\\}`, 'g'), varValue);
      }
      return msg;
    }
  } catch (err) {
    console.error('Failed to resolve Telegram template:', err);
  }
  return null;
}

export function invalidateTemplateCache() {
  _templateCache = null;
}

export interface DbTelegramTemplate {
  templateKey: string;
  title: string;
  category: string;
  description: string;
  content: string;
  variables: string[];
}

// Full template records (not just content) for the Templates Catalog editor -
// distinct from resolveTelegramTemplate's cached content-only lookup above,
// since the editor needs title/category/description/variables to render the
// catalog list and "Insert Available Variables" buttons, and must always hit
// the DB fresh (not the send-time cache) so newly saved edits show immediately.
export async function fetchTemplatesFromDB(): Promise<DbTelegramTemplate[]> {
  try {
    const res = await apiFetch(`${API_ROOT_BASE}/php/telegram/manager.php?action=get_templates`);
    const json = await res.json();
    if (json.success && json.templates) {
      return Object.keys(json.templates).map((key) => {
        const t = json.templates[key];
        return {
          templateKey: t.template_key || key,
          title: t.title || key,
          category: t.category || 'Uncategorized',
          description: t.description || '',
          content: t.content || '',
          variables: (t.available_variables || '')
            .split(',')
            .map((v: string) => v.trim())
            .filter((v: string) => v.length > 0),
        };
      });
    }
  } catch (err) {
    console.error('Failed to fetch Telegram templates from DB:', err);
  }
  return [];
}

// =========================================================================
// CASH DRAWER API
// =========================================================================

export async function fetchCashDrawerSummaryFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_cash_drawer_summary`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch cash drawer summary:', err);
  }
  return [];
}

export async function addDrawerEntryToDB(entry: {
  staff_id: string;
  staff_name: string;
  type: string;
  amount: number;
  handed_to?: string;
  notes?: string;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_drawer_entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add drawer entry:', err);
    return false;
  }
}

export async function fetchDrawerEntriesFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_drawer_entries`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch drawer entries:', err);
  }
  return [];
}

// DB stores served_at as "YYYY-MM-DD HH:MM:SS" - normalize to the app's
// DD/MM/YYYY display format, keeping the time since a kitchen serve log is a
// timestamp, not just a date.
const formatServedAt = (dt: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(dt || '');
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : dt;
};

export async function fetchServedLogsFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_served_logs`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((item: any) => ({
        id: String(item.id ?? ''),
        orderId: item.order_id ?? '',
        itemName: item.item_name ?? '',
        quantity: Number(item.quantity ?? 1),
        servedBy: item.served_by ?? '',
        guestName: item.guest_name ?? '',
        roomNumber: item.room_number ?? '',
        servedAt: formatServedAt(item.served_at ?? ''),
      }));
    }
  } catch (err) {
    console.error('Failed to fetch served logs:', err);
  }
  return [];
}

export async function addServedLogToDB(log: {
  order_id: string;
  item_name: string;
  quantity: number;
  served_by: string;
  guest_name: string;
  room_number: string;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_served_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add served log:', err);
    return false;
  }
}

export async function saveAttendanceToDB(records: any[]): Promise<boolean> {
  try {
    for (const rec of records) {
      await apiFetch(`${API_BASE}?action=log_attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: rec.date,
          staffId: rec.staffId,
          status: rec.status,
          marked_by: 'Admin',
        }),
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to save attendance:', err);
    return false;
  }
}

export async function generateSalaryEntry(data: {
  staffId: string;
  staffName: string;
  amount: number;
  month: string;
  description: string;
}): Promise<boolean> {
  try {
    // Create PettyCash entry
    const pet = await apiFetch(`${API_BASE}?action=add_petty_cash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: data.month + '-01',
        category: 'Salaries',
        description: data.description,
        amount: data.amount,
        paymentMode: 'Bank Transfer',
        vendor: data.staffName,
        paidBy: 'Admin',
        type: 'Expense',
      }),
    });
    const petJson = await pet.json();
    // Post to financial ledger
    await apiFetch(`${API_BASE}?action=record_salary_payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_id: `salary-${data.staffId}-${data.month}`,
        staff_id: data.staffId,
        staff_name: data.staffName,
        amount: data.amount,
        description: data.description,
        payment_method: 'Bank Transfer',
      }),
    });
    return petJson.status === 'success';
  } catch (err) {
    console.error('Failed to generate salary entry:', err);
    return false;
  }
}

export async function fetchFinancialLedger(month: string): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_financial_ledger&month=${month}`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch financial ledger:', err);
  }
  return [];
}

export async function recordOutOfPocketCredit(entry: {
  staff_id: string;
  staff_name: string;
  amount: number;
  description?: string;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=record_out_of_pocket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to record out-of-pocket credit:', err);
    return false;
  }
}

export async function fetchRecipesFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_recipes`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch recipes:', err);
  }
  return [];
}

export async function saveRecipeToDB(recipe: {
  menuItemId: number;
  recipeName: string;
  yieldFactor: number;
  servings: number;
  ingredients: { id: string; name: string; quantity: number; unit: string; costPerUnit: number }[];
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=save_recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to save recipe:', err);
    return false;
  }
}

export async function deleteRecipeFromDB(menuItemId: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuItemId }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete recipe:', err);
    return false;
  }
}

export async function depleteStockForDish(menuItemId: number, quantity: number): Promise<any> {
  try {
    const res = await apiFetch(`${API_BASE}?action=deplete_stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuItemId, quantity }),
    });
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('Failed to deplete stock:', err);
    return { status: 'error', message: String(err) };
  }
}

export interface StaffMealOption {
  id: number;
  name: string;
  cost: number;
}

export async function fetchStaffMealOptionsFromDB(): Promise<StaffMealOption[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_staff_meal_options`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((o: any) => ({ id: Number(o.id), name: o.name, cost: Number(o.cost) || 0 }));
    }
  } catch (err) {
    console.error('Failed to fetch staff meal options:', err);
  }
  return [];
}

export async function addStaffMealOptionToDB(name: string, cost: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_staff_meal_option`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cost }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add staff meal option:', err);
    return false;
  }
}

export interface StaffMealLog {
  date: string;
  staff: string;
  food: string;
  hasTag: boolean;
}

export async function fetchStaffMealLogsFromDB(): Promise<StaffMealLog[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_staff_meal_logs`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((row: any) => {
        const d = new Date((row.logged_at || '').replace(' ', 'T'));
        const date = isNaN(d.getTime())
          ? row.logged_at
          : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        return {
          date,
          staff: row.staff_names,
          food: row.food_description,
          hasTag: !!Number(row.is_leftover_buffer),
        };
      });
    }
  } catch (err) {
    console.error('Failed to fetch staff meal logs:', err);
  }
  return [];
}

export async function addStaffMealLogToDB(staffNames: string, foodDescription: string, isLeftoverBuffer: boolean): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_staff_meal_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_names: staffNames, food_description: foodDescription, is_leftover_buffer: isLeftoverBuffer }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add staff meal log:', err);
    return false;
  }
}

