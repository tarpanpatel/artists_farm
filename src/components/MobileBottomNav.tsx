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
  Bell,
  X
} from './icons/FlowbiteIcons';
import { TabType } from './Navigation';

// Which tab buttons / Quick Actions sheet buttons the current role is
// actually allowed to use (23 Aug 2026 - "if something is not accessible to
// a particular role, it should also not be visible"). Computed in App.tsx
// from the same DB-declared nav item `roles` the sidebar already gates on
// (see canSeeNavKey there) and passed down explicitly per the Props
// Threading convention. Defaults here are all-true so this component still
// renders sensibly if a future call site forgets to pass it.
interface MobileBottomNavPermissions {
  home: boolean;
  guests: boolean;
  kitchen: boolean;
  finances: boolean;
  addExpense: boolean;
  addServiceRequest: boolean;
  addBooking: boolean;
  addFoodOrder: boolean;
  viewLiveKitchenOrder: boolean;
}

const DEFAULT_PERMISSIONS: MobileBottomNavPermissions = {
  home: true,
  guests: true,
  kitchen: true,
  finances: true,
  addExpense: true,
  addServiceRequest: true,
  addBooking: true,
  addFoodOrder: true,
  viewLiveKitchenOrder: true,
};

interface MobileBottomNavProps {
  activeTab: TabType;
  onNavigateTab: (tab: TabType, itemKey?: string) => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  kitchenModuleEnabled?: boolean;
  onOpenAddBooking?: () => void;
  onOpenAddExpense?: () => void;
  onOpenAddServiceRequest?: () => void;
  permissions?: MobileBottomNavPermissions;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onNavigateTab,
  onToggleSidebar,
  isSidebarOpen,
  kitchenModuleEnabled = true,
  onOpenAddBooking,
  onOpenAddExpense,
  onOpenAddServiceRequest,
  permissions = DEFAULT_PERMISSIONS,
}) => {
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);

  const handleNavClick = (tab: TabType, itemKey?: string) => {
    onNavigateTab(tab, itemKey);
    setIsQuickActionOpen(false);
  };

  // Hide the raised center FAB entirely if the role can't use a single one
  // of the four Quick Actions it opens - a button that opens an empty sheet
  // fails the same "not accessible => not visible" rule as the sheet's own
  // buttons.
  const hasAnyQuickAction = permissions.addExpense || permissions.addServiceRequest || permissions.addBooking || permissions.viewLiveKitchenOrder;

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
          //
          // Stops above the nav bar, not inset-0 (added 27 Aug 2026, live
          // report: the sheet itself already leaves room for the nav below
          // it, but this backdrop used to cover the FULL viewport at a
          // higher z-index than the nav (z-59 vs the nav's z-[54]) - the nav
          // was still technically there, just dimmed/blurred into
          // invisibility underneath a full-screen 60%-black blurred overlay.
          // Bottom offset matches the nav's own real rendered height exactly
          // (same calc() the nav uses for its safe-area-inset-bottom
          // padding), so the nav stays fully bright AND clickable while this
          // sheet is open, not just technically present under the dimming.
          className="fixed top-0 left-0 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-59 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        />
      )}

      {/* Quick Action Drawer */}
      <div
        className={`fixed left-0 right-0 z-60 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl transition-all duration-300 ease-out transform ${
          isQuickActionOpen
            // bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] (was a flat bottom-16, added 27
            // Aug 2026) - matches the nav's own real height exactly (see its h-[calc(...)] below)
            // instead of assuming a flat 64px, so the gap left for the nav is correct even on a
            // notched/home-indicator device where the nav is taller than 64px.
            ? 'bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] translate-y-0 opacity-100'
            : 'bottom-0 translate-y-full opacity-0 pointer-events-none'
        } px-4 pb-4 pt-1.5 max-h-[80vh] overflow-y-auto`}
      >
        {/* Close Button */}
        <div className="flex items-center justify-end pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
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
          {/* Add Expense (was here originally, removed in 9f8827d7's "UI
              cleanup", restored 31 Aug 2026 on explicit request) */}
          {permissions.addExpense && (
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
          )}

          {/* Add Service Request - no onOpen handler opens the drawer
              directly (it only mounts with the Service Requests tab active),
              so this navigates there where the "New Request" button lives. */}
          {permissions.addServiceRequest && (
            <button
              type="button"
              onClick={() => {
                setIsQuickActionOpen(false);
                if (onOpenAddServiceRequest) {
                  onOpenAddServiceRequest();
                } else {
                  handleNavClick('service_requests', 'service_requests');
                }
              }}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-rose-50 hover:bg-rose-100/80 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="block font-bold text-slate-900 dark:text-white truncate">Add Service Request</span>
              </div>
            </button>
          )}

          {/* Add Booking */}
          {permissions.addBooking && (
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
          )}

          {/* 2. Live Kitchen */}
          {permissions.viewLiveKitchenOrder && (
            <button
              type="button"
              onClick={() => handleNavClick('kitchen', 'kitchen_orders')}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-purple-50 hover:bg-purple-100/80 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ChefHat className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="block font-bold text-slate-900 dark:text-white truncate">Live Kitchen</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Docked Mobile Bottom Navigation Bar - Flowbite Bottom Navigation
          pattern (flowbite's own reference markup is plain h-16 fixed
          bottom-0, no safe-area handling at all - confirmed 25 Aug 2026
          against their source: github.com/themesberg/flowbite/blob/main/
          content/components/bottom-navigation.md - so this project's own
          pb-[env(safe-area-inset-bottom)] addition on top of it was the
          right idea, just wired the same way Header.tsx's top padding was:
          a FIXED h-16 fighting its own safe-area padding, which ate into
          that 64px instead of extending it - squeezing content up and
          leaving the real bottom-inset gap unaccounted for, which is what
          let scrolled page content sit partly behind this nav on a
          notched-bottom (home indicator) device in standalone PWA mode. Same
          fix as Header.tsx: grow the box instead of shrinking its content. */}
      <nav
        data-tour="mobile-bottom-nav"
        aria-label="Mobile Bottom Navigation"
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[54] md:hidden h-[calc(4rem+env(safe-area-inset-bottom,0px))] bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom,0px)] transition-transform duration-200 shadow-lg"
      >
        <div className="grid h-full max-w-lg grid-cols-5 mx-auto font-medium">
          {/* 1. Home */}
          {permissions.home ? (
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
          ) : (
            <div aria-hidden="true" />
          )}

          {/* 2. Guests / Bookings */}
          {permissions.guests ? (
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
          ) : (
            <div aria-hidden="true" />
          )}

          {/* 3. CENTER: Quick Action Raised Button */}
          <div className="flex items-center justify-center">
            {hasAnyQuickAction && (
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
            )}
          </div>

          {/* 4. Kitchen / Finances */}
          {kitchenModuleEnabled && permissions.kitchen ? (
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
          ) : !kitchenModuleEnabled && permissions.finances ? (
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
          ) : (
            <div aria-hidden="true" />
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
