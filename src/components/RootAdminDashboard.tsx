import React, { useState, useEffect, useRef } from 'react';
import { LogOut, BarChart3, Building2, Paintbrush, Menu, Eye, Palette, DollarSign, Send, Mail, Bell, UserCog, Pencil, DatabaseBackup, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { t } from '../i18n/en';
import { AppearanceSettings } from './AppearanceSettings';
import { PlatformPropertyManagement } from './PlatformPropertyManagement';
import { NavMenuEditor } from './NavMenuEditor';
import { DefaultExpensesManager } from './DefaultExpensesManager';
import { ServiceRequestTypesManager } from './ServiceRequestTypesManager';
import { TelegramNotificationModal } from './TelegramNotificationModal';
import { EmailSettingsPanel } from './EmailSettingsPanel';
import { AccountSettings } from './AccountSettings';
import { ScrollToTopButton } from './ScrollToTopButton';
import { TelegramConfig } from '../types';
import { AuthProvider } from '../contexts/AuthContext';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { useToast } from './ToastContext';

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

type SectionType = 'dashboard' | 'tenants_properties' | 'appearance' | 'edit_main_menu' | 'default_expenses' | 'service_request_types' | 'telegram_templates' | 'email_settings' | 'account_settings' | 'db_sync' | 'demo_data';

const VALID_SECTIONS: SectionType[] = ['dashboard', 'tenants_properties', 'appearance', 'edit_main_menu', 'default_expenses', 'service_request_types', 'telegram_templates', 'email_settings', 'account_settings', 'db_sync', 'demo_data'];

export const RootAdminDashboard: React.FC<RootAdminDashboardProps> = ({
  username,
  onLogout,
  activeRole,
}) => {
  // This dashboard scrolls its own <main> (overflow-auto below) rather than
  // the window, unlike the other page shells - ScrollToTopButton needs this
  // ref to know which element to watch/scroll instead of defaulting to window.
  const mainScrollRef = useRef<HTMLElement>(null);

  const [activeSection, setActiveSection] = useState<SectionType>(() => {
    const fromHash = window.location.hash.replace('#', '') as SectionType;
    if (VALID_SECTIONS.includes(fromHash)) return fromHash;
    const saved = localStorage.getItem('root_dashboard_section');
    return (saved as SectionType) || 'dashboard';
  });
  const [navItems, setNavItems] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Kept in local state so a username change in Account Settings reflects
  // immediately in the sidebar/header without needing a full re-login.
  const [displayUsername, setDisplayUsername] = useState(username);
  const handleUsernameChange = (newUsername: string) => setDisplayUsername(newUsername);
  const [isExportingDb, setIsExportingDb] = useState(false);
  const { showToast } = useToast();

  // Reset Demo Data: intentionally re-adds a way to regenerate demo data -
  // unlike the removed site-wide "Test Mode" toggle (see CLAUDE.md), this is
  // root-admin-only and hardcoded to whichever single property is flagged
  // is_public_demo (no property picker), so there's no way to accidentally
  // point it at a real tenant's live property.
  const [demoProperty, setDemoProperty] = useState<{ id: number; name: string; slug: string } | null>(null);
  const [isLoadingDemoProperty, setIsLoadingDemoProperty] = useState(false);
  const [demoPropertyError, setDemoPropertyError] = useState('');
  const [isResettingDemo, setIsResettingDemo] = useState(false);

  useEffect(() => {
    if (activeSection !== 'demo_data' || demoProperty || isLoadingDemoProperty) return;
    setIsLoadingDemoProperty(true);
    setDemoPropertyError('');
    apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_public_demo_property`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDemoProperty(data.data);
        } else {
          setDemoPropertyError(data.message || 'No public demo property is configured.');
        }
      })
      .catch(() => setDemoPropertyError('Failed to check for a public demo property.'))
      .finally(() => setIsLoadingDemoProperty(false));
  }, [activeSection, demoProperty, isLoadingDemoProperty]);

  const handleResetDemoData = async () => {
    if (!demoProperty) return;
    setIsResettingDemo(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=generate_demo_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: demoProperty.id }),
      });
      const data = await res.json();
      if (data.status === 'success' || data.success) {
        showToast(`Demo data reset for "${demoProperty.name}"`, { type: 'success' });
      } else {
        throw new Error(data.message || 'Reset failed');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to reset demo data', { type: 'error' });
    } finally {
      setIsResettingDemo(false);
    }
  };

  const handleDownloadLiveDb = async () => {
    setIsExportingDb(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=export_database_dump`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.setAttribute('download', `artists_farm_live_${stamp}.sql`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast('Database export downloaded', { type: 'success' });
    } catch (err: any) {
      showToast(err?.message || 'Failed to export database', { type: 'error' });
    } finally {
      setIsExportingDb(false);
    }
  };

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
    window.location.href = '/login/';
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
      label: t('root_dashboard_label', 'Dashboard'),
      icon: BarChart3,
      section: 'dashboard' as SectionType,
    },
    {
      id: 'tenants_properties',
      label: t('root_tenants_properties_label', 'Tenants & Properties'),
      icon: Building2,
      section: 'tenants_properties' as SectionType,
    },
    {
      id: 'default_expenses',
      label: t('root_default_expenses_menu_label', 'Default Expenses (MK)'),
      icon: DollarSign,
      section: 'default_expenses' as SectionType,
    },
    {
      id: 'service_request_types',
      label: t('root_service_request_types_menu_label', 'Service Request Types'),
      icon: Bell,
      section: 'service_request_types' as SectionType,
    },
    {
      id: 'edit_main_menu',
      label: t('root_edit_main_menu_label', 'Edit Main Menu'),
      icon: Menu,
      section: 'edit_main_menu' as SectionType,
    },
    {
      id: 'appearance',
      label: t('root_appearance_menu_label', 'Appearance'),
      icon: Palette,
      section: 'appearance' as SectionType,
    },
    {
      id: 'telegram_templates',
      label: t('root_telegram_templates_label', 'Telegram Templates'),
      icon: Send,
      section: 'telegram_templates' as SectionType,
    },
    {
      id: 'email_settings',
      label: t('root_email_settings_label', 'Email Settings'),
      icon: Mail,
      section: 'email_settings' as SectionType,
    },
    {
      id: 'account_settings',
      label: t('root_account_settings_label', 'Account Settings'),
      icon: UserCog,
      section: 'account_settings' as SectionType,
    },
    {
      id: 'db_sync',
      label: t('root_db_sync_label', 'Sync to Local'),
      icon: DatabaseBackup,
      section: 'db_sync' as SectionType,
    },
    {
      id: 'demo_data',
      label: t('root_demo_data_label', 'Reset Demo Data'),
      icon: RefreshCw,
      section: 'demo_data' as SectionType,
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
    <div className="root-admin-dashboard min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex">
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`root-admin-dashboard__sidebar fixed top-0 left-0 z-30 h-screen w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-200 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-slate-800 flex flex-col justify-between">
          <div className="space-y-1">
            {/* Branding */}
            <div className="px-3 pb-3 mb-2 border-b border-slate-100 dark:border-slate-700/80">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">{t('root_admin_branding', 'Root Admin')}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('system_management_label', 'System Management')}</p>
            </div>

            <div className="px-3 pb-2 mb-2 border-b border-slate-100 dark:border-slate-700/80 text-xs font-bold text-slate-500 dark:text-slate-400">
              Hello, {displayUsername}
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
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            {/* Telescope Monitoring Link */}
            <button
              type="button"
              onClick={handleTelescopeOpen}
              className="w-full flex items-center gap-2.5 p-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-900 dark:hover:text-purple-100"
              title={t('telescope_error_center_tooltip', 'Open Telescope Error Center - View user problems and system errors')}
            >
              <Eye className="w-4 h-4 shrink-0 text-purple-500 dark:text-purple-400" />
              <span className="truncate">{t('telescope_monitor_label', 'Telescope Monitor')}</span>
            </button>
          </div>

          <div className="pt-4 mt-auto border-t border-slate-200 dark:border-slate-700 space-y-2">
            <div className="px-2.5 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t('logged_in_as_label', 'Logged in as')}</p>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {/^\+?\d{7,15}$/.test((displayUsername || '').replace(/[\s-]/g, '')) ? 'Root Admin' : displayUsername}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{activeRole}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-2.5 text-xs font-bold rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-all cursor-pointer shadow-2xs"
              style={{ color: '#ff5252' }}
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>{t('sign_out_terminal_button', 'Sign Out Terminal')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main ref={mainScrollRef} className="root-admin-dashboard__main flex-1 md:pl-64 overflow-auto">
        {/* Top Bar */}
        <header className="root-admin-dashboard__topbar bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-3 py-2.5 lg:px-8 lg:py-4 flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={t('toggle_sidebar_tooltip', 'Toggle Sidebar Menu')}
              aria-label={t('toggle_sidebar_aria', 'Toggle Sidebar Navigation')}
              className="md:hidden p-2 -ml-1 text-slate-600 dark:text-slate-300 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-lg lg:text-2xl font-bold text-slate-900 dark:text-white truncate">
                {activeSection === 'dashboard' && t('root_dashboard_label', 'Dashboard')}
                {activeSection === 'tenants_properties' && t('root_tenants_properties_label', 'Tenants & Properties')}
                {activeSection === 'edit_main_menu' && t('root_edit_main_menu_label', 'Edit Main Menu')}
                {activeSection === 'default_expenses' && t('root_default_expenses_heading_label', 'Default Expenses (MultiKey)')}
                {activeSection === 'service_request_types' && t('root_service_request_types_heading', 'Service Request Types')}
                {activeSection === 'appearance' && t('root_appearance_heading_label', 'Appearance Settings')}
                {activeSection === 'telegram_templates' && t('root_telegram_templates_label', 'Telegram Templates')}
                {activeSection === 'email_settings' && t('root_email_settings_label', 'Email Settings')}
                {activeSection === 'account_settings' && t('root_account_settings_label', 'Account Settings')}
                {activeSection === 'db_sync' && t('root_db_sync_label', 'Sync to Local')}
                {activeSection === 'demo_data' && t('root_demo_data_label', 'Reset Demo Data')}
              </h2>
              <p className="hidden sm:block text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
                {activeSection === 'dashboard' && t('root_dashboard_subtitle', 'System overview and analytics')}
                {activeSection === 'tenants_properties' && t('root_tenants_properties_subtitle', 'Manage all tenants and their properties')}
                {activeSection === 'edit_main_menu' && t('root_edit_main_menu_subtitle', 'Global navigation menu for all properties')}
                {activeSection === 'default_expenses' && t('root_default_expenses_subtitle', 'System expense categories and defaults')}
                {activeSection === 'service_request_types' && t('root_service_request_types_subtitle', 'Per-property service request quick-pick categories')}
                {activeSection === 'appearance' && t('root_appearance_subtitle', 'Customize theme colors and CSS styling')}
                {activeSection === 'telegram_templates' && t('root_telegram_templates_subtitle', "One shared template set for the whole platform - edit wording here. Group routing, test pings, and bot setup are configured per-property, on that property's own Telegram Alerts Config page.")}
                {activeSection === 'email_settings' && t('root_email_settings_subtitle', 'SMTP connection and the tenant welcome email/WhatsApp message template')}
                {activeSection === 'account_settings' && t('root_account_settings_subtitle', 'Edit your root admin username, passcode, email, phone and GSTIN')}
                {activeSection === 'db_sync' && t('root_db_sync_subtitle', 'Download a full copy of the live database to keep local dev in sync')}
                {activeSection === 'demo_data' && t('root_demo_data_subtitle', 'Regenerate sample guests, menu, inventory and staff on the public demo property')}
              </p>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="root-admin-dashboard__content max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {/* Dashboard Section */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{t('system_status_label', 'System Status')}</p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">{t('online_status', 'Online')}</p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 rounded-xl flex items-center justify-center">
                      <div className="w-3 h-3 bg-emerald-600 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{t('global_css_configured_label', 'Global CSS Configured')}</p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">{t('yes_status', 'Yes')}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/50 rounded-xl flex items-center justify-center">
                      <Paintbrush className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{t('admin_level_label', 'Admin Level')}</p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">{t('root_level', 'Root')}</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/50 rounded-xl flex items-center justify-center">
                      <span className="text-lg font-bold text-purple-600 dark:text-purple-400">∞</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('system_information_heading', 'System Information')}</h3>
                  <button
                    type="button"
                    onClick={() => goToSection('account_settings')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> {t('edit_account_button', 'Edit')}
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">{t('current_role_label', 'Current Role')}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{activeRole}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">{t('username_label', 'Username')}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{displayUsername}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">{t('access_level_label', 'Access Level')}</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">{t('full_system_access_label', 'Full System Access')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tenants & Properties Section */}
          {activeSection === 'tenants_properties' && (
            <PlatformPropertyManagement username={username} onLogout={onLogout} />
          )}

          {/* Default Expenses Section */}
          {activeSection === 'default_expenses' && (
            <DefaultExpensesManager />
          )}

          {/* Service Request Types Section */}
          {activeSection === 'service_request_types' && (
            <ServiceRequestTypesManager />
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

          {/* Telegram Templates Section - wording only. This page edits the one
              shared template set for the whole platform; per-property "Send
              to:" group routing, test pings, and bot setup are all property-
              specific and live on that property's own Telegram Alerts Config
              page instead (root admin can reach any property directly via
              "Visit Tenant Dashboard" on the Tenants & Properties screen). */}
          {activeSection === 'telegram_templates' && (
            <div className="space-y-4">
              {/* RootAdminDashboard sits outside the property-scoped AuthProvider
                  tree (needed so TelegramNotificationModal's useAuth() call
                  doesn't crash). templateCustomizationEnabled=true is what
                  actually grants edit access here - reaching this dashboard
                  at all already means root admin. */}
              <AuthProvider>
                <TelegramNotificationModal
                  isEmbedded
                  hideRoutingControls
                  telegramConfig={NOOP_TELEGRAM_CONFIG}
                  onUpdateConfig={noop}
                  dispatchLogs={[]}
                  onSendTestNotification={noop}
                  kitchenModuleEnabled={true}
                  templateCustomizationEnabled={true}
                />
              </AuthProvider>
            </div>
          )}

          {/* Email Settings Section */}
          {activeSection === 'email_settings' && <EmailSettingsPanel />}

          {/* Account Settings Section */}
          {activeSection === 'account_settings' && (
            <AccountSettings username={displayUsername} onUsernameChange={handleUsernameChange} />
          )}

          {/* DB Sync Section */}
          {activeSection === 'db_sync' && (
            <div className="max-w-2xl bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/50 rounded-xl flex items-center justify-center shrink-0">
                  <DatabaseBackup className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('root_db_sync_heading', 'Download Live Database')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t('root_db_sync_description', 'Downloads a full mysqldump of the live database (structure + all data) so you can import it into local dev and keep it in sync with whatever real data now exists on the live site.')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadLiveDb}
                disabled={isExportingDb}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                {isExportingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
                {isExportingDb ? t('root_db_sync_exporting', 'Exporting...') : t('root_db_sync_download_button', 'Download .sql File')}
              </button>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {t('root_db_sync_import_hint', 'After downloading, import it into your local MySQL (e.g. via phpMyAdmin\'s Import tab, or `mysql -u root artists_farm_resort < file.sql`).')}
              </p>
            </div>
          )}

          {/* Reset Demo Data Section */}
          {activeSection === 'demo_data' && (
            <div className="max-w-2xl bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-950/50 rounded-xl flex items-center justify-center shrink-0">
                  <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('root_demo_data_heading', 'Reset Public Demo Data')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t('root_demo_data_description', "Wipes and regenerates the public demo property's guests, bookings, menu, inventory, staff and expenses with fresh sample data. Only ever affects the one property flagged as the public demo - never a real tenant.")}
                  </p>
                </div>
              </div>

              {isLoadingDemoProperty && (
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('root_demo_data_checking', 'Checking for a public demo property...')}
                </p>
              )}

              {!isLoadingDemoProperty && demoPropertyError && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{demoPropertyError}</span>
                </div>
              )}

              {!isLoadingDemoProperty && demoProperty && (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {t('root_demo_data_target_label', 'Target property:')} <span className="font-bold text-slate-900 dark:text-white">{demoProperty.name}</span>
                    <span className="text-slate-400 dark:text-slate-500"> ({demoProperty.slug})</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleResetDemoData}
                    disabled={isResettingDemo}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                  >
                    {isResettingDemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isResettingDemo ? t('root_demo_data_resetting', 'Resetting...') : t('root_demo_data_reset_button', 'Reset Demo Data')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <ScrollToTopButton scrollContainerRef={mainScrollRef} />
    </div>
  );
};
