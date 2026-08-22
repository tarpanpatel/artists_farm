import React from 'react';
import { Card } from 'flowbite-react';
import {
  BarChart3,
  Receipt,
  Sliders,
  Send,
  Download,
  ChefHat,
  FolderCog,
  ArrowRight,
  ScrollText,
  Package,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { useAuth } from '../contexts/AuthContext';
import { NavMenuItem } from '../types';

interface AdminControlOverviewDashboardProps {
  onNavigate: (uniqueKey: string, tabKey?: string) => void;
  navItems?: NavMenuItem[];
}

export const AdminControlOverviewDashboard: React.FC<AdminControlOverviewDashboardProps> = ({
  onNavigate,
  navItems = [],
}) => {
  const { activeRole } = useAuth();
  const normalizedActiveRole = (activeRole || '').toLowerCase().trim();
  const isSuperOrRoot = normalizedActiveRole === 'super admin' || normalizedActiveRole === 'root admin';

  const cards: Array<{
    uniqueKey: string;
    tabKey: string;
    title: string;
    description: string;
    buttonLabel: string;
    icon: React.ComponentType<any>;
    color: string;
  }> = [
    {
      uniqueKey: 'dashboard_analytics',
      tabKey: 'analytics',
      title: t('dashboard_analytics_heading', 'Reports & Earnings'),
      description: t('dashboard_analytics_desc', 'See how your property is doing — daily income, guest counts, and room occupancy.'),
      buttonLabel: t('view_reports_btn', 'View Reports'),
      icon: BarChart3,
      color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60',
    },
    {
      uniqueKey: 'past_receipts_log',
      tabKey: 'audit_logs',
      title: t('past_receipts_log_heading', 'Past Bills & Receipts'),
      description: t('past_receipts_log_desc', 'Look up previous guest bills, payment methods, and settled receipts anytime.'),
      buttonLabel: t('view_receipts_btn', 'View Receipts'),
      icon: Receipt,
      color: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60',
    },
    {
      uniqueKey: 'edit_items_group',
      tabKey: 'menu_manager',
      title: t('edit_items_heading', 'Menu & Pricing'),
      description: t('edit_items_desc', 'Add new dishes, update food prices, and manage default expense items.'),
      buttonLabel: t('edit_menu_items_btn', 'Edit Menu & Items'),
      icon: FolderCog,
      color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60',
    },
    {
      uniqueKey: 'misc_charges',
      tabKey: 'petty_cash',
      title: t('misc_charges_heading', 'Extra Charges & Fees'),
      description: t('misc_charges_desc', 'Set preset prices for extra guests, bonfire, laundry, or special services.'),
      buttonLabel: t('manage_fees_btn', 'Manage Fees'),
      icon: Sliders,
      color: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/60',
    },
    {
      uniqueKey: 'system_stock',
      tabKey: 'admin',
      title: t('system_stock_heading', 'Global Stock Master'),
      description: t('system_stock_desc', 'Manage the standard list of kitchen materials available across all locations.'),
      buttonLabel: t('view_stock_master_btn', 'View Master Catalog'),
      icon: Package,
      color: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60',
    },
    {
      uniqueKey: 'telegram',
      tabKey: 'telegram',
      title: t('telegram_bot_heading', 'Telegram Alerts'),
      description: t('telegram_bot_desc', 'Get instant phone alerts whenever guests check in, order food, or request supplies.'),
      buttonLabel: t('setup_alerts_btn', 'Setup Alerts'),
      icon: Send,
      color: 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800/60',
    },
    {
      uniqueKey: 'data_export_center',
      tabKey: 'export',
      title: t('data_export_center_heading', 'Download Data & Excel'),
      description: t('data_export_center_desc', 'Download your booking history, sales summaries, and data backups as Excel or CSV files.'),
      buttonLabel: t('download_data_btn', 'Download Data'),
      icon: Download,
      color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/60',
    },
    {
      uniqueKey: 'beta_recipe_builder',
      tabKey: 'kitchen',
      title: t('beta_recipe_builder_heading', 'Dish Recipes (Auto-Stock)'),
      description: t('beta_recipe_builder_desc', 'Link ingredients to dishes so kitchen stock gets deducted automatically on each order.'),
      buttonLabel: t('open_recipes_btn', 'Open Recipes'),
      icon: ChefHat,
      color: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/60',
    },
    {
      uniqueKey: 'license_management',
      tabKey: 'licenses',
      title: t('license_management_heading', 'Property Licenses'),
      description: t('license_management_desc', 'Keep track of your FSSAI and stay licenses, and get reminded before they expire.'),
      buttonLabel: t('view_licenses_btn', 'View Licenses'),
      icon: ScrollText,
      color: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800/60',
    },
  ];

  const visibleCards = cards.filter((card) => {
    if (!navItems || navItems.length === 0) return true;
    const item = navItems.find((i) => i.uniqueKey === card.uniqueKey);
    if (!item) return false;
    if (!item.isVisible) return false;
    if (isSuperOrRoot) return true;
    if (!item.roles || item.roles.length === 0) return true;
    return item.roles.some((r) => r.toLowerCase().trim() === normalizedActiveRole);
  });

  const handleNavigate = (tabKey: string, uniqueKey: string) => {
    onNavigate(uniqueKey, tabKey);
  };

  return (
    <div className="admin-dashboard space-y-6">
      <PageHeader
        title={t('admin_control_title', 'Admin Control')}
        subtitle={t('admin_control_subtitle', 'Quick shortcuts to manage your earnings, menus, bills, phone alerts, and data.')}
      />

      <div className="admin-dashboard__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {visibleCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <Card
              key={card.uniqueKey}
              className="admin-dashboard__card border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-200 group"
            >
              <div className="flex items-start gap-3.5">
                <div className={`p-3 rounded-lg border shrink-0 ${card.color} transition-transform group-hover:scale-105`}>
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="admin-control-overview-dashboard__subtitle text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{card.description}</p>
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-700">
                <Button
                  variant="primary"
                  size="sm"
                  block
                  className="justify-center gap-2 font-semibold cursor-pointer rounded-lg"
                  onClick={() => handleNavigate(card.tabKey, card.uniqueKey)}
                  rightIcon={<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
                >
                  <span>{card.buttonLabel}</span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {visibleCards.length === 0 && (
        <div className="admin-dashboard__empty-state text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <p className="admin-dashboard__empty-state-text text-slate-500 dark:text-slate-400 text-sm">
            {t('no_admin_modules_label', 'No administrative modules permitted for your current role.')}
          </p>
        </div>
      )}
    </div>
  );
};
