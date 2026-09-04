import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { getIconComponent } from '../utils/iconResolver';
import { ChevronRight, ChevronDown, LogOut, LinkIcon, UserRound, Share2, CalendarDays } from './icons/FlowbiteIcons';
import { NavMenuItem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useConfirm } from './ConfirmDialogContext';
import { isKitchenModuleNavItem } from '../data/appConfig';
import { Popover } from './Popover';
import { useToast } from './ToastContext';
import { getPropertySlug } from '../services/api';
import { shareTextContent } from '../utils/shareText';
import { t } from '../i18n/en';

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
  | 'licenses'
  | 'channel_manager'
  | 'connect_channels'
  | 'subscription';

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

// groupOnly (23 Aug 2026): marks a synthetic parent shell created purely so a
// role-visible child keeps its visual grouping when the role can't see the
// real parent item itself - see buildTree()'s comment below. Not a real,
// independently-visitable nav destination for that role.
type TreeNode = NavMenuItem & { children: TreeNode[]; groupOnly?: boolean };

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
  multiKeyPropertyName,
  multiKeyPropertySlug: _multiKeyPropertySlug,
  currentRoomSlug: _currentRoomSlug,
  onNavigateToMultiKeyOverview: _onNavigateToMultiKeyOverview,
  onNavigateToRoom: _onNavigateToRoom,
  multiKeyRooms: _multiKeyRooms,
  kitchenModuleEnabled = true,
}) => {
  const { activeRole, logout, currentUser } = useAuth();
  // Legacy bookmarked/synthetic key that has no nav-tree node of its own -
  // normalize once here so sidebar highlighting agrees with App.tsx's own
  // equivalent `routeKey` normalization in isRouteAllowed() (found 24 Aug
  // 2026: navigating via the old '#attendance_salaries' link correctly
  // opened the right page, but the sidebar never highlighted "Attendance
  // Calendar" or auto-expanded its "Team" parent group, since the real tree
  // node's uniqueKey is 'attendance_calendar' and every comparison below was
  // a strict `===` against the raw, unnormalized prop).
  const normalizedActiveMenuItemKey = activeMenuItemKey === 'attendance_salaries' ? 'attendance_calendar' : activeMenuItemKey;
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const isSuperAdmin = useMemo(() => {
    const roleLower = (activeRole || '').toLowerCase().trim();
    return roleLower === 'super admin' || roleLower === 'root admin';
  }, [activeRole]);

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
      const activeEl = document.querySelector('[data-uniquekey="' + normalizedActiveMenuItemKey + '"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [normalizedActiveMenuItemKey]);

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
    // IMPORTANT (23 Aug 2026, found live via "staff level access is
    // incorrect" report): `!kitchenRoot` alone can't tell "the real row
    // hasn't loaded from the DB yet" (the actual cold-start race this
    // fallback exists for) apart from "the real row loaded fine but
    // correctly excludes the CURRENT role" - `visible` has already been
    // role-filtered above, so a role denied Kitchen access always makes
    // kitchenRoot undefined too. The old code treated both cases the same
    // and unconditionally force-pushed this synthetic node into `visible`
    // regardless of role, silently re-granting Kitchen to every role NavMenuEditor
    // had just correctly denied it to - it never actually reached
    // isVisible() at all. Checking the RAW pre-filter `flat` array (not
    // `visible`) distinguishes the two: if a real kitchen_overview row
    // exists in `flat` at all, the DB has loaded and this fallback must stay
    // out of the way entirely, no matter which role is active.
    const kitchenRootLoadedFromDb = flat.some(i => i.id === 'nav-kitchen-overview' || i.uniqueKey === 'kitchen_overview');
    if (!kitchenRoot && !kitchenRootLoadedFromDb && kitchenModuleEnabled) {
      const syntheticKitchen: NavMenuItem = {
        id: 'nav-kitchen-overview',
        title: 'Kitchen',
        tabKey: 'kitchen',
        uniqueKey: 'kitchen_overview',
        category: 'Kitchen & Food',
        iconName: 'Utensils',
        order: 10,
        // Staff (generic/base role) re-added 24 Aug 2026 - the real DB-seeded
        // kitchen_overview row now grants it too (nav_menu_self_heal_v5,
        // php/kitchen/menu.php: Staff reaches the restricted "Food Orders"
        // child through this same real "Kitchen" parent, not a standalone nav
        // item, so this best-effort placeholder for the still-loading real row
        // needs to agree or Staff would see "Kitchen" flicker in/out during the
        // cold-start data race instead of staying visible throughout).
        roles: ['Super Admin', 'Admin', 'Staff Kitchen', 'Staff Supervisor', 'Staff'],
        isVisible: true,
        parentId: null,
      };
      // Still route this synthetic guess through the real role check below -
      // it's a best-effort placeholder for a still-loading row, not a free
      // pass, so a role this array excludes shouldn't see it either.
      if (isVisible(syntheticKitchen.roles, syntheticKitchen.tabKey, syntheticKitchen.uniqueKey)) {
        visible.push(syntheticKitchen);
        kitchenRoot = syntheticKitchen;
      }
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

    // (23 Aug 2026, reported live: "Attendance Calendar comes out of Team page
    // and becomes a root item" for Staff Supervisor) A child can be visible to
    // a role whose PARENT isn't - Attendance Calendar is visible to Staff
    // Supervisor, but its parent "Team & Access" is Admin/Super-Admin-only.
    // `map` above only contains role-visible items, so the attach loop below
    // used to find `map.has(effectiveParentId)` false and silently promote the
    // orphaned child to root level instead of keeping it grouped. Fix: for any
    // visible child whose real parent isn't in `map`, pull that parent's bare
    // metadata from the FULL, unfiltered `flat` list (deliberately not run
    // through isVisible() for this one lookup - it's not being granted as a
    // destination, just borrowed for its title/icon/category) and add a
    // `groupOnly` shell node so the child still nests visually under "Team &
    // Access" etc. `renderNode()` checks `groupOnly` to make the header
    // expand/collapse only, not navigate - clicking through to the real page
    // would just bounce right back anyway via App.tsx's route guard, but
    // there's no reason to make it look navigable in the first place.
    const groupOnlyIds = new Set<string>();
    visible.forEach(item => {
      if (item.parentId && !map.has(item.parentId)) {
        const parentRaw = flat.find(f => f.id === item.parentId);
        if (parentRaw && !map.has(parentRaw.id)) {
          map.set(parentRaw.id, { ...parentRaw, children: [], groupOnly: true });
          groupOnlyIds.add(parentRaw.id);
        }
      }
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

    // groupOnly shells were never part of `visible`, so the attach loop above
    // never placed them anywhere - thread each one into its own parent (if
    // any, and if that parent happens to be visible/already in `map`) or
    // straight into `roots`, same fallback the real-item loop uses.
    groupOnlyIds.forEach(id => {
      const parentRaw = flat.find(f => f.id === id)!;
      const node = map.get(id)!;
      if (parentRaw.parentId && map.has(parentRaw.parentId)) {
        map.get(parentRaw.parentId)!.children.push(node);
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

  // Hide Overview, Add Booking (guest_registration), and Subscription sidebar items
  const filteredNavItems = useMemo(() => {
    return navItems.filter(
      item =>
        item.uniqueKey !== 'overview' &&
        item.uniqueKey !== 'guest_registration' &&
        item.uniqueKey !== 'subscription' &&
        item.tabKey !== 'subscription'
    );
  }, [navItems]);

  const tree = useMemo(() => buildTree(filteredNavItems), [buildTree, filteredNavItems]);

  // First-tier group ids (top-level sidebar sections) - used to make expansion
  // an accordion at this level only: opening one collapses any other that's
  // open. Nested sub-groups deeper than tier 1 keep independent expand state.
  const firstTierGroupIds = useMemo(() => new Set(tree.map(n => n.id)), [tree]);

  // Auto-expand active top-tier parent group and auto-collapse non-active top-tier parent groups
  useEffect(() => {
    const activeKey = normalizedActiveMenuItemKey;

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
  }, [normalizedActiveMenuItemKey, tree]);

  const customUrlRootItems = useMemo(() => {
    return filteredNavItems.filter(i => i.isVisible && i.customUrl && !i.parentId && isVisible(i.roles, i.tabKey));
  }, [filteredNavItems, isVisible]);

  const handleTabClick = useCallback((item: { tabKey: string; uniqueKey: string; customUrl?: string; openInNewTab?: boolean }, opts?: { keepSidebarOpen?: boolean }) => {
    if (item.customUrl) {
      if (item.openInNewTab) {
        window.open(item.customUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = item.customUrl;
      }
      if (!opts?.keepSidebarOpen && window.innerWidth < 768) onCloseSidebar();
      return;
    }
    setActiveTab(item.tabKey as TabType);
    setActiveMenuItemKey(item.uniqueKey);
    window.location.hash = `#${item.uniqueKey}`;
    if (!opts?.keepSidebarOpen && window.innerWidth < 768) onCloseSidebar();
  }, [setActiveTab, setActiveMenuItemKey, onCloseSidebar]);

  const { confirm } = useConfirm();
  const { showToast } = useToast();

  // "Share Menu" (public food_menu.php link) - moved here from
  // OperationalDashboard.tsx's Dashboard header (25 Aug 2026, explicit
  // request) into the sidebar's "Quick Actions", freeing that header down
  // to a single button so it could go back to always-top-right without
  // recreating the 2-button mobile overlap it was originally part of.
  // multiKeyPropertyName holds preloadedData.currentProperty?.name
  // regardless of whether the property is actually multi-key (see
  // App.tsx's <Navigation> render) - same source OperationalDashboard.tsx's
  // own propertyName prop used, just under this prop's (slightly
  // misleading, multi-key-specific-sounding) name.
  const handleShareFoodMenu = () => {
    const propertySlug = getPropertySlug();
    const menuUrl = `${window.location.origin}/food_menu/${propertySlug}/`;
    const message = `🍽️ Check out the menu at ${multiKeyPropertyName || 'our place'}!\n${menuUrl}`;
    shareTextContent(
      `${multiKeyPropertyName || 'Food'} Menu`,
      message,
      showToast,
      'Menu link copied - paste it wherever you\'d like to share it.',
      'Could not share or copy the menu link.',
    );
    if (window.innerWidth < 768) onCloseSidebar();
  };

  // Public availability page (availability.php) - a "hand this link to a guest
  // so they can see which dates are open" action. Moved here from the
  // dashboard calendar header (4 Sep 2026, explicit request) to sit right
  // below Share Menu in Quick Actions, since the two are the same kind of
  // "share a public link" action.
  const handleShareAvailability = () => {
    const slug = getPropertySlug() || '';
    const url = `${window.location.origin}/availability.php${slug ? `?property_slug=${encodeURIComponent(slug)}` : ''}`;
    window.open(url, '_blank');
    if (window.innerWidth < 768) onCloseSidebar();
  };

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
    const isActive = normalizedActiveMenuItemKey === (node.uniqueKey || node.tabKey);
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
        // groupOnly shells (see buildTree()) aren't a real destination for the
        // current role - expand/collapse only, no navigation.
        if (!node.groupOnly) {
          handleTabClick({ tabKey: node.tabKey, uniqueKey: itemKey, customUrl: node.customUrl, openInNewTab: node.openInNewTab }, { keepSidebarOpen: true });
        }
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
                const childActive = normalizedActiveMenuItemKey === (child.uniqueKey || child.tabKey);
                const childBadge = getBadge(child.uniqueKey || '', child.title);
                const childKey = child.uniqueKey || child.tabKey;
                const childHref = child.customUrl || `#${child.urlSlug || childKey}`;
                const ChildIcon = getIconComponent(child.iconName);

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
                      className={`flex items-center w-full p-2 text-sm transition duration-75 rounded-lg pl-6 group hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                        childActive
                          ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-blue-400 font-semibold'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      <ChildIcon
                        className={`w-4 h-4 me-2.5 transition duration-75 shrink-0 ${
                          childActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white'
                        }`}
                      />
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
    const isActive = normalizedActiveMenuItemKey === item.uniqueKey;
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
        // pt-[calc(4rem+env(safe-area-inset-top))] matches Header.tsx's own
        // height (see that file's 25 Aug 2026 comment) - a static pt-16 was
        // too short to clear the header on a notched device once it grew to
        // fit the safe-area padding it already had.
        className={`fixed top-0 left-0 h-screen pt-[calc(4rem+env(safe-area-inset-top,0px))] z-[56] border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-200 ${
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
                .filter(item => isVisible(item.roles, item.tabKey, item.uniqueKey))
                .map((item, i) => (
                  <li key={`${item.uniqueKey}-${i}`} className="w-full flex justify-center">
                    {renderIconItem(item, i)}
                  </li>
                ))}
            </ul>

            <div className="flex flex-col items-center gap-2 w-full pb-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              {isSuperAdmin && (
                <Popover
                  trigger="hover"
                  placement="right"
                  content={
                    <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {currentUser?.name || 'Owner'} · Tenant Dashboard
                    </div>
                  }
                >
                  <button
                    type="button"
                    aria-label="Open Tenant Dashboard"
                    onClick={() => {
                      window.location.href = '/tenant_dashboard/';
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                  >
                    <UserRound className="w-5 h-5" />
                  </button>
                </Popover>
              )}
              <Popover
                trigger="hover"
                placement="right"
                content={
                  <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    Sign Out
                  </div>
                }
              >
                <button
                  type="button"
                  aria-label="Sign Out"
                  onClick={handleLogoutClick}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </Popover>
              <Popover
                trigger="hover"
                placement="right"
                content={
                  <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    Expand Navigation Menu
                  </div>
                }
              >
                <button
                  type="button"
                  aria-label="Expand Navigation Menu"
                  onClick={onToggleIconOnly}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </Popover>
            </div>
          </div>
        ) : (
          <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-gray-800 flex flex-col justify-between">
            <div className="space-y-2">
              {/* Quick Actions (25 Aug 2026) - "Share Menu" moved here from
                  the Dashboard header, explicit request. Own small section
                  rather than folded into "Custom Links" below - that list
                  is admin-configured URLs from the DB, this is a hardcoded
                  JS action (opens the native share sheet / copies a link),
                  a different kind of item entirely. Room to add more real
                  quick actions here later without another new section.
                  Section heading text removed 3 Sep 2026 (explicit request) -
                  a single un-labeled action reads fine on its own, same as
                  Custom Links below only labels itself when it has entries.
                  Gated on kitchenModuleEnabled 3 Sep 2026 (live bug report:
                  "Share Menu" showed - and worked - for a property with the
                  Kitchen module OFF, because this button never checked it at
                  all, unlike every real Kitchen nav item which already does
                  via isKitchenModuleNavItem() above. Same fix on the actual
                  public page itself - see food_menu.php's isModuleEnabledForProperty
                  gate - this is the "don't even offer the broken action"
                  half of it. */}
              <div className="pb-2 border-b border-gray-200 dark:border-gray-700 space-y-1">
                <ul className="space-y-1">
                  {kitchenModuleEnabled && (
                    <li>
                      <button
                        type="button"
                        onClick={handleShareFoodMenu}
                        className="w-full flex items-center p-2 text-sm font-medium rounded-lg transition duration-75 cursor-pointer text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Share2 className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400" />
                        <span className="ms-3 flex-1 text-left truncate">{t('share_food_menu_button', 'Share Food Menu')}</span>
                      </button>
                    </li>
                  )}
                  {/* Share Availability - moved here from the dashboard calendar
                      header 4 Sep 2026 (explicit request), sits directly below
                      Share Menu. Not gated on any module - every property has a
                      public availability page. */}
                  <li>
                    <button
                      type="button"
                      onClick={handleShareAvailability}
                      className="w-full flex items-center p-2 text-sm font-medium rounded-lg transition duration-75 cursor-pointer text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <CalendarDays className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400" />
                      <span className="ms-3 flex-1 text-left truncate">Share Availability</span>
                    </button>
                  </li>
                </ul>
              </div>

              <ul className="space-y-1 font-medium">
                {/* filteredNavItems.length, not tree.length (2 Sep 2026, user
                    report: sidebar shows only "Kitchen" for a while before the
                    real menu pops in - the "eventually self-corrects" flash
                    this comment used to just live with). buildTree()'s own
                    synthetic-Kitchen placeholder (see its "IMPORTANT" comment,
                    23 Aug 2026) exists specifically so Kitchen doesn't flicker
                    away during this same cold-start window - but that meant
                    `tree` was NEVER actually empty during the wait (it always
                    held that one synthetic node), so this skeleton branch
                    could never fire; real navItems arriving replaced the
                    synthetic tree with the full one, which is exactly the
                    "only Kitchen, then the whole sidebar" flash reported.
                    filteredNavItems reads the raw navItems prop before
                    buildTree runs, so it's actually empty for that whole
                    window regardless of the synthetic node - the skeleton (or
                    the synthetic Kitchen shortcut inside it below) shows for
                    the real cold-start duration instead. */}
                {filteredNavItems.length === 0 ? (
                  <div className="space-y-2 py-2 px-1 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-100 dark:bg-gray-700/40">
                        <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-600 shrink-0" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-28" />
                      </div>
                    ))}
                  </div>
                ) : (
                  tree.map(node => renderNode(node, 0))
                )}
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
              <div
                {...(isSuperAdmin
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => {
                        window.location.href = '/tenant_dashboard/';
                      },
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          window.location.href = '/tenant_dashboard/';
                        }
                      },
                      title: 'Open Tenant Dashboard',
                    }
                  : {})}
                className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                  isSuperAdmin
                    ? 'bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer shadow-2xs group'
                    : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent cursor-default'
                }`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 ring-2 ring-blue-500/30 shrink-0">
                  <UserRound className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center justify-between">
                    <span>{currentUser?.name || 'User'}</span>
                    {isSuperAdmin && (
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors shrink-0" />
                    )}
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
                <span className="ms-3">{t('sign_out_terminal_button', 'Sign Out')}</span>
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
