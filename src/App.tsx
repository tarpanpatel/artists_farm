import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OperationalDashboard } from './components/OperationalDashboard';
import { TodayOverview } from './components/TodayOverview';
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
import { ServiceRequestsManagement } from './components/ServiceRequestsManagement';
import { ICalSyncManager } from './components/ICalSyncManager';
import { TelegramNotificationModal } from './components/TelegramNotificationModal';
import { DemoDataModal } from './components/DemoDataModal';
import { GlobalModal } from './components/GlobalModal';
import { ToastProvider, useToast } from './components/ToastContext';
import { ConfirmDialogProvider, useConfirm } from './components/ConfirmDialogContext';
import { LoginModal } from './components/LoginModal';
import { StaffProvider, useStaff } from './contexts/StaffContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FinanceProvider, useFinance } from './contexts/FinanceContext';
import { InventoryProvider, useInventoryContext } from './contexts/InventoryContext';
import { KitchenProvider, useKitchenContext } from './contexts/KitchenContext';
import { recordTelescopeLog } from './utils/telescopeLogger';
import { detectClientInfo } from './utils/clientInfo';
import { trackDeadEnd, trackSessionLoss, trackAPIError, trackPropertyIssue } from './utils/userFlowTracker';
import { isKitchenModuleNavItem } from './data/appConfig';
import { fetchThemeSettings, applyThemeSettings, getDefaultTheme } from './services/themeService';
import { fetchMenuFromDB, addMenuItemDB, updateMenuItemDB, deleteMenuItemDB, fetchNavMenuFromDB, saveNavMenuDB, sendTelegramAlertDB, fetchGuestsFromDB, fetchAuditLogsFromDB, addAuditLogDB, saveReceiptToDB, addGuestToDB, updateGuestInDB, checkoutGuestInDB, deleteGuestFromDB, resolveTelegramTemplate, isTestingModeActive, setTestingModeState, resetTestDatabaseInDB, dedupMenuDB, fetchReceiptsFromDB, fetchPropertyModulesFromDB, fetchCurrentProperty, getPropertySlug } from './services/api';
import { ConfigurationDataProvider } from './contexts/ConfigurationDataContext';
import { ModulesProvider, useModules } from './contexts/ModulesContext';
import { DataLoader, PreloadedData } from './components/DataLoader';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage } from './components/LoginPage';
import { PlatformPropertyManagement } from './components/PlatformPropertyManagement';
import { TenantDashboard } from './components/TenantDashboard';
import { RootAdminDashboard } from './components/RootAdminDashboard';
import { MultiKeyPropertyOverview } from './components/MultiKeyPropertyOverview';
import { MultiKeyRoomDrawer } from './components/MultiKeyRoomDrawer';
import { RoomSelectorModal } from './components/RoomSelectorModal';
import { getPropertyAndRoomSlugs } from './services/api';



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

interface AppBodyProps {
  preloadedData: PreloadedData;
}

