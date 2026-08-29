/**
 * API service helper for Ground Code Resort PHP/MySQL backend.
 */

import { PropertyTelegramConfig } from '../types';

// This site has never actually been deployed under an /artists_farm/
// subfolder (see .htaccess RewriteBase, index.php, and every other place
// this exact assumption was already stripped out this session) - the API is
// always at the domain root (/php/api/router.php), regardless of whatever
// virtual frontend route the current page happens to be on. _base therefore
// no longer derives from window.location.pathname at all: it used to
// preserve a literal "/artists_farm" prefix whenever the CURRENT page's own
// URL contained that segment (e.g. App.tsx's own root-admin redirects target
// "/artists_farm/root_dashboard/") - producing API_BASE values like
// "/artists_farm/php/api/router.php", which doesn't exist, silently caught
// by .htaccess's catch-all rewrite and served index.html's HTML instead of
// JSON (surfacing as "Unexpected token '<'... is not valid JSON", and, for
// the CSRF token fetch specifically, a silently-empty token that made every
// write from that page fail with "CSRF token missing" instead).
const _base = (typeof window !== 'undefined' && window.location.pathname.startsWith('/artists_farm')) ? '/artists_farm' : '';
const API_BASE = `${_base}/php/api/router.php`;
const UPLOAD_BASE = `${_base}/php/uploads/upload_image.php`;
const DOCUMENT_UPLOAD_BASE = `${_base}/php/uploads/upload_document.php`;
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
 * Fetch every configured iCal calendar for a property, scoped by the given
 * property slug. Talks to ical_sync.php directly (like ICalSyncManager.tsx
 * already does), not through router.php's API_BASE dispatcher. The backend
 * (ICalSyncManager::getICalSyncs in php/api/ical_sync.php) automatically
 * expands scope to every MULTI_KEY_ROOM child of this property, so passing
 * the PARENT property's slug here (getPropertyAndRoomSlugs().propertySlug,
 * not getPropertySlug()/the current room's own slug) is what makes this
 * correctly reflect "any room in this property has a calendar configured"
 * regardless of which specific room page is currently open.
 */
export async function fetchIcalCalendarsFromDB(propertySlug: string): Promise<{ id: number; service_name: string }[]> {
  try {
    const res = await fetch('/php/api/ical_sync.php?action=get_ical_syncs', {
      credentials: 'include',
      headers: { 'X-Property-Slug': propertySlug },
    });
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch iCal calendars from DB:', err);
  }
  return [];
}

/**
 * Sync every given calendar id, same one-at-a-time loop as ICalSyncManager's
 * own "Sync All" button. Returns how many succeeded so the caller can report
 * a summary toast.
 */
export async function syncAllIcalCalendarsInDB(propertySlug: string, calendarIds: number[]): Promise<{ successCount: number; total: number }> {
  let successCount = 0;
  for (const id of calendarIds) {
    try {
      const formData = new FormData();
      formData.append('id', String(id));
      const res = await fetch('/php/api/ical_sync.php?action=sync_ical_events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Property-Slug': propertySlug },
        body: formData,
      });
      const json = await res.json();
      if (json.status === 'success') successCount++;
    } catch (err) {
      console.error('Failed to sync iCal calendar:', id, err);
    }
  }
  return { successCount, total: calendarIds.length };
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
    'analytics', 'audit_logs', 'export', 'menu_manager', 'telegram', 'ical_sync',
    'licenses', 'license_management'
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

// CSRF token cache (see php/security/csrf_handler.php + the get_csrf_token
// action wired into router.php). Session-scoped, not per-request - fetched
// once and reused for every write until the server says it's stale.
let cachedCsrfToken: string | null = null;
let csrfTokenPromise: Promise<string | null> | null = null;

async function fetchCsrfToken(): Promise<string | null> {
  try {
    // Deliberately NOT apiFetch() - that would recurse back into this same
    // token-attachment logic for the GET request that's supposed to fetch it.
    const urlObj = new URL(API_BASE, window.location.origin);
    urlObj.searchParams.set('action', 'get_csrf_token');
    urlObj.searchParams.set('property_slug', getPropertySlug());
    const res = await fetch(urlObj.toString(), { credentials: 'include', headers: getTestingHeaders() });
    const json = await res.json();
    return json?.token ?? null;
  } catch {
    return null;
  }
}

async function getCsrfToken(): Promise<string | null> {
  if (cachedCsrfToken) return cachedCsrfToken;
  // Multiple concurrent writes on first load must not each fire their own
  // token fetch - share the one in-flight request.
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetchCsrfToken().finally(() => { csrfTokenPromise = null; });
  }
  cachedCsrfToken = await csrfTokenPromise;
  return cachedCsrfToken;
}

// SECURITY (12 Aug 2026): CSRF token attachment lives here, patched onto the
// global fetch, rather than only inside apiFetch() below - a repo-wide audit
// found ~49 raw fetch('.../router.php', ...) calls across 17 components that
// bypass apiFetch() entirely (PlatformPropertyManagement, TenantDashboard,
// CustomCSSOverride, ICalSyncManager, ...). Rewriting every one of those call
// sites individually to attach the header was the "correct" fix but far too
// large a surface to change safely in one pass without being able to
// exercise each flow. Patching fetch itself protects all of them - existing
// and any added later - without touching their request bodies/logic at all;
// it only ever adds a header. get_csrf_token and GET requests are excluded
// so this can never recurse into itself.
function isCsrfProtectedRequest(urlStr: string, method: string): boolean {
  if (method === 'GET' || !urlStr.includes('/php/api/router.php')) return false;
  try {
    const action = new URL(urlStr, window.location.origin).searchParams.get('action') || '';
    return action !== 'get_csrf_token';
  } catch {
    return true;
  }
}

