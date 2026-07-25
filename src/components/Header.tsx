import React, { useState } from 'react';
import { Building2, UserCheck, Clock, AlertTriangle, Menu, X, Bell, Sun, Moon, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  activeRole: string;
  setActiveRole: (role: string) => void;
  stockAlertsCount: number;
  pendingOrdersCount: number;
  onOpenTelegramModal: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isIconOnly: boolean;
  onToggleIconOnly: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeRole,
  setActiveRole,
  stockAlertsCount,
  pendingOrdersCount,
  onOpenTelegramModal,
  isSidebarOpen,
  onToggleSidebar,
  isIconOnly,
  onToggleIconOnly,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);

  const currentTime = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-2xs h-16 transition-colors">
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
            className="p-2 text-gray-600 dark:text-gray-300 rounded-lg hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Flowbite Style Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="block">
              <span className="self-center text-base font-extrabold whitespace-nowrap text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                ARTISTS' FARM
                <span className="hidden sm:inline-block bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                  POS
                </span>
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
              className="relative p-2 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {(stockAlertsCount > 0 || pendingOrdersCount > 0) && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800 animate-pulse"></span>
              )}
            </button>

            {/* Notifications Popover Dropdown */}
            {showNotificationDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Notifications
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                    {stockAlertsCount + pendingOrdersCount} new
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
                  {stockAlertsCount > 0 && (
                    <div className="p-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 mt-0.5">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">
                          {stockAlertsCount} Low Inventory Items
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Items reached minimum threshold limit
                        </p>
                      </div>
                    </div>
                  )}
                  {stockAlertsCount === 0 && pendingOrdersCount === 0 && (
                    <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400 flex flex-col items-center gap-1">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span>All systems operating normally</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dark Mode Toggle Button */}
          <button
            onClick={onToggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Dark Mode"
            className="p-2 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-gray-600" />}
          </button>


          {/* Flowbite User Profile with Username and Picture Avatar */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-gray-200 dark:border-slate-700">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
              alt="User Avatar"
              className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/30"
            />
            <div className="hidden sm:block text-left leading-tight">
              <span className="block text-xs font-bold text-gray-900 dark:text-white">
                Tarpan Patel
              </span>
              <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                {activeRole}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};



