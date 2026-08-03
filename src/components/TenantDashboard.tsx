import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, LogOut, Plus, BarChart3, AlertCircle, Loader,
  Edit2, Trash2, ExternalLink, CheckCircle, XCircle, Layers,
  Home, TrendingUp, ChevronRight, Lock, Zap, X,
} from 'lucide-react';

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
}) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [slotUsage, setSlotUsage] = useState<SlotUsage | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(propTenantInfo || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add property form state
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<'SINGLE' | 'MULTI_KEY'>('SINGLE');
  const [newPropRooms, setNewPropRooms] = useState(1);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propsRes, slotsRes] = await Promise.all([
        fetch(`/php/api/router.php?action=get_tenant_properties&tenant_id=${tenantId}`, { credentials: 'include' }),
        fetch(`/php/api/router.php?action=get_tenant_slot_usage&tenant_id=${tenantId}`, { credentials: 'include' }),
      ]);
      const [propsData, slotsData] = await Promise.all([propsRes.json(), slotsRes.json()]);

      if (propsData.success) setProperties(propsData.data || []);
      else setError(propsData.message || 'Failed to load properties');

      if (slotsData.success) setSlotUsage(slotsData.data);
    } catch (err) {
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
    window.location.href = '/artists_farm/login/';
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
        showSuccess(`✓ "${newPropName}" created successfully`);
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
        showSuccess(`✓ Property ${property.is_active ? 'deactivated' : 'activated'}`);
        await loadData();
      }
    } catch {
      /* ignore */
    }
  };

  const handleDeleteProperty = async (property: Property) => {
    try {
      const res = await fetch('/php/api/router.php?action=delete_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: property.id }),
      });
      const data = await res.json();
      if (data.success) {
        setModal({ type: 'none' });
        showSuccess(`✓ "${property.name}" deleted. Slots freed.`);
        await loadData();
      }
    } catch {
      /* ignore */
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
        }),
      });
      const data = await res.json();
      if (data.success) {
        setModal({ type: 'none' });
        showSuccess('✓ Property updated');
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-indigo-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading tenant dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-indigo-950">
      {/* ── Header ── */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-700/70 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {tenantInfo?.name ?? 'Tenant Dashboard'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Property Control Panel</p>
            </div>
            {tenantInfo?.subscription_plan && (
              <span className={`hidden sm:inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${planColor[tenantInfo.subscription_plan] ?? planColor.trial}`}>
                {tenantInfo.subscription_plan}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{username}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tenant Manager</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ── Success Toast ── */}
        {successMsg && (
          <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 animate-pulse">
            <CheckCircle className="w-4 h-4" />
            {successMsg}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Slot Usage Widget ── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Slot Usage</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Each room in a multi-key property counts as one slot
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{usedSlots}</span>
              <span className="text-lg text-slate-400 dark:text-slate-500"> / {totalSlots}</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">slots used</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                slotPercent >= 100
                  ? 'bg-red-500'
                  : slotPercent >= 80
                  ? 'bg-amber-500'
                  : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(slotPercent, 100)}%` }}
            />
          </div>

          {/* Per-property breakdown */}
          {slotUsage && slotUsage.breakdown.length > 0 && (
            <div className="space-y-2">
              {slotUsage.breakdown.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-400 dark:text-slate-500 w-4 text-right">{idx === slotUsage.breakdown.length - 1 ? '└' : '├'}</span>
                  {item.property_type === 'MULTI_KEY' ? (
                    <Layers className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  ) : (
                    <Home className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                  )}
                  <span className="text-slate-700 dark:text-slate-300 flex-1 font-medium">{item.name}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-xs">
                    {item.property_type === 'MULTI_KEY'
                      ? `${item.slots_used} room${item.slots_used !== 1 ? 's' : ''}`
                      : 'Single'}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-16 text-right">
                    = {item.slots_used} slot{item.slots_used !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
              <div className="mt-3 pl-7">
                <span className={`text-sm font-semibold ${remaining > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {remaining > 0 ? `✦ ${remaining} slot${remaining !== 1 ? 's' : ''} remaining` : '✦ No slots remaining'}
                </span>
              </div>
            </div>
          )}
          {slotUsage && slotUsage.breakdown.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 pl-4">No properties yet. Add your first property below.</p>
          )}
        </section>

        {/* ── Properties Section ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Your Properties</h2>
            {remaining > 0 ? (
              <button
                id="tenant-add-property-btn"
                onClick={() => { setAddError(null); setNewPropName(''); setNewPropType('SINGLE'); setNewPropRooms(1); setModal({ type: 'add' }); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                Add Property
              </button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <button
                  disabled
                  className="flex items-center gap-2 bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 px-4 py-2 rounded-xl text-sm font-semibold cursor-not-allowed"
                >
                  <Lock className="w-4 h-4" />
                  Add Property
                </button>
                <p className="text-xs text-slate-500 dark:text-slate-400">No more slots available</p>
                <button
                  onClick={() => setModal({ type: 'upgrade' })}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" /> Upgrade Package
                </button>
              </div>
            )}
          </div>

          {properties.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">No properties yet</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Add your first property to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {properties.map((property) => {
                const isMultiKey = property.property_type === 'MULTI_KEY';
                const roomCount = property.room_count ?? 0;
                const tenantSlug = tenantInfo?.slug ?? '';
                const dashboardUrl = tenantSlug
                  ? `/artists_farm/${tenantSlug}/${property.slug}/`
                  : `/artists_farm/${property.slug}/`;

                return (
                  <div
                    key={property.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${isMultiKey ? 'bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40' : 'bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40'}`}>
                        {isMultiKey ? (
                          <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Home className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isMultiKey ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'}`}>
                          {isMultiKey ? 'Multi-Key' : 'Single'}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${property.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {property.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    <h3 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {property.name}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mb-1">/{property.slug}</p>
                    {isMultiKey && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {roomCount} room{roomCount !== 1 ? 's' : ''} · {roomCount} slot{roomCount !== 1 ? 's' : ''}
                      </p>
                    )}

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <a
                        href={dashboardUrl}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                      >
                        Open Dashboard <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditName(property.name); setModal({ type: 'edit', property }); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(property)}
                          className={`p-1.5 rounded-lg transition-colors ${property.is_active ? 'hover:bg-amber-50 dark:hover:bg-amber-950/30 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'}`}
                          title={property.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {property.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => setModal({ type: 'delete', property })}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Combined Analytics (Placeholder) ── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Combined Analytics</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Across all your properties</p>
            </div>
            <div className="flex items-center gap-2">
              <select className="text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none">
                <option>All Properties</option>
                {properties.map(p => (
                  <option key={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {['Total Bookings', 'Combined Revenue', 'Avg. Occupancy'].map((label) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-center border border-slate-100 dark:border-slate-700/50">
                <TrendingUp className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">Coming Soon</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Add Property Modal ── */}
      {modal.type === 'add' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New Property</h3>
              <button onClick={() => setModal({ type: 'none' })} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {addError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {addError}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Property Name</label>
                <input
                  id="new-property-name"
                  type="text"
                  value={newPropName}
                  onChange={e => setNewPropName(e.target.value)}
                  placeholder="e.g. Sea View Villa"
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {newPropName && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Slug: <span className="font-mono text-indigo-500">/{autoSlug(newPropName)}</span></p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Property Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setNewPropType('SINGLE')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${newPropType === 'SINGLE' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                  >
                    <Home className={`w-5 h-5 ${newPropType === 'SINGLE' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className={`text-xs font-semibold ${newPropType === 'SINGLE' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>Single</span>
                    <span className="text-xs text-slate-400">1 slot</span>
                  </button>
                  <button
                    onClick={() => setNewPropType('MULTI_KEY')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${newPropType === 'MULTI_KEY' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                  >
                    <Layers className={`w-5 h-5 ${newPropType === 'MULTI_KEY' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className={`text-xs font-semibold ${newPropType === 'MULTI_KEY' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>Multi-Key</span>
                    <span className="text-xs text-slate-400">N slots</span>
                  </button>
                </div>
              </div>
              {newPropType === 'MULTI_KEY' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Number of Rooms
                    <span className="text-slate-400 font-normal ml-1">(max {remaining} slot{remaining !== 1 ? 's' : ''} available)</span>
                  </label>
                  <input
                    id="new-property-rooms"
                    type="number"
                    min={1}
                    max={remaining}
                    value={newPropRooms}
                    onChange={e => setNewPropRooms(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {newPropRooms > remaining && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Not enough slots — you have {remaining} remaining
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button onClick={() => setModal({ type: 'none' })} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                Cancel
              </button>
              <button
                id="confirm-add-property-btn"
                onClick={handleAddProperty}
                disabled={addLoading || newPropRooms > remaining}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
              >
                {addLoading && <Loader className="w-4 h-4 animate-spin" />}
                Create Property
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {modal.type === 'edit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Property</h3>
              <button onClick={() => setModal({ type: 'none' })} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Property Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={() => setModal({ type: 'none' })} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-colors">Cancel</button>
              <button
                onClick={handleEditProperty}
                disabled={editLoading || !editName.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
              >
                {editLoading && <Loader className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {modal.type === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-red-200 dark:border-red-900">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Property</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800 dark:text-red-300 space-y-1">
                  <p className="font-semibold">This action is permanent and irreversible.</p>
                  <p>All guest records, billing history, and staff data for <span className="font-semibold">"{modal.property.name}"</span> will be permanently deleted.</p>
                  {(modal.property.room_count ?? 0) > 0 && (
                    <p>This will also delete all {modal.property.room_count} sub-rooms.</p>
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
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={() => setModal({ type: 'none' })} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-colors">Cancel</button>
              <button
                id="confirm-delete-property-btn"
                onClick={() => handleDeleteProperty(modal.property)}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Slots Exceeded Modal ── */}
      {modal.type === 'slots_exceeded' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-amber-200 dark:border-amber-900">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Not Enough Slots</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                You need <span className="font-bold text-slate-900 dark:text-white">{modal.needed} slot(s)</span> but only have{' '}
                <span className="font-bold text-amber-600 dark:text-amber-400">{modal.remaining} remaining</span>.
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Please contact your Root Admin to upgrade your subscription package.
              </p>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={() => setModal({ type: 'add' })} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-colors">Back</button>
              <button onClick={() => setModal({ type: 'upgrade' })} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2">
                <Zap className="w-4 h-4" /> Upgrade Package
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade Modal (Roadmap Placeholder) ── */}
      {modal.type === 'upgrade' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 text-center">
            <div className="px-6 py-8 space-y-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto shadow-lg">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Upgrade Package</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Package upgrades are managed by the Root Admin. Please contact your administrator to increase your slot limit.
              </p>
              <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5 mt-1">
                <ChevronRight className="w-3 h-3" />
                Self-service upgrade portal — coming soon
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setModal({ type: 'none' })}
                className="w-full px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
