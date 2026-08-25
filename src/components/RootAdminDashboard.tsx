import React, { useState, useEffect, useRef } from 'react';
import { LogOut, BarChart3, Building2, Paintbrush, Menu, Eye, Palette, DollarSign, Send, Mail, Bell, UserCog, Pencil, DatabaseBackup, Loader2, RefreshCw, AlertTriangle, UserRound, Receipt, Package, Bot, Server } from './icons/FlowbiteIcons';
import { Card } from 'flowbite-react';
import { KpiCard } from './KpiCard';
import { Button } from './Button';
import { ToggleSwitch } from './ToggleSwitch';
import { t } from '../i18n/en';
import { AppearanceSettings } from './AppearanceSettings';
import { PlatformPropertyManagement } from './PlatformPropertyManagement';
import { NavMenuEditor } from './NavMenuEditor';
import { DefaultExpensesManager } from './DefaultExpensesManager';
import { SystemStockManager } from './SystemStockManager';
import { CronJobsManager } from './CronJobsManager';
import { DefaultBillsManager } from './DefaultBillsManager';
import { ServiceRequestTypesManager } from './ServiceRequestTypesManager';
import { TelegramNotificationModal } from './TelegramNotificationModal';
import { TelegramHealthPanel } from './TelegramHealthPanel';
import { EmailSettingsPanel } from './EmailSettingsPanel';
import { AccountSettings } from './AccountSettings';
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

type SectionType = 'dashboard' | 'tenants_properties' | 'appearance' | 'edit_main_menu' | 'default_expenses' | 'default_bills' | 'service_request_types' | 'system_stock' | 'telegram_templates' | 'email_settings' | 'account_settings' | 'db_sync' | 'demo_data' | 'ai_services' | 'cron_jobs';

const VALID_SECTIONS: SectionType[] = ['dashboard', 'tenants_properties', 'appearance', 'edit_main_menu', 'default_expenses', 'default_bills', 'service_request_types', 'system_stock', 'telegram_templates', 'email_settings', 'account_settings', 'db_sync', 'demo_data', 'ai_services', 'cron_jobs'];