if (typeof window !== 'undefined' && !(window as any).__csrfFetchPatched) {
  (window as any).__csrfFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method || (input instanceof Request ? input.method : undefined) || 'GET').toUpperCase();
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!isCsrfProtectedRequest(urlStr, method)) {
      return nativeFetch(input, init);
    }

    const withToken = async (): Promise<RequestInit | undefined> => {
      const token = await getCsrfToken();
      if (!token) return init;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('X-CSRF-Token', token);
      return { ...init, headers };
    };

    let response = await nativeFetch(input, await withToken());

    // Token can be stale (server restart clears sessions, or the 1h
    // lifetime in csrf_handler.php elapsed) -> 403 "invalid or expired".
    // It can also simply be MISSING if the very first fetchCsrfToken() call
    // of the page load hit a transient network blip and cachedCsrfToken
    // stayed null -> csrf_handler.php returns 400 "CSRF token missing" in
    // that case, a status this block didn't retry on before, so the very
    // first write of a session (e.g. Delete Property) could fail outright
    // with no visible recovery. Both are the same underlying problem - no
    // valid token was attached - so both get one silent refetch-and-retry.
    if (response.status === 403 || response.status === 400) {
      try {
        const body = await response.clone().json();
        const message = (body?.error || body?.message || '');
        if (typeof message === 'string' && message.toLowerCase().includes('csrf')) {
          cachedCsrfToken = null;
          response = await nativeFetch(input, await withToken());
        }
      } catch {
        // Not a JSON CSRF error body - leave the original response as-is.
      }
    }

    return response;
  };
}

// propertySlugOverride (26 Aug 2026): every request normally carries the CURRENTLY-OPEN property's
// slug, which is right for the whole tenant-facing app. Root Admin screens are the exception - they
// act ON a property without having it open (e.g. generating Telegram pairing deep links for any
// property from the Root Dashboard), and the backend resolves scope from this exact param. Opt-in
// on purpose rather than "respect any property_slug already in the URL": one existing call site
// (MultiKeyPropertyOverview.tsx's get_staff) passes one today and has always had it silently
// overwritten here, so honouring it implicitly would quietly change that call's behaviour too.
export async function apiFetch(url: string, init?: RequestInit, propertySlugOverride?: string): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const customHeaders = (init?.headers as Record<string, string>) || {};
  const urlObj = new URL(url, window.location.origin);
  urlObj.searchParams.set('property_slug', propertySlugOverride || getPropertySlug());
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

  // CSRF token attachment happens transparently inside the patched
  // window.fetch above - nothing else to do here.
  const response = await fetch(urlObj.toString(), {
    ...init,
    credentials: 'include',
    headers: getTestingHeaders(customHeaders),
  });

  // Found 21 Aug 2026, directly downstream of finally fixing "Sign Out
  // Terminal" (see router.php's 'logout' case): a real session ending -
  // now that it can actually happen - left the frontend showing a stale
  // "logged in" shell (cached property/user data still in component state)
  // while every real data fetch silently 401'd in the background, with no
  // redirect back to the login screen. login_user/check_session are
  // excluded - a 401 there is either a wrong-credentials response (handled
  // by the caller directly, not this generic path) or would just be noise
  // during the check that's ABOUT to tell AuthContext it's unauthenticated
  // anyway. AuthContext.tsx owns the actual localStorage-clearing logic
  // (single source of truth for those keys) - this only signals it.
  if (response.status === 401 && action !== 'login_user' && action !== 'check_session') {
    window.dispatchEvent(new Event('artists_farm_session_expired'));
  }

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

// Shared implementation behind uploadImageDB/uploadImageDBVerbose below -
// returns the real failure reason (server message, HTTP status, or the
// caught exception) instead of only console.error-ing it and discarding it.
// uploadImageDB's plain string|null signature has 5 call sites across the
// app and stays untouched; uploadImageDBVerbose exists so screens that
// actually show the failure to an end user (not just a developer with
// devtools open) can display *why* it failed instead of one generic
// message no matter the cause (found 20 Aug 2026 - see CheckinVerificationModal.tsx,
// where a real device's "Failed to upload the photo" gave no way to tell
// an auth/session problem apart from a file-too-large or invalid-image one).
async function uploadImageDBInternal(
  image: File | string,
  folder: 'menu' | 'catalog' | 'misc' | 'id_documents' | 'qr_code' = 'misc'
): Promise<{ url: string | null; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('image', image instanceof File ? image : dataUriToBlob(image));
    formData.append('folder', folder);
    const res = await apiFetch(UPLOAD_BASE, {
      method: 'POST',
      body: formData,
    });
    let json: any;
    try {
      json = await res.json();
    } catch {
      // Non-JSON response (raw PHP fatal/HTML error page, host-level 413,
      // etc.) - res.status is the only signal left.
      return { url: null, error: `Server error (HTTP ${res.status}). Please try again.` };
    }
    if (json.status === 'success' && json.url) {
      // json.url is built server-side from the backend's own SCRIPT_NAME, which
      // on this dev setup is the sibling `-ai2` folder the Vite proxy rewrites
      // requests into (e.g. /artists_farm-ai2/php/uploads/images/...) - not
      // reachable directly from the browser, since only /php/... and
      // /artists_farm/php/... are actually proxied. Re-root it onto the same
      // _base this frontend already uses for the upload request itself: ''
      // in both dev (matches the /php proxy rule) and production (this site
      // has never actually been deployed under an /artists_farm/ subfolder).
      const uploadsPath = json.url.replace(/^.*(\/php\/uploads\/.*)$/, '$1');
      return { url: `${API_ROOT_BASE}${uploadsPath}` };
    }
    console.error('Image upload failed:', json.message);
    return { url: null, error: json.message || `Upload failed (HTTP ${res.status}).` };
  } catch (err: any) {
    console.error('Failed to upload image:', err);
    return { url: null, error: err?.message || 'Network error while uploading. Please check your connection and try again.' };
  }
}

