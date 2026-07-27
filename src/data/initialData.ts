import {
  Guest,
  BillingReceipt,
  MenuItem,
  Order,
  InventoryItem,
  Requisition,
  PettyCashEntry,
  StaffMember,
  AttendanceRecord,
  AuditLog,
  UserAccount,
  PayeeEntity
} from '../types';

export const INITIAL_GUESTS: Guest[] = [
  {
    id: '10',
    guestName: 'Villa 101 Resident Group',
    phoneNumber: '8888888',
    checkinDate: '2026-07-20',
    expectedCheckout: '2026-07-21',
    checkoutDate: '2026-07-21',
    roomNumber: 'Villa 101',
    status: 'Active',
    notes: 'Jain Food & Misc Arrangement (+₹200)'
  },
  {
    id: '8',
    guestName: 'Jain Group',
    phoneNumber: '8888888',
    checkinDate: '2026-07-17',
    expectedCheckout: '2026-07-18',
    checkoutDate: '2026-07-18',
    roomNumber: 'Villa 102',
    status: 'Booked',
    notes: 'Jain Food requested - Advance ₹5000'
  },
  {
    id: '7',
    guestName: 'Current Active Guest',
    phoneNumber: '9777777777',
    checkinDate: '2026-07-16',
    expectedCheckout: '2026-07-17',
    checkoutDate: '2026-07-16',
    roomNumber: 'Royal Cottage 1',
    status: 'CheckedOut',
    notes: 'Decoration Fees ₹1900, Discount Rebate ₹200'
  },
  {
    id: '9',
    guestName: 'Private Guest',
    phoneNumber: '333333333',
    checkinDate: '2026-07-16',
    expectedCheckout: '2026-07-17',
    checkoutDate: '2026-07-19',
    roomNumber: 'Villa 103',
    status: 'CheckedOut',
    notes: 'Decoration Fees ₹500, Discount Rebate ₹6'
  },
  {
    id: '6',
    guestName: 'Joshi Group (15 Jul)',
    phoneNumber: '9666666666',
    checkinDate: '2026-07-15',
    expectedCheckout: '2026-07-16',
    checkoutDate: '2026-07-16',
    roomNumber: 'Villa 103',
    status: 'CheckedOut',
    notes: 'Settled - Advance ₹5000 by Tarpan'
  },
  {
    id: '5',
    guestName: 'Singh Group (14 Jul)',
    phoneNumber: '9555555555',
    checkinDate: '2026-07-14',
    expectedCheckout: '2026-07-15',
    checkoutDate: '2026-07-15',
    roomNumber: 'Villa 104',
    status: 'CheckedOut',
    notes: 'Settled - Advance ₹5000 by Tarpan'
  },
  {
    id: '4',
    guestName: 'Mishra Group (13 Jul)',
    phoneNumber: '9444444444',
    checkinDate: '2026-07-13',
    expectedCheckout: '2026-07-14',
    checkoutDate: '2026-07-14',
    roomNumber: 'Villa 102',
    status: 'CheckedOut',
    notes: 'Settled - Advance ₹3000 by Tarpan'
  },
  {
    id: '3',
    guestName: 'Mehta Group (12 Jul)',
    phoneNumber: '9333333333',
    checkinDate: '2026-07-12',
    expectedCheckout: '2026-07-13',
    checkoutDate: '2026-07-13',
    roomNumber: 'Villa 101',
    status: 'CheckedOut',
    notes: 'Settled - Advance ₹6000 by Tarpan'
  },
  {
    id: '2',
    guestName: 'Verma Group (11 Jul)',
    phoneNumber: '9222222222',
    checkinDate: '2026-07-11',
    expectedCheckout: '2026-07-12',
    checkoutDate: '2026-07-12',
    roomNumber: 'Cottage 2',
    status: 'CheckedOut',
    notes: 'Settled - Advance ₹4000 by Tarpan'
  },
  {
    id: '1',
    guestName: 'Sharma Group (10 Jul)',
    phoneNumber: '9111111111',
    checkinDate: '2026-07-10',
    expectedCheckout: '2026-07-11',
    checkoutDate: '2026-07-11',
    roomNumber: 'Cottage 1',
    status: 'CheckedOut',
    notes: 'Settled - Advance ₹5000 by Tarpan'
  }
];

export const INITIAL_RECEIPTS: BillingReceipt[] = [
  {
    id: 'REC-2026-010',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    checkinDate: '2026-07-20',
    checkoutDate: '2026-07-21',
    roomRatePerNight: 6000,
    nightsCount: 2,
    roomTotal: 12000,
    kitchenTotal: 2293,
    miscTotal: 200,
    discount: 0,
    grandTotal: 4493,
    status: 'Paid',
    paidAt: '2026-07-21 11:30 AM',
    paymentMethod: 'Cash'
  },
  {
    id: 'REC-2026-007',
    guestId: '7',
    guestName: 'Current Active Guest',
    roomNumber: 'Royal Cottage 1',
    checkinDate: '2026-07-16',
    checkoutDate: '2026-07-16',
    roomRatePerNight: 17000,
    nightsCount: 1,
    roomTotal: 17000,
    kitchenTotal: 6414,
    miscTotal: 1900,
    discount: 200,
    grandTotal: 25114,
    status: 'Paid',
    paidAt: '2026-07-16 12:59 PM',
    paymentMethod: 'UPI'
  },
  {
    id: 'REC-2026-006',
    guestId: '6',
    guestName: 'Joshi Group (15 Jul)',
    roomNumber: 'Villa 103',
    checkinDate: '2026-07-15',
    checkoutDate: '2026-07-16',
    roomRatePerNight: 13500,
    nightsCount: 1,
    roomTotal: 13500,
    kitchenTotal: 347,
    miscTotal: 0,
    discount: 0,
    grandTotal: 13847,
    status: 'Paid',
    paidAt: '2026-07-16 11:00 AM',
    paymentMethod: 'Cash'
  }
];

