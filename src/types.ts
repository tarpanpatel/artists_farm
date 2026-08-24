export interface Guest {
  id: string;
  guestName: string;
  phoneNumber: string;
  checkinDate: string;
  expectedCheckout: string;
  checkoutDate?: string;
  roomNumber: string;
  status: 'Active' | 'CheckedOut' | 'Booked' | 'Checked In' | 'CheckedIn' | 'checked-in';
  notes?: string;
  bookingSource?: string;
  numberOfGuests?: number;
  roomRate?: number;
  advanceAmount?: number;
  advanceReceivedBy?: string;
  pendingAmount?: number;
  pendingReceivedBy?: string;
  foodBill?: number;
  totalAmount?: number;
  paymentStatus?: string;
  idVerificationStatus?: 'Pending' | 'Complete';
  isForeignGuest?: boolean;
  cFormFiledAt?: string | null;
  cFormNumber?: string | null;
  c_form_number?: string | null;
  cFormDocumentUrl?: string | null;
  otaSource?: string | null;
  otaSourceLabel?: string | null;
  icalExternalEventId?: string | null;
  otaCancelledDetectedAt?: string | null;
  // Itemized "Additional Charges" lines from the booking form (Decoration
  // Fees, Extra Housekeeping, Pet Stay Charges, or a custom Misc Charges
  // Management template) - persisted to guest_extra_charges so analytics can
  // break accommodation revenue down by charge type instead of only ever
  // seeing it folded into pending_amount/notes text.
  extraCharges?: { category: string; amount: number; note?: string }[];
}

export interface BillingReceipt {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  checkinDate: string;
  checkoutDate: string;
  roomRatePerNight?: number;
  nightsCount?: number;
  roomRent?: number;
  roomTotal: number;
  foodTotal?: number;
  kitchenTotal: number;
  miscTotal: number;
  taxes?: number;
  gstEnabled?: boolean;
  gstRate?: number;
  gstAmount?: number;
  gstCgst?: number;
  gstSgst?: number;
  gstAccommodationRate?: number;
  gstFoodRate?: number;
  gstAccommodationAmount?: number;
  gstFoodAmount?: number;
  gstTaxType?: 'cgst_sgst' | 'igst';
  gstIgst?: number;
  guestGstin?: string;
  guestBillingName?: string;
  discount: number;
  grandTotal: number;
  status: 'Paid' | 'Pending';
  paidAt?: string;
  paymentMethod?: string;
  advancePaid?: number;
  advanceCollectedBy?: string;
  tariffCollectedBy?: string;
  incidentalsCashier?: string;
  foodItems?: { name: string; quantity: number; unitPrice: number; total: number }[];
  adjustments?: { type: string; label: string; amount: number }[];
  auditTrail?: string[];
}

export interface MenuItem {
  id: number;
  name: string;
  category: 'Starters' | 'Chinese' | 'Pizza & Sandwich' | 'Main Course' | 'Rice & Roti' | 'Breakfast' | 'Raita & Salad' | 'Beverages' | string;
  categoryId?: string | number;
  price: number;
  available: boolean;
  imagePath?: string;
}

export interface NavMenuItem {
  id: string;
  title: string;
  tabKey: string;
  uniqueKey?: string;
  // URL hash this item links to - independent of uniqueKey (which stays
  // stable and is what components actually key their rendering off of, via
  // activeMenuItemKey). Auto-regenerated from title on rename so the URL
  // follows a renamed item; falls back to uniqueKey when unset so items
  // that have never been renamed keep working unchanged.
  urlSlug?: string;
  category?: string;
  description?: string;
  iconName: string;
  order: number;
  roles: string[]; // e.g. ['Super Admin', 'Manager', 'Chef', 'Staff']
  isVisible: boolean;
  customUrl?: string;
  openInNewTab?: boolean;
  parentId?: string | null;
}

export interface OrderItem {
  id?: number;
  menuItemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  price?: number;
  itemStatus?: string;
  readyAt?: string | null;
  lastReminderAt?: string | null;
}