export async function uploadImageDB(image: File | string, folder: 'menu' | 'catalog' | 'misc' | 'id_documents' | 'qr_code' = 'misc'): Promise<string | null> {
  const result = await uploadImageDBInternal(image, folder);
  return result.url;
}

export async function uploadImageDBVerbose(image: File | string, folder: 'menu' | 'catalog' | 'misc' | 'id_documents' | 'qr_code' = 'misc'): Promise<{ url: string | null; error?: string }> {
  return uploadImageDBInternal(image, folder);
}

// Unlike uploadImageDB above, accepts PDFs as well as images and stores the
// file as-is (php/uploads/upload_document.php does no resize/recompress) -
// for legal/certificate documents (e.g. LicenseManagement) where the upload
// has to stay byte-identical to what was scanned, not a compressed thumbnail.
export async function uploadDocumentDB(file: File, folder: 'licenses' | 'c_form' = 'licenses'): Promise<{ url: string; mime: string; size: number } | null> {
  try {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('folder', folder);
    const res = await apiFetch(DOCUMENT_UPLOAD_BASE, {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();
    if (json.status === 'success' && json.url) {
      // Same dev-proxy re-rooting as uploadImageDB - see its comment above.
      const uploadsPath = json.url.replace(/^.*(\/php\/uploads\/.*)$/, '$1');
      return { url: `${API_ROOT_BASE}${uploadsPath}`, mime: json.mime, size: json.size };
    }
    console.error('Document upload failed:', json.message);
    return null;
  } catch (err) {
    console.error('Failed to upload document:', err);
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

export async function fetchSystemExpenseCatalogFromDB(): Promise<Record<string, { id: number; label: string; default_amount: number; category: string; description: string }[]>> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_system_expense_catalog`);
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch system expense catalog from DB:', err);
  }
  return {};
}

export async function fetchBillsCatalogFromDB(): Promise<{ id: number; label: string; default_amount: number; description: string }[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_bills_catalog`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch bills catalog from DB:', err);
  }
  return [];
}

export async function fetchPropertyCustomExpensesFromDB(): Promise<{ id: number; label: string; default_amount: number; category: string; description?: string }[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_property_custom_expenses`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch property custom expenses from DB:', err);
  }
  return [];
}

export async function addPropertyCustomExpenseDB(item: any): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_property_custom_expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to save property custom expense in DB:', err);
    return false;
  }
}

export async function deletePropertyCustomExpenseDB(id: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_property_custom_expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete property custom expense in DB:', err);
    return false;
  }
}



export async function fetchMaterialCategoriesFromDB(): Promise<{ id: number; name: string }[]> {
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

export async function verifyAdminPasscodeDB(passcode: string): Promise<{ success: boolean; role?: string; name?: string }> {
  try {
    const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=verify_admin_passcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('Failed to verify admin passcode:', err);
    return { success: false };
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
    if (json.status === 'success') {
      if (Array.isArray(json.data)) {
        return json.data;
      } else if (json.grouped && typeof json.data === 'object') {
        const flatArray: any[] = [];
        Object.values(json.data).forEach((arr: any) => {
          if (Array.isArray(arr)) {
            flatArray.push(...arr);
          }
        });
        return flatArray;
      }
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
          otaSource: g.otaSource || g.ota_source || null,
          otaSourceLabel: g.otaSourceLabel || g.ota_source_label || null,
          icalExternalEventId: g.icalExternalEventId || g.ical_external_event_id || null,
          otaCancelledDetectedAt: g.otaCancelledDetectedAt || g.ota_cancelled_detected_at || null,
          // Concurrency token echoed back on save so the backend can reject an
          // edit built on a stale copy - see update_guest's expected_updated_at.
          updatedAt: g.updatedAt || g.updated_at || null,
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
  // Set only when converting an OTA (Airbnb/Booking.com/etc) iCal-synced block
  // into a real booking - see ConvertOtaBookingModal.tsx. Omitted for a normal
  // offline booking, which is also what tells add_guest whether to run its
  // overlap-warning check (see overlap_warning below).
  ota_source?: string;
  ota_source_label?: string;
  ical_external_event_id?: string;
  // Itemized booking-time "Additional Charges" lines (Decoration Fees, Extra
  // Housekeeping, Pet Stay Charges, custom Misc templates) - see
  // guest_extra_charges in guests.php's add_guest.
  extra_charges?: { category: string; amount: number; note?: string }[];
}): Promise<{ id: string | null; overlapWarning?: { source_label: string; event_start: string; event_end: string } }> {
  // Throws on failure (23 Aug 2026, ROADMAP.md verification pass) - this used to swallow ANY
  // failure (a thrown network error, or a perfectly well-formed {status:'error', message:...}
  // rejection like a real validation failure) into a bare {id: null}, with no way for the caller
  // to tell "rejected" apart from "succeeded with no id". App.tsx's handleAddGuest already
  // optimistically adds the guest to local state before this call resolves - with no exception to
  // catch, that phantom guest was never rolled back on a genuine rejection (e.g. an invalid phone
  // number failing InputValidator's checks), so it stayed fully visible in the UI (Dashboard
  // Alerts, calendar, Arrivals count) - a "success" toast even fired - despite never actually
  // existing in the database. Reproduced live: a too-short phone number correctly got a 400 from
  // the backend, but the guest still showed up as a real booking until the next page reload
  // silently dropped it.
  const res = await apiFetch(`${API_BASE}?action=add_guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(guest),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // json stays null - message below falls back to the HTTP status
  }
  if (!json || json.status !== 'success') {
    const message = json?.message || `Failed to save booking (HTTP ${res.status})`;
    console.error('Failed to add guest to DB:', message);
    throw new Error(message);
  }
  return { id: json.id || null, overlapWarning: json.overlap_warning || undefined };
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
  // The updatedAt value this edit was built from. The server rejects the save
  // if the booking has moved since, rather than silently overwriting whatever
  // another staff member changed (see update_guest in php/guests/guests.php).
  expected_updated_at?: string | null;
}): Promise<boolean> {
  // Throws with the backend's REAL message on a rejected save rather than
  // collapsing every failure into `false` (30 Aug 2026). The only caller
  // already turns a falsy result into a generic "Failed to update booking",
  // which would have hidden the one message that actually tells the user what
  // to do - "someone else changed this booking, reload and re-apply". Same
  // throw-the-real-reason pattern deleteGuestFromDB/addGuestToDB already use.
  const res = await apiFetch(`${API_BASE}?action=update_guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(guest),
  });
  const json = await res.json().catch(() => null);
  if (!json || json.status !== 'success') {
    throw new Error(json?.message || 'Failed to update booking');
  }
  return true;
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

// documentUrl: the uploaded Form 'C' confirmation (uploadDocumentDB(file,
// 'c_form')'s returned url) - optional, and only meaningful when filed=true.
// When present, the PHP side forwards that file to Telegram as part of THIS
// save (not on file-select) - see mark_c_form_filed in guests.php.
export async function markCFormFiled(guestId: string, filed: boolean = true, cFormNumber?: string, documentUrl?: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=mark_c_form_filed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guestId, filed, c_form_number: cFormNumber, c_form_document_url: documentUrl }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update C-Form filing status:', err);
    return false;
  }
}

// Throws (rather than silently returning false) so the real backend reason - "Access denied for
// this property.", "Booking not found", a raw SQL error, etc. - reaches the UI instead of being
// swallowed into one generic "Failed to delete booking" message everywhere (see BookingDetailsModal
// .tsx's handleDelete / App.tsx's handleDeleteGuest, the only caller). Found 23 Aug 2026 while
// chasing a reported "unable to delete booking" that this exact swallowing made undiagnosable from
// the reporter's screenshot alone - the toast looked identical whether the real cause was a 403
// property-scope mismatch, a 404 (already deleted / wrong property_id), or a 500 SQL error.
export async function deleteGuestFromDB(guestId: string): Promise<boolean> {
  const res = await apiFetch(`${API_BASE}?action=delete_guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: guestId }),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // fall through - json stays null, message below falls back to the HTTP status
  }
  if (!json || json.status !== 'success') {
    const message = json?.message || `Failed to delete booking (HTTP ${res.status})`;
    console.error('Failed to delete guest/booking in DB:', message);
    throw new Error(message);
  }
  return true;
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
          orderId: o.id != null ? Number(o.id) : undefined,
          guestId: String(o.guest_id || ''),
          guestName: (o.guest_name || 'Walk-in').trim(),
          roomNumber: (o.room_number || '').trim(),
          walkInTabId: o.walk_in_tab_id != null ? Number(o.walk_in_tab_id) : null,
          items: Array.isArray(o.items)
            ? o.items
                .filter((it: any) => (it.name || it.item_name) && Number(it.quantity) > 0)
                .map((it: any) => ({
                  id: it.id != null ? Number(it.id) : undefined,
                  // get_orders (orders.php) always selects oi.menu_item_id, but
                  // this mapper dropped it - every OrderItem reached the app
                  // with menuItemId permanently undefined, which silently broke
                  // any dish-level join back to menu_items/dish_recipes (found
                  // 16 Aug 2026: Dish Profitability showed "No dishes have a
                  // costed recipe yet" even with real costed recipes seeded,
                  // because AnalyticsDashboard's recipe lookup keys off this
                  // exact field).
                  menuItemId: it.menu_item_id != null ? Number(it.menu_item_id) : undefined,
                  name: (it.name || it.item_name || '').trim(),
                  quantity: Math.max(1, Number(it.quantity) || 1),
                  unitPrice: Math.max(0, Number(it.unit_price || it.price) || 0),
                  itemStatus: it.item_status || 'Pending',
                  readyAt: it.ready_at || null,
                }))
            : [],
          status: o.status || 'Pending',
          orderTime: o.order_time || '',
          totalAmount: Math.max(0, Number(o.total_amount) || 0),
          specialInstructions: (o.special_instructions || '').trim(),
        }))
        .filter((o) => o.items.length > 0 || o.totalAmount > 0);
    }
  } catch (err) {
    console.error('Failed to fetch orders from DB:', err);
  }
  return [];
}

