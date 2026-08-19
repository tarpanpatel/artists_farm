import React, { useState } from 'react';
import { LayoutDashboard, Users, UtensilsCrossed, Wallet, Menu, Plus, UserPlus, Handshake, Receipt, PackagePlus } from 'lucide-react';
import { Drawer as FlowbiteDrawer, DrawerHeader, DrawerItems } from 'flowbite-react';
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
            itemKey: 'take_food_order',
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Flowbite Quick Action Bottom Sheet Drawer */}
      <FlowbiteDrawer
        open={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        position="bottom"
        className="z-[9999] rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-4 sm:p-5"
      >
        <DrawerHeader title="Quick Actions" />
        <DrawerItems>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleNavClick('guests', 'guests')}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <UserPlus className="w-5 h-5" />
              </div>
              <span>New Guest Check-In</span>
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('petty_cash', 'petty_cash')}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Handshake className="w-5 h-5" />
              </div>
              <span>Record Handover</span>
            </button>

            {kitchenModuleEnabled && (
              <button
                type="button"
                onClick={() => handleNavClick('kitchen', 'kitchen')}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <span>Kitchen Order</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleNavClick('inventory', 'inventory')}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-semibold text-xs text-left transition-all active:scale-95 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <PackagePlus className="w-5 h-5" />
              </div>
              <span>Inventory & Stock</span>
            </button>
          </div>
        </DrawerItems>
      </FlowbiteDrawer>

      {/* Docked Mobile Bottom Navigation Bar - adapted from Flowbite's
          documented "Bottom Navigation" application-bar pattern
          (flowbite.com/docs/components/bottom-navigation - icon-button grid
          + a raised circular center action button). flowbite-react ships no
          React component for this (checked its full component list, 19 Aug
          2026 - nothing between Navbar and Sidebar covers a bottom bar), so
          this is Flowbite's own HTML/Tailwind structure hand-ported to JSX,
          same as their docs recommend for any pattern without a React
          wrapper. Colors use Flowbite's real semantic tokens (bg-brand,
          text-fg-brand, border-default, etc.) - these come from
          flowbite/src/themes/default.css (imported in index.css), NOT from
          flowbite/plugin.js itself (that file only *references*
          var(--color-brand) in its base styles, it never defines the
          variable - confirmed by reading both files directly). No dark:
          variants needed here: each token's dark-mode value is already
          baked into the same class via a .dark { --color-brand: ... }
          override in that theme file, so bg-neutral-primary-soft alone
          adapts automatically once dark mode is wired up (it's currently
          inert app-wide - nothing sets class="dark" - so this renders
          identically to the light values today either way). */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[54] md:hidden h-16 bg-neutral-primary-soft border-t border-default pb-[env(safe-area-inset-bottom)] transition-transform duration-200"
      >
        <div className={`grid h-full max-w-md mx-auto ${navItems.length + 2 === 6 ? 'grid-cols-6' : 'grid-cols-5'}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.tab, item.itemKey)}
                className={`inline-flex flex-col items-center justify-center gap-1 px-1 cursor-pointer group ${
                  isActive ? 'text-fg-brand' : 'text-body hover:text-fg-brand'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className={`text-[11px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </button>
            );
          })}

          {/* Center Quick Action - Flowbite's raised circular button, sitting
              in its own grid cell rather than absolutely overlapping the bar. */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
              aria-label="Open Quick Actions"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand hover:bg-brand-strong text-white shadow-md focus:outline-none focus:ring-4 focus:ring-brand-medium active:scale-95 transition-transform cursor-pointer"
            >
              <Plus className={`w-5 h-5 transition-transform ${isQuickActionOpen ? 'rotate-45' : ''}`} />
            </button>
          </div>

          {/* More / Menu Drawer Toggle */}
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle Full Menu"
            className={`inline-flex flex-col items-center justify-center gap-1 px-1 cursor-pointer group ${
              isSidebarOpen ? 'text-fg-brand' : 'text-body hover:text-fg-brand'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className={`text-[11px] leading-tight ${isSidebarOpen ? 'font-semibold' : 'font-medium'}`}>More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
