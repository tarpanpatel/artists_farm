/**
 * API service helper for Artists Farm Resort PHP/MySQL backend.
 */

// Dynamically resolve the API base to handle subfolder deployment (e.g. /artists_farm/)
const _base = window.location.pathname.replace(/#.*$/, '').replace(/\/[^/]*$/, '');
const API_BASE = `${_base}/php/api/router.php`;
const UPLOAD_BASE = `${_base}/php/uploads/upload_image.php`;

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
  return headers;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const customHeaders = (init?.headers as Record<string, string>) || {};
  return fetch(url, {
    ...init,
    headers: getTestingHeaders(customHeaders),
  });
}

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
    const res = await fetch(`${API_BASE}?action=get_stock_requests`);
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
    const res = await fetch(`${API_BASE}?action=create_stock_request`, {
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
    const res = await fetch(`${API_BASE}?action=update_stock_request_status`, {
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
    const res = await fetch(`${API_BASE}?action=get_petty_cash`);
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
    const res = await fetch(`${API_BASE}?action=add_petty_cash`, {
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
    const res = await fetch(`${API_BASE}?action=update_petty_cash`, {
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
    const res = await fetch(`${API_BASE}?action=delete_petty_cash`, {
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

export async function uploadImageDB(base64DataUri: string, folder: 'menu' | 'catalog' | 'misc' = 'misc'): Promise<string | null> {
  try {
    const res = await fetch(UPLOAD_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64DataUri, folder }),
    });
    const json = await res.json();
    if (json.status === 'success' && json.url) {
      return json.url;
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
    const res = await fetch(`${API_BASE}?action=get_expense_item_prices`);
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch expense item prices from DB:', err);
  }
  return {};
}

export async function fetchExpenseItemsFromDB(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_expense_items`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((row: any) => row.item_name);
    }
  } catch (err) {
    console.error('Failed to fetch expense items from DB:', err);
  }
  return [];
}

export async function addExpenseItemToDB(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=add_expense_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: name }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to add expense item:', err);
    return false;
  }
}

export async function deleteExpenseItemFromDB(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=delete_expense_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: name }),
    });
    const json = await res.json();
    return json.status === 'success';
  } catch (err) {
    console.error('Failed to delete expense item:', err);
    return false;
  }
}

export async function fetchMaterialCategoriesFromDB(): Promise<{ id: number; name: string }[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_material_categories`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch material categories:', err);
  }
  return [];
}

export async function updateMaterialCategoryInDB(id: number, name: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=update_material_category`, {
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
    const res = await fetch(`${API_BASE}?action=delete_material_category`, {
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
    const res = await fetch(`${API_BASE}?action=add_material_category`, {
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
    const res = await fetch(`${API_BASE}?action=get_misc_catalog`);
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
    const res = await fetch(`${API_BASE}?action=get_wastage_logs`);
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
    const res = await fetch(`${API_BASE}?action=create_wastage_log`, {
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
    const res = await fetch(`${API_BASE}?action=get_kitchen_purchases`);
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
    const res = await fetch(`${API_BASE}?action=create_kitchen_purchase`, {
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
    const res = await fetch(`${API_BASE}?action=bulk_update_kitchen_purchases`, {
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
    const res = await fetch(`${API_BASE}?action=delete_kitchen_purchase`, {
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
    const res = await fetch(`${API_BASE}?action=add_catalog_item`, {
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
    const res = await fetch(`${API_BASE}?action=update_catalog_item`, {
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
    const res = await fetch(`${API_BASE}?action=delete_catalog_item`, {
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
    const res = await fetch(`${API_BASE}?action=bulk_update_catalog_category`, {
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
    const res = await fetch(`${API_BASE}?action=get_guests`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((g: any) => ({
        id: String(g.id || g.ID || ''),
        guestName: g.guest_name || g.name || 'Guest',
        phoneNumber: g.phone_number || g.contact || '',
        checkinDate: g.checkin_date || g.check_in || '',
        expectedCheckout: g.expected_checkout || '',
        checkoutDate: g.checkout_date || g.check_out || '',
        roomNumber: g.room_number || '101',
        status: g.status || 'Active',
        notes: g.notes || g.guest_notes || g.misc_arrangements || '',
        bookingSource: g.booking_source || '',
        numberOfGuests: Number(g.no_of_guests || g.total_guests || g.adults || 0),
        roomRate: Number(g.per_night_charges || g.base_room_rent || 0),
        advanceAmount: Number(g.advance_paid || 0),
        foodBill: Number(g.total_food || 0),
        totalAmount: Number(g.total_charge || 0),
        paymentStatus: g.payment_status || g.status || 'Pending',
      }));
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
  total_charge?: number;
  pending_amount?: number;
}): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}?action=add_guest`, {
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

export async function checkoutGuestInDB(guestId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=checkout_guest`, {
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

export async function fetchOrdersFromDB(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_orders`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((o: any) => ({
        id: String(o.id || ''),
        guestId: String(o.guest_id || ''),
        guestName: o.guest_name || 'Walk-in',
        roomNumber: o.room_number || '',
        items: Array.isArray(o.items) ? o.items.map((it: any) => ({
          name: it.name || it.item_name || '',
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unit_price || it.price) || 0,
          itemStatus: it.item_status || 'Pending',
        })) : [],
        status: o.status || 'Pending',
        orderTime: o.order_time || '',
        totalAmount: Number(o.total_amount) || 0,
      }));
    }
  } catch (err) {
    console.error('Failed to fetch orders from DB:', err);
  }
  return [];
}

export async function fetchInventoryFromDB(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_inventory`);
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

export async function seedCatalogDB(): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}?action=seed_catalog`);
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('Failed to seed catalog:', err);
    return { status: 'error', message: String(err) };
  }
}

export async function fetchAttendanceFromDB(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_attendance`);
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
    const res = await fetch(`${API_BASE}?action=get_audit_logs`);
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
    const res = await fetch(`${API_BASE}?action=get_receipts`);
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
      }));
    }
  } catch (err) {
    console.error('Failed to fetch receipts from DB:', err);
  }
  return [];
}

export async function fetchMenuFromDB(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_menu`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch menu from DB:', err);
  }
  return [];
}

export async function addMenuItemDB(item: any): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=add_menu_item`, {
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
    const res = await fetch(`${API_BASE}?action=update_menu_item`, {
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
    const res = await fetch(`${API_BASE}?action=delete_menu_item`, {
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

export async function fetchNavMenuFromDB(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_nav_menu`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch nav menu from DB:', err);
  }
  return [];
}

export async function saveNavMenuDB(items: any[]): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=save_nav_menu`, {
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
    const res = await fetch(`${API_BASE}?action=get_users`);
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
    const res = await fetch(`${API_BASE}?action=add_user`, {
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
    const res = await fetch(`${API_BASE}?action=update_user`, {
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
    const res = await fetch(`${API_BASE}?action=delete_user`, {
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
    const res = await fetch(`${API_BASE}?action=get_payees`);
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
    const res = await fetch(`${API_BASE}?action=add_payee`, {
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
    const res = await fetch(`${API_BASE}?action=delete_payee`, {
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

export async function saveReceiptToDB(receipt: any): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=save_receipt`, {
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
}): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?action=send_telegram_alert`, {
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
    const res = await fetch(`${API_BASE}?action=add_audit_log`, {
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
      const base = window.location.pathname.replace(/#.*$/, '').replace(/\/[^/]*$/, '');
      const res = await fetch(`${base}/php/telegram/manager.php?action=get_templates`);
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

// =========================================================================
// CASH DRAWER API
// =========================================================================

export async function fetchCashDrawerSummaryFromDB(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}?action=get_cash_drawer_summary`);
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
    const res = await fetch(`${API_BASE}?action=add_drawer_entry`, {
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
    const res = await fetch(`${API_BASE}?action=get_drawer_entries`);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      return json.data;
    }
  } catch (err) {
    console.error('Failed to fetch drawer entries:', err);
  }
  return [];
}

