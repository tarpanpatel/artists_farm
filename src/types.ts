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
}

export interface BillingReceipt {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  checkinDate: string;
  checkoutDate: string;
  roomRatePerNight: number;
  nightsCount: number;
  roomTotal: number;
  kitchenTotal: number;
  miscTotal: number;
  discount: number;
  grandTotal: number;
  status: 'Paid' | 'Pending';
  paidAt?: string;
  paymentMethod?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: 'Starters' | 'Chinese' | 'Pizza & Sandwich' | 'Main Course' | 'Rice & Roti' | 'Breakfast' | 'Raita & Salad' | 'Beverages' | string;
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
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
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

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
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
  role: 'Manager' | 'Chef' | 'Housekeeping' | 'Farm Supervisor' | 'Kitchen Assistant';
  phone: string;
  monthlySalary: number;
  status: 'Active' | 'Inactive';
}

export interface AttendanceRecord {
  id: string;
  date: string;
  staffId: string;
  staffName: string;
  status: 'Present' | 'Absent' | 'Half Day';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
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
  role: 'Super Admin' | 'Admin' | 'Staff' | 'Staff Kitchen' | 'Manager' | 'Chef' | 'Front Desk';
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

