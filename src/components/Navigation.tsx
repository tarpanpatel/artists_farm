import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Sidebar as FlowbiteSidebar, SidebarItem, SidebarCollapse, SidebarItems, SidebarItemGroup, Badge as FlowbiteBadge } from 'flowbite-react';
import { getIconComponent } from '../utils/iconResolver';
import { ChevronRight, LogOut, Link as LinkIcon, UserRound } from 'lucide-react';
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

const customSidebarTheme = {
  root: {
    base: 'h-full',
    // Keep the same surface, spacing, and scroll treatment as Flowbite's
    // application-ui sidebar; the app only supplies its fixed positioning.
    inner: 'h-full overflow-y-auto overflow-x-hidden bg-white px-3 py-4 dark:bg-gray-800',
  },
};

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
        <SidebarCollapse
          key={node.id}
          icon={ItemIcon as any}
          label={node.title}
          open={isExpanded}
          onClick={handleHeaderClick}
          className="navigation__node-btn cursor-pointer"
        >
          <div className="navigation__subnav">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        </SidebarCollapse>
      );
    }

    return (
      <SidebarItem
        key={node.id}
        data-uniquekey={itemKey}
        href={linkHref}
        {...(node.openInNewTab ? ({ target: '_blank', rel: 'noopener noreferrer' } as any) : {})}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          handleTabClick({ tabKey: node.tabKey, uniqueKey: itemKey, customUrl: node.customUrl, openInNewTab: node.openInNewTab });
        }}
        icon={depth > 0 ? undefined : ItemIcon as any}
        active={isActive}
        className="navigation__leaf-btn cursor-pointer"
      >
        <div className="flex items-center justify-between w-full">
          <span className="truncate">{node.title}</span>
          {badge && (
            <FlowbiteBadge color={isActive ? 'info' : 'gray'} size="xs" className="shrink-0 ml-1.5">
              {badge.text}
            </FlowbiteBadge>
          )}
        </div>
      </SidebarItem>
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
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-semibold shadow-xs [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
        } navigation__icon-btn`}
      >
        <ItemIcon className="w-4 h-4 navigation__icon-svg" />
        {item.badge && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-800 navigation__icon-badge" />
        )}
        <span className="absolute left-14 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-900 rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap navigation__icon-tooltip">
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
          className="navigation__overlay fixed inset-0 z-[55] bg-slate-900/50 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* z-[56]: part of the app-wide z-index scale documented in
          src/index.css above the .fixed.inset-0.z-50 rule - read that
          comment in full before changing this value. Sits above ordinary
          z-50 popovers (StyledSelect's dropdown, etc. - so a freshly-opened
          sidebar always covers one left open behind it) and below real
          page modals (bumped to z-[58] by that same CSS rule) and toasts/
          confirm dialog (z-[9999]/[99999]). */}
      <FlowbiteSidebar
        id="mainSidebarNavigationContainer"
        theme={customSidebarTheme}
        className={`navigation fixed top-0 left-0 h-screen pt-16 z-[56] border-r border-slate-200 transition-all duration-200 bg-white dark:border-slate-700 dark:bg-gray-800 ${
          isIconOnly
            ? 'w-16 translate-x-0'
            : isSidebarOpen
            ? 'w-64 translate-x-0'
            : 'w-64 -translate-x-full md:translate-x-0'
        }`}
        aria-label="Sidebar Navigation"
      >
        {isIconOnly ? (
          <div className="navigation__icon-list min-h-full py-3 px-2 flex flex-col justify-between items-center">
            <div className="navigation__icon-items flex flex-col items-center w-full gap-1">
              {allFlatItems
                .filter(item => isVisible(item.roles))
                .map((item, i) => renderIconItem(item, i))}
            </div>

            <div className="navigation__icon-actions flex flex-col items-center gap-2 w-full pb-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleLogoutClick}
                title="Sign Out Terminal"
                className="navigation__logout-btn w-10 h-10 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
              </button>
              <button
                onClick={onToggleIconOnly}
                title="Expand Navigation Menu"
                className="navigation__toggle-btn w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="navigation__expanded min-h-full flex flex-col justify-between">
            <div className="navigation__expanded-top space-y-1">
              <SidebarItems>
                <SidebarItemGroup>
                  {tree.map(node => renderNode(node, 0))}
                </SidebarItemGroup>
              </SidebarItems>

              {customUrlRootItems.length > 0 && (
                <div className="navigation__custom-links pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                  <div className="navigation__custom-links-header px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Custom Links</div>
                  {customUrlRootItems.map(item => {
                    const ItemIcon = getIconComponent(item.iconName);
                    return (
                      <a
                        key={item.uniqueKey}
                        href={item.customUrl}
                        target={item.openInNewTab ? '_blank' : undefined}
                        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                        onClick={() => { if (window.innerWidth < 768) onCloseSidebar(); }}
                        className="navigation__custom-link w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold rounded-lg transition-all cursor-pointer text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-900 dark:hover:text-purple-100"
                      >
                        <ItemIcon className="w-4.5 h-4.5 shrink-0 text-purple-500 dark:text-purple-400" />
                        <span className="truncate">{item.title}</span>
                        {item.openInNewTab && (
                          <LinkIcon className="w-3.5 h-3.5 shrink-0 ml-auto text-purple-400 dark:text-purple-500" />
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="navigation__logout-section pt-3 mt-auto border-t border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="navigation__user-profile flex items-center gap-2.5 px-1 py-1">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 ring-2 ring-blue-500/30 shrink-0">
                  <UserRound className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {currentUser?.name || 'User'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogoutClick}
                className="navigation__logout-btn w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-all cursor-pointer shadow-2xs"
                style={{ color: '#ff5252' }}
              >
                <LogOut className="w-4.5 h-4.5 text-red-500" />
                <span>Sign Out Terminal</span>
              </button>
            </div>
          </div>
        )}
      </FlowbiteSidebar>
    </>
  );
};
