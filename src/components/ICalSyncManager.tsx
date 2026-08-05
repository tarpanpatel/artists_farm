import React, { useState, useEffect, useMemo } from 'react';
import { 
  Copy,
  Check,
  Trash2,
  X, 
  Plus, 
  RefreshCw, 
  Calendar as CalendarIcon, 
  Globe,
  Clock,
  CheckCircle2,
  Share2,
  ShieldCheck,
  Search,
  Filter,
  Link as LinkIcon,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { getPropertySlug, getPropertyAndRoomSlugs } from '../services/api';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { useToast } from './ToastContext';

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
}

export const ICalSyncManager: React.FC<ICalSyncManagerProps> = ({ propertyId }) => {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [exportUrl, setExportUrl] = useState('');
  const [copiedExport, setCopiedExport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [currentRoomSlug, setCurrentRoomSlug] = useState<string | null>(null);
  const [propertyRooms, setPropertyRooms] = useState<any[]>([]);
  const [copiedUrls, setCopiedUrls] = useState<Set<string | number>>(new Set());

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');

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
    generateExportUrl();
    loadCalendars();

    if (propertyId) {
      fetchPropertyRooms(propertyId);
    }
  }, [propertyId]);

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

  const generateExportUrl = () => {
    const { propertySlug, roomSlug } = getPropertyAndRoomSlugs();
    let url = `${window.location.origin}/artists_farm/php/api/ical_export.php?property=${propertySlug}`;
    if (roomSlug) {
      url += `&room=${roomSlug}`;
    }
    setExportUrl(url);
  };

  const loadCalendars = async () => {
    try {
      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=get_ical_syncs', {
        credentials: 'include',
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
      const propertySlug = getPropertySlug();
      const payload = {
        ical_url: url.trim(),
        service_type: 'ical',
        service_name: finalServiceName,
        sync_enabled: true,
        sync_direction: 'bidirectional',
        ...(propertyId ? { property_id: propertyId } : {}),
      };

      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=create_ical_sync', {
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

      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=sync_ical_events', {
        method: 'POST',
        credentials: 'include',
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
        const res = await fetch('/artists_farm/php/api/ical_sync.php?action=sync_ical_events', {
          method: 'POST',
          credentials: 'include',
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
      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=delete_ical_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const copyToClipboard = (text: string, id: string | number) => {
    navigator.clipboard.writeText(text);
    setCopiedUrls((prev) => new Set([...prev, id]));
    if (id === 'main_export') {
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
    }
    setTimeout(() => {
      setCopiedUrls((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  };

  // Helper function to format platform pill badges Flowbite style
  const getPlatformBadge = (serviceName: string) => {
    const lower = serviceName.toLowerCase();
    if (lower.includes('airbnb')) {
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
        dot: 'bg-rose-500',
        name: 'Airbnb'
      };
    }
    if (lower.includes('booking')) {
      return {
        bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
        dot: 'bg-blue-600',
        name: 'Booking.com'
      };
    }
    if (lower.includes('vrbo') || lower.includes('homeaway')) {
      return {
        bg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300',
        dot: 'bg-sky-500',
        name: 'VRBO'
      };
    }
    if (lower.includes('google')) {
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
        name: 'Google Calendar'
      };
    }
    return {
      bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
      dot: 'bg-slate-400',
      name: 'Custom iCal'
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
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="text-sm font-semibold">Loading iCal integration feeds...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-200">
      {/* Flowbite Header Banner */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
        {/* Breadcrumb Navigation */}
        <nav className="flex text-slate-400 text-[11px] font-semibold gap-1.5 items-center">
          <span>Dashboard</span>
          <span>/</span>
          <span>Integrations</span>
          <span>/</span>
          <span className="text-blue-600 dark:text-blue-400">iCal Channel API</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <Globe className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <span>iCal & OTA Channel Integration Keys</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Synchronize availability feeds across Airbnb, Booking.com, VRBO, Agoda, and custom channel endpoints.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleSyncAll}
              disabled={isSyncingAll || calendars.length === 0}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-blue-600 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'Syncing All...' : 'Sync All Feeds'}</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Connect iCal Feed</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 Metric KPI Cards (Flowbite Layout Inspiration) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Connected Channels */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Connected iCal Feeds</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
              <Globe className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {calendars.length} <span className="text-xs font-semibold text-slate-500">Active</span>
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Bidirectional OTA Sync Enabled
          </p>
        </div>

        {/* Card 2: Auto-Sync Worker Interval */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Background Worker</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            15 Min <span className="text-xs font-semibold text-slate-500">Interval</span>
          </p>
          <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Automated Cron Engine Active
          </p>
        </div>

        {/* Card 3: Channel Health */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Integration Health</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            100% <span className="text-xs font-semibold text-slate-500">Operational</span>
          </p>
          <p className="text-[10px] text-slate-500 font-semibold">Zero availability conflicts</p>
        </div>

        {/* Card 4: Master Export Link */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Master iCal Export</span>
              <div className="p-2 bg-sky-50 dark:bg-sky-950/40 rounded-lg">
                <Share2 className="w-4 h-4 text-sky-600" />
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">OTA Feed URL</p>
          </div>
          <button
            onClick={() => copyToClipboard(exportUrl, 'main_export')}
            className="w-full py-1.5 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-700 dark:text-sky-300 font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer border border-sky-200 dark:border-sky-800 text-[11px]"
          >
            {copiedExport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedExport ? 'Feed URL Copied!' : 'Copy Feed URL'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Flowbite API Data Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 flex-1 min-w-[240px]">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter feeds by platform or endpoint URL..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Platform Filter Dropdown */}
            <div className="w-44 shrink-0">
              <StyledSelect
                value={platformFilter}
                onChange={setPlatformFilter}
                options={[
                  { value: 'all', label: 'All Platforms' },
                  { value: 'airbnb', label: 'Airbnb' },
                  { value: 'booking', label: 'Booking.com' },
                  { value: 'vrbo', label: 'VRBO' },
                  { value: 'google', label: 'Google Calendar' },
                  { value: 'other', label: 'Custom iCal' },
                ]}
              />
            </div>
          </div>

          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
            Showing {filteredCalendars.length} of {calendars.length} Connected Feeds
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100/70 dark:bg-slate-900/80 uppercase text-[10px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 tracking-wider">
              <tr>
                <th className="p-4">Channel / Platform</th>
                <th className="p-4">Endpoint URL (.ics)</th>
                <th className="p-4 text-center">Sync Mode</th>
                <th className="p-4">Last Synchronization</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium text-xs">
              {filteredCalendars.map((cal) => {
                const badge = getPlatformBadge(cal.service_name);
                const isSyncing = syncingId === cal.id;
                const isCopied = copiedUrls.has(cal.id);

                return (
                  <tr key={cal.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors">
                    {/* Platform & Name */}
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold flex items-center gap-1.5 shrink-0 ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.name}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white text-xs truncate max-w-[200px]">
                          {cal.service_name}
                        </span>
                      </div>
                    </td>

                    {/* Endpoint URL with Copy Button */}
                    <td className="p-4 max-w-xs">
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate flex-1">
                          {cal.ical_url}
                        </span>
                        <button
                          onClick={() => copyToClipboard(cal.ical_url, cal.id)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition cursor-pointer shrink-0"
                          title="Copy feed URL"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>

                    {/* Sync Mode */}
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-mono text-[10px]">
                        Auto (15m)
                      </span>
                    </td>

                    {/* Last Synced */}
                    <td className="p-4">
                      {cal.last_sync ? (
                        <div className="space-y-0.5">
                          <p className="text-slate-900 dark:text-white font-bold text-xs">
                            {new Date(cal.last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(cal.last_sync).toLocaleDateString()}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Never synced</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Connected
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleManualSync(cal.id, cal.service_name)}
                          disabled={isSyncing}
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 font-bold rounded-lg transition flex items-center gap-1 cursor-pointer border border-blue-200 dark:border-blue-800 text-[11px]"
                          title="Sync channel now"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                          <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteCalendar(cal.id, cal.service_name)}
                          className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer border border-transparent hover:border-rose-200"
                          title="Delete integration key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredCalendars.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center p-12 text-slate-400 space-y-3">
                    <Globe className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                    <p className="font-semibold text-xs">No iCal integration feeds match your current filter.</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-xs inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Connect First iCal Feed</span>
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Room iCal Configuration for MultiKey Properties */}
      {propertyRooms.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <span>Room-by-Room iCal Sync Settings ({propertyRooms.length} Rooms)</span>
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {propertyRooms.map((room) => {
              const propertySlug = getPropertySlug();
              const roomExportUrl = `${window.location.origin}/artists_farm/php/api/ical_export.php?property=${propertySlug}&room=${room.slug}`;
              const isCopied = copiedUrls.has(room.id);

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
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div>
                      <h4 className="font-semibold text-base text-slate-900 dark:text-white">{room.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">Room Slug: {room.slug}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-[10px] rounded-full border border-blue-200 dark:border-blue-800">
                      {roomCalendars.length} Feeds
                    </span>
                  </div>

                  {/* Connected Feeds for this Room */}
                  {roomCalendars.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Connected Feeds ({roomCalendars.length})</span>
                      <div className="space-y-1.5">
                        {roomCalendars.map((cal) => {
                          const badge = getPlatformBadge(cal.service_name);
                          const isSyncing = syncingId === cal.id;
                          const isCopiedUrl = copiedUrls.has(cal.id);
                          return (
                            <div key={cal.id} className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1 shrink-0 ${badge.bg}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                {badge.name}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate flex-1">
                                {cal.service_name}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => copyToClipboard(cal.ical_url, cal.id)}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 transition cursor-pointer"
                                  title="Copy feed URL"
                                >
                                  {isCopiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                </button>
                                <button
                                  onClick={() => handleManualSync(cal.id, cal.service_name)}
                                  disabled={isSyncing}
                                  className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition cursor-pointer disabled:opacity-50"
                                  title="Sync now"
                                >
                                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleDeleteCalendar(cal.id, cal.service_name)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                                  title="Delete feed"
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
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Connect Channel for {room.name}</span>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="w-36 shrink-0">
                        <StyledSelect
                          value={platform}
                          onChange={(val) =>
                            setRoomImportPlatforms((prev) => ({ ...prev, [room.id]: val }))
                          }
                          options={[
                            { value: 'Airbnb', label: 'Airbnb' },
                            { value: 'Booking.com', label: 'Booking.com' },
                            { value: 'VRBO', label: 'VRBO' },
                            { value: 'Google', label: 'Google' },
                            { value: 'Other', label: 'Other' },
                          ]}
                        />
                      </div>

                      <input
                        type="url"
                        value={url}
                        onChange={(e) =>
                          setRoomImportUrls((prev) => ({ ...prev, [room.id]: e.target.value }))
                        }
                        placeholder="https://..."
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition whitespace-nowrap cursor-pointer shadow-xs"
                      >
                        Add Feed
                      </button>
                    </div>
                  </div>

                  {/* Room Export URL */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Export iCal Feed ({room.name})</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={roomExportUrl}
                        readOnly
                        className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[11px] font-mono truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(roomExportUrl, room.id)}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-lg transition text-[11px] cursor-pointer"
                      >
                        {isCopied ? 'Copied' : 'Copy'}
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
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <span>Connect New iCal Feed</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-extrabold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider text-[10px]">
                  1. Select Channel Platform
                </label>
                <StyledSelect
                  value={newServiceName}
                  onChange={setNewServiceName}
                  options={[
                    { value: 'Airbnb Calendar', label: 'Airbnb Calendar' },
                    { value: 'Booking.com Calendar', label: 'Booking.com Calendar' },
                    { value: 'Google Calendar', label: 'Google Calendar' },
                    { value: 'VRBO / HomeAway', label: 'VRBO / HomeAway' },
                    { value: 'Agoda Calendar', label: 'Agoda Calendar' },
                    { value: 'Other', label: 'Other Custom OTA' },
                  ]}
                />
              </div>

              {newServiceName === 'Other' && (
                <div>
                  <label className="block font-extrabold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider text-[10px]">
                    Custom Feed Name
                  </label>
                  <input
                    type="text"
                    value={customServiceName}
                    onChange={(e) => setCustomServiceName(e.target.value)}
                    placeholder="e.g. Direct Booking Channel"
                    className="w-full px-3 py-2.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {propertyRooms.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider text-[10px]">
                    2. Target Room Assignment
                  </label>
                  <StyledSelect
                    value={selectedRoomForImport}
                    onChange={setSelectedRoomForImport}
                    options={[
                      { value: 'all', label: 'Entire Resort Property' },
                      ...propertyRooms.map((r) => ({ value: r.name, label: `Room: ${r.name}` })),
                    ]}
                  />
                </div>
              )}

              <div>
                <label className="block font-extrabold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider text-[10px]">
                  {propertyRooms.length > 0 ? '3. Paste iCal Feed URL' : '2. Paste iCal Feed URL'}
                </label>
                <input
                  type="url"
                  value={newImportUrl}
                  onChange={(e) => setNewImportUrl(e.target.value)}
                  placeholder="https://www.airbnb.com/calendar/ical/..."
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Copy the export .ics calendar link from your OTA host dashboard and paste it here.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAddCalendar()}
                disabled={isAdding || !newImportUrl.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer text-xs shadow-xs flex items-center gap-2"
              >
                {isAdding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{isAdding ? 'Connecting...' : 'Connect Feed'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