export const INITIAL_MENU: MenuItem[] = [
  // Starters
  { id: 1, name: 'Paneer Tikka (8-10pcs)', category: 'Starters', price: 249, available: true },
  { id: 2, name: 'Paneer Pakoda (10pcs)', category: 'Starters', price: 195, available: true },
  { id: 3, name: 'Pyaz Pakoda (10pcs)', category: 'Starters', price: 149, available: true },
  { id: 4, name: 'Aloo Pakoda (6-8pcs)', category: 'Starters', price: 149, available: true },
  { id: 5, name: 'Mix-Veg Pakoda (12pcs)', category: 'Starters', price: 198, available: true },
  { id: 6, name: 'Kabuli Chana Chaat', category: 'Starters', price: 149, available: true },
  { id: 7, name: 'Kaala Chana Chaat', category: 'Starters', price: 149, available: true },
  { id: 8, name: 'Peanut Masala', category: 'Starters', price: 125, available: true },
  { id: 9, name: 'Pani Puri (8)', category: 'Starters', price: 49, available: true },
  { id: 10, name: 'French Fries Regular', category: 'Starters', price: 149, available: true },
  { id: 11, name: 'French Fries Peri-Peri', category: 'Starters', price: 179, available: true },
  { id: 12, name: 'Chicken Tikka', category: 'Starters', price: 359, available: true },
  { id: 13, name: 'Chicken Seekh Kebab', category: 'Starters', price: 289, available: true },
  { id: 14, name: 'Mutton Seekh Kebab', category: 'Starters', price: 389, available: true },
  { id: 15, name: 'Roasted Papad', category: 'Starters', price: 30, available: true },
  { id: 16, name: 'Fried Papad', category: 'Starters', price: 40, available: true },
  { id: 17, name: 'Masala Papad', category: 'Starters', price: 49, available: true },
  { id: 74, name: 'Laal Maans', category: 'Starters', price: 800, available: true },

  // Chinese
  { id: 18, name: 'Chow mein', category: 'Chinese', price: 149, available: true },
  { id: 19, name: 'Veg Spring roll (6-8pcs)', category: 'Chinese', price: 149, available: true },
  { id: 20, name: 'Chilly Paneer (8-10pcs)', category: 'Chinese', price: 249, available: true },
  { id: 21, name: 'Chilly Potatoes (8-10pcs)', category: 'Chinese', price: 198, available: true },
  { id: 22, name: 'Sweet Corn Chaat', category: 'Chinese', price: 198, available: true },
  { id: 23, name: 'Maggie Regular', category: 'Chinese', price: 98, available: true },
  { id: 24, name: 'Masala Maggie', category: 'Chinese', price: 149, available: true },
  { id: 25, name: 'Chinese Pakoda (6-8pcs)', category: 'Chinese', price: 169, available: true },

  // Pizza & Sandwich
  { id: 26, name: 'OTC Pizza', category: 'Pizza & Sandwich', price: 198, available: true },
  { id: 27, name: 'Paneer Pizza', category: 'Pizza & Sandwich', price: 298, available: true },
  { id: 28, name: 'Cheese Corn Pizza', category: 'Pizza & Sandwich', price: 298, available: true },
  { id: 29, name: 'Veg Grilled Sandwich', category: 'Pizza & Sandwich', price: 149, available: true },
  { id: 30, name: 'Cheese Grilled Sandwich', category: 'Pizza & Sandwich', price: 198, available: true },
  { id: 31, name: 'Cheesy Garlic Bread (6pcs)', category: 'Pizza & Sandwich', price: 149, available: true },

  // Main Course
  { id: 32, name: 'Shahi Paneer', category: 'Main Course', price: 285, available: true },
  { id: 33, name: 'Kadhai Paneer', category: 'Main Course', price: 285, available: true },
  { id: 34, name: 'Paneer Butter Masala', category: 'Main Course', price: 285, available: true },
  { id: 35, name: 'Chicken Curry (4pcs)', category: 'Main Course', price: 389, available: true },
  { id: 36, name: 'Mutton Curry (4pcs)', category: 'Main Course', price: 489, available: true },
  { id: 37, name: 'Paneer Bhurji', category: 'Main Course', price: 298, available: true },
  { id: 38, name: 'Jeera Aloo', category: 'Main Course', price: 249, available: true },
  { id: 39, name: 'Gatta Masala', category: 'Main Course', price: 198, available: true },
  { id: 40, name: 'Daal Tadka', category: 'Main Course', price: 198, available: true },
  { id: 41, name: 'Daal Fry', category: 'Main Course', price: 149, available: true },
  { id: 42, name: 'Kadhi Pakoda', category: 'Main Course', price: 198, available: true },
  { id: 43, name: 'Sev Tamatar', category: 'Main Course', price: 249, available: true },
  { id: 44, name: 'Dinner Buffet (Per Person)', category: 'Main Course', price: 600, available: true },

  // Rice & Roti
  { id: 45, name: 'Plain Rice', category: 'Rice & Roti', price: 198, available: true },
  { id: 46, name: 'Jeera Rice', category: 'Rice & Roti', price: 248, available: true },
  { id: 47, name: 'Veg Pulao', category: 'Rice & Roti', price: 298, available: true },
  { id: 48, name: 'Plain Chapati', category: 'Rice & Roti', price: 29, available: true },
  { id: 49, name: 'Chapati With Butter', category: 'Rice & Roti', price: 38, available: true },
  { id: 50, name: 'Paratha Plain', category: 'Rice & Roti', price: 59, available: true },
  { id: 51, name: 'Aloo Paratha', category: 'Rice & Roti', price: 149, available: true },
  { id: 52, name: 'Pyaz Paratha', category: 'Rice & Roti', price: 149, available: true },

  // Breakfast
  { id: 53, name: 'Bread Toast Butter (2)', category: 'Breakfast', price: 50, available: true },
  { id: 54, name: 'Bread Toast Jam (2)', category: 'Breakfast', price: 60, available: true },
  { id: 55, name: 'Boiled Eggs', category: 'Breakfast', price: 149, available: true },
  { id: 56, name: 'Egg Bhurji', category: 'Breakfast', price: 149, available: true },
  { id: 57, name: 'Poha', category: 'Breakfast', price: 98, available: true },
  { id: 58, name: 'Bread Pakoda', category: 'Breakfast', price: 98, available: true },
  { id: 59, name: 'French Toast', category: 'Breakfast', price: 149, available: true },
  { id: 60, name: 'Omelette', category: 'Breakfast', price: 98, available: true },
  { id: 61, name: 'Breakfast Buffet (Per Person)', category: 'Breakfast', price: 300, available: true },

  // Raita & Salad
  { id: 62, name: 'Boondi Raita', category: 'Raita & Salad', price: 95, available: true },
  { id: 63, name: 'Veg Raita', category: 'Raita & Salad', price: 149, available: true },
  { id: 64, name: 'Plain Curd', category: 'Raita & Salad', price: 58, available: true },
  { id: 65, name: 'Chaach', category: 'Raita & Salad', price: 68, available: true },
  { id: 66, name: 'Green Salad', category: 'Raita & Salad', price: 119, available: true },

  // Beverages
  { id: 67, name: 'Regular Tea', category: 'Beverages', price: 48, available: true },
  { id: 68, name: 'Masala Tea', category: 'Beverages', price: 58, available: true },
  { id: 69, name: 'Coffee', category: 'Beverages', price: 80, available: true },
  { id: 70, name: 'Cold Coffee', category: 'Beverages', price: 148, available: true },
  { id: 71, name: 'Nimbu Pani', category: 'Beverages', price: 49, available: true },
  { id: 72, name: 'Nimbu Soda', category: 'Beverages', price: 59, available: true },
  { id: 73, name: 'Hot Chocolate', category: 'Beverages', price: 249, available: true },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'KOT-40',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-23 19:02:51',
    status: 'Pending',
    items: [
      { menuItemId: 10, name: 'French Fries Regular', quantity: 1, unitPrice: 149 },
      { menuItemId: 16, name: 'Fried Papad', quantity: 1, unitPrice: 40 }
    ],
    totalAmount: 189
  },
  {
    id: 'KOT-39',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-23 18:52:27',
    status: 'Pending',
    items: [
      { menuItemId: 12, name: 'Chicken Tikka', quantity: 1, unitPrice: 359 },
      { menuItemId: 13, name: 'Chicken Seekh Kebab', quantity: 1, unitPrice: 289 }
    ],
    totalAmount: 648
  },
  {
    id: 'KOT-37',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-21 19:54:55',
    status: 'Pending',
    items: [
      { menuItemId: 11, name: 'French Fries Peri-Peri', quantity: 1, unitPrice: 179 }
    ],
    totalAmount: 179
  },
  {
    id: 'KOT-36',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-21 19:53:35',
    status: 'Fulfilled',
    items: [
      { menuItemId: 4, name: 'Aloo Pakoda (6-8pcs)', quantity: 1, unitPrice: 149 }
    ],
    totalAmount: 149
  },
  {
    id: 'KOT-35',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-21 19:52:58',
    status: 'Pending',
    items: [
      { menuItemId: 10, name: 'French Fries Regular', quantity: 1, unitPrice: 149 },
      { menuItemId: 16, name: 'Fried Papad', quantity: 1, unitPrice: 40 }
    ],
    totalAmount: 189
  },
  {
    id: 'KOT-34',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-21 19:45:53',
    status: 'Fulfilled',
    items: [
      { menuItemId: 3, name: 'Pyaz Pakoda (10pcs)', quantity: 1, unitPrice: 149 },
      { menuItemId: 8, name: 'Peanut Masala', quantity: 1, unitPrice: 125 }
    ],
    totalAmount: 274
  },
  {
    id: 'KOT-33',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-21 19:45:49',
    status: 'Pending',
    items: [
      { menuItemId: 2, name: 'Paneer Pakoda (10pcs)', quantity: 1, unitPrice: 195 },
      { menuItemId: 5, name: 'Mix-Veg Pakoda (12pcs)', quantity: 1, unitPrice: 198 },
      { menuItemId: 14, name: 'Mutton Seekh Kebab', quantity: 1, unitPrice: 389 }
    ],
    totalAmount: 782
  },
  {
    id: 'KOT-30',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-21 17:27:37',
    status: 'Fulfilled',
    items: [
      { menuItemId: 10, name: 'French Fries Regular', quantity: 1, unitPrice: 149 },
      { menuItemId: 11, name: 'French Fries Peri-Peri', quantity: 1, unitPrice: 179 }
    ],
    totalAmount: 328
  },
  {
    id: 'KOT-29',
    guestId: '10',
    guestName: 'Villa 101 Resident Group',
    roomNumber: 'Villa 101',
    orderTime: '2026-07-21 10:54:01',
    status: 'Fulfilled',
    items: [
      { menuItemId: 11, name: 'French Fries Peri-Peri', quantity: 1, unitPrice: 179 },
      { menuItemId: 12, name: 'Chicken Tikka', quantity: 1, unitPrice: 359 },
      { menuItemId: 13, name: 'Chicken Seekh Kebab', quantity: 1, unitPrice: 289 },
      { menuItemId: 74, name: 'Laal Maans', quantity: 1, unitPrice: 800 }
    ],
    totalAmount: 1627
  },
  {
    id: 'KOT-24',
    guestId: '9',
    guestName: 'Private Guest',
    roomNumber: 'Villa 103',
    orderTime: '2026-07-18 07:14:26',
    status: 'Fulfilled',
    items: [
      { menuItemId: 35, name: 'Chicken Curry (4pcs)', quantity: 3, unitPrice: 389 },
      { menuItemId: 36, name: 'Mutton Curry (4pcs)', quantity: 2, unitPrice: 489 },
      { menuItemId: 39, name: 'Gatta Masala', quantity: 2, unitPrice: 198 },
      { menuItemId: 41, name: 'Daal Fry', quantity: 2, unitPrice: 149 },
      { menuItemId: 48, name: 'Plain Chapati', quantity: 6, unitPrice: 29 }
    ],
    totalAmount: 3012
  },
  {
    id: 'KOT-8',
    guestId: '7',
    guestName: 'Current Active Guest',
    roomNumber: 'Royal Cottage 1',
    orderTime: '2026-07-15 19:59:17',
    status: 'Fulfilled',
    items: [
      { menuItemId: 12, name: 'Chicken Tikka', quantity: 2, unitPrice: 359 },
      { menuItemId: 13, name: 'Chicken Seekh Kebab', quantity: 3, unitPrice: 289 },
      { menuItemId: 51, name: 'Aloo Paratha', quantity: 1, unitPrice: 149 },
      { menuItemId: 65, name: 'Chaach', quantity: 1, unitPrice: 68 },
      { menuItemId: 35, name: 'Chicken Curry (4pcs)', quantity: 2, unitPrice: 389 },
      { menuItemId: 55, name: 'Boiled Eggs', quantity: 1, unitPrice: 149 },
      { menuItemId: 47, name: 'Veg Pulao', quantity: 1, unitPrice: 298 },
      { menuItemId: 45, name: 'Plain Rice', quantity: 1, unitPrice: 198 },
      { menuItemId: 61, name: 'Breakfast Buffet (Per Person)', quantity: 1, unitPrice: 300 },
      { menuItemId: 9, name: 'Pani Puri (8)', quantity: 1, unitPrice: 49 }
    ],
    totalAmount: 3374
  }
];

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

