import React, { useState, useEffect } from 'react';
import { LogOut, BarChart3, Building2, Paintbrush, Menu, Eye, Palette, DollarSign, Send, Mail } from 'lucide-react';
import { AppearanceSettings } from './AppearanceSettings';
import { PlatformPropertyManagement } from './PlatformPropertyManagement';
import { NavMenuEditor } from './NavMenuEditor';
import { DefaultExpensesManager } from './DefaultExpensesManager';
import { TelegramNotificationModal } from './TelegramNotificationModal';
import { EmailSettingsPanel } from './EmailSettingsPanel';
import { StyledSelect } from './StyledSelect';
import { TelegramConfig } from '../types';
import { AuthProvider } from '../contexts/AuthContext';

// TelegramNotificationModal requires this prop but never actually reads it
// (its real "Send to:" routing state is fetched internally) - a stable
// no-op value avoids passing a fresh object/function on every render.
const NOOP_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: '',
  chatId: '',
  botUsername: '',
  enabledEvents: {
    kotOrders: false,
    guestCheckout: false,
    materialRequisitions: false,
    lowStockAlerts: false,
    pettyCashExpenses: false,
  },
};
const noop = () => {};

interface RootAdminDashboardProps {
  username: string;
  onLogout: () => void;
  activeRole: string;
}

type SectionType = 'dashboard' | 'tenants_properties' | 'appearance' | 'edit_main_menu' | 'default_expenses' | 'telegram_templates' | 'email_settings';

const VALID_SECTIONS: SectionType[] = ['dashboard', 'tenants_properties', 'appearance', 'edit_main_menu', 'default_expenses', 'telegram_templates', 'email_settings'];

