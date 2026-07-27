import React, { useState } from 'react';
import { getIconComponent } from '../utils/iconResolver';
import {
  LayoutDashboard,
  User,
  CreditCard,
  ShoppingCart,
  Utensils,
  UtensilsCrossed,
  ClipboardList,
  Truck,
  CookingPot,
  UserCheck,
  Receipt,
  TrendingDown,
  Package,
  ShoppingBag,
  AreaChart,
  BarChart3,
  ScrollText,
  BookOpen,
  ShieldAlert,
  Sliders,
  Boxes,
  Layers,
  Link as LinkIcon,
  ShieldCheck,
  Lock,
  DollarSign,
  FileSpreadsheet,
  Activity,
  Send,
  AlertCircle,
  Wallet,
  ChevronDown,
  ChevronRight,
  LogOut,
  Users
} from 'lucide-react';

export type TabType =
  | 'dashboard'
  | 'guests'
  | 'kitchen'
  | 'inventory'
  | 'petty_cash'
  | 'staff'
  | 'analytics'
  | 'audit_logs'
  | 'menu_manager'
  | 'export'
  | 'telegram'
  | 'errors'
  | 'misc_charges'
  | 'custom_css';

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  activeMenuItemKey: string;
  setActiveMenuItemKey: (key: string) => void;
  pendingOrdersCount: number;
  lowStockCount: number;
  pendingReqCount: number;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  onOpenTelegramModal: () => void;
  isIconOnly: boolean;
  onToggleIconOnly: () => void;
  activeRole?: string;
  onLogout?: () => void;
  navItems?: import('../types').NavMenuItem[];
  guests?: import('../types').Guest[];
}

interface NavItem {
  id: TabType;
  uniqueKey: string;
  label: string;
  icon: React.ElementType;
  badge?: string | null;
  badgeClass?: string;
  roles?: string[];
  subCategory?: string;
}

interface NavGroup {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: string | null;
  badgeClass?: string;
  roles?: string[];
  items: NavItem[];
}

