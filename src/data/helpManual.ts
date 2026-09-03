/**
 * Ground Code Operational User Manual & FAQ Knowledge Base
 *
 * Provides structured operational how-to guides and policy answers for
 * front-desk staff, kitchen operators, and resort managers.
 *
 * Each item includes keywords for multi-token fuzzy matching, step-by-step
 * instructions, and deep-links to app screens.
 */

export interface HelpManualItem {
  id: string;
  category: 'bookings' | 'billing' | 'kitchen' | 'cash_drawer' | 'staff' | 'compliance' | 'general';
  categoryLabel: string;
  question: string;
  keywords: string[];
  summary: string;
  steps: string[];
  actionLink?: {
    label: string;
    itemKey: string;
  };
}

export const HELP_CATEGORIES = [
  { id: 'all', label: 'All Topics' },
  { id: 'bookings', label: 'Bookings & Front Desk' },
  { id: 'billing', label: 'Billing & Invoices' },
  { id: 'kitchen', label: 'Kitchen (KDS) & Menu' },
  { id: 'cash_drawer', label: 'Petty Cash & Expenses' },
  { id: 'staff', label: 'Staff & Roles' },
  { id: 'compliance', label: 'ID Proofs & Police C-Form' },
  { id: 'general', label: 'General & Support' },
] as const;

