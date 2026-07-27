export interface Guest {
  id: string;
  guestName: string;
  phoneNumber: string;
  checkinDate: string;
  expectedCheckout: string;
  checkoutDate?: string;
  roomNumber: string;
  status: 'Active' | 'CheckedOut' | 'Booked';
  notes?: string;
  bookingSource?: string;
  numberOfGuests?: number;
  roomRate?: number;
  advanceAmount?: number;
  foodBill?: number;
  totalAmount?: number;
  paymentStatus?: string;
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
  id: string;
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
  category?: string;
  description?: string;
  iconName: string;
  order: number;
  roles: string[]; // e.g. ['Super Admin', 'Manager', 'Chef', 'Staff']
  isVisible: boolean;
  customUrl?: string;
  openInNewTab?: boolean;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  price?: number;
}

export interface Order {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  orderTime: string;
  status: 'Pending' | 'Preparing' | 'Fulfilled' | 'Cancelled';
  items: OrderItem[];
  totalAmount: number;
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
  invoiceBillUrl?: string;
  paymentScreenshotUrl?: string;
  type?: 'Expense' | 'Replenishment';
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'Manager' | 'Chef' | 'Housekeeping' | 'Farm Supervisor' | 'Kitchen Assistant' | 'Super Admin' | 'Admin' | 'Staff' | 'Staff Supervisor' | 'Staff Kitchen' | 'Front Desk' | string;
  phone: string;
  monthlySalary: number;
  status: 'Active' | 'Inactive';
  // Optional fields populated from UserAccount / DB
  username?: string;
  passcode?: string;
  passcodePin?: string;
  isFinancialHandler?: boolean;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  staffId: string;
  staffName: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'Paid Leave' | 'Unpaid Leave' | string;
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
  type: 'Vendor' | 'Third Party';
  qrCodeUrl?: string;
}

export interface UserAccount {
  id: string;
  username: string;
  role: string;
  passcodePin: string;
  isFinancialHandler: boolean;
  qrCodeUrl?: string;
  status: 'Active' | 'Inactive';
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
  type: 'handover' | 'market_expense' | 'manual_adjustment';
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
  drawerHandovers: number;
  marketExpenses: number;
  manualAdjustments: number;
  netBalance: number;
}