interface FlatNavItem {
  id: TabType;
  uniqueKey: string;
  label: string;
  icon: React.ElementType;
  badge?: string | null;
  badgeClass?: string;
  roles?: string[];
  subCategory?: string;
  customUrl?: string;
  openInNewTab?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  activeMenuItemKey,
  setActiveMenuItemKey,
  pendingOrdersCount,
  lowStockCount,
  pendingReqCount,
  isSidebarOpen,
  onCloseSidebar,
  onOpenTelegramModal,
  isIconOnly,
  onToggleIconOnly,
  activeRole = 'Super Admin',
  onLogout,
  navItems = [],
}) => {
  // Collapsible Dropdown States
  const [isAdminControlOpen, setIsAdminControlOpen] = useState(true);
  const [isEditItemsOpen, setIsEditItemsOpen] = useState(true);

  const isVisible = (allowedRoles?: string[]) => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    if (activeRole === 'Super Admin') return true;
    return allowedRoles.includes(activeRole);
  };

  // Convert dynamic navItems from MySQL into FlatNavItems with dynamic icon resolution
  const dynamicFlatNavItems: FlatNavItem[] = (navItems && navItems.length > 0)
    ? navItems
        .filter((item) => item.isVisible)
        .map((item) => ({
          id: (item.tabKey || 'dashboard') as TabType,
          uniqueKey: item.uniqueKey || item.tabKey,
          label: item.title,
          icon: getIconComponent(item.iconName),
          roles: item.roles,
          subCategory: item.category,
          customUrl: (item as any).customUrl || (item as any).custom_url || '',
          openInNewTab: !!(item as any).openInNewTab || !!(item as any).open_in_new_tab,
          badge:
            (item.uniqueKey === 'kitchen_orders' && pendingOrdersCount > 0) ? `${pendingOrdersCount}` :
            (item.uniqueKey === 'stock_requests' && pendingReqCount > 0) ? `${pendingReqCount}` :
            (item.uniqueKey === 'deficit_shortfalls_log' && lowStockCount > 0) ? `${lowStockCount} low` : null,
          badgeClass:
            item.uniqueKey === 'kitchen_orders' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300' :
            item.uniqueKey === 'stock_requests' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' :
            item.uniqueKey === 'deficit_shortfalls_log' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' : undefined,
        }))
    : [];

  const customUrlItems = dynamicFlatNavItems.filter((item) => item.customUrl);

  // Top-level flat items in exact user requested order
  const topFlatItems: FlatNavItem[] = [
    {
      id: 'dashboard',
      uniqueKey: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['Super Admin', 'Admin', 'Manager', 'Staff'],
    },
    {
      id: 'guests',
      uniqueKey: 'guest_registration',
      label: 'Guest Registration',
      icon: User,
      roles: ['Super Admin', 'Admin', 'Manager', 'Staff'],
    },
    {
      id: 'guests',
      uniqueKey: 'billing_checkout',
      label: 'Billing & Checkout',
      icon: CreditCard,
      roles: ['Super Admin', 'Admin', 'Manager', 'Staff'],
    },
    {
      id: 'kitchen',
      uniqueKey: 'take_food_order',
      label: 'Take Food Order',
      icon: ShoppingCart,
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef', 'Staff Kitchen', 'Staff'],
    },
    {
      id: 'kitchen',
      uniqueKey: 'kitchen_orders',
      label: 'Kitchen Orders',
      icon: Utensils,
      badge: pendingOrdersCount > 0 ? `${pendingOrdersCount}` : null,
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef', 'Staff Kitchen', 'Staff'],
    },
    {
      id: 'inventory',
      uniqueKey: 'stock_requests',
      label: 'Stock Requests',
      icon: ClipboardList,
      badge: pendingReqCount > 0 ? `${pendingReqCount}` : null,
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef', 'Staff Kitchen'],
    },
    {
      id: 'inventory',
      uniqueKey: 'fulfill_stock_req',
      label: 'Fulfill Stock Req.',
      icon: Truck,
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef'],
    },
    {
      id: 'kitchen',
      uniqueKey: 'staff_meals',
      label: 'Staff Meals',
      icon: UtensilsCrossed,
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef', 'Staff Kitchen'],
    },
    {
      id: 'staff',
      uniqueKey: 'attendance_calendar',
      label: 'Attendance & Salaries',
      icon: UserCheck,
      roles: ['Super Admin', 'Admin', 'Manager', 'Staff'],
    },
    {
      id: 'petty_cash',
      uniqueKey: 'expenses',
      label: 'Expenses',
      icon: Receipt,
      roles: ['Super Admin', 'Admin', 'Manager'],
    },
    {
      id: 'inventory',
      uniqueKey: 'deficit_shortfalls_log',
      label: 'Deficit Shortfalls Log',
      icon: TrendingDown,
      badge: lowStockCount > 0 ? `${lowStockCount} low` : null,
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef'],
    },
    {
      id: 'inventory',
      uniqueKey: 'stock_log',
      label: 'Stock Log',
      icon: Package,
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef'],
    },
    {
      id: 'inventory',
      uniqueKey: 'kitchen_purchases',
      label: 'Kitchen Purchases',
      icon: ShoppingBag,
      roles: ['Super Admin', 'Admin', 'Manager', 'Chef'],
    },
  ];

  // Admin Control Dropdown Items
  const adminMainItems: FlatNavItem[] = [
    { id: 'analytics', uniqueKey: 'dashboard_analytics', label: 'Dashboard Analytics', icon: AreaChart, roles: ['Super Admin', 'Admin'] },
    { id: 'analytics', uniqueKey: 'purchase_analytics', label: 'Purchase Analytics', icon: BarChart3, roles: ['Super Admin', 'Admin'] },
    { id: 'audit_logs', uniqueKey: 'audit_logs_main', label: 'Audit Logs', icon: ScrollText, roles: ['Super Admin', 'Admin'] },
    { id: 'audit_logs', uniqueKey: 'past_receipts_log', label: 'Past Receipts Log', icon: BookOpen, roles: ['Super Admin', 'Admin'] },
    { id: 'audit_logs', uniqueKey: 'staff_activity_trail', label: 'Staff Activity Trail', icon: ShieldAlert, roles: ['Super Admin', 'Admin'] },
  ];

  // Sub-dropdown: Edit Items Items
  const editItemsGroup: FlatNavItem[] = [
    { id: 'menu_manager', uniqueKey: 'edit_food_menu', label: 'Edit Food Menu', icon: Sliders, roles: ['Super Admin', 'Admin'] },
    { id: 'inventory', uniqueKey: 'edit_kitchen_stock', label: 'Edit Kitchen Stock', icon: Boxes, roles: ['Super Admin', 'Admin'] },
    { id: 'petty_cash', uniqueKey: 'edit_expense_items', label: 'Edit Expense Items', icon: Layers, roles: ['Super Admin', 'Admin'] },
    { id: 'menu_manager', uniqueKey: 'edit_main_menu', label: 'Edit Main Menu', icon: LinkIcon, roles: ['Super Admin', 'Admin'] },
  ];

  // Rest of Admin Control Items after Edit Items
  const adminPostEditItems: FlatNavItem[] = [
    { id: 'staff', uniqueKey: 'staff_permissions', label: 'Staff & Permissions', icon: ShieldCheck, roles: ['Super Admin', 'Admin'] },
    { id: 'audit_logs', uniqueKey: 'login_logs', label: 'Login Logs', icon: Lock, roles: ['Super Admin', 'Admin'] },
    { id: 'petty_cash', uniqueKey: 'misc_charges', label: 'Misc Charges', icon: DollarSign, roles: ['Super Admin', 'Admin'] },
    { id: 'export', uniqueKey: 'data_export_center', label: 'Data Export Center', icon: FileSpreadsheet, roles: ['Super Admin', 'Admin'] },
    { id: 'audit_logs', uniqueKey: 'system_health', label: 'System Health', icon: Activity, roles: ['Super Admin', 'Admin'] },
    { id: 'telegram', uniqueKey: 'telegram', label: 'Telegram', icon: Send, roles: ['Super Admin', 'Admin'] },
    { id: 'errors', uniqueKey: 'errors', label: 'Error Logs', icon: AlertCircle, roles: ['Super Admin', 'Admin'] },
    { id: 'kitchen', uniqueKey: 'beta_recipe_builder', label: 'Beta Recipe Builder', icon: CookingPot, roles: ['Super Admin', 'Admin', 'Chef'] },
  ];

  // Cash Drawer item
  const cashDrawerItem: FlatNavItem = {
    id: 'petty_cash',
    uniqueKey: 'cash_drawer',
    label: 'Cash Drawer',
    icon: Wallet,
    roles: ['Super Admin', 'Admin', 'Manager'],
  };

  const handleTabClick = (item: FlatNavItem) => {
    if (item.customUrl) {
      if (item.openInNewTab) {
        window.open(item.customUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = item.customUrl;
      }
      if (window.innerWidth < 768) {
        onCloseSidebar();
      }
      return;
    }
    setActiveTab(item.id);
    setActiveMenuItemKey(item.uniqueKey);
    if (window.innerWidth < 768) {
      onCloseSidebar();
    }
  };

  const handleLogoutClick = () => {
    if (onLogout) {
      onLogout();
    } else {
      if (confirm('Sign out of Artists Farm Jaipur Terminal?')) {
        window.location.reload();
      }
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={onCloseSidebar}
          className="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="mainSidebarNavigationContainer"
        className={`fixed top-0 left-0 z-30 h-screen pt-16 transition-all duration-200 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 ${
          isIconOnly
            ? 'w-16 translate-x-0'
            : isSidebarOpen
            ? 'w-64 translate-x-0'
            : 'w-64 -translate-x-full md:translate-x-0'
        }`}
        aria-label="Sidebar Navigation"
      >
        {/* ICON-ONLY MINI SIDEBAR MODE */}
        {isIconOnly ? (
          <div className="h-full py-3 flex flex-col justify-between items-center bg-white dark:bg-slate-800 overflow-y-auto">
            <div className="flex flex-col items-center w-full px-2 gap-1">
              {[
                ...topFlatItems,
                ...adminMainItems,
                ...editItemsGroup,
                ...adminPostEditItems,
                cashDrawerItem,
                ...customUrlItems.filter((item) => isVisible(item.roles)),
              ]
                .filter((item) => isVisible(item.roles))
                .map((item, i) => {
                  const ItemIcon = item.icon;
                  const isActive = activeMenuItemKey === item.uniqueKey;
                  return (
                    <button
                      key={`${item.uniqueKey}-${i}`}
                      onClick={() => handleTabClick(item)}
                      title={item.label}
                      aria-label={item.label}
                      className={`relative w-10 h-10 my-0.5 flex items-center justify-center rounded-xl transition-all cursor-pointer group ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <ItemIcon className="w-4 h-4" />
                      {item.badge && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-800" />
                      )}

                      {/* Floating Tooltip Label */}
                      <span className="absolute left-14 px-2.5 py-1 text-xs font-semibold text-white bg-gray-900 dark:bg-slate-900 rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
            </div>

            {/* Bottom Actions in Icon-Only Mode */}
            <div className="flex flex-col items-center gap-2 w-full px-2 pb-3 pt-3 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={handleLogoutClick}
                title="Sign Out Terminal"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
              </button>
              <button
                onClick={onToggleIconOnly}
                title="Expand Navigation Menu"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          /* FULL EXPANDED SIDEBAR MODE */
          <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-slate-800 flex flex-col justify-between">
            <div className="space-y-1">
              {/* Desktop Header Greeting */}
              <div className="px-3 pb-2 mb-2 border-b border-gray-100 dark:border-slate-700/80 text-xs font-bold text-slate-500 dark:text-slate-400">
                Hello, Tarpan
              </div>

              {/* 1. Top Flat Navigation Links */}
              {topFlatItems
                .filter((item) => isVisible(item.roles))
                .map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = activeMenuItemKey === item.uniqueKey;
                  return (
                    <button
                      key={item.uniqueKey}
                      onClick={() => handleTabClick(item)}
                      className={`w-full flex items-center justify-between p-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-600 dark:text-white font-bold'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <ItemIcon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-gray-400 dark:text-gray-400'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                            isActive ? 'bg-white/20 text-white' : item.badgeClass
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}

              {/* 2. Admin Control Dropdown */}
              {isVisible(['Super Admin', 'Admin']) && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAdminControlOpen(!isAdminControlOpen)}
                    className="w-full flex items-center justify-between p-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer text-gray-800 dark:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Admin Control</span>
                    </div>
                    {isAdminControlOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  {/* Submenu for Admin Control */}
                  {isAdminControlOpen && (
                    <div className="pl-3 py-1 space-y-1 border-l-2 border-slate-100 dark:border-slate-700 ml-3 my-1">
                      {adminMainItems
                        .filter((item) => isVisible(item.roles))
                        .map((item) => {
                          const ItemIcon = item.icon;
                          const isActive = activeMenuItemKey === item.uniqueKey;
                          return (
                            <button
                              key={item.uniqueKey}
                              onClick={() => handleTabClick(item)}
                              className={`w-full flex items-center gap-2.5 p-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}

                      {/* Sub-dropdown: Edit Items ▾ */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setIsEditItemsOpen(!isEditItemsOpen)}
                          className="w-full flex items-center justify-between p-2 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Boxes className="w-3.5 h-3.5 text-amber-500" />
                            <span>Edit Items</span>
                          </div>
                          {isEditItemsOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </button>

                        {isEditItemsOpen && (
                          <div className="pl-3 py-1 space-y-1 border-l border-amber-200 dark:border-amber-800/50 ml-2 my-1">
                            {editItemsGroup
                              .filter((item) => isVisible(item.roles))
                              .map((item) => {
                                const ItemIcon = item.icon;
                                const isActive = activeMenuItemKey === item.uniqueKey;
                                return (
                                  <button
                                    key={item.uniqueKey}
                                    onClick={() => handleTabClick(item)}
                                    className={`w-full flex items-center gap-2 p-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                                      isActive
                                        ? 'bg-blue-600 text-white font-bold'
                                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                                    }`}
                                  >
                                    <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </div>

                      {/* Remaining Admin Items */}
                      {adminPostEditItems
                        .filter((item) => isVisible(item.roles))
                        .map((item) => {
                          const ItemIcon = item.icon;
                          const isActive = activeMenuItemKey === item.uniqueKey;
                          return (
                            <button
                              key={item.uniqueKey}
                              onClick={() => handleTabClick(item)}
                              className={`w-full flex items-center gap-2.5 p-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Cash Drawer */}
              {isVisible(cashDrawerItem.roles) && (
                <button
                  key={cashDrawerItem.uniqueKey}
                  onClick={() => handleTabClick(cashDrawerItem)}
                  className={`w-full flex items-center gap-2.5 p-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeMenuItemKey === cashDrawerItem.uniqueKey
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Wallet className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">{cashDrawerItem.label}</span>
                </button>
              )}

              {/* 4. Custom URL Links (from DB) */}
              {customUrlItems.length > 0 && (
                <div className="pt-2 mt-2 border-t border-gray-100 dark:border-slate-700">
                  <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">Custom Links</div>
                  {customUrlItems
                    .filter((item) => isVisible(item.roles))
                    .map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <a
                          key={item.uniqueKey}
                          href={item.customUrl}
                          target={item.openInNewTab ? '_blank' : undefined}
                          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                          onClick={() => { if (window.innerWidth < 768) onCloseSidebar(); }}
                          className="w-full flex items-center gap-2.5 p-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-900 dark:hover:text-purple-100"
                        >
                          <ItemIcon className="w-4 h-4 shrink-0 text-purple-500 dark:text-purple-400" />
                          <span className="truncate">{item.label}</span>
                          {item.openInNewTab && (
                            <LinkIcon className="w-3 h-3 shrink-0 ml-auto text-purple-400 dark:text-purple-500" />
                          )}
                        </a>
                      );
                    })}
                </div>
              )}
            </div>

            {/* 4. Bottom Sign Out Terminal Action (HTML Match) */}
            <div className="pt-4 mt-auto border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={handleLogoutClick}
                className="w-full flex items-center gap-3 p-2.5 text-xs font-bold rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-all cursor-pointer shadow-2xs"
                style={{ color: '#ff5252' }}
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span>Sign Out Terminal</span>
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};



