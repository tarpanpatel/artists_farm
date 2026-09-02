import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems } from 'flowbite-react';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OperationalDashboard } from './components/OperationalDashboard';
import { PropertySetupWizard } from './components/PropertySetupWizard';
import { TodayOverview } from './components/TodayOverview';
import { GuestManagement } from './components/GuestManagement';
import { GlobalModal } from './components/GlobalModal';
import { ToastProvider, useToast } from './components/ToastContext';
import { ConfirmDialogProvider } from './components/ConfirmDialogContext';
import { StaffPropertyPicker } from './components/StaffPropertyPicker';
import { StaffProvider, useStaff } from './contexts/StaffContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FinanceProvider } from './contexts/FinanceContext';
import { InventoryProvider, useInventoryContext } from './contexts/InventoryContext';
import { KitchenProvider } from './contexts/KitchenContext';
import { ServiceRequestProvider } from './contexts/ServiceRequestContext';
import { recordTelescopeLog } from './utils/telescopeLogger';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { formatDateDDMMYYYY } from './utils/dateUtils';
import { detectClientInfo } from './utils/clientInfo';
import { normalizeNavItems } from './utils/navItems';
import { isKitchenModuleNavItem } from './data/appConfig';
import { fetchThemeSettings, applyThemeSettings, getDefaultTheme } from './services/themeService';
import { fetchMenuFromDB, addMenuItemDB, updateMenuItemDB, deleteMenuItemDB, fetchNavMenuFromDB, sendTelegramAlertDB, fetchGuestsFromDB, fetchAuditLogsFromDB, addAuditLogDB, saveReceiptToDB, addGuestToDB, updateGuestInDB, checkoutGuestInDB, deleteGuestFromDB, resolveTelegramTemplate, dedupMenuDB, fetchReceiptsFromDB, getPropertySlug, fetchServiceRequestsFromDB, ServiceRequest, createServiceRequestInDB, apiFetch } from './services/api';
import { ConfigurationDataProvider } from './contexts/ConfigurationDataContext';
import { ModulesProvider, useModules } from './contexts/ModulesContext';
import { DataLoader, PreloadedData } from './components/DataLoader';
import { Smartphone, Download, X as CloseIcon, Share, PlusSquare, MoreVertical, Receipt } from './components/icons/FlowbiteIcons';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage } from './components/LoginPage';
import { MultiKeyPropertyOverview } from './components/MultiKeyPropertyOverview';
import { AIChatWidget } from './components/AIChatWidget';
// Lazy-loaded (28 Aug 2026, explicit request: "make sure driver.js only loads on demo property")
// via the same lazyWithRetry() pattern every tab component below already uses - this keeps
// driver.js (and its CSS) out of the main bundle entirely for the common case (a real tenant's
// property, where the render below never mounts it), fetched only the moment a public-demo
// property actually renders it.
import { SelfOnboardingWizard } from './components/SelfOnboardingWizard';
import { getPropertyAndRoomSlugs } from './services/api';

// Code-split: everything below is either a secondary/admin tab that most
// sessions never open (Kitchen management, Inventory, Analytics, Admin
// Control, etc.) or a rarely-visited top-level admin route (Tenant/Root
// dashboards, Platform property management). Keeping these out of the main
// bundle is what lets the initial paint (login + default dashboard tab) ship
// a much smaller slice of JS - see TabContentFallback/Suspense usage below.
// DemoOnboardingTour pulls in driver.js + its CSS (28 Aug 2026, explicit request: "make sure
// driver.js only loads on demo property") - lazy-loading it keeps that weight out of the main
// bundle for every real tenant, since the render site below only ever mounts it when
// `currentProperty.is_public_demo` is true.
const DemoOnboardingTour = lazyWithRetry(() => import('./components/DemoOnboardingTour').then(m => ({ default: m.DemoOnboardingTour })), 'DemoOnboardingTour');
const KitchenManagement = lazyWithRetry(() => import('./components/KitchenManagement').then(m => ({ default: m.KitchenManagement })), 'KitchenManagement');
const InventoryManagement = lazyWithRetry(() => import('./components/InventoryManagement').then(m => ({ default: m.InventoryManagement })), 'InventoryManagement');
const PettyCashManagement = lazyWithRetry(() => import('./components/PettyCashManagement').then(m => ({ default: m.PettyCashManagement })), 'PettyCashManagement');
const CashDrawerManager = lazyWithRetry(() => import('./components/CashDrawerManager').then(m => ({ default: m.CashDrawerManager })), 'CashDrawerManager');
const ExpenseItemsManagement = lazyWithRetry(() => import('./components/ExpenseItemsManagement').then(m => ({ default: m.ExpenseItemsManagement })), 'ExpenseItemsManagement');
const StaffManagement = lazyWithRetry(() => import('./components/StaffManagement').then(m => ({ default: m.StaffManagement })), 'StaffManagement');
const TeamOverviewDashboard = lazyWithRetry(() => import('./components/TeamOverviewDashboard').then(m => ({ default: m.TeamOverviewDashboard })), 'TeamOverviewDashboard');
const AdminControlOverviewDashboard = lazyWithRetry(() => import('./components/AdminControlOverviewDashboard').then(m => ({ default: m.AdminControlOverviewDashboard })), 'AdminControlOverviewDashboard');
const AnalyticsDashboard = lazyWithRetry(() => import('./components/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })), 'AnalyticsDashboard');
const AuditLogsView = lazyWithRetry(() => import('./components/AuditLogsView').then(m => ({ default: m.AuditLogsView })), 'AuditLogsView');
const DataExportCenter = lazyWithRetry(() => import('./components/DataExportCenter').then(m => ({ default: m.DataExportCenter })), 'DataExportCenter');
const MenuManager = lazyWithRetry(() => import('./components/MenuManager').then(m => ({ default: m.MenuManager })), 'MenuManager');
const MiscChargesManagement = lazyWithRetry(() => import('./components/MiscChargesManagement').then(m => ({ default: m.MiscChargesManagement })), 'MiscChargesManagement');
const ServiceRequestsManagement = lazyWithRetry(() => import('./components/ServiceRequestsManagement').then(m => ({ default: m.ServiceRequestsManagement })), 'ServiceRequestsManagement');
const LicenseManagement = lazyWithRetry(() => import('./components/LicenseManagement').then(m => ({ default: m.LicenseManagement })), 'LicenseManagement');
const ChannelManager = lazyWithRetry(() => import('./components/ChannelManager').then(m => ({ default: m.ChannelManager })), 'ChannelManager');
const TelegramNotificationModal = lazyWithRetry(() => import('./components/TelegramNotificationModal').then(m => ({ default: m.TelegramNotificationModal })), 'TelegramNotificationModal');
const EditPropertyPage = lazyWithRetry(() => import('./components/EditPropertyPage').then(m => ({ default: m.EditPropertyPage })), 'EditPropertyPage');
const PlatformPropertyManagement = lazyWithRetry(() => import('./components/PlatformPropertyManagement').then(m => ({ default: m.PlatformPropertyManagement })), 'PlatformPropertyManagement');
const TenantDashboard = lazyWithRetry(() => import('./components/TenantDashboard').then(m => ({ default: m.TenantDashboard })), 'TenantDashboard');
const RootAdminDashboard = lazyWithRetry(() => import('./components/RootAdminDashboard').then(m => ({ default: m.RootAdminDashboard })), 'RootAdminDashboard');

// Small inline fallback for tab-content Suspense boundaries - deliberately
// NOT LoadingScreen (that's a fixed-inset-0 full-page overlay meant for app
// boot; using it here would blank out the still-loaded header/sidebar every
// time someone switches to a not-yet-downloaded tab).
// Same spinner identity as LoadingScreen.tsx/index.html's #initial-loader__spinner (28 Aug 2026,
// see CLAUDE.md's "One Loading Spinner Identity, App-Wide" rule) - smaller for this in-page
// context, but same border style/colors/spin speed, not a third distinct look.
const TabContentFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400 loading-screen-spinner-spin" />
  </div>
);



import {
  Guest,
  BillingReceipt,
  MenuItem,
  InventoryItem,
  Requisition,
  StaffMember,
  AuditLog,
  TelegramConfig,
  TelegramDispatchLog,
  NavMenuItem,
} from './types';

interface AppBodyProps {
  preloadedData: PreloadedData;
}

const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { id: 1, name: 'OTC Pizza', category: 'Pizza & Sandwich', price: 198, available: true, imagePath: '' },
  { id: 2, name: 'Paneer Pizza', category: 'Pizza & Sandwich', price: 298, available: true, imagePath: '' },
  { id: 3, name: 'Veg Cheese Burger', category: 'Pizza & Sandwich', price: 140, available: true, imagePath: '' },
  { id: 4, name: 'Paneer Tikka', category: 'Starters', price: 260, available: true, imagePath: '' },
  { id: 5, name: 'Hara Bhara Kebab', category: 'Starters', price: 220, available: true, imagePath: '' },
  { id: 6, name: 'Crispy Corn', category: 'Starters', price: 180, available: true, imagePath: '' },
  { id: 7, name: 'Paneer Butter Masala', category: 'Main Course', price: 280, available: true, imagePath: '' },
  { id: 8, name: 'Dal Tadka', category: 'Main Course', price: 210, available: true, imagePath: '' },
  { id: 9, name: 'Butter Naan', category: 'Rice & Roti', price: 45, available: true, imagePath: '' },
  { id: 10, name: 'Jeera Rice', category: 'Rice & Roti', price: 150, available: true, imagePath: '' },
  { id: 11, name: 'Masala Chai', category: 'Beverages', price: 40, available: true, imagePath: '' },
  { id: 12, name: 'Cold Coffee with Ice Cream', category: 'Beverages', price: 120, available: true, imagePath: '' },
  { id: 13, name: 'Fresh Lime Soda', category: 'Beverages', price: 80, available: true, imagePath: '' },
  { id: 14, name: 'Gulab Jamun (2 Pcs)', category: 'Desserts', price: 90, available: true, imagePath: '' },
];

