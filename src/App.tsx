import React, { useState, useEffect, useMemo } from 'react';
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
import { ToastProvider } from './components/ToastContext';
import { LoginModal } from './components/LoginModal';
import { StaffProvider, useStaff } from './contexts/StaffContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FinanceProvider, useFinance } from './contexts/FinanceContext';
import { InventoryProvider, useInventoryContext } from './contexts/InventoryContext';
import { KitchenProvider, useKitchenContext } from './contexts/KitchenContext';
import { recordTelescopeLog } from './utils/telescopeLogger';
import { detectClientInfo } from './utils/clientInfo';
import { isKitchenModuleNavItem } from './data/appConfig';
import { fetchMenuFromDB, addMenuItemDB, updateMenuItemDB, deleteMenuItemDB, fetchNavMenuFromDB, saveNavMenuDB, sendTelegramAlertDB, fetchGuestsFromDB, fetchAuditLogsFromDB, addAuditLogDB, saveReceiptToDB, addGuestToDB, checkoutGuestInDB, resolveTelegramTemplate, isTestingModeActive, setTestingModeState, resetTestDatabaseInDB, dedupMenuDB, fetchReceiptsFromDB, fetchPropertyModulesFromDB, fetchCurrentProperty, getPropertySlug } from './services/api';



import {
  Guest,
  BillingReceipt,
  MenuItem,
  InventoryItem,
  Requisition,
  PettyCashEntry,
  StaffMember,
  AuditLog,
  TelegramConfig,
  TelegramDispatchLog,
  NavMenuItem,
} from './types';