// Persists a kitchen order (create_order) and returns its real numeric DB id
// - null on failure, including the backend's own PDOException fallback,
// which reports success without ever actually saving anything, so callers
// must not treat that as a real order.
export async function addOrderToDB(order: {
  guestId?: string | null;
  walkInTabId?: number | null;
  items: { menuItemId: number; quantity: number }[];
  specialInstructions?: string;
}): Promise<number | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=create_order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guest_id: order.guestId || null,
        walk_in_tab_id: order.walkInTabId || null,
        items: order.items.map((it) => ({ menu_item_id: it.menuItemId, quantity: it.quantity })),
        special_instructions: order.specialInstructions?.trim() || null,
      }),
    });
    const json = await res.json();
    if (json.status === 'success' && json.order_id != null) {
      return Number(json.order_id);
    }
  } catch (err) {
    console.error('Failed to create order:', err);
  }
  return null;
}

// Walk-in tabs - a running bill for a table/customer that isn't staying in a
// room. Orders attach to a tab (addOrderToDB's walkInTabId) as they come in;
// billWalkInTabDB closes it out as one consolidated bill instead of settling
// each order separately.
export async function fetchWalkInTabsFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_walk_in_tabs`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch walk-in tabs:', err);
  }
  return [];
}

export async function fetchWalkInTabHistoryFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_walk_in_tab_history`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch walk-in tab history:', err);
  }
  return [];
}

