import React, { useState, useEffect, useMemo } from 'react';
import { 
  Copy,
  Check,
  Trash2,
  Plus,
  RefreshCw, 
  Globe,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Search,
  Layers} from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'flowbite-react';
import { getPropertySlug, getPropertyAndRoomSlugs, API_ROOT_BASE } from '../services/api';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { useToast } from './ToastContext';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { t } from '../i18n/en';
import { Input } from './Input';
import { Button } from './Button';
import { Badge } from './Badge';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface Calendar {
  id: number;
  ical_url: string;
  service_name: string;
  service_type?: string;
  last_sync?: string;
  property_id?: number;
}

interface ICalSyncManagerProps {
  propertyId?: number;
  // True when rendered inside a room's Edit Room page or a single property's
  // Edit Property page (its current homes, after the standalone "iCal Sync"
  // sidebar page was removed) rather than as that standalone page itself -
  // hides the breadcrumb ("Dashboard / Integrations / iCal Channel API"),
  // which is simply wrong once this isn't its own page anymore.
  embedded?: boolean;
  // Explicit slug override for the specific property/room this instance is
  // scoped to. Required when embedding for an individual MULTI_KEY_ROOM: this
  // app selects rooms via a URL HASH (#room-101-...), not a path segment, so
  // getPropertySlug() (path-only) can never resolve to a room's own slug on
  // its own - it always resolves to the parent property, which is why every
  // backend call below (all keyed off X-Property-Slug) needs this override
  // to actually scope to just this room instead of silently falling back to
  // "every room under the parent property". Not needed for a single (non-
  // multi-key) property's own Edit Property page, since there the URL path
  // already resolves correctly.
  propertySlug?: string;
  // Set only when this instance is scoped to a single MULTI_KEY_ROOM (see
  // propertySlug above) - the parent MULTI_KEY property's own slug, needed
  // because ical_export.php's per-room feed is addressed as
  // ?property=<parent-slug>&room=<room-slug>, and propertySlug here is
  // already the ROOM's own slug, not the parent's. Omit for a SINGLE
  // property's own Edit Property page, where propertySlug already IS the
  // exportable property and there is no room segment.
  parentPropertySlug?: string;
}

