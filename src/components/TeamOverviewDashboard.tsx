import React from 'react';
import { Card } from 'flowbite-react';
import { Calendar, ShieldCheck, Users2, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { useAuth } from '../contexts/AuthContext';
import { NavMenuItem } from '../types';

interface TeamOverviewDashboardProps {
  onNavigate: (uniqueKey: string, tabKey?: string) => void;
  navItems?: NavMenuItem[];
}

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
    <div className="team-overview-dashboard space-y-6">
      <PageHeader
        title={t('team_overview_title', 'Team Overview')}
        subtitle={t('team_overview_subtitle', 'Central launchpad for staff attendance, directory management, payroll, and role-based permissions.')}
      />

      <div className="team-overview-dashboard__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {visibleCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <Card
              key={card.uniqueKey}
              className="team-overview-dashboard__card border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-200 group"
            >
              <div className="flex items-start gap-3.5">
                <div className={`p-3 rounded-lg border shrink-0 ${card.color} transition-transform group-hover:scale-105`}>
                  <IconComponent className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="team-overview-dashboard__subtitle text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
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
                  <span>{t('open_prefix', 'Open')} {card.title}</span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {visibleCards.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {t('no_team_modules_label', 'No team modules configured for this property yet.')}
          </p>
        </div>
      )}
    </div>
  );
};
