import React from 'react';
import { Calendar, ShieldCheck, Users2, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { useAuth } from '../contexts/AuthContext';
import { NavMenuItem } from '../types';

interface TeamOverviewDashboardProps {
  // Single callback through App.tsx's centralized handleNavigateTab (same
  // as KitchenDashboard's onNavigate) - setting tab and menu key via two
  // separate setters would leave window.location.hash pointed at the tab's
  // *default* key instead of the specific card clicked, since only
  // handleNavigateTab's own menuItemKey param updates the hash correctly.
  onNavigate: (uniqueKey: string, tabKey?: string) => void;
  navItems?: NavMenuItem[];
}

/**
 * Launchpad hub for the "Team" sidebar section - matches KitchenDashboard's
 * pattern (see KitchenDashboard.tsx): a fixed catalog of possible cards,
 * filtered down to whatever's actually present/visible/role-permitted in
 * navItems (DB-driven via NavMenuEditor, never hardcoded per-tenant). 0ms
 * load - no data fetching, just navigation.
 */
export const TeamOverviewDashboard: React.FC<TeamOverviewDashboardProps> = ({
  onNavigate,
  navItems = [],
}) => {
  const cards: Array<{
    uniqueKey: string;
    tabKey: string;
    title: string;
    description: string;
    icon: React.ComponentType<any>;
    color: string;
  }> = [
    {
      uniqueKey: 'attendance_calendar',
      tabKey: 'staff',
      title: t('attendance_calendar_heading', 'Attendance & Salary'),
      description: t('attendance_calendar_desc', 'Track daily staff duty, present/absent status, shift logs, and monthly attendance-linked pay.'),
      icon: Calendar,
      color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60',
    },
    {
      uniqueKey: 'staff_directory_salaries',
      tabKey: 'staff',
      title: t('staff_directory_salaries_heading', 'Staff Directory & Salaries'),
      description: t('staff_directory_salaries_desc', 'Manage staff profiles, monthly salary payouts, daily wages, and historical payment logs.'),
      icon: Users2,
      color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60',
    },
    {
      uniqueKey: 'staff_permissions',
      tabKey: 'staff',
      title: t('staff_permissions_heading', 'Staff & Permissions'),
      description: t('staff_permissions_desc', 'Register team members, update login passcodes, and manage role-based system access.'),
      icon: ShieldCheck,
      color: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/60',
    },
  ];

  const { activeRole } = useAuth();
  const normalizedActiveRole = (activeRole || '').toLowerCase().trim();
  const isSuperOrRoot = normalizedActiveRole === 'super admin' || normalizedActiveRole === 'root admin';

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
    <div className="team-overview-dashboard space-y-2 md:space-y-6">
      <PageHeader
        title={t('team_overview_title', 'Team Overview')}
        subtitle={t('team_overview_subtitle', 'Central launchpad for staff attendance, directory management, payroll, and role-based permissions.')}
      />

      <div className="team-overview-dashboard__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 md:gap-5">
        {visibleCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <div
              key={card.uniqueKey}
              className="team-overview-dashboard__card bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all duration-200 p-2 md:p-5 flex flex-col justify-between group"
            >
              {/* Mobile Layout */}
              <div className="flex md:hidden items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <IconComponent className="w-4.5 h-4.5 text-slate-700 dark:text-slate-200 shrink-0" />
                  <h3 className="team-overview-dashboard__subtitle text-xs font-semibold text-slate-900 dark:text-white truncate">{card.title}</h3>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0 font-semibold px-2.5 py-1 cursor-pointer text-[11px] h-7"
                  onClick={() => handleNavigate(card.tabKey, card.uniqueKey)}
                  rightIcon={<ArrowRight className="w-3 h-3" />}
                >
                  <span>{t('open_button', 'Open')}</span>
                </Button>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:flex flex-col justify-between h-full space-y-4">
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl border w-fit ${card.color} transition-transform group-hover:scale-105`}>
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="team-overview-dashboard__subtitle text-base md:text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{card.description}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <Button
                    variant="secondary"
                    size="sm"
                    block
                    className="justify-center gap-2 font-semibold cursor-pointer"
                    onClick={() => handleNavigate(card.tabKey, card.uniqueKey)}
                    rightIcon={<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
                  >
                    <span>{t('open_prefix', 'Open')} {card.title}</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {visibleCards.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {t('no_team_modules_label', 'No team modules configured for this property yet.')}
          </p>
        </div>
      )}
    </div>
  );
};