export const ICalSyncManager: React.FC<ICalSyncManagerProps> = ({ propertyId, embedded = false, propertySlug: propertySlugOverride, parentPropertySlug }) => {
  const effectivePropertySlug = propertySlugOverride || getPropertySlug();
  // The URL an external channel (Airbnb/Booking.com/etc.) would subscribe to
  // in order to see THIS property's/room's own bookings. Built directly from
  // props, not from propertyRooms/get_multikey_property below - that fetch
  // only ever returns a MULTI_KEY parent's children, but this component is
  // never mounted with a parent's own id (see the two call sites: a room's
  // own id for a MULTI_KEY_ROOM, or a SINGLE property's own id) - so a grid
  // keyed off sibling rooms would always be empty and hide this entirely.
  const ownExportUrl = parentPropertySlug
    ? `${window.location.origin}${API_ROOT_BASE}/php/api/ical_export.php?property=${parentPropertySlug}&room=${effectivePropertySlug}`
    : `${window.location.origin}${API_ROOT_BASE}/php/api/ical_export.php?property=${effectivePropertySlug}`;
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [, setCurrentRoomSlug] = useState<string | null>(null);
  const [propertyRooms, setPropertyRooms] = useState<any[]>([]);
  const [copiedUrls, setCopiedUrls] = useState<Set<string | number>>(new Set());

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [mobileFeedsPage, setMobileFeedsPage] = useState(1);

  // Modal State for Adding Feed
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState('Airbnb Calendar');
  const [customServiceName, setCustomServiceName] = useState('');
  const [newImportUrl, setNewImportUrl] = useState('');
  const [selectedRoomForImport, setSelectedRoomForImport] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);

  // Per-room import form inputs
  const [roomImportPlatforms, setRoomImportPlatforms] = useState<{ [roomId: number]: string }>({});
  const [roomCustomNames, setRoomCustomNames] = useState<{ [roomId: number]: string }>({});
  const [roomImportUrls, setRoomImportUrls] = useState<{ [roomId: number]: string }>({});

  const { confirm } = useConfirm();
  const { showToast } = useToast();

  useEffect(() => {
    const { roomSlug } = getPropertyAndRoomSlugs();
    setCurrentRoomSlug(roomSlug || null);
    loadCalendars();

    if (propertyId) {
      fetchPropertyRooms(propertyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, effectivePropertySlug]);

  const fetchPropertyRooms = async (id: number) => {
    try {
      const response = await fetch(`/php/api/router.php?action=get_multikey_property&property_id=${id}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success && data.data?.rooms) {
        setPropertyRooms(data.data.rooms);
      }
    } catch (err) {
      console.error('Failed to fetch property rooms:', err);
    }
  };

  const loadCalendars = async () => {
    try {
      // X-Property-Slug is required here - this hits ical_sync.php directly (not
      // router.php), so the request URL itself carries no tenant/property path
      // segments for the backend to resolve the current property from. Without
      // it, every property's iCal Sync Manager silently fell back to the same
      // default property instead of showing (and scoping actions to) its own feeds.
      const response = await fetch('/php/api/ical_sync.php?action=get_ical_syncs', {
        credentials: 'include',
        headers: { 'X-Property-Slug': effectivePropertySlug },
      });
      const data = await response.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setCalendars(data.data);
      }
    } catch (error) {
      console.error('Failed to load calendars:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCalendar = async (overrideUrl?: string, overrideName?: string) => {
    const url = overrideUrl !== undefined ? overrideUrl : newImportUrl;
    let finalServiceName = '';

    if (overrideName !== undefined) {
      finalServiceName = overrideName;
    } else {
      const baseName = newServiceName === 'Other' ? customServiceName : newServiceName;
      const roomSuffix = selectedRoomForImport !== 'all' ? ` (${selectedRoomForImport})` : '';
      finalServiceName = `${baseName || 'Imported Calendar'}${roomSuffix}`;
    }

    if (!url.trim()) {
      showToast('Please enter a valid iCal URL', { type: 'error' });
      return;
    }

    try {
      setIsAdding(true);
      const propertySlug = effectivePropertySlug;
      const payload = {
        ical_url: url.trim(),
        service_type: 'ical',
        service_name: finalServiceName,
        sync_enabled: true,
        sync_direction: 'bidirectional',
        ...(propertyId ? { property_id: propertyId } : {}),
      };

      const response = await fetch('/php/api/ical_sync.php?action=create_ical_sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Property-Slug': propertySlug,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.status === 'success') {
        let msg = `iCal feed "${finalServiceName}" connected successfully`;
        if (data.sync_status === 'success') {
          msg += ` — ${data.sync_message || 'Initial sync complete'}`;
        }
        showToast(msg, { type: 'success', duration: 5000 });
        setNewImportUrl('');
        setCustomServiceName('');
        setIsAddModalOpen(false);
        loadCalendars();
      } else {
        showToast(data.message || 'Failed to add iCal feed', { type: 'error' });
      }
    } catch (err: any) {
      showToast('Network error: ' + (err?.message || 'Could not connect'), { type: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleManualSync = async (calId: number, calName: string) => {
    try {
      setSyncingId(calId);
      const formData = new FormData();
      formData.append('id', String(calId));

      const response = await fetch('/php/api/ical_sync.php?action=sync_ical_events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Property-Slug': effectivePropertySlug },
        body: formData,
      });
      const data = await response.json();
      if (data.status === 'success') {
        showToast(`Synced "${calName}" — ${data.message || 'Events updated'}`, { type: 'success' });
        loadCalendars();
      } else {
        showToast(`Sync failed for "${calName}": ${data.message || 'Unknown error'}`, { type: 'error' });
      }
    } catch (err) {
      showToast(`Error syncing "${calName}"`, { type: 'error' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    if (calendars.length === 0) return;
    setIsSyncingAll(true);
    let successCount = 0;
    for (const cal of calendars) {
      try {
        const formData = new FormData();
        formData.append('id', String(cal.id));
        const res = await fetch('/php/api/ical_sync.php?action=sync_ical_events', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Property-Slug': effectivePropertySlug },
          body: formData,
        });
        const data = await res.json();
        if (data.status === 'success') successCount++;
      } catch (e) {
        console.error(e);
      }
    }
    setIsSyncingAll(false);
    showToast(`Batch sync complete: ${successCount}/${calendars.length} channels synchronized`, { type: successCount === calendars.length ? 'success' : 'warning', duration: 5000 });
    loadCalendars();
  };

  const handleDeleteCalendar = async (calId: number, calName: string) => {
    const confirmed = await confirm({
      title: 'Remove iCal Channel',
      message: `Are you sure you want to remove the iCal feed sync for "${calName}"?`,
      confirmText: 'Remove Integration',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const response = await fetch('/php/api/ical_sync.php?action=delete_ical_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Property-Slug': effectivePropertySlug },
        credentials: 'include',
        body: JSON.stringify({ id: calId }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        showToast(`"${calName}" removed successfully`, { type: 'success' });
        loadCalendars();
      } else {
        showToast('Failed to remove feed', { type: 'error' });
      }
    } catch (error: any) {
      showToast('Error removing iCal feed', { type: 'error' });
    }
  };

  const copyToClipboard = async (text: string, id: string | number) => {
    try {
      await navigator.clipboard.writeText(text);
      
      showToast('URL copied to clipboard', { type: 'success' });
      setCopiedUrls((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setCopiedUrls((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 2000);
    } catch (err) {
      showToast('Failed to copy', { type: 'error' });
    }
  };

  // Helper function to format platform pill badges
  const getPlatformBadge = (serviceName: string) => {
    const lower = serviceName.toLowerCase();
    if (lower.includes('airbnb')) {
      return {
        variant: 'danger' as const,
        name: t('platform_airbnb_label', 'Airbnb')
      };
    }
    if (lower.includes('booking')) {
      return {
        variant: 'info' as const,
        name: t('platform_booking_label', 'Booking.com')
      };
    }
    if (lower.includes('vrbo') || lower.includes('homeaway')) {
      return {
        variant: 'info' as const,
        name: t('platform_vrbo_label', 'VRBO')
      };
    }
    if (lower.includes('google')) {
      return {
        variant: 'success' as const,
        name: t('platform_google_calendar_label', 'Google Calendar')
      };
    }
    return {
      variant: 'neutral' as const,
      name: t('platform_custom_ical_label', 'Custom iCal')
    };
  };

  // Filtered list of calendars
  const filteredCalendars = useMemo(() => {
    return calendars.filter((cal) => {
      const matchesSearch = 
        cal.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cal.ical_url.toLowerCase().includes(searchQuery.toLowerCase());
      
      const lowerName = cal.service_name.toLowerCase();
      let matchesPlatform = true;
      if (platformFilter === 'airbnb') matchesPlatform = lowerName.includes('airbnb');
      else if (platformFilter === 'booking') matchesPlatform = lowerName.includes('booking');
      else if (platformFilter === 'vrbo') matchesPlatform = lowerName.includes('vrbo') || lowerName.includes('homeaway');
      else if (platformFilter === 'google') matchesPlatform = lowerName.includes('google');
      else if (platformFilter === 'other') matchesPlatform = !lowerName.includes('airbnb') && !lowerName.includes('booking') && !lowerName.includes('vrbo') && !lowerName.includes('google');

      return matchesSearch && matchesPlatform;
    });
  }, [calendars, searchQuery, platformFilter]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3 ical-sync-manager__loading">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="text-sm font-semibold">{t('ical_loading_message', 'Loading iCal integration feeds...')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-800 dark:text-slate-200 ical-sync-manager__root">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-4 ical-sync-manager__header-banner">
        {/* Breadcrumb Navigation */}
        {!embedded && (
          <nav className="flex text-slate-400 text-[11px] font-semibold gap-1.5 items-center ical-sync-manager__breadcrumb">
            <span>{t('breadcrumb_dashboard_label', 'Dashboard')}</span>
            <span>/</span>
            <span>{t('breadcrumb_integrations_label', 'Integrations')}</span>
            <span>/</span>
            <span className="text-blue-600 dark:text-blue-400">{t('breadcrumb_ical_channel_api_label', 'iCal Channel API')}</span>
          </nav>
        )}

        <PageHeader
          title={t('ical_ota_channel_integration_heading', 'iCal & OTA Channel Integration Keys')}
          subtitle={t('ical_ota_channel_integration_subtitle', 'Synchronize availability feeds across Airbnb, Booking.com, VRBO, Agoda, and custom channel endpoints.')}
        >
          <PageHeaderButton
            onClick={handleSyncAll}
            icon={RefreshCw}
            iconClassName={isSyncingAll ? 'animate-spin' : ''}
            variant="secondary"
            disabled={isSyncingAll || calendars.length === 0}
          >
            {isSyncingAll ? t('syncing_all_button', 'Syncing All...') : t('sync_all_feeds_button', 'Sync All Feeds')}
          </PageHeaderButton>
          <PageHeaderButton onClick={() => setIsAddModalOpen(true)} icon={Plus}>
            {t('connect_ical_feed_button', 'Connect iCal Feed')}
          </PageHeaderButton>
        </PageHeader>
      </div>

      {/* Top 3 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ical-sync-manager__kpi-grid">
         {/* Card 1: Active Connected Channels */}
         <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-2 ical-sync-manager__kpi-item">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('connected_ical_feeds_label', 'Connected iCal Feeds')}</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
              <Globe className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {calendars.length} <span className="text-xs font-semibold text-slate-500">{t('active_unit_label', 'Active')}</span>
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> {t('bidirectional_ota_sync_enabled_label', 'Bidirectional OTA Sync Enabled')}
          </p>
        </div>

         {/* Card 2: Auto-Sync Worker Interval */}
         <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-2 ical-sync-manager__kpi-item">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('background_worker_label', 'Background Worker')}</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            15 Min <span className="text-xs font-semibold text-slate-500">{t('interval_unit_label', 'Interval')}</span>
          </p>
          <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('automated_cron_engine_active_label', 'Automated Cron Engine Active')}
          </p>
        </div>

        {/* Card 3: Channel Health */}
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('integration_health_label', 'Integration Health')}</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            100% <span className="text-xs font-semibold text-slate-500">{t('operational_unit_label', 'Operational')}</span>
          </p>
          <p className="text-[10px] text-slate-500 font-semibold">{t('zero_availability_conflicts_label', 'Zero availability conflicts')}</p>
        </div>
      </div>

      {/* Main Content Area: API Data Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 ical-sync-manager__filter-toolbar flex-1">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 z-10" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('filter_feeds_placeholder', 'Filter feeds by platform or endpoint URL...')}
                className="pl-9 ical-sync-manager__search-input w-full"
              />
            </div>

            {/* Platform Filter Dropdown */}
            <div className="w-full sm:w-44 shrink-0">
              <StyledSelect
                value={platformFilter}
                onChange={setPlatformFilter}
                options={[
                  { value: 'all', label: t('filter_all_platforms_label', 'All Platforms') },
                  { value: 'airbnb', label: t('filter_airbnb_label', 'Airbnb') },
                  { value: 'booking', label: t('filter_booking_label', 'Booking.com') },
                  { value: 'vrbo', label: t('filter_vrbo_label', 'VRBO') },
                  { value: 'google', label: t('filter_google_calendar_label', 'Google Calendar') },
                  { value: 'other', label: t('filter_custom_ical_label', 'Custom iCal') },
                ]}
              />
            </div>
          </div>

          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
            {t('showing_label', 'Showing')} {filteredCalendars.length} {t('of_label', 'of')} {calendars.length} {t('connected_feeds_label', 'Connected Feeds')}
          </div>
        </div>

        {/* Desktop View: Full Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse ical-sync-manager__table">
            <thead className="bg-slate-100/70 dark:bg-slate-900/80 uppercase text-[10px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 tracking-wider ical-sync-manager__table-header">
              <tr className="ical-sync-manager__table-header-row">
                <th className="p-4 ical-sync-manager__table-header-cell">{t('channel_platform_column', 'Channel / Platform')}</th>
                <th className="p-4 ical-sync-manager__table-header-cell">{t('endpoint_url_column', 'Endpoint URL (.ics)')}</th>
                <th className="p-4 text-center ical-sync-manager__table-header-cell">{t('sync_mode_column', 'Sync Mode')}</th>
                <th className="p-4 ical-sync-manager__table-header-cell">{t('last_synchronization_column', 'Last Synchronization')}</th>
                <th className="p-4 text-center ical-sync-manager__table-header-cell">{t('status_column', 'Status')}</th>
                <th className="p-4 text-right ical-sync-manager__table-header-cell">{t('actions_column', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium text-xs ical-sync-manager__table-body">
              {filteredCalendars.map((cal) => {
                const badge = getPlatformBadge(cal.service_name);
                const isSyncing = syncingId === cal.id;
                const isCopied = copiedUrls.has(cal.id);

                return (
                  <tr key={cal.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors">
                    {/* Platform & Name */}
                    <td className="ical-sync-manager__cell p-4">
                      <div className="flex items-center gap-2.5">
                        <Badge variant={badge.variant} dot size="sm">
                          {badge.name}
                        </Badge>
                        <span className="font-semibold text-slate-900 dark:text-white text-xs truncate max-w-[200px]">
                          {cal.service_name}
                        </span>
                      </div>
                    </td>

                    {/* Endpoint URL with Copy Button */}
                    <td className="ical-sync-manager__cell p-4 max-w-xs">
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate flex-1">
                          {cal.ical_url}
                        </span>
                        <button
                          onClick={() => copyToClipboard(cal.ical_url, cal.id)}
                          className="button button--copy p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition cursor-pointer shrink-0"
                          title={t('copy_feed_url_tooltip', 'Copy feed URL')}
                        >
                          <span className="button__icon flex items-center">
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      </div>
                    </td>

                    {/* Sync Mode */}
                    <td className="ical-sync-manager__cell p-4 text-center">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-mono text-[10px]">
                        {t('auto_15m_badge', 'Auto (15m)')}
                      </span>
                    </td>

                    {/* Last Synced */}
                    <td className="ical-sync-manager__cell p-4">
                      {cal.last_sync ? (
                        <div className="space-y-0.5">
                          <p className="text-slate-900 dark:text-white font-semibold text-xs">
                            {new Date(cal.last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatDateDDMMYYYY(cal.last_sync)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">{t('never_synced_label', 'Never synced')}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="ical-sync-manager__cell p-4 text-center">
                      <Badge variant="success" dot size="sm">
                        {t('connected_badge', 'Connected')}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="ical-sync-manager__cell p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleManualSync(cal.id, cal.service_name)}
                          disabled={isSyncing}
                          className="button button--sync px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer border border-blue-200 dark:border-blue-800 text-[11px]"
                          title={t('sync_channel_now_tooltip', 'Sync channel now')}
                        >
                          <span className="button__icon flex items-center">
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                          </span>
                          <span>{isSyncing ? t('syncing_button', 'Syncing...') : t('sync_now_button', 'Sync Now')}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteCalendar(cal.id, cal.service_name)}
                          className="button button--delete p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer border border-transparent hover:border-rose-200"
                          title={t('delete_integration_key_tooltip', 'Delete integration key')}
                        >
                          <span className="button__icon flex items-center">
                            <Trash2 className="w-4 h-4" />
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredCalendars.length === 0 && (
                <tr>
                  <td colSpan={6} className="ical-sync-manager__cell text-center p-12 text-slate-400 space-y-3">
                    <Globe className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                    <p className="font-semibold text-xs">{t('no_ical_feeds_match_filter_message', 'No iCal integration feeds match your current filter.')}</p>
<Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
                      <span>{t('connect_first_ical_feed_button', 'Connect First iCal Feed')}</span>
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Touch-First Mobile Cards View with 10-Item Pagination */}
        <div className="md:hidden p-3 space-y-3">
          <div className="divide-y divide-slate-100 dark:divide-slate-700 space-y-3">
            {filteredCalendars.slice((mobileFeedsPage - 1) * 10, mobileFeedsPage * 10).map((cal) => {
              const badge = getPlatformBadge(cal.service_name);
              const isSyncing = syncingId === cal.id;
              const isCopied = copiedUrls.has(cal.id);

              return (
                <div key={cal.id} className="pt-3 first:pt-0 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={badge.variant} dot size="sm">
                          {badge.name}
                        </Badge>
                        <Badge variant="success" dot size="sm">
                          {t('connected_badge', 'Connected')}
                        </Badge>
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{cal.service_name}</h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate flex-1">
                      {cal.ical_url}
                    </span>
                    <button
                      onClick={() => copyToClipboard(cal.ical_url, cal.id)}
                      className="button button--copy p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition cursor-pointer shrink-0"
                      title={t('copy_feed_url_tooltip', 'Copy feed URL')}
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Sync Mode</span>
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-mono text-[10px] font-semibold inline-block mt-0.5">
                        {t('auto_15m_badge', 'Auto (15m)')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Last Synchronization</span>
                      {cal.last_sync ? (
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                          {formatDateDDMMYYYY(cal.last_sync)} {new Date(cal.last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">{t('never_synced_label', 'Never synced')}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                    <button
                      onClick={() => handleManualSync(cal.id, cal.service_name)}
                      disabled={isSyncing}
                      className="button button--sync px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-blue-200 dark:border-blue-800 text-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? t('syncing_button', 'Syncing...') : t('sync_now_button', 'Sync Now')}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteCalendar(cal.id, cal.service_name)}
                      className="button button--delete p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer border border-slate-200 dark:border-slate-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredCalendars.length === 0 && (
              <div className="text-center p-8 text-slate-400 space-y-3">
                <Globe className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                <p className="font-semibold text-xs">{t('no_ical_feeds_match_filter_message', 'No iCal integration feeds match your current filter.')}</p>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="button button--connect px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition text-xs inline-flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('connect_first_ical_feed_button', 'Connect First iCal Feed')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile 10-Item Pagination Controls */}
          {filteredCalendars.length > 10 && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                disabled={mobileFeedsPage === 1}
                onClick={() => setMobileFeedsPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Page {mobileFeedsPage} of {Math.ceil(filteredCalendars.length / 10)}
              </span>
              <button
                type="button"
                disabled={mobileFeedsPage >= Math.ceil(filteredCalendars.length / 10)}
                onClick={() => setMobileFeedsPage((p) => Math.min(Math.ceil(filteredCalendars.length / 10), p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Export iCal Feed - the URL to paste into Airbnb/Booking.com/etc.'s
          "import calendar" setting so bookings made in this app block those
          platforms too. Scoped to whatever this instance was mounted for
          (see ownExportUrl above) - not a propertyRooms/get_multikey_property
          grid, which (16 Aug 2026) turned out to never actually populate at
          either of this component's two real call sites (a room's own id,
          or a SINGLE property's own id - never a MULTI_KEY parent's id), so
          that grid silently never rendered anywhere despite being fully
          implemented; a user had no way to ever see or copy their export
          URL. Kept simple: one URL, for one property/room, always visible. */}
      <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="ical-sync-manager__subtitle text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <span>{t('export_ical_feed_label', 'Export iCal Feed')}</span>
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('export_ical_feed_hint', 'Paste this URL into Airbnb/Booking.com/etc. as an "import calendar" link, so bookings made here block those platforms too.')}
        </p>
        <div className="flex gap-2">
          <Input
            type="text"
            value={ownExportUrl}
            readOnly
            className="flex-1 font-mono truncate"
          />
          <button
            onClick={() => copyToClipboard(ownExportUrl, 'own-export-url')}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold rounded-lg transition text-[11px] cursor-pointer shrink-0"
          >
            {copiedUrls.has('own-export-url') ? t('copied_button', 'Copied') : t('copy_button', 'Copy')}
          </button>
        </div>
      </div>

      {/* Per-Room iCal Configuration for MultiKey Properties */}
      {propertyRooms.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <h3 className="ical-sync-manager__subtitle text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <span>{t('room_by_room_ical_sync_settings_label', 'Room-by-Room iCal Sync Settings')} ({propertyRooms.length} {t('rooms_plural_label', 'Rooms')})</span>
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {propertyRooms.map((room) => {
              const platform = roomImportPlatforms[room.id] || 'Airbnb';
              const customName = roomCustomNames[room.id] || '';
              const url = roomImportUrls[room.id] || '';

              const roomCalendars = calendars.filter(
                (c) =>
                  c.service_name.includes(`[${room.name}]`) ||
                  c.service_name.includes(`(${room.name})`) ||
                  c.service_name.includes(room.name) ||
                  c.service_name.includes(room.slug)
              );

              return (
                <div
                  key={room.id}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 sm:p-6 shadow-md space-y-4"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div>
                      <h4 className="ical-sync-manager__caption font-semibold text-base text-slate-900 dark:text-white">{room.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">{t('room_slug_label', 'Room Slug:')} {room.slug}</p>
                    </div>
                    <Badge variant="info" size="sm">
                      {roomCalendars.length} {t('feeds_label', 'Feeds')}
                    </Badge>
                  </div>

                  {/* Connected Feeds for this Room */}
                  {roomCalendars.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{t('connected_feeds_label', 'Connected Feeds')} ({roomCalendars.length})</span>
                      <div className="space-y-1.5">
                        {roomCalendars.map((cal) => {
                          const badge = getPlatformBadge(cal.service_name);
                          const isSyncing = syncingId === cal.id;
                          const isCopiedUrl = copiedUrls.has(cal.id);
                          return (
                            <div key={cal.id} className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                              <Badge variant={badge.variant} dot size="sm">
                                {badge.name}
                              </Badge>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate flex-1">
                                {cal.service_name}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => copyToClipboard(cal.ical_url, cal.id)}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 transition cursor-pointer"
                                  title={t('copy_feed_url_tooltip', 'Copy feed URL')}
                                >
                                  {isCopiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                </button>
                                <button
                                  onClick={() => handleManualSync(cal.id, cal.service_name)}
                                  disabled={isSyncing}
                                  className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition cursor-pointer disabled:opacity-50"
                                  title={t('sync_now_tooltip', 'Sync now')}
                                >
                                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleDeleteCalendar(cal.id, cal.service_name)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                                  title={t('delete_feed_tooltip', 'Delete feed')}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add Feed Inputs */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">{t('connect_channel_for_label', 'Connect Channel for')} {room.name}</span>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="w-36 shrink-0">
                        <StyledSelect
                          value={platform}
                          onChange={(val) =>
                            setRoomImportPlatforms((prev) => ({ ...prev, [room.id]: val }))
                          }
                          options={[
                            { value: 'Airbnb', label: t('platform_airbnb_label', 'Airbnb') },
                            { value: 'Booking.com', label: t('platform_booking_label', 'Booking.com') },
                            { value: 'VRBO', label: t('platform_vrbo_label', 'VRBO') },
                            { value: 'Google', label: t('platform_google_label', 'Google') },
                            { value: 'Other', label: t('platform_other_label', 'Other') },
                          ]}
                        />
                      </div>

                      <Input
                        type="url"
                        value={url}
                        onChange={(e) =>
                          setRoomImportUrls((prev) => ({ ...prev, [room.id]: e.target.value }))
                        }
                        placeholder={t('url_placeholder', 'https://...')}
                        className="flex-1 font-mono"
                      />

                      <button
                        onClick={async () => {
                          if (!url.trim()) return;
                          const label = platform === 'Other' ? customName : platform;
                          await handleAddCalendar(url, `[${room.name}] ${label || 'Imported Feed'}`);
                          setRoomImportUrls((prev) => ({ ...prev, [room.id]: '' }));
                          setRoomCustomNames((prev) => ({ ...prev, [room.id]: '' }));
                        }}
                        disabled={!url.trim()}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition whitespace-nowrap cursor-pointer shadow-md"
                      >
                        {t('add_feed_button', 'Add Feed')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal for Connecting New iCal Feed */}
      <Modal
        show={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        dismissible={!isAdding}
        size="lg"
        className="z-58 ical-sync-manager__add-modal"
      >
        <ModalHeader as="div">
          <h3 className="ical-sync-manager__subtitle text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            <span>{t('connect_new_ical_feed_heading', 'Connect New iCal Feed')}</span>
          </h3>
        </ModalHeader>
        <ModalBody className="space-y-4 text-xs">
          <div>
            <label className="block font-extrabold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider text-[10px]">
              {t('select_channel_platform_label', '1. Select Channel Platform')}
            </label>
            <StyledSelect
              value={newServiceName}
              onChange={setNewServiceName}
              options={[
                { value: 'Airbnb Calendar', label: t('modal_platform_airbnb_calendar_label', 'Airbnb Calendar') },
                { value: 'Booking.com Calendar', label: t('modal_platform_booking_calendar_label', 'Booking.com Calendar') },
                { value: 'Google Calendar', label: t('modal_platform_google_calendar_label', 'Google Calendar') },
                { value: 'VRBO / HomeAway', label: t('modal_platform_vrbo_homeaway_label', 'VRBO / HomeAway') },
                { value: 'Agoda Calendar', label: t('modal_platform_agoda_label', 'Agoda Calendar') },
                { value: 'Other', label: t('modal_platform_other_ota_label', 'Other Custom OTA') },
              ]}
            />
          </div>

          {newServiceName === 'Other' && (
            <div>
              <Input
                label={t('custom_feed_name_label', 'Custom Feed Name')}
                type="text"
                value={customServiceName}
                onChange={(e) => setCustomServiceName(e.target.value)}
                placeholder={t('custom_feed_name_placeholder', 'e.g. Direct Booking Channel')}
              />
            </div>
          )}

          {propertyRooms.length > 0 && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider text-[10px]">
                {t('target_room_assignment_label', '2. Target Room Assignment')}
              </label>
              <StyledSelect
                value={selectedRoomForImport}
                onChange={setSelectedRoomForImport}
                options={[
                  { value: 'all', label: t('entire_resort_property_label', 'Entire Resort Property') },
                  ...propertyRooms.map((r) => ({ value: r.name, label: `${t('room_option_prefix', 'Room:')} ${r.name}` })),
                ]}
              />
            </div>
          )}

          <div>
            <Input
              label={`${propertyRooms.length > 0 ? '3' : '2'}. ${t('paste_ical_feed_url_label', 'Paste iCal Feed URL')}`}
              type="url"
              value={newImportUrl}
              onChange={(e) => setNewImportUrl(e.target.value)}
              placeholder={t('ical_url_example_placeholder', 'https://www.airbnb.com/calendar/ical/...')}
              className="font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              {t('ical_url_helper_text', 'Copy the export .ics calendar link from your OTA host dashboard and paste it here.')}
            </p>
          </div>
        </ModalBody>
        <ModalFooter className="justify-end">
          <Button
            type="button"
            variant="primary"
            onClick={() => handleAddCalendar()}
            disabled={isAdding || !newImportUrl.trim()}
            leftIcon={isAdding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          >
            {isAdding ? t('connecting_button', 'Connecting...') : t('connect_feed_button', 'Connect Feed')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