export async function openWalkInTabDB(label: string): Promise<number | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=open_walk_in_tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    const json = await res.json();
    if (json.status === 'success' && json.tab_id != null) return Number(json.tab_id);
  } catch (err) {
    console.error('Failed to open walk-in tab:', err);
  }
  return null;
}

export async function billWalkInTabDB(params: {
  tabId: number;
  paymentMethod: string;
  discount: number;
  gstEnabled: boolean;
  gstRate: number;
}): Promise<{ success: boolean; message?: string; bill?: any }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=bill_walk_in_tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab_id: params.tabId,
        payment_method: params.paymentMethod,
        discount: params.discount,
        gst_enabled: params.gstEnabled,
        gst_rate: params.gstRate,
      }),
    });
    const json = await res.json();
    return { success: json.status === 'success', message: json.message, bill: json.bill };
  } catch (err) {
    console.error('Failed to bill walk-in tab:', err);
    return { success: false, message: 'Network error' };
  }
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

// Persists an order's own status (Pending/Preparing/Fulfilled/Cancelled) -
// separate from updateOrderItemStatus, which only tracks each dish's own
// Ready/Served state. Nothing called this before 17 Aug 2026: an order's
// status was set once at creation ('Pending') and then never updated again,
// even after every one of its items was marked Served - it just sat there
// until the next full page reload happened to reconcile it.
export async function updateOrderStatusDB(orderId: string, status: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_order_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId, status }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update order status:', err);
    return false;
  }
}

export interface ServiceRequest {
  id: number;
  propertyId: number;
  roomId: number | null;
  roomName: string;
  requestType: string;
  description: string;
  chargeAmount?: number;
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
  requestType: string;
  description: string;
  requestedBy: string;
  roomName: string;
  elapsedMinutes: number;
  scheduledAt: string | null;
}

