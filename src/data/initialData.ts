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
  { id: '1', name: 'Paneer Tikka (8-10pcs)', category: 'Starters', price: 249, available: true },
  { id: '2', name: 'Paneer Pakoda (10pcs)', category: 'Starters', price: 195, available: true },
  { id: '3', name: 'Pyaz Pakoda (10pcs)', category: 'Starters', price: 149, available: true },
  { id: '4', name: 'Aloo Pakoda (6-8pcs)', category: 'Starters', price: 149, available: true },
  { id: '5', name: 'Mix-Veg Pakoda (12pcs)', category: 'Starters', price: 198, available: true },
  { id: '6', name: 'Kabuli Chana Chaat', category: 'Starters', price: 149, available: true },
  { id: '7', name: 'Kaala Chana Chaat', category: 'Starters', price: 149, available: true },
  { id: '8', name: 'Peanut Masala', category: 'Starters', price: 125, available: true },
  { id: '9', name: 'Pani Puri (8)', category: 'Starters', price: 49, available: true },
  { id: '10', name: 'French Fries Regular', category: 'Starters', price: 149, available: true },
  { id: '11', name: 'French Fries Peri-Peri', category: 'Starters', price: 179, available: true },
  { id: '12', name: 'Chicken Tikka', category: 'Starters', price: 359, available: true },
  { id: '13', name: 'Chicken Seekh Kebab', category: 'Starters', price: 289, available: true },
  { id: '14', name: 'Mutton Seekh Kebab', category: 'Starters', price: 389, available: true },
  { id: '15', name: 'Roasted Papad', category: 'Starters', price: 30, available: true },
  { id: '16', name: 'Fried Papad', category: 'Starters', price: 40, available: true },
  { id: '17', name: 'Masala Papad', category: 'Starters', price: 49, available: true },
  { id: '74', name: 'Laal Maans', category: 'Starters', price: 800, available: true },

  // Chinese
  { id: '18', name: 'Chow mein', category: 'Chinese', price: 149, available: true },
  { id: '19', name: 'Veg Spring roll (6-8pcs)', category: 'Chinese', price: 149, available: true },
  { id: '20', name: 'Chilly Paneer (8-10pcs)', category: 'Chinese', price: 249, available: true },
  { id: '21', name: 'Chilly Potatoes (8-10pcs)', category: 'Chinese', price: 198, available: true },
  { id: '22', name: 'Sweet Corn Chaat', category: 'Chinese', price: 198, available: true },
  { id: '23', name: 'Maggie Regular', category: 'Chinese', price: 98, available: true },
  { id: '24', name: 'Masala Maggie', category: 'Chinese', price: 149, available: true },
  { id: '25', name: 'Chinese Pakoda (6-8pcs)', category: 'Chinese', price: 169, available: true },

  // Pizza & Sandwich
  { id: '26', name: 'OTC Pizza', category: 'Pizza & Sandwich', price: 198, available: true },
  { id: '27', name: 'Paneer Pizza', category: 'Pizza & Sandwich', price: 298, available: true },
  { id: '28', name: 'Cheese Corn Pizza', category: 'Pizza & Sandwich', price: 298, available: true },
  { id: '29', name: 'Veg Grilled Sandwich', category: 'Pizza & Sandwich', price: 149, available: true },
  { id: '30', name: 'Cheese Grilled Sandwich', category: 'Pizza & Sandwich', price: 198, available: true },
  { id: '31', name: 'Cheesy Garlic Bread (6pcs)', category: 'Pizza & Sandwich', price: 149, available: true },

  // Main Course
  { id: '32', name: 'Shahi Paneer', category: 'Main Course', price: 285, available: true },
  { id: '33', name: 'Kadhai Paneer', category: 'Main Course', price: 285, available: true },
  { id: '34', name: 'Paneer Butter Masala', category: 'Main Course', price: 285, available: true },
  { id: '35', name: 'Chicken Curry (4pcs)', category: 'Main Course', price: 389, available: true },
  { id: '36', name: 'Mutton Curry (4pcs)', category: 'Main Course', price: 489, available: true },
  { id: '37', name: 'Paneer Bhurji', category: 'Main Course', price: 298, available: true },
  { id: '38', name: 'Jeera Aloo', category: 'Main Course', price: 249, available: true },
  { id: '39', name: 'Gatta Masala', category: 'Main Course', price: 198, available: true },
  { id: '40', name: 'Daal Tadka', category: 'Main Course', price: 198, available: true },
  { id: '41', name: 'Daal Fry', category: 'Main Course', price: 149, available: true },
  { id: '42', name: 'Kadhi Pakoda', category: 'Main Course', price: 198, available: true },
  { id: '43', name: 'Sev Tamatar', category: 'Main Course', price: 249, available: true },
  { id: '44', name: 'Dinner Buffet (Per Person)', category: 'Main Course', price: 600, available: true },

  // Rice & Roti
  { id: '45', name: 'Plain Rice', category: 'Rice & Roti', price: 198, available: true },
  { id: '46', name: 'Jeera Rice', category: 'Rice & Roti', price: 248, available: true },
  { id: '47', name: 'Veg Pulao', category: 'Rice & Roti', price: 298, available: true },
  { id: '48', name: 'Plain Chapati', category: 'Rice & Roti', price: 29, available: true },
  { id: '49', name: 'Chapati With Butter', category: 'Rice & Roti', price: 38, available: true },
  { id: '50', name: 'Paratha Plain', category: 'Rice & Roti', price: 59, available: true },
  { id: '51', name: 'Aloo Paratha', category: 'Rice & Roti', price: 149, available: true },
  { id: '52', name: 'Pyaz Paratha', category: 'Rice & Roti', price: 149, available: true },

  // Breakfast
  { id: '53', name: 'Bread Toast Butter (2)', category: 'Breakfast', price: 50, available: true },
  { id: '54', name: 'Bread Toast Jam (2)', category: 'Breakfast', price: 60, available: true },
  { id: '55', name: 'Boiled Eggs', category: 'Breakfast', price: 149, available: true },
  { id: '56', name: 'Egg Bhurji', category: 'Breakfast', price: 149, available: true },
  { id: '57', name: 'Poha', category: 'Breakfast', price: 98, available: true },
  { id: '58', name: 'Bread Pakoda', category: 'Breakfast', price: 98, available: true },
  { id: '59', name: 'French Toast', category: 'Breakfast', price: 149, available: true },
  { id: '60', name: 'Omelette', category: 'Breakfast', price: 98, available: true },
  { id: '61', name: 'Breakfast Buffet (Per Person)', category: 'Breakfast', price: 300, available: true },

  // Raita & Salad
  { id: '62', name: 'Boondi Raita', category: 'Raita & Salad', price: 95, available: true },
  { id: '63', name: 'Veg Raita', category: 'Raita & Salad', price: 149, available: true },
  { id: '64', name: 'Plain Curd', category: 'Raita & Salad', price: 58, available: true },
  { id: '65', name: 'Chaach', category: 'Raita & Salad', price: 68, available: true },
  { id: '66', name: 'Green Salad', category: 'Raita & Salad', price: 119, available: true },

  // Beverages
  { id: '67', name: 'Regular Tea', category: 'Beverages', price: 48, available: true },
  { id: '68', name: 'Masala Tea', category: 'Beverages', price: 58, available: true },
  { id: '69', name: 'Coffee', category: 'Beverages', price: 80, available: true },
  { id: '70', name: 'Cold Coffee', category: 'Beverages', price: 148, available: true },
  { id: '71', name: 'Nimbu Pani', category: 'Beverages', price: 49, available: true },
  { id: '72', name: 'Nimbu Soda', category: 'Beverages', price: 59, available: true },
  { id: '73', name: 'Hot Chocolate', category: 'Beverages', price: 249, available: true },
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
      { menuItemId: '10', name: 'French Fries Regular', quantity: 1, unitPrice: 149 },
      { menuItemId: '16', name: 'Fried Papad', quantity: 1, unitPrice: 40 }
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
      { menuItemId: '12', name: 'Chicken Tikka', quantity: 1, unitPrice: 359 },
      { menuItemId: '13', name: 'Chicken Seekh Kebab', quantity: 1, unitPrice: 289 }
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
      { menuItemId: '11', name: 'French Fries Peri-Peri', quantity: 1, unitPrice: 179 }
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
      { menuItemId: '4', name: 'Aloo Pakoda (6-8pcs)', quantity: 1, unitPrice: 149 }
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
      { menuItemId: '10', name: 'French Fries Regular', quantity: 1, unitPrice: 149 },
      { menuItemId: '16', name: 'Fried Papad', quantity: 1, unitPrice: 40 }
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
      { menuItemId: '3', name: 'Pyaz Pakoda (10pcs)', quantity: 1, unitPrice: 149 },
      { menuItemId: '8', name: 'Peanut Masala', quantity: 1, unitPrice: 125 }
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
      { menuItemId: '2', name: 'Paneer Pakoda (10pcs)', quantity: 1, unitPrice: 195 },
      { menuItemId: '5', name: 'Mix-Veg Pakoda (12pcs)', quantity: 1, unitPrice: 198 },
      { menuItemId: '14', name: 'Mutton Seekh Kebab', quantity: 1, unitPrice: 389 }
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
      { menuItemId: '10', name: 'French Fries Regular', quantity: 1, unitPrice: 149 },
      { menuItemId: '11', name: 'French Fries Peri-Peri', quantity: 1, unitPrice: 179 }
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
      { menuItemId: '11', name: 'French Fries Peri-Peri', quantity: 1, unitPrice: 179 },
      { menuItemId: '12', name: 'Chicken Tikka', quantity: 1, unitPrice: 359 },
      { menuItemId: '13', name: 'Chicken Seekh Kebab', quantity: 1, unitPrice: 289 },
      { menuItemId: '74', name: 'Laal Maans', quantity: 1, unitPrice: 800 }
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
      { menuItemId: '35', name: 'Chicken Curry (4pcs)', quantity: 3, unitPrice: 389 },
      { menuItemId: '36', name: 'Mutton Curry (4pcs)', quantity: 2, unitPrice: 489 },
      { menuItemId: '39', name: 'Gatta Masala', quantity: 2, unitPrice: 198 },
      { menuItemId: '41', name: 'Daal Fry', quantity: 2, unitPrice: 149 },
      { menuItemId: '48', name: 'Plain Chapati', quantity: 6, unitPrice: 29 }
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
      { menuItemId: '12', name: 'Chicken Tikka', quantity: 2, unitPrice: 359 },
      { menuItemId: '13', name: 'Chicken Seekh Kebab', quantity: 3, unitPrice: 289 },
      { menuItemId: '51', name: 'Aloo Paratha', quantity: 1, unitPrice: 149 },
      { menuItemId: '65', name: 'Chaach', quantity: 1, unitPrice: 68 },
      { menuItemId: '35', name: 'Chicken Curry (4pcs)', quantity: 2, unitPrice: 389 },
      { menuItemId: '55', name: 'Boiled Eggs', quantity: 1, unitPrice: 149 },
      { menuItemId: '47', name: 'Veg Pulao', quantity: 1, unitPrice: 298 },
      { menuItemId: '45', name: 'Plain Rice', quantity: 1, unitPrice: 198 },
      { menuItemId: '61', name: 'Breakfast Buffet (Per Person)', quantity: 1, unitPrice: 300 },
      { menuItemId: '9', name: 'Pani Puri (8)', quantity: 1, unitPrice: 49 }
    ],
    totalAmount: 3374
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  { id: '1', name: 'Aachar', category: 'Spices & Seasonings', currentStock: 12, minThreshold: 2, unit: 'Kg' },
  { id: '3', name: 'Ajino Moto', category: 'Spices & Seasonings', currentStock: 20, minThreshold: 50, unit: 'Gm' },
  { id: '4', name: 'Apple', category: 'Fruits & Desserts', currentStock: 6, minThreshold: 2, unit: 'Kg' },
  { id: '6', name: 'Atta (Wheat Flour)', category: 'Flours & Grains', currentStock: 40, minThreshold: 10, unit: 'Kg' },
  { id: '10', name: 'Beans', category: 'Vegetables & Fresh Produce', currentStock: 5, minThreshold: 2, unit: 'Kg' },
  { id: '17', name: 'Brinjal', category: 'Vegetables & Fresh Produce', currentStock: 4, minThreshold: 2, unit: 'Kg' },
  { id: '18', name: 'Butter', category: 'Dairy', currentStock: 600, minThreshold: 1000, unit: 'Gms' },
  { id: '24', name: 'Chicken', category: 'Non Veg', currentStock: 8, minThreshold: 3, unit: 'Kg' },
  { id: '30', name: 'Curd', category: 'Dairy', currentStock: 4, minThreshold: 2, unit: 'Kg' },
  { id: '41', name: 'French Fries', category: 'Frozen / Cold', currentStock: 5, minThreshold: 2, unit: 'Kg' },
  { id: '43', name: 'Garlic', category: 'Vegetables & Fresh Produce', currentStock: 3, minThreshold: 1, unit: 'Kg' },
  { id: '46', name: 'Ginger', category: 'Vegetables & Fresh Produce', currentStock: 2, minThreshold: 1, unit: 'Kg' },
  { id: '73', name: 'Milk', category: 'Dairy', currentStock: 2.5, minThreshold: 5, unit: 'Liter' },
  { id: '81', name: 'Mustard Oil', category: 'Oils & Dairy Staples', currentStock: 4, minThreshold: 5, unit: 'Liter' },
  { id: '82', name: 'Mutton', category: 'Non Veg', currentStock: 4, minThreshold: 2, unit: 'Kg' },
  { id: '86', name: 'Onion', category: 'Vegetables & Fresh Produce', currentStock: 25, minThreshold: 10, unit: 'Kg' },
  { id: '89', name: 'Paneer', category: 'Dairy', currentStock: 3, minThreshold: 5, unit: 'Kg' },
  { id: '97', name: 'Potato', category: 'Vegetables & Fresh Produce', currentStock: 30, minThreshold: 10, unit: 'Kg' },
  { id: '106', name: 'Sugar', category: 'Spices & Seasonings', currentStock: 15, minThreshold: 5, unit: 'Kg' },
  { id: '113', name: 'Tomato', category: 'Vegetables & Fresh Produce', currentStock: 18, minThreshold: 5, unit: 'Kg' },
  { id: '176', name: 'Amul Butter', category: 'Dairy', currentStock: 500, minThreshold: 200, unit: 'Gms' },
  { id: '177', name: 'Basmati Rice', category: 'Flours & Grains', currentStock: 25, minThreshold: 10, unit: 'Kg' },
  { id: '178', name: 'LPG Gas Cylinder', category: 'Kitchen Appliance Repairs', currentStock: 2, minThreshold: 3, unit: 'Pcs' }
];

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
