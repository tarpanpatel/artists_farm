import React, { useState } from 'react';
import { LayoutDashboard, Users, UtensilsCrossed, Wallet, Menu, Plus, UserPlus, Handshake, Receipt, PackagePlus, X, Sparkles } from 'lucide-react';
import { Drawer as FlowbiteDrawer, DrawerItems } from 'flowbite-react';
import { TabType } from './Navigation';

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

  return (
    <>
      {/* Flowbite Quick Action Bottom Sheet Drawer */}
      <FlowbiteDrawer
        open={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        position="bottom"
        className="z-[9999] rounded-t-2xl border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5"
      >
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-100 dark:border-gray-700">
          <h5 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Quick Actions
          </h5>
          <button
            type="button"
            onClick={() => setIsQuickActionOpen(false)}
            className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors"
            aria-label="Close quick actions drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <DrawerItems>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleNavClick('guests', 'guests')}
              className="flex items-center gap-3 p-3.5 rounded-lg bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-semibold">New Guest Check-In</span>
                <span className="block text-[10px] text-blue-600/75 dark:text-blue-400/75 font-normal">Add reservation</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('petty_cash', 'petty_cash')}
              className="flex items-center gap-3 p-3.5 rounded-lg bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Handshake className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-semibold">Record Handover</span>
                <span className="block text-[10px] text-emerald-600/75 dark:text-emerald-400/75 font-normal">Petty cash flow</span>
              </div>
            </button>

            {kitchenModuleEnabled && (
              <button
                type="button"
                onClick={() => handleNavClick('kitchen', 'take_food_order')}
                className="flex items-center gap-3 p-3.5 rounded-lg bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <span className="block font-semibold">Kitchen Order</span>
                  <span className="block text-[10px] text-amber-600/75 dark:text-amber-400/75 font-normal">POS food ticket</span>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleNavClick('inventory', 'inventory')}
              className="flex items-center gap-3 p-3.5 rounded-lg bg-purple-50 hover:bg-purple-100/80 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-semibold">Inventory & Stock</span>
                <span className="block text-[10px] text-purple-600/75 dark:text-purple-400/75 font-normal">Stock requisition</span>
              </div>
            </button>
          </div>
        </DrawerItems>
      </FlowbiteDrawer>

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