export interface ServiceRequestType {
  id: number;
  propertyId: number;
  typeId: string;
  category: string;
  label: string;
  defaultAmount?: number;
  isSystemDefault: boolean;
  displayOrder: number;
  source?: 'system' | 'custom';
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
    id?: number;
    type_id?: string;
    category: string;
    label: string;
    default_amount?: number;
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

// --- System Service Request Catalog (Root Admin global management) ---

export interface SystemServiceRequestCatalogItem {
  id: number;
  type_id: string;
  category: string;
  label: string;
  display_order: number;
}

export async function fetchSystemServiceRequestCatalogFromDB(): Promise<SystemServiceRequestCatalogItem[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_system_service_request_catalog`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch system service request catalog:', err);
  }
  return [];
}

export async function saveSystemServiceRequestTypeInDB(item: {
  id?: number;
  type_id?: string;
  category: string;
  label: string;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=add_system_service_request_type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to save system service request type:', err);
    return false;
  }
}

export async function deleteSystemServiceRequestTypeFromDB(id: number): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_system_service_request_type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete system service request type:', err);
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
  charge_amount?: number;
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

// Root-admin-only counterpart to updateStaffUserDB, used exclusively for the
// Super Admin row in StaffManagement's "Modify Team Member" modal. Unlike
// updateStaffUserDB (which writes one property's staff_users row directly -
// exactly the per-property desync bug fixed elsewhere this session), this
// writes the tenant's real `users`-table login and resyncs every property
// from it. Deliberately narrower than the general update: no role/username/
// cash-handler/access-all-properties, since those are permanently fixed for
// Super Admin - see update_tenant_super_admin in router.php.
export async function updateTenantSuperAdminDB(params: {
  tenantId: number | string;
  propertyId?: number | string;
  fullName: string;
  passcode?: string;
  qrCodeUrl?: string;
  upiId?: string;
}): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_tenant_super_admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: params.tenantId,
        property_id: params.propertyId,
        full_name: params.fullName,
        passcode: params.passcode || '',
        qr_code_url: params.qrCodeUrl || '',
        upi_id: params.upiId || '',
      }),
    });
    const json = await res.json();
    return json.success === true;
  } catch (err) {
    console.error('Failed to update tenant Super Admin in DB:', err);
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

export interface TelegramSendOutcome {
  // True only when at least one Telegram group actually received the
  // message - NOT just "the HTTP round-trip to our own backend succeeded".
  success: boolean;
  attempted: number;
  delivered: number;
  reason?: string;
}

// sendPropertyTelegramMessage() (php/telegram/sender.php) returns different
// shapes depending on how the send resolved: {skipped:true, reason} when
// Telegram is off or no group is routed for this category; a single raw
// Telegram API JSON string for a single-chat send; or, for category 'all',
// an object keyed by chatId -> raw Telegram API JSON string per group. This
// parses whichever shape came back into one consistent outcome so callers
// don't have to know the difference.
function parseTelegramSendResult(result: any): TelegramSendOutcome {
  if (!result || (typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0)) {
    return { success: false, attempted: 0, delivered: 0, reason: 'No Telegram groups are configured for this property yet.' };
  }
  if (typeof result === 'object' && !Array.isArray(result) && 'skipped' in result) {
    return { success: false, attempted: 0, delivered: 0, reason: result.reason || 'Telegram send was skipped.' };
  }
  const parseOne = (raw: any): boolean => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return !!parsed?.ok;
    } catch {
      return false;
    }
  };
  // Multi-group ('all' category): object keyed by chatId.
  if (typeof result === 'object' && !Array.isArray(result)) {
    const chatIds = Object.keys(result);
    const delivered = chatIds.filter((id) => parseOne(result[id])).length;
    return {
      success: delivered > 0,
      attempted: chatIds.length,
      delivered,
      reason: delivered === 0 ? 'Telegram rejected the message for every configured group - double-check the bot token and that the bot is still a member of each group.' : undefined,
    };
  }
  // Single-chat send: result is itself a raw Telegram API JSON string.
  const ok = parseOne(result);
  return { success: ok, attempted: 1, delivered: ok ? 1 : 0, reason: ok ? undefined : 'Telegram rejected the message.' };
}

export async function sendTelegramAlertDB(payload: {
  eventType: string;
  category: string;
  message: string;
  replyMarkup?: any;
  templateKey?: string;
  mediaUrls?: string[];
}): Promise<TelegramSendOutcome> {
  try {
    const res = await apiFetch(`${API_BASE}?action=send_telegram_alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.status !== 'success') {
      return { success: false, attempted: 0, delivered: 0, reason: json.message || 'Request to the notification backend failed.' };
    }
    return parseTelegramSendResult(json.result);
  } catch (err) {
    console.error('Failed to send Telegram alert via backend proxy:', err);
    return { success: false, attempted: 0, delivered: 0, reason: 'Network error while sending.' };
  }
}