export const RootAdminDashboard: React.FC<RootAdminDashboardProps> = ({
  username,
  onLogout,
  activeRole,
}) => {
  // This dashboard scrolls its own <main> (overflow-auto below) rather than
  // the window, unlike the other page shells - used to reset scroll position
  // to top on tab change (see below).
  const mainScrollRef = useRef<HTMLElement>(null);

  const [activeSection, setActiveSection] = useState<SectionType>(() => {
    const fromHash = window.location.hash.replace('#', '') as SectionType;
    if (VALID_SECTIONS.includes(fromHash)) return fromHash;
    const saved = localStorage.getItem('root_dashboard_section');
    return (saved as SectionType) || 'dashboard';
  });

  // Auto-scroll section container to top whenever activeSection changes
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [activeSection]);

  const [navItems, setNavItems] = useState<any[]>([]);
  const [navItemsError, setNavItemsError] = useState<string | null>(null);
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

  const [aiConfig, setAiConfig] = useState({
    enabled: false,
    provider: 'gemini',
    api_key: '',
    custom_endpoint: 'http://localhost:11434/v1',
  });
  // SECURITY (24 Aug 2026): the server never sends the real api_key back any more (see
  // ai_config.php's GET handler) - only whether one is already on file. The password input below
  // stays blank until the admin types a NEW key; leaving it blank on save intentionally keeps
  // whatever key is already stored (server-side no-op on an empty api_key field).
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);

  useEffect(() => {
    fetch('/php/api/ai_config.php')
      .then((res) => res.json())
      .then((resData) => {
        if (resData && resData.data) {
          setAiConfig((prev) => ({ ...prev, ...resData.data, api_key: '' }));
          setHasApiKey(!!resData.data.has_api_key);
        }
      })
      .catch((err) => console.error('Failed to load AI config:', err));
  }, []);

  const handleToggleAiModeHeader = async (enabled: boolean) => {
    setAiConfig((prev) => ({ ...prev, enabled }));
    try {
      await fetch('/php/api/ai_config.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      showToast(`Online AI API turned ${enabled ? 'ON' : 'OFF (Offline Engine Active)'}`, {
        type: enabled ? 'info' : 'warning',
      });
    } catch (err) {
      showToast('Failed to update AI Mode', { type: 'error' });
    }
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAiConfig(true);
    try {
      const res = await fetch('/php/api/ai_config.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiConfig),
      });
      const resData = await res.json();
      if (resData?.status === 'success') {
        // Clear the typed key back out of local state and re-derive hasApiKey from the server's
        // response - never keep holding a just-typed real key in memory longer than the request.
        setAiConfig((prev) => ({ ...prev, ...resData.data, api_key: '' }));
        setHasApiKey(!!resData.data?.has_api_key);
        showToast('AI Provider Settings saved successfully!', { type: 'success' });
      } else {
        showToast(resData?.message || 'Failed to save AI Settings', { type: 'error' });
      }
    } catch (err) {
      showToast('Failed to save AI Settings', { type: 'error' });
    } finally {
      setIsSavingAiConfig(false);
    }
  };

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
        setNavItemsError(null);
        try {
          const response = await fetch('/php/api/router.php?action=get_nav_menu', {
            credentials: 'include',
          });
          // fetch() only rejects on a genuine network failure - a 401/403/500
          // response still resolves normally, so without this check an error
          // response silently left navItems at its empty default with no
          // indication anything went wrong (found 21 Aug 2026, reported as
          // "Menu Structure shows 0 items" with no error visible anywhere).
          const data = await response.json().catch(() => null);
          if (response.ok && data?.status === 'success' && Array.isArray(data.data)) {
            setNavItems(data.data);
          } else if (response.status === 401 || response.status === 403) {
            // Same fix as PlatformPropertyManagement.tsx's fetchData() (23 Aug
            // 2026, reported live via a screenshot of exactly this - a red
            // "Authentication required." banner sitting above a fully-rendered
            // but non-functional NavMenuEditor shell, "0 items", "Menu is
            // empty"). An error banner alone still leaves a page that LOOKS
            // interactive but silently does nothing on every click, which
            // reads as broken/buggy rather than "please log in again" - once
            // the session is confirmed truly invalid there's nothing useful
            // left to show here, so go straight back to the login screen.
            // handleLogout() (not the raw onLogout prop) - same call the
            // sidebar's own Sign Out button uses, since it also clears
            // artists_farm_user_session and hard-redirects to /login/.
            handleLogout();
            return;
          } else {
            setNavItemsError(data?.message || `Failed to load menu items (HTTP ${response.status}).`);
          }
        } catch (err: any) {
          console.error('Failed to load nav items:', err);
          setNavItemsError(err?.message || 'Network error while loading menu items.');
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
      id: 'default_bills',
      label: 'Default Bills (MK)',
      icon: Receipt,
      section: 'default_bills' as SectionType,
    },
    {
      id: 'system_stock',
      label: t('root_system_stock_label', 'System Stock Catalog'),
      icon: Package,
      section: 'system_stock' as SectionType,
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
      icon: Pencil,
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
    {
      id: 'ai_services',
      label: 'AI Services Config',
      icon: Bot,
      section: 'ai_services' as SectionType,
    },
    {
      id: 'cron_jobs',
      label: 'Cron Jobs',
      icon: Server,
      section: 'cron_jobs' as SectionType,
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
          className="fixed inset-0 z-[55] bg-slate-900/50 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`root-admin-dashboard__sidebar fixed top-0 left-0 z-[55] h-screen w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-200 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-gray-800 flex flex-col justify-between">
          <div className="space-y-1">
            {/* Branding */}
            <div className="px-3 pb-3 mb-2 border-b border-gray-200 dark:border-gray-700">
              <h1 className="root-admin-dashboard__page-title text-sm font-semibold text-gray-900 dark:text-white">{t('root_admin_branding', 'Root Admin')}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('system_management_label', 'System Management')}</p>
            </div>

            <div className="px-3 pb-2 mb-2 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400">
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
                  className={`w-full flex items-center p-2 text-sm font-medium rounded-lg group transition duration-75 cursor-pointer ${
                    isActive
                      ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-blue-400 font-semibold'
                      : 'text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className={`w-5 h-5 transition duration-75 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white'}`} />
                  <span className="ms-3 flex-1 text-left truncate">{item.label}</span>
                </button>
              );
            })}

            {/* Telescope Monitoring Link */}
            <button
              type="button"
              onClick={handleTelescopeOpen}
              className="w-full flex items-center p-2 text-sm font-medium rounded-lg transition duration-75 cursor-pointer text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-900 dark:hover:text-purple-100"
              title={t('telescope_error_center_tooltip', 'Open Telescope Error Center - View user problems and system errors')}
            >
              <Eye className="w-5 h-5 shrink-0 text-purple-500 dark:text-purple-400" />
              <span className="ms-3 flex-1 text-left truncate">{t('telescope_monitor_label', 'Telescope Monitor')}</span>
            </button>
          </div>

          <div className="pt-3 mt-auto border-t border-gray-200 dark:border-gray-700 space-y-2">
            <div className="navigation__user-profile flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 ring-2 ring-blue-500/30 shrink-0">
                <UserRound className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                  {(() => {
                    if (typeof window !== 'undefined') {
                      try {
                        const raw = localStorage.getItem('artists_farm_user_session');
                        if (raw) {
                          const parsed = JSON.parse(raw);
                          if (parsed?.name) return parsed.name;
                        }
                      } catch (e) {}
                    }
                    return /^\+?\d{7,15}$/.test((displayUsername || '').replace(/[\s-]/g, '')) ? 'Root Admin' : displayUsername;
                  })()}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-2.5 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-all cursor-pointer shadow-2xs"
              style={{ color: '#ff5252' }}
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>{t('sign_out_terminal_button', 'Sign Out Terminal')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main ref={mainScrollRef} className="root-admin-dashboard__main flex-1 md:pl-64 min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Top Bar */}
        <header className="root-admin-dashboard__topbar bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 h-16 flex items-center">
          <div className="max-w-7xl w-full mx-auto px-4 lg:px-8 flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={t('toggle_sidebar_tooltip', 'Toggle Sidebar Menu')}
              aria-label={t('toggle_sidebar_aria', 'Toggle Sidebar Navigation')}
              className="md:hidden p-2 -ml-1 text-gray-500 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600 transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="min-w-0">
              <h2 className="root-admin-dashboard__title text-lg lg:text-xl font-semibold text-gray-900 dark:text-white truncate">
                {activeSection === 'dashboard' && t('root_dashboard_label', 'Dashboard')}
                {activeSection === 'tenants_properties' && t('root_tenants_properties_label', 'Tenants & Properties')}
                {activeSection === 'edit_main_menu' && t('root_edit_main_menu_label', 'Edit Main Menu')}
                {activeSection === 'default_expenses' && t('root_default_expenses_heading_label', 'Default Expenses (MultiKey)')}
                {activeSection === 'default_bills' && 'Default Bills (MultiKey)'}
                {activeSection === 'service_request_types' && t('root_service_request_types_heading', 'Service Request Types')}
                {activeSection === 'appearance' && t('root_appearance_heading_label', 'Appearance Settings')}
                {activeSection === 'telegram_templates' && t('root_telegram_templates_label', 'Telegram Templates')}
                {activeSection === 'email_settings' && t('root_email_settings_label', 'Email Settings')}
                {activeSection === 'account_settings' && t('root_account_settings_label', 'Account Settings')}
                {activeSection === 'db_sync' && t('root_db_sync_label', 'Sync to Local')}
                {activeSection === 'demo_data' && t('root_demo_data_label', 'Reset Demo Data')}
                {activeSection === 'system_stock' && t('root_system_stock_label', 'System Stock Catalog')}
                {activeSection === 'ai_services' && 'AI Services & Provider Config'}
                {activeSection === 'cron_jobs' && 'Cron Jobs'}
              </h2>
            </div>
            {/* The "Online AI API" toggle used to also render here, unconditionally,
                for every section (Default Bills, Tenants & Properties, Appearance,
                etc.) - not just AI Services, where the exact same control (same
                aiConfig state, same handleToggleAiModeHeader handler) already lives
                in its own properly-scoped card below. Found 24 Aug 2026 from a
                mobile screenshot of the Default Bills screen: this out-of-place
                copy competed with the section title for space in a single header
                row with no wrap fallback, clipping off-screen and forcing a
                horizontal scrollbar on narrow viewports - and on the ai_services
                section itself it rendered as a literal duplicate of the section's
                own toggle. Removed rather than reduced/hidden-below-breakpoint,
                since the properly-placed one already covers every real use case. */}
          </div>
        </header>

        {/* â”€â”€ Section Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="max-w-7xl mx-auto px-3 py-4 lg:px-8 lg:py-6">

          {/* Dashboard */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard
                  label={t('root_total_properties_label', 'Total Properties')}
                  value="—"
                  icon={Building2}
                />
                <KpiCard
                  label={t('root_active_tenants_label', 'Active Tenants')}
                  value="—"
                  icon={UserRound}
                />
                <KpiCard
                  label={t('root_appearance_menu_label', 'Appearance')}
                  value="—"
                  icon={Paintbrush}
                />
              </div>
              <Card className="shadow-md">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('root_dashboard_hint', 'Use the sidebar to navigate to any section. Select "Tenants & Properties" to manage all properties and tenants.')}
                </p>
              </Card>
            </div>
          )}

          {/* Tenants & Properties */}
          {activeSection === 'tenants_properties' && (
            <PlatformPropertyManagement username={displayUsername} onLogout={handleLogout} />
          )}

          {/* Default Expenses */}
          {activeSection === 'default_expenses' && (
            <DefaultExpensesManager onLogout={handleLogout} />
          )}

          {/* Default Bills */}
          {activeSection === 'default_bills' && (
            <DefaultBillsManager onLogout={handleLogout} />
          )}

          {/* System Stock */}
          {activeSection === 'system_stock' && (
            <SystemStockManager onLogout={handleLogout} />
          )}

          {/* Cron Jobs */}
          {activeSection === 'cron_jobs' && (
            <CronJobsManager />
          )}

          {/* Service Request Types */}
          {activeSection === 'service_request_types' && (
            <ServiceRequestTypesManager />
          )}

          {/* Edit Main Menu */}
          {activeSection === 'edit_main_menu' && (
            <>
              {navItemsError && (
                <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{navItemsError}</span>
                </div>
              )}
              <NavMenuEditor
                navItems={navItems}
                onUpdateNavItems={setNavItems}
                activeRole={activeRole}
                hideKitchenItems={false}
              />
            </>
          )}

          {/* Appearance Settings */}
          {activeSection === 'appearance' && (
            <AppearanceSettings activeRole={activeRole} />
          )}

          {/* Telegram Templates - wording only. This page edits the one
              shared template set for the whole platform; per-property "Send
              to:" group routing, test pings, and bot setup are all property-
              specific and live on that property's own Telegram Alerts Config
              page instead (root admin can reach any property directly via
              "Visit Tenant Dashboard" on the Tenants & Properties screen). */}
          {activeSection === 'telegram_templates' && (
            <div className="space-y-4">
              <TelegramHealthPanel />

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

          {/* Email Settings */}
          {activeSection === 'email_settings' && <EmailSettingsPanel onLogout={handleLogout} />}

          {/* Account Settings */}
          {activeSection === 'account_settings' && (
            <AccountSettings username={displayUsername} onUsernameChange={handleUsernameChange} onLogout={handleLogout} />
          )}

          {/* DB Sync */}
          {activeSection === 'db_sync' && (
            <Card className="max-w-2xl shadow-md space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/50 rounded-lg flex items-center justify-center shrink-0">
                  <DatabaseBackup className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="root-admin-dashboard__subtitle text-sm font-semibold text-slate-900 dark:text-white">
                    {t('root_db_sync_heading', 'Download Live Database')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t('root_db_sync_description', 'Downloads a full mysqldump of the live database (structure + all data) so you can import it into local dev and keep it in sync with whatever real data now exists on the live site.')}
                  </p>
                </div>
              </div>
              <Button variant="primary" size="lg" onClick={handleDownloadLiveDb} disabled={isExportingDb}>
                {isExportingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
                {isExportingDb ? t('root_db_sync_exporting', 'Exporting...') : t('root_db_sync_download_button', 'Download .sql File')}
              </Button>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {t('root_db_sync_import_hint', 'After downloading, import it into your local MySQL (e.g. via phpMyAdmin\'s Import tab, or `mysql -u root artists_farm_resort < file.sql`).')}
              </p>
            </Card>
          )}

          {/* Reset Demo Data */}
          {activeSection === 'demo_data' && (
            <Card className="max-w-2xl shadow-md space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-950/50 rounded-lg flex items-center justify-center shrink-0">
                  <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="root-admin-dashboard__subtitle text-sm font-semibold text-slate-900 dark:text-white">
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
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{demoPropertyError}</span>
                </div>
              )}

              {!isLoadingDemoProperty && demoProperty && (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {t('root_demo_data_target_label', 'Target property:')} <span className="font-semibold text-slate-900 dark:text-white">{demoProperty.name}</span>
                    <span className="text-slate-400 dark:text-slate-500"> ({demoProperty.slug})</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleResetDemoData}
                    disabled={isResettingDemo}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-xs"
                  >
                    {isResettingDemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isResettingDemo ? t('root_demo_data_resetting', 'Resetting...') : t('root_demo_data_reset_button', 'Reset Demo Data Now')}
                  </button>
                </>
              )}
            </Card>
          )}

          {/* AI Services Configuration Section */}
          {activeSection === 'ai_services' && (
            <div className="space-y-6">
              <Card className="shadow-md">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">AI Services & Provider Configuration</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Choose between Offline Engine & Online AI APIs (Gemini, OpenAI, Claude, Ollama)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Online AI API:</span>
                    <ToggleSwitch
                      enabled={aiConfig.enabled}
                      onChange={(val) => handleToggleAiModeHeader(val)}
                    />
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${aiConfig.enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                      {aiConfig.enabled ? 'ONLINE' : 'OFFLINE MODE'}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSaveAiConfig} className="mt-6 space-y-5">
                  {/* Provider Selector */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                      Online AI Service Provider
                    </label>
                    <select
                      value={aiConfig.provider}
                      onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 text-xs rounded-lg p-2.5 outline-none focus:border-blue-500 font-semibold"
                    >
                      <option value="gemini">Google Gemini (gemini-1.5-flash) - Default</option>
                      <option value="openai">OpenAI (gpt-4o-mini / gpt-4o)</option>
                      <option value="claude">Anthropic Claude (claude-3-5-sonnet)</option>
                      <option value="custom_ollama">Custom Local LLM / Ollama (http://localhost:11434/v1)</option>
                    </select>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      {aiConfig.provider === 'gemini' && 'Google Gemini 1.5 Flash offers high-speed responses and broad language understanding.'}
                      {aiConfig.provider === 'openai' && 'OpenAI GPT-4o-mini provides robust reasoning and structured JSON output.'}
                      {aiConfig.provider === 'claude' && 'Anthropic Claude 3.5 Sonnet delivers detailed, high-accuracy responses.'}
                      {aiConfig.provider === 'custom_ollama' && 'Connect to a local Ollama server running on your network.'}
                    </p>
                  </div>

                  {/* API Key Input */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                      API Key ({aiConfig.provider.toUpperCase()})
                      {hasApiKey && (
                        <span className="text-2xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Key on file
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={aiConfig.api_key}
                      onChange={(e) => setAiConfig({ ...aiConfig, api_key: e.target.value })}
                      placeholder={hasApiKey ? '•••••••••••••• (leave blank to keep current key)' : (aiConfig.provider === 'gemini' ? 'AIzaSy...' : 'sk-...')}
                      className="w-full bg-slate-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 text-xs rounded-lg p-2.5 outline-none focus:border-blue-500 font-mono"
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      The saved key is never sent back to this page - only Root Admins can view or change it, and it's never shown in plaintext once saved.
                    </p>
                  </div>

                  {/* Custom Endpoint URL (if Custom Ollama selected) */}
                  {aiConfig.provider === 'custom_ollama' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                        Custom Base URL / Endpoint
                      </label>
                      <input
                        type="text"
                        value={aiConfig.custom_endpoint}
                        onChange={(e) => setAiConfig({ ...aiConfig, custom_endpoint: e.target.value })}
                        placeholder="http://localhost:11434/v1"
                        className="w-full bg-slate-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 text-xs rounded-lg p-2.5 outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={isSavingAiConfig}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer"
                    >
                      {isSavingAiConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>Save AI Provider Settings</span>
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
