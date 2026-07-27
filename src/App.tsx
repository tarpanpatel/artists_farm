import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { OperationalDashboard } from './components/OperationalDashboard';
import { GuestManagement } from './components/GuestManagement';
import { KitchenManagement } from './components/KitchenManagement';
import { InventoryManagement } from './components/InventoryManagement';
import { PettyCashManagement } from './components/PettyCashManagement';
import { CashDrawerManager } from './components/CashDrawerManager';
import { ExpenseItemsManagement } from './components/ExpenseItemsManagement';
import { StaffManagement } from './components/StaffManagement';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AuditLogsView } from './components/AuditLogsView';
import { DataExportCenter } from './components/DataExportCenter';
import { MenuManager } from './components/MenuManager';
import { MiscChargesManagement } from './components/MiscChargesManagement';
import { TelegramNotificationModal } from './components/TelegramNotificationModal';
import { CustomCSSOverride } from './components/CustomCSSOverride';
import { GlobalModal } from './components/GlobalModal';
import { LoginModal } from './components/LoginModal';
import { recordTelescopeLog } from './utils/telescopeLogger';
import { detectClientInfo } from './utils/clientInfo';
import { fetchExpensesFromDB, fetchMenuFromDB, addMenuItemDB, updateMenuItemDB, deleteMenuItemDB, fetchStaffUsersFromDB, fetchNavMenuFromDB, saveNavMenuDB, sendTelegramAlertDB, fetchGuestsFromDB, fetchOrdersFromDB, fetchInventoryFromDB, fetchAttendanceFromDB, fetchAuditLogsFromDB, addAuditLogDB, saveReceiptToDB, addGuestToDB, checkoutGuestInDB, resolveTelegramTemplate, addStaffUserDB, isTestingModeActive, setTestingModeState, resetTestDatabaseInDB, seedCatalogDB } from './services/api';
import { INITIAL_MENU } from './data/initialData';