function AppBody({ preloadedData }: AppBodyProps) {
  const { isEnabled: isModuleEnabled } = useModules();
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
      const rawHash = window.location.hash.replace('#', '').trim();
      const [hash, tabPart] = rawHash.split('/');
      if (hash) {
        const isRoomSlug = multiKeyRoomsRef.current.some((r: any) => r.slug === hash);
        if (isRoomSlug && selectedRoomSlugOverride !== hash) {
          const targetTab: TabType = (tabPart && ['dashboard', 'guests', 'edit_property'].includes(tabPart) ? tabPart as TabType : null)
            || (sessionStorage.getItem('artists_farm_active_tab') as TabType)
            || 'dashboard';
          setActiveTab(targetTab);
          setActiveMenuItemKey(hash);
          setSelectedRoomSlugOverride(hash);
        }
      }
    }
  }, [multiKeyRoomsRef.current.length, selectedRoomSlugOverride]);

  const getInitialActiveState = (): { tab: TabType; key: string } => {
    if (typeof window !== 'undefined') {
      const rawHash = window.location.hash.replace('#', '').trim();
      const hash = rawHash.split('?')[0].split('/')[0];
      const routeMap: Record<string, { tab: TabType; key: string }> = {
        dashboard: { tab: 'dashboard', key: 'dashboard' },
        guest_registration: { tab: 'guests', key: 'all_bookings' },
        // "Billing & Checkout" and "Add Booking" were merged into "Bookings" (all_bookings)
        all_bookings: { tab: 'guests', key: 'all_bookings' },
        // The nav item's uniqueKey is 'all_bookings', not 'bookings' - but the
        // page itself is titled "Bookings" (BillingCheckout.tsx's PageHeader),
        // so '#bookings' is what anyone typing/bookmarking from the visible
        // title would expect. Without this alias it fell through to the
        // unmatched-route fallback, which defaults to dashboard (found 20 Aug
        // 2026 - must stay in sync with the identical alias in the
        // handleUrlChange routeMap below).
        bookings: { tab: 'guests', key: 'all_bookings' },
        billing_checkout: { tab: 'guests', key: 'all_bookings' },
        guests: { tab: 'guests', key: 'all_bookings' },
        take_food_order: { tab: 'kitchen', key: 'take_food_order' },
        kitchen_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        live_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        live_kitchen_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        live_tickets: { tab: 'kitchen', key: 'kitchen_orders' },
        staff_meals: { tab: 'kitchen', key: 'staff_meals' },
        edit_food_menu: { tab: 'menu_manager', key: 'edit_food_menu' },
        menu_manager: { tab: 'menu_manager', key: 'edit_food_menu' },
        // kitchen_overview's own landing page (KitchenDashboard - a card of
        // shortcuts to Food Orders/Stock Requests/etc.) was removed
        // permanently (20 Aug 2026): purely redundant with the sidebar's own
        // Kitchen sub-items, so both the parent "Kitchen" sidebar click and
        // any old #kitchen_overview link now land directly on Take Food
        // Order instead.
        kitchen_overview: { tab: 'kitchen', key: 'take_food_order' },
        kitchen: { tab: 'kitchen', key: 'take_food_order' },
        stock_requests: { tab: 'inventory', key: 'stock_requests' },
        // fulfill_stock_req page removed - integrated into stock_requests
        fulfill_stock_req: { tab: 'inventory', key: 'stock_requests' },
        deficit_shortfalls_log: { tab: 'inventory', key: 'deficit_shortfalls_log' },
        stock_log: { tab: 'inventory', key: 'stock_log' },
        // Kitchen Purchases page removed - logging now happens on the
        // unified Expenses page instead, same redirect as the other
        // route map below.
        kitchen_purchases: { tab: 'petty_cash', key: 'expenses' },
        edit_kitchen_stock: { tab: 'inventory', key: 'edit_kitchen_stock' },
        inventory: { tab: 'inventory', key: 'stock_requests' },
        expenses: { tab: 'petty_cash', key: 'expenses' },
        petty_cash: { tab: 'petty_cash', key: 'expenses' },
        cash_drawer: { tab: 'petty_cash', key: 'finances' },
        finances: { tab: 'petty_cash', key: 'finances' },
        edit_expense_items: { tab: 'petty_cash', key: 'edit_expense_items' },
        misc_charges: { tab: 'petty_cash', key: 'misc_charges' },
        staff_payees_control: { tab: 'staff', key: 'staff_payees_control' },
        attendance_salaries: { tab: 'staff', key: 'attendance_salaries' },
        // Singular typo/variant of the real (plural) key above - without
        // this alias it fell through to the unmatched-route fallback, which
        // defaults to dashboard (found 21 Aug 2026, same class of bug as the
        // 'bookings' alias above - must stay in sync with the identical
        // alias in the handleUrlChange routeMap below).
        attendance_salary: { tab: 'staff', key: 'attendance_salaries' },
        attendance_calendar: { tab: 'staff', key: 'attendance_calendar' },
        staff_directory_salaries: { tab: 'staff', key: 'staff_directory_salaries' },
        staff_permissions: { tab: 'staff', key: 'staff_permissions' },
        // "Team" parent click now goes straight to Staff & Permissions
        // (Team & Access) instead of TeamOverviewDashboard's own landing
        // page - same pattern as Kitchen -> Take Food Order (21 Aug 2026).
        // TeamOverviewDashboard itself is left in place, just no longer
        // reachable through this specific click (not deleted - only asked
        // to reroute this one, unlike Kitchen's explicit "delete
        // permanently").
        team_overview: { tab: 'staff', key: 'staff_permissions' },
        team: { tab: 'staff', key: 'staff_permissions' },
        staff: { tab: 'staff', key: 'staff_permissions' },
        admin_control_overview: { tab: 'analytics', key: 'admin_control_overview' },
        dashboard_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        analytics: { tab: 'analytics', key: 'admin_control_overview' },
        purchase_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        past_receipts_log: { tab: 'audit_logs', key: 'past_receipts_log' },
        edit_main_menu: { tab: 'menu_manager', key: 'edit_main_menu' },
        admin_control_group: { tab: 'analytics', key: 'admin_control_overview' },
        // "Menu & Pricing" (AdminControlOverviewDashboard's edit_items_group
        // card) was routing into MenuManager's 'edit_main_menu' sub-tab -
        // the SIDEBAR STRUCTURE editor (NavMenuEditor) - instead of the food
        // items/pricing editor the card's own title/description promise.
        // 'edit_food_menu' is the key that actually selects MenuManager's
        // food_menu sub-tab (see the correct 'menu_manager' entry below and
        // MenuManager.tsx's activeSubTab effect) - found 20 Aug 2026.
        edit_items_group: { tab: 'menu_manager', key: 'edit_food_menu' },
        telegram: { tab: 'telegram', key: 'telegram' },
        data_export_center: { tab: 'export', key: 'data_export_center' },
        beta_recipe_builder: { tab: 'kitchen', key: 'beta_recipe_builder' },
        // Standalone "iCal Sync" page removed - calendar management moved onto
        // each room's own Edit Room page (MultiKeyPropertyOverview.tsx) and,
        // for single properties, onto Edit Property. Old bookmarks/links to
        // this hash land on Edit Property instead of a dead tab.
        ical_sync_manager: { tab: 'edit_property', key: 'edit_property' },
        ical_sync: { tab: 'edit_property', key: 'edit_property' },
        service_requests: { tab: 'service_requests', key: 'service_requests' },
        license_management: { tab: 'licenses', key: 'license_management' },
        channel_manager: { tab: 'channel_manager', key: 'channel_manager' },
      };

      const baseHash = hash.split('?')[0].split('/')[0].trim();

      if (baseHash && routeMap[baseHash]) {
        return routeMap[baseHash];
      }

      // A nav item renamed via NavMenuEditor gets a fresh urlSlug that won't be
      // in the static routeMap above - resolve those from the live nav item
      // list. uniqueKey (not urlSlug) is the actual routing key everything else
      // in the app keys off of; urlSlug is only what the browser bar shows.
      if (baseHash && preloadedData.navItems) {
        const matched = preloadedData.navItems.find((item) => item.urlSlug === baseHash || item.uniqueKey === baseHash);
        if (matched) {
          let key = matched.uniqueKey || matched.tabKey;
          let tab = routeMap[key]?.tab || (matched.tabKey as TabType) || 'dashboard';

          // Section header items (e.g. custom_nav-719248 or nav-header-*) map to section launchpads
          if (matched.itemType === 'header' || key.startsWith('custom_nav-') || key.startsWith('nav-header-')) {
            if (tab === 'staff') key = 'staff_permissions';
            else if (tab === 'analytics') key = 'admin_control_overview';
            else if (tab === 'kitchen') key = 'take_food_order';
          }

          return { tab, key };
        }
      }

      // If hash is not in routeMap but exists, assume it's a room slug (with optional /subtab)
      if (hash) {
        const [roomPart, tabPart] = hash.split('/');
        if (tabPart && routeMap[tabPart]) {
          return { tab: routeMap[tabPart].tab, key: roomPart };
        }
        const savedTab = (sessionStorage.getItem('artists_farm_active_tab') as TabType) || 'dashboard';
        return { tab: savedTab, key: roomPart || hash };
      }

      // sessionStorage, not localStorage - deliberately scoped to this one tab.
      // A refresh in the same tab should stay where you were; a genuinely new
      // tab/window opening the property fresh should land on Dashboard, not
      // whatever tab happened to be last active in some other tab sharing the
      // same origin (localStorage is shared across all of them).
      const savedTab = sessionStorage.getItem('artists_farm_active_tab') as TabType;
      const savedKey = sessionStorage.getItem('artists_farm_active_menu_key');
      if (savedTab && savedKey) {
        return { tab: savedTab, key: savedKey };
      }
    }
    return { tab: 'dashboard', key: 'dashboard' };
  };

  const initialActive = getInitialActiveState();
  const [activeTab, setActiveTab] = useState<TabType>(initialActive.tab);
  const [activeMenuItemKey, setActiveMenuItemKey] = useState<string>(initialActive.key);
  const [autoOpenAddStaffModal, setAutoOpenAddStaffModal] = useState<boolean>(false);
  // AI Assistant deep-link-prefill state (restored 27 Aug 2026 - see AI.md). Each holds
  // whatever a chat command extracted, fed to the matching management screen's own
  // initialXxx props; the screen pre-fills its form and opens it, but a human always still
  // clicks the real "Save"/"Log Request" button themselves - see AIChatWidget.tsx's callback wiring below.
  const [initialExpenseData, setInitialExpenseData] = useState<{ amount?: number; description?: string } | null>(null);
  const [initialStaffMealName, setInitialStaffMealName] = useState<string | null>(null);
  const [initialEditStaffName, setInitialEditStaffName] = useState<string | null>(null);
  const [initialReqData, setInitialReqData] = useState<{ itemName?: string; qty?: number; unit?: string } | null>(null);
  const [initialServiceRequestData, setInitialServiceRequestData] = useState<{ roomNumber?: string; item?: string } | null>(null);
  const [initialAddStaffData, setInitialAddStaffData] = useState<{ name?: string; phone?: string; role?: string; salary?: number } | null>(null);
  const [initialNewMenuItemData, setInitialNewMenuItemData] = useState<{ name?: string; price?: number; category?: string } | null>(null);
  const [propertyName] = useState<string>(
    preloadedData.currentProperty?.name || getPropertySlug().charAt(0).toUpperCase() + getPropertySlug().slice(1).replace(/-/g, ' ') || 'Property'
  );
  // Brand color is platform-wide, not per-property (18 Aug 2026) - properties
  // must never be able to look visually distinct from one another. This
  // intentionally ignores `currentProperty.tailwind_color_scheme` (a leftover
  // per-property field some existing DB rows still have a non-default value
  // in) so every property renders identically regardless of what's stored.
  const [currentPropertyColorScheme] = useState<string>('blue');

  // MultiKey room navigation handlers
  const { propertySlug: multiKeyPropertySlug } = getPropertyAndRoomSlugs();

  const handleNavigateToMultiKeyOverview = () => {
    setSelectedRoomSlugOverride(null);
    // Must land on the 'dashboard' tab - the rooms overview only renders under
    // `!selectedRoomSlugOverride && activeTab === 'dashboard'` (see render below).
    setActiveTab('dashboard');
    setActiveMenuItemKey('multikey_property_overview');
    // Clear the room slug out of the URL hash too. Without this, the "restore
    // room view on refresh" effect (keyed on selectedRoomSlugOverride) re-reads
    // the still-'#room-slug' hash the instant we null the override and snaps
    // straight back into the room - which is exactly why "Go Back" appeared to
    // do nothing from a room's Edit Room page (29 Aug 2026).
    if (typeof window !== 'undefined' && window.location.hash.replace('#', '').split('/')[0] !== 'dashboard') {
      window.location.hash = '#dashboard';
    }
  };

  const handleNavigateToRoom = (roomSlug: string, initialTab: TabType = 'dashboard') => {
    sessionStorage.setItem('artists_farm_active_tab', initialTab);
    sessionStorage.setItem('artists_farm_active_menu_key', roomSlug);
    setActiveTab(initialTab);
    setActiveMenuItemKey(roomSlug);
    setSelectedRoomSlugOverride(roomSlug);
    // Update URL to include room slug and target subtab so it persists on refresh
    window.location.hash = initialTab && initialTab !== 'dashboard' ? `#${roomSlug}/${initialTab}` : `#${roomSlug}`;
  };


  useEffect(() => {
    sessionStorage.setItem('artists_farm_active_tab', activeTab);
    sessionStorage.setItem('artists_farm_active_menu_key', activeMenuItemKey);
  }, [activeTab, activeMenuItemKey]);

  // Listen to browser Back/Forward navigation (hashchange & popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHashOrPopStateChange = () => {
      const activeState = getInitialActiveState();
      setActiveTab(activeState.tab);
      setActiveMenuItemKey(activeState.key);
    };

    window.addEventListener('hashchange', handleHashOrPopStateChange);
    window.addEventListener('popstate', handleHashOrPopStateChange);
    return () => {
      window.removeEventListener('hashchange', handleHashOrPopStateChange);
      window.removeEventListener('popstate', handleHashOrPopStateChange);
    };
  }, []);

  // Auto-scroll page & container to top whenever user hops between tabs, menu items, rooms, or properties
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const mainElements = document.querySelectorAll('main, [class*="overflow-auto"], [class*="overflow-y-auto"]');
    mainElements.forEach((el) => {
      el.scrollTop = 0;
    });
  }, [
    activeTab,
    activeMenuItemKey,
    selectedRoomSlugOverride,
    preloadedData.currentProperty?.id,
    preloadedData.currentProperty?.slug,
  ]);

  // The rest of what this effect used to do - writing activeMenuItemKey to the
  // address bar - lives further down, right after navItems is declared, since
  // it needs to look up the current item's urlSlug.

  // Preserve room hash when room is selected
  useEffect(() => {
    if (selectedRoomSlugOverride && typeof window !== 'undefined') {
      window.location.hash = `#${selectedRoomSlugOverride}`;
    }
  }, [selectedRoomSlugOverride]);

  // Global Input UX Enhancements (select-on-focus + decimal inputmode for numbers)
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const input = target as HTMLInputElement;
        if (['text', 'number', 'password', 'tel', 'email', 'search'].includes(input.type) || input.tagName === 'TEXTAREA') {
          input.select();
        }
        if (input.type === 'number' && input.getAttribute('inputmode') !== 'decimal') {
          input.setAttribute('inputmode', 'decimal');
        }
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);
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

        // A "load Lucide settings" block used to live here too - injected a
        // `.lucide { width/height/stroke-width/color }` global CSS rule from
        // a DB-stored lucide_settings field. Removed 25 Aug 2026 as dead code
        // in the site-wide lucide-react removal sweep: no icon anywhere in
        // the app carries a "lucide" class any more (Flowbite icons don't
        // use one), and nothing writes lucide_settings any more either - the
        // admin control that used to set it was already gone, so this had
        // been fetching a value and generating a CSS rule that could never
        // match any element in the DOM.
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

    // When navigating to a menu tab, clear room selection - EXCEPT
    // 'edit_property': clicked while viewing a specific room, "Edit Property"
    // should edit that room (name/check-in/check-out/tariff - it has its own
    // values for all of these), not kick you out to the parent property.
    if (menuItemKey !== 'edit_property' || !selectedRoomSlugOverrideRef.current) {
      setSelectedRoomSlugOverride(null);
      if (selectedRoomSlugOverrideRef) {
        selectedRoomSlugOverrideRef.current = null;
      }
    }
    setActiveTab(tab);
    const defaults: Record<TabType, string> = {
      dashboard: 'dashboard',
      guests: 'all_bookings',
      kitchen: 'kitchen_orders',
      inventory: 'stock_requests',
      petty_cash: 'expenses',
      staff: 'team_overview',
      analytics: 'admin_control_overview',
      audit_logs: 'past_receipts_log',
      export: 'data_export_center',
      menu_manager: 'edit_food_menu',
      telegram: 'telegram',
      misc_charges: 'misc_charges',
      custom_css: 'custom_css',
      service_requests: 'service_requests',
      edit_property: 'edit_property',
      licenses: 'license_management',
      channel_manager: 'channel_manager',
    };
    const targetKey = menuItemKey || defaults[tab] || tab;
    setActiveMenuItemKey(targetKey);
    if (typeof window !== 'undefined') {
      window.location.hash = `#${targetKey}`;
    }
  };

  const { currentUser, activeRole, isAuthenticated, authChecked, login, logout } = useAuth();

  // Reshapes the raw login_user API response into a StaffMember - moved here from the
  // old LoginModal.tsx when LoginPage/LoginModal merged into one component (15 Aug
  // 2026), since the two variants hand off a successful login completely differently
  // and that difference belongs with the caller, not the shared login form.
  const handleLoginSuccess = (rawUser: any) => {
    const staffMember: StaffMember = {
      id: String(rawUser.id),
      name: rawUser.name || rawUser.username,
      username: rawUser.username,
      role: rawUser.role || 'Staff',
      phone: rawUser.phone_number || rawUser.username || '',
      monthlySalary: 0,
      status: 'Active',
      canSwitchProperties: !!rawUser.can_switch_properties,
      tenantId: rawUser.tenant_id ?? null,
      tenantSlug: rawUser.tenant_slug ?? null,
    };
    login(staffMember);
    logAudit(`Staff User ${staffMember.name} logged into POS portal`, { status: 'Success', module: 'login', user: staffMember.name });
  };

  // Staff with access_all_properties (see php/security/access_control.php) don't
  // go straight into this property's dashboard on login - they need to pick
  // which property to enter first. Set by LoginPage's (variant="terminal")
  // onNeedsPropertySelection, cleared once StaffPropertyPicker navigates away (full
  // page load) or the staff logs out from the picker screen instead of picking anything.
  const [propertySelection, setPropertySelection] = useState<{ tenantId: number; tenantSlug: string; user: any } | null>(null);

  // Header.tsx's Switch Property icon (28 Aug 2026) - reuses StaffPropertyPicker as a
  // mid-session overlay rather than the login-flow rendering above, for an already-
  // authenticated owner/access_all_properties session (currentUser.canSwitchProperties).
  const [isSwitchingProperty, setIsSwitchingProperty] = useState(false);

  // Root Admin's "View site as Super Admin" preview (Header.tsx's Eye dropdown) must also
  // show the switcher, since a real Super Admin always can - Root Admin's own currentUser
  // has no canSwitchProperties/tenantId/tenantSlug of their own (Root Admin isn't scoped to
  // one tenant), so this falls back to whichever property Root Admin is CURRENTLY viewing -
  // exactly the tenant a real Super Admin of that property would be switching within.
  const isRootAdminPreviewingSuperAdmin =
    activeRole === 'Super Admin' &&
    (currentUser?.role || '').toLowerCase().replace(/_/g, ' ').trim() === 'root admin';
  const effectiveCanSwitchProperties = !!currentUser?.canSwitchProperties || isRootAdminPreviewingSuperAdmin;
  const effectiveSwitchTenantId = currentUser?.canSwitchProperties
    ? currentUser.tenantId
    : (preloadedData.currentProperty?.tenant_id ?? null);
  const effectiveSwitchTenantSlug = currentUser?.canSwitchProperties
    ? currentUser.tenantSlug
    : getPropertyAndRoomSlugs().tenantSlug;

  const handleLoginFailed = (username: string) => {
    logAudit(`Staff User ${username} failed login attempt`, { status: 'Failed', module: 'login', user: username });
  };

  const handleLogout = () => {
    logout();
    logAudit(`${currentUser?.name || activeRole} logged out`);
  };

  // Telegram Notifications State
  // NOTE: Bot token moved to backend .env file - DO NOT hardcode in frontend

  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
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

  // BUG (found 13 Aug 2026): the useState initializer above only reads
  // preloadedData.navItems ONCE, at mount. DataLoader has its own "self-
  // correcting" fix (see DataLoader.tsx's 13 Aug 2026 note) for exactly this
  // class of problem - a cold first-load-after-login request that misses its
  // 6s race window comes back empty at first, then gets silently patched in
  // once the real fetch actually resolves - but that patched-in value never
  // reached here, because this state had already latched onto the empty `[]`
  // at mount and nothing told it to look again. Symptom: sidebar shows only
  // the synthetic Kitchen fallback (see Navigation.tsx's buildTree) until a
  // full manual refresh, which reliably works only because it re-mounts
  // everything from scratch on an already-warm connection. This effect wires
  // DataLoader's later correction through - the exact recovery path guests/
  // receipts/menu already get via their own re-fetch effect below.
  useEffect(() => {
    if (preloadedData.navItems && preloadedData.navItems.length > 0) {
      setNavItems(preloadedData.navItems);
    }
    if (preloadedData.initialGuests && preloadedData.initialGuests.length > 0) {
      setGuests(preloadedData.initialGuests);
    }
    setGuestsLoading(!!preloadedData.guestsFetchPending);
  }, [preloadedData.navItems, preloadedData.initialGuests, preloadedData.guestsFetchPending]);

  // Handle Telegram deep link / URL parameters (booking_id / request_id / focusGuestId)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parseDeepLink = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const rawHash = window.location.hash.replace('#', '').trim();
      const hashParts = rawHash.split('?');
      const hashQuery = hashParts[1] ? new URLSearchParams(hashParts[1]) : null;

      const bookingId = urlParams.get('booking_id') || urlParams.get('guest_id') || hashQuery?.get('booking_id') || hashQuery?.get('guest_id');
      if (bookingId) {
        setFocusGuestId(bookingId);
        setActiveTab('guests');
        setActiveMenuItemKey('all_bookings');
      }

      const reqId = urlParams.get('request_id') || hashQuery?.get('request_id');
      if (reqId) {
        setActiveTab('service_requests');
        setActiveMenuItemKey('service_requests');
      }
    };

    parseDeepLink();
    window.addEventListener('hashchange', parseDeepLink);
    return () => window.removeEventListener('hashchange', parseDeepLink);
  }, []);

  // Re-validates the CURRENT page against the CURRENT role whenever either
  // changes, and bounces to Dashboard if it's no longer allowed - hiding a
  // nav link (Navigation.tsx's isVisible) only stops someone from clicking
  // their way TO a restricted page, it does nothing once they're already ON
  // one. Found 22 Aug 2026 via "View site as" (Header.tsx): switching role
  // while already sitting on a page that role shouldn't see (e.g. Take Food
  // Order) left the page rendered anyway, since nothing had ever re-checked
  // it. Reuses the exact same roles_json data + role-match logic Navigation
  // already applies to sidebar visibility, so this can't drift from it -
  // no separate hardcoded page/role list to keep in sync.
  useEffect(() => {
    if (navItems.length === 0) return;
    if (getPropertySlug() === 'root_dashboard') return;
    const normalizedRole = (activeRole || '').toLowerCase().trim();
    if (normalizedRole === 'super admin' || normalizedRole === 'root admin') return;
    const currentItem = navItems.find((i) => (i.uniqueKey || i.tabKey) === activeMenuItemKey);
    if (!currentItem || !currentItem.roles || currentItem.roles.length === 0) return;
    const isAllowed = currentItem.roles.some((r) => r.toLowerCase().trim() === normalizedRole);
    if (!isAllowed) {
      handleNavigateTab('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole, activeMenuItemKey, navItems]);

  // Keeps the address bar in sync with activeMenuItemKey - shows the item's
  // current urlSlug (regenerated on rename) rather than the stable routing
  // key itself, so a renamed nav item's URL actually reflects the rename
  // instead of snapping back to the old key on every render.
  useEffect(() => {
    if (typeof window === 'undefined' || !activeMenuItemKey) return;
    // RootAdminDashboard (propertySlug === 'root_dashboard') manages its own
    // hash entirely (#dashboard, #account_settings, etc. - see its own
    // activeSection hash-sync effect) and is rendered by this same App
    // component, so this effect still runs even while it's on screen. With
    // nothing here ever updating activeMenuItemKey on that path, it stays
    // frozen at whatever it was on initial load (e.g. '#tenants_properties')
    // - and once any of this effect's deps happen to change for any reason
    // (e.g. a late-resolving navItems fetch), it stomps the URL back to that
    // stale value, undoing whichever root-dashboard section was just clicked.
    // Bail out early instead of referencing the later-declared
    // isRootDashboardPath const (would be a TS "used before declaration"
    // error from inside this closure).
    if (getPropertySlug() === 'root_dashboard') return;
    // Only update hash for menu items, NOT for room slugs (which start with "room-" or other room patterns)
    const isRoomSlug = activeMenuItemKey.match(/^(room-|vr-|[a-z]+-\d+)/);
    if (isRoomSlug) return;
    const currentItem = navItems.find((i) => (i.uniqueKey || i.tabKey) === activeMenuItemKey);
    const targetHash = `#${currentItem?.urlSlug || activeMenuItemKey}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState({ tab: activeTab, key: activeMenuItemKey }, '', targetHash);
    }
  }, [activeTab, activeMenuItemKey, navItems]);

  // Dynamic body classes (WordPress body_class() equivalent)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const removePrefixes = ['page-', 'tab-', 'tenant-', 'property-'];
    const toRemove = Array.from(body.classList).filter(c => removePrefixes.some(p => c.startsWith(p)));
    body.classList.remove(...toRemove);

    const currentItem = navItems.find((i) => (i.uniqueKey || i.tabKey) === activeMenuItemKey);
    const rawSlug = currentItem?.urlSlug || activeMenuItemKey || 'unknown';
    const pageSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown';
    body.classList.add(`page-${pageSlug}`);
    body.classList.add(`tab-${activeTab}`);

    const { tenantSlug, propertySlug } = getPropertyAndRoomSlugs();
    if (tenantSlug) body.classList.add(`tenant-${tenantSlug}`);
    if (propertySlug) body.classList.add(`property-${propertySlug}`);
  }, [activeTab, activeMenuItemKey, navItems]);

  // Application Data States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isIconOnly, setIsIconOnly] = useState(false);
  const [isAddBookingModalOpen, setIsAddBookingModalOpen] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);

  const [guests, setGuests] = useState<Guest[]>(() => preloadedData.initialGuests || []);
  // Whether the initial guests fetch itself is still in flight (DataLoader's
  // background retry after a failed/timed-out first attempt) - NOT whether
  // `guests` is empty. A property with genuinely zero bookings must show its
  // real empty state immediately, not spin forever just because the array
  // happens to be empty (see GuestManagement's isLoading prop below).
  const [guestsLoading, setGuestsLoading] = useState<boolean>(() => !!preloadedData.guestsFetchPending);
  const [receipts, setReceipts] = useState<BillingReceipt[]>(() => preloadedData.initialReceipts || []);
  const [menu, setMenu] = useState<MenuItem[]>(() => preloadedData.initialMenu || []);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [focusGuestId, setFocusGuestId] = useState<string | null>(null);
  // Bumped at the start of every guest/menu/audit-log/receipt hydration fetch
  // cycle (see the effect below) so a slower, older in-flight request
  // can detect it's been superseded and skip applying its (possibly
  // wrong-property) result once it resolves.
  const hydrationTokenRef = useRef(0);
  // DataLoader.tsx already fetched fresh guests/receipts for this exact
  // property before this component ever mounted (see preloadedData.initialGuests/
  // initialReceipts seeding the state above) - re-fetching them again on that
  // same initial pass is pure duplicate network traffic, not a correctness
  // need. Captured once at mount; the property-hydration effect below nulls
  // it out after the first comparison so a REAL property switch later still
  // triggers a genuine re-fetch (DataLoader itself only ever loads once per
  // full page mount and has no idea a different property was switched to
  // client-side, so that case must still hit the network).
  const preloadedPropertyIdRef = useRef<number | undefined>(preloadedData.currentProperty?.id);
  const { showToast } = useToast();
  const { staff, refreshStaff, refreshAttendance } = useStaff();

  const { inventory, updateStock, addInventoryItem, updateInventoryItemImage, addRequisition } = useInventoryContext();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isSelfOnboardingOpen, setIsSelfOnboardingOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' && (window.location.search.includes('onboarding=true') || window.location.hash === '#onboarding');
  });

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  // iOS Safari never fires beforeinstallprompt - Apple's WebKit has never
  // implemented that API on any iOS browser, so the banner above can never
  // show there. The only way to install on iPhone is manual: Safari's Share
  // sheet -> "Add to Home Screen". Detect that case and show instructions
  // instead, so iPhone visitors get *something* prompting them rather than
  // silently never seeing an install option at all.
  const [showIOSInstallBanner, setShowIOSInstallBanner] = useState<boolean>(false);
  // Whether this page is already running as the installed app rather than a
  // regular browser tab - "standalone" is the actual spec term for it.
  // navigator.standalone is iOS Safari's own (non-standard, pre-media-query)
  // flag; matchMedia('(display-mode: standalone)') is what every other
  // installed-PWA-capable browser (Chrome/Edge/desktop, Android) sets. Also
  // listens for the media query flipping live - installing without a full
  // reload (e.g. via the header button below) should hide the button
  // immediately, not just on next page load.
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  // Persistent header icon needs to know "is this device even capable of an
  // install flow at all" independent of whether Chrome has fired
  // beforeinstallprompt yet (that only fires once certain PWA-installability
  // heuristics pass, and can lag behind page load) - iOS always qualifies
  // (manual Add to Home Screen instructions), everything else only once
  // deferredPrompt has actually been captured below.
  const [isIOSDevice, setIsIOSDevice] = useState<boolean>(false);
  // Safari's Share button lives in a different spot on iPhone (bottom
  // toolbar) vs iPad (top-right, next to the address bar) - the banner's
  // step 1 wording and pointer arrow below need to match whichever one is
  // actually true, or "tap Share" is just as vague as no instructions at
  // all. iPadOS 13+ deliberately reports a desktop Safari user agent by
  // default (Apple's "request desktop site by default" policy), so
  // /iPad/.test(userAgent) alone misses most real iPads - the reliable
  // signal is a Mac platform string that still has touch support, which no
  // actual Mac has.
  const [isIPadDevice, setIsIPadDevice] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    const handleAppInstalled = () => {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
      setIsAppInstalled(true);
      showToast("Ground Code App installed successfully on your device!", { type: 'success' });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const isIPad = /iPad/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIPadDevice(isIPad);
    // isIPad folded in here too: iPadOS 13+ reports as desktop Safari by
    // default, so the plain /iPad/ check below would otherwise miss it and
    // this whole manual-install flow would never show on most real iPads.
    const isIOS = (/iPhone|iPod/.test(navigator.userAgent) || isIPad) && !(window as any).MSStream;
    setIsIOSDevice(isIOS);

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const isStandaloneNow = () => (window.navigator as any).standalone === true || standaloneQuery.matches;
    const checkStandalone = () => setIsAppInstalled(isStandaloneNow());
    checkStandalone();
    standaloneQuery.addEventListener('change', checkStandalone);

    const dismissed = localStorage.getItem('ios_install_banner_dismissed') === '1';
    if (isIOS && !isStandaloneNow() && !dismissed) {
      setShowIOSInstallBanner(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneQuery.removeEventListener('change', checkStandalone);
    };
  }, [showToast]);

  const dismissIOSInstallBanner = () => {
    setShowIOSInstallBanner(false);
    localStorage.setItem('ios_install_banner_dismissed', '1');
  };

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  // Header "Install App" icon (12 Aug 2026): a persistent affordance next to
  // the notification bell, rather than only the one-shot dismissible
  // bottom-corner banners above - dismissing either banner shouldn't mean
  // losing any way to install later. Reuses the exact same install triggers:
  // the captured beforeinstallprompt event on Android/Desktop Chrome, or the
  // manual-instructions banner on iOS (re-shown regardless of any earlier
  // dismissal, since clicking this icon is explicit intent, not an
  // unsolicited popup).
  const canShowInstallIcon = !isAppInstalled && (!!deferredPrompt || isIOSDevice);
  const handleHeaderInstallClick = () => {
    if (deferredPrompt) {
      handleInstallApp();
    } else if (isIOSDevice) {
      setShowIOSInstallBanner(true);
    }
  };

  // A near-duplicate of this effect used to live here (guests/menu/staff/
  // attendance/audit-logs/receipts, same triggers) - a leftover from the
  // Sandbox/Testing Mode system removed site-wide 12 Aug 2026 (see CLAUDE.md)
  // that never got cleaned up with the rest of it. The property-hydration
  // effect below already does everything this one did, plus service
  // requests and menu-dedup handling, so it was deleted outright (28 Aug
  // 2026) rather than merged - its own comment already documented up to 4
  // concurrent fetchGuestsFromDB() calls firing per load/switch because of
  // this exact duplication. refreshStaff() (this effect's only call the
  // other one didn't already make) moved into that effect below.

  // PRODUCT_STRATEGY.md's 30-day trial playbook calls for a "Day 27: in-app
  // warning toast reminding the owner their trial ends in 3 days" - this is
  // the first thing that ever reads tenant_subscription_status/
  // tenant_subscription_expires_at (added to get_current_property 27 Aug
  // 2026 specifically for this). Manual/offline billing (owner pays via
  // UPI/NEFT, Root Admin updates the renewal date by hand) has no other way
  // to prompt the owner to pay before the trial actually lapses.
  // Session-guarded by day + tenant so it surfaces once per calendar day
  // rather than on every tab/navigation, but still reappears daily until
  // resolved (renewed, or the trial genuinely ends).
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    const status = (preloadedData.currentProperty as any)?.tenant_subscription_status;
    const expiresAt = (preloadedData.currentProperty as any)?.tenant_subscription_expires_at;
    if (status !== 'trial' || !expiresAt) return;

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.ceil((new Date(`${expiresAt}T00:00:00`).getTime() - Date.now()) / msPerDay);
    if (daysRemaining > 3) return; // Not in the reminder window yet.

    const guardKey = `trial_expiry_toast_shown_${preloadedData.currentProperty?.id}_${new Date().toISOString().split('T')[0]}`;
    try {
      if (sessionStorage.getItem(guardKey)) return;
      sessionStorage.setItem(guardKey, '1');
    } catch {
      // Storage unavailable (private browsing, etc.) - fall through and show
      // it anyway rather than silently never warning the owner.
    }

    if (daysRemaining >= 0) {
      showToast(
        daysRemaining === 0
          ? "Your free trial ends today. Renew now to keep using Ground Code without interruption."
          : `Your free trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Renew now to avoid any interruption.`,
        { type: 'warning', duration: 10000 }
      );
    } else {
      showToast(
        'Your free trial has ended. Please complete your subscription payment to continue using Ground Code.',
        { type: 'error', duration: 10000 }
      );
    }
  }, [isAuthenticated, authChecked, preloadedData.currentProperty?.id, (preloadedData.currentProperty as any)?.tenant_subscription_status, (preloadedData.currentProperty as any)?.tenant_subscription_expires_at]);



  // Hydrate nav menu from DB on startup.
  //
  // BUG (found 13 Aug 2026): fetchNavMenuFromDB() never rejects (it catches
  // internally and resolves []), so a single cold/slow/failed request just
  // silently no-ops here (the `data.length > 0` check skips setNavItems)
  // with no retry and no error surfaced - navItems stays stuck at whatever
  // it was seeded with (see the useState initializer above) for the rest of
  // the page's life. An empty nav menu is never legitimately correct for
  // this app (there's always at least a seeded default set), so an empty
  // result here is reliably a transient failure, not real data - safe to
  // retry a few times rather than accept it as final.
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    refreshStaff();
    let cancelled = false;
    const applyNavItems = (data: any[]) => {
      // Use the DB as source of truth wholesale, including order -
      // normalizeNavItems' own mapping assigns order from array index, and
      // `data` is already sorted by display_order ASC (see
      // fetchNavMenuFromDB's query), so that reflects the DB's actual
      // current order. This used to instead reuse prev.indexOf(initial) -
      // the position the item happened to have in whatever loaded first -
      // which meant a reorder in Root Admin's editor would show correctly
      // there but a tab that had already loaded before the reorder stayed
      // stuck on the old order for the rest of its session.
      setNavItems(normalizeNavItems(data));
    };

    const loadWithRetry = async (attemptsLeft: number) => {
      const data = await fetchNavMenuFromDB();
      if (cancelled) return;
      if (data && data.length > 0) {
        applyNavItems(data);
      } else if (attemptsLeft > 0) {
        setTimeout(() => { if (!cancelled) loadWithRetry(attemptsLeft - 1); }, 1500);
      }
    };
    loadWithRetry(3);

    return () => { cancelled = true; };
  }, [isAuthenticated, authChecked]);

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
  // StrictMode's dev-only double-invoke means this can still fire twice on its
  // own, so 2 concurrent fetchGuestsFromDB() calls can be in flight at once (a
  // near-duplicate sibling effect used to double this further - see its removal
  // note above). If an older call (still in flight for a previous property)
  // resolves after a newer one, it would overwrite correct state with stale/
  // wrong-property data. The token below discards any resolution that isn't
  // from the most recently started fetch cycle.
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    hydrationTokenRef.current += 1;
    const myToken = hydrationTokenRef.current;
    const isStale = () => hydrationTokenRef.current !== myToken;

    // DataLoader.tsx already fetched guests/receipts for this exact property
    // before mount (see preloadedPropertyIdRef's own comment above) - skip
    // re-fetching those two specifically on that same initial pass. Menu is
    // deliberately NOT skipped here despite also being preloaded - its dedup
    // safety net below (>75 items) needs to keep running on every load, not
    // just from the second hydration onward.
    const isInitialLoadForPreloadedProperty = preloadedData.currentProperty?.id === preloadedPropertyIdRef.current;
    preloadedPropertyIdRef.current = undefined;

    if (!isInitialLoadForPreloadedProperty) {
      fetchGuestsFromDB().then((data) => {
        if (isStale()) return;
        setGuests(data && data.length > 0 ? data : []);
      });
      fetchReceiptsFromDB().then((data) => {
        if (isStale()) return;
        setReceipts(data && data.length > 0 ? data : []);
      });
    }
    refreshStaff();
    if (isModuleEnabled('kitchen')) {
      fetchMenuFromDB().then((data) => {
        if (data && data.length > 75) {
          dedupMenuDB().then(() => {
            fetchMenuFromDB().then((clean) => {
              if (isStale()) return;
              setMenu(clean && clean.length > 0 ? clean : DEFAULT_MENU_ITEMS);
            });
          });
        } else {
          if (isStale()) return;
          setMenu(data && data.length > 0 ? data : DEFAULT_MENU_ITEMS);
        }
      });
    }
    refreshAttendance();
    fetchAuditLogsFromDB().then((data) => {
      if (isStale()) return;
      setAuditLogs(data && data.length > 0 ? data : []);
    });
    fetchServiceRequestsFromDB().then((data) => {
      if (isStale()) return;
      setServiceRequests(data || []);
    });
  }, [isModuleEnabled, preloadedData.currentProperty?.id, isAuthenticated, authChecked]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    if (activeTab === 'dashboard') {
      fetchGuestsFromDB().then((data) => setGuests(data || []));
      fetchServiceRequestsFromDB().then((data) => setServiceRequests(data || []));
    }
  }, [activeTab, isAuthenticated, authChecked]);

  // Helper to check if a route key is allowed for current activeRole
  const isRouteAllowed = (key: string, role: string, items: NavMenuItem[]) => {
    // Dropdown section containers & overview launchpads (don't gate on a
    // specific child action, just "is this section visible at all") are
    // always allowed if logged in. team_overview/admin_control_overview
    // specifically: Navigation.tsx's buildTree() renames the real DB items
    // ('custom_nav-...' / 'admin_control_group') to these keys for its own
    // sidebar-click routing, but that rename may not have propagated back
    // into this visibleNavItems array yet (React state timing) - so an
    // items.find() lookup here is unreliable and the bypass is required.
    // 'edit_main_menu' is a synthetic key too: it's an internal MenuManager
    // sub-tab (see MenuManager.tsx's isStandalonePage/tab handling), not a
    // separately-registered nav item - only 'edit_food_menu' is in
    // NavMenuEditor's default list. Still reachable directly via hash
    // '#edit_main_menu' (see the routeMap below), which is why this bypass
    // stays even though 'edit_items_group' ("Menu & Pricing") no longer
    // remaps to it - that card was routing to the wrong destination
    // (the sidebar-structure editor instead of food pricing) and got fixed
    // to remap to 'edit_food_menu' instead (found 20 Aug 2026).
    // 'kitchen_orders' is a legacy synthetic key too: the standalone Kitchen
    // Orders page was folded into the unified take_food_order screen's "Live
    // Tickets" tab (see KitchenManagement.tsx's activeMenuItemKey handling,
    // which still maps 'kitchen_orders' to that tab) - so it's deliberately
    // marked isVisible:false in NavMenuEditor as a superseded route, not
    // access-restricted. The mobile "Quick Actions" drawer's "View Live
    // Kitchen Order" button still navigates via this exact key though (see
    // MobileBottomNav.tsx), and the items.find() lookup below fails on a
    // hidden item regardless of role - even Root Admin - since the
    // isVisible check runs before the root-admin bypass further down. That
    // silently bounced the button straight back to Dashboard on every click
    // (found 20 Aug 2026).
    // 'take_food_order' bypasses for the same reason: the sidebar/mobile-nav
    // "Kitchen" parent button now routes straight here (its own former
    // landing page, kitchen_overview/KitchenDashboard, was a purely
    // redundant shortcut card and got removed permanently, 20 Aug 2026) -
    // without the bypass, any role not individually granted this specific
    // item (even if granted Kitchen access generally) would get silently
    // bounced back to Dashboard on every "Kitchen" click.
    // IMPORTANT (23 Aug 2026, found live via "staff level access is
    // incorrect" report): this used to `return true` unconditionally for
    // BOTH of these keys, for every role with no check at all - meaning a
    // role with ZERO Kitchen permission (e.g. generic Staff) could still
    // successfully load the Kitchen page via any link/button that targets
    // these two exact keys (OperationalDashboard's "Open Kitchen Orders"
    // button, the mobile Quick Actions sheet), completely bypassing whatever
    // NavMenuEditor had configured. Fixed to still skip the unreliable
    // items.find() lookup below (parent/child role grants can drift, see
    // above) but gate on whether the role has Kitchen access AT ALL, via the
    // kitchen_overview grouping item's own roles - same umbrella-permission
    // check canSeeNavKey()/mobileNavPermissions.kitchen/kitchenAccessAllowed
    // already use elsewhere, so all these gates agree.
    if (key === 'kitchen_orders' || key === 'take_food_order') {
      const kitchenGroupItem = items.find((i) => (i.uniqueKey || i.tabKey) === 'kitchen_overview');
      if (!kitchenGroupItem) return true; // not loaded yet - fail open, same as other synthetic-key bypasses
      if (!kitchenGroupItem.isVisible) return true; // superseded/hidden group row, not access-restricted
      const normalizedRole = role.toLowerCase().trim();
      if (normalizedRole === 'root admin' || normalizedRole === 'super admin') return true;
      return kitchenGroupItem.roles.some((r) => r.toLowerCase().trim() === normalizedRole);
    }
    if (key === 'admin_control_group' || key === 'edit_items_group' || key === 'edit_main_menu' || key === 'team_overview' || key === 'admin_control_overview') return true;
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

  // Strict "should this control even be SHOWN to this role" check (23 Aug
  // 2026 - "if something is not accessible to a particular role, it should
  // also not be visible"). Deliberately separate from isRouteAllowed() above:
  // that one exists to tolerate synthetic/legacy keys so an in-app click
  // never gets silently bounced back to Dashboard (hence its
  // always-return-true bypass list for keys like 'take_food_order'), which
  // is the right behaviour for a route guard but the wrong one for deciding
  // whether to render a button in the first place - it would make every role
  // see a "Kitchen" button/quick-actions regardless of actual permission.
  // This one does the plain, unbypassed role check against the item's own
  // DB-declared `roles` (same source NavMenuEditor writes to, same check
  // Navigation.tsx's sidebar already applies), so it stays correct
  // automatically as an admin edits role grants - no separate config to
  // keep in sync. Was missing entirely for MobileBottomNav.tsx (found 23 Aug
  // 2026): every one of its 5 tab buttons plus all 4 Quick Actions sheet
  // buttons rendered unconditionally for every role, with the sidebar being
  // the only actually-gated nav surface on mobile.
  // Fails OPEN (returns true) when the key isn't found in visibleNavItems -
  // this also covers the case where nav items haven't loaded yet (the
  // documented cold-start race, see CLAUDE.md's "Sidebar Shows Only
  // Kitchen" note) so the bottom nav doesn't blank out entirely while data
  // is still in flight; once real data loads, real gating applies.
  const canSeeNavKey = (key: string): boolean => {
    const normalizedRole = activeRole.toLowerCase().trim();
    if (normalizedRole === 'root admin' || normalizedRole === 'super admin') return true;
    const item = visibleNavItems.find((i) => (i.uniqueKey || i.tabKey) === key);
    if (!item) return true;
    if (!item.isVisible) return false;
    return item.roles.some((r) => r.toLowerCase().trim() === normalizedRole);
  };

  // Mobile bottom nav / quick-actions visibility, recomputed whenever role or
  // nav items change. 'kitchen_orders' deliberately is NOT used to gate
  // "View Live Kitchen Order" - that key is marked isVisible:false in
  // NavMenuEditor as a superseded route (folded into take_food_order's own
  // Live Tickets tab), not access-restricted, so gating on it directly would
  // hide the button for every role. 'take_food_order' (the umbrella Kitchen
  // permission) is the correct key, same as the sidebar's own Kitchen
  // section grouping uses.
  const mobileNavPermissions = useMemo(() => ({
    home: canSeeNavKey('dashboard'),
    guests: canSeeNavKey('all_bookings'),
    kitchen: canSeeNavKey('take_food_order'),
    finances: canSeeNavKey('finances'),
    addExpense: canSeeNavKey('expenses'),
    addServiceRequest: canSeeNavKey('service_requests'),
    addBooking: canSeeNavKey('all_bookings'),
    addFoodOrder: canSeeNavKey('take_food_order'),
    viewLiveKitchenOrder: canSeeNavKey('take_food_order'),
  }), [activeRole, visibleNavItems]);

  // Same umbrella Kitchen permission as mobileNavPermissions.kitchen above,
  // reused for OperationalDashboard's own "Live Kitchen Tickets" card (23 Aug
  // 2026 - found live-reported: a role denied Kitchen in NavMenuEditor could
  // still see real live order data and an "Open Kitchen Orders" button on
  // the Dashboard itself, since that card was gated only by kitchenModuleEnabled
  // - a property-wide feature toggle, not a per-role check. Threaded down
  // through both OperationalDashboard's direct call site and
  // MultiKeyPropertyOverview's two internal ones, same pattern as
  // kitchenModuleEnabled already uses (see "Props Threading" in CLAUDE.md).
  const kitchenAccessAllowed = useMemo(() => canSeeNavKey('take_food_order'), [activeRole, visibleNavItems]);

  // Same pattern as kitchenAccessAllowed above, for the Dashboard/TodayOverview
  // "Service Requests" KPI card (25 Aug 2026 - found live: a Staff Kitchen login
  // saw this widget with real pending-request data despite ROLES.md documenting
  // that role as unable to access Service Requests at all; the card had no
  // per-role check, only the sidebar's `service_requests` nav item did - and
  // that nav item's own roles_json was separately found to be unset, granting
  // it to every role - see ROLES.md's 25 Aug changelog entry for both halves).
  const serviceRequestsAccessAllowed = useMemo(() => canSeeNavKey('service_requests'), [activeRole, visibleNavItems]);

  // Guard Effect 1: Trigger whenever activeRole, activeMenuItemKey, or visibleNavItems update
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    if (visibleNavItems.length === 0) return;
    // Skip RBAC check if viewing a room, property overview, or editing property configuration
    if (selectedRoomSlugOverride || activeMenuItemKey === 'multikey_property_overview' || activeMenuItemKey === 'edit_property') return;

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
  }, [activeRole, activeMenuItemKey, visibleNavItems, isAuthenticated, authChecked, selectedRoomSlugOverride]);

  // Guard Effect 2: Trigger whenever user types a URL hash in the browser bar
  useEffect(() => {
    const handleUrlChange = (event?: Event) => {
      if (typeof window === 'undefined') return;
      if (!authChecked || !isAuthenticated) return;

      const rawHash = window.location.hash.replace('#', '').trim();
      const hash = rawHash.split('?')[0].split('/')[0];
      if (!hash) return;

      // If hash is a menu item (not a room), clear room override.
      const reserved = new Set([
        'dashboard', 'guests', 'kitchen', 'inventory', 'petty_cash', 'staff',
        'analytics', 'audit_logs', 'export', 'menu_manager', 'telegram',
        'guest_registration', 'all_bookings', 'bookings', 'billing_checkout', 'take_food_order', 'kitchen_orders', 'staff_meals',
        'stock_requests', 'deficit_shortfalls_log', 'stock_log',
        'kitchen_purchases', 'edit_kitchen_stock', 'cash_drawer', 'finances', 'staff_payees_control',
        'attendance_salaries', 'attendance_calendar', 'staff_directory_salaries', 'staff_permissions',
        'dashboard_analytics', 'past_receipts_log', 'data_export_center',
        // 'ical_sync'/'ical_sync_manager' deliberately NOT here either - same
        // reasoning as 'edit_property' below: both legacy hashes now redirect
        // to 'edit_property' (see routeMap), and that page is room-scoped
        // when opened from inside a room (the iCal section only shows that
        // room's own feeds), so visiting either from within a room should
        // stay in that room too, not kick out to the parent property.
        'edit_food_menu', 'beta_recipe_builder', 'misc_charges', 'edit_items_group',
        'service_requests', 'license_management', 'channel_manager'
      ]);

      // 'edit_property' is deliberately NOT in `reserved` above - clicking it
      // from inside a room (Navigation.tsx's sidebar link, which only ever
      // fires 'hashchange', never 'popstate') should edit that room itself,
      // not kick the user to the parent property. But the browser Back/
      // Forward buttons ALSO land on this same literal hash when backing out
      // of a room's edit view to the parent's own Edit Property page, and
      // those fire 'popstate' (real history navigation) alongside
      // 'hashchange' - so on popstate specifically, 'edit_property' clears
      // room override same as every other reserved key, letting Back
      // actually leave the room instead of silently re-showing it.
      const isRealHistoryNavigation = event?.type === 'popstate';
      const shouldClearRoomOverride = reserved.has(hash) || (hash === 'edit_property' && isRealHistoryNavigation);
      if (shouldClearRoomOverride && selectedRoomSlugOverrideRef.current) {
        setSelectedRoomSlugOverride(null);
      }

      const routeMap: Record<string, { tab: TabType; key: string }> = {
        dashboard: { tab: 'dashboard', key: 'dashboard' },
        guest_registration: { tab: 'guests', key: 'all_bookings' },
        all_bookings: { tab: 'guests', key: 'all_bookings' },
        // Must match getInitialActiveState()'s routeMap - see its comment.
        bookings: { tab: 'guests', key: 'all_bookings' },
        billing_checkout: { tab: 'guests', key: 'all_bookings' },
        guests: { tab: 'guests', key: 'all_bookings' },
        take_food_order: { tab: 'kitchen', key: 'take_food_order' },
        kitchen_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        live_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        live_kitchen_orders: { tab: 'kitchen', key: 'kitchen_orders' },
        live_tickets: { tab: 'kitchen', key: 'kitchen_orders' },
        staff_meals: { tab: 'kitchen', key: 'staff_meals' },
        // Must match getInitialActiveState()'s routeMap - 'take_food_order'
        // is a real DB-driven nav item, so it's also in isRouteAllowed()'s
        // bypass list above (same reason 'kitchen_orders' already was): a
        // role missing that specific item's own grant would otherwise get
        // silently bounced back to #dashboard on every click of the sidebar/
        // mobile-nav "Kitchen" button (itemKey 'kitchen') - the exact bug
        // this comment originally documented for kitchen_overview, now
        // retired (20 Aug 2026) along with its landing page.
        kitchen: { tab: 'kitchen', key: 'take_food_order' },
        stock_requests: { tab: 'inventory', key: 'stock_requests' },
        fulfill_stock_req: { tab: 'inventory', key: 'stock_requests' },
        deficit_shortfalls_log: { tab: 'inventory', key: 'deficit_shortfalls_log' },
        stock_log: { tab: 'inventory', key: 'edit_kitchen_stock' },
        kitchen_purchases: { tab: 'petty_cash', key: 'expenses' },
        edit_kitchen_stock: { tab: 'inventory', key: 'edit_kitchen_stock' },
        inventory: { tab: 'inventory', key: 'stock_requests' },
        expenses: { tab: 'petty_cash', key: 'expenses' },
        cash_drawer: { tab: 'petty_cash', key: 'finances' },
        finances: { tab: 'petty_cash', key: 'finances' },
        petty_cash: { tab: 'petty_cash', key: 'expenses' },
        staff_payees_control: { tab: 'staff', key: 'staff_payees_control' },
        attendance_salaries: { tab: 'staff', key: 'attendance_salaries' },
        // Must match getInitialActiveState()'s routeMap - see its comment
        // on this same alias.
        attendance_salary: { tab: 'staff', key: 'attendance_salaries' },
        attendance_calendar: { tab: 'staff', key: 'attendance_calendar' },
        staff_directory_salaries: { tab: 'staff', key: 'staff_directory_salaries' },
        staff_permissions: { tab: 'staff', key: 'staff_permissions' },
        // "Team" parent click now goes straight to Staff & Permissions
        // (Team & Access) instead of TeamOverviewDashboard's own landing
        // page - same pattern as Kitchen -> Take Food Order (21 Aug 2026).
        // TeamOverviewDashboard itself is left in place, just no longer
        // reachable through this specific click (not deleted - only asked
        // to reroute this one, unlike Kitchen's explicit "delete
        // permanently").
        team_overview: { tab: 'staff', key: 'staff_permissions' },
        team: { tab: 'staff', key: 'staff_permissions' },
        staff: { tab: 'staff', key: 'staff_permissions' },
        admin_control_overview: { tab: 'analytics', key: 'admin_control_overview' },
        dashboard_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        analytics: { tab: 'analytics', key: 'admin_control_overview' },
        purchase_analytics: { tab: 'analytics', key: 'dashboard_analytics' },
        past_receipts_log: { tab: 'audit_logs', key: 'past_receipts_log' },
        edit_food_menu: { tab: 'menu_manager', key: 'edit_food_menu' },
        edit_expense_items: { tab: 'petty_cash', key: 'edit_expense_items' },
        edit_main_menu: { tab: 'menu_manager', key: 'edit_main_menu' },
        admin_control_group: { tab: 'analytics', key: 'admin_control_overview' },
        // See the matching fix/comment on this same key in
        // getInitialActiveState() above - "Menu & Pricing" must land on the
        // food_menu sub-tab (edit_food_menu), not the nav-structure editor.
        edit_items_group: { tab: 'menu_manager', key: 'edit_food_menu' },
        menu_manager: { tab: 'menu_manager', key: 'edit_food_menu' },
        misc_charges: { tab: 'petty_cash', key: 'misc_charges' },
        data_export_center: { tab: 'export', key: 'data_export_center' },
        telegram: { tab: 'telegram', key: 'telegram' },
        beta_recipe_builder: { tab: 'kitchen', key: 'beta_recipe_builder' },
        // Standalone "iCal Sync" page removed - calendar management moved onto
        // each room's own Edit Room page (MultiKeyPropertyOverview.tsx) and,
        // for single properties, onto Edit Property. Old bookmarks/links to
        // this hash land on Edit Property instead of a dead tab.
        ical_sync_manager: { tab: 'edit_property', key: 'edit_property' },
        ical_sync: { tab: 'edit_property', key: 'edit_property' },
        service_requests: { tab: 'service_requests', key: 'service_requests' },
        edit_property: { tab: 'edit_property', key: 'edit_property' },
        license_management: { tab: 'licenses', key: 'license_management' },
        channel_manager: { tab: 'channel_manager', key: 'channel_manager' },
      };

      const baseHash = hash.split('?')[0].split('/')[0].trim();

      // 404 or Invalid Route -> Try dynamic nav items from DB, then check if it's a room slug (with optional /subtab)
      if (!routeMap[baseHash]) {
        const [roomPart, tabPart] = hash.split('/');
        // urlSlug first - that's what a renamed item's link actually points at now;
        // uniqueKey/tabKey stay as fallbacks for items that were never renamed.
        const dynamicItem = visibleNavItems.find((n) => n.urlSlug === baseHash || n.uniqueKey === baseHash || n.tabKey === baseHash);
        if (dynamicItem && dynamicItem.isVisible) {
          setActiveTab(dynamicItem.tabKey as any || 'dashboard');
          setActiveMenuItemKey(dynamicItem.uniqueKey || baseHash);
        } else {
          // Check if hash is a room slug from multi-key property (supports #room-101/edit_property)
          const targetRoomSlug = roomPart || hash;
          const isRoomSlug = multiKeyRoomsRef.current?.some((r: any) => r.slug === targetRoomSlug);
          if (isRoomSlug) {
            // Restore room view. If subtab is provided in hash (e.g. #room-101/edit_property),
            // activate that subtab directly.
            const resolvedSubTab: TabType | null = (tabPart && ['dashboard', 'guests', 'edit_property'].includes(tabPart) ? (tabPart as TabType) : null)
              || (tabPart && routeMap[tabPart]?.tab)
              || null;
            setActiveTab((prev) => (resolvedSubTab || (['dashboard', 'guests', 'edit_property'].includes(prev) ? prev : 'dashboard')));
            setActiveMenuItemKey(targetRoomSlug);
            setSelectedRoomSlugOverride(targetRoomSlug);
          } else {
            // Not a valid route or room, fallback to dashboard
            setActiveTab('dashboard');
            setActiveMenuItemKey('dashboard');
            window.location.hash = '#dashboard';
          }
        }
        return;
      }

      const targetRoute = routeMap[baseHash];
      // Still viewing a room only if we didn't just decide to clear it above
      // - selectedRoomSlugOverrideRef.current itself is stale here (it's
      // synced from state via its own effect, which hasn't run yet this
      // tick), so a plain ref read would still see the OLD room slug and
      // wrongly skip updating activeMenuItemKey below, leaving it stuck on
      // the room slug - which then fails the RBAC check in Guard Effect 1
      // and falls back to Dashboard, undoing this navigation entirely.
      const stillViewingRoom = !!selectedRoomSlugOverrideRef.current && !shouldClearRoomOverride;
      // Check RBAC permission for route target
      const allowed = isRouteAllowed(targetRoute.key, activeRole, visibleNavItems);
      if (allowed) {
        setActiveTab(targetRoute.tab);
        // Only update activeMenuItemKey if NOT viewing a room
        // If viewing a room, keep the room slug as the active menu item
        if (!stillViewingRoom) {
          setActiveMenuItemKey(targetRoute.key);
        }
      } else {
        // Forbidden route attempt -> Redirect to homepage #dashboard
        setActiveTab('dashboard');
        // Only update activeMenuItemKey if NOT viewing a room
        if (!stillViewingRoom) {
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
  }, [activeRole, visibleNavItems, isAuthenticated, authChecked]);

  // Helper to dispatch real Telegram Notifications via Secure PHP Proxy API
  const dispatchTelegramAlert = async (
    eventType: string,
    message: string,
    category: 'kitchen' | 'admin' | 'finance' | 'all' = 'all',
    replyMarkup?: any,
    templateKey?: string,
    mediaUrls?: string[]
  ) => {
    const logId = `tg-${Date.now().toString().slice(-4)}`;
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Automatically append current debug URL if not present
    let outboundMessage = message;
    if (!outboundMessage.includes('http://') && !outboundMessage.includes('https://')) {
      const currentUrl = window.location.href;
      outboundMessage += `\n\n🔗 <b>Source Page:</b> <a href="${currentUrl}">${currentUrl}</a>`;
    }

    // Add pending log entry
    const newLog: TelegramDispatchLog = {
      id: logId,
      timestamp,
      eventType,
      message: outboundMessage,
      status: 'Delivered',
      replyMarkup,
    };
    setTelegramLogs((prev) => [newLog, ...prev]);

    let hasError = false;
    let errorMessage = '';
    let outcome: { success: boolean; attempted: number; delivered: number; reason?: string } = { success: false, attempted: 0, delivered: 0 };

    try {
      outcome = await sendTelegramAlertDB({
        eventType,
        category,
        message: outboundMessage,
        replyMarkup,
        templateKey,
        mediaUrls,
      });
      if (!outcome.success) {
        hasError = true;
        errorMessage = outcome.reason || 'No Telegram group actually received this message.';
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

    return outcome;
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
  // Async + throws on failure (23 Aug 2026, ROADMAP.md verification pass - see
  // addGuestToDB's own comment for the full story). The optimistic setGuests
  // add below still happens immediately (keeps the form feeling instant), but
  // now rolls back if the DB call actually rejects, instead of leaving a
  // phantom booking (fake id, "success" toast already shown, fully visible in
  // Dashboard Alerts/calendar/Arrivals) that never really existed once
  // addGuestToDB's real validation failure surfaces. Callers must await this
  // and handle the throw - see GuestManagement.tsx's onSubmit.
  const handleAddGuest = async (newGuest: Guest) => {
    setGuests((prev) => [newGuest, ...prev]);
    let dbId: string | null = null;
    let overlapWarning: { source_label: string; event_start: string; event_end: string } | undefined;
    try {
      const result = await addGuestToDB({
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
        // total_charge was never sent here despite the column existing - it stayed 0 for
        // every new booking, which silently zeroed the TodayOverview calendar chip's
        // nightly-rate label (it derives from totalCharge, not roomRate/base_room_rent).
        total_charge: newGuest.roomRate || newGuest.totalAmount || 0,
        advance_paid: newGuest.advanceAmount || 0,
        advance_received_by: newGuest.advanceReceivedBy || '',
        pending_amount: newGuest.pendingAmount || 0,
        pending_received_by: newGuest.pendingReceivedBy || '',
        is_foreign_guest: newGuest.isForeignGuest || false,
        ota_source: newGuest.otaSource || undefined,
        ota_source_label: newGuest.otaSourceLabel || undefined,
        ical_external_event_id: newGuest.icalExternalEventId || undefined,
        extra_charges: newGuest.extraCharges || undefined,
      });
      dbId = result.id;
      overlapWarning = result.overlapWarning;
    } catch (err) {
      // Roll back the optimistic add above - addGuestToDB throws now (23 Aug
      // 2026), so a real validation failure no longer leaves a phantom
      // booking (fake id, already-shown "success" toast, fully visible in
      // Dashboard Alerts/calendar/Arrivals) that never actually existed in
      // the database. Re-throw so GuestManagement.tsx's onSubmit can show
      // the real reason instead of its own hardcoded success toast.
      setGuests((prev) => prev.filter((g) => g.id !== newGuest.id));
      throw err;
    }
    if (dbId) {
      setGuests((prev) => prev.map((g) => g.id === newGuest.id ? { ...g, id: dbId! } : g));
    }
    if (overlapWarning) {
      const startLabel = formatDateDDMMYYYY(overlapWarning.event_start);
      const endLabel = formatDateDDMMYYYY(overlapWarning.event_end);
      showToast(`Heads up: this room has an unconverted ${overlapWarning.source_label} reservation from ${startLabel} to ${endLabel} - please verify with the guest.`, { type: 'warning', duration: 8000 });
    }
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
      advance_received_by: g.advance_received_by ?? updatedGuest.advanceReceivedBy ?? '',
      pending_received_by: g.pending_received_by ?? updatedGuest.pendingReceivedBy ?? '',
      booking_source: g.booking_source ?? updatedGuest.bookingSource ?? '',
      notes: g.notes ?? updatedGuest.notes ?? '',
      is_foreign_guest: g.is_foreign_guest ?? updatedGuest.isForeignGuest ?? false,
      // Version this edit was built from - the save is rejected if someone else
      // changed the booking in the meantime, instead of silently discarding
      // their change. Read from the guest currently in state rather than from
      // updatedGuest, since the edit form round-trips its own copy and may not
      // carry the field through.
      expected_updated_at:
        guests.find((existing) => existing.id === updatedGuest.id)?.updatedAt ??
        updatedGuest.updatedAt ??
        null,
    });
    if (!ok) throw new Error('Failed to update booking');
    // Refetch rather than merging blindly: the local row's updatedAt token is
    // now stale (the server just issued a new one), so a second edit in the
    // same session would otherwise be wrongly rejected as a conflict.
    fetchGuestsFromDB().then((fresh) => { if (fresh.length) setGuests(fresh); }).catch(() => {});
    setGuests((prev) =>
      prev.map((g) => (g.id === updatedGuest.id ? { ...g, ...updatedGuest } : g))
    );
    logAudit(`Updated booking: ${updatedGuest.guestName} (${updatedGuest.roomNumber})`);
  };

  const handleDeleteGuest = async (guestId: string) => {
    const target = guests.find((g) => g.id === guestId);
    // deleteGuestFromDB throws with the real backend reason on failure now (23 Aug 2026) -
    // let it propagate instead of masking it with a fresh generic error here.
    await deleteGuestFromDB(guestId);
    setGuests((prev) => prev.filter((g) => g.id !== guestId));
    logAudit(`Deleted booking: ${target?.guestName || guestId} (${target?.roomNumber || 'unknown room'})`);
  };

  const handleGuestVerificationUpdated = (guestId: string) => {
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, idVerificationStatus: 'Complete' } : g))
    );
  };

  const handleCFormFiledUpdated = (guestId: string, filedAt: string | null) => {
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, cFormFiledAt: filedAt } : g))
    );
  };

  const handleGuestCheckedIn = (guestId: string) => {
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, status: 'Checked In' as any } : g))
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
      itemsStr += `  • Accommodation (${receipt.nightsCount || 1} nights): <b>₹${receipt.roomTotal}</b>\n`;
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

    const msg = `📶 <b>FULLY ITEMIZED SETTLEMENT BILL</b>
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
    // `telegramConfig.enabledEvents` was a leftover of the old single-global
    // Telegram config (TelegramConfig type) - superseded by the per-property
    // DB-driven groups/routing config (PropertyTelegramConfig) that
    // fetchTelegramConfigDB() actually returns now, which has no
    // `enabledEvents` field. Nothing in TelegramNotificationModal.tsx (the
    // only settings UI) ever reads or writes `enabledEvents` either, so this
    // gate could never be turned on and was unconditionally crashing every
    // checkout instead (`Cannot read properties of undefined (reading
    // 'guestCheckout')`) - found 19 Aug 2026. Whether a property actually
    // wants this notification is already decided server-side by its saved
    // routing config; dispatchTelegramAlert/sendTelegramAlertDB no-ops there
    // if nothing's configured, same as the kotOrders/pettyCashExpenses
    // notifications elsewhere that never went through this gate at all.
    {
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

    // Auto-log a "Room Cleaning" housekeeping task on every checkout (both
    // Single and MultiKey properties - MultiKey resolves the guest's actual
    // room, Single properties have no distinct room list so room_id stays
    // null and the task is logged at the property level). This reuses the
    // existing create_service_request flow, which already sends its own
    // Telegram notification (with an inline "Mark Fulfilled" button) and
    // stores the message id - that's what lets "Mark Fulfilled" later edit
    // this same message in place instead of needing a second new message.
    // Fired after the checkout-bill dispatch above (not awaited, same as it)
    // so it lands as the follow-up message when both are enabled.
    const matchedRoom = (preloadedData.currentProperty?.rooms || []).find(
      (r: any) => r.name === receipt.roomNumber
    );
    createServiceRequestInDB({
      room_id: matchedRoom ? Number(matchedRoom.id) : null,
      request_type: 'room_cleaning',
      description: `Checked out: ${receipt.guestName} (Receipt #${receipt.id})`,
      requested_by: 'System (auto, on checkout)',
    });
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
        changes.push(`Moved "${item.title}" from ${oldParent} â†’ ${newParent}`);
      }
      if (item.title !== old.title) changes.push(`Renamed "${old.title}" â†’ "${item.title}"`);
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

    // See handleCheckoutGuest's comment above `dispatchTelegramAlert('Checkout', ...)`
    // for why this no longer gates on `telegramConfig.enabledEvents`.
    {
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

    // See handleCheckoutGuest's comment above `dispatchTelegramAlert('Checkout', ...)`
    // for why this no longer gates on `telegramConfig.enabledEvents`.
    if (item && newStock <= item.minThreshold) {
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

  const handleSendTestNotification = async () => {
    const testTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const testMsg = `🧪 <b>TELEGRAM SYSTEM DIAGNOSTIC TEST</b>\n• App: Ground Code Resort Management System\n• Time: ${testTime}\n• Status: Operational ✅\n• Channels: Kitchen, Admin, Finance`;
    return dispatchTelegramAlert('Test Dispatch', testMsg, 'all');
  };

  const handleSavePropertyLocation = async (address: string, googleMapsLink: string, instructions?: string): Promise<boolean> => {
    try {
      const response = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: preloadedData.currentProperty?.id,
          address,
          google_maps_link: googleMapsLink,
          ...(instructions !== undefined ? { instructions } : {}),
        }),
      });
      const data = await response.json();
      if (data.success) {
        if (preloadedData.currentProperty) {
          preloadedData.currentProperty.address = address;
          preloadedData.currentProperty.google_maps_link = googleMapsLink;
          if (instructions !== undefined) {
            (preloadedData.currentProperty as any).instructions = instructions;
          }
        }
        showToast('Property address saved successfully!', { type: 'success' });
        return true;
      }
      showToast(data.error || data.message || 'Failed to save address', { type: 'error' });
      return false;
    } catch (err) {
      console.error('Failed to save address:', err);
      showToast('Failed to save address due to network error', { type: 'error' });
      return false;
    }
  };

  // Hold render until the real backend session has been confirmed by check_session.
  // Gating on authChecked prevents the optimistic localStorage state from prematurely
  // rendering the dashboard on cold boot before a 401/expired session can be discovered.
  if (!authChecked) {
    return <LoadingScreen message="Verifying session..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-gray-900 dark:text-gray-100 antialiased transition-colors">
        {!isAuthenticated && propertySelection && (
          <StaffPropertyPicker
            tenantId={propertySelection.tenantId}
            tenantSlug={propertySelection.tenantSlug}
            user={propertySelection.user}
            onLogout={() => setPropertySelection(null)}
          />
        )}

        {isAuthenticated && isSwitchingProperty && effectiveCanSwitchProperties && effectiveSwitchTenantId && effectiveSwitchTenantSlug && (
          // z-[60], not the ordinary z-50 modal tier - this needs to sit above
          // DemoOnboardingTour's own floating "Explore Full App Tour" trigger
          // (fixed z-50, no literal inset-0 so the app-wide z-50->58 bump rule
          // in custom.css never applies to it either) which would otherwise
          // poke through this overlay's background.
          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <StaffPropertyPicker
              tenantId={effectiveSwitchTenantId}
              tenantSlug={effectiveSwitchTenantSlug}
              user={{ id: currentUser?.id, username: currentUser?.username || '', name: currentUser?.name, role: currentUser?.role }}
              onLogout={handleLogout}
              onClose={() => setIsSwitchingProperty(false)}
            />
          </div>
        )}

        {!isAuthenticated && !propertySelection && (
          <LoginPage
            variant="management"
            onLoginSuccess={handleLoginSuccess}
            onLoginFailed={handleLoginFailed}
            onNeedsPropertySelection={setPropertySelection}
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
            currentPropertyColorScheme={currentPropertyColorScheme}
            propertyName={propertyName}
            kitchenModuleEnabled={kitchenEnabled}
            isMultiKeyProperty={preloadedData.isMultiKeyProperty}
            guests={guests}
            rooms={preloadedData.currentProperty?.rooms || []}
            showInstallIcon={canShowInstallIcon}
            onInstallIconClick={handleHeaderInstallClick}
            onNavigate={(tab, itemKey) => handleNavigateTab(tab, itemKey)}
            onToggleAIChat={() => setIsAIChatOpen((prev) => !prev)}
            onSwitchProperty={() => setIsSwitchingProperty(true)}
            canSwitchProperties={effectiveCanSwitchProperties}
          />
        )}

        {isAuthenticated && (
          <Navigation
            activeTab={activeTab}
            setActiveTab={(tab) => handleNavigateTab(tab, tab === 'edit_property' ? 'edit_property' : undefined)}
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

        {isAuthenticated && (
          <MobileBottomNav
            activeTab={activeTab}
            onNavigateTab={(tab, itemKey) => handleNavigateTab(tab, itemKey)}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            isSidebarOpen={isSidebarOpen}
            kitchenModuleEnabled={kitchenEnabled}
            onOpenAddBooking={() => setIsAddBookingModalOpen(true)}
            onOpenAddExpense={() => { setInitialExpenseData(null); setIsAddExpenseModalOpen(true); }}
            onOpenAddServiceRequest={() => { setInitialServiceRequestData(null); handleNavigateTab('service_requests', 'service_requests'); }}
            permissions={mobileNavPermissions}
          />
        )}

        <Suspense fallback={null}>
          <TelegramNotificationModal
            isOpen={isTelegramModalOpen}
            onClose={() => setIsTelegramModalOpen(false)}
            telegramConfig={telegramConfig}
            onUpdateConfig={setTelegramConfig}
            dispatchLogs={telegramLogs}
            onSendTestNotification={handleSendTestNotification}
            kitchenModuleEnabled={kitchenEnabled}
            // Hardcoded false (26 Aug 2026) - see the other
            // TelegramNotificationModal render site's comment above for why
            // per-property customization no longer exists at all.
            templateCustomizationEnabled={false}
          />
        </Suspense>


        {/* Main Dashboard Container */}
        {isAuthenticated && (
          /* pt-[calc(4rem+env(safe-area-inset-top))] matches Header.tsx's own
             height exactly (see that file's 25 Aug 2026 comment) - a static
             pt-16 was too short to clear the header on a notched device once
             it grew to fit the safe-area padding it already had. */
          <div className={`${isIconOnly ? 'pl-16' : 'md:pl-64 pl-0'} pt-[calc(4rem+env(safe-area-inset-top,0px))] flex-1 flex flex-col min-h-screen transition-[padding] duration-200`}>
            {/* Property setup notice - full-bleed bar right under the fixed header (explicit
                request, 26 Aug 2026: "there should be a notice in top of the site"), not inset
                inside <main>'s own padding like a regular page banner. Same 5 steps as
                PropertyCreationWizard - onSaved reloads to pick up fresh data, same established
                pattern EditPropertyPage.tsx already uses for these exact same fields. */}
            {/* Skipped entirely for demo/sales tenants (tenants.is_demo, surfaced here as
                currentProperty.tenant_is_demo by get_current_property) - a prospect being
                walked through the app, or a QA/staging demo account, shouldn't be nagged to
                finish setting up a property nobody's actually running, same reasoning as
                skipping TermsAcceptanceModal for these tenants in TenantDashboard.tsx.
                ALSO checks currentProperty.is_public_demo (28 Aug 2026, live report: this still
                showed on the public demo property despite tenant_is_demo genuinely being true in
                the API response for that load) - is_public_demo is a plain properties column
                get_current_property always returns directly, unlike tenant_is_demo, which is
                merged in afterward via a second query wrapped in a silent try/catch (router.php)
                and can come back missing on a transient failure. Checking both makes this
                belt-and-suspenders: the public demo property is never shown this nudge even if
                the tenant-level lookup happens to fail on a given request. */}
            {preloadedData.currentProperty &&
              !preloadedData.currentProperty?.tenant_is_demo &&
              !preloadedData.currentProperty?.is_public_demo && (
              <ErrorBoundary section="Property Setup Wizard">
                <PropertySetupWizard
                  propertyId={preloadedData.currentProperty.id}
                  propertyType={preloadedData.currentProperty?.property_type}
                  name={preloadedData.currentProperty?.name || ''}
                  address={preloadedData.currentProperty?.address || ''}
                  googleMapsLink={preloadedData.currentProperty?.google_maps_link || ''}
                  email={preloadedData.currentProperty?.email || ''}
                  phone={preloadedData.currentProperty?.phone || ''}
                  gstin={preloadedData.currentProperty?.gstin || ''}
                  upiId={preloadedData.currentProperty?.upi_id || ''}
                  upiQrCodeUrl={preloadedData.currentProperty?.upi_qr_code_url || ''}
                  checkinTime={preloadedData.currentProperty?.checkin_time || ''}
                  checkoutTime={preloadedData.currentProperty?.checkout_time || ''}
                  defaultTariff={preloadedData.currentProperty?.default_tariff}
                  walkInTableCount={preloadedData.currentProperty?.walk_in_table_count}
                  instructions={preloadedData.currentProperty?.instructions || ''}
                  onSaved={() => window.location.reload()}
                />
              </ErrorBoundary>
            )}
            {/* px-0 on mobile, not px-4 (superseded 31 Aug/1 Sep 2026 by the mobile
                full-bleed card initiative - see custom.css's "Full-bleed card standard
                on mobile screens"). Cards inside this <main> now span edge-to-edge on
                phones with custom.css stripping their own side borders/radius/margin;
                if this container kept its own px-4 gutter too, every card would be
                inset from the screen edge AGAIN while ALSO having lost its rounded
                corners/side borders - the exact "flat card floating in a padded box"
                bug this class must avoid causing. Non-card content (headers,
                breadcrumbs, toolbars) that still needs a gutter gets it back via
                custom.css's own curated selector list, not from this container.
                sm:px-6 lg:px-8 (tablet/desktop) is unaffected - the full-bleed
                treatment is mobile-only. app-shell__main tags this specific <main>
                so custom.css's full-bleed selectors can be scoped to descendants of
                it - TenantDashboard.tsx/RootAdminDashboard.tsx render their own
                separate <main> outside this shell with their own unreduced padding,
                and must NOT have the same card treatment applied without the
                matching padding compensation (found 2 Sep 2026: their cards were
                losing rounded corners/side borders via the old ungated selector
                while sitting in still-padded containers, a broken half-bled hybrid). */}
            <main className="app-shell__main flex-1 px-0 py-1 sm:px-6 sm:py-3 lg:px-8 lg:py-4 w-full space-y-2 sm:space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:pb-4">
              <Suspense fallback={<TabContentFallback />}>

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
                  guestsLoading={guestsLoading}
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
                  kitchenModuleEnabled={isModuleEnabled('kitchen')}
                  kitchenAccessAllowed={kitchenAccessAllowed}
                  serviceRequestsAccessAllowed={serviceRequestsAccessAllowed}
                  onUpdateBooking={handleUpdateGuest}
                  onDeleteBooking={handleDeleteGuest}
                  onGuestVerificationUpdated={handleGuestVerificationUpdated}
                  onCFormFiledUpdated={handleCFormFiledUpdated}
                  onGuestCheckedIn={handleGuestCheckedIn}
                  onCheckout={(guestId) => {
                    setFocusGuestId(guestId);
                    handleNavigateTab('guests', 'all_bookings');
                  }}
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
                        onNavigate={(tab) => handleNavigateTab(tab)}
                        onAddBooking={() => setIsAddBookingModalOpen(true)}
                        onAddGuest={handleAddGuest}
                        onUpdateGuest={handleUpdateGuest}
                        onDeleteGuest={handleDeleteGuest}
                        propertyName={preloadedData.currentProperty?.name || ''}
                        propertyMapsLink={preloadedData.currentProperty?.google_maps_link || ''}
                        propertyPhone={preloadedData.currentProperty?.phone || ''}
                        propertyWhatsappTemplate={preloadedData.currentProperty?.whatsapp_voucher_template || ''}
                        propertyUpiId={preloadedData.currentProperty?.upi_id || ''}
                        propertyUpiQrCodeUrl={preloadedData.currentProperty?.upi_qr_code_url || ''}
                        propertyAddress={preloadedData.currentProperty?.address || ''}
                        propertyInstructions={preloadedData.currentProperty?.instructions || ''}
                        propertyCheckinTime={preloadedData.currentProperty?.checkin_time || ''}
                        propertyCheckoutTime={preloadedData.currentProperty?.checkout_time || ''}
                        serviceRequests={serviceRequests}
                        serviceRequestsAccessAllowed={serviceRequestsAccessAllowed}
                        onCheckout={(guestId) => {
                          setFocusGuestId(guestId);
                          handleNavigateTab('guests', 'all_bookings');
                        }}
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
                      kitchenModuleEnabled={isModuleEnabled('kitchen')}
                      kitchenAccessAllowed={kitchenAccessAllowed}
                      serviceRequestsAccessAllowed={serviceRequestsAccessAllowed}
                      hideHeader={true}
                      onUpdateBooking={handleUpdateGuest}
                      onDeleteBooking={handleDeleteGuest}
                      onGuestVerificationUpdated={handleGuestVerificationUpdated}
                      onCFormFiledUpdated={handleCFormFiledUpdated}
                  onGuestCheckedIn={handleGuestCheckedIn}
                      serviceRequests={serviceRequests}
                      onCheckout={(guestId) => {
                        setFocusGuestId(guestId);
                        handleNavigateTab('guests', 'all_bookings');
                      }}
                      />
                    </ErrorBoundary>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <ErrorBoundary section="Operational Dashboard">
                      <OperationalDashboard
                        guests={guests}
                        // FIXED 25 Aug 2026 (live report: "View stock request on dashboard
                        // taking to wrong page") - this wrapper silently dropped the second
                        // argument every OperationalDashboard onNavigate() call passes
                        // (menuItemKey, e.g. 'stock_requests'/'all_bookings') - handleNavigateTab
                        // takes one and landed on each tab's own default sub-view instead every
                        // time, not just for Stock Requests.
                        onNavigate={(tab, menuItemKey) => handleNavigateTab(tab, menuItemKey)}
                        onOpenCheckin={() => handleNavigateTab('guests', 'guest_registration')}
                        onAddGuest={handleAddGuest}
                        kitchenModuleEnabled={isModuleEnabled('kitchen')}
                        kitchenAccessAllowed={kitchenAccessAllowed}
                        serviceRequestsAccessAllowed={serviceRequestsAccessAllowed}
                        onUpdateBooking={handleUpdateGuest}
                        onDeleteBooking={handleDeleteGuest}
                        onGuestVerificationUpdated={handleGuestVerificationUpdated}
                        onCFormFiledUpdated={handleCFormFiledUpdated}
                  onGuestCheckedIn={handleGuestCheckedIn}
                        propertyName={preloadedData.currentProperty?.name || ''}
                        propertyMapsLink={preloadedData.currentProperty?.google_maps_link || ''}
                        propertyPhone={preloadedData.currentProperty?.phone || ''}
                        propertyWhatsappTemplate={preloadedData.currentProperty?.whatsapp_voucher_template || ''}
                        propertyUpiId={preloadedData.currentProperty?.upi_id || ''}
                        propertyUpiQrCodeUrl={preloadedData.currentProperty?.upi_qr_code_url || ''}
                        propertyAddress={preloadedData.currentProperty?.address || ''}
                        propertyGoogleMapsLink={preloadedData.currentProperty?.google_maps_link || ''}
                        propertyInstructions={preloadedData.currentProperty?.instructions || ''}
                        propertyCheckinTime={preloadedData.currentProperty?.checkin_time || ''}
                        propertyCheckoutTime={preloadedData.currentProperty?.checkout_time || ''}
                        onSavePropertyLocation={handleSavePropertyLocation}
                        isMultiKeyProperty={preloadedData.isMultiKeyProperty}
                        onCheckout={(guestId) => {
                          setFocusGuestId(guestId);
                          handleNavigateTab('guests', 'all_bookings');
                        }}
                        serviceRequests={serviceRequests}
                      />
                    </ErrorBoundary>
                  </div>
                )
              ) : null}

              {!selectedRoomSlugOverride && activeTab === 'guests' && (
                <ErrorBoundary section="Guest Management">
                  <GuestManagement
                    guests={guests}
                    receipts={receipts}
                    isLoading={guestsLoading}
                    onAddGuest={handleAddGuest}
                    onCheckoutGuest={handleCheckoutGuest}
                    onUpdateGuest={handleUpdateGuest}
                    onDeleteGuest={handleDeleteGuest}
                    activeMenuItemKey={activeMenuItemKey}
                    onDispatchTelegram={dispatchTelegramAlert}
                    menu={menu}
                    isMultiKeyProperty={preloadedData.isMultiKeyProperty}
                    rooms={preloadedData.currentProperty?.rooms}
                    onSetActiveMenuItemKey={setActiveMenuItemKey}
                    selectedRoomSlug={preloadedData.currentRoomSlug || selectedRoomForGuestRegistration}
                    kitchenModuleEnabled={isModuleEnabled('kitchen')}
                    focusGuestId={focusGuestId}
                    onClearFocusGuest={() => setFocusGuestId(null)}
                    propertyGstin={preloadedData.currentProperty?.gstin || ''}
                    propertyName={preloadedData.currentProperty?.name || ''}
                    propertyMapsLink={preloadedData.currentProperty?.google_maps_link || ''}
                    propertyPhone={preloadedData.currentProperty?.phone || ''}
                    propertyWhatsappTemplate={preloadedData.currentProperty?.whatsapp_voucher_template || ''}
                    propertyUpiId={preloadedData.currentProperty?.upi_id || ''}
                    propertyUpiQrCodeUrl={preloadedData.currentProperty?.upi_qr_code_url || ''}
                    propertyAddress={preloadedData.currentProperty?.address || ''}
                    propertyInstructions={preloadedData.currentProperty?.instructions || ''}
                    propertyCheckinTime={preloadedData.currentProperty?.checkin_time || ''}
                    propertyCheckoutTime={preloadedData.currentProperty?.checkout_time || ''}
                    onNavigateToBilling={(_guestId) => {
                      // Navigate to billing view for guest
                    }}
                  />
                </ErrorBoundary>
              )}

              {/* kitchen_overview's own landing page (KitchenDashboard - a card
                  of shortcuts to Food Orders/Stock Requests/etc., purely
                  redundant with the sidebar's own Kitchen sub-items) was
                  removed permanently (20 Aug 2026). KitchenManagement now
                  renders unconditionally for every kitchen-tab key,
                  including the parent "Kitchen" click and any leftover
                  custom_nav- / nav-header- prefixed key that reaches here
                  unnormalized - it already defaults its own internal sub-tab sensibly
                  (see KitchenManagement.tsx's getInitialTab) rather than
                  needing a second component to dispatch to first. */}
              {!selectedRoomSlugOverride && activeTab === 'kitchen' && (
                <ErrorBoundary section="Kitchen Management">
                  <KitchenManagement
                    guests={guests}
                    menu={menu}
                    onAddMenuItem={handleAddMenuItem}
                    onRequestMaterial={handleRequestMaterial}
                    onDispatchTelegram={dispatchTelegramAlert}
                    activeMenuItemKey={activeMenuItemKey}
                    isMultiKeyProperty={preloadedData.isMultiKeyProperty}
                    propertyName={preloadedData.currentProperty?.name || ''}
                    propertyGstin={preloadedData.currentProperty?.gstin || ''}
                    propertyUpiId={preloadedData.currentProperty?.upi_id || ''}
                    propertyUpiQrCodeUrl={preloadedData.currentProperty?.upi_qr_code_url || ''}
                    propertyWalkInTableCount={preloadedData.currentProperty?.walk_in_table_count || 10}
                    initialStaffName={initialStaffMealName || undefined}
                    initialReqItemName={initialReqData?.itemName}
                    initialReqQty={initialReqData?.qty}
                    initialReqUnit={initialReqData?.unit}
                    initialNewMenuItemName={initialNewMenuItemData?.name}
                    initialNewMenuItemPrice={initialNewMenuItemData?.price}
                    initialNewMenuItemCategory={initialNewMenuItemData?.category}
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

              {!selectedRoomSlugOverride && activeTab === 'petty_cash' && activeMenuItemKey === 'finances' && (
                <ErrorBoundary section="Finances Manager">
                  <CashDrawerManager
                    onLogAudit={logAudit}
                    onDispatchTelegram={dispatchTelegramAlert}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'petty_cash' && activeMenuItemKey !== 'edit_expense_items' && activeMenuItemKey !== 'finances' && activeMenuItemKey !== 'misc_charges' && (
                <ErrorBoundary section="Petty Cash Management">
                  <PettyCashManagement
                    activeRole={activeRole}
                    onDispatchTelegram={dispatchTelegramAlert}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'staff' && (activeMenuItemKey === 'team_overview' || activeMenuItemKey === 'team' || activeMenuItemKey.startsWith('custom_nav-') || activeMenuItemKey.startsWith('nav-header-')) && (
                <ErrorBoundary section="Team Overview">
                  <TeamOverviewDashboard
                    onNavigate={(uniqueKey, tabKey) => handleNavigateTab((tabKey as TabType) || 'staff', uniqueKey)}
                    navItems={visibleNavItems}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'staff' && activeMenuItemKey !== 'team_overview' && activeMenuItemKey !== 'team' && !activeMenuItemKey.startsWith('custom_nav-') && !activeMenuItemKey.startsWith('nav-header-') && (
                <ErrorBoundary section="Staff Management">
                  <StaffManagement
                    activeMenuItemKey={activeMenuItemKey}
                    auditLogs={auditLogs}
                    onLogAudit={logAudit}
                    tenantId={preloadedData.currentProperty?.tenant_id}
                    propertyId={preloadedData.currentProperty?.id}
                    autoOpenAddModal={autoOpenAddStaffModal}
                    onClearAutoOpenAddModal={() => setAutoOpenAddStaffModal(false)}
                    initialEditStaffName={initialEditStaffName || undefined}
                    initialAddStaffName={initialAddStaffData?.name}
                    initialAddStaffPhone={initialAddStaffData?.phone}
                    initialAddStaffRole={initialAddStaffData?.role}
                    initialAddStaffSalary={initialAddStaffData?.salary}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'analytics' && (activeMenuItemKey === 'admin_control_overview' || activeMenuItemKey === 'admin_control_group' || activeMenuItemKey.startsWith('custom_nav-') || activeMenuItemKey.startsWith('nav-header-')) && (
                <ErrorBoundary section="Admin Control Overview">
                  <AdminControlOverviewDashboard
                    onNavigate={(uniqueKey, tabKey) => handleNavigateTab((tabKey as TabType) || 'analytics', uniqueKey)}
                    navItems={visibleNavItems}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'analytics' && activeMenuItemKey !== 'admin_control_overview' && activeMenuItemKey !== 'admin_control_group' && !activeMenuItemKey.startsWith('custom_nav-') && !activeMenuItemKey.startsWith('nav-header-') && (
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
                  <AuditLogsView auditLogs={auditLogs} receipts={receipts} />
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
                    initialRoomNumber={initialServiceRequestData?.roomNumber}
                    initialRequestItem={initialServiceRequestData?.item}
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
                    propertySlug={preloadedData.currentProperty?.slug || ''}
                    propertyName={preloadedData.currentProperty?.name || ''}
                  />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'petty_cash' && activeMenuItemKey === 'misc_charges' && (
                <ErrorBoundary section="Misc Charges Management">
                  <MiscChargesManagement onLogAudit={logAudit} />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'telegram' && (
                <div className="space-y-6">
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
                    // Per-property Telegram template customization removed
                    // (26 Aug 2026, explicit request: "no need to have
                    // Telegram Template Permissions block") - its only UI,
                    // WhatsAppTemplateSettings.tsx's toggle card, is gone
                    // from this tab, so the DB column it used to write is now
                    // frozen/unreachable. Hardcoded false to match: Root
                    // Admin (canEditTemplates' unconditional isRootAdmin
                    // branch) manages the shared template set exclusively;
                    // every property's own Admin/Super Admin gets view-only,
                    // same as an "off" toggle always did.
                    templateCustomizationEnabled={false}
                  />
                </div>
              )}

              {!selectedRoomSlugOverride && activeTab === 'licenses' && (
                <ErrorBoundary section="License Management">
                  <LicenseManagement onLogAudit={logAudit} />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'channel_manager' && (
                <ErrorBoundary section="Channel Manager">
                  <ChannelManager onLogAudit={logAudit} />
                </ErrorBoundary>
              )}

              {!selectedRoomSlugOverride && activeTab === 'edit_property' && (
                <ErrorBoundary section="Edit Property">
                  <EditPropertyPage property={preloadedData.currentProperty} onNavigateToRoom={handleNavigateToRoom} />
                </ErrorBoundary>
              )}

              </Suspense>
            </main>
          </div>
        )}

        {/* Global Add Booking Drawer (converted from a centered Modal 21 Aug
            2026 per DESIGN.md's "Flowbite Modals & Drawers Specification" -
            action/creation forms open as a right-side drawer site-wide,
            mirroring the same shell BookingDetailsModal.tsx/
            WalkInTabBillModal.tsx already use rather than a one-off). */}
        <FlowbiteDrawer
          open={isAddBookingModalOpen}
          onClose={() => setIsAddBookingModalOpen(false)}
          position="right"
          className="z-60 w-full sm:max-w-lg md:max-w-xl h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              Add Guest Booking
            </h2>
            <button
              type="button"
              onClick={() => setIsAddBookingModalOpen(false)}
              className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors shrink-0"
              aria-label="Close drawer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <DrawerItems className="flex-1 overflow-y-auto p-4 sm:p-5">
            <GuestManagement
              guests={guests}
              receipts={receipts}
              menu={menu}
              rooms={preloadedData.currentProperty?.rooms || []}
              onAddGuest={async (guest) => {
                await handleAddGuest(guest);
                // Does NOT close here (31 Aug 2026, second pass). Closing
                // inside this wrapper runs BEFORE it resolves - which is
                // BEFORE GuestManagement.tsx's onSubmit gets to its own
                // resetBookingForm()/showToast('Guest booked successfully!')
                // right after awaiting this same call. That's close-then-
                // toast, the exact wrong order, even with no artificial delay
                // in between - removing the earlier 1s setTimeout fixed the
                // latency but silently un-fixed the ordering it was also
                // covering for. onSubmit now calls onClose() itself, right
                // after showToast fires, so the sequence is always toast-
                // triggered-then-close, both immediate, no delay either way.
              }}
              onCheckoutGuest={handleCheckoutGuest}
              onDispatchTelegram={dispatchTelegramAlert}
              activeMenuItemKey="guest_registration"
              isMultiKeyProperty={preloadedData.isMultiKeyProperty}
              selectedRoomSlug={preloadedData.currentRoomSlug}
              onClose={() => setIsAddBookingModalOpen(false)}
              propertyName={preloadedData.currentProperty?.name || ''}
              propertyMapsLink={preloadedData.currentProperty?.google_maps_link || ''}
              propertyPhone={preloadedData.currentProperty?.phone || ''}
              propertyWhatsappTemplate={preloadedData.currentProperty?.whatsapp_voucher_template || ''}
              propertyUpiId={preloadedData.currentProperty?.upi_id || ''}
              propertyUpiQrCodeUrl={preloadedData.currentProperty?.upi_qr_code_url || ''}
            />
          </DrawerItems>
        </FlowbiteDrawer>

        {/* Global Add Expense Drawer Overlay */}
        <FlowbiteDrawer
          open={isAddExpenseModalOpen}
          onClose={() => setIsAddExpenseModalOpen(false)}
          position="right"
          className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Receipt className="w-4 h-4" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
                Add Expense
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsAddExpenseModalOpen(false)}
              className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <Suspense fallback={<TabContentFallback />}>
              <PettyCashManagement
                activeRole={activeRole}
                onDispatchTelegram={dispatchTelegramAlert}
                onlyForm={true}
                onClose={() => setIsAddExpenseModalOpen(false)}
                initialAmount={initialExpenseData?.amount}
                initialDescription={initialExpenseData?.description}
                kitchenModuleEnabled={isModuleEnabled('kitchen')}
              />
            </Suspense>
          </div>
        </FlowbiteDrawer>

        {/* Unauthenticated: show login-only content */}
        {!isAuthenticated && (
          <div className="flex-1" />
        )}

        {showInstallBanner && (
          <div className="fixed top-[72px] right-3 left-3 md:left-auto md:right-6 md:w-96 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xl z-[60] flex items-center gap-4 transition-all duration-300 animate-slide-in">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="app__caption text-xs font-semibold text-slate-900 dark:text-white truncate">Install Ground Code App</h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Use it directly from your desktop or mobile homescreen</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstallApp}
                className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer animate-none"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* iOS / OS-Specific PWA Install Instructions Banner */}
        {showIOSInstallBanner && (
          <div className="fixed top-[72px] right-3 left-3 md:left-auto md:right-6 md:w-96 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xl z-[60] transition-all duration-300 animate-slide-in overflow-hidden">
            <div className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="app__caption text-xs font-bold text-slate-900 dark:text-white">
                  {isIOSDevice ? 'Install App on iPhone / iPad' : 'Install Ground Code App'}
                </h4>

                {isIOSDevice ? (
                  <ol className="mt-2 space-y-1.5">
                    <li className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-semibold flex items-center justify-center border border-blue-500">1</span>
                      <span>
                        Tap <Share className="w-3.5 h-3.5 inline mx-0.5 text-blue-600 dark:text-blue-400 -mt-0.5" /><strong>Share</strong> {isIPadDevice ? 'at the top of Safari' : 'in Safari\'s bottom bar'}
                      </span>
                    </li>
                    <li className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-semibold flex items-center justify-center border border-blue-500">2</span>
                      <span>Scroll down & tap <strong>"Add to Home Screen"</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-0.5 text-blue-600 dark:text-blue-400 -mt-0.5" /></span>
                    </li>
                    <li className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-semibold flex items-center justify-center border border-blue-500">3</span>
                      <span>Tap <strong>"Add"</strong> in the top-right corner</span>
                    </li>
                  </ol>
                ) : (
                  <ol className="mt-2 space-y-1.5">
                    <li className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-semibold flex items-center justify-center border border-blue-500">1</span>
                      <span>Tap <MoreVertical className="w-3.5 h-3.5 inline mx-0.5 text-blue-600 dark:text-blue-400 -mt-0.5" /><strong>3 Dots Menu</strong> in browser top-right</span>
                    </li>
                    <li className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-semibold flex items-center justify-center border border-blue-500">2</span>
                      <span>Tap <strong>"Install App"</strong> or <strong>"Add to Home screen"</strong></span>
                    </li>
                    <li className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-semibold flex items-center justify-center border border-blue-500">3</span>
                      <span>Tap <strong>"Install"</strong> to confirm</span>
                    </li>
                  </ol>
                )}
              </div>
              <button
                onClick={dismissIOSInstallBanner}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer animate-none shrink-0"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <GlobalModal />
        <AIChatWidget
          isOpen={isAIChatOpen}
          onClose={() => setIsAIChatOpen(false)}
          userRole={activeRole}
          propertyName={preloadedData.currentProperty?.name}
          guests={guests}
          staff={staff}
          onNavigate={(tab, itemKey, extraData) => {
            setIsAIChatOpen(false);
            setActiveTab(tab as any);
            if (itemKey) setActiveMenuItemKey(itemKey);
            if (extraData?.staffName) {
              if (itemKey === 'staff_directory_salaries') {
                setInitialEditStaffName(extraData.staffName);
              } else {
                setInitialStaffMealName(extraData.staffName);
              }
            }
            if (extraData?.reqItemName || extraData?.reqQty) {
              setInitialReqData({ itemName: extraData.reqItemName, qty: extraData.reqQty, unit: extraData.reqUnit });
            }
            if (extraData?.addStaffName || extraData?.addStaffPhone || extraData?.addStaffRole || extraData?.addStaffSalary) {
              setInitialAddStaffData({ name: extraData.addStaffName, phone: extraData.addStaffPhone, role: extraData.addStaffRole, salary: extraData.addStaffSalary });
            }
            if (extraData?.newMenuItemName || extraData?.newMenuItemPrice || extraData?.newMenuItemCategory) {
              setInitialNewMenuItemData({ name: extraData.newMenuItemName, price: extraData.newMenuItemPrice, category: extraData.newMenuItemCategory });
            }
          }}
          onOpenAddBooking={() => {
            setIsAIChatOpen(false);
            setIsAddBookingModalOpen(true);
          }}
          onOpenAddExpense={(data) => {
            setInitialExpenseData(data || null);
            setIsAIChatOpen(false);
            setIsAddExpenseModalOpen(true);
          }}
          onOpenTelegramModal={() => {
            setIsAIChatOpen(false);
            setIsTelegramModalOpen(true);
          }}
          onOpenAddServiceRequest={(data) => {
            // Unlike Add Booking/Expense (globally-mounted modals), the New Service Request
            // drawer lives inside ServiceRequestsManagement itself, only mounted when that tab
            // is active - so this has to switch tabs too, same as the staff_meals/edit_staff
            // navigate flow, not just set data and expect a hidden component to react to it.
            setInitialServiceRequestData(data || null);
            setIsAIChatOpen(false);
            setActiveTab('service_requests' as any);
            setActiveMenuItemKey('service_requests');
          }}
        />
        {/* Gated on is_public_demo / demo tenant properties - the public marketing /
            demo walkthrough, mounted on demo properties so visitors and testers can experience the tour. */}
        {Boolean(
          preloadedData.currentProperty?.is_public_demo ||
          (preloadedData.currentProperty as any)?.tenant_is_demo ||
          (preloadedData.currentProperty as any)?.is_demo ||
          preloadedData.currentProperty?.slug === 'demo'
        ) && (
          <Suspense fallback={null}>
            <DemoOnboardingTour
              onStartTrialRequested={() => setIsSelfOnboardingOpen(true)}
              handleNavigateTab={handleNavigateTab}
              onNavigateToRoom={handleNavigateToRoom}
              firstChildRoomSlug={preloadedData.currentProperty?.rooms?.[0]?.slug ?? null}
            />
          </Suspense>
        )}
        <SelfOnboardingWizard
          isOpen={isSelfOnboardingOpen}
          onClose={() => setIsSelfOnboardingOpen(false)}
          onSuccess={(redirectUrl) => {
            setIsSelfOnboardingOpen(false);
            window.location.href = redirectUrl;
          }}
        />
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
              <ServiceRequestProvider>
                <ConfigurationDataProvider>
                  <ToastProvider>
                    <ConfirmDialogProvider>
                      <AppBodyWithData preloadedData={preloadedData} />
                    </ConfirmDialogProvider>
                  </ToastProvider>
                </ConfigurationDataProvider>
              </ServiceRequestProvider>
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

  // This App() component is a separate top-level function from AppBody() above (which has its
  // own copy of this same state for its own login/onboarding branches) - the LoginPage/
  // SelfOnboardingWizard JSX in App()'s isLoginPath/isRootPath branches below referenced this
  // name assuming it was already in scope here, but nothing in App() itself ever declared it,
  // which is a real "Cannot find name" compile error, not a runtime-only issue.
  const [isSelfOnboardingOpen, setIsSelfOnboardingOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' && (window.location.search.includes('onboarding=true') || window.location.hash === '#onboarding');
  });

  // Shared by every RootAdminDashboard/TenantDashboard/PlatformPropertyManagement
  // render call site below (found 21 Aug 2026: this was 5 separately hand-copied
  // inline onLogout={() => {...}} handlers, each doing ONLY
  // setUserSession(null) + clearing the localStorage key - same bug as
  // AuthContext.tsx's logout() had (see router.php's 'logout' case and its
  // comment for the full story): none of the 5 ever called the backend, so
  // the PHP session cookie stayed valid and a plain navigation silently
  // re-authenticated the same admin/tenant user even after "signing out".
  // One shared handler now, not 5 copies to keep in sync.
  const handleAdminLogout = useCallback(() => {
    apiFetch('/php/api/router.php?action=logout', { method: 'POST' }).catch(() => {});
    setUserSession(null);
    localStorage.removeItem('artists_farm_user_session');
  }, []);

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
    // Moved here from LoginPage.tsx itself when it merged with LoginModal (15 Aug
    // 2026) - persistence is a caller concern now, not the shared login form's, since
    // the terminal variant persists its session a completely different way (see
    // AuthContext's login()).
    localStorage.setItem('artists_farm_user_session', JSON.stringify(session));
    setUserSession(session);

    // Redirect based on role if not already on destination route
    if (session.is_platform_admin) {
      if (!isRootDashboardPath) {
        window.location.href = '/root_dashboard/';
      }
    } else if (session.default_tenant_id) {
      if (!resolvedTenant && !isTenantDashboardPath) {
        window.location.href = '/tenant_dashboard/';
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
      return (
        <ErrorBoundary section="Tenant Dashboard Login">
          <ToastProvider>
            <LoginPage variant="management" onLoginSuccess={handleLoginSuccess} />
          </ToastProvider>
        </ErrorBoundary>
      );
    }

    // Determine which tenant ID to show: the one from the URL (resolvedTenant) or the user's default
    const dashboardTenantId = resolvedTenant ? resolvedTenant.id : userSession.default_tenant_id;

    // Security: Only root admin can view other tenants' dashboards
    const isPlatformAdmin = userSession?.is_platform_admin === true;
    if (!isPlatformAdmin && dashboardTenantId !== userSession?.default_tenant_id) {
      return (
        <div className="min-h-screen bg-red-50 dark:bg-red-950 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-800 dark:text-red-300 font-medium">Access Denied: You do not have permission to view this tenant.</p>
            <button onClick={handleAdminLogout} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg">Logout</button>
          </div>
        </div>
      );
    }

    return (
      // TermsAcceptanceModal (rendered inside TenantDashboard) calls useToast() for its
      // "scroll first"/"check the box" prompts - this branch is rendered directly by App(),
      // never through AppWithProviders, so it needs its own ToastProvider the same way the
      // Root Admin dashboard branch below does. Without it that throws "useToast must be
      // used within ToastProvider". The ErrorBoundary is the second half of that lesson:
      // the same gap recurred with useAuth, so a missing provider now degrades to a visible
      // error rather than a blank page.
      <ErrorBoundary section="Tenant Dashboard">
        <ToastProvider>
          <Suspense fallback={<LoadingScreen message="Loading tenant dashboard..." />}>
            <TenantDashboard
              username={userSession.username}
              tenantId={dashboardTenantId}
              tenantInfo={resolvedTenant}
              onLogout={handleAdminLogout}
            />
          </Suspense>
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  // Root admin dashboard path
  if (isRootDashboardPath) {
    // Wait for session to load before checking
    if (!isSessionLoaded) {
      return <LoadingScreen message="Loading session..." />;
    }

    if (!userSession || !userSession.is_platform_admin) {
      return (
        <ErrorBoundary section="Root Admin Login">
          <ToastProvider>
            <LoginPage variant="management" onLoginSuccess={handleLoginSuccess} />
          </ToastProvider>
        </ErrorBoundary>
      );
    }

    return (
      // AccountSettings (rendered inside RootAdminDashboard) calls useToast() for its
      // save/error notifications - this branch is rendered directly by App(), never
      // through AppWithProviders, so it needs its own ToastProvider or that throws
      // "useToast must be used within ToastProvider", blanking the entire page rather
      // than just the Account Settings section. Don't remove these nested providers as
      // redundant; each branch outside AppWithProviders supplies its own.
      <ErrorBoundary section="Root Admin Dashboard">
        <ToastProvider>
          <ConfirmDialogProvider>
            <Suspense fallback={<LoadingScreen message="Loading root admin dashboard..." />}>
              <RootAdminDashboard
                username={userSession.username}
                onLogout={handleAdminLogout}
                activeRole="Root Admin"
              />
            </Suspense>
          </ConfirmDialogProvider>
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  // Platform property management path
  if (isPlatformPropertyManagementPath) {
    // Wait for session to load before checking
    if (!isSessionLoaded) {
      return <LoadingScreen message="Loading session..." />;
    }

    if (!userSession || !userSession.is_platform_admin) {
      return (
        <ErrorBoundary section="Platform Property Management Login">
          <ToastProvider>
            <LoginPage variant="management" onLoginSuccess={handleLoginSuccess} />
          </ToastProvider>
        </ErrorBoundary>
      );
    }

    return (
      <ErrorBoundary section="Platform Property Management">
        <ToastProvider>
          <Suspense fallback={<LoadingScreen message="Loading property management..." />}>
            <PlatformPropertyManagement
              username={userSession.username}
              onLogout={handleAdminLogout}
            />
          </Suspense>
        </ToastProvider>
      </ErrorBoundary>
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
        window.location.href = '/root_dashboard/';
        return <LoadingScreen message="Redirecting to root admin dashboard..." />;
      } else if (userSession.default_tenant_id) {
        return (
          <ErrorBoundary section="Tenant Dashboard">
            <ToastProvider>
              <Suspense fallback={<LoadingScreen message="Loading tenant dashboard..." />}>
                <TenantDashboard
                  username={userSession.username}
                  tenantId={userSession.default_tenant_id}
                  onLogout={handleAdminLogout}
                />
              </Suspense>
            </ToastProvider>
          </ErrorBoundary>
        );
      }
    }
    // Show login form if not logged in
    return (
      <ErrorBoundary section="Management Login">
        <ToastProvider>
          <LoginPage variant="management" onLoginSuccess={handleLoginSuccess} onStartTrial={() => setIsSelfOnboardingOpen(true)} />
          <SelfOnboardingWizard
            isOpen={isSelfOnboardingOpen}
            onClose={() => setIsSelfOnboardingOpen(false)}
            onSuccess={(redirectUrl) => {
              setIsSelfOnboardingOpen(false);
              window.location.href = redirectUrl;
            }}
          />
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  // Root path - show login or platform management
  if (isRootPath) {
    if (!userSession) {
      return (
        <ErrorBoundary section="Root Login">
          <ToastProvider>
            <LoginPage variant="management" onLoginSuccess={handleLoginSuccess} onStartTrial={() => setIsSelfOnboardingOpen(true)} />
            <SelfOnboardingWizard
              isOpen={isSelfOnboardingOpen}
              onClose={() => setIsSelfOnboardingOpen(false)}
              onSuccess={(redirectUrl) => {
                setIsSelfOnboardingOpen(false);
                window.location.href = redirectUrl;
              }}
            />
          </ToastProvider>
        </ErrorBoundary>
      );
    }

    // User is logged in at root - platform admins get exactly one canonical URL
    // for their dashboard (/root_dashboard/), matching the redirect handleLoginSuccess
    // and the /login/ path already use. Rendering it inline here too meant the same
    // content lived at two URLs (bare root AND /root_dashboard/), so bookmarks/links
    // to the bare root silently worked when they shouldn't have been a valid page.
    if (userSession.is_platform_admin) {
      window.location.href = '/root_dashboard/';
      return <LoadingScreen message="Redirecting to root admin dashboard..." />;
    }

    // Tenant manager - render dashboard directly
    if (userSession.default_tenant_id) {
      return (
        <ErrorBoundary section="Tenant Dashboard">
          <ToastProvider>
            <Suspense fallback={<LoadingScreen message="Loading tenant dashboard..." />}>
              <TenantDashboard
                username={userSession.username}
                tenantId={userSession.default_tenant_id}
                onLogout={handleAdminLogout}
              />
            </Suspense>
          </ToastProvider>
        </ErrorBoundary>
      );
    }

    // No access
    return (
      <div className="min-h-screen bg-red-50 dark:bg-red-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-800 dark:text-red-300 font-medium">Access Denied</p>
          <button
            onClick={handleAdminLogout}
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

