import React, { useState, useEffect, useRef } from 'react';
import { Dropdown, DropdownItem } from 'flowbite-react';
import { Popover } from './Popover';
import {
  Building2,
  AlertTriangle,
  Menu,
  Bell,
  CheckCircle2,
  Utensils,
  Calendar,
  User,
  Smartphone,
  Download,
  ClipboardList,
  RefreshCw,
  ArrowRight,
  Eye,
  Check,
  Home as RoomIcon,
  X
} from './icons/FlowbiteIcons';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useServiceRequestContext } from '../contexts/ServiceRequestContext';
import { Guest } from '../types';
import { GUEST_STATUS_CHECKEDOUT_LEGACY, GUEST_STATUS_CHECKED_OUT } from '../constants/guestStatus';
import { t } from '../i18n';
import { TabType } from './Navigation';

import { getPropertyAndRoomSlugs, fetchIcalCalendarsFromDB, syncAllIcalCalendarsInDB, fulfillServiceRequestInDB } from '../services/api';
import { useToast } from './ToastContext';

interface HeaderProps {
  onLogout?: () => void;
  onOpenTelegramModal: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isIconOnly: boolean;
  onToggleIconOnly: () => void;
  currentPropertyColorScheme: string;
  propertyName: string;
  kitchenModuleEnabled?: boolean;
  isMultiKeyProperty?: boolean;
  guests?: Guest[];
  rooms?: any[];
  // "Install App" icon (12 Aug 2026): App.tsx owns the actual PWA-install
  // state (beforeinstallprompt capture, iOS detection, standalone-mode
  // check) since that has to live above this component's remount cycle -
  // this is just told whether to show the icon and what to do when tapped.
  showInstallIcon?: boolean;
  onInstallIconClick?: () => void;
  onNavigate?: (tab: TabType, itemKey?: string) => void;
  onToggleAIChat?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onLogout: _onLogout,
  onOpenTelegramModal: _onOpenTelegramModal,
  isSidebarOpen: _isSidebarOpen,
  onToggleSidebar,
  isIconOnly,
  onToggleIconOnly,
  currentPropertyColorScheme: _currentPropertyColorScheme,
  propertyName,
  kitchenModuleEnabled = true,
  isMultiKeyProperty = false,
  guests = [],
  rooms: _rooms = [],
  showInstallIcon = false,
  onInstallIconClick,
  onNavigate,
  onToggleAIChat,
}) => {
  const { currentUser, activeRole, setActiveRole } = useAuth();
  // "View site as" (Root Admin only) - a pure frontend preview: it only
  // changes what activeRole-gated UI shows/hides, never the real backend
  // session, so nothing about actual permissions is gained or lost. Gated
  // on the user's REAL role (currentUser.role, untouched by this) rather
  // than the currently-displayed activeRole, so the control stays visible
  // and usable even while previewing as something else - otherwise picking
  // "Staff" would immediately hide the only way back.
  const isRealRootAdmin = (currentUser?.role || '').toLowerCase().replace(/_/g, ' ').trim() === 'root admin';
  const VIEW_AS_ROLES = ['Root Admin', 'Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'];
  const { showToast } = useToast();
  const { lowStockCount, pendingStockRequestsCount } = useInventoryContext();
  const { orders } = useKitchenContext();
  const { pendingRequests, refreshRequests } = useServiceRequestContext();
  const recentServiceRequests = pendingRequests.slice(0, 5);
  const [resolvingRequestId, setResolvingRequestId] = useState<number | null>(null);

  const handleNavigateAndClose = (tab: TabType, itemKey?: string) => {
    setShowNotificationDropdown(false);
    onNavigate?.(tab, itemKey);
  };

  const handleResolveServiceRequest = async (id: number) => {
    setResolvingRequestId(id);
    const fulfilledBy = currentUser?.name || currentUser?.username || 'Staff';
    const ok = await fulfillServiceRequestInDB(id, fulfilledBy);
    setResolvingRequestId(null);
    if (ok) {
      showToast('Service request marked fulfilled', { type: 'success' });
      refreshRequests();
    } else {
      showToast('Failed to update request', { type: 'error' });
    }
  };
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY <= 50) {
        setIsHeaderVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 70) {
        setIsHeaderVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setIsHeaderVisible(true);
      }
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const [lastSeenHash, setLastSeenHash] = useState<string>('');
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const notificationWrapperRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Escape to dismiss (25 Aug 2026, reported live: "No way
  // to close notification when I opened here") - this dropdown previously
  // had no dismiss path at all besides tapping the bell a second time
  // (already non-obvious once open) or clicking a "View" link that
  // navigates away. Same handleClickOutside/handleKeyDown pattern
  // Popover.tsx already uses elsewhere in this app, reused here rather than
  // migrating this whole hand-rolled dropdown onto that shared component.
  useEffect(() => {
    if (!showNotificationDropdown) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (notificationWrapperRef.current && !notificationWrapperRef.current.contains(target)) {
        setShowNotificationDropdown(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNotificationDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotificationDropdown]);

  // Calendar Sync quick-action - only shown once at least one iCal feed
  // exists (any room for a MultiKey property, or the property itself for a
  // single property). Uses the PARENT property slug, not the current room's
  // own slug, so this still reflects "does this property have calendars set
  // up anywhere" even while browsing an individual room page - see
  // fetchIcalCalendarsFromDB's own comment for why that distinction matters.
  const [icalCalendars, setIcalCalendars] = useState<{ id: number; service_name: string }[]>([]);
  const [isSyncingIcal, setIsSyncingIcal] = useState(false);
  const { propertySlug: icalPropertySlug } = getPropertyAndRoomSlugs();

  useEffect(() => {
    fetchIcalCalendarsFromDB(icalPropertySlug).then(setIcalCalendars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icalPropertySlug]);

  const handleSyncAllCalendars = async () => {
    if (icalCalendars.length === 0 || isSyncingIcal) return;
    setIsSyncingIcal(true);
    const { successCount, total } = await syncAllIcalCalendarsInDB(icalPropertySlug, icalCalendars.map((c) => c.id));
    setIsSyncingIcal(false);
    showToast(`Calendar sync complete: ${successCount}/${total} channels synchronized`, {
      type: successCount === total ? 'success' : 'warning',
    });
  };

  // Date strings for today and tomorrow
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  // 1. Kitchen Orders logic
  const activeOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing').slice(0, 5);
  const servedOrders = orders.filter((o) => (o.status as string) === 'Served' || o.status === 'Fulfilled').slice(0, 5);
  const isShowingServed = activeOrders.length === 0 && servedOrders.length > 0;
  const kitchenDisplayOrders = activeOrders.length > 0 ? activeOrders : servedOrders;

  // 2. Bookings logic for MultiKey Property - "Property Bookings / Today &
  // Tomorrow" is meant to be arrivals/departures needing attention today,
  // not the whole in-house roster. The status-based OR clause used to match
  // ANY currently checked-in guest regardless of their actual checkin/
  // checkout date, so a guest on night 4 of a 10-night stay would show up
  // under "Today" for the entire stay.
  const todayGuests = guests.filter((g) => {
    if (g.status === GUEST_STATUS_CHECKEDOUT_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_OUT) return false;
    const checkin = g.checkinDate?.split(' ')[0] || g.checkinDate?.split('T')[0] || '';
    const checkout = g.expectedCheckout?.split(' ')[0] || g.expectedCheckout?.split('T')[0] || '';
    return checkin === todayStr || checkout === todayStr;
  });

  const tomorrowGuests = guests.filter((g) => {
    if (g.status === GUEST_STATUS_CHECKEDOUT_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_OUT) return false;
    const checkin = g.checkinDate?.split(' ')[0] || g.checkinDate?.split('T')[0] || '';
    return checkin === tomorrowStr;
  });

  // Calculate current notification hash to track unread status
  const currentNotificationHash = JSON.stringify({
    kitchen: kitchenDisplayOrders.map((o) => `${o.id}-${o.status}`),
    today: todayGuests.map((g) => `${g.id}-${g.status}`),
    tomorrow: tomorrowGuests.map((g) => g.id),
    lowStock: lowStockCount,
    pendingStockRequests: pendingStockRequestsCount,
    serviceRequests: recentServiceRequests.map((r) => r.id),
  });

  const hasUnread = currentNotificationHash !== lastSeenHash && (
    (kitchenModuleEnabled && kitchenDisplayOrders.length > 0) ||
    (isMultiKeyProperty && (todayGuests.length > 0 || tomorrowGuests.length > 0)) ||
    lowStockCount > 0 ||
    pendingStockRequestsCount > 0 ||
    recentServiceRequests.length > 0
  );

  const handleToggleNotifications = () => {
    const nextState = !showNotificationDropdown;
    setShowNotificationDropdown(nextState);
    if (nextState) {
      setLastSeenHash(currentNotificationHash);
    }
  };

  const totalCount =
    (kitchenModuleEnabled ? kitchenDisplayOrders.length : 0) +
    (isMultiKeyProperty ? todayGuests.length + tomorrowGuests.length : 0) +
    lowStockCount +
    pendingStockRequestsCount +
    recentServiceRequests.length;

  return (
    // z-[57]: part of the app-wide z-index scale documented in
    // src/index.css above the .fixed.inset-0.z-50 rule - read that comment
    // in full before changing this value. Sits above the drawer scrim
    // (z-[55]) and sidebar (z-[56]) so the header stays sharp and its
    // toggle button stays usable while the drawer is open, and below real
    // page modals (bumped to z-[58] by that same CSS rule) and toasts/
    // confirm dialog (z-[9999]/[99999]).
    // h-16 + pt-[env(safe-area-inset-top)] used to fight each other (found 25
    // Aug 2026): with a fixed h-16 total height, the safe-area padding ate
    // into that same 64px instead of adding to it, squeezing the real
    // content (logo/property name/icons) into a sliver a few px tall on a
    // notched/Dynamic-Island phone - it overflowed below the header's own
    // box into the page content underneath. Dormant until today's
    // viewport-fit=cover fix (index.html) made env(safe-area-inset-top)
    // stop evaluating to 0px. h-[calc(4rem+env(...))] grows the box instead
    // of shrinking its content - App.tsx's pt-16/Navigation.tsx's sidebar
    // pt-16 (both sized to clear this exact header) updated to match.
    <header className={`header fixed top-0 left-0 right-0 z-57 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] transition-transform duration-300 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`}>
      <div className="header__inner px-3 py-2.5 lg:px-5 flex items-center justify-between h-full">
        {/* Left Section: Sidebar Toggle + Brand Logo */}
        <div className="header__left flex items-center gap-2">
          {/* Menu Toggle for Collapsible Icon-Only / Expanded Sidebar (Hidden on mobile) */}
          <button
            onClick={() => {
              if (window.innerWidth < 768) {
                onToggleSidebar();
              } else {
                onToggleIconOnly();
              }
            }}
            title={isIconOnly ? t('expand_sidebar_tooltip', 'Expand Sidebar Menu') : t('collapse_sidebar_tooltip', 'Collapse Sidebar Menu')}
            aria-label={t('toggle_sidebar_aria', 'Toggle Sidebar Navigation')}
            className="btn-toggle-sidebar hidden md:flex p-2 text-slate-600 dark:text-slate-300 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="header__logo pos-logo-container flex items-center gap-2.5">
            <div className="header__logo-icon w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs font-semibold">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="header__logo-text block">
              <span className="text-sm font-semibold text-slate-700 dark:text-white tracking-tight">
                {propertyName}
              </span>
            </div>
          </div>
        </div>

        {/* Right Section: Notifications + Dark Mode + Profile Username */}
        <div className="header__right flex items-center gap-2">
          {/* "View site as" (Root Admin only) - minimalistic icon-only
              dropdown, positioned just before Install App. Lit up (blue)
              whenever activeRole isn't the real role, as a quiet reminder
              a preview is active; "Root Admin" in the menu returns to it. */}
          {isRealRootAdmin && (
            <Dropdown
              placement="bottom-end"
              dismissOnClick
              label=""
              className="z-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden text-xs p-1 min-w-40"
              renderTrigger={() => (
                <button
                  title={t('view_site_as_tooltip', 'View site as...')}
                  aria-label={t('view_site_as_aria', 'View site as a specific role')}
                  className={`header__view-as-role relative p-2 rounded-lg transition-colors cursor-pointer ${
                    activeRole !== 'Root Admin'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                      : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Eye className="w-5 h-5" />
                </button>
              )}
            >
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t('view_site_as_label', 'View site as')}
              </div>
              {VIEW_AS_ROLES.map((role) => (
                <DropdownItem
                  key={role}
                  onClick={() => setActiveRole(role)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-md ${
                    activeRole === role
                      ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{role === 'Root Admin' ? t('view_as_my_role_label', 'Root Admin (you)') : role}</span>
                  {activeRole === role && <Check className="w-3.5 h-3.5" />}
                </DropdownItem>
              ))}
            </Dropdown>
          )}

          {/* Install App Button (12 Aug 2026) - persistent affordance to the
              left of the notification bell, only shown when the app isn't
              already installed (see App.tsx's isAppInstalled/
              canShowInstallIcon). Lucide has no single "install app" icon,
              so this merges Smartphone (base) + a small Download badge
              overlaid in the corner - same layered-badge technique the
              notification dot next to it uses. */}
          {showInstallIcon && (
            <Popover
              trigger="hover"
              placement="bottom"
              content={
                <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {t('install_app_tooltip', 'Install App')}
                </div>
              }
            >
              <button
                onClick={onInstallIconClick}
                aria-label={t('install_app_aria', 'Install app on this device')}
                className="header__install-app relative p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <span className="relative inline-flex items-center justify-center w-5 h-5">
                  <Smartphone className="w-5 h-5" />
                  <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-blue-600 flex items-center justify-center ring-2 ring-white dark:ring-slate-800">
                    <Download className="w-2 h-2 text-white" strokeWidth={3} />
                  </span>
                </span>
              </button>
            </Popover>
          )}

          {icalCalendars.length > 0 && (
            <Popover
              trigger="hover"
              placement="bottom"
              content={
                <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {isSyncingIcal ? 'Syncing calendars...' : `Sync ${icalCalendars.length} calendar${icalCalendars.length !== 1 ? 's' : ''}`}
                </div>
              }
            >
              <button
                onClick={handleSyncAllCalendars}
                disabled={isSyncingIcal}
                aria-label="Sync calendars"
                className="header__sync-calendars relative p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-5 h-5 ${isSyncingIcal ? 'animate-spin' : ''}`} />
              </button>
            </Popover>
          )}

          {/* Help & AI Chatbot Button */}
          <button
            type="button"
            onClick={() => onToggleAIChat?.()}
            title={t('help_tooltip', 'Help & AI Assistant')}
            aria-label={t('help_aria', 'Help & AI Assistant')}
            className="btn-header-help appearance-none border-0 relative px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center text-xs font-semibold"
          >
            <span>Help?</span>
          </button>

          {/* Notification Bell Button */}
          <div className="header__notification relative" ref={notificationWrapperRef}>
            <button
              onClick={handleToggleNotifications}
              title={t('notifications_tooltip', 'Notifications')}
              aria-label={t('view_notifications_aria', 'View notifications')}
              aria-expanded={showNotificationDropdown}
              className={`btn-notification-bell relative p-2 rounded-lg transition-colors cursor-pointer ${
                showNotificationDropdown
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                  : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Bell className="w-5 h-5" />
              {hasUnread && (
                <span className="header__notification-dot absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800 animate-pulse"></span>
              )}
            </button>

            {/* Notifications Popover Dropdown.
                Mobile fix (12 Aug 2026): this was `absolute right-0` anchored
                to the small bell-button wrapper above, not the viewport - on
                a phone the bell sits well left of the true screen edge (play
                button/avatar icons after it), so a ~350-384px-wide dropdown
                bled off the LEFT edge of the screen with no way to reach the
                cut-off content. Below sm, switch to viewport-fixed
                positioning (pinned under the header, small side margins)
                instead of anchor-relative.
                top-16 -> top-[calc(4rem+env(safe-area-inset-top))] (25 Aug
                2026): the header this pins itself under grew taller than a
                flat 64px on notched devices (see Header.tsx's own h-* fix
                earlier today) - a stale top-16 here made the dropdown start
                ABOVE the header's real bottom edge, rendering over/covering
                it entirely, including the bell button itself. Reported live
                as "can't see the site header" and, since the covered bell
                was then unreachable to tap again, "no way to close" - now
                also has its own explicit close button and click-outside/
                Escape dismiss (see the effect above) as a real fix for that
                second part, not just a side effect of this position fix. */}
            {showNotificationDropdown && (
              <div className="header__dropdown notifications-popover-dropdown fixed left-2 right-2 top-[calc(4rem+env(safe-area-inset-top,0px))] max-sm:w-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="header__dropdown-header px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                  <span className="header__dropdown-title text-[10px] font-semibold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-blue-600" />
                    {t('notifications_label', 'Notifications')}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="header__dropdown-count text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-semibold px-2 py-0.5 rounded-full">
                      {totalCount} updates
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNotificationDropdown(false)}
                      aria-label={t('close_button', 'Close')}
                      className="header__dropdown-close p-1 -m-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                </div>

                <div className="header__dropdown-body max-h-[calc(100vh-140px)] sm:max-h-[460px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                  {/* 1. Kitchen Module Orders */}
                  {kitchenModuleEnabled && kitchenDisplayOrders.length > 0 && (
                    <div className="header__section header__section--kitchen p-3 space-y-2">
                      <div className="header__section-header flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Utensils className="w-3.5 h-3.5 text-amber-600" />
                          {isShowingServed ? t('recently_served_orders_label', 'Recently Served Orders') : t('live_kitchen_tickets_label', 'Live Kitchen Tickets')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className={`header__section-badge text-[9px] font-semibold px-1.5 py-0.5 rounded ${isShowingServed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'}`}>
                            {isShowingServed ? t('kitchen_served_badge', 'Served') : t('kitchen_active_badge', 'Active')}
                          </span>
                          <button
                            onClick={() => handleNavigateAndClose('kitchen', 'kitchen_orders')}
                            className="text-[9px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer flex items-center gap-0.5"
                          >
                            {t('view_button', 'View')} <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      </div>

                      <div className="header__orders space-y-1.5">
                        {kitchenDisplayOrders.map((ord) => (
                          <div
                            key={ord.id}
                            className="header__order-item p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                          >
                            <div className="header__order-info overflow-hidden">
                              <div className="header__order-id font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>#{ord.id}</span>
                                {ord.roomNumber && <span className="text-slate-400 font-normal">({ord.roomNumber})</span>}
                              </div>
                              <p className="header__order-items text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                              </p>
                            </div>
                            <span
                              className={`header__order-status text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                ord.status === 'Pending'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300'
                                  : ord.status === 'Preparing'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. MultiKey Property Bookings */}
                  {isMultiKeyProperty && (todayGuests.length > 0 || tomorrowGuests.length > 0) && (
                    <div className="header__section header__section--bookings p-3 space-y-2">
                      <div className="header__section-header flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          {t('property_bookings_label', 'Property Bookings')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="header__section-badge text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                            {t('today_tomorrow_badge', 'Today & Tomorrow')}
                          </span>
                          <button
                            onClick={() => handleNavigateAndClose('guests', 'all_bookings')}
                            className="text-[9px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer flex items-center gap-0.5"
                          >
                            {t('view_button', 'View')} <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      </div>

                      <div className="header__guests space-y-1.5">
                        {/* Today Guests */}
                        {todayGuests.map((guest) => {
                          const checkin = guest.checkinDate?.split(' ')[0] || guest.checkinDate?.split('T')[0] || '';
                          const checkout = guest.expectedCheckout?.split(' ')[0] || guest.expectedCheckout?.split('T')[0] || '';
                          let badgeText = t('checked_in_badge', 'Active Stay');
                          let badgeStyle = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                          if (checkin === todayStr) {
                            badgeText = t('checkin_today_badge', 'Check-in Today');
                            badgeStyle = 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300';
                          } else if (checkout === todayStr) {
                            badgeText = t('checkout_today_badge', 'Checkout Today');
                            badgeStyle = 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300';
                          }

                          return (
                            <div
                              key={guest.id}
                              className="header__guest-item header__guest-item--today p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                            >
                              <div className="header__guest-info">
                                <p className="header__guest-name font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span>{guest.guestName}</span>
                                  <span className="text-slate-400 font-normal">({guest.roomNumber})</span>
                                </p>
                                <p className="header__guest-phone text-[10px] text-slate-500 dark:text-slate-400">
                                  Phone: {guest.phoneNumber}
                                </p>
                              </div>
                              <span className={`header__guest-badge text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeStyle}`}>
                                {badgeText}
                              </span>
                            </div>
                          );
                        })}

                        {/* Tomorrow Guests */}
                        {tomorrowGuests.map((guest) => (
                          <div
                            key={guest.id}
                            className="header__guest-item header__guest-item--tomorrow p-2 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 flex items-center justify-between gap-2 border border-purple-100 dark:border-purple-900/30"
                          >
                            <div className="header__guest-info">
                              <p className="header__guest-name font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <User className="w-3 h-3 text-purple-500" />
                                <span>{guest.guestName}</span>
                                <span className="text-slate-400 font-normal">({guest.roomNumber})</span>
                              </p>
                              <p className="header__guest-upcoming text-[10px] text-slate-500 dark:text-slate-400">
                                {t('upcoming_tomorrow_label', 'Upcoming tomorrow')}
                              </p>
                            </div>
                            <span className="header__guest-badge header__guest-badge--tomorrow text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
                              {t('checking_in_tomorrow_badge', 'Checking in Tomorrow')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Service Requests (12 Aug 2026) - last 5 pending, most
                      recent first (get_service_requests already orders by
                      created_at DESC server-side). Shared ServiceRequestContext
                      so marking one fulfilled on the Service Requests page
                      drops it from here immediately. */}
                  {recentServiceRequests.length > 0 && (
                    <div className="header__section header__section--service-requests p-3 space-y-2">
                      <div className="header__section-header flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5 text-indigo-600" />
                          {t('recent_service_requests_label', 'Guest Service Requests')}
                        </span>
                        <span className="header__section-badge text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          {t('pending_status_badge', 'Pending')}
                        </span>
                      </div>

                      <div className="header__service-requests space-y-1.5">
                        {recentServiceRequests.map((r) => (
                          <div
                            key={r.id}
                            className="header__service-request-item p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                          >
                            <div className="header__service-request-info overflow-hidden">
                              <div className="header__service-request-type font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>{r.requestType}</span>
                                <span className="text-slate-400 font-normal flex items-center gap-0.5">
                                  <RoomIcon className="w-2.5 h-2.5" /> {r.roomName}
                                </span>
                              </div>
                              <p className="header__service-request-meta text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {t('requested_by_text', 'Requested by')} {r.requestedBy}
                              </p>
                            </div>
                            <button
                              onClick={() => handleResolveServiceRequest(r.id)}
                              disabled={resolvingRequestId === r.id}
                              className="text-[9px] font-bold px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white cursor-pointer transition-colors shrink-0 inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{resolvingRequestId === r.id ? t('resolving_label', 'Resolving...') : t('resolve_button', 'Resolve')}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending Stock Requests */}
                  {pendingStockRequestsCount > 0 && (
                    <div className="header__stock-requests p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-start gap-2.5">
                      <div className="header__stock-requests-icon p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mt-0.5">
                        <ClipboardList className="w-4 h-4" />
                      </div>
                      <div className="flex-1 flex items-center justify-between gap-2">
                        <div>
                          <p className="header__stock-requests-title text-xs font-semibold text-slate-900 dark:text-white">
                            {pendingStockRequestsCount} Pending Stock Request{pendingStockRequestsCount > 1 ? 's' : ''}
                          </p>
                          <p className="header__stock-requests-desc text-[11px] text-slate-500 dark:text-slate-400">
                            Staff requested material requisitions for kitchen/inventory
                          </p>
                        </div>
                        <button
                          onClick={() => handleNavigateAndClose('kitchen', 'stock_requests')}
                          className="text-[9px] font-bold px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white cursor-pointer transition-colors shrink-0 inline-flex items-center gap-1"
                        >
                          <span>{t('view_button', 'View')}</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Low Stock Warnings */}
                  {lowStockCount > 0 && (
                    <div className="header__low-stock p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-start gap-2.5">
                      <div className="header__low-stock-icon p-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 mt-0.5">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 flex items-center justify-between gap-2">
                        <div>
                          <p className="header__low-stock-title text-xs font-semibold text-slate-900 dark:text-white">
                            {lowStockCount} Low Inventory Items
                          </p>
                          <p className="header__low-stock-desc text-[11px] text-slate-500 dark:text-slate-400">
                            {t('low_stock_threshold_description', 'Items reached minimum threshold limit')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleNavigateAndClose('inventory', 'stock_requests')}
                          className="text-[9px] font-bold px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white cursor-pointer transition-colors shrink-0 inline-flex items-center gap-1"
                        >
                          <span>{t('view_button', 'View')}</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fallback Operating Normally */}
                  {totalCount === 0 && (
                    <div className="header__fallback p-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                      <CheckCircle2 className="header__fallback-icon w-6 h-6 text-emerald-500" />
                      <span className="header__fallback-text font-semibold">{t('all_systems_normal_label', 'All systems operating normally')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* End Top Right Actions */}
        </div>
      </div>
    </header>
  );
};

