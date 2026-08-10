import React, { useState } from 'react';
import {
  Building2,
  UserCheck,
  AlertTriangle,
  Menu,
  Bell,
  CheckCircle2,
  Play,
  Square,
  Utensils,
  Calendar,
  User
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { Guest } from '../types';
import { Button } from './Button';
import { t } from '../i18n/en';

interface HeaderProps {
  onLogout?: () => void;
  onOpenTelegramModal: () => void;
  onOpenDemoModal?: () => void;
  onToggleTestingMode?: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isIconOnly: boolean;
  onToggleIconOnly: () => void;
  currentPropertyColorScheme: string;
  propertyName: string;
  isTestModeActive?: boolean;
  isTestingMode?: boolean;
  onCloseDemoModal?: () => void;
  kitchenModuleEnabled?: boolean;
  isMultiKeyProperty?: boolean;
  guests?: Guest[];
  rooms?: any[];
}

export const Header: React.FC<HeaderProps> = ({
  onLogout: _onLogout,
  onOpenTelegramModal: _onOpenTelegramModal,
  onOpenDemoModal,
  onToggleTestingMode,
  isSidebarOpen: _isSidebarOpen,
  onToggleSidebar,
  isIconOnly,
  onToggleIconOnly,
  currentPropertyColorScheme: _currentPropertyColorScheme,
  propertyName,
  isTestModeActive: _isTestModeActive = false,
  isTestingMode = false,
  onCloseDemoModal: _onCloseDemoModal,
  kitchenModuleEnabled = true,
  isMultiKeyProperty = false,
  guests = [],
  rooms: _rooms = [],
}) => {
  const { activeRole, setActiveRole: _setActiveRole, currentUser, isAuthenticated } = useAuth();
  const { lowStockCount } = useInventoryContext();
  const { orders } = useKitchenContext();
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

  // 2. Bookings logic for MultiKey Property
  const todayGuests = guests.filter((g) => {
    if (g.status === 'CheckedOut') return false;
    const checkin = g.checkinDate?.split(' ')[0] || g.checkinDate?.split('T')[0] || '';
    const checkout = g.expectedCheckout?.split(' ')[0] || g.expectedCheckout?.split('T')[0] || '';
    return checkin === todayStr || checkout === todayStr || (g.status === 'Active');
  });

  const tomorrowGuests = guests.filter((g) => {
    if (g.status === 'CheckedOut') return false;
    const checkin = g.checkinDate?.split(' ')[0] || g.checkinDate?.split('T')[0] || '';
    return checkin === tomorrowStr;
  });

  // Calculate current notification hash to track unread status
  const currentNotificationHash = JSON.stringify({
    kitchen: kitchenDisplayOrders.map((o) => `${o.id}-${o.status}`),
    today: todayGuests.map((g) => `${g.id}-${g.status}`),
    tomorrow: tomorrowGuests.map((g) => g.id),
    lowStock: lowStockCount,
  });

  const hasUnread = currentNotificationHash !== lastSeenHash && (
    (kitchenModuleEnabled && kitchenDisplayOrders.length > 0) ||
    (isMultiKeyProperty && (todayGuests.length > 0 || tomorrowGuests.length > 0)) ||
    lowStockCount > 0
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
    lowStockCount;

  return (
    <header className="pos-main-header fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-2xs h-16 transition-colors">
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
            className="btn-toggle-sidebar p-2 text-gray-600 dark:text-gray-300 rounded-lg hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="pos-logo-container flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--app-primary-600)] text-white flex items-center justify-center shadow-xs font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="block">
              <span className="text-sm font-bold text-gray-700 dark:text-white tracking-tight flex items-center gap-2">
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
          {/* Notification Bell Button */}
          <div className="relative">
            <button
              onClick={handleToggleNotifications}
              title={t('notifications_tooltip', 'Notifications')}
              aria-label={t('view_notifications_aria', 'View notifications')}
              className="btn-notification-bell relative p-2 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {hasUnread && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800 animate-pulse"></span>
              )}
            </button>

            {/* Notifications Popover Dropdown */}
            {showNotificationDropdown && (
              <div className="notifications-popover-dropdown absolute right-0 mt-2 w-88 sm:w-96 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-blue-600" />
                    {t('notifications_label', 'Notifications')}
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                    {totalCount} updates
                  </span>
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700 text-xs">
                  {/* 1. Kitchen Module Orders */}
                  {kitchenModuleEnabled && kitchenDisplayOrders.length > 0 && (
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400">
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
                            className="p-2 rounded-lg bg-gray-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                          >
                            <div className="overflow-hidden">
                              <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                <span>{ord.id}</span>
                                <span className="text-gray-400 font-normal">({ord.roomNumber})</span>
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
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
                      <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400">
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
                              className="p-2 rounded-lg bg-gray-50 dark:bg-slate-700/50 flex items-center justify-between gap-2"
                            >
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                  <User className="w-3 h-3 text-gray-400" />
                                  <span>{guest.guestName}</span>
                                  <span className="text-gray-400 font-normal">({guest.roomNumber})</span>
                                </p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">
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
                              <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                <User className="w-3 h-3 text-purple-500" />
                                <span>{guest.guestName}</span>
                                <span className="text-gray-400 font-normal">({guest.roomNumber})</span>
                              </p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400">
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

                  {/* Low Stock Warnings */}
                  {lowStockCount > 0 && (
                    <div className="p-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 mt-0.5">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">
                          {lowStockCount} Low Inventory Items
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t('low_stock_threshold_description', 'Items reached minimum threshold limit')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Fallback Operating Normally */}
                  {totalCount === 0 && (
                    <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400 flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      <span className="font-semibold">{t('all_systems_normal_label', 'All systems operating normally')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Test Data Button */}
          {onOpenDemoModal && (
            <Button
              variant={isTestingMode ? 'danger' : 'secondary'}
              size="sm"
              onClick={isTestingMode ? onToggleTestingMode : onOpenDemoModal}
              title={isTestingMode ? t('stop_test_mode_tooltip', 'Stop Test Mode') : t('open_test_data_center_tooltip', 'Open Test Data Center')}
              aria-label={t('test_data_center_aria', 'Test Data Center')}
              leftIcon={isTestingMode ? <Square className="w-3.5 h-3.5 fill-current text-white" /> : <Play className="w-3.5 h-3.5 fill-current text-emerald-600" />}
            >
              <span className="hidden sm:inline">{isTestingMode ? t('stop_test_button', 'Stop Test') : t('test_button', 'Test')}</span>
            </Button>
          )}

          {/* User Profile */}
          {isAuthenticated ? (
            <div className="pos-user-profile-badge flex items-center gap-2.5 pl-2 border-l border-gray-200 dark:border-slate-700">
              <img
                src={currentUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"}
                alt={t('user_avatar_alt', 'User Avatar')}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/30"
              />
              <div className="hidden sm:block text-left leading-tight">
                <span className="block text-xs font-bold text-gray-900 dark:text-white">
                  {currentUser?.name || t('staff_label', 'Staff')}
                </span>
                <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                  {activeRole}
                </span>
              </div>
            </div>
          ) : (
            <div className="pos-user-profile-badge flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-slate-700">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              </div>
              <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 font-medium">{t('not_logged_in_label', 'Not logged in')}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

