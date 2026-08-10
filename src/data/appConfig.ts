export const SYSTEM_ROLES = ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'];

export const NAV_CATEGORIES = [
  'All Categories',
  'Main Sections',
  'Residents & Billing',
  'Kitchen & Food',
  'Stock & Inventory',
  'Financials',
  'Staff & HR',
  'Analytics',
  'Audit & Logs',
  'System Controls',
];

// Nav uniqueKeys that only exist because a property cooks food: the whole
// stock/requisitions/kitchen-purchases inventory workflow plus the food menu
// editor. Combined with tabKey === 'kitchen' this is the full "kitchen module"
// nav footprint. Shared between App.tsx's visibleNavItems filter (hides these
// from the sidebar when a property has no food service) and NavMenuEditor's
// hideKitchenItems display filter (hides them from the menu editor's list
// without touching the underlying saved config) so the two never drift apart.
export const KITCHEN_MODULE_NAV_KEYS = new Set([
  'kitchen_overview',
  'kitchen',
  'take_food_order',
  'kitchen_orders',
  'staff_meals',
  'stock_requests',
  'fulfill_stock_req',
  'deficit_shortfalls_log',
  'stock_log',
  'kitchen_purchases',
  'edit_food_menu',
  'edit_kitchen_stock',
  'purchase_analytics',
]);

export function isKitchenModuleNavItem(item: { tabKey: string; uniqueKey?: string }): boolean {
  return item.tabKey === 'kitchen' || (!!item.uniqueKey && KITCHEN_MODULE_NAV_KEYS.has(item.uniqueKey));
}
