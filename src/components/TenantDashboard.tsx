import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2, LogOut, Plus, AlertCircle,
  Pencil, Trash2, ExternalLink, CheckCircle, Layers,
  Home, TrendingUp, ChevronRight, Lock, Zap, User, UserRound,
  Calendar, Bell, ArrowRight, HelpCircle, LayoutDashboard,
  CreditCard, Menu, X, KeyRound, Eye, EyeOff, Save, Loader2
} from './icons/FlowbiteIcons';
import { Popover } from './Popover';
import { StyledSelect } from './StyledSelect';
import { LoadingScreen } from './LoadingScreen';
import { API_ROOT_BASE, apiFetch } from '../services/api';
import { Button } from './Button';
import { Input } from './Input';
import { useToast } from './ToastContext';
import { Alert as FlowbiteAlert, Modal, Toast as FlowbiteToast, ToastToggle } from 'flowbite-react';
import { KpiCard } from './KpiCard';
import { ToggleSwitch } from './ToggleSwitch';
import { PropertyCreationWizard } from './PropertyCreationWizard';
import { SubscriptionPanel } from './SubscriptionPanel';
import { TermsAcceptanceModal } from './TermsAcceptanceModal';
import { DashboardFooter } from './DashboardFooter';
import { LegalDrawer, LegalTabType } from './LegalDrawer';
import { t } from '../i18n/en';

interface SlotBreakdownItem {
  id: number;
  name: string;
  slug: string;
  property_type: string;
  is_active: number;
  slots_used: number;
}

interface SlotUsage {
  total_slots: number;
  used_slots: number;
  remaining_slots: number;
  breakdown: SlotBreakdownItem[];
}

interface Property {
  id: number;
  name: string;
  slug: string;
  property_type?: string;
  is_active: number;
  room_count?: number;
  status?: string;
  gstin?: string;
  telegram_template_customization_enabled?: number;
  email?: string;
  phone?: string;
  address?: string;
  google_maps_link?: string;
  whatsapp_voucher_template?: string;
  instructions?: string;
  upi_id?: string;
  upi_qr_code_url?: string;
  walk_in_table_count?: number;
  checkin_time?: string | null;
  checkout_time?: string | null;
  default_tariff?: number | null;
}

interface TenantInfo {
  id: number;
  name: string;
  slug: string;
  max_properties: number;
  subscription_plan: string;
  subscription_status: string;
  is_demo?: number | boolean;
}

interface TenantDashboardProps {
  username: string;
  tenantId: number;
  tenantInfo?: TenantInfo;
  onLogout: () => void;
  isPlatformAdmin?: boolean;
}

type TenantTab = 'dashboard' | 'analytics' | 'properties' | 'account' | 'billing';

type ModalState =
  | { type: 'none' }
  | { type: 'wizard'; property?: Property }
  | { type: 'edit'; property: Property }
  | { type: 'delete'; property: Property }
  | { type: 'upgrade' };

