import React, { useState } from 'react';
import { LayoutDashboard, Users, UtensilsCrossed, Wallet, Menu, Plus, UserPlus, Handshake, Receipt, PackagePlus, X } from 'lucide-react';
import { TabType } from './Navigation';
import { t } from '../i18n/en';

interface MobileBottomNavProps {
  activeTab: TabType;
  onNavigateTab: (tab: TabType, itemKey?: string) => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  kitchenModuleEnabled?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onNavigateTab,
  onToggleSidebar,
  isSidebarOpen,
  kitchenModuleEnabled = true,
}) => {
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);

  const handleNavClick = (tab: TabType, itemKey?: string) => {
    onNavigateTab(tab, itemKey);
    setIsQuickActionOpen(false);
  };

  const navItems = [
    {
      id: 'dashboard',
      label: 'Home',
      icon: LayoutDashboard,
      tab: 'dashboard' as TabType,
      itemKey: 'dashboard',
    },
    {
      id: 'guests',
      label: 'Guests',
      icon: Users,
      tab: 'guests' as TabType,
      itemKey: 'guests',
    },
    {
      id: 'finances',
      label: 'Finances',
      icon: Wallet,
      tab: 'petty_cash' as TabType,
      itemKey: 'petty_cash',
    },
    ...(kitchenModuleEnabled
      ? [
          {
            id: 'kitchen',
            label: 'Kitchen',
            icon: UtensilsCrossed,
            tab: 'kitchen' as TabType,
            itemKey: 'kitchen',
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Quick Action Bottom Sheet Drawer */}
      {isQuickActionOpen && (
        <div className="fixed inset-0 z-[60] md:hidden flex flex-col justify-end">
          <div
            onClick={() => setIsQuickActionOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          />
          <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xl space-y-3 animate-in slide-in-from-bottom duration-200 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {/* Close Button Sitting Outside the Panel */}
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(false)}
              className="absolute -top-11 right-4 p-2 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title={t('close_button', 'Close')}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Drag Handle Indicator */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-1" />

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => handleNavClick('guests', 'guests')}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold text-xs text-left transition-all active:scale-95"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <UserPlus className="w-5 h-5" />
                </div>
                <span>New Guest Check-In</span>
              </button>

              <button
                onClick={() => handleNavClick('petty_cash', 'petty_cash')}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-xs text-left transition-all active:scale-95"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Handshake className="w-5 h-5" />
                </div>
                <span>Record Handover</span>
              </button>

              {kitchenModuleEnabled && (
                <button
                  onClick={() => handleNavClick('kitchen', 'kitchen')}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold text-xs text-left transition-all active:scale-95"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <span>Kitchen Order</span>
                </button>
              )}

              <button
                onClick={() => handleNavClick('inventory', 'inventory')}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-semibold text-xs text-left transition-all active:scale-95"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <span>Inventory & Stock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Docked Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[54] md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-transform duration-200"
      >
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.tab, item.itemKey)}
                className={`flex flex-col items-center justify-center min-w-[54px] py-1 px-2 rounded-xl transition-all active:scale-90 cursor-pointer ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950/60' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] leading-tight mt-0.5">{item.label}</span>
              </button>
            );
          })}

          {/* Center Quick Action Trigger Button */}
          <button
            onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
            aria-label="Open Quick Actions"
            className="flex flex-col items-center justify-center min-w-[54px] py-1 px-2 text-slate-700 dark:text-slate-200 font-medium active:scale-90 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md active:opacity-90">
              <Plus className={`w-5 h-5 transition-transform ${isQuickActionOpen ? 'rotate-45' : ''}`} />
            </div>
            <span className="text-[11px] leading-tight mt-0.5 font-semibold">Action</span>
          </button>

          {/* More / Menu Drawer Toggle */}
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle Full Menu"
            className={`flex flex-col items-center justify-center min-w-[54px] py-1 px-2 rounded-xl transition-all active:scale-90 cursor-pointer ${
              isSidebarOpen
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${isSidebarOpen ? 'bg-blue-50 dark:bg-blue-950/60' : ''}`}>
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[11px] leading-tight mt-0.5">More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