function AppBody() {
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
        attendance_salaries: { tab: 'staff', key: 'attendance_salaries' },
        attendance_calendar: { tab: 'staff', key: 'attendance_calendar' },
        staff_directory_salaries: { tab: 'staff', key: 'staff_directory_salaries' },
        staff: { tab: 'staff', key: 'staff_payees_control' },
        dashboard_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        purchase_analytics: { tab: 'analytics', key: 'purchase_analytics' },
        past_receipts_log: { tab: 'audit_logs', key: 'past_receipts_log' },
        edit_food_menu: { tab: 'menu_manager', key: 'edit_food_menu' },
        edit_main_menu: { tab: 'menu_manager', key: 'edit_main_menu' },
        menu_manager: { tab: 'menu_manager', key: 'edit_food_menu' },
        telegram: { tab: 'telegram', key: 'telegram' },
        misc_charges: { tab: 'petty_cash', key: 'misc_charges' },
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
  const [propertyName, setPropertyName] = useState<string>(() => {
    // Initialize with property slug instead of hardcoded default to avoid flash
    const slug = getPropertySlug();
    return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
  });
  const [currentPropertyColorScheme, setCurrentPropertyColorScheme] = useState<string>('blue'); // Default color scheme

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
        audit_logs: 'past_receipts_log',
        export: 'data_export_center',
        menu_manager: 'edit_food_menu',
        telegram: 'telegram',
        misc_charges: 'misc_charges',
        custom_css: 'custom_css',
      };
      setActiveMenuItemKey(defaults[tab] || tab);
    }
  };

  const { currentUser, activeRole, isAuthenticated, setActiveRole, login, logout } = useAuth();

  const handleLoginSuccess = (staffMember: StaffMember) => {
    login(staffMember);
    logAudit(`Staff User ${staffMember.name} logged into POS portal`, { status: 'Success', module: 'login', user: staffMember.name });
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
    logout();
    logAudit(`${currentUser?.name || activeRole} logged out`);
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

  // Navigation Items State - fetched from database instead of hardcoded
  const [navItems, setNavItems] = useState<NavMenuItem[]>([]);

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
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const { refreshStaff, refreshAttendance } = useStaff();
  const { refreshPettyCash, pettyCash, addPettyCash, updatePettyCash, deletePettyCash } = useFinance();
  const { refreshInventory, inventory, requisitions, lowStockCount, updateStock, addInventoryItem, updateInventoryItemImage, addRequisition } = useInventoryContext();
  const { orders, addOrder, updateOrderStatus } = useKitchenContext();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Sandbox / Testing Mode State & Handlers
  const [isTestingMode, setIsTestingMode] = useState<boolean>(isTestingModeActive());

  const handleToggleTestingMode = () => {
    const nextState = !isTestingMode;
    setTestingModeState(nextState);
    setIsTestingMode(nextState);
  };

  // Re-fetch ALL data when testing mode changes (live DB ↔ test DB)
  useEffect(() => {
    fetchGuestsFromDB().then((data) => {
      if (data && data.length > 0) setGuests(data); else setGuests([]);
    });
    fetchMenuFromDB().then((data) => {
      if (data && data.length > 0) setMenu(data); else setMenu([]);
    });
    refreshStaff();
    refreshAttendance();
    fetchAuditLogsFromDB().then((data) => {
      if (data && data.length > 0) setAuditLogs(data); else setAuditLogs([]);
    });
    fetchReceiptsFromDB().then((data) => {
      if (data && data.length > 0) setReceipts(data); else setReceipts([]);
    });
  }, [isTestingMode]);

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

  // Hydrate nav menu from DB on startup
  useEffect(() => {
    refreshStaff();
    fetchNavMenuFromDB().then((data) => {
      if (data && data.length > 0) {
        // Filter out removed nav items (Audit Logs, Staff Activity Trail, Error Logs)
        const removedKeys = new Set(['audit_logs_main', 'staff_activity_trail', 'errors']);
        const filtered = data.filter((dbItem: any) => !removedKeys.has(dbItem.uniqueKey));

        setNavItems((prev) => {
          // Build a map of initial items by uniqueKey for ordering
          const initialMap = new Map(prev.map((item) => [item.uniqueKey, item]));
          // Merge: use DB as source of truth, keep initial order for known items
          const merged = filtered.map((dbItem: any, idx: number) => {
            const initial = initialMap.get(dbItem.uniqueKey);
            return {
              id: dbItem.id,
              title: dbItem.title,
              tabKey: dbItem.tabKey,
              uniqueKey: dbItem.uniqueKey,
              category: dbItem.category,
              iconName: dbItem.iconName,
              order: initial ? prev.indexOf(initial) + 1 : idx + 1,
              roles: dbItem.roles || ['Super Admin'],
              isVisible: dbItem.isVisible,
              parentId: dbItem.parentId ?? null,
              customUrl: dbItem.customUrl || undefined,
              openInNewTab: dbItem.openInNewTab || false,
            };
          });
          return merged;
        });
      }
    });
  }, []);

  // Apply property color scheme to document.documentElement using CSS variables
  useEffect(() => {
    const colorVariants: Record<string, Record<string, string>> = {
      'blue': { '400': '#60a5fa', '600': '#2563eb', '700': '#1d4ed8' },
      'emerald': { '400': '#34d399', '600': '#059669', '700': '#047857' },
      'red': { '400': '#f87171', '600': '#dc2626', '700': '#b91c1c' },
      'indigo': { '400': '#818cf8', '600': '#4f46e5', '700': '#4338ca' },
      'purple': { '400': '#d8b4fe', '600': '#9333ea', '700': '#7e22ce' },
      'pink': { '400': '#f472b6', '600': '#ec4899', '700': '#be185d' },
      'amber': { '400': '#fbbf24', '600': '#d97706', '700': '#b45309' },
      'cyan': { '400': '#22d3ee', '600': '#0891b2', '700': '#0e7490' },
      'slate': { '400': '#94a3b8', '600': '#475569', '700': '#334155' },
      'gray': { '400': '#9ca3af', '600': '#4b5563', '700': '#374151' },
    };
    const colors = colorVariants[currentPropertyColorScheme] || colorVariants['blue'];
    Object.entries(colors).forEach(([variant, hex]) => {
      document.documentElement.style.setProperty(`--app-primary-${variant}`, hex);
    });
    // Also set the theme class for any CSS-based theming
    document.documentElement.setAttribute('data-color-scheme', currentPropertyColorScheme);
  }, [currentPropertyColorScheme]);


  // Fetch current property name on startup
  useEffect(() => {
    fetchCurrentProperty().then((property) => {
      if (property && property.name) {
        setPropertyName(property.name);
      }
    });
    fetchCurrentProperty().then((property) => {
      if (property && property.tailwind_color_scheme) setCurrentPropertyColorScheme(property.tailwind_color_scheme);
    });
  }, []);

  // Hydrate this property's module toggles (kitchen module gates the Kitchen &
  // Food nav items — but not "Edit Main Menu & RBAC" itself, that editor stays
  // reachable regardless; it just hides kitchen items from its own list, see
  // NavMenuEditor's hideKitchenItems prop below)
  const [kitchenModuleEnabled, setKitchenModuleEnabled] = useState(true);
  useEffect(() => {
    fetchPropertyModulesFromDB().then((modules) => {
      const kitchen = modules.find((m) => m.slug === 'kitchen');
      if (kitchen) setKitchenModuleEnabled(!!kitchen.is_enabled);
    });
  }, []);

  // Fetch navigation items from database
  useEffect(() => {
    fetchNavMenuFromDB().then((items) => {
      if (items && items.length > 0) {
        setNavItems(items);
      }
    });
  }, []);

  // Nav items filtered by this property's module toggles. Used for rendering and
  // route guards; NavMenuEditor still edits the unfiltered `navItems` config.
  const visibleNavItems = useMemo(() => {
    if (kitchenModuleEnabled) return navItems;
    return navItems.filter((item) => !isKitchenModuleNavItem(item));
  }, [navItems, kitchenModuleEnabled]);

  // Hydrate guests, menu, orders, inventory, attendance, and audit logs from DB on startup
  useEffect(() => {
    fetchGuestsFromDB().then((data) => {
      if (data && data.length > 0) setGuests(data);
    });
    fetchMenuFromDB().then((data) => {
      if (data && data.length > 75) {
        dedupMenuDB().then(() => {
          fetchMenuFromDB().then((clean) => {
            if (clean && clean.length > 0) setMenu(clean);
          });
        });
      } else if (data && data.length > 0) {
        setMenu(data);
      }
    });
    refreshAttendance();
    fetchAuditLogsFromDB().then((data) => {
      if (data && data.length > 0) setAuditLogs(data);
    });
    fetchReceiptsFromDB().then((data) => {
      if (data && data.length > 0) setReceipts(data);
    });
  }, []);

  // Helper to check if a route key is allowed for current activeRole
  const isRouteAllowed = (key: string, role: string, items: NavMenuItem[]) => {
    // Dropdown section containers (don't land on a separate page view) are always allowed if logged in
    if (key === 'admin_control_group' || key === 'edit_items_group') return true;
    // Preserve old bookmarked Attendance & Salaries links while the navigation uses
    // the canonical attendance calendar route.
    const routeKey = key === 'attendance_salaries' ? 'attendance_calendar' : key;
    const item = items.find((i) => (i.uniqueKey || i.tabKey) === routeKey);
    if (!item) return false;
    if (!item.isVisible) return false;
    return item.roles.includes(role);
  };

  // Guard Effect 1: Trigger whenever activeRole, activeMenuItemKey, or visibleNavItems update
  useEffect(() => {
    if (!isAuthenticated) return;
    if (visibleNavItems.length === 0) return;

    const currentKey = activeMenuItemKey;
    const allowed = isRouteAllowed(currentKey, activeRole, visibleNavItems);
    if (!allowed) {
      // Find first permitted route for current user role
      const firstPermitted = visibleNavItems.find((i) => i.isVisible && i.roles.includes(activeRole));
      const fallbackTab = firstPermitted ? (firstPermitted.tabKey as TabType) : 'dashboard';
      const fallbackKey = firstPermitted ? (firstPermitted.uniqueKey || firstPermitted.tabKey) : 'dashboard';

      setActiveTab(fallbackTab);
      setActiveMenuItemKey(fallbackKey);
      window.location.hash = `#${fallbackKey}`;
    }
  }, [activeRole, activeMenuItemKey, visibleNavItems, isAuthenticated]);

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
        attendance_salaries: { tab: 'staff', key: 'attendance_salaries' },
        attendance_calendar: { tab: 'staff', key: 'attendance_calendar' },
        staff_directory_salaries: { tab: 'staff', key: 'staff_directory_salaries' },
        staff_permissions: { tab: 'staff', key: 'staff_permissions' },
        staff: { tab: 'staff', key: 'staff_payees_control' },
        dashboard_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        purchase_analytics: { tab: 'analytics', key: 'purchase_analytics' },
        past_receipts_log: { tab: 'audit_logs', key: 'past_receipts_log' },
        login_logs: { tab: 'audit_logs', key: 'login_logs' },
        system_health: { tab: 'audit_logs', key: 'system_health' },
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

      // 404 or Invalid Route -> Try dynamic nav items from DB, then fallback to dashboard
      if (!routeMap[hash]) {
        const dynamicItem = visibleNavItems.find((n) => n.uniqueKey === hash || n.tabKey === hash);
        if (dynamicItem && dynamicItem.isVisible) {
          setActiveTab(dynamicItem.tabKey as any || 'dashboard');
          setActiveMenuItemKey(dynamicItem.uniqueKey || hash);
        } else {
          setActiveTab('dashboard');
          setActiveMenuItemKey('dashboard');
          window.location.hash = '#dashboard';
        }
        return;
      }

      const targetRoute = routeMap[hash];
      // Check RBAC permission for route target
      const allowed = isRouteAllowed(targetRoute.key, activeRole, visibleNavItems);
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
  }, [activeRole, visibleNavItems, isAuthenticated]);

  // Helper to dispatch real Telegram Notifications via Secure PHP Proxy API
  const dispatchTelegramAlert = async (
    eventType: string,
    message: string,
    category: 'kitchen' | 'admin' | 'finance' | 'all' = 'all',
    replyMarkup?: any,
    templateKey?: string
  ) => {
    const logId = `tg-${Date.now().toString().slice(-4)}`;
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

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
        templateKey,
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
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
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
      dispatchTelegramAlert('Checkout', finalMsg, 'finance', undefined, 'checkout_settlement_bill');
    }
  };

  const handleAddMenuItem = (item: MenuItem) => {
    setMenu((prev) => [...prev, item]);
    addMenuItemDB(item);
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} added new food menu catalog item: ${item.name} (₹${item.price})`);
  };

  const handleUpdateMenuItem = (id: number, updated: Partial<MenuItem>) => {
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
      if (updated.imagePath !== undefined && updated.imagePath !== oldItem.imagePath) {
        changes.push(`image for '${oldItem.name}' (updated)`);
      }
    }
    const currentUserName = currentUser?.name || activeRole;
    const logMsg = changes.length > 0
      ? `${currentUserName} updated food menu item: ${changes.join(', ')}`
      : `${currentUserName} updated food menu item ${oldItem?.name || id}`;
    logAudit(logMsg);
  };

  const handleDeleteMenuItem = (id: number) => {
    const oldItem = menu.find((m) => m.id === id);
    setMenu((prev) => prev.filter((m) => m.id !== id));
    deleteMenuItemDB(id);
    const currentUserName = currentUser?.name || activeRole;
    const itemName = oldItem ? oldItem.name : id;
    logAudit(`${currentUserName} deleted food menu item '${itemName}'`);
  };

  const handleUpdateNavItems = (items: NavMenuItem[]) => {
    const oldMap = new Map(navItems.map(i => [i.uniqueKey, i]));
    const newMap = new Map(items.map(i => [i.uniqueKey, i]));
    const changes: string[] = [];
    const currentUserName = currentUser?.name || activeRole;

    items.forEach(item => {
      if (item.uniqueKey && !oldMap.has(item.uniqueKey)) {
        changes.push(`Added "${item.title}"`);
      }
    });
    navItems.forEach(item => {
      if (item.uniqueKey && !newMap.has(item.uniqueKey)) {
        changes.push(`Removed "${item.title}"`);
      }
    });
    items.forEach(item => {
      const old = item.uniqueKey ? oldMap.get(item.uniqueKey) : undefined;
      if (!old) return;
      if (item.parentId !== old.parentId) {
        const newParent = item.parentId ? (newMap.get(item.parentId)?.title || item.parentId) : 'Root';
        const oldParent = old.parentId ? (oldMap.get(old.parentId)?.title || old.parentId) : 'Root';
        changes.push(`Moved "${item.title}" from ${oldParent} → ${newParent}`);
      }
      if (item.title !== old.title) changes.push(`Renamed "${old.title}" → "${item.title}"`);
      if (JSON.stringify(item.roles) !== JSON.stringify(old.roles)) {
        changes.push(`Updated roles for "${item.title}" from [${old.roles?.join(', ')}] to [${item.roles?.join(', ')}]`);
      }
      if (item.isVisible !== old.isVisible) changes.push(`Set "${item.title}" to ${item.isVisible ? 'visible' : 'hidden'}`);
    });

    const detail = changes.length > 0 ? ': ' + changes.join('; ') : ' (no changes detected)';
    logAudit(`${currentUserName} updated navigation menu${detail}`, { module: 'navigation' });
    setNavItems(items);
  };

  const handleRequestMaterial = async (req: Requisition) => {
    addRequisition(req);
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
      dispatchTelegramAlert('Requisition', reqMsg, 'kitchen', undefined, 'material_requisition_single');
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
    updateStock(itemId, newStock);
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
      dispatchTelegramAlert('Low Stock', lowMsg, 'kitchen', undefined, 'inventory_low_stock');
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
    addInventoryItem(item);
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} added new inventory catalog item: ${item.name}`);
  };

  const handleUpdateInventoryItemImage = (itemId: string, imagePath: string) => {
    updateInventoryItemImage(itemId, imagePath);
    const item = inventory.find((i) => i.id === itemId);
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} updated image for inventory item ${item?.name || itemId}`);
  };

  const handleAddPettyCash = async (entry: PettyCashEntry) => {
    addPettyCash(entry);
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
      dispatchTelegramAlert('Petty Cash', pettyMsg, 'finance', undefined, 'finance_petty_cash_expense');
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
    updatePettyCash(updated);
    const oldEntry = pettyCash.find(e => e.id === updated.id);
    const changes: string[] = [];
    if (oldEntry) {
      if (updated.amount !== undefined && updated.amount !== oldEntry.amount) changes.push(`amount from ₹${oldEntry.amount} to ₹${updated.amount}`);
      if (updated.description !== undefined && updated.description !== oldEntry.description) changes.push(`description from "${oldEntry.description}" to "${updated.description}"`);
      if (updated.vendor !== undefined && updated.vendor !== oldEntry.vendor) changes.push(`vendor from "${oldEntry.vendor || ''}" to "${updated.vendor || ''}"`);
      if (updated.category !== undefined && updated.category !== oldEntry.category) changes.push(`category from "${oldEntry.category || ''}" to "${updated.category || ''}"`);
    }
    const detail = changes.length > 0 ? changes.join(', ') : `petty cash entry #${updated.id}`;
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} updated ${detail}`);
  };

  const handleDeletePettyCash = (id: string) => {
    deletePettyCash(id);
    const oldEntry = pettyCash.find(e => e.id === id);
    const detail = oldEntry ? ` #${id}: ₹${oldEntry.amount} - "${oldEntry.description}"` : ` #${id}`;
    const currentUserName = currentUser?.name || activeRole;
    logAudit(`${currentUserName} deleted petty cash entry${detail}`);
  };

  const handleSendTestNotification = () => {
    const testTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const testMsg = `🧪 <b>TELEGRAM SYSTEM DIAGNOSTIC TEST</b>\n• App: Artists Farm Resort Management System\n• Time: ${testTime}\n• Status: Operational ✅\n• Channels: Kitchen, Admin, Finance`;
    dispatchTelegramAlert('Test Dispatch', testMsg, 'all');
  };

  // Badge counts
  const { pendingOrdersCount } = useKitchenContext();
  const pendingReqCount = requisitions.filter((r) => r.status === 'Pending').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-gray-900 dark:text-gray-100 antialiased transition-colors">
      <ToastProvider>
        {!isAuthenticated && (
          <LoginModal
            onLoginSuccess={handleLoginSuccess}
            onLoginFailed={handleLoginFailed}
          />
        )}

        {isAuthenticated && (
          <Header
            onLogout={handleLogout}
            onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            isIconOnly={isIconOnly}
            onToggleIconOnly={() => setIsIconOnly(!isIconOnly)}
            isDarkMode={isDarkMode}
            currentPropertyColorScheme={currentPropertyColorScheme}
            onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            isTestingMode={isTestingMode}
            propertyName={propertyName}
            onToggleTestingMode={handleToggleTestingMode}
          />
        )}

        {isAuthenticated && isTestingMode && (
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

        {isAuthenticated && (
          <Navigation
            activeTab={activeTab}
            setActiveTab={(tab) => handleNavigateTab(tab)}
            activeMenuItemKey={activeMenuItemKey}
            setActiveMenuItemKey={setActiveMenuItemKey}
            guests={guests}
            isSidebarOpen={isSidebarOpen}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
            isIconOnly={isIconOnly}
            onToggleIconOnly={() => setIsIconOnly(!isIconOnly)}
            navItems={visibleNavItems}
          />
        )}

        <TelegramNotificationModal
          isOpen={isTelegramModalOpen}
          onClose={() => setIsTelegramModalOpen(false)}
          telegramConfig={telegramConfig}
          onUpdateConfig={setTelegramConfig}
          dispatchLogs={telegramLogs}
          onSendTestNotification={handleSendTestNotification}
        />

        {/* Main Flowbite Dashboard Container */}
        {isAuthenticated && (
          <div className={`${isIconOnly ? 'pl-16' : 'md:pl-64 pl-0'} pt-16 flex-1 flex flex-col min-h-screen transition-all duration-200`}>
            <main className="flex-1 px-1 py-1 sm:px-6 sm:py-6 lg:px-8 lg:py-8 w-full space-y-2 sm:space-y-6">

              {activeTab === 'dashboard' && (
                <OperationalDashboard
                  guests={guests}
                  onNavigate={(tab) => handleNavigateTab(tab)}
                  onOpenCheckin={() => handleNavigateTab('guests', 'guest_registration')}
                  kitchenModuleEnabled={kitchenModuleEnabled}
                />
              )}

              {activeTab === 'guests' && (
                <GuestManagement
                  guests={guests}
                  receipts={receipts}
                  onAddGuest={handleAddGuest}
                  onCheckoutGuest={handleCheckoutGuest}
                  activeMenuItemKey={activeMenuItemKey}
                  onDispatchTelegram={dispatchTelegramAlert}
                  menu={menu}
                />
              )}

              {activeTab === 'kitchen' && (
                <KitchenManagement
                  guests={guests}
                  menu={menu}
                  onAddMenuItem={handleAddMenuItem}
                  onRequestMaterial={handleRequestMaterial}
                  onDispatchTelegram={dispatchTelegramAlert}
                  activeMenuItemKey={activeMenuItemKey}
                  isTestingMode={isTestingMode}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryManagement
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
                  onLogAudit={logAudit}
                  onDispatchTelegram={dispatchTelegramAlert}
                />
              )}

              {activeTab === 'petty_cash' && activeMenuItemKey !== 'edit_expense_items' && activeMenuItemKey !== 'cash_drawer' && activeMenuItemKey !== 'misc_charges' && (
                <PettyCashManagement
                  onDispatchTelegram={dispatchTelegramAlert}
                />
              )}

              {activeTab === 'staff' && (
                <StaffManagement
                  activeMenuItemKey={activeMenuItemKey}
                  auditLogs={auditLogs}
                  onLogAudit={logAudit}
                  onDispatchTelegram={dispatchTelegramAlert}
                />
              )}

              {activeTab === 'analytics' && (
                <AnalyticsDashboard
                  receipts={receipts}
                  guests={guests}
                  activeMenuItemKey={activeMenuItemKey}
                  kitchenModuleEnabled={kitchenModuleEnabled}
                />
              )}

              {activeTab === 'audit_logs' && (
                <AuditLogsView logs={auditLogs} receipts={receipts} activeMenuItemKey={activeMenuItemKey} />
              )}

              {activeTab === 'export' && (
                <DataExportCenter
                  guests={guests}
                  receipts={receipts}
                  menu={menu}
                  auditLogs={auditLogs}
                  kitchenModuleEnabled={kitchenModuleEnabled}
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
                  activeMenuItemKey={activeMenuItemKey}
                  kitchenModuleEnabled={kitchenModuleEnabled}
                />
              )}

              {activeTab === 'petty_cash' && activeMenuItemKey === 'misc_charges' && (
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
        )}

        {/* Unauthenticated: show login-only content */}
        {!isAuthenticated && (
          <div className="flex-1" />
        )}

        <GlobalModal />
      </ToastProvider>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <StaffProvider>
        <FinanceProvider>
          <InventoryProvider>
            <KitchenProvider>
              <AppBody />
            </KitchenProvider>
          </InventoryProvider>
        </FinanceProvider>
      </StaffProvider>
    </AuthProvider>
  );
}
