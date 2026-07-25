import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { OperationalDashboard } from './components/OperationalDashboard';
import { GuestManagement } from './components/GuestManagement';
import { KitchenManagement } from './components/KitchenManagement';
import { InventoryManagement } from './components/InventoryManagement';
import { PettyCashManagement } from './components/PettyCashManagement';
import { StaffManagement } from './components/StaffManagement';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AuditLogsView } from './components/AuditLogsView';
import { DataExportCenter } from './components/DataExportCenter';
import { MenuManager } from './components/MenuManager';
import { TelegramNotificationModal } from './components/TelegramNotificationModal';
import { TelescopeErrorCenter } from './components/TelescopeErrorCenter';
import { recordTelescopeLog } from './utils/telescopeLogger';

import {
  INITIAL_GUESTS,
  INITIAL_RECEIPTS,
  INITIAL_MENU,
  INITIAL_ORDERS,
  INITIAL_INVENTORY,
  INITIAL_REQUISITIONS,
  INITIAL_PETTY_CASH,
  INITIAL_STAFF,
  INITIAL_ATTENDANCE,
  INITIAL_AUDIT_LOGS,
} from './data/initialData';

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
  TelegramConfig,
  TelegramDispatchLog,
  NavMenuItem,
} from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [activeMenuItemKey, setActiveMenuItemKey] = useState<string>('dashboard');

  const handleNavigateTab = (tab: TabType, menuItemKey?: string) => {
    setActiveTab(tab);
    if (menuItemKey) {
      setActiveMenuItemKey(menuItemKey);
    } else {
      const defaults: Record<TabType, string> = {
        dashboard: 'dashboard',
        guests: 'guest_registration',
        kitchen: 'kitchen_orders',
        inventory: 'stock_requests',
        petty_cash: 'expenses',
        staff: 'attendance_salaries',
        analytics: 'dashboard_analytics',
        audit_logs: 'audit_logs_main',
        menu_manager: 'edit_food_menu',
        telegram: 'telegram',
        errors: 'errors',
      };
      setActiveMenuItemKey(defaults[tab] || tab);
    }
  };

  const [activeRole, setActiveRole] = useState('Super Admin');

  // Telegram Notifications State
  const TELEGRAM_BOT_TOKEN = '8999394059:AAHGKM4gFvH6IIQtOEiuiKEL7ewflHSa6DU';

  const getTelegramChannelIds = () => {
    const isLocal = typeof window !== 'undefined' && 
      ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (isLocal) {
      return {
        kitchen: '-5511705268',
        admin: '-5362212071',
        finance: '-5511705268',
      };
    }
    return {
      kitchen: '-5456387701',
      admin: '-5415746187',
      finance: '-5303969309',
    };
  };

  const activeChannelIds = getTelegramChannelIds();

  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: TELEGRAM_BOT_TOKEN,
    chatId: `Admin: ${activeChannelIds.admin} | Kitchen: ${activeChannelIds.kitchen} | Finance: ${activeChannelIds.finance}`,
    botUsername: 'ArtistsFarmBot',
    enabledEvents: {
      kotOrders: true,
      guestCheckout: true,
      materialRequisitions: true,
      lowStockAlerts: true,
      pettyCashExpenses: true,
    },
  });

  const [telegramLogs, setTelegramLogs] = useState<TelegramDispatchLog[]>([
    {
      id: 'tg-1',
      timestamp: '2026-07-24 00:32:51',
      eventType: 'KOT Order',
      message: '🛎️ New KOT Ticket #40 created for Resident Group 10 (Villa 101). Total: ₹189.00',
      status: 'Delivered',
    },
    {
      id: 'tg-2',
      timestamp: '2026-07-21 22:52:15',
      eventType: 'Low Stock',
      message: '⚠️ Low Stock Alert: Amul Butter (600 Gms remaining, Threshold: 1000 Gms)',
      status: 'Delivered',
    },
  ]);

  // Navigation Items State (All Main Menu items across the application)
  const [navItems, setNavItems] = useState<NavMenuItem[]>([
    { id: 'nav-1', title: 'Operational Dashboard', tabKey: 'dashboard', uniqueKey: 'dashboard', category: 'Main Sections', iconName: 'LayoutDashboard', order: 1, roles: ['Super Admin', 'Manager', 'Chef', 'Staff'], isVisible: true },
    { id: 'nav-2', title: 'Guest Registration', tabKey: 'guests', uniqueKey: 'guest_registration', category: 'Residents & Billing', iconName: 'Users', order: 2, roles: ['Super Admin', 'Manager', 'Staff'], isVisible: true },
    { id: 'nav-3', title: 'Billing & Checkout', tabKey: 'guests', uniqueKey: 'billing_checkout', category: 'Residents & Billing', iconName: 'CreditCard', order: 3, roles: ['Super Admin', 'Manager', 'Staff'], isVisible: true },
    { id: 'nav-4', title: 'Take Food Order', tabKey: 'kitchen', uniqueKey: 'take_food_order', category: 'Kitchen & Food', iconName: 'ShoppingCart', order: 4, roles: ['Super Admin', 'Manager', 'Chef', 'Staff'], isVisible: true },
    { id: 'nav-5', title: 'Kitchen Live Orders', tabKey: 'kitchen', uniqueKey: 'kitchen_orders', category: 'Kitchen & Food', iconName: 'UtensilsCrossed', order: 5, roles: ['Super Admin', 'Manager', 'Chef', 'Staff'], isVisible: true },
    { id: 'nav-6', title: 'Edit Food Menu Catalog', tabKey: 'menu_manager', uniqueKey: 'edit_food_menu', category: 'Kitchen & Food', iconName: 'Utensils', order: 6, roles: ['Super Admin', 'Manager', 'Chef'], isVisible: true },
    { id: 'nav-7', title: 'Stock Requests', tabKey: 'inventory', uniqueKey: 'stock_requests', category: 'Stock & Inventory', iconName: 'ClipboardList', order: 7, roles: ['Super Admin', 'Manager', 'Chef'], isVisible: true },
    { id: 'nav-8', title: 'Fulfill Stock Requisitions', tabKey: 'inventory', uniqueKey: 'fulfill_stock_req', category: 'Stock & Inventory', iconName: 'Truck', order: 8, roles: ['Super Admin', 'Manager', 'Chef'], isVisible: true },
    { id: 'nav-9', title: 'Staff Meals Tracker', tabKey: 'kitchen', uniqueKey: 'staff_meals', category: 'Kitchen & Food', iconName: 'CookingPot', order: 9, roles: ['Super Admin', 'Manager', 'Chef'], isVisible: true },
    { id: 'nav-10', title: 'Attendance & Salaries', tabKey: 'staff', uniqueKey: 'attendance_salaries', category: 'Staff & HR', iconName: 'UserCheck', order: 10, roles: ['Super Admin', 'Manager', 'Staff'], isVisible: true },
    { id: 'nav-11', title: 'Expenses & Receipts', tabKey: 'petty_cash', uniqueKey: 'expenses', category: 'Financials', iconName: 'Receipt', order: 11, roles: ['Super Admin', 'Manager'], isVisible: true },
    { id: 'nav-12', title: 'Deficit Shortfalls Log', tabKey: 'inventory', uniqueKey: 'deficit_shortfalls_log', category: 'Stock & Inventory', iconName: 'TrendingDown', order: 12, roles: ['Super Admin', 'Manager', 'Chef'], isVisible: true },
    { id: 'nav-13', title: 'Stock Log & Adjustments', tabKey: 'inventory', uniqueKey: 'stock_log', category: 'Stock & Inventory', iconName: 'Package', order: 13, roles: ['Super Admin', 'Manager', 'Chef'], isVisible: true },
    { id: 'nav-14', title: 'Kitchen Purchases', tabKey: 'inventory', uniqueKey: 'kitchen_purchases', category: 'Stock & Inventory', iconName: 'ShoppingBag', order: 14, roles: ['Super Admin', 'Manager', 'Chef'], isVisible: true },
    { id: 'nav-15', title: 'Dashboard Analytics', tabKey: 'analytics', uniqueKey: 'dashboard_analytics', category: 'Analytics', iconName: 'BarChart3', order: 15, roles: ['Super Admin', 'Manager'], isVisible: true },
    { id: 'nav-16', title: 'System Audit Logs', tabKey: 'audit_logs', uniqueKey: 'audit_logs_main', category: 'Audit & Logs', iconName: 'ScrollText', order: 16, roles: ['Super Admin'], isVisible: true },
    { id: 'nav-17', title: 'Edit Main Menu & RBAC', tabKey: 'menu_manager', uniqueKey: 'edit_main_menu', category: 'System Controls', iconName: 'Grid', order: 17, roles: ['Super Admin', 'Manager'], isVisible: true },
    { id: 'nav-18', title: 'Telegram Notification Bot', tabKey: 'telegram', uniqueKey: 'telegram', category: 'System Controls', iconName: 'Bot', order: 18, roles: ['Super Admin', 'Manager'], isVisible: true },
  ]);

  // Application Data States
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isIconOnly, setIsIconOnly] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  const [guests, setGuests] = useState<Guest[]>(INITIAL_GUESTS);
  const [receipts, setReceipts] = useState<BillingReceipt[]>(INITIAL_RECEIPTS);
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [requisitions, setRequisitions] = useState<Requisition[]>(INITIAL_REQUISITIONS);
  const [pettyCash, setPettyCash] = useState<PettyCashEntry[]>(INITIAL_PETTY_CASH);
  const [staff, setStaff] = useState<StaffMember[]>(INITIAL_STAFF);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);

  // Helper to dispatch real Telegram Notifications via Telegram Bot API
  const dispatchTelegramAlert = async (
    eventType: string,
    message: string,
    category: 'kitchen' | 'admin' | 'finance' | 'all' = 'all',
    replyMarkup?: any
  ) => {
    const logId = `tg-${Date.now().toString().slice(-4)}`;
    const timestamp = `${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    
    // Add pending log entry
    const newLog: TelegramDispatchLog = {
      id: logId,
      timestamp,
      eventType,
      message,
      status: 'Delivered',
      replyMarkup,
    };
    setTelegramLogs((prev) => [newLog, ...prev]);

    const channels = getTelegramChannelIds();
    let targetChatIds: string[] = [];

    if (category === 'kitchen') {
      targetChatIds = Array.from(new Set([channels.kitchen, channels.admin]));
    } else if (category === 'finance') {
      targetChatIds = Array.from(new Set([channels.finance, channels.admin]));
    } else if (category === 'admin') {
      targetChatIds = [channels.admin];
    } else {
      targetChatIds = Array.from(new Set([channels.kitchen, channels.admin, channels.finance]));
    }

    let hasError = false;
    let errorMessage = '';

    for (const chatId of targetChatIds) {
      try {
        const payload: any = {
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        };
        if (replyMarkup) {
          payload.reply_markup = replyMarkup;
        }

        const response = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        const resData = await response.json();
        if (!response.ok || !resData.ok) {
          hasError = true;
          errorMessage = resData.description || 'Telegram API Error';
          console.error(`Telegram send failure to ${chatId}:`, resData);
        }
      } catch (err: any) {
        hasError = true;
        errorMessage = err?.message || 'Network fetch error';
        console.error(`Telegram network error to ${chatId}:`, err);
      }
    }

    if (hasError) {
      setTelegramLogs((prev) =>
        prev.map((log) =>
          log.id === logId ? { ...log, status: `Failed: ${errorMessage}` } : log
        )
      );
    }

    // Always record dispatch in Telescope Error Center (Telegram API Portal)
    recordTelescopeLog({
      portal: 'telegram',
      severity: hasError ? 'ERROR' : 'SUCCESS',
      msg: `POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.substring(0, 8)}.../sendMessage [${eventType}] - ${hasError ? 'Failed: ' + errorMessage : '200 OK Delivered'}`,
      origin: `/src/App.tsx -> dispatchTelegramAlert (${eventType})`,
      details: {
        eventType,
        category,
        targetChatIds,
        message,
        replyMarkup,
        status: hasError ? `Failed: ${errorMessage}` : '200 OK Delivered',
      },
    });
  };

  // Helper to add audit logs
  const logAudit = (actionText: string) => {
    const newLog: AuditLog = {
      id: `aud-${Date.now().toString().slice(-4)}`,
      timestamp: `${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
      user: activeRole,
      action: actionText,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Handlers
  const handleAddGuest = (newGuest: Guest) => {
    setGuests((prev) => [newGuest, ...prev]);
    logAudit(`Registered new resident check-in: ${newGuest.guestName} (${newGuest.roomNumber})`);
    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/guests/checkin - Registered Resident ${newGuest.guestName}`,
      origin: '/src/App.tsx -> handleAddGuest',
      details: newGuest,
    });
  };

  const handleCheckoutGuest = (receipt: BillingReceipt) => {
    setReceipts((prev) => [receipt, ...prev]);
    setGuests((prev) =>
      prev.map((g) =>
        g.id === receipt.guestId
          ? { ...g, status: 'CheckedOut', checkoutDate: receipt.checkoutDate }
          : g
      )
    );
    const msg = `🧾 <b>RESIDENT SETTLEMENT COMPLETED</b>\n• Resident: <b>${receipt.guestName}</b> (${receipt.roomNumber})\n• Receipt: #${receipt.id}\n• Total Amount Paid: <b>₹${receipt.grandTotal}</b> via ${receipt.paymentMethod || 'Cash'}`;
    logAudit(`Settled billing receipt ${receipt.id} (₹${receipt.grandTotal}) for ${receipt.guestName}`);
    if (telegramConfig.enabledEvents.guestCheckout) {
      dispatchTelegramAlert('Checkout', msg, 'finance');
    }
  };

  const handleAddOrder = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
    const itemsList = newOrder.items.map((i) => `• <b>${i.quantity}x ${i.name}</b>`).join('\n');
    
    let msg = `🛎️ <b>NEW KITCHEN TICKET ${newOrder.id}</b>\n• Resident: <b>${newOrder.guestName}</b> (${newOrder.roomNumber})\n• Items Ordered:\n${itemsList}\n• Total Ticket Amount: <b>₹${newOrder.totalAmount}</b>`;
    if (newOrder.guestId === 'staff-duty') {
      msg = `🍛 <b>STAFF DUTY MEAL DISPATCHED #${newOrder.id}</b>\n• Beneficiary: <b>${newOrder.guestName}</b>\n• Details: <b>${newOrder.items[0]?.name || 'Staff Meal'}</b>\n• Location: <b>Staff Pantry</b>`;
    }

    logAudit(`Created kitchen ticket ${newOrder.id} for resident ${newOrder.guestName} (₹${newOrder.totalAmount})`);
    
    if (telegramConfig.enabledEvents.kotOrders) {
      dispatchTelegramAlert('KOT Order', msg, 'kitchen');
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/kitchen/orders - Created Ticket #${newOrder.id} for ${newOrder.guestName}`,
      origin: '/src/App.tsx -> handleAddOrder',
      details: newOrder,
    });
  };

  const handleUpdateOrderStatus = (orderId: string, status: Order['status']) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
    const targetOrder = orders.find((o) => o.id === orderId);
    const guestInfo = targetOrder ? `${targetOrder.guestName} (${targetOrder.roomNumber})` : 'Resident';
    const itemsList = targetOrder?.items
      ? targetOrder.items.map((i) => `• <b>${i.quantity}x ${i.name}</b> (₹${i.quantity * i.unitPrice})`).join('\n')
      : '• Order Items';

    let statusEmoji = '🔥';
    let statusDetailText = '';
    let replyMarkup: any = undefined;

    if (status === 'Preparing') {
      statusEmoji = '🍳';
      statusDetailText = 'Preparing in Kitchen by Chef';
    } else if (status === 'Fulfilled') {
      statusEmoji = '✅';
      statusDetailText = 'Order Prepared & Ready to Serve';
      replyMarkup = {
        inline_keyboard: [
          [{ text: '🍽️ Tap when Served', callback_data: `serve_order_${orderId}` }]
        ]
      };
    } else if (status === 'Cancelled') {
      statusEmoji = '❌';
      statusDetailText = 'Ticket Cancelled';
    }

    const msg = `${statusEmoji} <b>KITCHEN ORDER ${status.toUpperCase()} #${orderId}</b>\n• Resident: <b>${guestInfo}</b>\n• Items Included:\n${itemsList}\n• Ticket Total: <b>₹${targetOrder?.totalAmount || 0}</b>\n• Placed At: <b>${targetOrder?.orderTime || 'Just now'}</b>\n• Current Status: <b>${statusDetailText}</b>`;
    logAudit(`Updated kitchen ticket ${orderId} status to ${status}`);

    if (telegramConfig.enabledEvents.kotOrders) {
      dispatchTelegramAlert('KOT Status', msg, 'kitchen', replyMarkup);
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PATCH /api/kitchen/orders/${orderId} - Status set to ${status}`,
      origin: '/src/App.tsx -> handleUpdateOrderStatus',
      details: { orderId, status, guestInfo, items: targetOrder?.items },
    });
  };

  const handleAddMenuItem = (item: MenuItem) => {
    setMenu((prev) => [...prev, item]);
    logAudit(`Added new food menu catalog item: ${item.name} (₹${item.price})`);
  };

  const handleUpdateMenuItem = (id: string, updated: Partial<MenuItem>) => {
    setMenu((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
    logAudit(`Updated food menu item ${id}`);
  };

  const handleDeleteMenuItem = (id: string) => {
    setMenu((prev) => prev.filter((m) => m.id !== id));
    logAudit(`Deleted food menu item ${id}`);
  };

  const handleUpdateNavItems = (items: NavMenuItem[]) => {
    setNavItems(items);
    logAudit(`Updated system navigation menu configuration & RBAC rules`);
  };

  const handleRequestMaterial = (req: Requisition) => {
    setRequisitions((prev) => [req, ...prev]);
    const msg = `📦 <b>NEW MATERIAL REQUISITION SHEET #${req.id}</b>\n• Requested By: <b>${req.requestedBy || activeRole}</b>\n• Material Item: <b>${req.requestedQty} ${req.unit}</b> of <b>${req.itemName}</b>\n• Initial Status: <b>${req.status}</b>`;
    logAudit(`Created material requisition ${req.id} for ${req.requestedQty} ${req.unit} of ${req.itemName}`);
    
    if (telegramConfig.enabledEvents.materialRequisitions) {
      dispatchTelegramAlert('Requisition', msg, 'kitchen');
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/kitchen/requisitions - Requisition #${req.id} (${req.itemName})`,
      origin: '/src/App.tsx -> handleRequestMaterial',
      details: req,
    });
  };

  const handleUpdateStock = (itemId: string, newStock: number) => {
    setInventory((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, currentStock: newStock } : i))
    );
    const item = inventory.find((i) => i.id === itemId);
    logAudit(`Adjusted inventory stock for ${item?.name || itemId} to ${newStock} ${item?.unit}`);

    if (item && newStock <= item.minThreshold && telegramConfig.enabledEvents.lowStockAlerts) {
      const msg = `⚠️ <b>LOW STOCK WARNING ALERT</b>\n• Inventory Item: <b>${item.name}</b>\n• Current Balance: <b>${newStock} ${item.unit}</b> (Min Threshold: ${item.minThreshold} ${item.unit})\n• Action Required: Reorder stock from vendor.`;
      dispatchTelegramAlert('Low Stock', msg, 'kitchen');
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PUT /api/inventory/stock/${itemId} - Balance updated to ${newStock}`,
      origin: '/src/App.tsx -> handleUpdateStock',
      details: { itemId, newStock, minThreshold: item?.minThreshold },
    });
  };

  const handleAddInventoryItem = (item: InventoryItem) => {
    setInventory((prev) => [...prev, item]);
    logAudit(`Added new inventory catalog item: ${item.name}`);
  };

  const handleUpdateInventoryItemImage = (itemId: string, imagePath: string) => {
    setInventory((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, imagePath } : i))
    );
    logAudit(`Updated image for inventory catalog item ${itemId}`);
  };

  const handleAddPettyCash = (entry: PettyCashEntry) => {
    setPettyCash((prev) => [entry, ...prev]);
    logAudit(`Recorded petty cash ${entry.type}: ₹${entry.amount} - ${entry.description}`);
    
    if (telegramConfig.enabledEvents.pettyCashExpenses) {
      const msg = `💰 <b>PETTY CASH ${entry.type.toUpperCase()} RECORDED</b>\n• Amount: <b>₹${entry.amount}</b>\n• Category: <b>${entry.category}</b>\n• Vendor / Payee: <b>${entry.vendor}</b>\n• Description: ${entry.description}`;
      dispatchTelegramAlert('Petty Cash', msg, 'finance');
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/petty-cash - Logged ${entry.type} of ₹${entry.amount}`,
      origin: '/src/App.tsx -> handleAddPettyCash',
      details: entry,
    });
  };

  const handleSendTestNotification = () => {
    const testTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const testMsg = `🧪 <b>TELEGRAM SYSTEM DIAGNOSTIC TEST</b>\n• App: Artists Farm Resort Management System\n• Time: ${testTime}\n• Status: Operational ✅\n• Channels: Kitchen, Admin, Finance`;
    dispatchTelegramAlert('Test Dispatch', testMsg, 'all');
  };

  const handleAddStaff = (member: StaffMember) => {
    setStaff((prev) => [...prev, member]);
    logAudit(`Added new staff member: ${member.name} (${member.role})`);
  };

  const handleRecordAttendance = (record: AttendanceRecord) => {
    setAttendance((prev) => {
      const filtered = prev.filter(
        (a) => !(a.staffId === record.staffId && a.date === record.date)
      );
      if ((record.status as string) === 'Clear' || !record.status) {
        return filtered;
      }
      return [record, ...filtered];
    });
    logAudit(`Recorded shift attendance for ${record.staffName}: ${record.status}`);
  };

  // Badge counts
  const lowStockCount = inventory.filter((i) => i.currentStock <= i.minThreshold).length;
  const pendingOrdersCount = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing').length;
  const pendingReqCount = requisitions.filter((r) => r.status === 'Pending').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-gray-900 dark:text-gray-100 antialiased transition-colors">
      <Header
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        stockAlertsCount={lowStockCount}
        pendingOrdersCount={pendingOrdersCount}
        onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isIconOnly={isIconOnly}
        onToggleIconOnly={() => setIsIconOnly(!isIconOnly)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />

      <Navigation
        activeTab={activeTab}
        setActiveTab={(tab) => handleNavigateTab(tab)}
        activeMenuItemKey={activeMenuItemKey}
        setActiveMenuItemKey={setActiveMenuItemKey}
        pendingOrdersCount={pendingOrdersCount}
        lowStockCount={lowStockCount}
        pendingReqCount={pendingReqCount}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
        isIconOnly={isIconOnly}
        onToggleIconOnly={() => setIsIconOnly(!isIconOnly)}
      />

      <TelegramNotificationModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        telegramConfig={telegramConfig}
        onUpdateConfig={setTelegramConfig}
        dispatchLogs={telegramLogs}
        onSendTestNotification={handleSendTestNotification}
      />

      {/* Main Flowbite Dashboard Container */}
      <div className={`${isIconOnly ? 'pl-16' : 'md:pl-64 pl-0'} pt-16 flex-1 flex flex-col min-h-screen transition-all duration-200`}>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full space-y-6">

          {activeTab === 'dashboard' && (
            <OperationalDashboard
              guests={guests}
              orders={orders}
              inventory={inventory}
              onNavigate={(tab) => handleNavigateTab(tab)}
              onOpenCheckin={() => handleNavigateTab('guests', 'guest_registration')}
            />
          )}

          {activeTab === 'guests' && (
            <GuestManagement
              guests={guests}
              receipts={receipts}
              orders={orders}
              onAddGuest={handleAddGuest}
              onCheckoutGuest={handleCheckoutGuest}
              activeMenuItemKey={activeMenuItemKey}
            />
          )}

          {activeTab === 'kitchen' && (
            <KitchenManagement
              guests={guests}
              orders={orders}
              menu={menu}
              requisitions={requisitions}
              onAddOrder={handleAddOrder}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onAddMenuItem={handleAddMenuItem}
              onRequestMaterial={handleRequestMaterial}
              onDispatchTelegram={dispatchTelegramAlert}
              activeMenuItemKey={activeMenuItemKey}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryManagement
              inventory={inventory}
              onUpdateStock={handleUpdateStock}
              onAddInventoryItem={handleAddInventoryItem}
              onUpdateItemImage={handleUpdateInventoryItemImage}
              activeMenuItemKey={activeMenuItemKey}
            />
          )}

          {activeTab === 'petty_cash' && (
            <PettyCashManagement
              entries={pettyCash}
              onAddEntry={handleAddPettyCash}
            />
          )}

          {activeTab === 'staff' && (
            <StaffManagement
              staff={staff}
              attendance={attendance}
              onAddStaff={handleAddStaff}
              onRecordAttendance={handleRecordAttendance}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsDashboard
              receipts={receipts}
              orders={orders}
              expenses={pettyCash}
            />
          )}

          {activeTab === 'audit_logs' && (
            <AuditLogsView logs={auditLogs} receipts={receipts} activeMenuItemKey={activeMenuItemKey} />
          )}

          {activeTab === 'export' && (
            <DataExportCenter
              guests={guests}
              receipts={receipts}
              orders={orders}
              inventory={inventory}
              expenses={pettyCash}
              staff={staff}
              attendance={attendance}
              auditLogs={auditLogs}
            />
          )}

          {activeTab === 'menu_manager' && (
            <MenuManager
              foodMenu={menu}
              onAddFoodItem={handleAddMenuItem}
              onUpdateFoodItem={handleUpdateMenuItem}
              onDeleteFoodItem={handleDeleteMenuItem}
              navItems={navItems}
              onUpdateNavItems={handleUpdateNavItems}
              activeRole={activeRole}
              activeMenuItemKey={activeMenuItemKey}
            />
          )}

          {activeTab === 'telegram' && (
            <TelegramNotificationModal
              isOpen={true}
              onClose={() => setIsTelegramModalOpen(false)}
              telegramConfig={telegramConfig}
              onUpdateConfig={setTelegramConfig}
              dispatchLogs={telegramLogs}
              onSendTestNotification={handleSendTestNotification}
              isEmbedded={true}
            />
          )}

          {activeTab === 'errors' && <TelescopeErrorCenter />}
        </main>

        <footer className="bg-white border-t border-gray-200 text-gray-500 text-xs py-4 px-4 sm:px-6 lg:px-8 mt-auto">
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="font-medium">
              © {new Date().getFullYear()} <strong className="text-gray-900">Artists Farm Jaipur</strong> — Flowbite Admin Application System
            </span>
            <span className="text-gray-400 text-[11px] font-mono">
              Node.js POS Runtime • Enterprise Edition
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
