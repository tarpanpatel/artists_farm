export const strings: Record<string, string> = {
  // Navigation / Sidebar Menu Keys (uniqueKey)
  dashboard: "Overview Dashboard",
  guest_registration: "Register New Guest",
  billing_checkout: "Billing & Checkout",
  guest_history: "Guest History Archive",
  take_food_order: "New Food Order",
  kitchen_orders: "Kitchen Orders",
  stock_requests: "Stock Requests",
  fulfill_stock_req: "Fulfill Stock Requests",
  deficit_shortfalls_log: "Kitchen Wastage Logs",
  stock_log: "Stock & Adjustments",
  kitchen_purchases: "Kitchen Purchases",
  staff_meals: "Staff Meal Logs",
  staff_payees_control: "Staff & Payees Control",
  attendance_calendar: "Attendance Calendar",
  staff_directory_salaries: "Staff Directory & Salaries",
  expenses: "Expenses Log",
  cash_drawer: "Cash Drawer",
  edit_food_menu: "Edit Food Menu",
  edit_kitchen_stock: "Edit Kitchen Stock",
  edit_expense_items: "Edit Expense Items",
  misc_charges: "Misc Charges Settings",
  telegram: "Telegram Alerts Config",
  ical_sync_manager: "iCal Sync Manager",
  service_requests: "Service Requests",
  data_export_center: "Data Export Center",
  dashboard_analytics: "Dashboard Analytics",
  purchase_analytics: "Purchase Analytics",
  past_receipts_log: "Past Receipts Log",
  login_logs: "Login Logs",
  system_health: "System Health Status",

  // Role labels
  role_super_admin: "Super Admin",
  role_admin: "Admin",
  role_manager: "Manager",
  role_staff: "Team Member",
  role_chef: "Chef",
  role_staff_kitchen: "Kitchen Staff",
  role_staff_supervisor: "Supervisor",

  // Staff & Permissions
  team_role: "Team Role",
  authorization_role: "Team Role",
  auth_role: "Team Role",
  role: "Team Role",
  incurred_by: "Paid By",
  paid_by: "Paid By",
};

export function t(key: string, fallback: string): string {
  return strings[key] || fallback;
}