export const RootAdminDashboard: React.FC<RootAdminDashboardProps> = ({
  username,
  onLogout,
  activeRole,
}) => {
  const [activeSection, setActiveSection] = useState<SectionType>(() => {
    const fromHash = window.location.hash.replace('#', '') as SectionType;
    if (VALID_SECTIONS.includes(fromHash)) return fromHash;
    const saved = localStorage.getItem('root_dashboard_section');
    return (saved as SectionType) || 'dashboard';
  });
  const [navItems, setNavItems] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [telegramProperties, setTelegramProperties] = useState<Array<{ id: number; name: string; slug: string }>>([]);
  const [telegramRefSlug, setTelegramRefSlug] = useState<string>('');

  // Keep the URL hash and localStorage in sync with the active section
  useEffect(() => {
    localStorage.setItem('root_dashboard_section', activeSection);
    if (window.location.hash.replace('#', '') !== activeSection) {
      window.location.hash = activeSection;
    }
  }, [activeSection]);

  // Support browser back/forward navigation between sections
  useEffect(() => {
    const handleHashChange = () => {
      const fromHash = window.location.hash.replace('#', '') as SectionType;
      if (VALID_SECTIONS.includes(fromHash) && fromHash !== activeSection) {
        setActiveSection(fromHash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
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

  // TelegramNotificationModal resolves its own "Send to:" routing config
  // internally (via getPropertySlug(), which checks a `property_slug` query
  // param first) on mount only, and is force-remounted below via a `key` tied
  // to telegramRefSlug whenever the reference property changes. The query
  // param has to be written *before* that state update triggers the remount,
  // not in a separate effect afterward - otherwise the remounted instance's
  // mount-time fetch could race ahead of the URL update and read the old slug.
  const selectTelegramRefProperty = (slug: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('property_slug', slug);
    window.history.replaceState(null, '', url.toString());
    setTelegramRefSlug(slug);
  };

  // Load the property list when Telegram Templates section opens, and default
  // to the first property so the "Send to:" group routing has something to
  // work against (that routing is per-property; template wording itself
  // isn't - it's a single shared table for the whole platform).
  useEffect(() => {
    if (activeSection === 'telegram_templates' && telegramProperties.length === 0) {
      fetch('/php/api/router.php?action=get_all_properties', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.data)) {
            setTelegramProperties(data.data);
            if (data.data.length > 0) selectTelegramRefProperty(data.data[0].slug);
          }
        })
        .catch((err) => console.error('Failed to load properties:', err));
    }
  }, [activeSection, telegramProperties.length]);

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
    {
      id: 'telegram_templates',
      label: 'Telegram Templates',
      icon: Send,
      section: 'telegram_templates' as SectionType,
    },
    {
      id: 'email_settings',
      label: 'Email Settings',
      icon: Mail,
      section: 'email_settings' as SectionType,
    },
  ];

  const handleTelescopeOpen = () => {
    window.open('/php/errors/', '_blank');
  };

  const goToSection = (section: SectionType) => {
    setActiveSection(section);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex">
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-30 h-screen w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-200 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-slate-800 flex flex-col justify-between">
          <div className="space-y-1">
            {/* Branding */}
            <div className="px-3 pb-3 mb-2 border-b border-gray-100 dark:border-slate-700/80">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">Root Admin</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">System Management</p>
            </div>

            <div className="px-3 pb-2 mb-2 border-b border-gray-100 dark:border-slate-700/80 text-xs font-bold text-slate-500 dark:text-slate-400">
              Hello, {username}
            </div>

            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.section;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToSection(item.section)}
                  className={`w-full flex items-center gap-2.5 p-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-600 dark:text-white font-bold'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-400 dark:text-gray-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            {/* Telescope Monitoring Link */}
            <button
              type="button"
              onClick={handleTelescopeOpen}
              className="w-full flex items-center gap-2.5 p-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-900 dark:hover:text-purple-100"
              title="Open Telescope Error Center - View user problems and system errors"
            >
              <Eye className="w-4 h-4 shrink-0 text-purple-500 dark:text-purple-400" />
              <span className="truncate">Telescope Monitor</span>
            </button>
          </div>

          <div className="pt-4 mt-auto border-t border-gray-200 dark:border-slate-700 space-y-2">
            <div className="px-2.5 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Logged in as</p>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{username}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{activeRole}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-2.5 text-xs font-bold rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-all cursor-pointer shadow-2xs"
              style={{ color: '#ff5252' }}
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>Sign Out Terminal</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 overflow-auto">
        {/* Top Bar */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-3 py-2.5 lg:px-8 lg:py-4 flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle Sidebar Menu"
              aria-label="Toggle Sidebar Navigation"
              className="md:hidden p-2 -ml-1 text-gray-600 dark:text-gray-300 rounded-lg hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-lg lg:text-2xl font-bold text-slate-900 dark:text-white truncate">
                {activeSection === 'dashboard' && 'Dashboard'}
                {activeSection === 'tenants_properties' && 'Tenants & Properties'}
                {activeSection === 'edit_main_menu' && 'Edit Main Menu'}
                {activeSection === 'default_expenses' && 'Default Expenses (MultiKey)'}
                {activeSection === 'appearance' && 'Appearance Settings'}
                {activeSection === 'telegram_templates' && 'Telegram Templates'}
                {activeSection === 'email_settings' && 'Email Settings'}
              </h2>
              <p className="hidden sm:block text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
                {activeSection === 'dashboard' && 'System overview and analytics'}
                {activeSection === 'tenants_properties' && 'Manage all tenants and their properties'}
                {activeSection === 'edit_main_menu' && 'Global navigation menu for all properties'}
                {activeSection === 'default_expenses' && 'System expense categories and defaults'}
                {activeSection === 'appearance' && 'Customize theme colors and CSS styling'}
                {activeSection === 'telegram_templates' && 'One shared template set for the whole platform - edit wording here, choose a property below to configure its group routing'}
                {activeSection === 'email_settings' && 'SMTP connection and the tenant welcome email/WhatsApp message template'}
              </p>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
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

          {/* Telegram Templates Section */}
          {activeSection === 'telegram_templates' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  Configure "Send to:" routing for:
                </label>
                <div className="w-full sm:w-64">
                  <StyledSelect
                    value={telegramRefSlug}
                    onChange={selectTelegramRefProperty}
                    options={telegramProperties.map((p) => ({ value: p.slug, label: p.name }))}
                  />
                </div>
              </div>

              {telegramRefSlug && (
                // RootAdminDashboard sits outside the property-scoped AuthProvider
                // tree (needed so TelegramNotificationModal's useAuth() call
                // doesn't crash), but the reference property picked above can
                // have its own real Super Admin browser session already saved
                // in localStorage from someone actually logging into it - that
                // session would otherwise take priority and lock the editor.
                // templateCustomizationEnabled=true sidesteps that entirely:
                // reaching this dashboard at all already means root admin.
                <AuthProvider>
                  <TelegramNotificationModal
                    key={telegramRefSlug}
                    isEmbedded
                    telegramConfig={NOOP_TELEGRAM_CONFIG}
                    onUpdateConfig={noop}
                    dispatchLogs={[]}
                    onSendTestNotification={noop}
                    kitchenModuleEnabled={true}
                    templateCustomizationEnabled={true}
                  />
                </AuthProvider>
              )}
            </div>
          )}

          {/* Email Settings Section */}
          {activeSection === 'email_settings' && <EmailSettingsPanel />}
        </div>
      </main>
    </div>
  );
};
