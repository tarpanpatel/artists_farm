import React, { useState, useEffect } from 'react';
import { LogOut, BarChart3, Building2, Paintbrush, Menu, Eye, Palette, DollarSign } from 'lucide-react';
import { AppearanceSettings } from './AppearanceSettings';
import { PlatformPropertyManagement } from './PlatformPropertyManagement';
import { NavMenuEditor } from './NavMenuEditor';
import { DefaultExpensesManager } from './DefaultExpensesManager';

interface RootAdminDashboardProps {
  username: string;
  onLogout: () => void;
  activeRole: string;
}

type SectionType = 'dashboard' | 'tenants_properties' | 'appearance' | 'edit_main_menu' | 'default_expenses';

export const RootAdminDashboard: React.FC<RootAdminDashboardProps> = ({
  username,
  onLogout,
  activeRole,
}) => {
  const [activeSection, setActiveSection] = useState<SectionType>(() => {
    const saved = localStorage.getItem('root_dashboard_section');
    return (saved as SectionType) || 'dashboard';
  });
  const [navItems, setNavItems] = useState<any[]>([]);

  // Persist active section to localStorage
  useEffect(() => {
    localStorage.setItem('root_dashboard_section', activeSection);
  }, [activeSection]);

  const handleLogout = () => {
    localStorage.removeItem('artists_farm_user_session');
    onLogout();
    window.location.href = '/artists_farm/login/';
  };

  // Load nav items when Edit Main Menu section is active
  useEffect(() => {
    if (activeSection === 'edit_main_menu') {
      const loadNavItems = async () => {
        try {
          const response = await fetch('/php/api/router.php?action=get_nav_menu', {
            credentials: 'include',
          });
          const data = await response.json();
          if (data.status === 'success' && Array.isArray(data.data)) {
            setNavItems(data.data);
          }
        } catch (err) {
          console.error('Failed to load nav items:', err);
        }
      };
      loadNavItems();
    }
  }, [activeSection]);

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: BarChart3,
      section: 'dashboard' as SectionType,
    },
    {
      id: 'tenants_properties',
      label: 'Tenants & Properties',
      icon: Building2,
      section: 'tenants_properties' as SectionType,
    },
    {
      id: 'default_expenses',
      label: 'Default Expenses (MK)',
      icon: DollarSign,
      section: 'default_expenses' as SectionType,
    },
    {
      id: 'edit_main_menu',
      label: 'Edit Main Menu',
      icon: Menu,
      section: 'edit_main_menu' as SectionType,
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Palette,
      section: 'appearance' as SectionType,
    },
  ];

  const handleTelescopeOpen = () => {
    window.open('/php/errors/', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Root Admin</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">System Management</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.section;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.section)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Telescope Monitoring Link */}
          <button
            onClick={handleTelescopeOpen}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:text-purple-600 dark:hover:text-purple-400 group"
            title="Open Telescope Error Center - View user problems and system errors"
          >
            <Eye className="w-5 h-5 flex-shrink-0 group-hover:text-purple-500" />
            <span>📊 Telescope Monitor</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Logged in as</p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{username}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{activeRole}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg transition-colors font-medium text-sm"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-8 py-4">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {activeSection === 'dashboard' && 'Dashboard'}
              {activeSection === 'tenants_properties' && 'Tenants & Properties'}
              {activeSection === 'edit_main_menu' && 'Edit Main Menu'}
              {activeSection === 'default_expenses' && 'Default Expenses (MultiKey)'}
              {activeSection === 'appearance' && 'Appearance Settings'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {activeSection === 'dashboard' && 'System overview and analytics'}
              {activeSection === 'tenants_properties' && 'Manage all tenants and their properties'}
              {activeSection === 'edit_main_menu' && 'Global navigation menu for all properties'}
              {activeSection === 'default_expenses' && 'System expense categories and defaults'}
              {activeSection === 'appearance' && 'Customize theme colors and CSS styling'}
            </p>
          </div>
        </header>

        {/* Content Area */}
        <div className="max-w-7xl mx-auto px-8 py-8">
          {/* Dashboard Section */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">System Status</p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">Online</p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 rounded-xl flex items-center justify-center">
                      <div className="w-3 h-3 bg-emerald-600 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Global CSS Configured</p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">Yes</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/50 rounded-xl flex items-center justify-center">
                      <Paintbrush className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Admin Level</p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">Root</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/50 rounded-xl flex items-center justify-center">
                      <span className="text-lg font-bold text-purple-600 dark:text-purple-400">∞</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">System Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">Current Role</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{activeRole}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">Username</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{username}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">Access Level</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">Full System Access</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tenants & Properties Section */}
          {activeSection === 'tenants_properties' && (
            <PlatformPropertyManagement />
          )}

          {/* Default Expenses Section */}
          {activeSection === 'default_expenses' && (
            <DefaultExpensesManager />
          )}

          {/* Edit Main Menu Section */}
          {activeSection === 'edit_main_menu' && (
            <NavMenuEditor
              navItems={navItems}
              onUpdateNavItems={setNavItems}
              activeRole={activeRole}
              hideKitchenItems={false}
            />
          )}

          {/* Appearance Settings Section */}
          {activeSection === 'appearance' && (
            <AppearanceSettings activeRole={activeRole} />
          )}
        </div>
      </main>
    </div>
  );
};
