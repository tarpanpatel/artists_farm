import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Check,
  Loader2,
  Layers,
  Building,
  CheckCircle2,
  Copy,
  Search,
  AlertTriangle,
  Send,
  Zap,
} from './icons/FlowbiteIcons';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { PageHeader } from './PageHeader';
import { Button } from './Button';
import { Badge } from './Badge';
import { DateRangePicker } from './DateRangePicker';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateUtils';
import { t } from '../i18n/en';

interface ChannexMapping {
  id: number;
  property_id: number;
  room_id: number | null;
  channex_property_id: string;
  channex_room_type_id: string | null;
  channex_rate_plan_id: string | null;
  sync_status: string;
  last_synced_at: string | null;
  room_number?: string;
  room_type?: string;
  property_name?: string;
  property_title?: string;
}

interface OutboxRow {
  id: number;
  property_id: number;
  room_id: number | null;
  kind: 'availability' | 'rates';
  date_from: string;
  date_to: string;
  status: 'pending' | 'sending' | 'done' | 'failed';
  attempts: number;
  task_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ChannexStatusData {
  config: {
    has_config_file: boolean;
    has_api_key: boolean;
    has_webhook_secret: boolean;
    environment: string;
  };
  mappings: ChannexMapping[];
  outbox: OutboxRow[];
  counts: {
    pending: number;
    sending: number;
    done: number;
    failed: number;
    total: number;
  };
}

interface ChannelManagerProps {
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

function computeFutureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export const ChannelManager: React.FC<ChannelManagerProps> = ({ onLogAudit }) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingContent, setSyncingContent] = useState(false);
  const [pushingAri, setPushingAri] = useState(false);
  const [drainingOutbox, setDrainingOutbox] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const [data, setData] = useState<ChannexStatusData | null>(null);

  // Date range for ARI push (Defaults to 500 days for Scenario 1 compliance)
  const [dateFrom, setDateFrom] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>(() => computeFutureDate(500));

  // Push results feedback
  const [lastPushResult, setLastPushResult] = useState<{
    dateFrom: string;
    dateTo: string;
    taskRows: Array<{ id: number; kind: string; status: string; task_id: string | null }>;
  } | null>(null);

