import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { getIconComponent } from '../utils/iconResolver';
import { ChevronRight, ChevronDown, LogOut, Link as LinkIcon, UserRound } from 'lucide-react';
import { NavMenuItem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useConfirm } from './ConfirmDialogContext';
import { isKitchenModuleNavItem } from '../data/appConfig';

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
  | 'misc_charges'
  | 'custom_css'
  | 'service_requests'
  | 'edit_property'
  | 'licenses';

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  activeMenuItemKey: string;
  setActiveMenuItemKey: (key: string) => void;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  onOpenTelegramModal: () => void;
  isIconOnly: boolean;
  onToggleIconOnly: () => void;
  navItems?: NavMenuItem[];
  guests?: import('../types').Guest[];
  isMultiKeyProperty?: boolean;
  multiKeyPropertyId?: number;
  multiKeyPropertyName?: string;
  multiKeyPropertySlug?: string;
  currentRoomSlug?: string | null;
  onNavigateToMultiKeyOverview?: () => void;
  onNavigateToRoom?: (roomSlug: string) => void;
  multiKeyRooms?: any[];
  kitchenModuleEnabled?: boolean;
}

type TreeNode = NavMenuItem & { children: TreeNode[] };

interface FlatNavItem {
  id: string;
  tabKey: string;
  uniqueKey: string;
  urlSlug?: string;
  label: string;
  icon: React.ElementType;
  badge?: string | null;
  badgeClass?: string;
  roles?: string[];
  customUrl?: string;
  openInNewTab?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab: _activeTab,
  setActiveTab,
  activeMenuItemKey,
  setActiveMenuItemKey,
  isSidebarOpen,
  onCloseSidebar,
  onOpenTelegramModal: _onOpenTelegramModal,
  isIconOnly,
  onToggleIconOnly,
  navItems,
  guests: _guests,
  isMultiKeyProperty: _isMultiKeyProperty = false,
  multiKeyPropertyId: _multiKeyPropertyId,
  multiKeyPropertyName: _multiKeyPropertyName,
  multiKeyPropertySlug: _multiKeyPropertySlug,
  currentRoomSlug: _currentRoomSlug,
  onNavigateToMultiKeyOverview: _onNavigateToMultiKeyOverview,
  onNavigateToRoom: _onNavigateToRoom,
  multiKeyRooms: _multiKeyRooms,
  kitchenModuleEnabled = true,
}) => {
  const { activeRole, logout, currentUser } = useAuth();
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // The dimming overlay below used to be gated only by `isSidebarOpen &&`
  // for whether it renders at all, then hidden visually at desktop widths
  // via the CSS class `md:hidden`. Those are two independent signals that
  // can drift apart: isSidebarOpen is only ever set by an explicit
  // hamburger-button toggle (mobile-oriented) and then just sits there -
  // it isn't reset when the viewport later widens back to desktop (e.g.
  // opening DevTools docks a panel and narrows the page below 768px,
  // toggling the sidebar there, then closing DevTools widens it back out
  // without ever unsetting isSidebarOpen). The next time the viewport
  // dips under `md` again for ANY reason, `md:hidden` stops applying and
  // the overlay reappears, dimming real content even though the sidebar
  // is meant to be permanently docked at that width. Tracking the actual
  // breakpoint in JS (matching Tailwind's default `md` = 768px) and using
  // it to gate the overlay's render directly makes this one single source
  // of truth instead of two that can independently go stale.
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Scroll active item into center of sidebar viewport
  useEffect(() => {
    const timer = setTimeout(() => {
      const activeEl = document.querySelector('[data-uniquekey="' + activeMenuItemKey + '"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeMenuItemKey]);

  const isVisible = useCallback((allowedRoles?: string[], itemTabKey?: string, uniqueKey?: string) => {
    // Hide kitchen items if kitchen module is disabled
    if (!kitchenModuleEnabled && isKitchenModuleNavItem({ tabKey: itemTabKey || '', uniqueKey })) {
      return false;
    }

    if (!allowedRoles || allowedRoles.length === 0) return true;
    // Case-insensitive role comparison
    const normalizedActiveRole = activeRole.toLowerCase().trim();
    // Super admin and root admin have access to all menu items
    if (normalizedActiveRole === 'super admin' || normalizedActiveRole === 'root admin') return true;
    return allowedRoles.some(role => role.toLowerCase().trim() === normalizedActiveRole);
  }, [activeRole, kitchenModuleEnabled]);

  const { pendingStockRequestsCount } = useInventoryContext();
  const { pendingOrdersCount } = useKitchenContext();

  const getBadge = useCallback((uniqueKey?: string, title?: string): { text: string; className: string } | null => {
    const normKey = (uniqueKey || '').toLowerCase();
    const normTitle = (title || '').toLowerCase();

    // Food Orders pending badge
    if (
      (normKey === 'kitchen_orders' || normKey === 'take_food_order' || normKey === 'food_orders' || normTitle === 'food orders' || normTitle === 'kitchen orders') &&
      pendingOrdersCount > 0
    ) {
      return {
        text: `${pendingOrdersCount}`,
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
      };
    }

    // Stock Requests pending badge
    if (
      (normKey === 'stock_requests' || normTitle.includes('stock request') || normTitle.includes('stock requisition')) &&
      pendingStockRequestsCount > 0
    ) {
      return {
        text: `${pendingStockRequestsCount}`,
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
      };
    }

    // REMOVED BADGE FROM KITCHEN WASTAGE (deficit_shortfalls_log)
    return null;
  }, [pendingOrdersCount, pendingStockRequestsCount]);

  const buildTree = useCallback((flat: NavMenuItem[]): TreeNode[] => {
    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];
    const visible = [...flat.filter(i => i.isVisible && isVisible(i.roles, i.tabKey, i.uniqueKey))];

    // Ensure root 'nav-kitchen-overview' node exists in tree even if DB hasn't seeded it yet
    let kitchenRoot = visible.find(i => i.id === 'nav-kitchen-overview' || i.uniqueKey === 'kitchen_overview');
    if (!kitchenRoot && kitchenModuleEnabled) {
      const syntheticKitchen: NavMenuItem = {
        id: 'nav-kitchen-overview',
        title: 'Kitchen',
        tabKey: 'kitchen',
        uniqueKey: 'kitchen_overview',
        category: 'Kitchen & Food',
        iconName: 'Utensils',
        order: 10,
        roles: ['Super Admin', 'Admin', 'Staff Kitchen', 'Staff Supervisor', 'Staff'],
        isVisible: true,
        parentId: null,
      };
      visible.push(syntheticKitchen);
      kitchenRoot = syntheticKitchen;
    }

    visible.forEach(item => {
      const lowerTitle = (item.title || '').trim().toLowerCase();
      const uKey = item.uniqueKey || '';
      if (lowerTitle === 'team' || uKey === 'team' || uKey === 'team_overview' || item.id === 'nav-team') {
        item.uniqueKey = 'team_overview';
        item.tabKey = 'staff';
      }
      if (lowerTitle === 'admin control' || uKey === 'admin_control' || uKey === 'admin_control_group' || uKey === 'admin_control_overview' || item.id === 'nav-admin-control' || item.id === 'nav-header-admin') {
        item.uniqueKey = 'admin_control_overview';
        item.tabKey = 'analytics';
      }
      map.set(item.id, { ...item, children: [] });
    });

    const kitchenChildKeys = new Set([
      'take_food_order', 'kitchen_orders', 'staff_meals', 'stock_requests',
      'deficit_shortfalls_log', 'edit_food_menu', 'edit_kitchen_stock'
    ]);

    visible.forEach(item => {
      const node = map.get(item.id)!;
      let effectiveParentId = item.parentId;
      if (!effectiveParentId && kitchenChildKeys.has(item.uniqueKey || '') && item.id !== kitchenRoot!.id) {
        effectiveParentId = kitchenRoot!.id;
      }
      if (effectiveParentId && map.has(effectiveParentId)) {
        map.get(effectiveParentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sortByOrder = (arr: TreeNode[]) => {
      arr.sort((a, b) => a.order - b.order);
      arr.forEach(n => sortByOrder(n.children));
    };
    sortByOrder(roots);
    return roots;
  }, [navItems, isVisible]);

  // Hide Overview and Add Booking (guest_registration) sidebar items as they are merged
  const filteredNavItems = useMemo(() => {
    return navItems.filter(item => item.uniqueKey !== 'overview' && item.uniqueKey !== 'guest_registration');
  }, [navItems]);

  const tree = useMemo(() => buildTree(filteredNavItems), [buildTree, filteredNavItems]);

  // First-tier group ids (top-level sidebar sections) - used to make expansion
  // an accordion at this level only: opening one collapses any other that's
  // open. Nested sub-groups deeper than tier 1 keep independent expand state.
  const firstTierGroupIds = useMemo(() => new Set(tree.map(n => n.id)), [tree]);

  // Auto-expand active top-tier parent group and auto-collapse non-active top-tier parent groups
  useEffect(() => {
    const activeKey = activeMenuItemKey;

    const findOwningTopLevelParentId = (nodes: TreeNode[]): string | null => {
      for (const parentNode of nodes) {
        if (parentNode.children.length > 0) {
          const parentTitle = (parentNode.title || '').trim().toLowerCase();
          const pKey = parentNode.uniqueKey || parentNode.tabKey || '';
          
          if (
            pKey === activeKey ||
            parentNode.id === activeKey ||
            (activeKey === 'team_overview' && (pKey === 'team_overview' || parentTitle === 'team')) ||
            (activeKey === 'admin_control_overview' && (pKey === 'admin_control_overview' || parentTitle === 'admin control'))
          ) {
            return parentNode.id;
          }
          const isDescendant = (children: TreeNode[]): boolean => {
            return children.some(c => (c.uniqueKey === activeKey || c.tabKey === activeKey || c.id === activeKey) || isDescendant(c.children));
          };
          if (isDescendant(parentNode.children)) {
            return parentNode.id;
          }
        }
      }
      return null;
    };

    const activeParentId = findOwningTopLevelParentId(tree);

    setExpandedParents(() => {
      const next = new Set<string>();
      if (activeParentId) {
        next.add(activeParentId);
      }
      return next;
    });
  }, [activeMenuItemKey, tree]);

  const customUrlRootItems = useMemo(() => {
    return filteredNavItems.filter(i => i.isVisible && i.customUrl && !i.parentId && isVisible(i.roles, i.tabKey));
  }, [filteredNavItems, isVisible]);

  const handleTabClick = useCallback((item: { tabKey: string; uniqueKey: string; customUrl?: string; openInNewTab?: boolean }) => {
    if (item.customUrl) {
      if (item.openInNewTab) {
        window.open(item.customUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = item.customUrl;
      }
      if (window.innerWidth < 768) onCloseSidebar();
      return;
    }
    setActiveTab(item.tabKey as TabType);
    setActiveMenuItemKey(item.uniqueKey);
    window.location.hash = `#${item.uniqueKey}`;
    if (window.innerWidth < 768) onCloseSidebar();
  }, [setActiveTab, setActiveMenuItemKey, onCloseSidebar]);

  const { confirm } = useConfirm();

  const handleLogoutClick = useCallback(async () => {
    if (logout) {
      logout();
    } else {
      const confirmed = await confirm({
        title: 'Sign Out',
        message: 'Are you sure you want to sign out?',
        confirmText: 'Sign Out',
        variant: 'danger',
      });
      if (confirmed) {
        window.location.href = '#login';
      }
    }
  }, [logout, confirm]);

  const flattenAllItems = useCallback((nodes: TreeNode[]): FlatNavItem[] => {
    const result: FlatNavItem[] = [];
    const walk = (items: TreeNode[]) => {
      items.forEach(item => {
        const badge = getBadge(item.uniqueKey || '', item.title);
        result.push({
          id: item.tabKey,
          tabKey: item.tabKey,
          uniqueKey: item.uniqueKey || item.tabKey,
          urlSlug: item.urlSlug,
          label: item.title,
          icon: getIconComponent(item.iconName),
          badge: badge?.text || null,
          badgeClass: badge?.className,
          roles: item.roles,
          customUrl: item.customUrl,
          openInNewTab: item.openInNewTab,
        });
        if (item.children.length > 0) walk(item.children);
      });
    };
    walk(nodes);
    return result;
  }, [getBadge]);

  const allFlatItems = useMemo(() => flattenAllItems(tree), [flattenAllItems, tree, filteredNavItems]);

  const renderNode = (node: TreeNode, _depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedParents.has(node.id);
    const isActive = activeMenuItemKey === (node.uniqueKey || node.tabKey);
    const ItemIcon = getIconComponent(node.iconName);
    const badge = getBadge(node.uniqueKey || '', node.title);
    const itemKey = node.uniqueKey || node.tabKey;
    const linkHref = node.customUrl || `#${node.urlSlug || itemKey}`;

    if (hasChildren) {
      const handleHeaderClick = () => {
        setExpandedParents(prev => {
          const next = new Set(prev);
          if (firstTierGroupIds.has(node.id)) {
            firstTierGroupIds.forEach(otherId => {
              if (otherId !== node.id) next.delete(otherId);
            });
          }
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }
          return next;
        });
        handleTabClick({ tabKey: node.tabKey, uniqueKey: itemKey, customUrl: node.customUrl, openInNewTab: node.openInNewTab });
      };

      return (
        <li key={node.id}>
          <button
            type="button"
            onClick={handleHeaderClick}
            aria-controls={`dropdown-${node.id}`}
            className={`flex items-center w-full p-2 text-sm font-medium transition duration-75 rounded-lg group hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
              isExpanded
                ? 'text-blue-600 bg-gray-50 dark:bg-gray-700/60 dark:text-blue-400 font-semibold'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            <ItemIcon
              className={`w-5 h-5 transition duration-75 shrink-0 ${
                isExpanded
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white'
              }`}
            />
            <span className="flex-1 ms-3 text-left rtl:text-right whitespace-nowrap truncate">{node.title}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 shrink-0 ${
                isExpanded ? 'rotate-180 text-blue-600 dark:text-blue-400' : 'text-gray-400'
              }`}
            />
          </button>
          {isExpanded && (
            <ul id={`dropdown-${node.id}`} className="py-2 space-y-1">
              {node.children.map(child => {
                const childActive = activeMenuItemKey === (child.uniqueKey || child.tabKey);
                const childBadge = getBadge(child.uniqueKey || '', child.title);
                const childKey = child.uniqueKey || child.tabKey;
                const childHref = child.customUrl || `#${child.urlSlug || childKey}`;

                return (
                  <li key={child.id}>
                    <a
                      data-uniquekey={childKey}
                      href={childHref}
                      target={child.openInNewTab ? '_blank' : undefined}
                      rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        handleTabClick({ tabKey: child.tabKey, uniqueKey: childKey, customUrl: child.customUrl, openInNewTab: child.openInNewTab });
                      }}
                      className={`flex items-center w-full p-2 text-sm transition duration-75 rounded-lg pl-11 group hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                        childActive
                          ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-blue-400 font-semibold'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      <span className="flex-1 truncate">{child.title}</span>
                      {childBadge && (
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 ms-3 text-xs font-semibold rounded-full ${childBadge.className}`}>
                          {childBadge.text}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      );
    }

    return (
      <li key={node.id}>
        <a
          data-uniquekey={itemKey}
          href={linkHref}
          target={node.openInNewTab ? '_blank' : undefined}
          rel={node.openInNewTab ? 'noopener noreferrer' : undefined}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            handleTabClick({ tabKey: node.tabKey, uniqueKey: itemKey, customUrl: node.customUrl, openInNewTab: node.openInNewTab });
          }}
          className={`flex items-center p-2 text-sm font-medium rounded-lg group transition duration-75 cursor-pointer ${
            isActive
              ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-blue-400 font-semibold'
              : 'text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700'
          }`}
        >
          <ItemIcon
            className={`w-5 h-5 transition duration-75 shrink-0 ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white'
            }`}
          />
          <span className="ms-3 flex-1 whitespace-nowrap truncate">{node.title}</span>
          {badge && (
            <span
              className={`inline-flex items-center justify-center px-2 py-0.5 ms-3 text-xs font-semibold rounded-full ${badge.className}`}
            >
              {badge.text}
            </span>
          )}
        </a>
      </li>
    );
  };

  const renderIconItem = (item: FlatNavItem, i: number) => {
    const ItemIcon = item.icon;
    const isActive = activeMenuItemKey === item.uniqueKey;
    const linkHref = item.customUrl || `#${item.urlSlug || item.uniqueKey}`;
    return (
      <a
        key={`${item.uniqueKey}-${i}`}
        href={linkHref}
        target={item.openInNewTab ? '_blank' : undefined}
        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
        onClick={(e) => {
          e.preventDefault();
          handleTabClick(item);
        }}
        title={item.label}
        aria-label={item.label}
        className={`relative w-10 h-10 my-0.5 flex items-center justify-center rounded-lg transition-all cursor-pointer group no-underline ${
          isActive
            ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-blue-400 font-semibold shadow-xs [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <ItemIcon className="w-5 h-5" />
        {item.badge && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-gray-800" />
        )}
        <span className="absolute left-14 px-2.5 py-1 text-xs font-semibold text-white bg-gray-900 dark:bg-gray-900 rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
          {item.label}
        </span>
      </a>
    );
  };

  return (
    <>
      {isSidebarOpen && !isDesktopViewport && (
        <div
          onClick={onCloseSidebar}
          className="navigation__overlay fixed inset-0 z-[55] bg-gray-900/50 dark:bg-gray-900/80 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Flowbite Sidebar Component */}
      <aside
        id="mainSidebarNavigationContainer"
        aria-label="Sidebar Navigation"
        className={`fixed top-0 left-0 h-screen pt-16 z-[56] border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-200 ${
          isIconOnly
            ? 'w-16 translate-x-0'
            : isSidebarOpen
            ? 'w-64 translate-x-0'
            : 'w-64 -translate-x-full md:translate-x-0'
        }`}
      >
        {isIconOnly ? (
          <div className="h-full py-3 px-2 overflow-y-auto bg-white dark:bg-gray-800 flex flex-col justify-between items-center">
            <ul className="space-y-1 flex flex-col items-center w-full">
              {allFlatItems
                .filter(item => isVisible(item.roles))
                .map((item, i) => (
                  <li key={`${item.uniqueKey}-${i}`} className="w-full flex justify-center">
                    {renderIconItem(item, i)}
                  </li>
                ))}
            </ul>

            <div className="flex flex-col items-center gap-2 w-full pb-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleLogoutClick}
                title="Sign Out Terminal"
                className="w-10 h-10 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onToggleIconOnly}
                title="Expand Navigation Menu"
                className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-gray-800 flex flex-col justify-between">
            <div className="space-y-2">
              <ul className="space-y-1 font-medium">
                {tree.map(node => renderNode(node, 0))}
              </ul>

              {customUrlRootItems.length > 0 && (
                <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
                  <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Custom Links
                  </div>
                  <ul className="space-y-1">
                    {customUrlRootItems.map(item => {
                      const ItemIcon = getIconComponent(item.iconName);
                      return (
                        <li key={item.uniqueKey}>
                          <a
                            href={item.customUrl}
                            target={item.openInNewTab ? '_blank' : undefined}
                            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                            onClick={() => { if (window.innerWidth < 768) onCloseSidebar(); }}
                            className="flex items-center p-2 text-sm font-medium rounded-lg transition duration-75 cursor-pointer text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-900 dark:hover:text-purple-100"
                          >
                            <ItemIcon className="w-5 h-5 shrink-0 text-purple-500 dark:text-purple-400" />
                            <span className="ms-3 flex-1 truncate">{item.title}</span>
                            {item.openInNewTab && (
                              <LinkIcon className="w-4 h-4 shrink-0 ml-auto text-purple-400 dark:text-purple-500" />
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Bottom User Profile & Sign Out */}
            <div className="pt-3 mt-auto border-t border-gray-200 dark:border-gray-700 space-y-2">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 ring-2 ring-blue-500/30 shrink-0">
                  <UserRound className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {currentUser?.name || 'User'}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate capitalize">
                    {activeRole}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogoutClick}
                className="flex items-center w-full p-2 text-sm font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-all cursor-pointer shadow-2xs"
                style={{ color: '#ff5252' }}
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span className="ms-3">Sign Out Terminal</span>
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
