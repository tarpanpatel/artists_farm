import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Wallet,
  Menu,
  Plus,
  CalendarPlus,
  ChefHat,
  Receipt,
  X
} from './icons/FlowbiteIcons';
import { TabType } from './Navigation';

interface MobileBottomNavProps {
  activeTab: TabType;
  onNavigateTab: (tab: TabType, itemKey?: string) => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  kitchenModuleEnabled?: boolean;
  onOpenAddBooking?: () => void;
  onOpenAddExpense?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onNavigateTab,
  onToggleSidebar,
  isSidebarOpen,
  kitchenModuleEnabled = true,
  onOpenAddBooking,
  onOpenAddExpense,
}) => {
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);

  const handleNavClick = (tab: TabType, itemKey?: string) => {
    onNavigateTab(tab, itemKey);
    setIsQuickActionOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {isQuickActionOpen && (
        <div
          onClick={() => setIsQuickActionOpen(false)}
          // z-59: was z-40 (the "ordinary popover" tier per the z-index
          // scale note in src/index.css), which sat BELOW a mobile cart
          // drawer left open elsewhere (e.g. KitchenManagement's Take Order
          // cart at z-[55]) - tapping the FAB rotated into an "X" (state did
          // toggle) but the sheet rendered invisibly behind the already-open
          // cart. A deliberate tap on this global control should always
          // surface it, so it now joins the z-60/70/100 "secondary modal
          // meant to stack above already-open content" tier documented
          // there (found 20 Aug 2026).
          className="fixed inset-0 z-59 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        />
      )}

      {/* Quick Action Drawer */}
      <div
        className={`fixed left-0 right-0 z-60 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl transition-all duration-300 ease-out transform ${
          isQuickActionOpen
            ? 'bottom-16 translate-y-0 opacity-100'
            : 'bottom-0 translate-y-full opacity-0 pointer-events-none'
        } p-4 max-h-[80vh] overflow-y-auto`}
      >
        {/* Handle bar with Close Button */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
          <button
            type="button"
            onClick={() => setIsQuickActionOpen(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 1. Add Expense */}
          <button
            type="button"
            onClick={() => {
              setIsQuickActionOpen(false);
              if (onOpenAddExpense) {
                onOpenAddExpense();
              } else {
                handleNavClick('petty_cash', 'expenses');
              }
            }}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-slate-900 dark:text-white truncate">Add Expense</span>
            </div>
          </button>

          {/* 2. Add Booking */}
          <button
            type="button"
            onClick={() => {
              setIsQuickActionOpen(false);
              if (onOpenAddBooking) {
                onOpenAddBooking();
              } else {
                handleNavClick('guests', 'guest_registration');
              }
            }}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-slate-900 dark:text-white truncate">Add Booking</span>
            </div>
          </button>

          {/* 3. Add Food Order */}
          <button
            type="button"
            onClick={() => handleNavClick('kitchen', 'take_food_order')}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-slate-900 dark:text-white truncate">Add Food Order</span>
            </div>
          </button>

          {/* 4. View Live Kitchen Order */}
          <button
            type="button"
            onClick={() => handleNavClick('kitchen', 'kitchen_orders')}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-purple-50 hover:bg-purple-100/80 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ChefHat className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-slate-900 dark:text-white truncate">View Live Kitchen Order</span>
            </div>
          </button>
        </div>
      </div>

      {/* Docked Mobile Bottom Navigation Bar - Flowbite Bottom Navigation pattern */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[54] md:hidden h-16 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)] transition-transform duration-200 shadow-lg"
      >
        <div className="grid h-full max-w-lg grid-cols-5 mx-auto font-medium">
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => handleNavClick('dashboard', 'dashboard')}
            className={`inline-flex flex-col items-center justify-center gap-1 px-2 cursor-pointer transition-colors ${
              activeTab === 'dashboard'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className={`text-[10px] leading-tight ${activeTab === 'dashboard' ? 'font-semibold' : 'font-medium'}`}>Home</span>
          </button>

          {/* 2. Guests / Bookings */}
          <button
            type="button"
            onClick={() => handleNavClick('guests', 'guests')}
            className={`inline-flex flex-col items-center justify-center gap-1 px-2 cursor-pointer transition-colors ${
              activeTab === 'guests'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className={`text-[10px] leading-tight ${activeTab === 'guests' ? 'font-semibold' : 'font-medium'}`}>Guests</span>
          </button>

          {/* 3. CENTER: Quick Action Raised Button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
              aria-label="Open Quick Actions"
              className={`inline-flex items-center justify-center w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 transition-all cursor-pointer ${
                isQuickActionOpen ? 'bg-blue-700 ring-4 ring-blue-300 dark:ring-blue-800' : ''
              }`}
            >
              <Plus className={`w-6 h-6 transition-transform duration-200 ${isQuickActionOpen ? 'rotate-45' : ''}`} />
            </button>
          </div>

          {/* 4. Kitchen / Finances */}
          {kitchenModuleEnabled ? (
            <button
              type="button"
              onClick={() => handleNavClick('kitchen', 'take_food_order')}
              className={`inline-flex flex-col items-center justify-center gap-1 px-2 cursor-pointer transition-colors ${
                activeTab === 'kitchen'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
              }`}
            >
              <UtensilsCrossed className="w-5 h-5" />
              <span className={`text-[10px] leading-tight ${activeTab === 'kitchen' ? 'font-semibold' : 'font-medium'}`}>Kitchen</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleNavClick('petty_cash', 'petty_cash')}
              className={`inline-flex flex-col items-center justify-center gap-1 px-2 cursor-pointer transition-colors ${
                activeTab === 'petty_cash'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
              }`}
            >
              <Wallet className="w-5 h-5" />
              <span className={`text-[10px] leading-tight ${activeTab === 'petty_cash' ? 'font-semibold' : 'font-medium'}`}>Finances</span>
            </button>
          )}

          {/* 5. More (Sidebar Toggle) */}
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle Full Menu"
            className={`inline-flex flex-col items-center justify-center gap-1 px-2 cursor-pointer transition-colors ${
              isSidebarOpen
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className={`text-[10px] leading-tight ${isSidebarOpen ? 'font-semibold' : 'font-medium'}`}>More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