export interface Order {
  id: string;
  // Numeric DB id from create_order's response - needed for bill_walk_in_tab
  // lookups, since the string `id` above is the display ticket ("KOT-123")
  // not the row id.
  orderId?: number;
  guestId: string;
  guestName: string;
  roomNumber: string;
  orderTime: string;
  status: 'Pending' | 'Preparing' | 'Fulfilled' | 'Cancelled';
  items: OrderItem[];
  totalAmount: number;
  // Walk-in orders (no guest_id - food prepared for someone not staying in a
  // room) belong to a WalkInTab instead of a guest/room. The tab - not the
  // order - is what gets billed, since a table can order more than once
  // before it's ready to close out (see WalkInTab below).
  walkInTabId?: number | null;
  // Free-text note the order-taker attached at submit time (e.g. "less
  // spicy", "serve at 8pm") - kitchen-only, deliberately never shown on the
  // guest's bill/receipt (23 Aug 2026). Order-level, not per-dish.
  specialInstructions?: string;
}

export interface WalkInTabItem {
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface WalkInTab {
  id: number;
  label: string | null;
  status: 'open' | 'billed';
  openedAt: string;
  items: WalkInTabItem[];
  subtotal: number;
  // Populated only once billed
  billedAt?: string | null;
  paymentMethod?: string | null;
  discount?: number;
  gstEnabled?: boolean;
  gstRate?: number;
  gstAmount?: number;
  grandTotal?: number | null;
}

export interface IncidentalsItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface MiscChargeTemplate {
  id: string | number;
  label: string;
  default_amount: number;
  category: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  categoryId?: number;
  currentStock: number;
  minThreshold: number;
  unit: string;
  imagePath?: string;
  source?: 'system' | 'custom';
}

export interface CatalogItem {
  id: number;
  name: string;
  category: string;
  categoryId: number;
  price: number;
  packSize: number;
  packUnit: string;
  unitLabel: string;
  is_verified?: boolean;
  imagePath?: string;
  specification?: string;
  unit_cost?: number;
}

export interface Category {
  id: number;
  name: string;
}

export interface Requisition {
  id: string;
  itemName: string;
  requestedQty: number;
  unit: string;
  requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy: string;
}

export interface PettyCashEntry {
  id: string;
  date: string;
  time?: string;
  costCategory?: 'Salaries' | 'Other' | 'Bills' | string;
  category?: string;
  selectedStaffName?: string;
  predefinedItemSelection?: string;
  moreInfoNotes?: string;
  description: string;
  vendor?: string;
  amount: number;
  paymentMode?: 'Online' | 'Cash' | 'Bank Transfer' | string;
  paidBy?: string;
  invoiceBillUrls?: string[];
  paymentScreenshotUrls?: string[];
  type?: 'Expense' | 'Replenishment';
}

export interface StaffMember {
  id: string;
  // Staff Name - the human-readable display name. Never the login phone number.
  name: string;
  role: 'Manager' | 'Chef' | 'Housekeeping' | 'Farm Supervisor' | 'Kitchen Assistant' | 'Super Admin' | 'Admin' | 'Staff' | 'Staff Supervisor' | 'Staff Kitchen' | 'Front Desk' | string;
  phone: string;
  monthlySalary: number;
  status: string;
  // Optional fields populated from UserAccount / DB
  // Username - the 10-digit phone number used to log in. Distinct from `name`.
  username?: string;
  passcode?: string;
  passcodePin?: string;
  isFinancialHandler?: boolean;
  qrCodeUrl?: string;
  avatarUrl?: string;
  // When true, this staff member can log into any property under their own
  // tenant instead of being locked to a single one - see php/security/access_control.php
  // and StaffPropertyPicker.tsx. Never spans tenants.
  accessAllProperties?: boolean;
  // Flat day-rate for staff paid daily rather than a monthly salary -
  // independent figure, not derived from monthlySalary (see the identical
  // field on UserAccount below). Added 24 Aug 2026 - this type never carried
  // it at all, even though the backend (`get_users`) always returned it, so
  // it silently vanished on the StaffMember round-trip: a save could write a
  // real dailyWage to the DB correctly, but re-fetching it back into this
  // shape had nowhere to put it, and the Edit form (which derives from this
  // type) always rendered the field blank regardless of what was actually
  // saved - found live, reported as "updated details but it didn't save".
  dailyWage?: number;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  staffId: string;
  staffName: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'Paid Leave' | 'Unpaid Leave' | string;
  salaryStatus?: 'pending' | 'processed' | 'paid';
}

export interface SalaryEntry {
  staffId: string;
  staffName: string;
  month: string;
  presentDays: number;
  dailyWage: number;
  totalEarned: number;
  advances: number;
  netPayout: number;
}

export interface StaffAdvance {
  id: string;
  staffId?: string | null; // null for rows predating this column (e.g. kitchen-purchase reimbursement credits, matched by staffName instead)
  staffName: string;
  amount: number;
  date: string;
  month: string;
  reason: string;
  addedBy: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  ip_address?: string;
  browser?: string;
  os?: string;
  device_type?: 'desktop' | 'mobile' | 'tablet';
  status?: 'Success' | 'Failed';
  module?: string;
  user_agent?: string;
}

export interface PayeeEntity {
  id: string;
  name: string;
  upiId?: string;
  qrCodeUrl?: string;
}

export interface UserAccount {
  id: string;
  // Staff Name - human-readable display name, shown everywhere a person needs
  // to be identified (dropdowns, tables, attribution). Never the phone number.
  fullName: string;
  // Username - the 10-digit phone number used to log in. Never shown as a
  // person's display name.
  username: string;
  role: string;
  passcodePin: string;
  isFinancialHandler: boolean;
  qrCodeUrl?: string;
  status: string;
  // Flat day-rate for staff paid daily rather than a monthly salary -
  // independent figure, not derived from monthlySalary.
  dailyWage?: number;
  // When true, this staff member can log into any property under their own
  // tenant instead of being locked to a single one - see php/security/access_control.php
  // and StaffPropertyPicker.tsx. Never spans tenants.
  accessAllProperties?: boolean;
}

export interface TelegramTemplate {
  id: string;
  eventName: string;
  eventKey: 'kotOrders' | 'guestCheckout' | 'materialRequisitions' | 'lowStockAlerts' | 'pettyCashExpenses';
  template: string;
  variables: string[];
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  botUsername: string;
  enabledEvents: {
    kotOrders: boolean;
    guestCheckout: boolean;
    materialRequisitions: boolean;
    lowStockAlerts: boolean;
    pettyCashExpenses: boolean;
  };
  templates?: TelegramTemplate[];
}

export interface TelegramGroup {
  key: string;
  name: string;
  chatId: string;
}

// Per-property Telegram connection settings: bot token, named group chats, and
// which group each notification category (kitchen/finance/admin) routes to.
// Persisted server-side via get_telegram_config / save_telegram_config.
export interface PropertyTelegramConfig {
  enabled: boolean;
  botToken: string | null;
  groups: TelegramGroup[];
  routing: Record<string, string>;
  reminderThresholdMinutes?: number;
}

export interface TelegramDispatchLog {
  id: string;
  timestamp: string;
  eventType: string;
  message: string;
  status: 'Delivered' | 'Pending' | 'Failed' | string;
  replyMarkup?: any;
}

export interface CashDrawerEntry {
  id: string | number;
  staff_id: string;
  staff_name: string;
  type: 'handover' | 'manual_adjustment';
  amount: number;
  handed_to?: string;
  notes?: string;
  created_at: string;
}

export interface CashDrawerSummary {
  staffId: string;
  staffName: string;
  username: string;
  role: string;
  cashCollected: number;
  cashExpenses: number;
  // Portion of cashExpenses a staff member paid for personally (e.g. a kitchen
  // purchase covered out of pocket) rather than out of a held cash drawer -
  // used by the payout calculator to credit it back against their net drawer.
  outOfPocketExpenses?: number;
  drawerHandovers: number;
  manualAdjustments: number;
  netBalance: number;
}

export interface ApiStatus {
  status: string;
  system: string;
  version: string;
  server_time: string;
  modules: Record<string, string>;
}
