import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2, LogOut, Plus, AlertCircle, Loader2,
  Pencil, Trash2, ExternalLink, CheckCircle, Layers,
  Home, TrendingUp, ChevronRight, Lock, Zap, User,
  Calendar, Bell,
} from './icons/FlowbiteIcons';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { StyledSelect } from './StyledSelect';
import { LoadingScreen } from './LoadingScreen';
import { API_ROOT_BASE, apiFetch } from '../services/api';
import { Button } from './Button';
import { Alert as FlowbiteAlert, Drawer, Modal, Checkbox } from 'flowbite-react';
import { X } from './icons/FlowbiteIcons';
import { KpiCard } from './KpiCard';
import { ToggleSwitch } from './ToggleSwitch';
import { PropertyCreationWizard } from './PropertyCreationWizard';
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
}

interface TenantDashboardProps {
  username: string;
  tenantId: number;
  tenantInfo?: TenantInfo;
  onLogout: () => void;
  isPlatformAdmin?: boolean;
}

type ModalState =
  | { type: 'none' }
  // Property Setup Wizard (26 Aug 2026) - replaces the old single-screen 'add' modal. `property`
  // present means resuming an existing draft; absent means a brand-new property.
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [, setServiceRequests] = useState<any[]>([]);
  const [todaysArrivalsCount, setTodaysArrivalsCount] = useState(0);
  const [todaysDeparturesCount, setTodaysDeparturesCount] = useState(0);
  const [inHouseCount, setInHouseCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [selectedAnalyticsPropId, setSelectedAnalyticsPropId] = useState<string>('all');

  // Computed Combined Analytics
  const filteredGuestsForAnalytics = useMemo(() => {
    if (selectedAnalyticsPropId === 'all') return guests;
    return guests.filter((g) => String(g.property_id || g.propertyId) === String(selectedAnalyticsPropId));
  }, [guests, selectedAnalyticsPropId]);

  const totalBookingsAnalytics = filteredGuestsForAnalytics.length;

  const combinedRevenueAnalytics = useMemo(() => {
    return filteredGuestsForAnalytics.reduce((sum, g) => {
      const amt = Number(g.totalAmount ?? g.roomRate ?? g.total_amount ?? g.total_charge ?? g.advanceAmount ?? 0) || 0;
      return sum + amt;
    }, 0);
  }, [filteredGuestsForAnalytics]);

  const avgOccupancyAnalytics = useMemo(() => {
    const targetProps = selectedAnalyticsPropId === 'all'
      ? properties
      : properties.filter(p => String(p.id) === String(selectedAnalyticsPropId));
    
    const totalSlotsOrRooms = targetProps.reduce((sum, p) => sum + (Number((p as any).room_count || (p as any).rooms) || 1), 0);
    const activeInHouse = filteredGuestsForAnalytics.filter(g =>
      ['checked in', 'checkedin', 'checked-in', 'active'].includes((g.status || '').toLowerCase())
    ).length;

    if (totalSlotsOrRooms <= 0) return 0;
    return Math.min(100, Math.round((activeInHouse / totalSlotsOrRooms) * 100));
  }, [properties, selectedAnalyticsPropId, filteredGuestsForAnalytics]);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editGstin, setEditGstin] = useState('');
  const [editTelegramTemplateCustomization, setEditTelegramTemplateCustomization] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editMapsLink, setEditMapsLink] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const adminHeaders: Record<string, string> = {};
      if (isPlatformAdmin && username) {
        adminHeaders['X-Admin-Username'] = username;
      }
      const [propsRes, slotsRes] = await Promise.all([
        fetch(`/php/api/router.php?action=get_tenant_properties&tenant_id=${tenantId}`, { credentials: 'include', headers: adminHeaders }),
        fetch(`/php/api/router.php?action=get_tenant_slot_usage&tenant_id=${tenantId}`, { credentials: 'include', headers: adminHeaders }),
      ]);
      const [propsData, slotsData] = await Promise.all([propsRes.json(), slotsRes.json()]);

      if (propsData.success) setProperties(propsData.data || []);
      else setError(propsData.message || 'Failed to load properties');

      if (slotsData.success) setSlotUsage(slotsData.data);

      const props = propsData.success ? (propsData.data || []) : [];
      if (props.length > 0) {
        const fetchPromises = props.flatMap((p: Property) => [
          apiFetch(`/php/api/router.php?action=get_guests&property_id=${p.id}`).then(r => r.json()).catch(() => ({ data: [] })),
          apiFetch(`/php/api/router.php?action=get_service_requests&property_id=${p.id}`).then(r => r.json()).catch(() => ({ data: [] })),
        ]);
        const results = await Promise.all(fetchPromises);
        const allGuestsList: any[] = [];
        const allReqList: any[] = [];

        for (let i = 0; i < results.length; i += 2) {
          const guestsJson = results[i];
          const reqJson = results[i + 1];
          const guestsList = (guestsJson.data || guestsJson) as any[];
          const reqList = (reqJson.data || reqJson) as any[];
          if (Array.isArray(guestsList)) allGuestsList.push(...guestsList);
          if (Array.isArray(reqList)) allReqList.push(...reqList);
        }

        setGuests(allGuestsList);
        setServiceRequests(allReqList);

        const today = new Date().toISOString().split('T')[0];
        const arrivals = allGuestsList.filter((g: any) => (g.checkinDate || g.checkin_date || '').startsWith(today));
        const departures = allGuestsList.filter((g: any) => (g.checkoutDate || g.checkout_date || '').startsWith(today) && (g.status || '').toLowerCase().includes('checkout'));
        const inHouse = allGuestsList.filter((g: any) => ['checked in', 'checkedin', 'checked-in', 'active'].includes((g.status || '').toLowerCase()));
        const pending = allReqList.filter((r: any) => (r.status || '').toLowerCase() === 'pending');
        setTodaysArrivalsCount(arrivals.length);
        setTodaysDeparturesCount(departures.length);
        setInHouseCount(inHouse.length);
        setPendingRequestsCount(pending.length);
      }
    } catch (err) {
      setError('Failed to load dashboard data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, isPlatformAdmin, username]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = () => {
    localStorage.removeItem('artists_farm_user_session');
    onLogout();
    window.location.href = '/login/';
  };

  const handleToggleActive = async (property: Property) => {
    try {
      const res = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: property.id, status: property.is_active ? 'inactive' : 'active' }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(`Property ${property.is_active ? 'deactivated' : 'activated'}`);
        await loadData();
      }
    } catch {
      /* ignore */
    }
  };

  const handleDeleteProperty = async (property: Property) => {
    setError(null);
    try {
      // BUG (fixed): this sent { id: property.id } - router.php's
      // delete_property reads $input['property_id'], not 'id', so every
      // tenant-side delete has always 400'd "property_id required" and
      // been swallowed by the empty catch below with no feedback at all.
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

  const handleEditProperty = async () => {
    if (modal.type !== 'edit') return;
    if (!editName.trim()) return;
    setEditLoading(true);
    try {
      const res = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: modal.property.id,
          name: editName.trim(),
          gstin: editGstin.trim(),
          telegram_template_customization_enabled: editTelegramTemplateCustomization,
          phone: editPhone.trim(),
          google_maps_link: editMapsLink.trim(),
          instructions: editInstructions,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setModal({ type: 'none' });
        showSuccess('Property updated');
        await loadData();
      }
    } catch {
      /* ignore */
    } finally {
      setEditLoading(false);
    }
  };

  const remaining = slotUsage?.remaining_slots ?? 0;
  const usedSlots = slotUsage?.used_slots ?? 0;
  const totalSlots = slotUsage?.total_slots ?? 0;
  const slotPercent = totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0;

  const planColor: Record<string, string> = {
    trial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    basic: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    pro: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    enterprise: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  };

  if (loading) {
    // Shared branded splash (25 Aug 2026), replacing a one-off spinner+text
    // block - see the same fix/comment in PlatformPropertyManagement.tsx.
    return <LoadingScreen message={t('loading_tenant_dashboard_message', 'Loading tenant dashboard…')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-indigo-950 tenant-dashboard__container">
      {/* â"ۉ"€ Header â"ۉ"€ */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-700/70 sticky top-0 z-40 tenant-dashboard__header">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between tenant-dashboard__header-inner">
          <div className="flex items-center gap-3 tenant-dashboard__header-left">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md tenant-dashboard__header-icon-container">
              <Building2 className="w-5 h-5 text-white tenant-dashboard__header-icon" />
            </div>
            <div className="tenant-dashboard__header-title-container">
              <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight tenant-dashboard__header-title">
                {tenantInfo?.name ?? t('tenant_dashboard_heading', 'Tenant Dashboard')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 tenant-dashboard__header-subtitle">{t('property_control_panel_label', 'Property Control Panel')}</p>
            </div>
            {tenantInfo?.subscription_plan && (
              <span className={`hidden sm:inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${planColor[tenantInfo.subscription_plan] ?? planColor.trial} tenant-dashboard__plan-badge`}>
                {tenantInfo.subscription_plan}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 tenant-dashboard__header-right">
            <div className="text-right hidden sm:block tenant-dashboard__user-info">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 tenant-dashboard__username">{username}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tenant-dashboard__user-role">
                {isPlatformAdmin ? t('root_admin_label', 'Root Admin') : t('tenant_manager_label', 'Tenant Manager')}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors tenant-dashboard__logout-button"
              title={t('logout_tooltip', 'Logout')}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8 tenant-dashboard__main">
        {/* â"ۉ"€ Success Toast â"ۉ"€ */}
        {successMsg && (
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-emerald-600 text-white px-5 py-3 rounded-lg shadow-2xl text-sm font-medium flex items-center gap-2 animate-pulse tenant-dashboard__success-toast">
            <CheckCircle className="w-4 h-4 tenant-dashboard__success-toast-icon" />
            {successMsg}
          </div>
        )}

        {error && (
          <FlowbiteAlert color="failure" icon={AlertCircle} className="tenant-dashboard__error-toast">
            {error}
          </FlowbiteAlert>
        )}

        {/* â"ۉ"€ Slot Usage Widget â"ۉ"€ */}
        <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm tenant-dashboard__slot-widget">
          <div className="flex items-center justify-between tenant-dashboard__slot-widget-inner">
            <div className="flex items-center gap-3 tenant-dashboard__slot-widget-left">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center tenant-dashboard__slot-widget-icon-container">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tenant-dashboard__slot-widget-count">{usedSlots}/{totalSlots}</span>
              </div>
              <div className="tenant-dashboard__slot-widget-text">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 tenant-dashboard__slot-widget-label">Slots</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 tenant-dashboard__slot-widget-remaining">{remaining > 0 ? `${remaining} remaining` : 'No slots left'}</p>
              </div>
            </div>
            <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden tenant-dashboard__slot-widget-bar-bg">
              <div
                className={`h-full rounded-full transition-all duration-500 tenant-dashboard__slot-widget-bar-fill ${
                  slotPercent >= 100
                    ? 'bg-red-500'
                    : slotPercent >= 80
                    ? 'bg-amber-500'
                    : 'bg-indigo-500'
                }`}
                style={{ width: `${Math.min(slotPercent, 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Metrics Grid */}
        <section className="tenant-dashboard__metrics-section">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tenant-dashboard__metrics-grid">
            <KpiCard
              label="Arrivals"
              icon={Calendar}
              badge={{ text: 'Today', color: 'info' }}
              value={todaysArrivalsCount}
            />
            <KpiCard
              label="Departures"
              icon={LogOut}
              badge={{ text: 'Today', color: 'warning' }}
              value={todaysDeparturesCount}
            />
            <KpiCard
              label="Guests In-House"
              icon={User}
              badge={{ text: 'Active', color: 'success' }}
              value={inHouseCount}
            />
            <KpiCard
              label="Service Requests"
              icon={Bell}
              badge={{ text: 'Active', color: 'failure' }}
              value={pendingRequestsCount}
            />
          </div>
        </section>

          {/* â"ۉ"€ Properties Section â"ۉ"€ */}
          <section className="tenant-dashboard__properties-section">
            <div className="flex items-center justify-between mb-5 tenant-dashboard__properties-header">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tenant-dashboard__properties-title">{t('your_properties_heading', 'Your Properties')}</h2>
              {remaining > 0 ? (
                <Button
                  id="tenant-add-property-btn"
                  leftIcon={<Plus className="w-4 h-4" />}
                  variant="primary"
                  size="sm"
                  onClick={() => setModal({ type: 'wizard' })}
                  className="tenant-dashboard__properties-add-btn"
                >
                  {t('add_property_button', 'Add Property')}
                </Button>
              ) : (
                <div className="flex flex-col items-end gap-1 tenant-dashboard__properties-no-slots">
                  <Button variant="dark" size="sm" disabled leftIcon={<Lock className="w-4 h-4" />} className="tenant-dashboard__properties-add-btn--disabled">
                    {t('add_property_button', 'Add Property')}
                  </Button>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tenant-dashboard__properties-no-slots-text">{t('no_more_slots_available_message', 'No more slots available')}</p>
                  <Button variant="secondary" size="xs" leftIcon={<Zap className="w-3.5 h-3.5" />} onClick={() => setModal({ type: 'upgrade' })} className="tenant-dashboard__properties-upgrade-btn">
                    {t('upgrade_package_button', 'Upgrade Package')}
                  </Button>
                </div>
              )}
            </div>

          {properties.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center tenant-dashboard__properties-empty">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3 tenant-dashboard__properties-empty-icon" />
              <p className="text-slate-500 dark:text-slate-400 font-medium tenant-dashboard__properties-empty-text">{t('tenant_no_properties_yet_message', 'No properties yet')}</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 tenant-dashboard__properties-empty-subtext">{t('add_first_property_help_text', 'Add your first property to get started')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 tenant-dashboard__properties-grid">
              {properties.map((property) => {
                const isMultiKey = property.property_type === 'MULTI_KEY';
                const roomCount = property.room_count ?? 0;
                const tenantSlug = tenantInfo?.slug ?? '';
                const dashboardUrl = tenantSlug
                  ? `${API_ROOT_BASE}/${tenantSlug}/${property.slug}/#dashboard`
                  : `${API_ROOT_BASE}/${property.slug}/#dashboard`;

                // Draft properties (26 Aug 2026, "Save & Exit" mid-wizard) render a distinct card -
                // incomplete, so no Open/Edit/Active-toggle actions (there's nothing real to open
                // yet); Continue resumes the wizard exactly where it left off, Delete abandons it.
                if (property.status === 'draft') {
                  return (
                    <div
                      key={property.id}
                      className="bg-amber-50 dark:bg-amber-950/20 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-800 p-4 sm:p-6 tenant-dashboard__property-card tenant-dashboard__property-card--draft"
                    >
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-800 flex items-center justify-center shadow-xs">
                          {isMultiKey ? <Layers className="w-5 h-5 text-amber-600 dark:text-amber-400" /> : <Home className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/40">
                          Draft - Setup Incomplete
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{property.name || 'Untitled property'}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">This property isn't live yet - finish setup to start taking bookings.</p>
                      <div className="pt-4 border-t border-amber-200 dark:border-amber-900 flex items-center justify-between">
                        <Button variant="primary" size="sm" onClick={() => setModal({ type: 'wizard', property })}>
                          Continue Setup
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => setModal({ type: 'delete', property })} title={t('delete_tooltip', 'Delete')} className="text-slate-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={property.id}
                    className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm hover:shadow-md transition-all group tenant-dashboard__property-card"
                  >
                    <div className="flex items-start justify-between mb-3 tenant-dashboard__property-card-header">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-xs ${isMultiKey ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800' : 'bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800'} tenant-dashboard__property-card-icon-container`}>
                          {isMultiKey ? (
                            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400 tenant-dashboard__property-card-icon" />
                          ) : (
                            <Home className="w-5 h-5 text-teal-600 dark:text-teal-400 tenant-dashboard__property-card-icon" />
                          )}
                        </div>
                        <div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isMultiKey ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'} tenant-dashboard__property-type-badge`}>
                            {isMultiKey ? 'Multi-Room Hotel' : 'Single Property'}
                          </span>
                        </div>
                      </div>

                      {/* Active / Inactive Status Toggle Switch */}
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${property.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {property.is_active ? t('active_status_badge', 'Active') : t('tenant_inactive_status_badge', 'Inactive')}
                        </span>
                        <ToggleSwitch
                          enabled={!!property.is_active}
                          onChange={() => handleToggleActive(property)}
                        />
                      </div>
                    </div>

                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors tenant-dashboard__property-card-name">
                      {property.name}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mb-1 tenant-dashboard__property-card-slug">/{property.slug}</p>
                    {isMultiKey && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tenant-dashboard__property-card-rooms">
                        {roomCount > 0
                          ? `${roomCount} room${roomCount !== 1 ? 's' : ''} · ${roomCount} slot${roomCount !== 1 ? 's' : ''}`
                          : '0 rooms (No sub-rooms created yet)'}
                      </p>
                    )}

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between tenant-dashboard__property-card-actions">
                      <Button variant="ghost" size="sm" onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tenant-dashboard__property-card-open-btn">
                        <ExternalLink className="w-3 h-3" /> {t('open_dashboard_link', 'Open Property')}
                      </Button>
                      <div className="flex items-center gap-1 tenant-dashboard__property-card-controls">
                        <Button variant="primary" size="sm" onClick={() => { setEditName(property.name); setEditGstin(property.gstin || ''); setEditTelegramTemplateCustomization(!!property.telegram_template_customization_enabled); setEditPhone(property.phone || ''); setEditMapsLink(property.google_maps_link || ''); setEditInstructions(property.instructions || ''); setModal({ type: 'edit', property }); }} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => setModal({ type: 'delete', property })} title={t('delete_tooltip', 'Delete')} className="text-slate-400 hover:text-red-600 tenant-dashboard__property-card-delete-btn">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Combined Analytics */}
        <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 shadow-sm tenant-dashboard__analytics">
          <div className="flex items-center justify-between mb-6 tenant-dashboard__analytics-header">
            <div className="tenant-dashboard__analytics-title-wrapper">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white tenant-dashboard__analytics-title">{t('combined_analytics_heading', 'Combined Analytics')}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 tenant-dashboard__analytics-subtitle">{t('across_all_properties_subtext', 'Across all your properties')}</p>
            </div>
            <div className="flex items-center gap-2 tenant-dashboard__analytics-filters">
              <StyledSelect
                value={selectedAnalyticsPropId}
                onChange={(value) => setSelectedAnalyticsPropId(value)}
                options={[
                  { value: 'all', label: t('all_properties_option', 'All Properties') },
                  ...properties.map(p => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder={t('all_properties_option', 'All Properties')}
                className="w-48"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tenant-dashboard__analytics-grid">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-5 text-center border border-slate-100 dark:border-slate-700/50 tenant-dashboard__analytics-card">
              <TrendingUp className="w-6 h-6 text-indigo-500 mx-auto mb-2 tenant-dashboard__analytics-card-icon" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 tenant-dashboard__analytics-card-label">{t('total_bookings_label', 'Total Bookings')}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tenant-dashboard__analytics-card-value">{totalBookingsAnalytics}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-5 text-center border border-slate-100 dark:border-slate-700/50 tenant-dashboard__analytics-card">
              <Building2 className="w-6 h-6 text-emerald-500 mx-auto mb-2 tenant-dashboard__analytics-card-icon" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 tenant-dashboard__analytics-card-label">{t('combined_revenue_label', 'Combined Revenue')}</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tenant-dashboard__analytics-card-value">₹{combinedRevenueAnalytics.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-5 text-center border border-slate-100 dark:border-slate-700/50 tenant-dashboard__analytics-card">
              <Layers className="w-6 h-6 text-blue-500 mx-auto mb-2 tenant-dashboard__analytics-card-icon" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 tenant-dashboard__analytics-card-label">{t('avg_occupancy_label', 'Avg. Occupancy')}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tenant-dashboard__analytics-card-value">{avgOccupancyAnalytics}%</p>
            </div>
          </div>
        </section>
      </main>

      {/* Property Setup Wizard (26 Aug 2026) - multi-step, timeline-stepper flow replacing the old
          single-screen Add Property drawer. `property` (present when resuming a draft) or absent
          (fresh property) both render the same component - see PropertyCreationWizard.tsx. */}
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

      {/* Edit Property Drawer */}
      <Drawer
        open={modal.type === 'edit'}
        onClose={() => setModal({ type: 'none' })}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4 tenant-dashboard__modal-body">
          <div className="tenant-dashboard__form-group">
            <Input
              label={t('tenant_property_name_label', 'Property Name')}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="tenant-dashboard__input"
            />
          </div>
          <div className="tenant-dashboard__form-group">
            <Input
              label={t('gstin_optional_label', 'GSTIN (optional)')}
              value={editGstin}
              onChange={e => setEditGstin(e.target.value.toUpperCase())}
              placeholder={t('gstin_placeholder', 'e.g. 27ABCDE1234F1Z5')}
              helperText={t('gstin_help_text', 'Printed on GST tax invoices at checkout.')}
              className="tenant-dashboard__input"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="editTelegramTemplateCustomizationCheck"
              checked={editTelegramTemplateCustomization}
              onChange={e => setEditTelegramTemplateCustomization(e.target.checked)}
            />
            <label htmlFor="editTelegramTemplateCustomizationCheck" className="text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
              {t('allow_telegram_template_customization_label', 'Enable Telegram Template Customization')}
            </label>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 tenant-dashboard__edit-section">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 tenant-dashboard__edit-section-title">{t('whatsapp_booking_confirmation_heading', 'WhatsApp Booking Confirmation')}</p>
            <div className="grid grid-cols-2 gap-3 mb-3 tenant-dashboard__edit-grid">
              <div className="tenant-dashboard__form-group">
                <Input
                  label={t('tenant_contact_phone_label', 'Contact number of property')}
                  labelClassName="text-xs"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder={t('contact_phone_placeholder', '99999 99999')}
                  className="tenant-dashboard__input"
                />
              </div>
              <div className="tenant-dashboard__form-group">
                <Input
                  label={t('google_maps_link_label', 'Google Maps Link')}
                  labelClassName="text-xs"
                  value={editMapsLink}
                  onChange={e => setEditMapsLink(e.target.value)}
                  placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
                  className="tenant-dashboard__input"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 tenant-dashboard__edit-help-text">
              {t('whatsapp_share_help_text', 'Included in the "Share via WhatsApp" message on the booking voucher. Left blank, those lines are simply omitted.')}
            </p>
            <div className="tenant-dashboard__form-group">
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 tenant-dashboard__form-label">{t('other_notes_label', 'Other Notes')}</label>
              <Textarea
                value={editInstructions}
                onChange={e => setEditInstructions(e.target.value)}
                placeholder={t('other_notes_placeholder', 'e.g. How to reach, check-in instructions, parking notes…')}
                rows={3}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y tenant-dashboard__textarea"
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
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
            leftIcon={editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            onClick={handleEditProperty}
            disabled={editLoading || !editName.trim()}
          >
            {t('save_changes_button', 'Save Changes')}
          </Button>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal - a centered flowbite-react <Modal>, not a
          right-side Drawer (23 Aug 2026: this is a confirmation prompt, not a
          creation/edit form - same "modal, not drawer" rule as
          ConfirmDialogContext.tsx, applied here too since this one has rich
          custom content - a bulleted consequences list, conditional sub-room
          note - that doesn't reduce to that shared component's plain-string
          message prop). Add/Edit Property directly above/below stay Drawers
          - those are genuine multi-field forms. */}
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
            <div className="flex-1 overflow-y-auto p-4 space-y-3 tenant-dashboard__modal-body">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg tenant-dashboard__warning-box">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5 tenant-dashboard__warning-icon" />
                <div className="text-sm text-red-800 dark:text-red-300 space-y-1 w-full tenant-dashboard__warning-content">
                  <p className="font-semibold text-red-700 dark:text-red-400 tenant-dashboard__warning-text">{t('permanent_irreversible_warning', 'This action is permanent and irreversible.')}</p>
                  <div className="text-xs space-y-2 mt-1 tenant-dashboard__warning-details">
                    <p className="font-semibold text-2xs uppercase tracking-wider text-red-600 dark:text-red-400 tenant-dashboard__warning-subtitle">{t('deletion_consequences_for_label', 'Deletion Consequences for')} "{modal.property.name}":</p>
                    <ul className="list-disc list-inside space-y-1 text-red-800 dark:text-red-300 tenant-dashboard__warning-list">
                      <li className="tenant-dashboard__warning-list-item">All <strong>active and upcoming bookings</strong> (present and future stays) will be permanently deleted.</li>
                      <li className="tenant-dashboard__warning-list-item">Past bookings (checked-out/cancelled) and associated financial ledger records <strong>will remain intact</strong> for historical audit trail.</li>
                      <li className="tenant-dashboard__warning-list-item">Menus, inventory stock list, modules, and staff assignments will be deleted.</li>
                    </ul>
                  </div>
                  {(modal.property.room_count ?? 0) > 0 && (
                    <p className="text-[11px] font-semibold mt-1 tenant-dashboard__warning-note">Note: This will also delete all {modal.property.room_count} sub-rooms.</p>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 tenant-dashboard__delete-info">
                Deleting this property will free{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 tenant-dashboard__delete-slots">
                  {modal.property.property_type === 'MULTI_KEY' ? (modal.property.room_count ?? 1) : 1} slot(s)
                </span>{' '}
                back to your subscription.
              </p>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg tenant-dashboard__modal-error">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 rounded-b-lg">
              <Button variant="secondary" size="sm" onClick={() => { setModal({ type: 'none' }); setError(null); }} className="tenant-dashboard__modal-cancel-btn">
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button
                id="confirm-delete-property-btn"
                variant="danger"
                size="sm"
                onClick={() => handleDeleteProperty(modal.property)}
                className="tenant-dashboard__modal-delete-btn"
              >
                {t('delete_permanently_button', 'Delete Permanently')}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Upgrade Modal (Roadmap Placeholder) - alert/informational prompt,
          not a form; same "modal, not drawer" rule as above. */}
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
        <div className="flex-1 overflow-y-auto p-6 text-center space-y-4 tenant-dashboard__modal-body">
          <div className="w-14 h-14 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto shadow-lg tenant-dashboard__upgrade-icon-container">
            <Zap className="w-7 h-7 text-white tenant-dashboard__upgrade-icon" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white tenant-dashboard__modal-title">{t('upgrade_package_button', 'Upgrade Package')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 tenant-dashboard__upgrade-message">
            {t('upgrade_managed_by_root_admin_message', 'Package upgrades are managed by the Root Admin. Please contact your administrator to increase your slot limit.')}
          </p>
          <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5 mt-1 tenant-dashboard__upgrade-subtext">
            <ChevronRight className="w-3 h-3 tenant-dashboard__upgrade-subtext-icon" />
            {t('upgrade_portal_coming_soon_message', 'Self-service upgrade portal — coming soon')}
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 rounded-b-lg tenant-dashboard__modal-footer">
          <Button
            variant="primary"
            size="sm"
            block
            onClick={() => setModal({ type: 'none' })}
            className="tenant-dashboard__modal-got-it-btn"
          >
            {t('got_it_button', 'Got it')}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
