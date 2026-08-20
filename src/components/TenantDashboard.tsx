import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, LogOut, Plus, AlertCircle, Loader2,
  Pencil, Trash2, ExternalLink, CheckCircle, XCircle, Layers,
  Home, TrendingUp, ChevronRight, Lock, Zap, User, MessageSquare,
  Settings, Calendar, Users, Bell,
} from 'lucide-react';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { StyledSelect } from './StyledSelect';
import { API_ROOT_BASE, apiFetch, getPropertySlug } from '../services/api';
import { Button } from './Button';
import { Alert as FlowbiteAlert, Modal, ModalHeader, ModalBody, ModalFooter, Checkbox } from 'flowbite-react';
import { KpiCard } from './KpiCard';
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
  phone?: string;
  google_maps_link?: string;
  whatsapp_voucher_template?: string;
  instructions?: string;
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
  | { type: 'add' }
  | { type: 'edit'; property: Property }
  | { type: 'delete'; property: Property }
  | { type: 'slots_exceeded'; needed: number; remaining: number }
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
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [, setGuests] = useState<any[]>([]);
  const [, setServiceRequests] = useState<any[]>([]);
  const [todaysArrivalsCount, setTodaysArrivalsCount] = useState(0);
  const [todaysDeparturesCount, setTodaysDeparturesCount] = useState(0);
  const [inHouseCount, setInHouseCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Add property form state
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<'SINGLE' | 'MULTI_KEY'>('SINGLE');
  const [newPropRooms, setNewPropRooms] = useState(1);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
      const targetProp = props.find((p: Property) => p.slug === getPropertySlug()) || props[0];
      if (targetProp) {
        const [guestsRes, reqRes] = await Promise.all([
          apiFetch(`/php/api/router.php?action=get_guests&property_id=${targetProp.id}`),
          apiFetch(`/php/api/router.php?action=get_service_requests&property_id=${targetProp.id}`),
        ]);
        const [guestsJson, reqJson] = await Promise.all([guestsRes.json(), reqRes.json()]);
        const guestsList = (guestsJson.data || guestsJson) as any[];
        const reqList = (reqJson.data || reqJson) as any[];
        setGuests(Array.isArray(guestsList) ? guestsList : []);
        setServiceRequests(Array.isArray(reqList) ? reqList : []);

        const today = new Date().toISOString().split('T')[0];
        const arrivals = guestsList.filter((g: any) => (g.checkinDate || g.checkin_date || '').startsWith(today));
        const departures = guestsList.filter((g: any) => (g.checkoutDate || g.checkout_date || '').startsWith(today) && (g.status || '').toLowerCase().includes('checkout'));
        const inHouse = guestsList.filter((g: any) => ['checked in', 'checkedin', 'checked-in', 'active'].includes((g.status || '').toLowerCase()));
        const pending = reqList.filter((r: any) => (r.status || '').toLowerCase() === 'pending');
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

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const handleAddProperty = async () => {
    if (!newPropName.trim()) { setAddError('Property name is required'); return; }
    const slug = autoSlug(newPropName);
    const slotsNeeded = newPropType === 'MULTI_KEY' ? newPropRooms : 1;
    const remaining = slotUsage?.remaining_slots ?? 0;

    if (slotsNeeded > remaining) {
      setModal({ type: 'slots_exceeded', needed: slotsNeeded, remaining });
      return;
    }

    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch('/php/api/router.php?action=create_property_for_tenant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          name: newPropName.trim(),
          slug,
          property_type: newPropType,
          room_count: newPropRooms,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setModal({ type: 'none' });
        setNewPropName('');
        setNewPropType('SINGLE');
        setNewPropRooms(1);
        showSuccess(`"${newPropName}" created successfully`);
        await loadData();
      } else {
        setAddError(data.message || 'Failed to create property');
      }
    } catch {
      setAddError('Network error. Please try again.');
    } finally {
      setAddLoading(false);
    }
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-indigo-950 flex items-center justify-center tenant-dashboard__loader-container">
        <div className="text-center space-y-3 tenant-dashboard__loader">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto tenant-dashboard__loader-icon" />
          <p className="text-sm text-slate-500 dark:text-slate-400 tenant-dashboard__loader-text">{t('loading_tenant_dashboard_message', 'Loading tenant dashboard…')}</p>
        </div>
      </div>
    );
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
                  onClick={() => { setAddError(null); setNewPropName(''); setNewPropType('SINGLE'); setNewPropRooms(1); setModal({ type: 'add' }); }}
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

                return (
                  <div
                    key={property.id}
                    className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm hover:shadow-md transition-all group tenant-dashboard__property-card"
                  >
                    <div className="flex items-start justify-between mb-4 tenant-dashboard__property-card-header">
                      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shadow-sm ${isMultiKey ? 'bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40' : 'bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40'} tenant-dashboard__property-card-icon-container`}>
                        {isMultiKey ? (
                          <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400 tenant-dashboard__property-card-icon" />
                        ) : (
                          <Home className="w-5 h-5 text-teal-600 dark:text-teal-400 tenant-dashboard__property-card-icon" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 tenant-dashboard__property-card-badges">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isMultiKey ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'} tenant-dashboard__property-type-badge`}>
                          {isMultiKey ? t('tenant_multi_key_badge', 'Multi-Key') : t('single_type_label', 'Single')}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${property.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'} tenant-dashboard__property-status-badge`}>
                          {property.is_active ? t('active_status_badge', 'Active') : t('tenant_inactive_status_badge', 'Inactive')}
                        </span>
                      </div>
                    </div>

                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors tenant-dashboard__property-card-name">
                      {property.name}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mb-1 tenant-dashboard__property-card-slug">/{property.slug}</p>
                    {isMultiKey && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tenant-dashboard__property-card-rooms">
                        {roomCount} room{roomCount !== 1 ? 's' : ''} · {roomCount} slot{roomCount !== 1 ? 's' : ''}
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
                        <Button variant="ghost" size="xs" onClick={() => handleToggleActive(property)} title={property.is_active ? t('deactivate_tooltip', 'Deactivate') : t('activate_tooltip', 'Activate')} className={`${property.is_active ? 'text-slate-400 hover:text-amber-600' : 'text-slate-400 hover:text-emerald-600'} tenant-dashboard__property-card-toggle-btn`}>
                          {property.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
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

        {/* â"ۉ"€ Quick Actions â"ۉ"€ */}
        <section className="tenant-dashboard__quick-actions">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 tenant-dashboard__quick-actions-heading">{t('quick_actions_heading', 'Quick Actions')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tenant-dashboard__quick-actions-grid">
            {[
              { label: t('guest_check_in_action', 'Guest Check-In'), icon: User, href: '#checkin', color: 'teal' },
              { label: t('guest_check_out_action', 'Guest Check-Out'), icon: User, href: '#checkout', color: 'orange' },
              { label: t('pending_actions_label', 'Pending Actions'), icon: AlertCircle, href: '#pending', color: 'amber' },
              { label: t('new_booking_action', 'New Booking'), icon: Calendar, href: '#new-booking', color: 'indigo' },
              { label: t('staff_management_action', 'Staff'), icon: Users, href: '#staff', color: 'purple' },
              { label: t('telegram_setup_action', 'Telegram'), icon: MessageSquare, href: '#telegram', color: 'blue' },
              { label: t('gst_settings_action', 'GST'), icon: Settings, href: '#gst', color: 'emerald' },
            ].map((action) => {
              const Icon = action.icon;
              const colorMap: Record<string, string> = {
                teal: 'bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800',
                orange: 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
                amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                indigo: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
                purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
                blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
                emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
                slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
              };
              return (
                <button
                  key={action.label}
                  onClick={() => {
                    if (properties.length === 1) {
                      const p = properties[0];
                      const tenantSlug = tenantInfo?.slug ?? '';
                      const url = tenantSlug
                        ? `${API_ROOT_BASE}/${tenantSlug}/${p.slug}/${action.href}`
                        : `${API_ROOT_BASE}/${p.slug}/${action.href}`;
                      window.location.href = url;
                    } else if (properties.length > 1) {
                      setSelectedPropertyId(prev => {
                        const target = prev ?? properties[0].id;
                        const p = properties.find(x => x.id === target) ?? properties[0];
                        const tenantSlug = tenantInfo?.slug ?? '';
                        const url = tenantSlug
                          ? `${API_ROOT_BASE}/${tenantSlug}/${p.slug}/${action.href}`
                          : `${API_ROOT_BASE}/${p.slug}/${action.href}`;
                        window.location.href = url;
                        return target;
                      });
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all active:scale-95 ${colorMap[action.color] ?? colorMap.slate} tenant-dashboard__quick-action-btn`}
                >
                  <Icon className="w-6 h-6 tenant-dashboard__quick-action-icon" />
                  <span className="text-xs font-semibold text-center leading-tight tenant-dashboard__quick-action-label">{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* Property selector for multi-property tenants */}
          {properties.length > 1 && (
            <div className="mt-4 flex items-center gap-3 tenant-dashboard__property-selector">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 tenant-dashboard__property-selector-label">{t('select_property_label', 'Select Property')}</label>
              <div className="flex-1 max-w-xs tenant-dashboard__property-selector-wrapper">
                <StyledSelect
                  value={String(selectedPropertyId ?? properties[0]?.id ?? '')}
                  onChange={(val) => setSelectedPropertyId(Number(val))}
                  options={properties.map(p => ({
                    value: String(p.id),
                    label: p.name,
                  }))}
                  placeholder={t('select_property_label', 'Select Property')}
                />
              </div>
            </div>
          )}
        </section>

        {/* â"ۉ"€ Combined Analytics (Placeholder) â"ۉ"€ */}
        <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 shadow-sm tenant-dashboard__analytics">
          <div className="flex items-center justify-between mb-6 tenant-dashboard__analytics-header">
            <div className="tenant-dashboard__analytics-title-wrapper">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white tenant-dashboard__analytics-title">{t('combined_analytics_heading', 'Combined Analytics')}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 tenant-dashboard__analytics-subtitle">{t('across_all_properties_subtext', 'Across all your properties')}</p>
            </div>
            <div className="flex items-center gap-2 tenant-dashboard__analytics-filters">
              <StyledSelect
                value=""
                onChange={() => {}}
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
            {[t('total_bookings_label', 'Total Bookings'), t('combined_revenue_label', 'Combined Revenue'), t('avg_occupancy_label', 'Avg. Occupancy')].map((label) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center border border-slate-100 dark:border-slate-700/50 tenant-dashboard__analytics-card">
                <TrendingUp className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto mb-2 tenant-dashboard__analytics-card-icon" />
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 tenant-dashboard__analytics-card-label">{label}</p>
                <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 tenant-dashboard__analytics-card-value">{t('coming_soon_badge', 'Coming Soon')}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* â"ۉ"€ Add Property Modal â"ۉ"€ */}
      <Modal show={modal.type === 'add'} onClose={() => setModal({ type: 'none' })} dismissible size="md" className="z-58">
        <ModalHeader>{t('add_new_property_heading', 'Add New Property')}</ModalHeader>
        <ModalBody className="space-y-5 tenant-dashboard__modal-body">
              {addError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 tenant-dashboard__modal-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 tenant-dashboard__modal-error-icon" />
                  {addError}
                </div>
              )}
              <div className="tenant-dashboard__form-group">
                <Input
                  id="new-property-name"
                  label={t('tenant_property_name_label', 'Property Name')}
                  value={newPropName}
                  onChange={e => setNewPropName(e.target.value)}
                  placeholder={t('property_name_placeholder', 'e.g. Sea View Villa')}
                  className="tenant-dashboard__input"
                />
                {newPropName && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 tenant-dashboard__slug-preview">{t('tenant_slug_label', 'Slug:')} <span className="font-mono text-indigo-500">/{autoSlug(newPropName)}</span></p>
                )}
              </div>
              <div className="tenant-dashboard__form-group">
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 tenant-dashboard__form-label">{t('tenant_property_type_label', 'Property Type')}</label>
                <div className="grid grid-cols-2 gap-3 tenant-dashboard__type-selector">
                  <button
                    onClick={() => setNewPropType('SINGLE')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${newPropType === 'SINGLE' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'} tenant-dashboard__type-btn`}
                  >
                    <Home className={`w-5 h-5 ${newPropType === 'SINGLE' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} tenant-dashboard__type-icon`} />
                    <span className={`text-xs font-semibold ${newPropType === 'SINGLE' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'} tenant-dashboard__type-label`}>{t('single_type_label', 'Single')}</span>
                    <span className="text-xs text-slate-400 tenant-dashboard__type-desc">{t('one_slot_label', '1 slot')}</span>
                  </button>
                  <button
                    onClick={() => setNewPropType('MULTI_KEY')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${newPropType === 'MULTI_KEY' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'} tenant-dashboard__type-btn`}
                  >
                    <Layers className={`w-5 h-5 ${newPropType === 'MULTI_KEY' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} tenant-dashboard__type-icon`} />
                    <span className={`text-xs font-semibold ${newPropType === 'MULTI_KEY' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'} tenant-dashboard__type-label`}>{t('multi_key_type_label', 'Multi-Key')}</span>
                    <span className="text-xs text-slate-400 tenant-dashboard__type-desc">{t('n_slots_label', 'N slots')}</span>
                  </button>
                </div>
              </div>
              {newPropType === 'MULTI_KEY' && (
                <div className="tenant-dashboard__form-group">
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 tenant-dashboard__form-label">
                    {t('number_of_rooms_label', 'Number of Rooms')}
                    <span className="text-slate-400 font-normal ml-1 tenant-dashboard__form-hint">(max {remaining} slot{remaining !== 1 ? 's' : ''} available)</span>
                  </label>
                  <Input
                    id="new-property-rooms"
                    type="number"
                    min={1}
                    max={remaining}
                    value={newPropRooms}
                    onChange={e => setNewPropRooms(Math.max(1, parseInt(e.target.value) || 1))}
                    helperText={newPropRooms > remaining ? `Not enough slots — you have ${remaining} remaining` : undefined}
                    error={newPropRooms > remaining}
                    className="tenant-dashboard__input"
                  />
                </div>
              )}
        </ModalBody>
        <ModalFooter>
          <Button
            id="confirm-add-property-btn"
            variant="primary"
            size="sm"
            leftIcon={addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            onClick={handleAddProperty}
            disabled={addLoading || newPropRooms > remaining}
            className="tenant-dashboard__modal-submit-btn"
          >
            {t('create_property_button', 'Create Property')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* â"ۉ"€ Edit Modal â"ۉ"€ */}
      <Modal show={modal.type === 'edit'} onClose={() => setModal({ type: 'none' })} dismissible size="md" className="z-58">
        <ModalHeader>{t('tenant_edit_property_heading', 'Edit Property')}</ModalHeader>
        <ModalBody className="space-y-4 tenant-dashboard__modal-body">
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
              <Checkbox
                  id="editTelegramTemplateCustomizationCheck"
                  checked={editTelegramTemplateCustomization}
                  onChange={e => setEditTelegramTemplateCustomization(e.target.checked)}
                />{t('allow_telegram_template_customization_label', 'Enable Telegram Template Customization')}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 tenant-dashboard__edit-section">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 tenant-dashboard__edit-section-title">{t('whatsapp_booking_confirmation_heading', 'WhatsApp Booking Confirmation')}</p>
                <div className="grid grid-cols-2 gap-3 mb-3 tenant-dashboard__edit-grid">
                  <div className="tenant-dashboard__form-group">
                    <Input
                      label={t('tenant_contact_phone_label', 'Contact Phone')}
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
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            size="sm"
            leftIcon={editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            onClick={handleEditProperty}
            disabled={editLoading || !editName.trim()}
          >
            {t('save_changes_button', 'Save Changes')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* â"ۉ"€ Delete Confirmation Modal â"ۉ"€ */}
      {modal.type === 'delete' && (
        <Modal show onClose={() => { setModal({ type: 'none' }); setError(null); }} dismissible size="md" className="z-58">
          <ModalHeader>{t('tenant_delete_property_heading', 'Delete Property')}</ModalHeader>
          <ModalBody className="space-y-3 tenant-dashboard__modal-body">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg tenant-dashboard__warning-box">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5 tenant-dashboard__warning-icon" />
                <div className="text-sm text-red-800 dark:text-red-300 space-y-1 w-full tenant-dashboard__warning-content">
                  <p className="font-semibold text-red-700 dark:text-red-400 tenant-dashboard__warning-text">{t('permanent_irreversible_warning', 'This action is permanent and irreversible.')}</p>
                  <div className="text-xs space-y-2 mt-1 tenant-dashboard__warning-details">
                    <p className="font-semibold text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 tenant-dashboard__warning-subtitle">{t('deletion_consequences_for_label', 'Deletion Consequences for')} "{modal.property.name}":</p>
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
              {/* This modal is a fixed full-screen overlay, so the page-level
                  error banner further up the tree renders behind it - surface
                  failures here too instead of the delete silently doing
                  nothing visible. */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg tenant-dashboard__modal-error">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}
          </ModalBody>
          <ModalFooter>
            <Button variant="tertiary" size="sm" onClick={() => { setModal({ type: 'none' }); setError(null); }} className="tenant-dashboard__modal-cancel-btn">
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
          </ModalFooter>
        </Modal>
      )}

      {/* â"ۉ"€ Slots Exceeded Modal â"ۉ"€ */}
      {modal.type === 'slots_exceeded' && (
        <Modal show onClose={() => setModal({ type: 'none' })} dismissible size="md" className="z-58">
          <ModalHeader as="div">
            <div className="flex items-center gap-3 tenant-dashboard__modal-header">
              <Zap className="w-5 h-5 text-amber-500 tenant-dashboard__modal-icon" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white tenant-dashboard__modal-title">{t('not_enough_slots_heading', 'Not Enough Slots')}</h3>
            </div>
          </ModalHeader>
          <ModalBody className="tenant-dashboard__modal-body">
            <p className="text-sm text-slate-600 dark:text-slate-400 tenant-dashboard__slots-info">
              You need <span className="font-semibold text-slate-900 dark:text-white tenant-dashboard__slots-needed">{modal.needed} slot(s)</span> but only have{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400 tenant-dashboard__slots-remaining">{modal.remaining} remaining</span>.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 tenant-dashboard__slots-message">
              {t('contact_root_admin_upgrade_message', 'Please contact your Root Admin to upgrade your subscription package.')}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="tertiary" size="sm" onClick={() => setModal({ type: 'add' })} className="tenant-dashboard__modal-back-btn">
              {t('back_button', 'Back')}
            </Button>
            <Button variant="warning" size="sm" leftIcon={<Zap className="w-4 h-4" />} onClick={() => setModal({ type: 'upgrade' })} className="tenant-dashboard__modal-upgrade-btn">
              {t('upgrade_package_button', 'Upgrade Package')}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* â"ۉ"€ Upgrade Modal (Roadmap Placeholder) â"ۉ"€ */}
      <Modal show={modal.type === 'upgrade'} onClose={() => setModal({ type: 'none' })} dismissible size="sm" className="z-58">
        <ModalHeader as="div" />
        <ModalBody className="text-center space-y-4 tenant-dashboard__modal-body">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto shadow-lg tenant-dashboard__upgrade-icon-container">
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
        </ModalBody>
        <ModalFooter className="tenant-dashboard__modal-footer">
          <Button
            variant="tertiary"
            size="md"
            block
            onClick={() => setModal({ type: 'none' })}
            className="tenant-dashboard__modal-got-it-btn"
          >
            {t('got_it_button', 'Got it')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