export async function fetchTelegramConfigDB(propertySlug?: string): Promise<PropertyTelegramConfig> {
  const fallback: PropertyTelegramConfig = { enabled: true, botToken: null, groups: [], routing: {} };
  try {
    const res = await apiFetch(`${API_BASE}?action=get_telegram_config`, undefined, propertySlug);
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

// propertySlug (optional, 26 Aug 2026): pass a target property's slug to act on THAT property
// instead of the currently-open one - used by Root Admin's Telegram pairing panel, which pairs
// groups on behalf of any property. See apiFetch()'s propertySlugOverride comment.
export async function fetchTelegramBotIdentity(propertySlug?: string): Promise<{ username: string; name: string | null } | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_bot_identity`, undefined, propertySlug);
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

export async function generateTelegramPairingCode(groupKey: string, groupName: string, propertySlug?: string): Promise<string | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=generate_pairing_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupKey, groupName }),
    }, propertySlug);
    const json = await res.json();
    return json.status === 'success' ? json.code : null;
  } catch (err) {
    console.error('Failed to generate Telegram pairing code:', err);
    return null;
  }
}

export async function checkTelegramPairingStatus(code: string, propertySlug?: string): Promise<TelegramPairingStatus> {
  try {
    const res = await apiFetch(`${API_BASE}?action=check_pairing_status&code=${encodeURIComponent(code)}`, undefined, propertySlug);
    const json = await res.json();
    if (json.status === 'success' && json.data) return json.data as TelegramPairingStatus;
  } catch (err) {
    console.error('Failed to check Telegram pairing status:', err);
  }
  return { status: 'not_found' };
}

export async function confirmTelegramPairing(code: string, propertySlug?: string): Promise<{ success: boolean; chatId?: string; message?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=confirm_pairing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }, propertySlug);
    const json = await res.json();
    return { success: json.status === 'success', chatId: json.chatId, message: json.message };
  } catch (err) {
    console.error('Failed to confirm Telegram pairing:', err);
    return { success: false };
  }
}

export async function sendTelegramTestMessage(chatId: string, propertySlug?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=send_telegram_test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    }, propertySlug);
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

// Telegram template resolver — fetches from DB via manager.php and caches.
// A kitchen POS terminal routinely stays open for a whole shift (this cache
// living forever was confirmed 19 Aug 2026: a template edited/repaired in the
// DB kept sending its pre-edit content from an already-open tab indefinitely,
// since nothing here ever re-fetched without a full page reload). Expiring it
// after a few minutes means an edit propagates to every open tab on its own
// within a bounded window, without depending on anyone remembering to reload.
let _templateCache: Record<string, string> | null = null;
let _templateCacheFetchedAt = 0;
const TEMPLATE_CACHE_TTL_MS = 3 * 60 * 1000;

export async function resolveTelegramTemplate(dbKey: string, variables: Record<string, string>): Promise<string | null> {
  try {
    if (!_templateCache || Date.now() - _templateCacheFetchedAt > TEMPLATE_CACHE_TTL_MS) {
      const res = await apiFetch(`${API_ROOT_BASE}/php/telegram/manager.php?action=get_templates`);
      const json = await res.json();
      if (json.success && json.templates) {
        _templateCache = {};
        for (const key of Object.keys(json.templates)) {
          _templateCache[key] = json.templates[key].content;
        }
        _templateCacheFetchedAt = Date.now();
      }
    }
    if (_templateCache && _templateCache[dbKey]) {
      let msg = _templateCache[dbKey];
      for (const [varName, varValue] of Object.entries(variables)) {
        msg = msg.replace(new RegExp(`\\{${varName}\\}`, 'g'), varValue);
      }
      return stripUnresolvedTemplatePlaceholders(msg);
    }
  } catch (err) {
    console.error('Failed to resolve Telegram template:', err);
  }
  return null;
}

// Safety net for a customized/stale DB template whose placeholder name no
// longer matches what the calling code actually supplies (found 23 Aug 2026:
// a Kitchen Reminder on staging was sending "... ({table_no})" verbatim to
// Telegram, because that template's DB row referenced {table_no} while every
// caller only ever supplies room_no - so the loop above never touches it and
// it survives into the live notification). Rather than trusting every future
// template edit to stay in sync with the variables its caller passes, drop
// any placeholder still standing after substitution instead of showing it
// literally - a parenthesized chunk built entirely around one (e.g. "(Table
// {table_no})") is removed whole so no dangling label/empty parens are left
// behind either.
function stripUnresolvedTemplatePlaceholders(msg: string): string {
  return msg
    .replace(/\s*\([^()]*\{[a-zA-Z0-9_]+\}[^()]*\)/g, '')
    .replace(/\{[a-zA-Z0-9_]+\}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function invalidateTemplateCache() {
  _templateCache = null;
  _templateCacheFetchedAt = 0;
}

export interface DbTelegramTemplate {
  templateKey: string;
  title: string;
  category: string;
  description: string;
  content: string;
  variables: string[];
  // Manual "move to group" override (Kitchen/Admin/Finances) for the
  // Templates Catalog tab this template shows under - null means no
  // override, fall back to the automatic dbKey/category classification.
  groupOverride: string | null;
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
          groupOverride: t.group_override || null,
        };
      });
    }
  } catch (err) {
    console.error('Failed to fetch Telegram templates from DB:', err);
  }
  return [];
}

// Moves a Telegram template to a different Templates Catalog tab (Kitchen/
// Admin/Finances), overriding the automatic dbKey/category classification.
export async function updateTemplateGroupInDB(templateKey: string, group: 'Kitchen' | 'Admin' | 'Finances'): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_ROOT_BASE}/php/telegram/manager.php?action=update_template_group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `template_key=${encodeURIComponent(templateKey)}&group=${encodeURIComponent(group)}`,
    });
    const json = await res.json();
    return !!json.success;
  } catch (err) {
    console.error('Failed to move Telegram template group:', err);
    return false;
  }
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

export async function fetchServedLogsFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_served_logs`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      // served_at/ready_at come back raw ("YYYY-MM-DD HH:MM:SS", straight
      // from MySQL) - deliberately NOT reformatted here (found 17 Aug 2026:
      // this used to convert to "DD/MM/YYYY HH:MM" for display at fetch
      // time, while a freshly-served item added client-side in the same
      // session stamped its own timestamp in a different, unrelated format -
      // two different shapes landing in the same servedLogs list, neither of
      // which the sort/diff logic in KitchenManagement.tsx could parse
      // consistently). Keeping the raw DB shape here means every row -
      // however it got into the list - is in the one format
      // parseFlexibleTimestamp/buildLocalTimestamp actually agree on;
      // display formatting happens once, in the table's own cell renderer.
      return json.data.map((item: any) => ({
        id: String(item.id ?? ''),
        orderId: item.order_id ?? '',
        itemName: item.item_name ?? '',
        quantity: Number(item.quantity ?? 1),
        servedBy: item.served_by ?? '',
        guestName: item.guest_name ?? '',
        roomNumber: item.room_number ?? '',
        servedAt: item.served_at ?? '',
        readyAt: item.ready_at || null,
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
  ready_at?: string;
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
    // NOT a second `record_salary_payment` ledger post here - add_petty_cash
    // (above) already unconditionally posts every entry it creates to
    // financial_ledger (petty_cash.php's add_petty_cash case, entry_key
    // `expense:{id}`). Calling record_salary_payment too used to write a
    // SECOND debit (`salary:salary-{staffId}-{month}`) for the exact same
    // payout, silently doubling every salary's reported cost in the P&L -
    // confirmed in production data (Abhijeet, Jul 2026: two ₹741.94 ledger
    // rows for one real payment). See CLAUDE.md's postFinancialLedger note.
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

export async function fetchGuestExtraChargesFromDB(): Promise<any[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_guest_extra_charges`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  } catch (err) {
    console.error('Failed to fetch guest extra charges:', err);
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

export async function addStaffMealLogToDB(staffNames: string, foodDescription: string, isLeftoverBuffer: boolean, loggedAt?: string): Promise<boolean> {
  try {
    // loggedAt (optional): the "Date & Time of Record" field's native
    // datetime-local value ("YYYY-MM-DDTHH:mm") - converted to a MySQL
    // DATETIME string here rather than at the call site, so every caller
    // sends the same shape. Omitted entirely -> backend falls back to
    // NOW(). See php/kitchen/menu.php's add_staff_meal_log case.
    const body: Record<string, unknown> = { staff_names: staffNames, food_description: foodDescription, is_leftover_buffer: isLeftoverBuffer };
    if (loggedAt) body.logged_at = `${loggedAt.replace('T', ' ')}:00`;
    const res = await apiFetch(`${API_BASE}?action=add_staff_meal_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add staff meal log:', err);
    return false;
  }
}

// --- Root Admin: Cron Jobs (see php/cron/cron_jobs.php) ---
// Lets Root Admin view/toggle/reschedule/manually-trigger every registered
// scheduled task (php/cron/*.php) without SSH - added 25 Aug 2026 after
// discovering the server's real crontab only had one job registered despite
// several existing in the codebase, fully working, just never invoked.
export interface CronJob {
  jobKey: string;
  name: string;
  description: string;
  enabled: boolean;
  scheduleType: 'interval_minutes' | 'daily_at';
  intervalMinutes: number | null;
  dailyAtTime: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
  lastRunDurationMs: number | null;
  logFile: string | null;
}

export async function fetchCronJobsDB(): Promise<CronJob[]> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_cron_jobs`);
    const json = await res.json();
    return json.status === 'success' ? json.data : [];
  } catch (err) {
    console.error('Failed to fetch cron jobs:', err);
    return [];
  }
}

export async function updateCronJobDB(jobKey: string, changes: Partial<Pick<CronJob, 'enabled' | 'scheduleType' | 'intervalMinutes' | 'dailyAtTime'>>): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_cron_job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobKey, ...changes }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to update cron job:', err);
    return false;
  }
}

export async function runCronJobNowDB(jobKey: string): Promise<{ status: string; message: string; durationMs: number } | null> {
  try {
    const res = await apiFetch(`${API_BASE}?action=run_cron_job_now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobKey }),
    });
    const json = await res.json();
    return json.status === 'success' ? json.data : null;
  } catch (err) {
    console.error('Failed to run cron job:', err);
    return null;
  }
}