export const TenantDashboard: React.FC<TenantDashboardProps> = ({
  username,
  tenantId,
  tenantInfo: propTenantInfo,
  onLogout,
  isPlatformAdmin = false,
}) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [slotUsage, setSlotUsage] = useState<SlotUsage | null>(null);
  const [tenantInfo] = useState<TenantInfo | null>(propTenantInfo || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [legalDrawerTab, setLegalDrawerTab] = useState<LegalTabType>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [selectedAnalyticsPropId, setSelectedAnalyticsPropId] = useState<string>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TenantTab>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').trim();
      if (['dashboard', 'analytics', 'properties', 'account', 'billing'].includes(hash)) {
        return hash as TenantTab;
      }
      if (hash === 'overview') return 'dashboard';
      if (hash === 'subscription') return 'billing';
    }
    return 'dashboard';
  });

  const handleTabChange = (tab: TenantTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.location.hash = tab;
    }
    setIsSidebarOpen(false);
  };

  const { showToast } = useToast();
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [showPasscodes, setShowPasscodes] = useState(false);
  const [isSavingPasscode, setIsSavingPasscode] = useState(false);

  const handleUpdatePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPasscode) {
      showToast('Please enter your current passcode', { type: 'warning' });
      return;
    }
    if (!/^\d{6}$/.test(newPasscode)) {
      showToast('New passcode must be exactly 6 digits', { type: 'warning' });
      return;
    }
    if (newPasscode !== confirmPasscode) {
      showToast('New passcodes do not match', { type: 'warning' });
      return;
    }

    setIsSavingPasscode(true);
    try {
      const res = await apiFetch('/php/api/router.php?action=change_super_admin_passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_passcode: currentPasscode,
          new_passcode: newPasscode,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || 'Passcode updated successfully!', { type: 'success' });
        setCurrentPasscode('');
        setNewPasscode('');
        setConfirmPasscode('');
      } else {
        showToast(json.message || 'Failed to update passcode', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || 'Error updating passcode', { type: 'error' });
    } finally {
      setIsSavingPasscode(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const safeProperties = useMemo(() => (Array.isArray(properties) ? properties : []), [properties]);
  const safeGuests = useMemo(() => (Array.isArray(guests) ? guests : []), [guests]);
  const safeServiceRequests = useMemo(() => (Array.isArray(serviceRequests) ? serviceRequests : []), [serviceRequests]);

  const filteredGuestsForAnalytics = useMemo(() => {
    if (selectedAnalyticsPropId === 'all') return safeGuests;
    return safeGuests.filter((g) => String(g.property_id || g.propertyId) === String(selectedAnalyticsPropId));
  }, [safeGuests, selectedAnalyticsPropId]);

  const filteredServiceRequestsForAnalytics = useMemo(() => {
    if (selectedAnalyticsPropId === 'all') return safeServiceRequests;
    return safeServiceRequests.filter((r) => String(r.property_id || r.propertyId) === String(selectedAnalyticsPropId));
  }, [safeServiceRequests, selectedAnalyticsPropId]);

  const todaysArrivalsCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return filteredGuestsForAnalytics.filter((g: any) => (g.checkinDate || g.checkin_date || '').startsWith(today)).length;
  }, [filteredGuestsForAnalytics]);

  const todaysDeparturesCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return filteredGuestsForAnalytics.filter((g: any) =>
      (g.checkoutDate || g.checkout_date || '').startsWith(today) && (g.status || '').toLowerCase().includes('checkout')
    ).length;
  }, [filteredGuestsForAnalytics]);

  const inHouseCount = useMemo(() => {
    return filteredGuestsForAnalytics.filter((g: any) =>
      ['checked in', 'checkedin', 'checked-in', 'active'].includes((g.status || '').toLowerCase())
    ).length;
  }, [filteredGuestsForAnalytics]);

  const pendingRequestsCount = useMemo(() => {
    return filteredServiceRequestsForAnalytics.filter((r: any) => (r.status || '').toLowerCase() === 'pending').length;
  }, [filteredServiceRequestsForAnalytics]);

  const totalBookingsAnalytics = filteredGuestsForAnalytics.length;

  const combinedRevenueAnalytics = useMemo(() => {
    return filteredGuestsForAnalytics.reduce((sum, g) => {
      const amt = Number(g.totalAmount ?? g.roomRate ?? g.total_amount ?? g.total_charge ?? g.advanceAmount ?? 0) || 0;
      return sum + amt;
    }, 0);
  }, [filteredGuestsForAnalytics]);

  const avgOccupancyAnalytics = useMemo(() => {
    const targetProps = selectedAnalyticsPropId === 'all'
      ? safeProperties
      : safeProperties.filter(p => String(p.id) === selectedAnalyticsPropId);

    const totalRooms = targetProps.reduce((sum, p) => sum + (p.property_type === 'MULTI_KEY' ? (p.room_count ?? 1) : 1), 0);
    if (totalRooms === 0) return 0;
    return Math.min(100, Math.round((inHouseCount / totalRooms) * 100));
  }, [safeProperties, selectedAnalyticsPropId, inHouseCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propsRes, slotRes] = await Promise.all([
        apiFetch(`/php/api/router.php?action=get_tenant_properties&tenant_id=${tenantId}`),
        apiFetch(`/php/api/router.php?action=get_tenant_slot_usage&tenant_id=${tenantId}`),
      ]);
      const propsJson = await propsRes.json();
      const slotJson = await slotRes.json();
      const rawProps = propsJson.data || propsJson;
      const propsList = Array.isArray(rawProps) ? (rawProps as Property[]) : [];
      const slotData = (slotJson.data || slotJson) as SlotUsage;

      setProperties(propsList);
      setSlotUsage(slotData);

      if (propsList.length > 0) {
        const fetchPromises = propsList.flatMap((p) => [
          apiFetch(`/php/api/router.php?action=get_guests&property_id=${p.id}&is_multi_key=${p.property_type === 'MULTI_KEY' ? 1 : 0}`),
          apiFetch(`/php/api/router.php?action=get_service_requests&property_id=${p.id}`),
        ]);
        const results = await Promise.all(fetchPromises);
        const allGuestsList: any[] = [];
        const allReqList: any[] = [];

        for (let i = 0; i < results.length; i += 2) {
          const guestsRes = results[i];
          const reqRes = results[i + 1];
          try {
            const guestsJson = await guestsRes.json();
            const reqJson = await reqRes.json();
            const gList = (guestsJson.data || guestsJson) as any[];
            const rList = (reqJson.data || reqJson) as any[];
            if (Array.isArray(gList)) allGuestsList.push(...gList);
            if (Array.isArray(rList)) allReqList.push(...rList);
          } catch (e) {
            console.error('Failed to parse guests or requests json', e);
          }
        }

        setGuests(allGuestsList);
        setServiceRequests(allReqList);
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
      setError('Failed to load dashboard data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = () => {
    localStorage.removeItem('artists_farm_user_session');
    onLogout();
    window.location.href = '/login/';
  };

  const handleToggleActive = async (property: Property) => {
    const nextActive = property.is_active ? 0 : 1;
    setProperties((prev) => prev.map((p) => (p.id === property.id ? { ...p, is_active: nextActive } : p)));
    try {
      const res = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          status: nextActive ? 'active' : 'inactive',
          is_active: nextActive,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(`Property ${nextActive ? 'activated' : 'deactivated'}`);
      } else {
        setProperties((prev) => prev.map((p) => (p.id === property.id ? { ...p, is_active: property.is_active } : p)));
        setError(data.message || 'Failed to update property status');
      }
    } catch {
      setProperties((prev) => prev.map((p) => (p.id === property.id ? { ...p, is_active: property.is_active } : p)));
      setError('Failed to update property status');
    }
  };

  const handleDeleteProperty = async (property: Property) => {
    setError(null);
    try {
      const res = await fetch('/php/api/router.php?action=delete_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: property.id }),
      });
      const data = await res.json();
      if (data.success) {
        setModal({ type: 'none' });
        showSuccess(`"${property.name}" deleted. Slots freed.`);
        await loadData();
      } else {
        setError(data.message || 'Failed to delete property');
      }
    } catch {
      setError('Failed to delete property');
    }
  };

  const remaining = slotUsage?.remaining_slots ?? 0;
  const usedSlots = slotUsage?.used_slots ?? 0;
  const totalSlots = slotUsage?.total_slots ?? 0;
  const slotPercent = totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0;

  const planColor: Record<string, string> = {
    trial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
    basic: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700',
    pro: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700',
    enterprise: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
  };

  if (loading) {
    return <LoadingScreen message={t('loading_tenant_dashboard_message', 'Loading tenant dashboard…')} />;
  }

  // Sidebar navigation menu items: dashboard, analytics, properties, account, billing
  const navMenuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      tab: 'dashboard' as TenantTab,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: TrendingUp,
      tab: 'analytics' as TenantTab,
    },
    {
      id: 'properties',
      label: 'Properties',
      icon: Building2,
      tab: 'properties' as TenantTab,
      badge: safeProperties.length > 0 ? `${safeProperties.length}` : null,
    },
    {
      id: 'account',
      label: 'Account',
      icon: UserRound,
      tab: 'account' as TenantTab,
    },
    {
      id: 'billing',
      label: 'Billing',
      icon: CreditCard,
      tab: 'billing' as TenantTab,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Mobile Dimming Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-55 bg-gray-900/50 dark:bg-gray-900/80 backdrop-blur-xs transition-opacity md:hidden"
        />
      )}

      {/* ──────────────── Sidebar Navigation ──────────────── */}
      <aside
        id="superAdminSidebar"
        aria-label="Super Admin Sidebar Navigation"
        className={`fixed top-0 left-0 bottom-0 z-56 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 flex flex-col justify-between ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar Brand Header with Safe Area Top Clearance */}
        <div className="shrink-0 h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] px-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {tenantInfo?.name ?? 'Super Admin'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                Property Control Panel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar menu"
            className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Menu Items List (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-white dark:bg-gray-800">
          <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Menu
          </div>
          <ul className="space-y-1 font-medium">
            {navMenuItems.map((item) => {
              const ItemIcon = item.icon;
              const isActive = activeTab === item.tab;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleTabChange(item.tab)}
                    className={`flex items-center w-full p-2 text-sm font-medium rounded-lg group transition duration-75 cursor-pointer ${
                      isActive
                        ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-blue-400 font-semibold'
                        : 'text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700'
                    }`}
                  >
                    <ItemIcon
                      className={`w-5 h-5 transition duration-75 shrink-0 ${
                        isActive
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white'
                      }`}
                    />
                    <span className="ms-3 flex-1 text-left whitespace-nowrap truncate">{item.label}</span>
                    {item.badge && (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 ms-3 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Sidebar Footer User Profile & Sign Out with Safe Area Bottom Clearance */}
        <div className="shrink-0 p-3 border-t border-gray-200 dark:border-gray-700 space-y-2 bg-white dark:bg-gray-800 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:pb-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleTabChange('account')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleTabChange('account');
            }}
            className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-950/40 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer shadow-2xs group"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 ring-2 ring-blue-500/30 shrink-0">
              <UserRound className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center justify-between">
                <span>{username}</span>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors shrink-0" />
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate capitalize">
                {isPlatformAdmin ? t('root_admin_label', 'Root Admin') : t('tenant_manager_label', 'Super Admin')}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center w-full p-2 text-sm font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-all cursor-pointer shadow-2xs"
            style={{ color: '#ff5252' }}
          >
            <LogOut className="w-4 h-4 text-red-500" />
            <span className="ms-3">{t('sign_out_terminal_button', 'Sign Out')}</span>
          </button>
        </div>
      </aside>

      {/* ──────────────── Top Header Bar ──────────────── */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 md:pl-64 h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] flex items-center">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={t('toggle_sidebar_tooltip', 'Toggle Sidebar Menu')}
              aria-label={t('toggle_sidebar_aria', 'Toggle Sidebar Navigation')}
              className="md:hidden p-2 -ml-1 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate flex items-center gap-2">
                <span>
                  {activeTab === 'dashboard' && (tenantInfo?.name ?? 'Dashboard')}
                  {activeTab === 'analytics' && 'Analytics'}
                  {activeTab === 'properties' && 'Properties'}
                  {activeTab === 'account' && 'Account Settings'}
                  {activeTab === 'billing' && 'Subscription & Billing'}
                </span>
                {tenantInfo?.subscription_plan && (
                  <span className={`hidden sm:inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full capitalize ${planColor[tenantInfo.subscription_plan] ?? planColor.trial}`}>
                    {tenantInfo.subscription_plan}
                  </span>
                )}
              </h1>
              <p className="text-2xs text-gray-500 dark:text-gray-400 truncate">
                {activeTab === 'dashboard' && 'Dashboard Overview & Live Operations'}
                {activeTab === 'analytics' && 'Combined Portfolio Analytics & Performance'}
                {activeTab === 'properties' && 'Create, edit, toggle active status, and access direct management portals'}
                {activeTab === 'account' && 'Super Admin Account Details & Security'}
                {activeTab === 'billing' && 'Subscription Plan, Slots & Invoices'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Help/FAQ trigger */}
            <Popover
              trigger="hover"
              placement="bottom"
              content={
                <div className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                  {t('help_tooltip', 'Help & FAQ')}
                </div>
              }
            >
              <button
                type="button"
                onClick={() => setLegalDrawerTab('faq')}
                aria-label={t('help_aria', 'Help & FAQ')}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            </Popover>
          </div>
        </div>
      </header>

      {/* ──────────────── Main Content Area ──────────────── */}
      <main className="md:pl-64 min-h-[calc(100vh-4rem)] pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-6 flex flex-col flex-1">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col justify-between space-y-6">
          <div className="space-y-6 flex-1">
          {/* Success Toast Notification */}
          {successMsg && (
            <div className="fixed top-5 right-5 z-9999 animate-toast-in">
              <FlowbiteToast className="border border-gray-200 dark:border-gray-700 shadow-xl bg-white dark:bg-gray-800">
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-500 dark:bg-green-800 dark:text-green-200">
                  <CheckCircle className="h-5 w-5" />
                  <span className="sr-only">Check icon</span>
                </div>
                <div className="ms-3 text-sm font-normal text-gray-900 dark:text-white">{successMsg}</div>
                <ToastToggle xIcon={X} onDismiss={() => setSuccessMsg(null)} />
              </FlowbiteToast>
            </div>
          )}

          {error && (
            <FlowbiteAlert color="failure" icon={AlertCircle}>
              {error}
            </FlowbiteAlert>
          )}

          {/* ═══════════ TAB 1: DASHBOARD ═══════════ */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Top Operational Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Arrivals"
                  icon={Calendar}
                  badge={{ text: 'Today', color: 'info' }}
                  value={todaysArrivalsCount}
                  layout="stacked"
                />
                <KpiCard
                  label="Departures"
                  icon={LogOut}
                  badge={{ text: 'Today', color: 'warning' }}
                  value={todaysDeparturesCount}
                  layout="stacked"
                />
                <KpiCard
                  label="Guests In-House"
                  icon={User}
                  badge={{ text: 'Active', color: 'success' }}
                  value={inHouseCount}
                  layout="stacked"
                />
                <KpiCard
                  label="Service Requests"
                  icon={Bell}
                  badge={{ text: 'Pending', color: 'failure' }}
                  value={pendingRequestsCount}
                  layout="stacked"
                />
              </div>

              {/* Slot Usage Widget */}
              <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{usedSlots}/{totalSlots}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Subscription Property Slots</p>
                      <p className="text-2xs text-gray-400 dark:text-gray-500">{remaining > 0 ? `${remaining} slot${remaining !== 1 ? 's' : ''} available` : 'All allocated slots in use'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-28 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          slotPercent >= 100 ? 'bg-red-500' : slotPercent >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(slotPercent, 100)}%` }}
                      />
                    </div>
                    {remaining > 0 ? (
                      <Button
                        variant="primary"
                        size="xs"
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                        onClick={() => setModal({ type: 'wizard' })}
                      >
                        Add Property
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="xs"
                        leftIcon={<Zap className="w-3.5 h-3.5 text-amber-500" />}
                        onClick={() => setModal({ type: 'upgrade' })}
                      >
                        Upgrade
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              {/* Quick Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 text-center shadow-2xs">
                  <TrendingUp className="w-5 h-5 text-indigo-500 mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('total_bookings_label', 'Total Bookings')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{totalBookingsAnalytics}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 text-center shadow-2xs">
                  <Building2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('combined_revenue_label', 'Combined Revenue')}</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">₹{combinedRevenueAnalytics.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 text-center shadow-2xs">
                  <Layers className="w-5 h-5 text-blue-500 mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('avg_occupancy_label', 'Avg. Occupancy')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{avgOccupancyAnalytics}%</p>
                </div>
              </div>

              {/* Properties Overview Grid */}
              <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Active Properties ({safeProperties.length})</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Launch and configure direct property PMS dashboards</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTabChange('properties')}
                    rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  >
                    View All
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {safeProperties.map((property) => {
                    const isMultiKey = property.property_type === 'MULTI_KEY';
                    const tenantSlug = tenantInfo?.slug ?? '';
                    const dashboardUrl = tenantSlug
                      ? `${API_ROOT_BASE}/${tenantSlug}/${property.slug}/#dashboard`
                      : `${API_ROOT_BASE}/${property.slug}/#dashboard`;
                    const isDraft = property.status === 'draft';

                    return (
                      <div
                        key={property.id}
                        className="flex items-center justify-between p-3.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isDraft
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                              : isMultiKey
                              ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400'
                              : 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400'
                          }`}>
                            {isMultiKey ? <Layers className="w-4.5 h-4.5" /> : <Home className="w-4.5 h-4.5" />}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">{property.name}</h4>
                            <p className="text-2xs text-gray-400 dark:text-gray-500 font-mono truncate">/{property.slug}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isDraft ? (
                            <Button
                              variant="warning"
                              size="xs"
                              onClick={() => setModal({ type: 'wizard', property })}
                            >
                              Resume
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="xs"
                              onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')}
                              leftIcon={<ExternalLink className="w-3 h-3" />}
                            >
                              Launch
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* ═══════════ TAB 2: ANALYTICS ═══════════ */}
          {activeTab === 'analytics' && (
            <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('combined_analytics_heading', 'Combined Analytics')}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('across_all_properties_subtext', 'Across all your managed properties')}</p>
                </div>
                {safeProperties.length > 1 && (
                  <div className="w-full sm:w-56">
                    <StyledSelect
                      value={selectedAnalyticsPropId}
                      onChange={(value) => setSelectedAnalyticsPropId(value)}
                      options={[
                        { value: 'all', label: t('all_properties_option', 'All Properties') },
                        ...safeProperties.map(p => ({ value: String(p.id), label: p.name })),
                      ]}
                      placeholder={t('all_properties_option', 'All Properties')}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* Analytics Top KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Arrivals"
                  icon={Calendar}
                  badge={{ text: 'Today', color: 'info' }}
                  value={todaysArrivalsCount}
                  layout="stacked"
                />
                <KpiCard
                  label="Departures"
                  icon={LogOut}
                  badge={{ text: 'Today', color: 'warning' }}
                  value={todaysDeparturesCount}
                  layout="stacked"
                />
                <KpiCard
                  label="Guests In-House"
                  icon={User}
                  badge={{ text: 'Active', color: 'success' }}
                  value={inHouseCount}
                  layout="stacked"
                />
                <KpiCard
                  label="Service Requests"
                  icon={Bell}
                  badge={{ text: 'Pending', color: 'failure' }}
                  value={pendingRequestsCount}
                  layout="stacked"
                />
              </div>

              {/* Analytics Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-5 text-center border border-gray-200 dark:border-gray-700">
                  <TrendingUp className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('total_bookings_label', 'Total Bookings')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalBookingsAnalytics}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-5 text-center border border-gray-200 dark:border-gray-700">
                  <Building2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('combined_revenue_label', 'Combined Revenue')}</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">₹{combinedRevenueAnalytics.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-5 text-center border border-gray-200 dark:border-gray-700">
                  <Layers className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('avg_occupancy_label', 'Avg. Occupancy')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgOccupancyAnalytics}%</p>
                </div>
              </div>
            </section>
          )}

          {/* ═══════════ TAB 3: PROPERTIES ═══════════ */}
          {activeTab === 'properties' && (
            <section className="space-y-5">
              <div className="flex items-center justify-end">
                {remaining > 0 ? (
                  <Button
                    id="tenant-add-property-btn"
                    leftIcon={<Plus className="w-4 h-4" />}
                    variant="primary"
                    size="sm"
                    onClick={() => setModal({ type: 'wizard' })}
                  >
                    {t('add_property_button', 'Add Property')}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="xs" leftIcon={<Zap className="w-3.5 h-3.5 text-amber-500" />} onClick={() => setModal({ type: 'upgrade' })}>
                      {t('upgrade_package_button', 'Upgrade Package')}
                    </Button>
                  </div>
                )}
              </div>

              {safeProperties.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
                  <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-300 font-semibold">{t('tenant_no_properties_yet_message', 'No properties yet')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('add_first_property_help_text', 'Add your first property to get started')}</p>
                </div>
              ) : (
                <>
                  {/* Desktop DataTable */}
                  <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-gray-600 dark:text-gray-300">
                        <thead className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th scope="col" className="px-4 py-3 whitespace-nowrap">Property Name</th>
                            <th scope="col" className="px-4 py-3 whitespace-nowrap">Type</th>
                            <th scope="col" className="px-4 py-3 whitespace-nowrap">Rooms & Slots</th>
                            <th scope="col" className="px-4 py-3 whitespace-nowrap">Status</th>
                            <th scope="col" className="px-4 py-3 whitespace-nowrap text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {safeProperties.map((property) => {
                            const isMultiKey = property.property_type === 'MULTI_KEY';
                            const roomCount = property.room_count ?? 0;
                            const tenantSlug = tenantInfo?.slug ?? '';
                            const dashboardUrl = tenantSlug
                              ? `${API_ROOT_BASE}/${tenantSlug}/${property.slug}/#dashboard`
                              : `${API_ROOT_BASE}/${property.slug}/#dashboard`;
                            const isDraft = property.status === 'draft';

                            return (
                              <tr key={property.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
                                      isDraft
                                        ? 'bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-800'
                                        : isMultiKey
                                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800'
                                        : 'bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800'
                                    }`}>
                                      {isMultiKey ? (
                                        <Layers className={`w-4.5 h-4.5 ${isDraft ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                                      ) : (
                                        <Home className={`w-4.5 h-4.5 ${isDraft ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400'}`} />
                                      )}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-gray-900 dark:text-white text-xs">{property.name || 'Untitled property'}</div>
                                      <div className="text-2xs text-gray-400 dark:text-gray-500 font-mono">/{property.slug}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                    isMultiKey
                                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                  }`}>
                                    {isMultiKey ? 'Multi-Key Property' : 'Single Property'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {isMultiKey ? (
                                    <span className="text-xs text-slate-600 dark:text-slate-300">
                                      {roomCount > 0 ? `${roomCount} room${roomCount !== 1 ? 's' : ''} · ${roomCount} slot${roomCount !== 1 ? 's' : ''}` : '0 rooms'}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400 dark:text-slate-500">1 Slot</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {isDraft ? (
                                    <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/40">
                                      Draft
                                    </span>
                                  ) : (
                                    <ToggleSwitch
                                      enabled={!!property.is_active}
                                      onChange={() => handleToggleActive(property)}
                                    />
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {isDraft ? (
                                      <Button
                                        variant="warning"
                                        size="sm"
                                        onClick={() => setModal({ type: 'wizard', property })}
                                        rightIcon={<ArrowRight className="w-3.5 h-3.5 shrink-0" />}
                                      >
                                        {t('continue_setup_button', 'Continue Setup')}
                                      </Button>
                                    ) : (
                                      <>
                                        <Button variant="primary" size="sm" onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')} leftIcon={<ExternalLink className="w-3.5 h-3.5 shrink-0" />}>
                                          {t('open_dashboard_link', 'Open Property')}
                                        </Button>
                                        <Button variant="edit" size="sm" onClick={() => setModal({ type: 'edit', property })} leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                                          Edit
                                        </Button>
                                      </>
                                    )}
                                    <Button variant="ghost" size="xs" onClick={() => setModal({ type: 'delete', property })} title={t('delete_tooltip', 'Delete')} className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                                      <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Responsive Cards */}
                  <div className="block md:hidden space-y-3">
                    {safeProperties.map((property) => {
                      const isMultiKey = property.property_type === 'MULTI_KEY';
                      const roomCount = property.room_count ?? 0;
                      const tenantSlug = tenantInfo?.slug ?? '';
                      const dashboardUrl = tenantSlug
                        ? `${API_ROOT_BASE}/${tenantSlug}/${property.slug}/#dashboard`
                        : `${API_ROOT_BASE}/${property.slug}/#dashboard`;
                      const isDraft = property.status === 'draft';

                      if (isDraft) {
                        return (
                          <div key={property.id} className="bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-800 p-4 shadow-2xs space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isMultiKey ? 'bg-amber-100/70 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800' : 'bg-amber-100/70 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800'}`}>
                                  {isMultiKey ? <Layers className="w-4 h-4 text-amber-700 dark:text-amber-400" /> : <Home className="w-4 h-4 text-amber-700 dark:text-amber-400" />}
                                </div>
                                <div>
                                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{property.name || 'Untitled property'}</h3>
                                  {property.slug && <p className="text-2xs text-slate-400 dark:text-slate-500 font-mono">/{property.slug}</p>}
                                </div>
                              </div>
                              <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/40">
                                Draft
                              </span>
                            </div>

                            <div className="pt-3 border-t border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between">
                              <Button
                                variant="warning"
                                size="sm"
                                onClick={() => setModal({ type: 'wizard', property })}
                                rightIcon={<ArrowRight className="w-3.5 h-3.5 shrink-0" />}
                              >
                                {t('continue_setup_button', 'Continue Setup')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => setModal({ type: 'delete', property })}
                                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                title={t('delete_tooltip', 'Delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={property.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isMultiKey ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200' : 'bg-teal-50 dark:bg-teal-950/60 border border-teal-200'}`}>
                                {isMultiKey ? <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <Home className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                              </div>
                              <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{property.name}</h3>
                                <p className="text-2xs text-slate-400 dark:text-slate-500 font-mono">/{property.slug}</p>
                                {isMultiKey && (
                                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {roomCount > 0 ? `${roomCount} room${roomCount !== 1 ? 's' : ''} · ${roomCount} slot${roomCount !== 1 ? 's' : ''}` : '0 rooms'}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <ToggleSwitch
                                enabled={!!property.is_active}
                                onChange={() => handleToggleActive(property)}
                              />
                            </div>
                          </div>

                          <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <Button variant="primary" size="sm" onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')} leftIcon={<ExternalLink className="w-3.5 h-3.5 shrink-0" />}>
                              {t('open_dashboard_link', 'Open Property')}
                            </Button>
                            <div className="flex items-center gap-1.5">
                              <Button variant="edit" size="sm" onClick={() => setModal({ type: 'edit', property })} leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="xs" onClick={() => setModal({ type: 'delete', property })} className="text-red-600 dark:text-red-400 hover:text-red-700">
                                <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ═══════════ TAB 4: ACCOUNT ═══════════ */}
          {activeTab === 'account' && (
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Account Details</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Manage your tenant profile, authentication security, and platform settings</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Profile Card */}
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 shadow-2xs space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
                      <UserRound className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">{username}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {isPlatformAdmin ? 'Root Platform Administrator' : 'Tenant Super Administrator'}
                      </p>
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Active Account
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-800/60">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Tenant Organization</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{tenantInfo?.name || 'Default Organization'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-800/60">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Tenant ID</span>
                      <span className="font-mono text-gray-900 dark:text-white">{tenantId}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-800/60">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Subscription Tier</span>
                      <span className="font-semibold capitalize text-indigo-600 dark:text-indigo-400">{tenantInfo?.subscription_plan || 'Active Plan'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Managed Properties</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{safeProperties.length} Active / {totalSlots} Allocated Slots</span>
                    </div>
                  </div>
                </div>

                {/* Change Passcode Card */}
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                          Change Passcode
                        </h4>
                        <p className="text-2xs text-gray-500 dark:text-gray-400">
                          Update your 6-digit numeric login PIN
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasscodes(!showPasscodes)}
                      className="text-2xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {showPasscodes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showPasscodes ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <form onSubmit={handleUpdatePasscode} className="space-y-3.5">
                    <Input
                      label="Current Passcode"
                      type={showPasscodes ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={currentPasscode}
                      onChange={(e) => setCurrentPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Current 6-digit passcode"
                      leftIcon={<Lock className="w-4 h-4 text-gray-400" />}
                      required
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="New Passcode"
                        type={showPasscodes ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="New 6-digit passcode"
                        leftIcon={<KeyRound className="w-4 h-4 text-gray-400" />}
                        error={newPasscode.length > 0 && newPasscode.length < 6 ? 'Must be 6 digits' : undefined}
                        required
                      />

                      <Input
                        label="Confirm New Passcode"
                        type={showPasscodes ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={confirmPasscode}
                        onChange={(e) => setConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Re-enter new passcode"
                        leftIcon={<KeyRound className="w-4 h-4 text-gray-400" />}
                        error={confirmPasscode.length > 0 && newPasscode !== confirmPasscode ? 'Passcodes do not match' : undefined}
                        success={confirmPasscode.length === 6 && newPasscode === confirmPasscode ? 'Passcodes match' : undefined}
                        required
                      />
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={
                          isSavingPasscode ||
                          !currentPasscode ||
                          newPasscode.length !== 6 ||
                          newPasscode !== confirmPasscode
                        }
                        leftIcon={isSavingPasscode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      >
                        {isSavingPasscode ? 'Updating...' : 'Update Passcode'}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          )}

          {/* ═══════════ TAB 5: BILLING ═══════════ */}
          {activeTab === 'billing' && (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('subscription_heading', 'Subscription & Billing')}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">View license status, slot entitlements, plan renewals, and data backup options</p>
                </div>
              </div>
              <SubscriptionPanel
                embedded
                tenantId={tenantId}
                onNavigate={(tab) => {
                  const targetProperty = safeProperties.find((p) => p.status !== 'draft') || safeProperties[0];
                  if (!targetProperty) return;
                  const tenantSlug = tenantInfo?.slug ?? '';
                  const url = tenantSlug
                    ? `${API_ROOT_BASE}/${tenantSlug}/${targetProperty.slug}/#${tab}`
                    : `${API_ROOT_BASE}/${targetProperty.slug}/#${tab}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
              />
            </section>
          )}

          </div>

          {/* Footer */}
          <DashboardFooter />
        </div>
      </main>

      {/* ──────────────── Mobile Bottom Navigation Bar ──────────────── */}
      <nav
        id="superAdminMobileBottomNav"
        aria-label="Super Admin Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] flex items-center justify-around px-2 shadow-lg"
      >
        <button
          type="button"
          onClick={() => handleTabChange('dashboard')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors cursor-pointer ${
            activeTab === 'dashboard' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('analytics')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors cursor-pointer ${
            activeTab === 'analytics' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <TrendingUp className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Analytics</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('properties')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors cursor-pointer ${
            activeTab === 'properties' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Building2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Properties</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('billing')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors cursor-pointer ${
            activeTab === 'billing' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <CreditCard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Billing</span>
        </button>

        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Menu</span>
        </button>
      </nav>

      {/* ──────────────── Modals & Drawers ──────────────── */}
      {/* Property Setup Wizard */}
      {modal.type === 'wizard' && (
        <PropertyCreationWizard
          isOpen
          onClose={() => setModal({ type: 'none' })}
          onSaved={() => { showSuccess('Property saved'); loadData(); }}
          tenantId={tenantId}
          remainingSlots={remaining}
          existingProperty={modal.property}
        />
      )}

      {/* Edit Property Modal */}
      <Modal
        show={modal.type === 'edit'}
        onClose={() => setModal({ type: 'none' })}
        dismissible
        size="lg"
        popup
        className="z-9999"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 rounded-t-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Pencil className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('tenant_edit_property_heading', 'Edit Property')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: 'none' })}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {modal.type === 'edit' && modal.property && (() => {
          const currentProp = modal.property;
          const tenantSlug = tenantInfo?.slug ?? '';
          const editPropertyUrl = tenantSlug
            ? `${API_ROOT_BASE}/${tenantSlug}/${currentProp.slug}/#edit_property`
            : `${API_ROOT_BASE}/${currentProp.slug}/#edit_property`;

          return (
            <div className="p-6 space-y-5">
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 p-4 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Property Configuration & Settings
                  </h4>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-9">
                  To modify room tariffs, check-in/checkout times, contact numbers, address, or iCal sync feeds for <strong className="font-semibold text-slate-900 dark:text-white">{currentProp.name}</strong>, please proceed to the Property Settings page.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setModal({ type: 'none' })}
                >
                  {t('cancel_button', 'Cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setModal({ type: 'none' });
                    window.open(editPropertyUrl, '_blank', 'noopener,noreferrer');
                  }}
                  leftIcon={<ExternalLink className="w-3.5 h-3.5 shrink-0" />}
                >
                  {t('open_edit_property_page_button', 'Go to Property Settings Page')}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        show={modal.type === 'delete'}
        onClose={() => { setModal({ type: 'none' }); setError(null); }}
        dismissible
        size="lg"
        popup
        className="z-9999"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 rounded-t-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('tenant_delete_property_heading', 'Delete Property')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { setModal({ type: 'none' }); setError(null); }}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {modal.type === 'delete' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm text-red-800 dark:text-red-300 space-y-1 w-full">
                  <p className="font-semibold text-red-700 dark:text-red-400">{t('permanent_irreversible_warning', 'This action is permanent and irreversible.')}</p>
                  <div className="text-xs space-y-2 mt-1">
                    <p className="font-semibold text-2xs uppercase tracking-wider text-red-600 dark:text-red-400">{t('deletion_consequences_for_label', 'Deletion Consequences for')} "{modal.property.name}":</p>
                    <ul className="list-disc list-inside space-y-1 text-red-800 dark:text-red-300">
                      <li>All <strong>active and upcoming bookings</strong> (present and future stays) will be permanently deleted.</li>
                      <li>Past bookings (checked-out/cancelled) and associated financial ledger records <strong>will remain intact</strong> for historical audit trail.</li>
                      <li>Menus, inventory stock list, modules, and staff assignments will be deleted.</li>
                    </ul>
                  </div>
                  {(modal.property.room_count ?? 0) > 0 && (
                    <p className="text-[11px] font-semibold mt-1">Note: This will also delete all {modal.property.room_count} sub-rooms.</p>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Deleting this property will free{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {modal.property.property_type === 'MULTI_KEY' ? (modal.property.room_count ?? 1) : 1} slot(s)
                </span>{' '}
                back to your subscription.
              </p>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 rounded-b-lg">
              <Button variant="secondary" size="sm" onClick={() => { setModal({ type: 'none' }); setError(null); }}>
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button
                id="confirm-delete-property-btn"
                variant="danger"
                size="sm"
                onClick={() => handleDeleteProperty(modal.property)}
              >
                {t('delete_permanently_button', 'Delete Permanently')}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Upgrade Package Modal */}
      <Modal
        show={modal.type === 'upgrade'}
        onClose={() => setModal({ type: 'none' })}
        dismissible
        size="lg"
        popup
        className="z-9999"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Zap className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('upgrade_package_button', 'Upgrade Package')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: 'none' })}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto shadow-lg">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{t('upgrade_package_button', 'Upgrade Package')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('upgrade_managed_by_root_admin_message', 'Package upgrades are managed by the Root Admin. Please contact your administrator to increase your slot limit.')}
          </p>
          <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5 mt-1">
            <ChevronRight className="w-3 h-3" />
            {t('upgrade_portal_coming_soon_message', 'Self-service upgrade portal — coming soon')}
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 rounded-b-lg">
          <Button
            variant="primary"
            size="sm"
            block
            onClick={() => setModal({ type: 'none' })}
          >
            {t('got_it_button', 'Got it')}
          </Button>
        </div>
      </Modal>

      {/* Mandatory Terms & Policy Acceptance Modal */}
      {!(tenantInfo?.is_demo || propTenantInfo?.is_demo) && (
        <TermsAcceptanceModal tenantId={tenantId || 'default'} tenantName={tenantInfo?.name || propTenantInfo?.name || 'Your Property'} />
      )}

      {/* Header Help & Support Drawer */}
      <LegalDrawer
        activeTab={legalDrawerTab}
        onClose={() => setLegalDrawerTab(null)}
        tenantSlug={tenantInfo?.slug ?? propTenantInfo?.slug ?? ''}
        defaultPropertySlug={safeProperties[0]?.slug ?? ''}
      />
    </div>
  );
};