export const HELP_MANUAL_ITEMS: HelpManualItem[] = [
  // ==========================================
  // 1. BOOKINGS & FRONT DESK
  // ==========================================
  {
    id: 'edit-booking',
    category: 'bookings',
    categoryLabel: 'Bookings & Front Desk',
    question: 'How do I edit or modify an existing booking?',
    keywords: [
      'edit booking', 'edit reservation', 'modify booking', 'change room',
      'change dates', 'reschedule', 'update guest', 'extend stay',
      'change price', 'change tariff', 'edit guest', 'update booking',
      'change check in', 'change checkout', 'switch room'
    ],
    summary: 'You can modify room numbers, guest details, check-in/checkout dates, and room rates directly from the booking card.',
    steps: [
      'Navigate to Bookings from the left sidebar or the Home screen.',
      'Locate the booking card under the Today, Upcoming, or Past tabs (you can also use the top search field to search by guest name or room number).',
      'Click the secondary "Edit" button on the booking card.',
      'In the Edit Booking modal, update the desired fields: room assignment, guest phone number, check-in date, expected checkout date, or nightly room tariff.',
      'Click "Save Changes" to confirm the updates. Room charges and folio balances will automatically recalculate.'
    ],
    actionLink: {
      label: 'Open Bookings',
      itemKey: 'all_bookings'
    }
  },
  {
    id: 'add-booking',
    category: 'bookings',
    categoryLabel: 'Bookings & Front Desk',
    question: 'How do I add a new guest booking or check someone in?',
    keywords: [
      'add booking', 'new booking', 'add guest', 'check in', 'create reservation',
      'register guest', 'walk in booking', 'new reservation', 'book room',
      'room booking', 'new guest', 'checkin'
    ],
    summary: 'Create instant guest reservations and check-ins with room assignment, advance payment recording, and ID proof capture.',
    steps: [
      'Click the blue "+ Add Booking" button in the top navigation header, or go to the Bookings screen.',
      'Select the Room Number / Villa from the available room list.',
      'Enter the Primary Guest Name and 10-digit Mobile Number.',
      'Choose the Check-in Date and Expected Checkout Date (stay duration in nights is calculated automatically).',
      'Enter the agreed Room Tariff (per night) and any Advance Payment collected upfront.',
      'Optionally upload guest ID proof photo (Aadhaar, Driving License, or Passport).',
      'Click "Save Booking" to confirm and register the reservation.'
    ],
    actionLink: {
      label: 'Open Bookings',
      itemKey: 'all_bookings'
    }
  },
  {
    id: 'view-bookings-tabs',
    category: 'bookings',
    categoryLabel: 'Bookings & Front Desk',
    question: 'How do I view upcoming arrivals, staying guests, or past bookings?',
    keywords: [
      'view bookings', 'upcoming bookings', 'today checkin', 'past bookings',
      'guest history', 'staying guests', 'filter bookings', 'search bookings',
      'current guests', 'in house guests'
    ],
    summary: 'The Bookings desk organizes reservations into three distinct timeframes: Today, Upcoming, and Past.',
    steps: [
      'Go to the Bookings section on the sidebar.',
      'Use the top sub-tabs: "Today" shows guests staying or arriving today grouped by room; "Upcoming" lists future scheduled arrivals; "Past" stores completed past folios.',
      'Use the search input at the top to filter bookings in real time by booking ID, guest name, phone number, or room number.'
    ],
    actionLink: {
      label: 'Go to Bookings Desk',
      itemKey: 'all_bookings'
    }
  },
  {
    id: 'cancel-booking',
    category: 'bookings',
    categoryLabel: 'Bookings & Front Desk',
    question: 'How do I cancel a booking or mark a no-show?',
    keywords: [
      'cancel booking', 'delete booking', 'no show', 'remove reservation',
      'cancel reservation', 'guest cancelled', 'cancellation'
    ],
    summary: 'Cancel upcoming or pending reservations to release room availability back to your calendar.',
    steps: [
      'Go to Bookings → Upcoming tab.',
      'Find the reservation you need to cancel.',
      'Click the "Edit" button on the reservation card.',
      'Click "Cancel Booking" at the bottom of the modal, confirm the cancellation reason, and proceed. The room key will be instantly freed up.'
    ],
    actionLink: {
      label: 'Open Bookings',
      itemKey: 'all_bookings'
    }
  },

  // ==========================================
  // 2. BILLING & INVOICES
  // ==========================================
  {
    id: 'checkout-guest-billing',
    category: 'billing',
    categoryLabel: 'Billing & Invoices',
    question: 'How do I check out a guest and generate their final bill?',
    keywords: [
      'checkout', 'check out', 'generate bill', 'final bill', 'print bill',
      'settle folio', 'bill checkout', 'invoice', 'guest bill', 'collect payment',
      'balance due', 'amount due'
    ],
    summary: 'Settle remaining charges, apply payments, and print or share a final GST bill during guest departure.',
    steps: [
      'On the Bookings screen (or Today Overview), find the departing guest\'s card.',
      'Click the amber "Checkout" button on their card.',
      'The Checkout Folio Drawer opens displaying Room Charges, Food Orders from Kitchen, and Miscellaneous Add-ons minus Advance Payments.',
      'Select the Payment Method for the balance (Cash, UPI, Card, or Bank Transfer).',
      'Click "Confirm Checkout & Settle Folio". You can now print the thermal receipt, download a PDF invoice, or send the bill directly via WhatsApp.'
    ],
    actionLink: {
      label: 'Go to Bookings for Checkout',
      itemKey: 'all_bookings'
    }
  },
  {
    id: 'add-food-misc-to-bill',
    category: 'billing',
    categoryLabel: 'Billing & Invoices',
    question: 'How do room service food orders and laundry get billed to the guest?',
    keywords: [
      'room service bill', 'food bill', 'restaurant charges', 'laundry bill',
      'extra charges', 'misc charges', 'add to room bill', 'folio charges',
      'in house guest food'
    ],
    summary: 'Orders taken via Kitchen KDS for in-house guests automatically append directly to their room bill.',
    steps: [
      'When placing an order in the Kitchen → Take Order tab, select "In-House Guest" and pick the guest\'s room.',
      'All food items added are automatically charged to that room\'s folio.',
      'For other amenities (laundry, bonfire, extra bed), use the Miscellaneous Charges section on the guest\'s booking card or checkout drawer to add custom items with optional GST.'
    ],
    actionLink: {
      label: 'Open Kitchen Orders',
      itemKey: 'kitchen_kds'
    }
  },
  {
    id: 'whatsapp-billing',
    category: 'billing',
    categoryLabel: 'Billing & Invoices',
    question: 'How do I send booking confirmations or bills on WhatsApp?',
    keywords: [
      'whatsapp bill', 'send invoice whatsapp', 'whatsapp receipt',
      'whatsapp message', 'send confirmation', 'share bill'
    ],
    summary: 'Send instant booking confirmations and checkout invoices directly to guests on WhatsApp with a single tap.',
    steps: [
      'Open the guest\'s booking card or checkout summary.',
      'Click the green "WhatsApp Bill" or "Send WhatsApp Confirmation" button.',
      'Ground Code formats a polite message with property details, dates, and total amount due, opening WhatsApp Web or WhatsApp Mobile automatically.'
    ]
  },

  // ==========================================
  // 3. KITCHEN (KDS) & MENU
  // ==========================================
  {
    id: 'take-kitchen-order',
    category: 'kitchen',
    categoryLabel: 'Kitchen (KDS) & Menu',
    question: 'How do I take a food order for an in-house guest or room service?',
    keywords: [
      'take order', 'room service', 'kitchen order', 'food order',
      'order food', 'kds order', 'kitchen ticket', 'kot'
    ],
    summary: 'Place food orders that route directly to the kitchen cook screen and attach to the guest\'s room bill.',
    steps: [
      'Go to the Kitchen screen from the sidebar or bottom navigation bar.',
      'Click the "Take Order" tab at the top.',
      'Ensure "In-House Guest" is selected and choose the target Room Number.',
      'Browse food categories or use the Quick Search bar to find dishes.',
      'Use the + / - stepper buttons to add quantities to the order cart.',
      'Click "Submit Order to Kitchen". The order instantly appears on the Live Tickets cook screen and sounds an alert.'
    ],
    actionLink: {
      label: 'Open Kitchen',
      itemKey: 'kitchen_kds'
    }
  },
  {
    id: 'walkin-restaurant-order',
    category: 'kitchen',
    categoryLabel: 'Kitchen (KDS) & Menu',
    question: 'How do I take orders for walk-in restaurant customers without a room?',
    keywords: [
      'walkin order', 'walk in customer', 'table order', 'restaurant order',
      'dining order', 'cafe order', 'dine in'
    ],
    summary: 'Manage restaurant tables and non-resident walk-in diners with independent dining tabs.',
    steps: [
      'Go to Kitchen → Take Order tab.',
      'Switch the segmented toggle from "In-House Guest" to "Walk-in Guest".',
      'Select an existing active table tab or click "+ Add New" to enter a table/customer name (e.g. Table 4, Poolside).',
      'Add the requested menu items to the cart and click "Submit Order".',
      'When they finish dining, click "Bill This Table" to collect payment and close the tab.'
    ],
    actionLink: {
      label: 'Open Kitchen Take Order',
      itemKey: 'kitchen_kds'
    }
  },
  {
    id: 'cook-mark-ready',
    category: 'kitchen',
    categoryLabel: 'Kitchen (KDS) & Menu',
    question: 'How do kitchen staff manage live orders and mark food ready?',
    keywords: [
      'cook screen', 'live tickets', 'mark ready', 'preparing order',
      'kitchen display', 'kds screen', 'chef screen', 'food ready'
    ],
    summary: 'The Live Tickets screen displays pending food orders in real-time with countdown timers and dish checklists.',
    steps: [
      'Open Kitchen → Live Tickets tab.',
      'Incoming orders display ordered dishes, quantities, and customer/room info.',
      'Staff can tap "Mark Ready" on individual dish items or tap "Complete Order" once all items are prepared for dispatch.',
      'Completed orders clear from the active cook queue automatically.'
    ],
    actionLink: {
      label: 'Open Live Tickets',
      itemKey: 'kitchen_kds'
    }
  },
  {
    id: 'manage-food-menu-items',
    category: 'kitchen',
    categoryLabel: 'Kitchen (KDS) & Menu',
    question: 'How do I add new dishes or update food menu prices?',
    keywords: [
      'add dish', 'edit menu', 'update price', 'food price', 'add food item',
      'menu management', 'food categories', 'recipe', 'food item'
    ],
    summary: 'Manage your food menu, categories (Starters, Mains, Desserts), pricing, and dish photos.',
    steps: [
      'Go to Kitchen → Edit Food Menu (or Menu Manager).',
      'To edit a price: find the dish in the category list, update the Price (₹) field, and click Save.',
      'To add a new dish: click "+ Add Food Item", enter the dish name, select category, specify price, and save.',
      'You can also toggle dish availability (In Stock / Out of Stock) instantly.'
    ],
    actionLink: {
      label: 'Open Menu Manager',
      itemKey: 'food_menu'
    }
  },

  // ==========================================
  // 4. PETTY CASH & EXPENSES
  // ==========================================
  {
    id: 'add-petty-cash-expense',
    category: 'cash_drawer',
    categoryLabel: 'Petty Cash & Expenses',
    question: 'How do I record a petty cash expense, like groceries or maintenance?',
    keywords: [
      'add expense', 'petty cash', 'record expense', 'log expense',
      'grocery expense', 'vendor payment', 'property expense',
      'maintenance cost', 'cash payout', 'spend cash'
    ],
    summary: 'Track all day-to-day property outflows by category and payment source to maintain accurate financial registers.',
    steps: [
      'Go to Expenses on the left sidebar.',
      'Click the "+ Add Expense" button.',
      'Select the Category (e.g., Bills & Utilities, Kitchen Supplies, Maintenance, Staff Advance).',
      'Enter the Amount (₹) and Item Description (e.g., "Vegetables for dinner", "Plumber tap repair").',
      'Choose the Payment Source: "Property Funds" (paid from front desk cash drawer) or "Out-of-Pocket" (paid by staff/owner to be reimbursed).',
      'Click "Add Expense". The expense is logged with date, staff timestamp, and affects the daily cash balance.'
    ],
    actionLink: {
      label: 'Open Expenses',
      itemKey: 'expenses'
    }
  },
  {
    id: 'cash-drawer-reconciliation',
    category: 'cash_drawer',
    categoryLabel: 'Petty Cash & Expenses',
    question: 'How do I reconcile and close the front-desk cash drawer at shift end?',
    keywords: [
      'cash drawer', 'reconcile cash', 'shift close', 'closing balance',
      'opening balance', 'cash handover', 'cash audit', 'count cash'
    ],
    summary: 'Verify actual physical cash on hand against system recorded collections and payouts at the end of each shift.',
    steps: [
      'Go to Finances & Payroll → Cash Drawer Manager.',
      'View the System Expected Balance (calculated from Opening Cash + Cash Inflows minus Cash Expenses).',
      'Enter the Counted Physical Cash amount present in the drawer.',
      'If there is a variance, record an explanation note and tap "Close Shift & Reconcile Cash Drawer".',
      'An audit receipt is logged, locking the previous shift and starting a clean balance for the incoming staff.'
    ],
    actionLink: {
      label: 'Open Cash Drawer',
      itemKey: 'cash_drawer'
    }
  },

  // ==========================================
  // 5. STAFF & ROLES
  // ==========================================
  {
    id: 'add-staff-member',
    category: 'staff',
    categoryLabel: 'Staff & Roles',
    question: 'How do I add a new staff member and assign their role and PIN?',
    keywords: [
      'add staff', 'new employee', 'staff role', 'create staff', 'staff pin',
      'staff password', 'employee login', 'hire staff', 'staff directory'
    ],
    summary: 'Add staff profiles with mobile login credentials, monthly salary terms, and screen permissions.',
    steps: [
      'Go to Team → Staff Directory & Salaries.',
      'Click "+ Add Staff Member".',
      'Enter the Staff Member\'s Name and 10-digit Mobile Number (this phone number serves as their username).',
      'Select their Role: Front Desk, Kitchen Staff, Supervisor, or Admin.',
      'Enter their Monthly Base Salary.',
      'Click "Create Staff Member". The system generates their 6-digit login PIN which they will use to sign in.'
    ],
    actionLink: {
      label: 'Open Staff Directory',
      itemKey: 'staff_directory_salaries'
    }
  },
  {
    id: 'staff-roles-explained',
    category: 'staff',
    categoryLabel: 'Staff & Roles',
    question: 'What are the different staff roles and permissions?',
    keywords: [
      'staff permissions', 'user roles', 'role permission', 'admin vs staff',
      'kitchen role', 'supervisor role', 'front desk role', 'who can see what'
    ],
    summary: 'Role-based access control (RBAC) ensures sensitive financial data remains private to owners while staff get focused operational tools.',
    steps: [
      'Front Desk / Staff: Can view reservations, check in guests, process checkouts, take food orders, and record petty cash expenses. Cannot view owner financial profit reports.',
      'Kitchen Staff: Has access restricted exclusively to the Kitchen Display System (Live Tickets and Take Order). Cannot access guest folios or property settings.',
      'Supervisor: Can manage bookings, approve service requests, oversee cash drawer handovers, and review daily staff attendance.',
      'Admin / Super Admin: Unrestricted access to all property modules, salary disbursements, property tariff settings, and audit logs.'
    ]
  },

  // ==========================================
  // 6. COMPLIANCE & GUEST ID
  // ==========================================
  {
    id: 'guest-id-upload',
    category: 'compliance',
    categoryLabel: 'ID Proofs & Police C-Form',
    question: 'How do I upload and verify guest ID proofs (Aadhaar, Passport)?',
    keywords: [
      'upload id', 'guest id proof', 'aadhaar card', 'passport upload',
      'police register', 'identity verification', 'photo id', 'scan id'
    ],
    summary: 'Upload guest identification documents during check-in or later via mobile camera or gallery upload.',
    steps: [
      'Open the guest\'s card on the Bookings screen.',
      'Click the "Upload ID" or "ID Pending" badge.',
      'Select Document Type (Aadhaar, Passport, Driving License, Voter ID).',
      'Choose whether to take a live photo using your phone camera or upload an existing file/image.',
      'Click "Save Document". The ID is stored encrypted and marked as verified in your property register.'
    ]
  },
  {
    id: 'foreign-guest-c-form',
    category: 'compliance',
    categoryLabel: 'ID Proofs & Police C-Form',
    question: 'How does Police C-Form compliance work for international foreign guests?',
    keywords: [
      'c form', 'c-form', 'foreign guest', 'international tourist',
      'police compliance', 'passport details', 'visa details', 'boi c form'
    ],
    summary: 'Fulfill statutory police registration rules for non-Indian guests by capturing passport and visa details.',
    steps: [
      'When adding or editing an international guest, toggle "Is Foreign Guest / Non-Indian National".',
      'Input Passport Number, Nationality, Visa Number, and Visa Expiry Date.',
      'Once submitted to the Bureau of Immigration (BOI) portal, tap "Mark C-Form Filed" on the guest card to display the green "C-Form Filed" compliance badge.'
    ]
  },

  // ==========================================
  // 7. GENERAL & SUPPORT
  // ==========================================
  {
    id: 'telegram-alerts',
    category: 'general',
    categoryLabel: 'General & Support',
    question: 'How do Telegram instant phone alerts work?',
    keywords: [
      'telegram alerts', 'telegram bot', 'mobile notification',
      'booking alert', 'checkin notification', 'instant alerts'
    ],
    summary: 'Connect your property to a free Telegram bot to receive instant alerts for arrivals, bookings, and cash adjustments.',
    steps: [
      'Click the Telegram bell icon in the top header.',
      'Follow the 2-minute bot connection guide to link your property Telegram group or private chat.',
      'Whenever a new guest booking is registered, check-in occurs, or cash is disbursed, your staff group receives an immediate notification with guest details.'
    ]
  },
  {
    id: 'ground-code-overview',
    category: 'general',
    categoryLabel: 'General & Support',
    question: 'What is Ground Code and how does the Pro subscription work?',
    keywords: [
      'pricing', 'cost', 'subscription', 'free trial', 'plan', 'pro plan',
      'commission', 'zero commission', 'about ground code', 'what is ground code'
    ],
    summary: 'Ground Code is a specialized PMS for homestays, villas, and boutique resorts in India with zero booking commission.',
    steps: [
      'Zero Booking Commission: You keep 100% of your guest room revenue.',
      '30-Day Free Trial: Includes all Pro features with no credit card required and no lock-in.',
      'Pro Plan: Billed at ₹1,499/month (includes 1st room key) + ₹350/extra key/month, or save 2 months free with annual billing.'
    ]
  },
  {
    id: 'contact-support',
    category: 'general',
    categoryLabel: 'General & Support',
    question: 'How do I contact Ground Code support if I encounter an issue?',
    keywords: [
      'contact support', 'customer care', 'helpdesk', 'whatsapp support',
      'call support', 'tech support', 'report bug', 'talk to human'
    ],
    summary: 'Our dedicated operations team is available via direct WhatsApp chat, Telegram, and phone support.',
    steps: [
      'Switch to the "Contact Support" tab in this Help Drawer.',
      'Tap the green "Chat on WhatsApp" button to open a direct support conversation with our hospitality engineering team.',
      'Alternatively, reach us at support@ground-code.com or call our hotline.'
    ]
  },
  {
    id: 'airbnb-switch-software',
    category: 'general',
    categoryLabel: 'General & Support',
    question: 'How do I switch to Ground Code from another PMS or Channel Manager on Airbnb?',
    keywords: [
      'airbnb switch software', 'you may only authorise one property management app',
      'airbnb disconnect', 'remove access airbnb', 'connected apps airbnb',
      'airbnb channel manager', 'switch to new software airbnb', 'sync settings disconnect'
    ],
    summary: 'To switch to Ground Code, disconnect your listings from your former software on Airbnb and remove access in your Airbnb Account Settings.',
    steps: [
      'Log in to your Airbnb account on a desktop or mobile web browser (this feature is not available in the Airbnb mobile app).',
      'Go to Listings (airbnb.com/hosting/listings), check the box next to each listing, click "Edit selected", choose "Sync settings", select "Disconnect", and click Save.',
      'Go to Account Settings → Privacy & Sharing (airbnb.com/account-settings/privacy-and-sharing).',
      'Under "Connected Apps", click "Remove Access" for your former software provider.',
      'Return to Ground Code and click "Authorize with Airbnb" to connect Ground Code and map your rooms!'
    ]
  }
];