export async function fetchCronJobLogDB(jobKey: string): Promise<string> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_cron_job_log&jobKey=${encodeURIComponent(jobKey)}`);
    const json = await res.json();
    return json.status === 'success' ? (json.data.log || '') : '';
  } catch (err) {
    console.error('Failed to fetch cron job log:', err);
    return '';
  }
}

export interface RateRule {
  id?: number;
  property_id: number;
  room_id?: number | null;
  start_date: string;
  end_date: string;
  rate_per_night?: number | null;
  rule_name?: string;
  room_name?: string;
  min_stay_arrival?: number | null;
  min_stay_through?: number | null;
  max_stay?: number | null;
  stop_sell?: number;
  closed_to_arrival?: number;
  closed_to_departure?: number;
}

export async function fetchRateRulesDB(): Promise<{ rules: RateRule[]; pricing_mode: 'flat' | 'variable'; default_tariff: number | null }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=get_rate_rules`);
    const json = await res.json();
    if (json.status === 'success') {
      return {
        rules: Array.isArray(json.data) ? json.data : [],
        pricing_mode: json.pricing_mode || 'flat',
        default_tariff: json.default_tariff != null ? Number(json.default_tariff) : null,
      };
    }
    return { rules: [], pricing_mode: 'flat', default_tariff: null };
  } catch (err) {
    console.error('Failed to fetch rate rules:', err);
    return { rules: [], pricing_mode: 'flat', default_tariff: null };
  }
}

export async function saveRateRuleDB(rule: {
  id?: number;
  room_ids?: (number | null)[];
  room_id?: number | null;
  start_date: string;
  end_date: string;
  rate_per_night?: number | null;
  rule_name?: string;
  min_stay_arrival?: number | null;
  min_stay_through?: number | null;
  max_stay?: number | null;
  stop_sell?: number | boolean;
  closed_to_arrival?: number | boolean;
  closed_to_departure?: number | boolean;
}): Promise<{ success: boolean; message: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=save_rate_rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    const json = await res.json();
    return { success: json.status === 'success', message: json.message || '' };
  } catch (err) {
    console.error('Failed to save rate rule:', err);
    return { success: false, message: 'Network error saving rate rule' };
  }
}

export async function deleteRateRuleDB(id: number): Promise<{ success: boolean; message: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=delete_rate_rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return { success: json.status === 'success', message: json.message || '' };
  } catch (err) {
    console.error('Failed to delete rate rule:', err);
    return { success: false, message: 'Network error deleting rate rule' };
  }
}

export async function updatePricingModeDB(pricing_mode: 'flat' | 'variable'): Promise<{ success: boolean; message: string }> {
  try {
    const res = await apiFetch(`${API_BASE}?action=update_pricing_mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricing_mode }),
    });
    const json = await res.json();
    return { success: json.status === 'success', message: json.message || '' };
  } catch (err) {
    console.error('Failed to update pricing mode:', err);
    return { success: false, message: 'Network error updating pricing mode' };
  }
}