export const CATEGORIES_DATA: Category[] = [
{ id: 1, name: "Spices & Seasonings" },
{ id: 2, name: "Flours & Grains" },
{ id: 3, name: "Lentils & Pulses" },
{ id: 4, name: "Oils & Dairy Staples" },
{ id: 5, name: "Vegetables & Fresh Produce" },
{ id: 6, name: "Fruits & Desserts" },
{ id: 7, name: "Chinese & Continental Sauces" },
{ id: 8, name: "Beverages & Breakfast" },
{ id: 9, name: "Housekeeping & Disposables" },
{ id: 10, name: "Dairy" },
{ id: 11, name: "Bakery" },
{ id: 12, name: "Frozen / Cold" },
{ id: 13, name: "Sauce" },
{ id: 14, name: "Non Veg" },
{ id: 15, name: "Vegetables" },
{ id: 16, name: "Crockery & Cutlery" },
{ id: 17, name: "Disposables" },
{ id: 18, name: "Kitchen Appliance Repairs" }
];

export const initialCatalogItems: CatalogItem[] = [
// 1. Spices & Seasonings (Category ID: 1)
{ id: 1, name: "Aachar", category: "Spices & Seasonings", categoryId: 1, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 3, name: "Ajino Moto", category: "Spices & Seasonings", categoryId: 1, price: 15.00, packSize: 1.00, packUnit: "Gm", unitLabel: "Gm", is_verified: true },
{ id: 23, name: "Chhola Masala", category: "Spices & Seasonings", categoryId: 1, price: 250.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 32, name: "Dalchini", category: "Spices & Seasonings", categoryId: 1, price: 100.00, packSize: 100.00, packUnit: "Gms", unitLabel: "Gms", is_verified: true },
{ id: 33, name: "Degi Mirchi Powder", category: "Spices & Seasonings", categoryId: 1, price: 250.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 34, name: "Dhaniya", category: "Spices & Seasonings", categoryId: 1, price: 250.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 35, name: "Dhaniya Powder", category: "Spices & Seasonings", categoryId: 1, price: 250.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 38, name: "Doda Elaichi", category: "Spices & Seasonings", categoryId: 1, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 55, name: "Haldi", category: "Spices & Seasonings", categoryId: 1, price: 250.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 61, name: "Jeera", category: "Spices & Seasonings", categoryId: 1, price: 340.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 75, name: "Mirchi", category: "Spices & Seasonings", categoryId: 1, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 77, name: "Mirchi Red", category: "Spices & Seasonings", categoryId: 1, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 78, name: "Mix Aachar", category: "Spices & Seasonings", categoryId: 1, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 100, name: "Salt", category: "Spices & Seasonings", categoryId: 1, price: 29.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 119, name: "Strawberries", category: "Spices & Seasonings", categoryId: 1, price: 300.00, packSize: 1.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 120, name: "Chiku", category: "Spices & Seasonings", categoryId: 1, price: 120.00, packSize: 1.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 121, name: "Amla", category: "Spices & Seasonings", categoryId: 1, price: 130.00, packSize: 1.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 122, name: "Ragi Flour", category: "Spices & Seasonings", categoryId: 1, price: 350.00, packSize: 1.00, packUnit: "Gm", unitLabel: "Gm", is_verified: true },
{ id: 123, name: "Jwar Atta", category: "Spices & Seasonings", categoryId: 1, price: 128.00, packSize: 250.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 124, name: "White Flour", category: "Spices & Seasonings", categoryId: 1, price: 140.00, packSize: 250.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 125, name: "oats", category: "Spices & Seasonings", categoryId: 1, price: 420.00, packSize: 2.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 160, name: "Mirch Powder", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 161, name: "Jeera powder", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 162, name: "Garam Masala", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 163, name: "Black Pepper", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 164, name: "Kitchen king Masala", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 165, name: "Chat Masala", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 166, name: "Chilli flake", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Gms", unitLabel: "Gms", is_verified: true },
{ id: 167, name: "Tea Masala", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 177, name: "Basmati Rice", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pc", unitLabel: "Pc", is_verified: true },
{ id: 178, name: "LPG Gas Cylinder", category: "Spices & Seasonings", categoryId: 1, price: 0.00, packSize: 1.00, packUnit: "Pc", unitLabel: "Pc", is_verified: true },

// 2. Flours & Grains (Category ID: 2)
{ id: 6, name: "Atta", category: "Flours & Grains", categoryId: 2, price: 40.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 7, name: "Bajara Atta", category: "Flours & Grains", categoryId: 2, price: 45.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 9, name: "Basan", category: "Flours & Grains", categoryId: 2, price: 86.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 53, name: "Guest Rice", category: "Flours & Grains", categoryId: 2, price: 110.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 69, name: "Maida", category: "Flours & Grains", categoryId: 2, price: 48.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 96, name: "Poha", category: "Flours & Grains", categoryId: 2, price: 76.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 105, name: "Staff Rice", category: "Flours & Grains", categoryId: 2, price: 110.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 126, name: "Black Flour", category: "Flours & Grains", categoryId: 2, price: 0.00, packSize: 100.00, packUnit: "Gms", unitLabel: "Kg", is_verified: true },
{ id: 141, name: "papad", category: "Flours & Grains", categoryId: 2, price: 0.00, packSize: 1.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 143, name: "Corn flour", category: "Flours & Grains", categoryId: 2, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 144, name: "Sev tomato", category: "Flours & Grains", categoryId: 2, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 3. Lentils & Pulses (Category ID: 3)
{ id: 70, name: "Masoor Dal", category: "Lentils & Pulses", categoryId: 3, price: 90.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 79, name: "Moong Mogar Dal", category: "Lentils & Pulses", categoryId: 3, price: 110.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 115, name: "Urad Dal", category: "Lentils & Pulses", categoryId: 3, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 138, name: "Moong dal", category: "Lentils & Pulses", categoryId: 3, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 139, name: "Chana dal", category: "Lentils & Pulses", categoryId: 3, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 140, name: "Arhar dal", category: "Lentils & Pulses", categoryId: 3, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 4. Oils & Dairy Staples (Category ID: 4)
{ id: 22, name: "Cheese", category: "Oils & Dairy Staples", categoryId: 4, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 29, name: "Cream", category: "Oils & Dairy Staples", categoryId: 4, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 36, name: "Diced Cheese", category: "Oils & Dairy Staples", categoryId: 4, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 81, name: "Mustard Oil", category: "Oils & Dairy Staples", categoryId: 4, price: 180.00, packSize: 1.00, packUnit: "Liter", unitLabel: "Liter", is_verified: true },
{ id: 85, name: "Oil", category: "Oils & Dairy Staples", categoryId: 4, price: 2539.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 103, name: "Slice Cheese", category: "Oils & Dairy Staples", categoryId: 4, price: 275.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 5. Vegetables & Fresh Produce (Category ID: 5)
{ id: 44, name: "Garlic Chila Huaa", category: "Vegetables & Fresh Produce", categoryId: 5, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 48, name: "Gobhi", category: "Vegetables & Fresh Produce", categoryId: 5, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 51, name: "Green Mirchi Small", category: "Vegetables & Fresh Produce", categoryId: 5, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 52, name: "Green Pea", category: "Vegetables & Fresh Produce", categoryId: 5, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 57, name: "Hari Mirchi", category: "Vegetables & Fresh Produce", categoryId: 5, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 74, name: "Mint", category: "Vegetables & Fresh Produce", categoryId: 5, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 102, name: "Shimla Mirch Red", category: "Vegetables & Fresh Produce", categoryId: 5, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 6. Fruits & Desserts (Category ID: 6)
{ id: 4, name: "Apple", category: "Fruits & Desserts", categoryId: 6, price: 200.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 8, name: "Banana", category: "Fruits & Desserts", categoryId: 6, price: 60.00, packSize: 1.00, packUnit: "Doz", unitLabel: "Doz", is_verified: true },
{ id: 28, name: "Coconut Powder", category: "Fruits & Desserts", categoryId: 6, price: 250.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 54, name: "Gulab Jamun", category: "Fruits & Desserts", categoryId: 6, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 60, name: "Jam Jam", category: "Fruits & Desserts", categoryId: 6, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 118, name: "Oranges", category: "Fruits & Desserts", categoryId: 6, price: 80.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 157, name: "Mango", category: "Fruits & Desserts", categoryId: 6, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 158, name: "Papaya", category: "Fruits & Desserts", categoryId: 6, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 159, name: "Watermelon", category: "Fruits & Desserts", categoryId: 6, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },

// 7. Chinese & Continental Sauces (Category ID: 7)
{ id: 16, name: "Bread Crumb", category: "Chinese & Continental Sauces", categoryId: 7, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 27, name: "Chocolate Sauce", category: "Chinese & Continental Sauces", categoryId: 7, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 84, name: "Noodles", category: "Chinese & Continental Sauces", categoryId: 7, price: 60.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 93, name: "Pizza Cheese", category: "Chinese & Continental Sauces", categoryId: 7, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 111, name: "Thousand Sauce", category: "Chinese & Continental Sauces", categoryId: 7, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 142, name: "Maggi", category: "Chinese & Continental Sauces", categoryId: 7, price: 0.00, packSize: 1.00, packUnit: "Box", unitLabel: "Box", is_verified: true },

// 8. Beverages & Breakfast (Category ID: 8)
{ id: 2, name: "Aarmant", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 12, name: "Biscuit", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 14, name: "Bowl", category: "Beverages & Breakfast", categoryId: 8, price: 95.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 40, name: "Fish", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 63, name: "Kaju", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 64, name: "Kala Chana", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 68, name: "Magaj", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 83, name: "Namkeen", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 88, name: "Palak", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 90, name: "Peanut", category: "Beverages & Breakfast", categoryId: 8, price: 160.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 110, name: "Tash Patti", category: "Beverages & Breakfast", categoryId: 8, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 9. Housekeeping & Disposables (Category ID: 9)
{ id: 13, name: "Black Polish", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 31, name: "Cylinder", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 37, name: "Dish Wash", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 42, name: "Garbage Bag", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 47, name: "Glass Water", category: "Housekeeping & Disposables", categoryId: 9, price: 35.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 56, name: "Happy Birthday Name", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 62, name: "Juna", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 72, name: "Match Box", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 87, name: "Other", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 91, name: "Pink Balloon", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Pack", unitLabel: "Pack", is_verified: true },
{ id: 95, name: "Plate", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 98, name: "Red Balloon", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 106, name: "Sugar", category: "Housekeeping & Disposables", categoryId: 9, price: 46.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 107, name: "Surf Excel", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 112, name: "Tissue", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 116, name: "Vim Bar", category: "Housekeeping & Disposables", categoryId: 9, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 172, name: "RO", category: "Housekeeping & Disposables", categoryId: 9, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },

// 10. Dairy (Category ID: 10)
{ id: 18, name: "Butter", category: "Dairy", categoryId: 10, price: 620.00, packSize: 1.00, packUnit: "Gms", unitLabel: "Kg", is_verified: true },
{ id: 30, name: "Curd", category: "Dairy", categoryId: 10, price: 80.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 45, name: "Ghee", category: "Dairy", categoryId: 10, price: 570.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 73, name: "Milk", category: "Dairy", categoryId: 10, price: 56.00, packSize: 1.00, packUnit: "Liter", unitLabel: "Liter", is_verified: true },
{ id: 89, name: "Paneer", category: "Dairy", categoryId: 10, price: 300.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 176, name: "Amul Butter", category: "Dairy", categoryId: 10, price: 63.00, packSize: 100.00, packUnit: "Gms", unitLabel: "Gms", is_verified: true },

// 11. Bakery (Category ID: 11)
{ id: 15, name: "Bread", category: "Bakery", categoryId: 11, price: 60.00, packSize: 1.00, packUnit: "Pack", unitLabel: "Pack", is_verified: true },
{ id: 92, name: "Pizza Base", category: "Bakery", categoryId: 11, price: 50.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 12. Frozen / Cold (Category ID: 12)
{ id: 41, name: "French Fries", category: "Frozen / Cold", categoryId: 12, price: 350.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 58, name: "Ice", category: "Frozen / Cold", categoryId: 12, price: 25.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 59, name: "Ice Cream", category: "Frozen / Cold", categoryId: 12, price: 100.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 80, name: "Mozzarella Cheese", category: "Frozen / Cold", categoryId: 12, price: 550.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 104, name: "Spring Roll Sheet", category: "Frozen / Cold", categoryId: 12, price: 220.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 109, name: "Sweet Corn", category: "Frozen / Cold", categoryId: 12, price: 360.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 127, name: "Cheese Slice", category: "Frozen / Cold", categoryId: 12, price: 0.00, packSize: 1.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },

// 13. Sauce (Category ID: 13)
{ id: 49, name: "Green Chili Sauce", category: "Sauce", categoryId: 13, price: 60.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 94, name: "Pizza Sauce", category: "Sauce", categoryId: 13, price: 210.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 99, name: "Red Chili Sauce", category: "Sauce", categoryId: 13, price: 60.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 108, name: "Sweet Chili Sauce", category: "Sauce", categoryId: 13, price: 270.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 114, name: "Tomato Ketchup", category: "Sauce", categoryId: 13, price: 105.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 130, name: "Ketchup", category: "Sauce", categoryId: 13, price: 0.00, packSize: 1.00, packUnit: "Packets", unitLabel: "Packets", is_verified: true },
{ id: 131, name: "Sweet Chilli Sauce", category: "Sauce", categoryId: 13, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 14. Non Veg (Category ID: 14)
{ id: 24, name: "Chicken", category: "Non Veg", categoryId: 14, price: 240.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 25, name: "Chicken Boneless", category: "Non Veg", categoryId: 14, price: 280.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 26, name: "Chicken Seekh Kabab", category: "Non Veg", categoryId: 14, price: 700.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 39, name: "Eggs", category: "Non Veg", categoryId: 14, price: 210.00, packSize: 1.00, packUnit: "Pc", unitLabel: "Pc", is_verified: true },
{ id: 82, name: "Mutton", category: "Non Veg", categoryId: 14, price: 760.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 128, name: "Boneless Chicken", category: "Non Veg", categoryId: 14, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 129, name: "Mutton Seekh Kabab", category: "Non Veg", categoryId: 14, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 15. Vegetables (Category ID: 15)
{ id: 5, name: "Arbi", category: "Vegetables", categoryId: 15, price: 76.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 10, name: "Beans", category: "Vegetables", categoryId: 15, price: 180.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 11, name: "Bhindi", category: "Vegetables", categoryId: 15, price: 40.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 17, name: "Brinjal", category: "Vegetables", categoryId: 15, price: 60.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 19, name: "Cabbage", category: "Vegetables", categoryId: 15, price: 35.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 20, name: "Carrot", category: "Vegetables", categoryId: 15, price: 80.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 21, name: "Cauliflower", category: "Vegetables", categoryId: 15, price: 50.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 43, name: "Garlic", category: "Vegetables", categoryId: 15, price: 280.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 46, name: "Ginger", category: "Vegetables", categoryId: 15, price: 180.00, packSize: 100.00, packUnit: "Liter", unitLabel: "Gms", is_verified: true },
{ id: 50, name: "Green Mirchi Big", category: "Vegetables", categoryId: 15, price: 80.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 65, name: "Karela", category: "Vegetables", categoryId: 15, price: 50.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 66, name: "Khira", category: "Vegetables", categoryId: 15, price: 38.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 67, name: "Lemon", category: "Vegetables", categoryId: 15, price: 110.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 71, name: "Matar", category: "Vegetables", categoryId: 15, price: 45.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 76, name: "Mirchi Choti", category: "Vegetables", categoryId: 15, price: 120.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 86, name: "Onion", category: "Vegetables", categoryId: 15, price: 25.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 97, name: "Potato", category: "Vegetables", categoryId: 15, price: 18.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 101, name: "Shimla Mirch", category: "Vegetables", categoryId: 15, price: 80.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 113, name: "Tomato", category: "Vegetables", categoryId: 15, price: 54.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 132, name: "Shimla Mirchi", category: "Vegetables", categoryId: 15, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 133, name: "Hari Mirchi choti", category: "Vegetables", categoryId: 15, price: 120.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 134, name: "Hari mirchi Big", category: "Vegetables", categoryId: 15, price: 80.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 135, name: "Kaddu", category: "Vegetables", categoryId: 15, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 136, name: "Sukha Mrchi", category: "Vegetables", categoryId: 15, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },
{ id: 137, name: "Loki", category: "Vegetables", categoryId: 15, price: 0.00, packSize: 1.00, packUnit: "Kg", unitLabel: "Kg", is_verified: true },

// 16. Crockery & Cutlery (Category ID: 16)
{ id: 145, name: "Plates", category: "Crockery & Cutlery", categoryId: 16, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 146, name: "Bowls", category: "Crockery & Cutlery", categoryId: 16, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 147, name: "Cups", category: "Crockery & Cutlery", categoryId: 16, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 148, name: "Glasses", category: "Crockery & Cutlery", categoryId: 16, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 149, name: "Spoons", category: "Crockery & Cutlery", categoryId: 16, price: 40.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 150, name: "Forks", category: "Crockery & Cutlery", categoryId: 16, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 151, name: "Knife", category: "Crockery & Cutlery", categoryId: 16, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },

// 17. Disposables (Category ID: 17)
{ id: 152, name: "Quarter plates", category: "Disposables", categoryId: 17, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 153, name: "Pizza Plates", category: "Disposables", categoryId: 17, price: 120.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 154, name: "Dinner Plates", category: "Disposables", categoryId: 17, price: 170.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 155, name: "Water Glass", category: "Disposables", categoryId: 17, price: 35.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 156, name: "Tissue paper", category: "Disposables", categoryId: 17, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },

// 18. Kitchen Appliance Repairs (Category ID: 18)
{ id: 168, name: "Fridge", category: "Kitchen Appliance Repairs", categoryId: 18, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 169, name: "Mixer", category: "Kitchen Appliance Repairs", categoryId: 18, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 170, name: "Air fryer", category: "Kitchen Appliance Repairs", categoryId: 18, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 171, name: "Exhaust fan", category: "Kitchen Appliance Repairs", categoryId: 18, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 173, name: "Microwave Oven", category: "Kitchen Appliance Repairs", categoryId: 18, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 174, name: "Kettle", category: "Kitchen Appliance Repairs", categoryId: 18, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true },
{ id: 175, name: "Sandwich Maker", category: "Kitchen Appliance Repairs", categoryId: 18, price: 0.00, packSize: 1.00, packUnit: "Pcs", unitLabel: "Pcs", is_verified: true }
];


export const INITIAL_INVENTORY: InventoryItem[] = initialCatalogItems.map(item => ({
  id: item.id.toString(),
  name: item.name,
  category: item.category,
  currentStock: 10,
  minThreshold: 5,
  unit: item.unitLabel
}));


export const INITIAL_REQUISITIONS: Requisition[] = [
  {
    id: 'REQ-1166',
    itemName: 'Green Pea (1 Kg) & Hari Mirchi (1 Kg)',
    requestedQty: 2,
    unit: 'Kg',
    requestedAt: '2026-07-21 16:51:37',
    status: 'Pending',
    requestedBy: 'Tarpan'
  },
  {
    id: 'REQ-1165',
    itemName: 'Black Pepper (1 Pcs) & Basmati Rice (1 Pc)',
    requestedQty: 2,
    unit: 'Pc',
    requestedAt: '2026-07-21 15:35:04',
    status: 'Pending',
    requestedBy: 'Tarpan'
  },
  {
    id: 'REQ-1164',
    itemName: 'Ajino Moto (1 Gm) & Amla (1 Packets)',
    requestedQty: 2,
    unit: 'Packets',
    requestedAt: '2026-07-21 15:23:17',
    status: 'Pending',
    requestedBy: 'Tarpan'
  }
];

export const INITIAL_PETTY_CASH: PettyCashEntry[] = [
  {
    id: '5',
    date: '2026-07-21',
    category: 'Other',
    description: 'Chess board for lounge area',
    vendor: 'Tarpan',
    amount: 120,
    type: 'Expense'
  },
  {
    id: '4',
    date: '2026-07-21',
    category: 'Other',
    description: 'Bat sports equipment',
    vendor: 'Kamlesh',
    amount: 150,
    type: 'Expense'
  },
  {
    id: '2',
    date: '2026-07-21',
    category: 'Other',
    description: 'Ball sports equipment',
    vendor: 'Kamlesh',
    amount: 50,
    type: 'Expense'
  },
  {
    id: '1',
    date: '2026-07-03',
    category: 'Operational',
    description: 'Petrol pump fuel fill for generator',
    vendor: 'Pump',
    amount: 300,
    type: 'Expense'
  }
];

export const INITIAL_STAFF: StaffMember[] = [
  { id: '7', name: 'Tarpan', role: 'Super Admin', phone: '+91 98281 36850', monthlySalary: 50000, status: 'Active' },
  { id: '8', name: 'Kamlesh', role: 'Staff Supervisor', phone: '+91 98281 12020', monthlySalary: 25000, status: 'Active' },
  { id: '11', name: 'Rohit', role: 'Admin', phone: '+91 98281 11111', monthlySalary: 35000, status: 'Active' },
  { id: '12', name: 'Abhijiet', role: 'Staff Kitchen', phone: '+91 98281 12121', monthlySalary: 22000, status: 'Active' },
  { id: '13', name: 'Subrata', role: 'Admin', phone: '+91 98281 13131', monthlySalary: 30000, status: 'Active' },
  { id: '15', name: 'Rana Das', role: 'Staff', phone: '+91 98281 22222', monthlySalary: 20000, status: 'Active' },
  { id: '16', name: 'Samar Sil', role: 'Staff', phone: '+91 98281 23232', monthlySalary: 18000, status: 'Active' },
  { id: '17', name: 'Ashish Mandal', role: 'Staff', phone: '+91 98281 14141', monthlySalary: 32000, status: 'Active' },
  { id: '18', name: 'Kinkar Sarkar', role: 'Staff', phone: '+91 98281 19191', monthlySalary: 18000, status: 'Active' },
  { id: '19', name: 'Ramesh', role: 'Staff', phone: '+91 98281 21212', monthlySalary: 18000, status: 'Active' },
  { id: '20', name: 'Pranay', role: 'Staff', phone: '+91 98281 20202', monthlySalary: 18000, status: 'Active' }
];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [
  { id: 'att-379', date: '2026-07-22', staffId: '13', staffName: 'Subrata', status: 'Absent' },
  { id: 'att-378', date: '2026-07-21', staffId: '13', staffName: 'Subrata', status: 'Absent' },
  { id: 'att-377', date: '2026-07-20', staffId: '13', staffName: 'Subrata', status: 'Absent' },
  { id: 'att-375', date: '2026-07-19', staffId: '13', staffName: 'Subrata', status: 'Absent' },
  { id: 'att-373', date: '2026-07-13', staffId: '17', staffName: 'Ashish Mandal', status: 'Present' },
  { id: 'att-367', date: '2026-07-12', staffId: '8', staffName: 'Kamlesh', status: 'Present' },
  { id: 'att-368', date: '2026-07-12', staffId: '18', staffName: 'Kinkar Sarkar', status: 'Present' },
  { id: 'att-369', date: '2026-07-12', staffId: '20', staffName: 'Pranay', status: 'Present' },
  { id: 'att-370', date: '2026-07-12', staffId: '19', staffName: 'Ramesh', status: 'Present' },
  { id: 'att-371', date: '2026-07-12', staffId: '15', staffName: 'Rana Das', status: 'Present' },
  { id: 'att-372', date: '2026-07-12', staffId: '17', staffName: 'Ashish Mandal', status: 'Present' },
  { id: 'att-366', date: '2026-07-11', staffId: '17', staffName: 'Ashish Mandal', status: 'Present' },
  { id: 'att-1', date: '2026-07-11', staffId: '8', staffName: 'Kamlesh', status: 'Present' },
  { id: 'att-2', date: '2026-07-11', staffId: '7', staffName: 'Tarpan', status: 'Paid Leave' },
  { id: 'att-3', date: '2026-07-11', staffId: '10', staffName: 'Abhijiet', status: 'Half Day' }
];

export const INITIAL_USER_ACCOUNTS: UserAccount[] = [
  { id: '7', username: 'Tarpan', role: 'Super Admin', passcodePin: '3685', isFinancialHandler: true, qrCodeUrl: 'assets/img/qrs/qr_1784184027_6a587cdb702ba.png', status: 'Active' },
  { id: '8', username: 'Kamlesh', role: 'Staff', passcodePin: '1202', isFinancialHandler: true, status: 'Active' },
  { id: '11', username: 'Rohit', role: 'Admin', passcodePin: '1202', isFinancialHandler: true, status: 'Active' },
  { id: '12', username: 'Abhijiet', role: 'Staff Kitchen', passcodePin: '1202', isFinancialHandler: false, status: 'Active' },
  { id: '13', username: 'Subrata', role: 'Admin', passcodePin: '1202', isFinancialHandler: false, status: 'Active' },
  { id: '15', username: 'Rana Das', role: 'Staff', passcodePin: '1202', isFinancialHandler: false, status: 'Active' },
  { id: '16', username: 'Samar Sil', role: 'Staff', passcodePin: '1202', isFinancialHandler: false, status: 'Active' },
  { id: '17', username: 'Ashish Mandal', role: 'Staff', passcodePin: '1202', isFinancialHandler: false, status: 'Active' },
  { id: '18', username: 'Kinkar Sarkar', role: 'Staff', passcodePin: '1202', isFinancialHandler: false, status: 'Active' },
  { id: '19', username: 'Ramesh', role: 'Staff', passcodePin: '1202', isFinancialHandler: false, status: 'Active' },
  { id: '20', username: 'Pranay', role: 'Staff', passcodePin: '1202', isFinancialHandler: false, status: 'Active' }
];

export const INITIAL_PAYEES: PayeeEntity[] = [
  { id: '1', name: 'Nandkishore', type: 'Third Party', qrCodeUrl: 'assets/img/qrs/qr_1784183993_6a587cb9bcfe4.png' },
  { id: '2', name: 'Raju', type: 'Vendor' },
  { id: '3', name: 'Disposable Shop', type: 'Vendor' }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  { id: '300', timestamp: '2026-07-23 19:02:51', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#40) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x French Fries Regular, 1x Fried Papad.' },
  { id: '299', timestamp: '2026-07-23 18:52:27', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#39) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x Chicken Tikka, 1x Chicken Seekh Kebab.' },
  { id: '298', timestamp: '2026-07-21 19:54:56', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#37) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x French Fries Peri-Peri.' },
  { id: '297', timestamp: '2026-07-21 19:53:36', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#36) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x Aloo Pakoda (10pcs).' },
  { id: '296', timestamp: '2026-07-21 19:52:58', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#35) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x French Fries Regular, 1x Fried Papad.' },
  { id: '295', timestamp: '2026-07-21 19:45:54', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#34) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x Pyaz Pakoda (10pcs), 1x Peanut Masala.' },
  { id: '294', timestamp: '2026-07-21 19:45:49', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#33) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x Paneer Pakoda (10pcs), 1x Mix-Veg Pakoda (12pcs), 1x Mutton Seekh Kebab.' },
  { id: '293', timestamp: '2026-07-21 19:45:46', user: 'Tarpan', action: 'User [Tarpan] registered a new KOT Food Ticket (#32) for Guest [Walk-In Guest - 8888888]. Items Ordered: 1x French Fries Regular, 1x French Fries Peri-Peri.' },
  { id: '276', timestamp: '2026-07-21 17:22:35', user: 'Tarpan', action: 'User [Tarpan] deleted kitchen purchase record ID #41: Removed 20 Gm of \'Ajino Moto\' (Total Value: ₹300.00).' },
  { id: '275', timestamp: '2026-07-21 17:22:15', user: 'Tarpan', action: 'User [Tarpan] registered a kitchen purchase: 20 Gm of \'Ajino Moto\' (Total Value: ₹300.00).' },
  { id: '102', timestamp: '2026-07-16 07:29:32', user: 'Tarpan', action: 'User settled room checkout for Guest [Current Active Guest]. Split Payout Breakdown: ₹3,000.00 via Cash (To: On-Site Cash Safe), ₹3,414.00 via UPI (To: Nandkishore [ThirdParty])' },
  { id: '85', timestamp: '2026-07-15 19:57:41', user: 'Tarpan', action: 'Collected pending accommodation Rs. 12,000.00 (Mode: Cash). Received by: Abhijiet' }
];
