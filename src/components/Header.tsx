import React, { useState } from 'react';
import { Building2, UserCheck, Clock, AlertTriangle, Menu, X, Bell, Sun, Moon, CheckCircle2, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';

interface HeaderProps {
  onLogout?: () => void;
  onOpenTelegramModal: () => void;
  onOpenDemoModal?: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isIconOnly: boolean;
  onToggleIconOnly: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  currentPropertyColorScheme: string;
  propertyName: string;
}

export const Header: React.FC<HeaderProps> = ({
  onLogout,
  onOpenTelegramModal,
  onOpenDemoModal,
  isSidebarOpen,
  onToggleSidebar,
  isIconOnly,
  onToggleIconOnly,
  isDarkMode,
  onToggleDarkMode,
  currentPropertyColorScheme,
  propertyName,
}) => {
  const { activeRole, setActiveRole, currentUser, isAuthenticated } = useAuth();
  const { lowStockCount } = useInventoryContext();
  const { pendingOrdersCount } = useKitchenContext();
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);

  const currentTime = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

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
            title={isIconOnly ? "Expand Sidebar Menu" : "Collapse Sidebar Menu"}
            aria-label="Toggle Sidebar Navigation"
            className="btn-toggle-sidebar p-2 text-gray-600 dark:text-gray-300 rounded-lg hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Flowbite Style Logo */}
          <div className="pos-logo-container flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--app-primary-600)] text-white flex items-center justify-center shadow-xs font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="block">
              <span className="text-sm font-bold text-gray-700 dark:text-white tracking-tight flex items-center gap-2">
                {propertyName} {/* Use the propertyName prop here */}
                <span className="hidden sm:inline-block bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                  POS
                </span> {/* This badge still uses hardcoded blue, consider making it dynamic too */}
              </span>
            </div>
          </div>
        </div>

        {/* Right Section: Notifications + Dark Mode + Profile Username */}
        <div className="flex items-center gap-2">

          {/* Flowbite Notification Bell Button */}
          <div className="relative">
            <button
              onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
              title="Notifications"
              aria-label="View notifications"
              className="btn-notification-bell relative p-2 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {(lowStockCount > 0 || pendingOrdersCount > 0) && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800 animate-pulse"></span>
              )}
            </button>

            {/* Notifications Popover Dropdown */}
            {showNotificationDropdown && (
              <div className="notifications-popover-dropdown absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Notifications
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                    {lowStockCount + pendingOrdersCount} new
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
                  {pendingOrdersCount > 0 && (
                    <div className="p-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mt-0.5">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">
                          {pendingOrdersCount} Pending Kitchen Tickets
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Requires chef attention in Kitchen Display system
                        </p>
                      </div>
                    </div>
                  )}
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
                          Items reached minimum threshold limit
                        </p>
                      </div>
                    </div>
                  )}
                  {lowStockCount === 0 && pendingOrdersCount === 0 && (
                    <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400 flex flex-col items-center gap-1">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span>All systems operating normally</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Test Data Button */}
          {onOpenDemoModal && (
            <button
              onClick={onOpenDemoModal}
              title="Open Test Data Center - Generate demo data for testing"
              aria-label="Test Data Center"
              className="btn-test-data px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950/50"
            >
              <span className="text-lg">⚗️</span>
              <span className="hidden sm:inline">Test</span>
            </button>
          )}

          {/* Dark Mode Toggle Button */}
          <button
            onClick={onToggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Dark Mode"
            className="btn-toggle-darkmode p-2 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-gray-600" />}
          </button>


          {/* Flowbite User Profile with Username and Picture Avatar - only shown when authenticated */}
          {isAuthenticated ? (
            <div className="pos-user-profile-badge flex items-center gap-2.5 pl-2 border-l border-gray-200 dark:border-slate-700">
              <img
                src={currentUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"}
                alt="User Avatar"
                className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/30"
              />
              <div className="hidden sm:block text-left leading-tight">
                <span className="block text-xs font-bold text-gray-900 dark:text-white">
                  {currentUser?.name || 'Staff'}
                </span>
                <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                  {activeRole}
                </span>
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Lock & Logout POS"
                  aria-label="Logout POS"
                  className="btn-onlogout-pos ml-1 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="pos-user-profile-badge flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-slate-700">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              </div>
              <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 font-medium">Not logged in</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