// Removed INITIAL_ imports to ensure we never use hardcoded lists

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
  const getInitialActiveState = (): { tab: TabType; key: string } => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').trim();
      const routeMap: Record<string, { tab: TabType; key: string }> = {
        dashboard: { tab: 'dashboard', key: 'dashboard' },
        guest_registration: { tab: 'guests', key: 'guest_registration' },
        billing_checkout: { tab: 'guests', key: 'billing_checkout' },
        guests: { tab: 'guests', key: 'guest_registration' },
        take_food_order: { tab: 'kitchen', key: 'take_food_order' },
        kitchen_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        staff_meals: { tab: 'kitchen', key: 'staff_meals' },
        kitchen: { tab: 'kitchen', key: 'kitchen_orders' },
        stock_requests: { tab: 'inventory', key: 'stock_requests' },
        fulfill_stock_req: { tab: 'inventory', key: 'fulfill_stock_req' },
        deficit_shortfalls_log: { tab: 'inventory', key: 'deficit_shortfalls_log' },
        stock_log: { tab: 'inventory', key: 'stock_log' },
        kitchen_purchases: { tab: 'inventory', key: 'kitchen_purchases' },
        edit_kitchen_stock: { tab: 'inventory', key: 'edit_kitchen_stock' },
        inventory: { tab: 'inventory', key: 'stock_requests' },
        expenses: { tab: 'petty_cash', key: 'expenses' },
        petty_cash: { tab: 'petty_cash', key: 'expenses' },
        staff_payees_control: { tab: 'staff', key: 'staff_payees_control' },
        attendance_calendar: { tab: 'staff', key: 'attendance_calendar' },
        staff_directory_salaries: { tab: 'staff', key: 'staff_directory_salaries' },
        staff: { tab: 'staff', key: 'staff_payees_control' },
        dashboard_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        sys_logs_health: { tab: 'audit_logs', key: 'sys_logs_health' },
        past_receipts_log: { tab: 'audit_logs', key: 'past_receipts_log' },
        staff_activity_trail: { tab: 'audit_logs', key: 'staff_activity_trail' },
        edit_food_menu: { tab: 'menu_manager', key: 'edit_food_menu' },
        edit_main_menu: { tab: 'menu_manager', key: 'edit_main_menu' },
        menu_manager: { tab: 'menu_manager', key: 'edit_food_menu' },
        telegram: { tab: 'telegram', key: 'telegram' },
        misc_charges: { tab: 'misc_charges', key: 'misc_charges' },
        custom_css: { tab: 'custom_css', key: 'custom_css' },
        css_override: { tab: 'custom_css', key: 'custom_css' },
      };

      if (hash && routeMap[hash]) {
        return routeMap[hash];
      }

      const savedTab = localStorage.getItem('artists_farm_active_tab') as TabType;
      const savedKey = localStorage.getItem('artists_farm_active_menu_key');
      if (savedTab && savedKey) {
        return { tab: savedTab, key: savedKey };
      }
    }
    return { tab: 'dashboard', key: 'dashboard' };
  };

  const initialActive = getInitialActiveState();
  const [activeTab, setActiveTab] = useState<TabType>(initialActive.tab);
  const [activeMenuItemKey, setActiveMenuItemKey] = useState<string>(initialActive.key);

  useEffect(() => {
    localStorage.setItem('artists_farm_active_tab', activeTab);
    localStorage.setItem('artists_farm_active_menu_key', activeMenuItemKey);
    if (typeof window !== 'undefined' && activeMenuItemKey) {
      const targetHash = `#${activeMenuItemKey}`;
      if (window.location.hash !== targetHash) {
        window.history.pushState({ tab: activeTab, key: activeMenuItemKey }, '', targetHash);
      }
    }
  }, [activeTab, activeMenuItemKey]);

  // Global Input UX Enhancements
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const type = target.type;
        if (type === 'number' || type === 'text' || type === 'tel' || type === 'email' || target.tagName === 'TEXTAREA') {
          target.select();
        }
        if (target.type === 'number') {
          target.setAttribute('inputmode', 'decimal');
        }
      }
    };
    
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);


  // Apply saved custom CSS on app startup
  useEffect(() => {
    const savedCSS = localStorage.getItem('artists_farm_custom_css');
    if (savedCSS && savedCSS.trim()) {
      let el = document.getElementById('artists-farm-custom-css-override') as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement('style');
        el.id = 'artists-farm-custom-css-override';
        document.head.appendChild(el);
      }
      el.textContent = savedCSS;
    }
  }, []);

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
        staff: 'staff_payees_control',
        analytics: 'dashboard_analytics',
        audit_logs: 'audit_logs_main',
        export: 'data_export_center',
        menu_manager: 'edit_food_menu',
        telegram: 'telegram',
        errors: 'sys_logs_health',
        misc_charges: 'misc_charges',
        custom_css: 'custom_css',
      };
      setActiveMenuItemKey(defaults[tab] || tab);
    }
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('artists_farm_authenticated') === 'true';
    }
    return false;
  });
  const [currentUser, setCurrentUser] = useState<StaffMember | null>(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('artists_farm_user');
      if (savedUser) {
        try {
          return JSON.parse(savedUser);
        } catch (e) {}
      }
    }
    return null;
  });
  const [activeRole, setActiveRole] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('artists_farm_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.role) return parsed.role;
        } catch (e) {}
      }
    }
    return 'Super Admin';
  });

  const handleLoginSuccess = (staff: StaffMember) => {
    setIsAuthenticated(true);
    setCurrentUser(staff);
    setActiveRole(staff.role || 'Staff');
    localStorage.setItem('artists_farm_authenticated', 'true');
    localStorage.setItem('artists_farm_user', JSON.stringify(staff));
    logAudit(`Staff User ${staff.name} logged into POS portal`, { status: 'Success', module: 'login', user: staff.name });
  };

  useEffect(() => {
    // Global behavior for all inputs
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (['text', 'number', 'password', 'tel', 'email', 'search'].includes(input.type)) {
          // Select text on focus for easier editing
          input.select();
        }
      }
    };
    
    const handleInputEvents = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (input.type === 'number' && input.getAttribute('inputmode') !== 'decimal') {
          input.setAttribute('inputmode', 'decimal');
        }
      }
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('mouseover', handleInputEvents);
    document.addEventListener('touchstart', handleInputEvents);
    
    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('mouseover', handleInputEvents);
      document.removeEventListener('touchstart', handleInputEvents);
    };
  }, []);

  const handleLoginFailed = (username: string) => {
    logAudit(`Staff User ${username} failed login attempt`, { status: 'Failed', module: 'login', user: username });
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem('artists_farm_authenticated');
    localStorage.removeItem('artists_farm_user');
  };

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
    botToken: '[Secured in PHP Backend Proxy]',
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
      id: 'tg-1092',
      timestamp: '2026-07-25 18:00:00',
      eventType: 'Low Stock',
      message: '⚠️ Low Stock Alert: Amul Butter (600 Gms remaining, Threshold: 1000 Gms)',
      status: 'Delivered',
    },
  ]);

  // Navigation Items State (All Main Menu items across the application in exact sidebar tree hierarchy)
  const [navItems, setNavItems] = useState<NavMenuItem[]>([
    // 1. Top Flat Navigation Links
    { id: 'nav-1', title: 'Dashboard', tabKey: 'dashboard', uniqueKey: 'dashboard', category: 'Main Sections', iconName: 'LayoutDashboard', order: 1, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'], isVisible: true },
    { id: 'nav-2', title: 'Guest Registration', tabKey: 'guests', uniqueKey: 'guest_registration', category: 'Residents & Billing', iconName: 'Users', order: 2, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff'], isVisible: true },
    { id: 'nav-3', title: 'Billing & Checkout', tabKey: 'guests', uniqueKey: 'billing_checkout', category: 'Residents & Billing', iconName: 'CreditCard', order: 3, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff'], isVisible: true },
    { id: 'nav-4', title: 'Take Food Order', tabKey: 'kitchen', uniqueKey: 'take_food_order', category: 'Kitchen & Food', iconName: 'ShoppingCart', order: 4, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'], isVisible: true },
    { id: 'nav-5', title: 'Kitchen Orders', tabKey: 'kitchen', uniqueKey: 'kitchen_orders', category: 'Kitchen & Food', iconName: 'UtensilsCrossed', order: 5, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'], isVisible: true },
    { id: 'nav-6', title: 'Stock Requests', tabKey: 'inventory', uniqueKey: 'stock_requests', category: 'Stock & Inventory', iconName: 'ClipboardList', order: 6, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen'], isVisible: true },
    { id: 'nav-7', title: 'Fulfill Stock Req.', tabKey: 'inventory', uniqueKey: 'fulfill_stock_req', category: 'Stock & Inventory', iconName: 'Truck', order: 7, roles: ['Super Admin', 'Admin', 'Staff Supervisor'], isVisible: true },
    { id: 'nav-8', title: 'Staff Meals', tabKey: 'kitchen', uniqueKey: 'staff_meals', category: 'Kitchen & Food', iconName: 'CookingPot', order: 8, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen'], isVisible: true },
    { id: 'nav-9', title: 'Staff & Payees Control', tabKey: 'staff', uniqueKey: 'staff_payees_control', category: 'Staff & HR', iconName: 'ShieldCheck', order: 9, roles: ['Super Admin', 'Admin', 'Staff Supervisor'], isVisible: true },
    { id: 'nav-10', title: 'Attendance Calendar', tabKey: 'staff', uniqueKey: 'attendance_calendar', category: 'Staff & HR', iconName: 'Calendar', order: 10, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff'], isVisible: true },
    { id: 'nav-11', title: 'Staff Directory & Salaries', tabKey: 'staff', uniqueKey: 'staff_directory_salaries', category: 'Staff & HR', iconName: 'Users', order: 11, roles: ['Super Admin', 'Admin', 'Staff Supervisor'], isVisible: true },
    { id: 'nav-12', title: 'Expenses', tabKey: 'petty_cash', uniqueKey: 'expenses', category: 'Financials', iconName: 'Receipt', order: 12, roles: ['Super Admin', 'Admin', 'Staff Supervisor'], isVisible: true },
    { id: 'nav-13', title: 'Deficit Shortfalls Log', tabKey: 'inventory', uniqueKey: 'deficit_shortfalls_log', category: 'Stock & Inventory', iconName: 'TrendingDown', order: 13, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen'], isVisible: true },
    { id: 'nav-14', title: 'Stock Log', tabKey: 'inventory', uniqueKey: 'stock_log', category: 'Stock & Inventory', iconName: 'Package', order: 14, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen'], isVisible: true },
    { id: 'nav-15', title: 'Kitchen Purchases', tabKey: 'inventory', uniqueKey: 'kitchen_purchases', category: 'Stock & Inventory', iconName: 'ShoppingBag', order: 15, roles: ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen'], isVisible: true },

    // 2. Admin Control Dropdown Group Header & Tier 2 Children
    { id: 'nav-header-admin', title: 'Admin Control', tabKey: 'analytics', uniqueKey: 'admin_control_group', category: 'Admin Control', iconName: 'Sliders', order: 16, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-16', title: 'Dashboard Analytics', tabKey: 'analytics', uniqueKey: 'dashboard_analytics', category: 'Admin Control', iconName: 'BarChart3', order: 17, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-17', title: 'Past Receipts Log', tabKey: 'audit_logs', uniqueKey: 'past_receipts_log', category: 'Admin Control', iconName: 'BookOpen', order: 18, roles: ['Super Admin', 'Admin'], isVisible: true },

    // 3. Edit Items Sub-Dropdown Group Header & Tier 3 Children
    { id: 'nav-header-edit', title: 'Edit Items', tabKey: 'menu_manager', uniqueKey: 'edit_items_group', category: 'Edit Items', iconName: 'Boxes', order: 20, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-19', title: 'Edit Food Menu', tabKey: 'menu_manager', uniqueKey: 'edit_food_menu', category: 'Edit Items', iconName: 'Sliders', order: 21, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-20', title: 'Edit Kitchen Stock', tabKey: 'inventory', uniqueKey: 'edit_kitchen_stock', category: 'Edit Items', iconName: 'Boxes', order: 22, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-21', title: 'Edit Expense Items', tabKey: 'petty_cash', uniqueKey: 'edit_expense_items', category: 'Edit Items', iconName: 'Layers', order: 23, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-22', title: 'Edit Main Menu & RBAC', tabKey: 'menu_manager', uniqueKey: 'edit_main_menu', category: 'Edit Items', iconName: 'Link', order: 24, roles: ['Super Admin', 'Admin'], isVisible: true },

    // 4. Admin Post-Edit Items
    { id: 'nav-23', title: 'Staff & Permissions', tabKey: 'staff', uniqueKey: 'staff_permissions', category: 'System Controls', iconName: 'ShieldCheck', order: 25, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-24', title: 'Misc Charges', tabKey: 'petty_cash', uniqueKey: 'misc_charges', category: 'System Controls', iconName: 'DollarSign', order: 26, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-25', title: 'Data Export Center', tabKey: 'export', uniqueKey: 'data_export_center', category: 'System Controls', iconName: 'FileSpreadsheet', order: 27, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-26', title: 'Telegram Notification Bot', tabKey: 'telegram', uniqueKey: 'telegram', category: 'System Controls', iconName: 'Send', order: 28, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-27', title: 'Sys Logs & Health', tabKey: 'audit_logs', uniqueKey: 'sys_logs_health', category: 'System Controls', iconName: 'Lock', order: 29, roles: ['Super Admin', 'Admin'], isVisible: true },
    { id: 'nav-28', title: 'Beta Recipe Builder', tabKey: 'kitchen', uniqueKey: 'beta_recipe_builder', category: 'System Controls', iconName: 'CookingPot', order: 30, roles: ['Super Admin', 'Admin', 'Staff Kitchen'], isVisible: true },
    { id: 'nav-30', title: 'Custom CSS Override', tabKey: 'custom_css', uniqueKey: 'custom_css', category: 'System Controls', iconName: 'Paintbrush', order: 31, roles: ['Super Admin', 'Admin'], isVisible: true },

    // 5. Cash Drawer
    { id: 'nav-29', title: 'Cash Drawer', tabKey: 'petty_cash', uniqueKey: 'cash_drawer', category: 'Main Sections', iconName: 'Wallet', order: 31, roles: ['Super Admin', 'Admin', 'Staff Supervisor'], isVisible: true },
  ]);

  // Application Data States
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('artists_farm_dark_mode');
      if (saved !== null) return saved === 'true';
    }
    const hour = new Date().getHours();
    return hour >= 20 || hour < 6;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isIconOnly, setIsIconOnly] = useState(false);

  useEffect(() => {
    localStorage.setItem('artists_farm_dark_mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const [guests, setGuests] = useState<Guest[]>([]);
  const [receipts, setReceipts] = useState<BillingReceipt[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [pettyCash, setPettyCash] = useState<PettyCashEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Sandbox / Testing Mode State & Handlers
  const [isTestingMode, setIsTestingMode] = useState<boolean>(isTestingModeActive());

  const handleToggleTestingMode = () => {
    const nextState = !isTestingMode;
    setIsTestingMode(nextState);
    setTestingModeState(nextState);
    window.location.reload();
  };

  const handleResetTestDatabase = async () => {
    if (window.confirm("Are you sure you want to reset the Sandbox Database? This will overwrite all test data with a fresh snapshot from the live production database.")) {
      const res = await resetTestDatabaseInDB();
      if (res.success) {
        alert("✔ Sandbox Database reset to live production snapshot successfully!");
        window.location.reload();
      } else {
        alert(`Failed to reset Sandbox Database: ${res.message || 'Unknown error'}`);
      }
    }
  };

  // Hydrate live expenses from MySQL DB on app startup
  useEffect(() => {
    fetchExpensesFromDB().then((data) => {
      if (data && data.length > 0) {
        setPettyCash(data);
      }
    });
  }, []);

  // Hydrate staff from DB — single source of truth for Staff Directory & Permissions
  const reloadStaffFromDB = () => {
    fetchStaffUsersFromDB().then((data) => {
      if (data && data.length > 0) {
        setStaff(data.map((u: any) => ({
          id: u.id,
          name: u.fullName || u.name || u.username,
          role: u.role || 'Staff',
          phone: u.phone || '',
          monthlySalary: u.monthlySalary || 0,
          status: u.status || 'Active',
          passcode: u.passcode,
          qrCodeUrl: u.qrCodeUrl,
          isFinancialHandler: u.isFinancialHandler,
        })));
      }
    });
  };

  useEffect(() => {
    reloadStaffFromDB();
    fetchNavMenuFromDB().then((data) => {
      if (data && data.length > 0) {
        setNavItems((prev) => {
          // Map DB items by uniqueKey for fast lookup of roles and visibility
          const dbMap = new Map(data.map((d: any) => [d.uniqueKey, d]));
          // Maintain exact initial sidebar hierarchy, taking updated roles/visibility from DB
          return prev.map((initialItem, idx) => {
            const dbItem = dbMap.get(initialItem.uniqueKey);
            if (dbItem) {
              return {
                ...initialItem,
                title: dbItem.title || initialItem.title,
                category: initialItem.category,
                roles: dbItem.roles || initialItem.roles,
                isVisible: dbItem.isVisible !== undefined ? dbItem.isVisible : initialItem.isVisible,
                order: idx + 1,
              };
            }
            return { ...initialItem, order: idx + 1 };
          });
        });
      }
    });
  }, []);

  // Hydrate guests, menu, orders, inventory, attendance, and audit logs from DB on startup
  useEffect(() => {
    fetchGuestsFromDB().then((data) => {
      if (data && data.length > 0) setGuests(data);
    });
    fetchMenuFromDB().then((data) => {
      if (data && data.length > 0) {
        setMenu(data);
      } else {
        setMenu(INITIAL_MENU);
        INITIAL_MENU.forEach((item) => addMenuItemDB(item));
      }
    });
    fetchOrdersFromDB().then((data) => {
      if (data && data.length > 0) setOrders(data);
    });
    seedCatalogDB().then(() => {
      fetchInventoryFromDB().then((data) => {
        if (data && data.length > 0) setInventory(data);
      });
    });
    fetchAttendanceFromDB().then((data) => {
      if (data && data.length > 0) setAttendance(data);
    });
    fetchAuditLogsFromDB().then((data) => {
      if (data && data.length > 0) setAuditLogs(data);
    });
  }, []);

  // Helper to check if a route key is allowed for current activeRole
  const isRouteAllowed = (key: string, role: string, items: NavMenuItem[]) => {
    // Dropdown section containers (don't land on a separate page view) are always allowed if logged in
    if (key === 'admin_control_group' || key === 'edit_items_group') return true;
    const item = items.find((i) => (i.uniqueKey || i.tabKey) === key);
    if (!item) return false;
    if (!item.isVisible) return false;
    return item.roles.includes(role);
  };

  // Guard Effect 1: Trigger whenever activeRole, activeMenuItemKey, or navItems update
  useEffect(() => {
    if (!isAuthenticated) return;
    if (navItems.length === 0) return;

    const currentKey = activeMenuItemKey;
    const allowed = isRouteAllowed(currentKey, activeRole, navItems);
    if (!allowed) {
      // Find first permitted route for current user role
      const firstPermitted = navItems.find((i) => i.isVisible && i.roles.includes(activeRole));
      const fallbackTab = firstPermitted ? (firstPermitted.tabKey as TabType) : 'dashboard';
      const fallbackKey = firstPermitted ? (firstPermitted.uniqueKey || firstPermitted.tabKey) : 'dashboard';
      
      setActiveTab(fallbackTab);
      setActiveMenuItemKey(fallbackKey);
      window.location.hash = `#${fallbackKey}`;
    }
  }, [activeRole, activeMenuItemKey, navItems, isAuthenticated]);

  // Guard Effect 2: Trigger whenever user types a URL hash in the browser bar
  useEffect(() => {
    const handleUrlChange = () => {
      if (typeof window === 'undefined') return;
      if (!isAuthenticated) return;

      const hash = window.location.hash.replace('#', '').trim();
      if (!hash) return;
      
      const routeMap: Record<string, { tab: TabType; key: string }> = {
        dashboard: { tab: 'dashboard', key: 'dashboard' },
        guest_registration: { tab: 'guests', key: 'guest_registration' },
        billing_checkout: { tab: 'guests', key: 'billing_checkout' },
        guests: { tab: 'guests', key: 'guest_registration' },
        take_food_order: { tab: 'kitchen', key: 'take_food_order' },
        kitchen_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        staff_meals: { tab: 'kitchen', key: 'staff_meals' },
        kitchen: { tab: 'kitchen', key: 'kitchen_orders' },
        stock_requests: { tab: 'inventory', key: 'stock_requests' },
        fulfill_stock_req: { tab: 'inventory', key: 'fulfill_stock_req' },
        deficit_shortfalls_log: { tab: 'inventory', key: 'deficit_shortfalls_log' },
        stock_log: { tab: 'inventory', key: 'stock_log' },
        kitchen_purchases: { tab: 'inventory', key: 'kitchen_purchases' },
        edit_kitchen_stock: { tab: 'inventory', key: 'edit_kitchen_stock' },
        inventory: { tab: 'inventory', key: 'stock_requests' },
        expenses: { tab: 'petty_cash', key: 'expenses' },
        cash_drawer: { tab: 'petty_cash', key: 'cash_drawer' },
        petty_cash: { tab: 'petty_cash', key: 'expenses' },
        staff_payees_control: { tab: 'staff', key: 'staff_payees_control' },
        attendance_calendar: { tab: 'staff', key: 'attendance_calendar' },
        staff_directory_salaries: { tab: 'staff', key: 'staff_directory_salaries' },
        staff_permissions: { tab: 'staff', key: 'staff_permissions' },
        staff: { tab: 'staff', key: 'staff_payees_control' },
        dashboard_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        audit_logs_main: { tab: 'audit_logs', key: 'audit_logs_main' },
        audit_logs: { tab: 'audit_logs', key: 'audit_logs_main' },
        sys_logs_health: { tab: 'audit_logs', key: 'sys_logs_health' },
        past_receipts_log: { tab: 'audit_logs', key: 'past_receipts_log' },
        staff_activity_trail: { tab: 'audit_logs', key: 'staff_activity_trail' },
        edit_food_menu: { tab: 'menu_manager', key: 'edit_food_menu' },
        edit_expense_items: { tab: 'petty_cash', key: 'edit_expense_items' },
        edit_main_menu: { tab: 'menu_manager', key: 'edit_main_menu' },
        admin_control_group: { tab: 'menu_manager', key: 'edit_main_menu' },
        edit_items_group: { tab: 'menu_manager', key: 'edit_main_menu' },
        menu_manager: { tab: 'menu_manager', key: 'edit_food_menu' },
        misc_charges: { tab: 'petty_cash', key: 'misc_charges' },
        data_export_center: { tab: 'export', key: 'data_export_center' },
        telegram: { tab: 'telegram', key: 'telegram' },
        beta_recipe_builder: { tab: 'kitchen', key: 'beta_recipe_builder' },
        custom_css: { tab: 'custom_css', key: 'custom_css' },
        css_override: { tab: 'custom_css', key: 'custom_css' },
      };

      // 404 or Invalid Route -> Redirect to dashboard
      if (!routeMap[hash]) {
        setActiveTab('dashboard');
        setActiveMenuItemKey('dashboard');
        window.location.hash = '#dashboard';
        return;
      }

      const targetRoute = routeMap[hash];
      // Check RBAC permission for route target
      const allowed = isRouteAllowed(targetRoute.key, activeRole, navItems);
      if (allowed) {
        setActiveTab(targetRoute.tab);
        setActiveMenuItemKey(targetRoute.key);
      } else {
        // Forbidden route attempt -> Redirect to homepage #dashboard
        setActiveTab('dashboard');
        setActiveMenuItemKey('dashboard');
        window.location.hash = '#dashboard';
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [activeRole, navItems, isAuthenticated]);

  // Helper to dispatch real Telegram Notifications via Secure PHP Proxy API
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

    let hasError = false;
    let errorMessage = '';

    try {
      const ok = await sendTelegramAlertDB({
        eventType,
        category,
        message,
        replyMarkup,
      });
      if (!ok) {
        hasError = true;
        errorMessage = 'PHP Proxy returned failure';
      }
    } catch (err: any) {
      hasError = true;
      errorMessage = err?.message || 'Network error';
      console.error(`Telegram network error:`, err);
    }

    if (hasError) {
      setTelegramLogs((prev) =>
        prev.map((log) =>
          log.id === logId ? { ...log, status: `Failed: ${errorMessage}` } : log
        )
      );
    }

    // Persist full message to database audit trail
    addAuditLogDB({
      action: `[Telegram ${eventType}] ${message.replace(/<[^>]*>/g, '').replace(/\n/g, ' | ')}`,
      user: 'System',
      status: hasError ? 'Failed' : 'Success',
      module: 'telegram',
      timestamp,
    });

    // Always record dispatch in Telescope Error Center (Telegram API Portal)
    recordTelescopeLog({
      portal: 'telegram',
      severity: hasError ? 'ERROR' : 'SUCCESS',
      msg: `POST /api/router.php?action=send_telegram_alert [${eventType}] - ${hasError ? 'Failed: ' + errorMessage : '200 OK Delivered via PHP Proxy'}`,
      origin: `/src/App.tsx -> dispatchTelegramAlert (${eventType})`,
      details: {
        eventType,
        category,
        message,
        replyMarkup,
      },
    });
  };

  // Helper to add audit logs
  const logAudit = (actionText: string, extra?: { status?: string; module?: string; user?: string }) => {
    const client = detectClientInfo();
    const timestamp = `${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    const newLog: AuditLog = {
      id: `aud-${Date.now().toString().slice(-4)}`,
      timestamp,
      user: extra?.user || currentUser?.name || activeRole,
      action: actionText,
      ip_address: '',
      browser: client.browser,
      os: client.os,
      device_type: client.deviceType,
      status: (extra?.status as any) || 'Success',
      module: extra?.module || '',
      user_agent: client.userAgent,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
    addAuditLogDB({
      action: actionText,
      user: newLog.user,
      timestamp,
      browser: client.browser,
      os: client.os,
      device_type: client.deviceType,
      status: newLog.status,
      module: newLog.module,
      user_agent: client.userAgent,
    });
  };

  // Handlers
  const handleAddGuest = (newGuest: Guest) => {
    setGuests((prev) => [newGuest, ...prev]);
    addGuestToDB({
      guest_name: newGuest.guestName,
      phone_number: newGuest.phoneNumber,
      checkin_date: newGuest.checkinDate,
      expected_checkout: newGuest.expectedCheckout,
      room_number: newGuest.roomNumber,
      status: newGuest.status || 'Active',
      notes: newGuest.notes || '',
      booking_source: newGuest.bookingSource || '',
      no_of_guests: newGuest.numberOfGuests || 0,
      base_room_rent: newGuest.roomRate || 0,
      advance_paid: newGuest.advanceAmount || 0,
    }).then((dbId) => {
      if (dbId) {
        setGuests((prev) => prev.map((g) => g.id === newGuest.id ? { ...g, id: dbId } : g));
      }
    });
    logAudit(`Registered new resident check-in: ${newGuest.guestName} (${newGuest.roomNumber})`);
    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/guests/checkin - Registered Resident ${newGuest.guestName}`,
      origin: '/src/App.tsx -> handleAddGuest',
      details: newGuest,
    });
  };

  const handleCheckoutGuest = async (receipt: BillingReceipt) => {
    setReceipts((prev) => [receipt, ...prev]);
    setGuests((prev) =>
      prev.map((g) =>
        g.id === receipt.guestId
          ? { ...g, status: 'CheckedOut', checkoutDate: receipt.checkoutDate }
          : g
      )
    );
    await checkoutGuestInDB(receipt.guestId);
    saveReceiptToDB(receipt);
    
    let itemsStr = '';
    if (receipt.roomTotal > 0) {
      itemsStr += `  • Lodging (${receipt.nightsCount || 1} nights): <b>₹${receipt.roomTotal}</b>\n`;
    }
    if (receipt.foodItems && receipt.foodItems.length > 0) {
      itemsStr += `  • Kitchen Orders:\n`;
      receipt.foodItems.forEach(item => {
        itemsStr += `      - ${item.quantity}x ${item.name} = ₹${item.total}\n`;
      });
    }
    if (receipt.adjustments && receipt.adjustments.length > 0) {
      itemsStr += `  • Adjustments:\n`;
      receipt.adjustments.forEach(adj => {
        itemsStr += `      - ${adj.label} = ₹${adj.amount}\n`;
      });
    }
    const balanceDue = receipt.grandTotal - (receipt.advancePaid || 0);

    const msg = `🧾 <b>FULLY ITEMIZED SETTLEMENT BILL</b>
  Resident: <b>${receipt.guestName}</b> (Room ${receipt.roomNumber})
  Receipt: #${receipt.id}
  
<b>ITEMIZED CHARGES:</b>
${itemsStr}
<b>SUMMARY:</b>
  Advance Paid: <b>₹${receipt.advancePaid || 0}</b>
  Final Balance Due: <b>₹${balanceDue}</b>
  Total Bill: <b>₹${receipt.grandTotal}</b>
  Payment Mode: <b>${receipt.paymentMethod || 'Cash'}</b>`;
    logAudit(`Settled billing receipt ${receipt.id} (₹${receipt.grandTotal}) for ${receipt.guestName}`);
    if (telegramConfig.enabledEvents.guestCheckout) {
      const checkoutVars: Record<string, string> = {
        guest_name: receipt.guestName,
        room_number: receipt.roomNumber,
        receipt_id: receipt.id,
        items_charges: itemsStr,
        advance_paid: String(receipt.advancePaid || 0),
        balance_due: String(balanceDue),
        total_bill: String(receipt.grandTotal),
        payment_mode: receipt.paymentMethod || 'Cash',
      };
      const resolved = await resolveTelegramTemplate('checkout_settlement_bill', checkoutVars);
      const finalMsg = resolved || msg;
      dispatchTelegramAlert('Checkout', finalMsg, 'finance');
    }
  };

  const handleAddOrder = async (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
    const itemsList = newOrder.items.map((i) => `• <b>${i.quantity}x ${i.name}</b>`).join('\n');
    
    let msg = `🛎️ <b>NEW KITCHEN TICKET ${newOrder.id}</b>\n• Resident: <b>${newOrder.guestName}</b> (${newOrder.roomNumber})\n• Items Ordered:\n${itemsList}\n• Total Ticket Amount: <b>₹${newOrder.totalAmount}</b>`;
    if (newOrder.guestId === 'staff-duty') {
      msg = `🍛 <b>STAFF DUTY MEAL DISPATCHED #${newOrder.id}</b>\n• Beneficiary: <b>${newOrder.guestName}</b>\n• Details: <b>${newOrder.items[0]?.name || 'Staff Meal'}</b>\n• Location: <b>Staff Pantry</b>`;
    }

    logAudit(`Created kitchen ticket ${newOrder.id} for resident ${newOrder.guestName} (₹${newOrder.totalAmount})`);
    
    if (telegramConfig.enabledEvents.kotOrders) {
      if (newOrder.guestId === 'staff-duty') {
        const staffMealVars: Record<string, string> = {
          order_id: newOrder.id,
          beneficiary: newOrder.guestName,
          meal_details: newOrder.items[0]?.name || 'Staff Meal',
        };
        const resolved = await resolveTelegramTemplate('kitchen_staff_meal', staffMealVars);
        dispatchTelegramAlert('KOT Order', resolved || msg, 'kitchen');
      } else {
        const orderVars: Record<string, string> = {
          order_id: newOrder.id,
          guest_name: newOrder.guestName,
          table_no: newOrder.roomNumber,
          waiter_name: '',
          order_time: newOrder.orderTime,
          order_items: itemsList,
        };
        const resolved = await resolveTelegramTemplate('kitchen_new_order', orderVars);
        dispatchTelegramAlert('KOT Order', resolved || msg, 'kitchen');
      }
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/kitchen/orders - Created Ticket #${newOrder.id} for ${newOrder.guestName}`,
      origin: '/src/App.tsx -> handleAddOrder',
      details: newOrder,
    });
  };

  const handleUpdateOrderStatus = async (orderId: string, status: Order['status']) => {
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

    const statusOrderVars: Record<string, string> = {
      status_emoji: statusEmoji,
      status: status.toUpperCase(),
      order_id: orderId,
      guest_info: guestInfo,
      items_list: itemsList,
      ticket_total: String(targetOrder?.totalAmount || 0),
      placed_at: targetOrder?.orderTime || 'Just now',
      status_detail: statusDetailText,
    };

    if (telegramConfig.enabledEvents.kotOrders) {
      const resolved = await resolveTelegramTemplate('kitchen_order_status', statusOrderVars);
      dispatchTelegramAlert('KOT Status', resolved || msg, 'kitchen', replyMarkup);
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
    addMenuItemDB(item);
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} added new food menu catalog item: ${item.name} (₹${item.price})`);
  };

  const handleUpdateMenuItem = (id: string, updated: Partial<MenuItem>) => {
    const oldItem = menu.find((m) => m.id === id);
    setMenu((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
    updateMenuItemDB(id, updated);
    
    const changes: string[] = [];
    if (oldItem) {
      if (updated.name !== undefined && updated.name !== oldItem.name) {
        changes.push(`name of '${oldItem.name}' to '${updated.name}'`);
      }
      if (updated.price !== undefined && Number(updated.price) !== oldItem.price) {
        changes.push(`price of '${oldItem.name}' from ₹${Math.round(oldItem.price)} to ₹${Math.round(Number(updated.price))}`);
      }
      if (updated.category !== undefined && updated.category !== oldItem.category) {
        changes.push(`category of '${oldItem.name}' to '${updated.category}'`);
      }
      if (updated.available !== undefined && updated.available !== oldItem.available) {
        changes.push(`availability of '${oldItem.name}' to '${updated.available ? 'Available' : 'Unavailable'}'`);
      }
    }
    const currentUserName = currentUser?.name || activeRole;
    const logMsg = changes.length > 0 
      ? `${currentUserName} updated food menu item: ${changes.join(', ')}`
      : `${currentUserName} updated food menu item ${oldItem?.name || id}`;
    logAudit(logMsg);
  };

  const handleDeleteMenuItem = (id: string) => {
    const oldItem = menu.find((m) => m.id === id);
    setMenu((prev) => prev.filter((m) => m.id !== id));
    deleteMenuItemDB(id);
    const currentUserName = currentUser?.name || activeRole;
    const itemName = oldItem ? oldItem.name : id;
    logAudit(`${currentUserName} deleted food menu item '${itemName}'`);
  };

  const handleUpdateNavItems = (items: NavMenuItem[]) => {
    setNavItems(items);
    saveNavMenuDB(items);
    logAudit(`Updated system navigation menu configuration & RBAC rules`);
  };

  const handleRequestMaterial = async (req: Requisition) => {
    setRequisitions((prev) => [req, ...prev]);
    logAudit(`Created material requisition ${req.id} for ${req.requestedQty} ${req.unit} of ${req.itemName}`);
    
    if (telegramConfig.enabledEvents.materialRequisitions) {
      const reqVars: Record<string, string> = {
        req_id: req.id,
        requested_by: req.requestedBy || activeRole,
        qty: String(req.requestedQty),
        unit: req.unit,
        item_name: req.itemName,
        status: req.status,
      };
      const resolved = await resolveTelegramTemplate('material_requisition_single', reqVars);
      const reqMsg = resolved || `📦 <b>NEW MATERIAL REQUISITION SHEET #${req.id}</b>\n• Requested By: <b>${req.requestedBy || activeRole}</b>\n• Material Item: <b>${req.requestedQty} ${req.unit}</b> of <b>${req.itemName}</b>\n• Initial Status: <b>${req.status}</b>`;
      dispatchTelegramAlert('Requisition', reqMsg, 'kitchen');
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/kitchen/requisitions - Requisition #${req.id} (${req.itemName})`,
      origin: '/src/App.tsx -> handleRequestMaterial',
      details: req,
    });
  };

  const handleUpdateStock = async (itemId: string, newStock: number) => {
    const item = inventory.find((i) => i.id === itemId);
    const oldStock = item ? item.currentStock : 0;
    setInventory((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, currentStock: newStock } : i))
    );
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} updated stock of ${item?.name || itemId} from ${oldStock} ${item?.unit || ''} to ${newStock} ${item?.unit || ''}`);

    if (item && newStock <= item.minThreshold && telegramConfig.enabledEvents.lowStockAlerts) {
      const lowStockVars: Record<string, string> = {
        item_name: item.name,
        current_stock: String(newStock),
        unit: item.unit,
        min_threshold: String(item.minThreshold),
      };
      const resolved = await resolveTelegramTemplate('inventory_low_stock', lowStockVars);
      const lowMsg = resolved || `⚠️ <b>LOW STOCK WARNING ALERT</b>\n• Inventory Item: <b>${item.name}</b>\n• Current Balance: <b>${newStock} ${item.unit}</b> (Min Threshold: ${item.minThreshold} ${item.unit})\n• Action Required: Reorder stock from vendor.`;
      dispatchTelegramAlert('Low Stock', lowMsg, 'kitchen');
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
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} added new inventory catalog item: ${item.name}`);
  };

  const handleUpdateInventoryItemImage = (itemId: string, imagePath: string) => {
    setInventory((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, imagePath } : i))
    );
    const item = inventory.find((i) => i.id === itemId);
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} updated image for inventory item ${item?.name || itemId}`);
  };

  const handleAddPettyCash = async (entry: PettyCashEntry) => {
    setPettyCash((prev) => [entry, ...prev]);
    logAudit(`Recorded petty cash ${entry.type}: ₹${entry.amount} - ${entry.description}`);
    
    if (telegramConfig.enabledEvents.pettyCashExpenses) {
      const pettyVars: Record<string, string> = {
        entry_type: entry.type.toUpperCase(),
        amount: String(entry.amount),
        category: entry.category,
        vendor: entry.vendor || '',
        description: entry.description,
      };
      const resolved = await resolveTelegramTemplate('finance_petty_cash_expense', pettyVars);
      const pettyMsg = resolved || `💰 <b>PETTY CASH ${entry.type.toUpperCase()} RECORDED</b>\n• Amount: <b>₹${entry.amount}</b>\n• Category: <b>${entry.category}</b>\n• Vendor / Payee: <b>${entry.vendor}</b>\n• Description: ${entry.description}`;
      dispatchTelegramAlert('Petty Cash', pettyMsg, 'finance');
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `POST /api/petty-cash - Logged ${entry.type} of ₹${entry.amount}`,
      origin: '/src/App.tsx -> handleAddPettyCash',
      details: entry,
    });
  };

  const handleUpdatePettyCash = (updated: PettyCashEntry) => {
    setPettyCash((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    logAudit(`Updated petty cash entry #${updated.id}: ₹${updated.amount} - ${updated.description}`);
  };

  const handleDeletePettyCash = (id: string) => {
    setPettyCash((prev) => prev.filter((e) => e.id !== id));
    logAudit(`Deleted petty cash entry #${id}`);
  };

  const handleSendTestNotification = () => {
    const testTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const testMsg = `🧪 <b>TELEGRAM SYSTEM DIAGNOSTIC TEST</b>\n• App: Artists Farm Resort Management System\n• Time: ${testTime}\n• Status: Operational ✅\n• Channels: Kitchen, Admin, Finance`;
    dispatchTelegramAlert('Test Dispatch', testMsg, 'all');
  };

  const handleAddStaff = (member: StaffMember) => {
    setStaff((prev) => [...prev, member]);
    addStaffUserDB({
      id: member.id,
      username: member.name,
      fullName: member.name,
      role: member.role,
      phone: member.phone,
      monthlySalary: member.monthlySalary,
      status: member.status,
    });
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
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} marked ${record.staffName} ${record.status.toLowerCase()} on attendance calendar`);
  };

  // Badge counts
  const lowStockCount = inventory.filter((i) => i.currentStock <= i.minThreshold).length;
  const pendingOrdersCount = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing').length;
  const pendingReqCount = requisitions.filter((r) => r.status === 'Pending').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-gray-900 dark:text-gray-100 antialiased transition-colors">
      {!isAuthenticated && (
        <LoginModal
          staffList={staff}
          onLoginSuccess={handleLoginSuccess}
          onLoginFailed={handleLoginFailed}
        />
      )}

      <Header
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        currentUser={currentUser}
        onLogout={handleLogout}
        stockAlertsCount={lowStockCount}
        pendingOrdersCount={pendingOrdersCount}
        onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isIconOnly={isIconOnly}
        onToggleIconOnly={() => setIsIconOnly(!isIconOnly)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        isAuthenticated={isAuthenticated}
        isTestingMode={isTestingMode}
        onToggleTestingMode={handleToggleTestingMode}
      />

      {isTestingMode && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950 px-4 py-2 text-xs font-bold shadow-md flex flex-wrap items-center justify-between z-40 border-b border-amber-400 mt-16">
          <div className="flex items-center gap-2">
            <span className="bg-slate-950 text-amber-400 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide">
              🧪 TEST MODE ACTIVE
            </span>
            <span>
              All modifications are isolated in the Sandbox Database. Live production data remains completely protected.
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 sm:mt-0">
            <button
              onClick={handleResetTestDatabase}
              className="bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-3 py-1 rounded-lg transition-all shadow-xs cursor-pointer active:scale-95 text-[11px]"
            >
              🔄 Reset Sandbox Data
            </button>
            <button
              onClick={handleToggleTestingMode}
              className="bg-amber-800 hover:bg-amber-900 text-white font-bold px-2.5 py-1 rounded-lg transition-all text-[11px] cursor-pointer"
            >
              Exit Test Mode
            </button>
          </div>
        </div>
      )}

      <Navigation
        activeTab={activeTab}
        setActiveTab={(tab) => handleNavigateTab(tab)}
        activeMenuItemKey={activeMenuItemKey}
        setActiveMenuItemKey={setActiveMenuItemKey}
        pendingOrdersCount={pendingOrdersCount}
        lowStockCount={lowStockCount}
        pendingReqCount={pendingReqCount}
        guests={guests}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
        isIconOnly={isIconOnly}
        onToggleIconOnly={() => setIsIconOnly(!isIconOnly)}
        activeRole={activeRole}
        navItems={navItems}
        onLogout={handleLogout}
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
        <main className="flex-1 px-1 py-1 sm:px-6 sm:py-6 lg:px-8 lg:py-8 w-full space-y-2 sm:space-y-6">

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
              staff={staff}
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
              inventory={inventory}
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
              staff={staff}
              currentUser={currentUser}
              onUpdateStock={handleUpdateStock}
              onAddInventoryItem={handleAddInventoryItem}
              onUpdateItemImage={handleUpdateInventoryItemImage}
              activeMenuItemKey={activeMenuItemKey}
              onDispatchTelegram={dispatchTelegramAlert}
              onLogAudit={logAudit}
            />
          )}

          {activeTab === 'petty_cash' && activeMenuItemKey === 'edit_expense_items' && (
            <ExpenseItemsManagement />
          )}

          {activeTab === 'petty_cash' && activeMenuItemKey === 'cash_drawer' && (
            <CashDrawerManager
              staff={staff}
              activeRole={activeRole}
              onLogAudit={logAudit}
              onDispatchTelegram={dispatchTelegramAlert}
            />
          )}

          {activeTab === 'petty_cash' && activeMenuItemKey !== 'edit_expense_items' && activeMenuItemKey !== 'cash_drawer' && (
            <PettyCashManagement
              entries={pettyCash}
              staff={staff}
              onAddEntry={handleAddPettyCash}
              onUpdateEntry={handleUpdatePettyCash}
              onDeleteEntry={handleDeletePettyCash}
            />
          )}

          {activeTab === 'staff' && (
            <StaffManagement
              activeMenuItemKey={activeMenuItemKey}
              staff={staff}
              attendance={attendance}
              onAddStaff={handleAddStaff}
              onRecordAttendance={handleRecordAttendance}
              onReloadStaff={reloadStaffFromDB}
              expenses={pettyCash}
              auditLogs={auditLogs}
              onLogAudit={logAudit}
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
              menu={menu}
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
              staff={staff}
            />
          )}

          {activeTab === 'misc_charges' && (
            <MiscChargesManagement onLogAudit={logAudit} />
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
              onLogAudit={logAudit}
            />
          )}

          {activeTab === 'custom_css' && (
            <CustomCSSOverride />
          )}
        </main>
      </div>
      <GlobalModal />
    </div>
  );
}