  // Outbox filter and search
  const [statusFilter, setStatusFilterState] = useState<'all' | 'pending' | 'done' | 'failed'>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('artists_farm_channel_manager_filter');
      if (stored === 'all' || stored === 'pending' || stored === 'done' || stored === 'failed') return stored;
    }
    return 'all';
  });

  const setStatusFilter = (f: 'all' | 'pending' | 'done' | 'failed') => {
    setStatusFilterState(f);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('artists_farm_channel_manager_filter', f);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchStatus = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_channex_status`);
      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        setData(json.data);
      } else {
        showToast(t('channex_load_error', 'Failed to load Channel Manager status'), { type: 'error' });
      }
    } catch (err: any) {
      showToast(err.message || t('channex_load_error', 'Failed to load Channel Manager status'), { type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(t('copied_to_clipboard', 'Copied to clipboard!'), { type: 'success' });
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const handleSyncContent = async () => {
    const ok = await confirm({
      title: t('channex_sync_content_title', 'Sync Property Content & Structure'),
      message: t(
        'channex_sync_content_msg',
        'This will provision or update this property, room types, and rate plans on Channex and save the mapping IDs. Proceed?'
      ),
      confirmText: t('channex_sync_now', 'Sync with Channex'),
    });
    if (!ok) return;

    setSyncingContent(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_content_sync`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json && json.status === 'success') {
        showToast(t('channex_sync_success', 'Property structure synchronized with Channex successfully.'), { type: 'success' });
        onLogAudit?.('Synchronized property structure with Channex Channel Manager', { module: 'ChannelManager', status: 'SUCCESS' });
        fetchStatus();
      } else {
        showToast(json?.message || t('channex_sync_failed', 'Failed to synchronize with Channex'), { type: 'error' });
      }
    } catch (err: any) {
      showToast(err.message || t('channex_sync_failed', 'Failed to synchronize with Channex'), { type: 'error' });
    } finally {
      setSyncingContent(false);
    }
  };

  const handlePushAri = async () => {
    if (!dateFrom || !dateTo) {
      showToast(t('channex_dates_required', 'Please select both start and end dates'), { type: 'error' });
      return;
    }

    const d1 = new Date(dateFrom);
    const d2 = new Date(dateTo);
    const dayDiff = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));

    const ok = await confirm({
      title: t('channex_push_ari_title', 'Push Availability, Rates & Restrictions'),
      message: `Push ${dayDiff} days of compressed availability and rate rules from ${dateFrom} to ${dateTo} to every connected channel?\n\nAny date in this range with no explicit rate entered in Pricing & Rates will push at this property's default rate - if different pricing is already set directly on an OTA for those dates, this will overwrite it. Any date with no conflicting Ground Code booking will push as open, which will also reopen a date you've manually blocked directly on an OTA.\n\nOnly proceed if you're sure neither applies to this date range.`,
      confirmText: t('channex_push_now', 'Push to Channex'),
      variant: 'warning',
    });
    if (!ok) return;

    setPushingAri(true);
    setLastPushResult(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_push_ari`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const json = await res.json();

      if (json && json.status === 'success' && json.data) {
        showToast(t('channex_push_success', 'ARI batch compressed and pushed to Channex successfully!'), { type: 'success' });
        setLastPushResult({
          dateFrom: json.data.date_from,
          dateTo: json.data.date_to,
          taskRows: json.data.task_rows || [],
        });
        onLogAudit?.(`Pushed ARI to Channex for ${json.data.date_from} to ${json.data.date_to} (${dayDiff} days)`, {
          module: 'ChannelManager',
          status: 'SUCCESS',
        });
        fetchStatus();
      } else {
        showToast(json?.message || t('channex_push_failed', 'Failed to push ARI to Channex'), { type: 'error' });
      }
    } catch (err: any) {
      showToast(err.message || t('channex_push_failed', 'Failed to push ARI to Channex'), { type: 'error' });
    } finally {
      setPushingAri(false);
    }
  };

  const handleDrainOutbox = async () => {
    setDrainingOutbox(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_outbox_drain`, { method: 'POST' });
      const json = await res.json();
      if (json && json.status === 'success') {
        const count = json.data?.processed ?? 0;
        showToast(
          count > 0
            ? `Outbox drained: ${count} pending item(s) processed and sent to Channex.`
            : 'Outbox is up to date. No pending items were in the queue.',
          { type: 'success' }
        );
        fetchStatus();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to drain outbox', { type: 'error' });
    } finally {
      setDrainingOutbox(false);
    }
  };

  const handleRetryRow = async (id: number) => {
    setRetryingId(id);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_retry_outbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json && json.status === 'success') {
        showToast('Outbox item reset and retried successfully.', { type: 'success' });
        fetchStatus();
      } else {
        showToast('Failed to retry outbox item.', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to retry outbox item', { type: 'error' });
    } finally {
      setRetryingId(null);
    }
  };

  const filteredOutbox = useMemo(() => {
    if (!data?.outbox) return [];
    return data.outbox.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = String(row.id).includes(q);
        const matchKind = row.kind.toLowerCase().includes(q);
        const matchTaskId = (row.task_id || '').toLowerCase().includes(q);
        const matchDates = `${row.date_from} ${row.date_to}`.includes(q);
        const matchError = (row.last_error || '').toLowerCase().includes(q);
        return matchId || matchKind || matchTaskId || matchDates || matchError;
      }
      return true;
    });
  }, [data?.outbox, statusFilter, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin dark:text-blue-400" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('loading_channel_manager', 'Connecting to Channel Manager...')}
        </p>
      </div>
    );
  }

  const isConfigured = !!data?.config.has_api_key;
  const isMapped = (data?.mappings.length ?? 0) > 0;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title={t('channel_manager_heading', 'Channel Manager')}
        subtitle={t('channel_manager_subheading', 'Real-time Two-Way OTA Distribution & Live Inventory Synchronization (Channex)')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            className="h-10 text-xs font-medium"
          >
            <RefreshCw className={`w-4 h-4 me-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('refresh_label', 'Refresh')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDrainOutbox}
            disabled={drainingOutbox}
            className="h-10 text-xs font-medium"
          >
            <Zap className={`w-4 h-4 me-1.5 text-amber-500 ${drainingOutbox ? 'animate-spin' : ''}`} />
            {drainingOutbox ? t('draining_label', 'Draining...') : t('drain_outbox_button', 'Drain Outbox')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSyncContent}
            disabled={syncingContent || !isConfigured}
            className="h-10 text-xs font-medium"
          >
            {syncingContent ? (
              <Loader2 className="w-4 h-4 me-1.5 animate-spin" />
            ) : (
              <Building className="w-4 h-4 me-1.5" />
            )}
            {t('sync_content_button', 'Sync Property Structure')}
          </Button>
        </div>
      </PageHeader>

      {/* Connection & Configuration Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: API & Credentials */}
        <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('channex_credentials_title', 'API Connection')}
            </span>
            <Badge variant={isConfigured ? 'success' : 'danger'}>
              {isConfigured ? t('active_badge', 'CONNECTED') : t('missing_badge', 'NOT CONFIGURED')}
            </Badge>
          </div>
          <div className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Environment:</span>
              <span className="font-semibold uppercase text-gray-900 dark:text-white">
                {data?.config.environment || 'staging'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">API Key:</span>
              <span className={data?.config.has_api_key ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-500 font-medium'}>
                {data?.config.has_api_key ? 'Configured' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Webhook Secret:</span>
              <span className={data?.config.has_webhook_secret ? 'text-green-600 dark:text-green-400 font-medium' : 'text-amber-500 font-medium'}>
                {data?.config.has_webhook_secret ? 'Secured' : 'Optional'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Mapped Property & Rooms */}
        <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('channex_mappings_title', 'Inventory Mappings')}
            </span>
            <Badge variant={isMapped ? 'success' : 'warning'}>
              {isMapped ? `${data?.mappings.length} Unit(s) Mapped` : 'Unmapped'}
            </Badge>
          </div>
          <div className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Channex Property ID:</span>
              <span className="font-mono text-2xs text-gray-900 dark:text-white truncate max-w-[140px]" title={data?.mappings[0]?.channex_property_id || 'None'}>
                {data?.mappings[0]?.channex_property_id || 'Not Mapped'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Sync Status:</span>
              <span className="font-semibold capitalize text-gray-900 dark:text-white">
                {data?.mappings[0]?.sync_status || 'Pending Sync'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Last Synced:</span>
              <span className="text-gray-600 dark:text-gray-400">
                {data?.mappings[0]?.last_synced_at ? formatDateTimeDDMMYYYY(data.mappings[0].last_synced_at) : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Outbox Queue Health */}
        <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('channex_queue_title', 'Outbox Queue')}
            </span>
            <Badge variant={data?.counts.failed ? 'danger' : data?.counts.pending ? 'warning' : 'success'}>
              {data?.counts.failed ? `${data.counts.failed} Failed` : data?.counts.pending ? `${data.counts.pending} Pending` : 'Healthy'}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800">
              <div className="text-base font-bold text-green-700 dark:text-green-300">{data?.counts.done ?? 0}</div>
              <div className="text-2xs font-medium text-green-600 dark:text-green-400 uppercase">Done</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
              <div className="text-base font-bold text-amber-700 dark:text-amber-300">{data?.counts.pending ?? 0}</div>
              <div className="text-2xs font-medium text-amber-600 dark:text-amber-400 uppercase">Pending</div>
            </div>
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
              <div className="text-base font-bold text-red-700 dark:text-red-300">{data?.counts.failed ?? 0}</div>
              <div className="text-2xs font-medium text-red-600 dark:text-red-400 uppercase">Failed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Unmapped Property Alert Banner */}
      {!isMapped && isConfigured && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Property not yet registered on Channex
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Click "Sync Property Structure" to provision this property, room types, and rate plans on Channex automatically.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSyncContent}
            disabled={syncingContent}
            className="shrink-0 h-9 text-xs"
          >
            {syncingContent ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : <Building className="w-4 h-4 me-1" />}
            Sync Content Now
          </Button>
        </div>
      )}

      {/* Scenario 1: Bulk ARI Push Control Card */}
      <div className="p-5 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              {t('push_ari_heading', 'Push Availability & Rates (ARI)')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Certification Scenario 1: Compresses 500 days of availability, tariffs, and restrictions into exactly 2 Channex API calls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDateFrom(new Date().toISOString().split('T')[0]);
                setDateTo(computeFutureDate(500));
              }}
              className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-medium hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            >
              500 Days (Scenario 1)
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFrom(new Date().toISOString().split('T')[0]);
                setDateTo(computeFutureDate(90));
              }}
              className="text-xs px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              90 Days
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <DateRangePicker
              checkinDate={dateFrom}
              checkoutDate={dateTo}
              onCheckinChange={setDateFrom}
              onCheckoutChange={setDateTo}
              fromLabel={t('date_from_label', 'Start Date')}
              toLabel={t('date_to_label', 'End Date')}
              disablePastDates
            />
          </div>
          <div>
            <Button
              variant="primary"
              size="md"
              onClick={handlePushAri}
              disabled={pushingAri || !isConfigured}
              className="w-full h-10 text-xs font-semibold"
            >
              {pushingAri ? (
                <>
                  <Loader2 className="w-4 h-4 me-1.5 animate-spin" />
                  Compressing & Pushing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 me-1.5" />
                  Push to Channex
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Returned Task IDs Banner */}
        {lastPushResult && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2 text-xs">
            <div className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              ARI pushed for {formatDateDDMMYYYY(lastPushResult.dateFrom)} to {formatDateDDMMYYYY(lastPushResult.dateTo)} (2 Channex Calls Generated):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {lastPushResult.taskRows.map((tr) => (
                <div
                  key={tr.id}
                  className="flex items-center justify-between p-2 rounded bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900"
                >
                  <span className="font-medium capitalize text-gray-700 dark:text-gray-300">
                    {tr.kind} Task:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-2xs text-gray-900 dark:text-white">
                      {tr.task_id || 'Processing...'}
                    </span>
                    {tr.task_id && (
                      <button
                        type="button"
                        onClick={() => handleCopy(tr.task_id!, `task_${tr.id}`)}
                        className="p-1 hover:text-blue-600 dark:hover:text-blue-400 text-gray-400"
                        title="Copy Task ID"
                      >
                        {copiedKey === `task_${tr.id}` ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mapped Rooms & Rate Plans Table */}
      {isMapped && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="p-4 sm:px-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Mapped Room Types & Rate Plans
            </h3>
            <span className="text-xs text-gray-500">{data?.mappings.length} active mapping(s)</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left text-gray-600 dark:text-gray-300">
              <thead className="text-2xs uppercase bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Local Room</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Channex Property UUID</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Channex Room Type UUID</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Channex Rate Plan UUID</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
                {data?.mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {m.property_title || m.property_name
                        ? `${m.property_title || m.property_name} (Unit/Property)`
                        : m.room_number
                        ? `Room ${m.room_number} (${m.room_type || 'Standard'})`
                        : 'Property Wide / Villa Unit'}
                    </td>
                    <td className="px-4 py-3 font-mono text-2xs whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>{m.channex_property_id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(m.channex_property_id, `prop_${m.id}`)}
                          className="hover:text-blue-600 text-gray-400"
                        >
                          {copiedKey === `prop_${m.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-2xs whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>{m.channex_room_type_id || 'N/A'}</span>
                        {m.channex_room_type_id && (
                          <button
                            type="button"
                            onClick={() => handleCopy(m.channex_room_type_id!, `rt_${m.id}`)}
                            className="hover:text-blue-600 text-gray-400"
                          >
                            {copiedKey === `rt_${m.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-2xs whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>{m.channex_rate_plan_id || 'N/A'}</span>
                        {m.channex_rate_plan_id && (
                          <button
                            type="button"
                            onClick={() => handleCopy(m.channex_rate_plan_id!, `rp_${m.id}`)}
                            className="hover:text-blue-600 text-gray-400"
                          >
                            {copiedKey === `rp_${m.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={m.sync_status === 'active' ? 'success' : 'warning'}>
                        {m.sync_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Outbox Activity & Sync Logs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden space-y-0">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Sync Activity & Outbox Queue
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
              {filteredOutbox.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ID, dates, task ID..."
                className="w-full h-10 ps-9 pe-3 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-700 h-10 items-center">
              {(['all', 'pending', 'done', 'failed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${
                    statusFilter === st
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left text-gray-600 dark:text-gray-300">
            <thead className="text-2xs uppercase bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 font-semibold whitespace-nowrap min-w-[70px]">ID</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap min-w-[110px]">Payload Kind</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap min-w-[180px]">Date Range</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap min-w-[110px]">Status</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap min-w-[280px]">Channex Task ID</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap min-w-[140px]">Created</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap min-w-[90px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
              {filteredOutbox.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No sync activity matches the selected filter.
                  </td>
                </tr>
              ) : (
                filteredOutbox.map((row) => {
                  const isDone = row.status === 'done';
                  const isFailed = row.status === 'failed';
                  const isSending = row.status === 'sending';

                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                        #{row.id}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-bold uppercase ${
                            row.kind === 'availability'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          }`}
                        >
                          {row.kind}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900 dark:text-white font-medium">
                        {formatDateDDMMYYYY(row.date_from)} → {formatDateDDMMYYYY(row.date_to)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge
                          variant={isDone ? 'success' : isFailed ? 'danger' : isSending ? 'info' : 'warning'}
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.task_id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-2xs text-gray-900 dark:text-white">
                              {row.task_id}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(row.task_id!, `row_task_${row.id}`)}
                              className="p-1 hover:text-blue-600 dark:hover:text-blue-400 text-gray-400"
                              title="Copy Task ID"
                            >
                              {copiedKey === `row_task_${row.id}` ? (
                                <Check className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : isFailed ? (
                          <span className="text-red-600 dark:text-red-400 text-2xs font-normal truncate max-w-[260px] inline-block" title={row.last_error || ''}>
                            {row.last_error || 'Error during send'}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-2xs italic">Queued for next drain</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-2xs text-gray-500">
                        {formatDateTimeDDMMYYYY(row.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {isFailed && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRetryRow(row.id)}
                            disabled={retryingId === row.id}
                            className="h-7 px-2 text-2xs"
                          >
                            {retryingId === row.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Retry'
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
          {filteredOutbox.map((row) => (
            <div key={row.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-gray-900 dark:text-white">#{row.id}</span>
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 capitalize">
                    {row.kind}
                  </span>
                </div>
                <Badge variant={row.status === 'done' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'}>
                  {row.status}
                </Badge>
              </div>
              <div className="text-xs text-gray-700 dark:text-gray-300">
                Range: <span className="font-semibold">{formatDateDDMMYYYY(row.date_from)} → {formatDateDDMMYYYY(row.date_to)}</span>
              </div>
              {row.task_id && (
                <div className="flex items-center justify-between text-2xs font-mono bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                  <span className="truncate max-w-[240px]">{row.task_id}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(row.task_id!, `mob_${row.id}`)}
                    className="p-1 text-gray-400 hover:text-blue-600"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {row.status === 'failed' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRetryRow(row.id)}
                  disabled={retryingId === row.id}
                  className="w-full h-8 text-xs mt-1"
                >
                  Retry Push
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
