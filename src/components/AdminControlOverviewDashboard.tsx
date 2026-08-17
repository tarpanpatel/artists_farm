import React from 'react';
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
} from 'lucide-react';
import { Button } from './Button';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { useAuth } from '../contexts/AuthContext';
import { NavMenuItem } from '../types';

interface AdminControlOverviewDashboardProps {
  // Single callback through App.tsx's centralized handleNavigateTab (same
  // as KitchenDashboard's onNavigate) - see TeamOverviewDashboard.tsx for
  // why two separate setters would desync window.location.hash.
  onNavigate: (uniqueKey: string, tabKey?: string) => void;
  navItems?: NavMenuItem[];
}

/**
 * Launchpad hub for the "Admin Control" sidebar section - same pattern as
 * TeamOverviewDashboard/KitchenDashboard: fixed card catalog, filtered
 * against the real DB-driven navItems (nav-header-admin's children) rather
 * than assumed. 0ms load - no data fetching.
 */
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
    icon: React.ComponentType<any>;
    color: string;
  }> = [
    {
      uniqueKey: 'dashboard_analytics',
      tabKey: 'analytics',
      title: t('dashboard_analytics_heading', 'Dashboard Analytics'),
      description: t('dashboard_analytics_desc', 'View performance graphs, overall resort revenue, guest stays, and occupancy trends.'),
      icon: BarChart3,
      color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60',
    },

    {
      uniqueKey: 'past_receipts_log',
      tabKey: 'audit_logs',
      title: t('past_receipts_log_heading', 'Past Receipts Log'),
      description: t('past_receipts_log_desc', 'Inspect complete audit logs for generated billing receipts, settlement details, and payment histories.'),
      icon: Receipt,
      color: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60',
    },
    {
      uniqueKey: 'edit_items_group',
      tabKey: 'menu_manager',
      title: t('edit_items_heading', 'Edit Items'),
      description: t('edit_items_desc', 'Add or modify food menu pricing, expense catalog defaults, and other editable item lists.'),
      icon: FolderCog,
      color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60',
    },
    {
      uniqueKey: 'misc_charges',
      tabKey: 'petty_cash',
      title: t('misc_charges_heading', 'Misc Charges'),
      description: t('misc_charges_desc', 'Configure preset incidental charges, extra guest fees, and miscellaneous billing templates.'),
      icon: Sliders,
      color: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/60',
    },
    {
      uniqueKey: 'system_stock',
      tabKey: 'admin',
      title: t('system_stock_heading', 'System Stock Catalog'),
      description: t('system_stock_desc', 'Manage global baseline stock items that are available across all properties.'),
      icon: Package,
      color: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60',
    },
    {
      uniqueKey: 'telegram',
      tabKey: 'telegram',
      title: t('telegram_bot_heading', 'Telegram Bot Alerts'),
      description: t('telegram_bot_desc', 'Configure automated instant notifications for check-ins, kitchen orders, and staff requisitions.'),
      icon: Send,
      color: 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800/60',
    },
    {
      uniqueKey: 'data_export_center',
      tabKey: 'export',
      title: t('data_export_center_heading', 'Data Export Center'),
      description: t('data_export_center_desc', 'Export system records, guest stay histories, sales summaries, and full Excel/CSV database backups.'),
      icon: Download,
      color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/60',
    },
    {
      uniqueKey: 'beta_recipe_builder',
      tabKey: 'kitchen',
      title: t('beta_recipe_builder_heading', 'Beta Recipe Builder'),
      description: t('beta_recipe_builder_desc', 'Define ingredient breakdown recipes for kitchen dishes to automate inventory deduction.'),
      icon: ChefHat,
      color: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/60',
    },
    {
      uniqueKey: 'license_management',
      tabKey: 'licenses',
      title: t('license_management_heading', 'License Management'),
      description: t('license_management_desc', 'Track homestay, FSSAI, and other property licenses with automatic expiry reminders.'),
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
        subtitle={t('admin_control_subtitle', 'Central management hub for analytics, item catalogs, billing receipts log, system alerts, and data exports.')}
      />

      <div className="admin-dashboard__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {visibleCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <div
              key={card.uniqueKey}
              className="admin-dashboard__card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className={`p-3 rounded-xl border w-fit ${card.color} transition-transform group-hover:scale-105`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <h3 className="admin-control-overview-dashboard__subtitle text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{card.description}</p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700/60">
                <Button
                  variant="secondary"
                  size="sm"
                  block
                  className="justify-center gap-2 font-semibold cursor-pointer rounded-xl"
                  onClick={() => handleNavigate(card.tabKey, card.uniqueKey)}
                  rightIcon={<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
                >
                  <span>{t('open_prefix', 'Open')} {card.title}</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {visibleCards.length === 0 && (
        <div className="admin-dashboard__empty-state text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <p className="admin-dashboard__empty-state-text text-slate-500 dark:text-slate-400 text-sm">
            {t('no_admin_modules_label', 'No administrative modules permitted for your current role.')}
          </p>
        </div>
      )}
    </div>
  );
};
