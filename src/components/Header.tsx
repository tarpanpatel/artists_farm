import React, { useState } from 'react';
import {
  Building2,
  UserCheck,
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
  Home as RoomIcon
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useServiceRequestContext } from '../contexts/ServiceRequestContext';
import { Guest } from '../types';
import { GUEST_STATUS_CHECKEDOUT_LEGACY, GUEST_STATUS_CHECKED_OUT } from '../constants/guestStatus';
import { t } from '../i18n/en';

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
}) => {
  const { activeRole, setActiveRole: _setActiveRole, currentUser, isAuthenticated } = useAuth();
  const { lowStockCount } = useInventoryContext();
  const { orders } = useKitchenContext();
  const { pendingRequests } = useServiceRequestContext();
  const recentServiceRequests = pendingRequests.slice(0, 5);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [lastSeenHash, setLastSeenHash] = useState<string>('');

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
    serviceRequests: recentServiceRequests.map((r) => r.id),
  });

  const hasUnread = currentNotificationHash !== lastSeenHash && (
    (kitchenModuleEnabled && kitchenDisplayOrders.length > 0) ||
    (isMultiKeyProperty && (todayGuests.length > 0 || tomorrowGuests.length > 0)) ||
    lowStockCount > 0 ||
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
    recentServiceRequests.length;

  return (
    // z-50 -> z-[57] (12 Aug 2026): once the sidebar was moved to start
    // below the header (Navigation.tsx, top-16 instead of top-0) instead of
    // overlapping it, the mobile drawer's backdrop scrim (z-[55], inset-0)
    // started showing consistently across the FULL header instead of being
    // partly masked by the old overlapping sidebar - washing out the whole
    // header (including its own hamburger toggle, now unreadable and
    // effectively unclickable) whenever the drawer is open. Raised above
    // both the scrim (z-[55]) and the sidebar (z-[56]) so the header stays
    // sharp and its toggle button stays usable to close the drawer, while
    // the scrim still dims the actual page content underneath it.
    <header className="pos-main-header fixed top-0 left-0 right-0 z-57 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-2xs h-16 transition-colors">
      <div className="px-3 py-2.5 lg:px-5 flex items-center justify-between h-full">
        {/* Left Section: Sidebar Toggle + Brand Logo */}
        <div className="flex items-center gap-2">
          {/* Menu Toggle for Collapsible Icon-Only / Expanded Sidebar */}
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
            className="btn-toggle-sidebar p-2 text-slate-600 dark:text-slate-300 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="pos-logo-container flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--app-primary-600)] text-white flex items-center justify-center shadow-xs font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-white tracking-tight flex items-center gap-2">
                {propertyName}
                <span className="hidden sm:inline-block bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                  {t('pos_badge', 'POS')}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Right Section: Notifications + Dark Mode + Profile Username */}
        <div className="flex items-center gap-2">
          {/* Install App Button (12 Aug 2026) - persistent affordance to the
              left of the notification bell, only shown when the app isn't
              already installed (see App.tsx's isAppInstalled/
              canShowInstallIcon). Lucide has no single "install app" icon,
              so this merges Smartphone (base) + a small Download badge
              overlaid in the corner - same layered-badge technique the
              notification dot next to it uses. */}
          {showInstallIcon && (
            <button
              onClick={onInstallIconClick}
              title={t('install_app_tooltip', 'Install App')}
              aria-label={t('install_app_aria', 'Install app on this device')}
              className="relative p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <span className="relative inline-flex items-center justify-center w-5 h-5">
                <Smartphone className="w-5 h-5" />
                <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-blue-600 flex items-center justify-center ring-2 ring-white dark:ring-slate-800">
                  <Download className="w-2 h-2 text-white" strokeWidth={3} />
                </span>
              </span>
            </button>
          )}

          {/* Notification Bell Button */}
          <div className="relative">
            <button
              onClick={handleToggleNotifications}
              title={t('notifications_tooltip', 'Notifications')}
              aria-label={t('view_notifications_aria', 'View notifications')}
              className="btn-notification-bell relative p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {hasUnread && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800 animate-pulse"></span>
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
                instead of anchor-relative. */}
            {showNotificationDropdown && (
              <div className="notifications-popover-dropdown fixed left-2 right-2 top-16 max-sm:w-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-blue-600" />
                    {t('notifications_label', 'Notifications')}
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                    {totalCount} updates
                  </span>
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                  {/* 1. Kitchen Module Orders */}
                  {kitchenModuleEnabled && kitchenDisplayOrders.length > 0 && (
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Utensils className="w-3.5 h-3.5 text-amber-600" />
                          {isShowingServed ? t('recently_served_orders_label', 'Recently Served Orders') : t('live_kitchen_tickets_label', 'Live Kitchen Tickets')}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isShowingServed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'}`}>
                          {isShowingServed ? t('kitchen_served_badge', 'Served') : t('kitchen_active_badge', 'Active')}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {kitchenDisplayOrders.map((ord) => (
                          <div
                            key={ord.id}
                            className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                          >
                            <div className="overflow-hidden">
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>{ord.id}</span>
                                <span className="text-slate-400 font-normal">({ord.roomNumber})</span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                              </p>
                            </div>
                            <span
                              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
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
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          {t('property_bookings_label', 'Property Bookings')}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                          {t('today_tomorrow_badge', 'Today & Tomorrow')}
                        </span>
                      </div>

                      <div className="space-y-1.5">
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
                              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                            >
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span>{guest.guestName}</span>
                                  <span className="text-slate-400 font-normal">({guest.roomNumber})</span>
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                  Phone: {guest.phoneNumber}
                                </p>
                              </div>
                              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeStyle}`}>
                                {badgeText}
                              </span>
                            </div>
                          );
                        })}

                        {/* Tomorrow Guests */}
                        {tomorrowGuests.map((guest) => (
                          <div
                            key={guest.id}
                            className="p-2 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 flex items-center justify-between gap-2 border border-purple-100 dark:border-purple-900/30"
                          >
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <User className="w-3 h-3 text-purple-500" />
                                <span>{guest.guestName}</span>
                                <span className="text-slate-400 font-normal">({guest.roomNumber})</span>
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                {t('upcoming_tomorrow_label', 'Upcoming tomorrow')}
                              </p>
                            </div>
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
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
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5 text-indigo-600" />
                          {t('recent_service_requests_label', 'Guest Service Requests')}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          {t('pending_status_badge', 'Pending')}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {recentServiceRequests.map((r) => (
                          <div
                            key={r.id}
                            className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                          >
                            <div className="overflow-hidden">
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>{r.requestType}</span>
                                <span className="text-slate-400 font-normal flex items-center gap-0.5">
                                  <RoomIcon className="w-2.5 h-2.5" /> {r.roomName}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {t('requested_by_text', 'Requested by')} {r.requestedBy}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Low Stock Warnings */}
                  {lowStockCount > 0 && (
                    <div className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 mt-0.5">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {lowStockCount} Low Inventory Items
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('low_stock_threshold_description', 'Items reached minimum threshold limit')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Fallback Operating Normally */}
                  {totalCount === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      <span className="font-semibold">{t('all_systems_normal_label', 'All systems operating normally')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile */}
          {isAuthenticated ? (
            <div className="pos-user-profile-badge flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-700">
              <img
                src={currentUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"}
                alt={t('user_avatar_alt', 'User Avatar')}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/30"
              />
              <div className="hidden sm:block text-left leading-tight">
                <span className="block text-xs font-bold text-slate-900 dark:text-white">
                  {currentUser?.name || t('staff_label', 'Staff')}
                </span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {activeRole}
                </span>
              </div>
            </div>
          ) : (
            <div className="pos-user-profile-badge flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
              <span className="hidden sm:block text-xs text-slate-400 dark:text-slate-500 font-medium">{t('not_logged_in_label', 'Not logged in')}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

