import React, { useState } from 'react';
import { Drawer } from 'flowbite-react';
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

// Overrides the backdrop's z-index/reach and the bottom position's offset (27 Aug 2026 -
// previously a fully hand-rolled sheet, not flowbite-react's own <Drawer>, per user report:
// "not in alignment with flowbite" - see https://github.com/themesberg/flowbite/blob/main/
// content/components/drawer.md). Three things the real <Drawer> doesn't support out of the
// box, all needed to keep this sheet behaving exactly as intended:
// - backdrop z-index: rendered by <Drawer> straight from this theme value, never merged with
//   the `className` prop, so its z-index can't be bumped the way the panel's can. Needs to be
//   above the docked bottom nav's z-[54] tier and the z-[55] mobile cart drawer tier (see the
//   z-index scale in custom.css) - was z-59 in the old hand-rolled version for exactly that
//   reason (a mobile cart left open elsewhere used to swallow taps on this sheet).
// - backdrop reach: stops at `bottom-16` instead of the default `inset-0` (added 27 Aug 2026,
//   explicit request) - the panel already floats above the docked nav bar so it stays visible,
//   but a full-screen backdrop was dimming AND swallowing taps on it anyway, leaving it
//   visible but dead. Matching the panel's own `bottom-16` offset here means the dock reads as
//   "still part of the live page", not "covered by the modal" - tapping a dock icon while this
//   sheet is open just navigates (handleNavClick already closes the sheet on any nav tap).
// - position.bottom: <Drawer>'s own default anchors flush to `bottom-0`, which would sit
//   underneath/cover the docked bottom nav bar. `bottom-16` floats it just above the dock
//   instead, matching the original layout.
const quickActionDrawerTheme = {
  root: {
    backdrop: 'fixed inset-x-0 top-0 bottom-16 z-59 bg-gray-900/50 dark:bg-gray-900/80',
    position: {
      bottom: {
        on: 'bottom-16 left-0 right-0 w-full transform-none',
        off: 'bottom-16 left-0 right-0 w-full translate-y-full',
      },
    },
  },
};

// Icon badges (added 27 Aug 2026, replacing a solid-fill-plus-white-icon look that didn't
// match the rest of the site - e.g. StaffPropertyPicker.tsx's/PropertySetupWizard.tsx's own
// icon badges, which are all a light tint + colored icon, never a saturated fill).
const QUICK_ACTION_ICON_CLASSES = {
  emerald: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
  purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
} as const;

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
  const hasAnyQuickAction = permissions.addExpense || permissions.addBooking || permissions.addFoodOrder || permissions.viewLiveKitchenOrder;

  return (
    <>
      {/* Quick Action sheet - flowbite-react's own <Drawer position="bottom"> (27 Aug 2026,
          replacing a fully hand-rolled backdrop+sliding-div pair per user report: "not in
          alignment with flowbite" - see quickActionDrawerTheme above for the two theme
          overrides that reproduce this sheet's original stacking/position behavior via the
          real component instead of custom CSS). */}
      <Drawer
        open={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        position="bottom"
        theme={quickActionDrawerTheme}
        className="z-60 rounded-t-2xl p-0 shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        {/* Handle bar with Close Button */}
        <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto" />
          <button
            type="button"
            onClick={() => setIsQuickActionOpen(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          {/* 1. Add Expense */}
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
              className="flex items-center gap-3 p-3.5 rounded-xl bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${QUICK_ACTION_ICON_CLASSES.emerald}`}>
                <Receipt className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-gray-900 dark:text-white truncate">Add Expense</span>
              </div>
            </button>
          )}

          {/* 2. Add Booking */}
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
              className="flex items-center gap-3 p-3.5 rounded-xl bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${QUICK_ACTION_ICON_CLASSES.blue}`}>
                <CalendarPlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-gray-900 dark:text-white truncate">Add Booking</span>
              </div>
            </button>
          )}

          {/* 3. Add Food Order */}
          {permissions.addFoodOrder && (
            <button
              type="button"
              onClick={() => handleNavClick('kitchen', 'take_food_order')}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${QUICK_ACTION_ICON_CLASSES.amber}`}>
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-gray-900 dark:text-white truncate">Add Food Order</span>
              </div>
            </button>
          )}

          {/* 4. View Live Kitchen Order */}
          {permissions.viewLiveKitchenOrder && (
            <button
              type="button"
              onClick={() => handleNavClick('kitchen', 'kitchen_orders')}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${QUICK_ACTION_ICON_CLASSES.purple}`}>
                <ChefHat className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-gray-900 dark:text-white truncate">View Live Kitchen Order</span>
              </div>
            </button>
          )}
        </div>
      </Drawer>

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