function AppBody({ preloadedData }: AppBodyProps) {
  const { isEnabled: isModuleEnabled } = useModules();
  const [showMultiKeyOverview, setShowMultiKeyOverview] = useState(
    preloadedData.isMultiKeyProperty && !preloadedData.currentRoomSlug
  );
  const [selectedRoomSlugOverride, setSelectedRoomSlugOverride] = useState<string | null>(null);
  const [selectedRoomForGuestRegistration, setSelectedRoomForGuestRegistration] = useState<string | null>(null);
  const selectedRoomSlugOverrideRef = useRef<string | null>(null);
  const multiKeyRoomsRef = useRef<any[]>([]);
  useEffect(() => {
    selectedRoomSlugOverrideRef.current = selectedRoomSlugOverride;
  }, [selectedRoomSlugOverride]);
  useEffect(() => {
    multiKeyRoomsRef.current = preloadedData.currentProperty?.rooms || [];
  }, [preloadedData.currentProperty?.rooms]);

  // Restore room view on page refresh if hash is a room slug
  useEffect(() => {
    if (typeof window !== 'undefined' && multiKeyRoomsRef.current.length > 0) {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash) {
        const isRoomSlug = multiKeyRoomsRef.current.some((r: any) => r.slug === hash);
        if (isRoomSlug && selectedRoomSlugOverride !== hash) {
          setActiveTab('dashboard');
          setActiveMenuItemKey(hash);
          setSelectedRoomSlugOverride(hash);
        }
      }
    }
  }, [multiKeyRoomsRef.current.length, selectedRoomSlugOverride]);

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
        cash_drawer: { tab: 'petty_cash', key: 'cash_drawer' },
        edit_expense_items: { tab: 'petty_cash', key: 'edit_expense_items' },
        misc_charges: { tab: 'petty_cash', key: 'misc_charges' },
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
        edit_main_menu: { tab: 'menu_manager', key: 'edit_main_menu' },
        admin_control_group: { tab: 'menu_manager', key: 'edit_main_menu' },
        edit_items_group: { tab: 'menu_manager', key: 'edit_main_menu' },
        menu_manager: { tab: 'menu_manager', key: 'edit_food_menu' },
        telegram: { tab: 'telegram', key: 'telegram' },
        data_export_center: { tab: 'export', key: 'data_export_center' },
        beta_recipe_builder: { tab: 'kitchen', key: 'beta_recipe_builder' },
        ical_sync_manager: { tab: 'ical_sync', key: 'ical_sync_manager' },
        ical_sync: { tab: 'ical_sync', key: 'ical_sync_manager' },
        service_requests: { tab: 'service_requests', key: 'service_requests' },
      };

      if (hash && routeMap[hash]) {
        return routeMap[hash];
      }

      // If hash is not in routeMap but exists, assume it's a room slug
      if (hash) {
        return { tab: 'dashboard', key: hash };
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
  const [propertyName, setPropertyName] = useState<string>(
    preloadedData.currentProperty?.name || getPropertySlug().charAt(0).toUpperCase() + getPropertySlug().slice(1).replace(/-/g, ' ') || 'Property'
  );
  const [currentPropertyColorScheme, setCurrentPropertyColorScheme] = useState<string>(
    preloadedData.currentProperty?.tailwind_color_scheme || 'blue'
  );
  const [isTestModeActive, setIsTestModeActive] = useState(false);

  // MultiKey room navigation handlers
  const { propertySlug: multiKeyPropertySlug, tenantSlug } = getPropertyAndRoomSlugs();

  const handleNavigateToMultiKeyOverview = () => {
    setSelectedRoomSlugOverride(null);
    setActiveMenuItemKey('multikey_property_overview');
  };

  const handleNavigateToRoom = (roomSlug: string) => {
    setActiveTab('dashboard');
    setActiveMenuItemKey(roomSlug);
    setSelectedRoomSlugOverride(roomSlug);
    // Update URL to include room slug so it persists on refresh
    window.location.hash = `#${roomSlug}`;
  };


  useEffect(() => {
    localStorage.setItem('artists_farm_active_tab', activeTab);
    localStorage.setItem('artists_farm_active_menu_key', activeMenuItemKey);
    // Only update hash for menu items, NOT for room slugs (which start with "room-" or other room patterns)
    if (typeof window !== 'undefined' && activeMenuItemKey) {
      const isRoomSlug = activeMenuItemKey.match(/^(room-|vr-|[a-z]+-\d+)/);
      if (!isRoomSlug) {
        const targetHash = `#${activeMenuItemKey}`;
        if (window.location.hash !== targetHash) {
          window.history.pushState({ tab: activeTab, key: activeMenuItemKey }, '', targetHash);
        }
      }
    }
  }, [activeTab, activeMenuItemKey]);

  // Preserve room hash when room is selected
  useEffect(() => {
    if (selectedRoomSlugOverride && typeof window !== 'undefined') {
      window.location.hash = `#${selectedRoomSlugOverride}`;
    }
  }, [selectedRoomSlugOverride]);

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


  // Load global system CSS on app startup from API
  useEffect(() => {
    const loadGlobalCSS = async () => {
      try {
        const response = await fetch(`/php/api/router.php?action=get_system_settings`, {
          credentials: 'include',
        });
        const data = await response.json();

        if (data.status === 'success' && data.data?.custom_css) {
          const savedCSS = data.data.custom_css;
          let el = document.getElementById('artists-farm-custom-css-override') as HTMLStyleElement | null;
          if (!el) {
            el = document.createElement('style');
            el.id = 'artists-farm-custom-css-override';
            document.head.appendChild(el);
          }
          el.textContent = savedCSS;
        }

        // Also load Lucide settings
        if (data.data?.lucide_settings) {
          try {
            const lucide = JSON.parse(data.data.lucide_settings);
            let el = document.getElementById('artists-farm-lucide-global') as HTMLStyleElement | null;
            if (!el) {
              el = document.createElement('style');
              el.id = 'artists-farm-lucide-global';
              document.head.appendChild(el);
            }
            el.textContent = `.lucide { width: ${lucide.size}px; height: ${lucide.size}px; stroke-width: ${lucide.strokeWidth}; color: ${lucide.color}; }`;
          } catch (e) {
            console.error('Failed to parse lucide settings:', e);
          }
        }
      } catch (err) {
        console.error('Failed to load global CSS settings:', err);
      }
    };

    loadGlobalCSS();
  }, []);

  // Load and apply theme settings on app startup
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const themeSettings = await fetchThemeSettings();
        applyThemeSettings(themeSettings);
      } catch (err) {
        console.error('Failed to load theme settings:', err);
      }
    };

    loadTheme();
  }, []);

  const handleNavigateTab = (tab: TabType, menuItemKey?: string, roomSlug?: string | null) => {
    // Save room slug for guest registration if provided
    if (menuItemKey === 'guest_registration' && roomSlug) {
      setSelectedRoomForGuestRegistration(roomSlug);
    } else if (menuItemKey !== 'guest_registration') {
      setSelectedRoomForGuestRegistration(null);
    }

    // When navigating to a menu tab, clear room selection
    if (selectedRoomSlugOverride) {
      setSelectedRoomSlugOverride(null);
    }
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
        ical_sync: 'ical_sync_manager',
        custom_css: 'custom_css',
        service_requests: 'service_requests',
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
  // NOTE: Bot token moved to backend .env file - DO NOT hardcode in frontend
  const TELEGRAM_BOT_TOKEN = null; // Backend will handle token securely

  const getTelegramChannelIds = () => {
    // NOTE: Group IDs now fetched from backend config
    // DO NOT hardcode group IDs in frontend source code - security risk!
    return {
      kitchen: null,
      admin: null,
      finance: null,
    };
  };

  const activeChannelIds = getTelegramChannelIds();

  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(
    preloadedData.telegramConfig || {
      botToken: '',
      chatId: '',
      botUsername: 'ArtistsFarmBot',
      enabledEvents: {
        kotOrders: false,
        guestCheckout: false,
        materialRequisitions: false,
        lowStockAlerts: false,
        pettyCashExpenses: false,
      },
    }
  );

  const [telegramLogs, setTelegramLogs] = useState<TelegramDispatchLog[]>([]);

  // Navigation Items State - initialized with preloaded data
  const [navItems, setNavItems] = useState<NavMenuItem[]>(
    preloadedData.navItems || []
  );

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
  // Bumped at the start of every guest/menu/audit-log/receipt hydration fetch
  // cycle (see the two effects below) so a slower, older in-flight request
  // can detect it's been superseded and skip applying its (possibly
  // wrong-property) result once it resolves.
  const hydrationTokenRef = useRef(0);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { refreshStaff, refreshAttendance } = useStaff();

  const handleResetTestDatabase = async () => {
    const confirmed = await confirm({
      title: "Reset Sandbox Database",
      message: "Are you sure you want to reset the Sandbox Database? This will overwrite all test data with a fresh snapshot from the live production database.",
      confirmText: "Reset Database",
      variant: "danger",
    });
    if (!confirmed) return;

    const res = await resetTestDatabaseInDB();
    if (res.success) {
      showToast("✔ Sandbox Database reset to live production snapshot successfully!", { type: 'success' });
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(`Failed to reset Sandbox Database: ${res.message || 'Unknown error'}`, { type: 'error' });
    }
  };
  const { refreshPettyCash, pettyCash, addPettyCash, updatePettyCash, deletePettyCash } = useFinance();
  const { refreshInventory, inventory, requisitions, lowStockCount, updateStock, addInventoryItem, updateInventoryItemImage, addRequisition } = useInventoryContext();
  const { orders, addOrder, updateOrderStatus } = useKitchenContext();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Sandbox / Testing Mode State & Handlers
  const [isTestingMode, setIsTestingMode] = useState<boolean>(isTestingModeActive());

  const handleToggleTestingMode = async () => {
    const nextState = !isTestingMode;

    if (nextState) {
      // Turning ON: Generate demo data
      await resetTestDatabaseInDB(preloadedData.currentProperty?.id);
    } else {
      // Turning OFF: Clear demo data
      try {
        await fetch('/php/api/demo_data.php', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Testing-Mode': '1'
          },
          body: JSON.stringify({
            action: 'clear',
            property_id: preloadedData.currentProperty?.id,
          }),
          credentials: 'include',
        });
        showToast("✔ Sandbox Test Mode exited successfully! Refreshing...", { type: 'success' });
      } catch (err) {
        console.error('Failed to clear demo data:', err);
      }
      
      setTestingModeState(nextState);
      setIsTestingMode(nextState);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
      return;
    }

    setTestingModeState(nextState);
    setIsTestingMode(nextState);
  };

  // Re-fetch ALL data when testing mode changes (live DB ↔ test DB). Shares
  // hydrationTokenRef with the property-hydration effect below so whichever
  // fetch cycle started last wins, regardless of which effect it belongs to.
  useEffect(() => {
    hydrationTokenRef.current += 1;
    const myToken = hydrationTokenRef.current;
    const isStale = () => hydrationTokenRef.current !== myToken;

    fetchGuestsFromDB().then((data) => {
      if (isStale()) return;
      if (data && data.length > 0) setGuests(data); else setGuests([]);
    });
    if (isModuleEnabled('kitchen')) {
      fetchMenuFromDB().then((data) => {
        if (isStale()) return;
        if (data && data.length > 0) setMenu(data); else setMenu([]);
      });
    }
    refreshStaff();
    refreshAttendance();
    fetchAuditLogsFromDB().then((data) => {
      if (isStale()) return;
      if (data && data.length > 0) setAuditLogs(data); else setAuditLogs([]);
    });
    fetchReceiptsFromDB().then((data) => {
      if (isStale()) return;
      if (data && data.length > 0) setReceipts(data); else setReceipts([]);
    });
  }, [isTestingMode, isModuleEnabled, preloadedData.currentProperty?.id]);



  // Hydrate nav menu from DB on startup
  useEffect(() => {
    if (!isTestingModeActive()) {
      fetch('/php/api/clean_all_demo.php', { method: 'POST', credentials: 'include' })
        .then(() => refreshStaff())
        .catch(() => refreshStaff());
    } else {
      refreshStaff();
    }
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

  // Nav items filtered by this property's module toggles. Used for rendering and
  // route guards; NavMenuEditor still edits the unfiltered `navItems` config.
  const kitchenEnabled = isModuleEnabled('kitchen');
  const visibleNavItems = useMemo(() => {
    if (kitchenEnabled) return navItems;
    return navItems.filter((item) => !isKitchenModuleNavItem(item));
  }, [navItems, kitchenEnabled]);

  // Hydrate guests, menu, orders, inventory, attendance, and audit logs from DB
  // whenever this property becomes active - re-running on property switch (not
  // just on mount) is what keeps a previous property's data from lingering in
  // state after navigating to a different one.
  //
  // This effect (and the testing-mode effect above) both fetch the same data,
  // and StrictMode's dev-only double-invoke means each can fire twice - so up
  // to 4 concurrent fetchGuestsFromDB() calls can be in flight at once. If an
  // older call (still in flight for a previous property) resolves after a
  // newer one, it would overwrite correct state with stale/wrong-property
  // data. The token below discards any resolution that isn't from the most
  // recently started fetch cycle.
  useEffect(() => {
    hydrationTokenRef.current += 1;
    const myToken = hydrationTokenRef.current;
    const isStale = () => hydrationTokenRef.current !== myToken;

    fetchGuestsFromDB().then((data) => {
      if (isStale()) return;
      setGuests(data && data.length > 0 ? data : []);
    });
    if (isModuleEnabled('kitchen')) {
      fetchMenuFromDB().then((data) => {
        if (data && data.length > 75) {
          dedupMenuDB().then(() => {
            fetchMenuFromDB().then((clean) => {
              if (isStale()) return;
              setMenu(clean && clean.length > 0 ? clean : []);
            });
          });
        } else {
          if (isStale()) return;
          setMenu(data && data.length > 0 ? data : []);
        }
      });
    }
    refreshAttendance();
    fetchAuditLogsFromDB().then((data) => {
      if (isStale()) return;
      setAuditLogs(data && data.length > 0 ? data : []);
    });
    fetchReceiptsFromDB().then((data) => {
      if (isStale()) return;
      setReceipts(data && data.length > 0 ? data : []);
    });
  }, [isModuleEnabled, preloadedData.currentProperty?.id]);

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
    // Case-insensitive role comparison
    const normalizedRole = role.toLowerCase().trim();
    // Root Admin and Super Admin have access to everything
    if (normalizedRole === 'root admin' || normalizedRole === 'super admin') return true;
    return item.roles.some(r => r.toLowerCase().trim() === normalizedRole);
  };

  // Guard Effect 1: Trigger whenever activeRole, activeMenuItemKey, or visibleNavItems update
  useEffect(() => {
    if (!isAuthenticated) return;
    if (visibleNavItems.length === 0) return;
    // Skip RBAC check if viewing a room or property overview
    if (selectedRoomSlugOverride || activeMenuItemKey === 'multikey_property_overview') return;

    const currentKey = activeMenuItemKey;
    const allowed = isRouteAllowed(currentKey, activeRole, visibleNavItems);
    if (!allowed) {
      // Find first permitted route for current user role (case-insensitive)
      const normalizedRole = activeRole.toLowerCase().trim();
      const firstPermitted = visibleNavItems.find((i) => i.isVisible && i.roles.some(r => r.toLowerCase().trim() === normalizedRole));
      const fallbackTab = firstPermitted ? (firstPermitted.tabKey as TabType) : 'dashboard';
      const fallbackKey = firstPermitted ? (firstPermitted.uniqueKey || firstPermitted.tabKey) : 'dashboard';

      setActiveTab(fallbackTab);
      setActiveMenuItemKey(fallbackKey);
      window.location.hash = `#${fallbackKey}`;
    }
  }, [activeRole, activeMenuItemKey, visibleNavItems, isAuthenticated, selectedRoomSlugOverride]);

  // Guard Effect 2: Trigger whenever user types a URL hash in the browser bar
  useEffect(() => {
    const handleUrlChange = () => {
      if (typeof window === 'undefined') return;
      if (!isAuthenticated) return;

      const hash = window.location.hash.replace('#', '').trim();
      if (!hash) return;

      // If hash is a menu item (not a room), clear room override
      const reserved = new Set([
        'dashboard', 'guests', 'kitchen', 'inventory', 'petty_cash', 'staff',
        'analytics', 'audit_logs', 'export', 'menu_manager', 'telegram', 'ical_sync',
        'guest_registration', 'billing_checkout', 'take_food_order', 'kitchen_orders', 'staff_meals',
        'stock_requests', 'fulfill_stock_req', 'deficit_shortfalls_log', 'stock_log',
        'kitchen_purchases', 'edit_kitchen_stock', 'cash_drawer', 'staff_payees_control',
        'attendance_salaries', 'attendance_calendar', 'staff_directory_salaries', 'staff_permissions',
        'dashboard_analytics', 'purchase_analytics', 'past_receipts_log', 'data_export_center',
        'edit_food_menu', 'beta_recipe_builder', 'ical_sync_manager', 'misc_charges', 'edit_items_group',
        'service_requests'
      ]);

      if (reserved.has(hash) && selectedRoomSlugOverrideRef.current) {
        setSelectedRoomSlugOverride(null);
      }

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
        ical_sync_manager: { tab: 'ical_sync', key: 'ical_sync_manager' },
        ical_sync: { tab: 'ical_sync', key: 'ical_sync_manager' },
        service_requests: { tab: 'service_requests', key: 'service_requests' },
      };

      // 404 or Invalid Route -> Try dynamic nav items from DB, then check if it's a room slug
      if (!routeMap[hash]) {
        const dynamicItem = visibleNavItems.find((n) => n.uniqueKey === hash || n.tabKey === hash);
        if (dynamicItem && dynamicItem.isVisible) {
          setActiveTab(dynamicItem.tabKey as any || 'dashboard');
          setActiveMenuItemKey(dynamicItem.uniqueKey || hash);
        } else {
          // Check if hash is a room slug from multi-key property
          const isRoomSlug = multiKeyRoomsRef.current?.some((r: any) => r.slug === hash);
          if (isRoomSlug) {
            // Restore room view
            setActiveTab('dashboard');
            setActiveMenuItemKey(hash);
            setSelectedRoomSlugOverride(hash);
          } else {
            // Not a valid route or room, fallback to dashboard
            setActiveTab('dashboard');
            setActiveMenuItemKey('dashboard');
            window.location.hash = '#dashboard';
          }
        }
        return;
      }

      const targetRoute = routeMap[hash];
      // Check RBAC permission for route target
      const allowed = isRouteAllowed(targetRoute.key, activeRole, visibleNavItems);
      if (allowed) {
        setActiveTab(targetRoute.tab);
        // Only update activeMenuItemKey if NOT viewing a room
        // If viewing a room, keep the room slug as the active menu item
        if (!selectedRoomSlugOverrideRef.current) {
          setActiveMenuItemKey(targetRoute.key);
        }
      } else {
        // Forbidden route attempt -> Redirect to homepage #dashboard
        setActiveTab('dashboard');
        // Only update activeMenuItemKey if NOT viewing a room
        if (!selectedRoomSlugOverrideRef.current) {
          setActiveMenuItemKey('dashboard');
        }
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

  const handleUpdateGuest = async (updatedGuest: Guest) => {
    const g = updatedGuest as any;
    const ok = await updateGuestInDB({
      id: updatedGuest.id,
      guest_name: updatedGuest.guestName,
      phone_number: updatedGuest.phoneNumber,
      checkin_date: updatedGuest.checkinDate,
      expected_checkout: updatedGuest.expectedCheckout,
      room_id: g.room_id ?? g.roomId ?? undefined,
      no_of_guests: g.no_of_guests ?? g.noOfGuests ?? updatedGuest.numberOfGuests ?? 1,
      base_room_rent: g.base_room_rent ?? g.baseRoomRent ?? updatedGuest.roomRate ?? 0,
      total_charge: g.total_charge ?? g.totalCharge ?? updatedGuest.totalAmount ?? 0,
      advance_paid: g.advance_paid ?? g.advancePaid ?? updatedGuest.advanceAmount ?? 0,
    });
    if (!ok) throw new Error('Failed to update booking');
    setGuests((prev) =>
      prev.map((g) => (g.id === updatedGuest.id ? { ...g, ...updatedGuest } : g))
    );
    logAudit(`Updated booking: ${updatedGuest.guestName} (${updatedGuest.roomNumber})`);
  };

  const handleDeleteGuest = async (guestId: string) => {
    const target = guests.find((g) => g.id === guestId);
    const ok = await deleteGuestFromDB(guestId);
    if (!ok) throw new Error('Failed to delete booking');
    setGuests((prev) => prev.filter((g) => g.id !== guestId));
    logAudit(`Deleted booking: ${target?.guestName || guestId} (${target?.roomNumber || 'unknown room'})`);
  };

  const handleGuestVerificationUpdated = (guestId: string) => {
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, idVerificationStatus: 'Complete' } : g))
    );
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
            onOpenDemoModal={() => {
              setIsDemoModalOpen(true);
              setIsTestModeActive(true);
            }}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            isIconOnly={isIconOnly}
            onToggleIconOnly={() => setIsIconOnly(!isIconOnly)}
            isDarkMode={isDarkMode}
            currentPropertyColorScheme={currentPropertyColorScheme}
            onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            propertyName={propertyName}
            isTestModeActive={isTestModeActive}
            isTestingMode={isTestingMode}
            onToggleTestingMode={handleToggleTestingMode}
            onCloseDemoModal={() => {
              setIsDemoModalOpen(false);
              setIsTestModeActive(false);
            }}
            kitchenModuleEnabled={kitchenEnabled}
            isMultiKeyProperty={preloadedData.isMultiKeyProperty}
            guests={guests}
            rooms={preloadedData.currentProperty?.rooms || []}
          />
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
            isMultiKeyProperty={preloadedData.isMultiKeyProperty}
            multiKeyPropertyId={preloadedData.currentProperty?.id}
            multiKeyPropertyName={preloadedData.currentProperty?.name}
            multiKeyPropertySlug={multiKeyPropertySlug}
            currentRoomSlug={selectedRoomSlugOverride || preloadedData.currentRoomSlug}
            onNavigateToMultiKeyOverview={handleNavigateToMultiKeyOverview}
            onNavigateToRoom={handleNavigateToRoom}
            multiKeyRooms={preloadedData.currentProperty?.rooms}
            kitchenModuleEnabled={(() => {
              const kitchenModule = preloadedData.modules?.find((m: any) => m.slug === 'kitchen');
              return kitchenModule?.is_enabled ?? true;
            })()}
          />
        )}

        <TelegramNotificationModal
          isOpen={isTelegramModalOpen}
          onClose={() => setIsTelegramModalOpen(false)}
          telegramConfig={telegramConfig}
          onUpdateConfig={setTelegramConfig}
          dispatchLogs={telegramLogs}
          onSendTestNotification={handleSendTestNotification}
          kitchenModuleEnabled={kitchenEnabled}
          templateCustomizationEnabled={!!preloadedData.currentProperty?.telegram_template_customization_enabled}
        />

        <DemoDataModal
          isOpen={isDemoModalOpen}
          onClose={() => setIsDemoModalOpen(false)}
          propertyId={preloadedData.currentProperty?.id}
        />

        {/* Main Flowbite Dashboard Container */}
        {isAuthenticated && (
          <div className={`${isIconOnly ? 'pl-16' : 'md:pl-64 pl-0'} pt-16 flex-1 flex flex-col min-h-screen transition-all duration-200`}>
            <main className="flex-1 px-1 py-1 sm:px-6 sm:py-6 lg:px-8 lg:py-8 w-full space-y-2 sm:space-y-6">

              {/* MultiKey room view - takes priority over everything */}
              {preloadedData.isMultiKeyProperty && selectedRoomSlugOverride ? (
                <ErrorBoundary section="Multi-Key Property Overview">
                  <MultiKeyPropertyOverview
                  propertyId={preloadedData.currentProperty?.id}
                  propertySlug={multiKeyPropertySlug}
                  selectedRoomSlug={selectedRoomSlugOverride}
                  onNavigateToRoom={handleNavigateToRoom}
                  onBackToOverview={handleNavigateToMultiKeyOverview}
                  activeTab={activeTab}
                  setActiveTab={handleNavigateTab}
                  guests={guests}
                  menu={menu}
                  receipts={receipts}
                  onAddGuest={handleAddGuest}
                  onCheckoutGuest={handleCheckoutGuest}
                  onAddMenuItem={handleAddMenuItem}
                  onUpdateStock={handleUpdateStock}
                  onAddInventoryItem={handleAddInventoryItem}
                  onUpdateItemImage={handleUpdateInventoryItemImage}
                  onDispatchTelegram={dispatchTelegramAlert}
                  activeMenuItemKey={activeMenuItemKey}
                  onSetActiveMenuItemKey={setActiveMenuItemKey}
                  isTestingMode={isTestingMode}
                  kitchenModuleEnabled={isModuleEnabled('kitchen')}
                  onUpdateBooking={handleUpdateGuest}
                  onDeleteBooking={handleDeleteGuest}
                  onGuestVerificationUpdated={handleGuestVerificationUpdated}
                  />
                </ErrorBoundary>
              ) : null}

              {/* Dashboard - Multi-Key Property Overview or Operational Dashboard */}
              {!selectedRoomSlugOverride && activeTab === 'dashboard' ? (
                preloadedData.isMultiKeyProperty ? (
                  <div className="space-y-6">
                    <ErrorBoundary section="Booking Calendar">
                      <TodayOverview
                        guests={guests}
                        rooms={preloadedData.currentProperty?.rooms}
                        isMultiKeyProperty={preloadedData.isMultiKeyProperty}
                        kitchenModuleEnabled={(() => {
                          const kitchenModule = preloadedData.modules?.find((m: any) => m.slug === 'kitchen');
                          return kitchenModule?.is_enabled ?? true;
                        })()}
                        onNavigateToRoom={handleNavigateToRoom}
                        onUpdateGuest={handleUpdateGuest}
                      />
                    </ErrorBoundary>
                    <ErrorBoundary section="Multi-Key Property Overview">
                      <MultiKeyPropertyOverview
                      propertyId={preloadedData.currentProperty?.id}
                      propertySlug={multiKeyPropertySlug}
                      selectedRoomSlug={null}
                      onNavigateToRoom={handleNavigateToRoom}
                      onBackToOverview={handleNavigateToMultiKeyOverview}
                      activeTab={activeTab}
                      setActiveTab={handleNavigateTab}
                      guests={guests}
                      menu={menu}
                      receipts={receipts}
                      onAddGuest={handleAddGuest}
                      onCheckoutGuest={handleCheckoutGuest}
                      onAddMenuItem={handleAddMenuItem}
                      onUpdateStock={handleUpdateStock}
                      onAddInventoryItem={handleAddInventoryItem}
                      onUpdateItemImage={handleUpdateInventoryItemImage}
                      onDispatchTelegram={dispatchTelegramAlert}
                      activeMenuItemKey={activeMenuItemKey}
                      onSetActiveMenuItemKey={setActiveMenuItemKey}
                      isTestingMode={isTestingMode}
                      kitchenModuleEnabled={isModuleEnabled('kitchen')}
                      hideHeader={true}
                      onUpdateBooking={handleUpdateGuest}
                      onDeleteBooking={handleDeleteGuest}
                      onGuestVerificationUpdated={handleGuestVerificationUpdated}
                      />
                    </ErrorBoundary>
                  </div>
                ) : (
                  <ErrorBoundary section="Operational Dashboard">
                    <OperationalDashboard
                      guests={guests}
                      onNavigate={(tab) => handleNavigateTab(tab)}
                      onOpenCheckin={() => handleNavigateTab('guests', 'guest_registration')}
                      kitchenModuleEnabled={isModuleEnabled('kitchen')}
                      onUpdateBooking={handleUpdateGuest}
                      onDeleteBooking={handleDeleteGuest}
                      onGuestVerificationUpdated={handleGuestVerificationUpdated}
                    />
                  </ErrorBoundary>
                )
              ) : null}

              {!selectedRoomSlugOverride && activeTab === 'guests' && (
                <ErrorBoundary section="Guest Management">
                  <GuestManagement
                    guests={guests}
                    receipts={receipts}
                    onAddGuest={handleAddGuest}
                    onCheckoutGuest={handleCheckoutGuest}
                    onUpdateGuest={handleUpdateGuest}
                    activeMenuItemKey={activeMenuItemKey}
                    onDispatchTelegram={dispatchTelegramAlert}
                    menu={menu}
                    isMultiKeyProperty={preloadedData.isMultiKeyProperty}
                    rooms={preloadedData.currentProperty?.rooms}
                    onSetActiveMenuItemKey={setActiveMenuItemKey}
                    selectedRoomSlug={preloadedData.currentRoomSlug || selectedRoomForGuestRegistration}
                    kitchenModuleEnabled={isModuleEnabled('kitchen')}
                    propertyGstin={preloadedData.currentProperty?.gstin || ''}
                    propertyName={preloadedData.currentProperty?.name || ''}
                    onNavigateToBilling={(guestId) => {
                      // Navigate to billing view for guest
                    }}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'kitchen' && (
                <ErrorBoundary section="Kitchen Management">
                  <KitchenManagement
                    guests={guests}
                    menu={menu}
                    onAddMenuItem={handleAddMenuItem}
                    onRequestMaterial={handleRequestMaterial}
                    onDispatchTelegram={dispatchTelegramAlert}
                    activeMenuItemKey={activeMenuItemKey}
                    isTestingMode={isTestingMode}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'inventory' && (
                <ErrorBoundary section="Inventory Management">
                  <InventoryManagement
                    onUpdateStock={handleUpdateStock}
                    onAddInventoryItem={handleAddInventoryItem}
                    onUpdateItemImage={handleUpdateInventoryItemImage}
                    activeMenuItemKey={activeMenuItemKey}
                    onDispatchTelegram={dispatchTelegramAlert}
                    onLogAudit={logAudit}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'petty_cash' && activeMenuItemKey === 'edit_expense_items' && (
                <ErrorBoundary section="Expense Items Management">
                  <ExpenseItemsManagement />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'petty_cash' && activeMenuItemKey === 'cash_drawer' && (
                <ErrorBoundary section="Cash Drawer Manager">
                  <CashDrawerManager
                    onLogAudit={logAudit}
                    onDispatchTelegram={dispatchTelegramAlert}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'petty_cash' && activeMenuItemKey !== 'edit_expense_items' && activeMenuItemKey !== 'cash_drawer' && activeMenuItemKey !== 'misc_charges' && (
                <ErrorBoundary section="Petty Cash Management">
                  <PettyCashManagement
                    onDispatchTelegram={dispatchTelegramAlert}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'staff' && (
                <ErrorBoundary section="Staff Management">
                  <StaffManagement
                    activeMenuItemKey={activeMenuItemKey}
                    auditLogs={auditLogs}
                    onLogAudit={logAudit}
                    onDispatchTelegram={dispatchTelegramAlert}
                    tenantId={preloadedData.currentProperty?.tenant_id}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'analytics' && (
                <ErrorBoundary section="Analytics Dashboard">
                  <AnalyticsDashboard
                    receipts={receipts}
                    guests={guests}
                    activeMenuItemKey={activeMenuItemKey}
                    kitchenModuleEnabled={isModuleEnabled('kitchen')}
                    isMultiKeyProperty={preloadedData.isMultiKeyProperty}
                    rooms={preloadedData.currentProperty?.rooms}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'audit_logs' && (
                <ErrorBoundary section="Audit Logs">
                  <AuditLogsView logs={auditLogs} receipts={receipts} activeMenuItemKey={activeMenuItemKey} />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'export' && (
                <ErrorBoundary section="Data Export">
                  <DataExportCenter
                    guests={guests}
                    receipts={receipts}
                    menu={menu}
                    auditLogs={auditLogs}
                    kitchenModuleEnabled={isModuleEnabled('kitchen')}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'service_requests' && (
                <ErrorBoundary section="Service Requests">
                  <ServiceRequestsManagement
                    rooms={preloadedData.currentProperty?.rooms || []}
                    isMultiKeyProperty={preloadedData.isMultiKeyProperty}
                    onDispatchTelegram={dispatchTelegramAlert}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'menu_manager' && (
                <ErrorBoundary section="Menu Manager">
                  <MenuManager
                    foodMenu={menu}
                    onAddFoodItem={handleAddMenuItem}
                    onUpdateFoodItem={handleUpdateMenuItem}
                    onDeleteFoodItem={handleDeleteMenuItem}
                    navItems={navItems}
                    onUpdateNavItems={handleUpdateNavItems}
                    activeMenuItemKey={activeMenuItemKey}
                    kitchenModuleEnabled={isModuleEnabled('kitchen')}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'petty_cash' && activeMenuItemKey === 'misc_charges' && (
                <ErrorBoundary section="Misc Charges Management">
                  <MiscChargesManagement onLogAudit={logAudit} />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'telegram' && (
                <TelegramNotificationModal
                  isOpen={true}
                  onClose={() => setIsTelegramModalOpen(false)}
                  telegramConfig={telegramConfig}
                  onUpdateConfig={setTelegramConfig}
                  dispatchLogs={telegramLogs}
                  onSendTestNotification={handleSendTestNotification}
                  isEmbedded={true}
                  onLogAudit={logAudit}
                  kitchenModuleEnabled={kitchenEnabled}
                  templateCustomizationEnabled={!!preloadedData.currentProperty?.telegram_template_customization_enabled}
                />
              )}

              {!selectedRoomSlugOverride && activeTab === 'ical_sync' && (
                <ErrorBoundary section="iCal Sync Manager">
                  <ICalSyncManager propertyId={preloadedData.currentProperty?.id} />
                </ErrorBoundary>
              )}
            </main>
          </div>
        )}

        {/* Unauthenticated: show login-only content */}
        {!isAuthenticated && (
          <div className="flex-1" />
        )}

        <GlobalModal />
    </div>
  );
}

function AppWithProviders({ preloadedData }: { preloadedData: PreloadedData }) {
  return (
    <ModulesProvider initialData={preloadedData.modules}>
      <StaffProvider>
        <FinanceProvider>
          <InventoryProvider>
            <KitchenProvider>
              <ConfigurationDataProvider>
                <ToastProvider>
                  <ConfirmDialogProvider>
                    <AppBodyWithData preloadedData={preloadedData} />
                  </ConfirmDialogProvider>
                </ToastProvider>
              </ConfigurationDataProvider>
            </KitchenProvider>
          </InventoryProvider>
        </FinanceProvider>
      </StaffProvider>
    </ModulesProvider>
  );
}

function AppBodyWithData({ preloadedData }: { preloadedData: PreloadedData }) {
  // Wrap AppBody to accept and use preloaded data
  // This prevents fetching data in useEffect
  return <AppBody preloadedData={preloadedData} />;
}

export function App() {
  // Apply default theme immediately to prevent white button flash on load
  React.useMemo(() => {
    applyThemeSettings(getDefaultTheme());
  }, []);

  const [userSession, setUserSession] = useState<{
    username: string;
    role: string;
    is_platform_admin: boolean;
    default_tenant_id?: number;
  } | null>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);

  const propertySlug = getPropertySlug();
  const isLoginPath = propertySlug === 'login';
  const isTenantDashboardPath = propertySlug === 'tenant_dashboard';
  const isPlatformPropertyManagementPath = propertySlug === 'platform_property_management';
  const isRootDashboardPath = propertySlug === 'root_dashboard';
  const isRootPath = propertySlug === 'default' || !propertySlug;

  const [resolvedTenant, setResolvedTenant] = useState<any | null>(null);
  const [isCheckingTenant, setIsCheckingTenant] = useState(
    !isRootPath && !isLoginPath && !isTenantDashboardPath && !isPlatformPropertyManagementPath && !isRootDashboardPath
  );

  // Check if current slug is actually a tenant dashboard
  useEffect(() => {
    if (isCheckingTenant) {
      fetch(`/php/api/router.php?action=get_tenant_by_slug&slug=${propertySlug}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setResolvedTenant(data.data);
          }
        })
        .catch(err => console.error("Error checking tenant slug:", err))
        .finally(() => setIsCheckingTenant(false));
    }
  }, [isCheckingTenant, propertySlug]);

  // Check for existing session on mount
  useEffect(() => {
    const stored = localStorage.getItem('artists_farm_user_session');
    if (stored) {
      try {
        setUserSession(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to restore session:', e);
        localStorage.removeItem('artists_farm_user_session');
      }
    }
    setIsSessionLoaded(true);
  }, []);

  const handleLoginSuccess = (session: {
    username: string;
    role: string;
    is_platform_admin: boolean;
    default_tenant_id?: number;
  }) => {
    setUserSession(session);

    // Redirect based on role
    if (session.is_platform_admin) {
      window.location.href = '/artists_farm/root_dashboard/';
    } else if (session.default_tenant_id) {
      // If we are already on a valid tenant dashboard, just reload the page to refresh state
      if (resolvedTenant) {
        window.location.reload();
      } else {
        window.location.href = '/artists_farm/tenant_dashboard/';
      }
    }
  };

  if (isCheckingTenant) {
    return <LoadingScreen message="Resolving route..." />;
  }

  // Tenant dashboard path (either explicitly /tenant_dashboard/ OR via tenant slug like /vrikshawan/)
  if (isTenantDashboardPath || resolvedTenant) {
    // Wait for session to load before checking
    if (!isSessionLoaded) {
      return <LoadingScreen message="Loading session..." />;
    }

    if (!userSession) {
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;
    }

    // Determine which tenant ID to show: the one from the URL (resolvedTenant) or the user's default
    const dashboardTenantId = resolvedTenant ? resolvedTenant.id : userSession.default_tenant_id;

    // Security: Only root admin can view other tenants' dashboards
    if (!userSession.is_platform_admin && dashboardTenantId !== userSession.default_tenant_id) {
      return (
        <div className="min-h-screen bg-red-50 dark:bg-red-950 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-800 dark:text-red-300 font-medium">Access Denied: You do not have permission to view this tenant.</p>
            <button onClick={() => { setUserSession(null); localStorage.removeItem('artists_farm_user_session'); }} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg">Logout</button>
          </div>
        </div>
      );
    }

    return (
      <TenantDashboard
        username={userSession.username}
        tenantId={dashboardTenantId}
        tenantInfo={resolvedTenant}
        onLogout={() => {
          setUserSession(null);
          localStorage.removeItem('artists_farm_user_session');
        }}
      />
    );
  }

  // Root admin dashboard path
  if (isRootDashboardPath) {
    // Wait for session to load before checking
    if (!isSessionLoaded) {
      return <LoadingScreen message="Loading session..." />;
    }

    if (!userSession || !userSession.is_platform_admin) {
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;
    }

    return (
      <ConfirmDialogProvider>
        <RootAdminDashboard
          username={userSession.username}
          onLogout={() => {
            setUserSession(null);
            localStorage.removeItem('artists_farm_user_session');
          }}
          activeRole="Root Admin"
        />
      </ConfirmDialogProvider>
    );
  }

  // Platform property management path
  if (isPlatformPropertyManagementPath) {
    // Wait for session to load before checking
    if (!isSessionLoaded) {
      return <LoadingScreen message="Loading session..." />;
    }

    if (!userSession || !userSession.is_platform_admin) {
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;
    }

    return (
      <PlatformPropertyManagement
        username={userSession.username}
        onLogout={() => {
          setUserSession(null);
          localStorage.removeItem('artists_farm_user_session');
        }}
      />
    );
  }

  // Login path - show unified login for all users
  if (isLoginPath) {
    // Wait for session to load first
    if (!isSessionLoaded) {
      return <LoadingScreen message="Loading..." />;
    }

    // Redirect to appropriate dashboard if already logged in
    if (userSession) {
      if (userSession.is_platform_admin) {
        // Redirect root admin to root dashboard
        window.location.href = '/artists_farm/root_dashboard/';
        return <LoadingScreen message="Redirecting to root admin dashboard..." />;
      } else if (userSession.default_tenant_id) {
        return (
          <TenantDashboard
            username={userSession.username}
            tenantId={userSession.default_tenant_id}
            onLogout={() => {
              setUserSession(null);
              localStorage.removeItem('artists_farm_user_session');
            }}
          />
        );
      }
    }
    // Show login form if not logged in
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Root path - show login or platform management
  if (isRootPath) {
    if (!userSession) {
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;
    }

    // User is logged in at root
    if (userSession.is_platform_admin) {
      return (
        <PlatformPropertyManagement
          username={userSession.username}
          onLogout={() => setUserSession(null)}
        />
      );
    }

    // Tenant manager - render dashboard directly
    if (userSession.default_tenant_id) {
      return (
        <TenantDashboard
          username={userSession.username}
          tenantId={userSession.default_tenant_id}
          onLogout={() => {
            setUserSession(null);
            localStorage.removeItem('artists_farm_user_session');
          }}
        />
      );
    }

    // No access
    return (
      <div className="min-h-screen bg-red-50 dark:bg-red-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-800 dark:text-red-300 font-medium">Access Denied</p>
          <button
            onClick={() => setUserSession(null)}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  // Property path - show staff login (existing flow)
  return (
    <AuthProvider>
      <DataLoader>
        {(data) => <AppWithProviders preloadedData={data} />}
      </DataLoader>
    </AuthProvider>
  );
}
