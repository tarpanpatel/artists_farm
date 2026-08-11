import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { getIconComponent } from '../utils/iconResolver';
import { ChevronDown, ChevronRight, LogOut, Link as LinkIcon } from 'lucide-react';
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
  | 'ical_sync'
  | 'service_requests'
  | 'edit_property';

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
  const { lowStockCount, requisitions } = useInventoryContext();
  const pendingReqCount = requisitions.filter((r) => r.status === 'Pending').length;
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

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

  const { pendingOrdersCount } = useKitchenContext();

  const getBadge = useCallback((uniqueKey: string): { text: string; className: string } | null => {
    if (uniqueKey === 'kitchen_orders' && pendingOrdersCount > 0)
      return { text: `${pendingOrdersCount}`, className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300' };
    if (uniqueKey === 'stock_requests' && pendingReqCount > 0)
      return { text: `${pendingReqCount}`, className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' };
    if (uniqueKey === 'deficit_shortfalls_log' && lowStockCount > 0)
      return { text: `${lowStockCount} low`, className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' };
    return null;
  }, [pendingOrdersCount, pendingReqCount, lowStockCount]);

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

    visible.forEach(item => map.set(item.id, { ...item, children: [] }));

    const kitchenChildKeys = new Set([
      'take_food_order', 'kitchen_orders', 'staff_meals', 'stock_requests',
      'fulfill_stock_req', 'deficit_shortfalls_log', 'stock_log',
      'kitchen_purchases', 'edit_food_menu', 'edit_kitchen_stock'
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
  //
  // SECOND ATTEMPT at this fix (11 Aug 2026) - the first one (10 Aug 2026,
  // commit dd94421) built this exact memo plus a toggleExpand() callback with
  // the right collapse-siblings logic, but the manual click handler below
  // never actually called it (still did a bare .add(node.id), no removal) -
  // so the "fix" was dead code from the moment it was committed, never live.
  // Caught this time because tsc's noUnusedLocals flagged firstTierGroupIds/
  // toggleExpand as unused, which is what an unwired fix looks like to the
  // compiler. This time the accordion logic is inlined directly into the
  // click handler itself (see onClick below) instead of a separate callback,
  // specifically so there's only one place for the wiring to silently drift
  // apart again.
  const firstTierGroupIds = useMemo(() => new Set(tree.map(n => n.id)), [tree]);

  // Auto-expand active top-tier parent group and auto-collapse non-active top-tier parent groups
  useEffect(() => {
    const activeKey = activeMenuItemKey;

    const findOwningTopLevelParentId = (nodes: TreeNode[]): string | null => {
      for (const parentNode of nodes) {
        if (parentNode.children.length > 0) {
          if (parentNode.uniqueKey === activeKey || parentNode.tabKey === activeKey || parentNode.id === activeKey) {
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
        const badge = getBadge(item.uniqueKey || '');
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

  const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedParents.has(node.id);
    const isActive = activeMenuItemKey === (node.uniqueKey || node.tabKey);
    const ItemIcon = getIconComponent(node.iconName);
    const badge = getBadge(node.uniqueKey || '');

    if (hasChildren) {
      const itemKey = node.uniqueKey || node.tabKey;
      return (
        <div key={node.id} className="pt-1">
          <button
            type="button"
            onClick={() => {
              setExpandedParents(prev => {
                const next = new Set(prev);
                if (next.has(node.id)) {
                  next.delete(node.id);
                } else {
                  // Opening a first-tier group collapses every other first-tier group.
                  if (firstTierGroupIds.has(node.id)) {
                    firstTierGroupIds.forEach(otherId => {
                      if (otherId !== node.id) next.delete(otherId);
                    });
                  }
                  next.add(node.id);
                }
                return next;
              });
              handleTabClick({ tabKey: node.tabKey, uniqueKey: itemKey, customUrl: node.customUrl, openInNewTab: node.openInNewTab });
            }}
            className={`w-full flex items-center justify-between ${depth === 0 ? 'p-2.5 text-xs font-semibold' : 'p-2 text-xs font-semibold'} rounded-lg transition-colors cursor-pointer ${
              isActive
                ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-600 dark:text-white font-bold'
                : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <ItemIcon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : depth === 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-500'}`} />
              <span className="truncate">{node.title}</span>
            </div>
            <div className="flex items-center gap-1">
              {badge && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.className}`}>
                  {badge.text}
                </span>
              )}
              {isExpanded ? (
                <ChevronDown className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              ) : (
                <ChevronRight className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              )}
            </div>
          </button>

          {isExpanded && (
            <div className={`${depth === 0 ? 'pl-3 border-l-2 border-slate-100 dark:border-slate-700 ml-3' : 'pl-3 border-l border-amber-200 dark:border-amber-800/50 ml-2'} py-1 space-y-1 my-1`}>
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const iconSize = depth === 0 ? 'w-4 h-4' : 'w-3.5 h-3.5';

    const itemKey = node.uniqueKey || node.tabKey;
    // The URL hash follows urlSlug (regenerated on rename) - itemKey stays the
    // stable routing key everything else here (data-uniquekey, active-state
    // matching, handleTabClick) keys off of, so a rename can't break routing.
    const linkHref = node.customUrl || `#${node.urlSlug || itemKey}`;

    return (
      <a
        key={node.id}
        data-uniquekey={itemKey}
        href={linkHref}
        target={node.openInNewTab ? '_blank' : undefined}
        rel={node.openInNewTab ? 'noopener noreferrer' : undefined}
        onClick={(e) => {
          e.preventDefault();
          handleTabClick({ tabKey: node.tabKey, uniqueKey: itemKey, customUrl: node.customUrl, openInNewTab: node.openInNewTab });
        }}
        className={`w-full flex items-center justify-between no-underline ${depth === 0 ? 'p-2.5 text-xs font-semibold' : depth === 1 ? 'p-2 text-xs font-semibold' : 'p-1.5 text-xs font-medium'} rounded-lg transition-all cursor-pointer ${
          isActive
            ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-600 dark:text-white font-bold'
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <ItemIcon
            className={`${iconSize} shrink-0 ${
              isActive ? 'text-white' : 'text-slate-400 dark:text-slate-400'
            }`}
          />
          <span className="truncate">{node.title}</span>
        </div>
        {badge && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
              isActive ? 'bg-white/20 text-white' : badge.className
            }`}
          >
            {badge.text}
          </span>
        )}
      </a>
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
        className={`relative w-10 h-10 my-0.5 flex items-center justify-center rounded-xl transition-all cursor-pointer group no-underline ${
          isActive
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <ItemIcon className="w-4 h-4" />
        {item.badge && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-800" />
        )}
        <span className="absolute left-14 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-900 rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
          {item.label}
        </span>
      </a>
    );
  };

  return (
    <>
      {isSidebarOpen && (
        <div
          onClick={onCloseSidebar}
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      <aside
        id="mainSidebarNavigationContainer"
        className={`fixed top-0 left-0 z-30 h-screen pt-16 transition-all duration-200 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 ${
          isIconOnly
            ? 'w-16 translate-x-0'
            : isSidebarOpen
            ? 'w-64 translate-x-0'
            : 'w-64 -translate-x-full md:translate-x-0'
        }`}
        aria-label="Sidebar Navigation"
      >
        {isIconOnly ? (
          <div className="h-full py-3 flex flex-col justify-between items-center bg-white dark:bg-slate-800 overflow-y-auto">
            <div className="flex flex-col items-center w-full px-2 gap-1">
              {allFlatItems
                .filter(item => isVisible(item.roles))
                .map((item, i) => renderIconItem(item, i))}
            </div>

            <div className="flex flex-col items-center gap-2 w-full px-2 pb-3 pt-3 border-t border-slate-200 dark:border-slate-700">
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
                className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-slate-800 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="px-3 pb-2 mb-2 border-b border-slate-100 dark:border-slate-700/80 text-xs font-bold text-slate-500 dark:text-slate-400">
                Hello, {currentUser?.name || 'there'}
              </div>


              {tree.map(node => renderNode(node, 0))}

              {customUrlRootItems.length > 0 && (
                <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                  <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">Custom Links</div>
                  {customUrlRootItems.map(item => {
                    const ItemIcon = getIconComponent(item.iconName);
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
                        <span className="truncate">{item.title}</span>
                        {item.openInNewTab && (
                          <LinkIcon className="w-3 h-3 shrink-0 ml-auto text-purple-400 dark:text-purple-500" />
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 mt-auto border-t border-slate-200 dark:border-slate-700">
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
