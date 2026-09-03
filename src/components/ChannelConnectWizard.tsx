import React, { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'flowbite-react';
import {
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, X, AlertCircle, AlertTriangle,
  Plug, ExternalLink, ShieldCheck, RefreshCw, ChevronDown,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
import { ToggleSwitch } from './ToggleSwitch';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';
import type { ChannexChannelConnection, ChannexLocalRoom } from './ChannelConnectionsPage';

interface AdapterField {
  position?: number;
  type: 'string' | 'password' | 'hidden' | 'boolean' | 'select' | string;
  title: string;
  default?: any;
  options?: string[];
}

interface AdapterDescriptor {
  code: string;
  title: string;
  kind: string; // 'meta' | 'ota'
  is_airbnb_oauth?: boolean;
  params: Record<string, AdapterField>;
  mapping_is_not_required?: boolean;
  payload?: {
    client_id?: string;
    redirect_uri?: string;
    scope?: string;
  };
}

interface ChannelConnectWizardProps {
  isOpen: boolean;
  propertyId: number;
  resumeChannelCode?: string | null;
  existingConnections: ChannexChannelConnection[];
  localRooms: ChannexLocalRoom[];
  onClose: () => void;
  onConnected: (channelCode: string) => void;
}

type Step = 1 | 2 | 3 | 4;

// Prerequisite copy hand-authored per channel
const CHANNEL_PREREQUISITES: Record<string, { title: string; steps: string[] }> = {
  BookingCom: {
    title: 'Before you connect Booking.com',
    steps: [
      'Log in to your property admin at account.booking.com',
      "Copy your property's Hotel ID (shown at the top of the navigation) - you'll need it below",
      'Go to Account → Connectivity Provider',
      'Search for "Channex" (type the complete word) and select it',
      'Check the box to agree to the terms, then click "Yes, I accept" to accept the XML Service Agreement',
    ],
  },
};

const AirbnbSwitchSoftwareGuide: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-3.5 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl space-y-2.5 text-left transition-all">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between text-amber-900 dark:text-amber-200 font-bold text-xs cursor-pointer gap-2"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Switching software / &quot;You may only authorise one app&quot;?</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2.5 pt-1 text-2xs text-slate-700 dark:text-slate-300 border-t border-amber-200/80 dark:border-amber-800/60">
          <p className="text-amber-900 dark:text-amber-200 font-medium">
            Airbnb allows only <strong>1 Property Management App</strong> at a time. If your Airbnb account was previously connected to another software provider, follow these 3 quick steps in your browser:
          </p>
          <ol className="list-decimal pl-4 space-y-2">
            <li>
              <strong className="text-slate-900 dark:text-white">Disconnect your listings:</strong>
              <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                Go to{' '}
                <a
                  href="https://www.airbnb.com/hosting/listings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 font-semibold underline inline-flex items-center gap-0.5"
                >
                  Airbnb Listings <ExternalLink className="w-3 h-3 inline" />
                </a>{' '}
                (on desktop/mobile web browser). Check the box next to your listings ➔ click <strong>Edit selected</strong> ➔ under <strong>Listing details</strong>, choose <strong>Sync settings</strong> ➔ select <strong>Disconnect</strong> and click <strong>Save</strong>.
              </div>
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">Remove access for your former software:</strong>
              <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                Go to{' '}
                <a
                  href="https://www.airbnb.com/account-settings/privacy-and-sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 font-semibold underline inline-flex items-center gap-0.5"
                >
                  Account Settings → Privacy &amp; Sharing <ExternalLink className="w-3 h-3 inline" />
                </a>
                . Under <strong>Connected Apps</strong>, click <strong>Remove Access</strong> for your former software provider.
              </div>
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">Connect Ground Code:</strong>
              <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                Return here and click <strong>Authorize with Airbnb</strong>. Airbnb will now display the permission screen to connect Ground Code!
              </div>
            </li>
          </ol>
          <div className="pt-1 text-3xs text-slate-500 dark:text-slate-400">
            Official Guide:{' '}
            <a
              href="https://www.airbnb.co.in/help/article/2683"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              How to switch software providers on Airbnb
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export const ChannelConnectWizard: React.FC<ChannelConnectWizardProps> = ({
  isOpen, propertyId, resumeChannelCode, existingConnections, localRooms, onClose, onConnected,
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>(1);

  const [adapters, setAdapters] = useState<AdapterDescriptor[]>([]);
  const [loadingAdapters, setLoadingAdapters] = useState(false);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterDescriptor | null>(null);
  const [loadingAdapterDetail, setLoadingAdapterDetail] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [prereqConfirmed, setPrereqConfirmed] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; errors: any } | null>(null);

  const [mappingDetails, setMappingDetails] = useState<{ rooms: any[] } | null>(null);
  const [loadingMapping, setLoadingMapping] = useState(false);
  const [mappingError, setMappingError] = useState(false);
  const [roomMapping, setRoomMapping] = useState<Record<string, { external_room_code: string; external_rate_code: string }>>({});
  const [savingMapping, setSavingMapping] = useState(false);

  const [readinessProblems, setReadinessProblems] = useState<any[] | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [confirmedExistingBookings, setConfirmedExistingBookings] = useState(false);
  const [activating, setActivating] = useState(false);

  const [airbnbAuthOpened, setAirbnbAuthOpened] = useState(false);
  const [airbnbNote, setAirbnbNote] = useState('');
  const [startingAirbnb, setStartingAirbnb] = useState(false);
  const [airbnbSubmitted, setAirbnbSubmitted] = useState(false);

  const resetState = () => {
    setStep(1);
    setSelectedCode(null);
    setSelectedAdapter(null);
    setFormValues({});
    setPrereqConfirmed(false);
    setTestResult(null);
    setMappingDetails(null);
    setMappingError(false);
    setRoomMapping({});
    setReadinessProblems(null);
    setConfirmedExistingBookings(false);
    setAirbnbAuthOpened(false);
    setAirbnbNote('');
    setAirbnbSubmitted(false);
  };

  // Load the adapter list once per open, and resume an in-progress connection
  useEffect(() => {
    if (!isOpen) return;
    resetState();
    setLoadingAdapters(true);
    apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channels_available`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.status === 'success') setAdapters(json.data || []);
      })
      .catch(() => showToast('Failed to load available channels', { type: 'error' }))
      .finally(() => setLoadingAdapters(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !resumeChannelCode || adapters.length === 0) return;
    const existing = existingConnections.find((c) => c.channel_code === resumeChannelCode);
    handleSelectChannel(resumeChannelCode, existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, resumeChannelCode, adapters]);

  const handleSelectChannel = async (code: string, existing?: ChannexChannelConnection) => {
    setSelectedCode(code);
    setLoadingAdapterDetail(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_adapter&code=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast('Failed to load this channel’s connection details', { type: 'error' });
        setLoadingAdapterDetail(false);
        return;
      }
      const adapter: AdapterDescriptor = json.data;
      setSelectedAdapter(adapter);
      if (existing?.settings) setFormValues(existing.settings);

      // Only skip to Step 3 if a real connection exists
      const isAirbnb = adapter.is_airbnb_oauth || code.toLowerCase().includes('airbnb');
      const reallyConnected = Boolean(existing?.channex_channel_id)
        && !!existing
        && existing.status !== 'draft'
        && existing.status !== 'pending_test'
        && existing.status !== 'error'
        && (!isAirbnb || existing.status === 'mapping' || existing.status === 'ready_to_activate' || existing.status === 'active');

      if (reallyConnected) {
        setPrereqConfirmed(true);
        setTestResult({ success: true, errors: null });
        setStep(3);
      } else {
        setStep(2);
      }
    } finally {
      setLoadingAdapterDetail(false);
    }
  };

  // Get a REAL Airbnb authorization link from Channex and open it.
  // A hand-built airbnb.com/oauth2/auth URL (the previous approach) has no
  // state Channex recognizes - Channex's own auth_redirect handler rejects
  // it with "invalid_state" regardless of the client_id/redirect_uri used,
  // because that link was never registered with Channex in the first place.
  // The real flow (confirmed against Channex's own docs 3 Sep 2026,
  // https://docs.channex.io/channel-api-examples/airbnb.md) is
  // POST /meta/airbnb/connection_link - Channex generates and tracks a
  // real, 2-hour-valid link server-side, then creates the channel
  // connection itself once the owner authorizes. Called fresh on every
  // click (including "Re-open"/"Retry") rather than caching one URL, since
  // each call gets its own valid link - reusing a stale one is exactly what
  // produced "invalid_state" before.
  const [airbnbLinkLoading, setAirbnbLinkLoading] = useState(false);
  const fetchAndOpenAirbnbLink = async () => {
    setAirbnbLinkLoading(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_airbnb_connection_link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      const json = await res.json();
      if (json?.status !== 'success' || !json.data?.url) {
        showToast(json?.message || 'Failed to generate the Airbnb authorization link', { type: 'error' });
        return;
      }
      window.open(json.data.url, '_blank', 'width=800,height=700');
      setAirbnbAuthOpened(true);
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate the Airbnb authorization link', { type: 'error' });
    } finally {
      setAirbnbLinkLoading(false);
    }
  };

  // After the owner finishes on Airbnb, Channex creates the channel
  // connection itself (see fetchAndOpenAirbnbLink's comment) and our own
  // channex_airbnb_oauth_landing redirect target records it. Re-check that
  // before jumping to room mapping, rather than trusting the click alone -
  // the owner may have closed the tab early, been declined, or not
  // finished yet.
  const [verifyingAirbnb, setVerifyingAirbnb] = useState(false);
  const continueAfterAirbnbAuth = async () => {
    setVerifyingAirbnb(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_connection_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      const json = await res.json();
      const conn = (json?.data?.connections || []).find((c: any) => c.channel_code === selectedCode);
      if (conn?.channex_channel_id && ['mapping', 'ready_to_activate', 'active'].includes(conn.status)) {
        setStep(3);
        fetchMappingDetails();
      } else {
        showToast("Airbnb authorization isn't complete yet - finish signing in and clicking Allow on the Airbnb tab, then try Continue again.", { type: 'warning' });
      }
    } catch {
      showToast('Could not verify the connection - try again.', { type: 'error' });
    } finally {
      setVerifyingAirbnb(false);
    }
  };

  const visibleFields = useMemo(() => {
    if (!selectedAdapter) return [];
    return Object.entries(selectedAdapter.params || {})
      .filter(([, field]) => field.type !== 'hidden')
      .sort((a, b) => (a[1].position ?? 0) - (b[1].position ?? 0));
  }, [selectedAdapter]);

  const isFormValid = useMemo(() => {
    return visibleFields.every(([key, field]) => {
      if (field.type === 'boolean' || field.type === 'select') return true;
      return !!(formValues[key] ?? '').toString().trim();
    });
  }, [visibleFields, formValues]);

  const handleTestConnection = async () => {
    if (!selectedCode || !isFormValid) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_test_connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode, settings: formValues }),
      });
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast(json?.message || 'Connection test failed', { type: 'error' });
        setTesting(false);
        return;
      }
      setTestResult({ success: !!json.data.test_success, errors: json.data.errors });
      if (json.data.test_success) {
        showToast('Connection verified. Continue to room mapping.', { type: 'success' });
        setStep(3);
      } else {
        showToast('Channex could not verify this connection yet - see details below', { type: 'warning' });
      }
    } catch (err: any) {
      showToast(err.message || 'Connection test failed', { type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const handleStartAirbnb = async () => {
    setStartingAirbnb(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_start_airbnb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, listing_note: airbnbNote }),
      });
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast(json?.message || 'Failed to submit your Airbnb connection request', { type: 'error' });
        return;
      }
      setAirbnbSubmitted(true);
      onConnected('AirBNB');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit your Airbnb connection request', { type: 'error' });
    } finally {
      setStartingAirbnb(false);
    }
  };

  const fetchMappingDetails = () => {
    if (!selectedCode) return;
    setLoadingMapping(true);
    setMappingError(false);
    apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_mapping_details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.status === 'success' && json.data?.rooms && json.data.rooms.length > 0) {
          setMappingDetails(json.data);
          setMappingError(false);
        } else {
          setMappingDetails(null);
          setMappingError(true);
        }
      })
      .catch(() => {
        setMappingDetails(null);
        setMappingError(true);
      })
      .finally(() => setLoadingMapping(false));
  };

  // Step 3 entry: fetch rooms/rates
  useEffect(() => {
    if (step !== 3 || !selectedCode || mappingDetails) return;
    fetchMappingDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedCode]);

  const isMappingComplete = useMemo(() => {
    if (localRooms.length === 0 || !mappingDetails?.rooms || mappingDetails.rooms.length === 0) return false;
    return localRooms.every((r) => {
      const key = String(r.local_room_id ?? 'null');
      const m = roomMapping[key];
      return m && m.external_room_code && m.external_rate_code;
    });
  }, [localRooms, roomMapping, mappingDetails]);

  const handleSaveMapping = async () => {
    if (!selectedCode || !isMappingComplete) return;
    setSavingMapping(true);
    try {
      const rooms = localRooms.map((r) => {
        const key = String(r.local_room_id ?? 'null');
        const m = roomMapping[key];
        return { local_room_id: r.local_room_id, external_room_code: m.external_room_code, external_rate_code: m.external_rate_code };
      });
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_save_mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode, rooms }),
      });
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast(json?.message || 'Failed to save room mapping', { type: 'error' });
        return;
      }
      showToast('Room mapping saved. Ready for final activation.', { type: 'success' });
      setStep(4);
    } catch (err: any) {
      showToast(err.message || 'Failed to save room mapping', { type: 'error' });
    } finally {
      setSavingMapping(false);
    }
  };

  // Step 4 entry: run readiness check
  useEffect(() => {
    if (step !== 4 || !selectedCode) return;
    setCheckingReadiness(true);
    apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_check_readiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.status === 'success') {
          setReadinessProblems(json.data?.problems || []);
        } else {
          showToast(json?.message || 'Failed to check channel readiness', { type: 'error' });
        }
      })
      .catch(() => showToast('Failed to check channel readiness', { type: 'error' }))
      .finally(() => setCheckingReadiness(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedCode]);

  const canActivate = readinessProblems !== null && readinessProblems.length === 0 && confirmedExistingBookings;

  const handleActivate = async () => {
    if (!selectedCode || !canActivate) return;
    setActivating(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode }),
      });
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast(json?.message || 'Failed to activate channel', { type: 'error' });
        return;
      }
      showToast(`${selectedAdapter?.title || selectedCode} is now live and syncing bookings!`, { type: 'success' });
      onConnected(selectedCode);
    } catch (err: any) {
      showToast(err.message || 'Failed to activate channel', { type: 'error' });
    } finally {
      setActivating(false);
    }
  };

  const prereq = selectedCode ? CHANNEL_PREREQUISITES[selectedCode] : null;
  const prereqSatisfied = !prereq || prereqConfirmed;

  const isAirbnb = selectedAdapter?.is_airbnb_oauth || (selectedCode || '').toLowerCase().includes('airbnb');

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      position="right"
      className="w-full sm:w-[540px] p-0 flex flex-col justify-between bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Connect a Channel</h2>
            <div className="text-2xs text-slate-500 dark:text-slate-400">
              Step {step} of 4{selectedAdapter ? ` · ${selectedAdapter.title}` : ''}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        {/* STEP 1: Select Channel */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose the booking channel you want to connect to this property.</p>
            {loadingAdapters ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
            ) : (
              <div className="space-y-2">
                {adapters
                  .filter((a) => !existingConnections.some((c) => c.channel_code === a.code && c.status === 'active'))
                  .map((a) => (
                    <button
                      key={a.code}
                      onClick={() => handleSelectChannel(a.code)}
                      className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-left transition-all cursor-pointer"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</div>
                        {a.is_airbnb_oauth && (
                          <div className="text-2xs text-emerald-600 dark:text-emerald-400 mt-0.5">1-Click Direct OAuth Authorization</div>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Connect / Authorize */}
        {step === 2 && loadingAdapterDetail && (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
        )}

        {/* Airbnb Direct OAuth Flow */}
        {step === 2 && !loadingAdapterDetail && isAirbnb && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('airbnb_oauth_title', 'Connect Airbnb Account')}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {t('airbnb_oauth_desc', 'Authorize Ground Code to access your Airbnb listings, sync availability & rates, and automatically import reservations.')}
              </p>
            </div>

            {airbnbAuthOpened ? (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3 text-center">
                <CheckCircle2 className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto" />
                <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
                  {t('airbnb_auth_window_opened', "Sign in to your Airbnb host account in the new tab and click 'Allow'. Once authorized, click Continue below.")}
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={fetchAndOpenAirbnbLink}
                    disabled={airbnbLinkLoading}
                    leftIcon={airbnbLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  >
                    <span>Re-open Airbnb Login</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={continueAfterAirbnbAuth}
                    disabled={verifyingAirbnb}
                    leftIcon={verifyingAirbnb ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  >
                    <span>{t('continue_to_mapping_button', "Continue to Room Mapping")}</span>
                  </Button>
                </div>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setAirbnbAuthOpened(false)}
                    className="text-2xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    Restart Airbnb Authorization
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-4 text-center">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Click the button below to sign in to your Airbnb host account on Airbnb's secure login portal:
                </p>
                <Button
                  variant="primary"
                  size="md"
                  onClick={fetchAndOpenAirbnbLink}
                  disabled={airbnbLinkLoading}
                  leftIcon={airbnbLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  className="w-full justify-center bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5"
                >
                  <span>{t('authorize_with_airbnb_button', 'Authorize with Airbnb')}</span>
                </Button>
              </div>
            )}

            {/* Switching Software & Troubleshooting Callout */}
            <AirbnbSwitchSoftwareGuide />

            {/* Optional note or assistance toggle */}
            <div className="pt-2">
              <details className="text-2xs text-slate-500 dark:text-slate-400 cursor-pointer">
                <summary className="hover:text-slate-700 dark:hover:text-slate-200">Need staff assistance with your Airbnb listing?</summary>
                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
                  <Input
                    label="Listing URL or notes for staff (optional)"
                    value={airbnbNote}
                    onChange={(e) => setAirbnbNote(e.target.value)}
                    helperText="If you prefer our team to complete the setup, leave a note and submit."
                  />
                  {!airbnbSubmitted && (
                    <Button variant="secondary" size="xs" onClick={handleStartAirbnb} disabled={startingAirbnb}>
                      {startingAirbnb ? 'Submitting...' : 'Submit Request to Staff'}
                    </Button>
                  )}
                </div>
              </details>
            </div>
          </div>
        )}

        {/* Credentials-Based OTA Flow (Booking.com / Expedia) */}
        {step === 2 && !loadingAdapterDetail && selectedAdapter && !isAirbnb && (
          <div className="space-y-4">
            {prereq && !prereqConfirmed && (
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2.5">
                <p className="text-xs font-bold text-blue-900 dark:text-blue-200">{prereq.title}</p>
                <ol className="list-decimal pl-4 space-y-1 text-2xs text-blue-800 dark:text-blue-300">
                  {prereq.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input type="checkbox" checked={prereqConfirmed} onChange={(e) => setPrereqConfirmed(e.target.checked)} className="mt-0.5" />
                  <span className="text-2xs font-semibold text-blue-900 dark:text-blue-200">I've completed these steps on {selectedAdapter.title}</span>
                </label>
              </div>
            )}

            {(!prereq || prereqConfirmed) && (
              <>
                {visibleFields.map(([key, field]) => {
                  if (field.type === 'boolean') {
                    return (
                      <div key={key} className="flex items-center justify-between py-1">
                        <span className="text-sm text-slate-700 dark:text-slate-200">{field.title}</span>
                        <ToggleSwitch
                          enabled={!!formValues[key]}
                          onChange={(v) => setFormValues((prev) => ({ ...prev, [key]: v }))}
                        />
                      </div>
                    );
                  }
                  if (field.type === 'select' && field.options) {
                    return (
                      <div key={key}>
                        <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{field.title}</label>
                        <select
                          value={formValues[key] ?? field.default ?? ''}
                          onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    );
                  }
                  return (
                    <Input
                      key={key}
                      type={field.type === 'password' ? 'password' : 'text'}
                      label={field.title}
                      value={formValues[key] ?? ''}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  );
                })}

                {testResult && !testResult.success && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Channex couldn't verify this connection yet{typeof testResult.errors === 'string' ? `: ${testResult.errors}` : ''}. If you just completed the steps above, this can take a few minutes on {selectedAdapter.title}'s side - try again shortly.</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 3: Room / rate mapping */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Match each of your rooms to the matching listing on {selectedAdapter?.title}. Every room must be mapped before this channel can go live.</p>
            {loadingMapping ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <p className="text-xs text-slate-500">Fetching listings from {selectedAdapter?.title}...</p>
              </div>
            ) : mappingError || !mappingDetails?.rooms || mappingDetails.rooms.length === 0 ? (
              <div className="p-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
                <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {t('no_airbnb_listings_detected', 'No Airbnb listings detected yet')}
                </h4>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90 max-w-sm mx-auto">
                  {t('no_airbnb_listings_desc', 'Make sure your Airbnb host account is authorized and has active published listings.')}
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Button variant="secondary" size="sm" onClick={() => setStep(2)}>
                    <span>{t('back_to_auth_button', 'Back to Authorization')}</span>
                  </Button>
                  {isAirbnb && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={fetchAndOpenAirbnbLink}
                      disabled={airbnbLinkLoading}
                      leftIcon={airbnbLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      <span>{t('open_airbnb_portal_button', 'Open Airbnb Login')}</span>
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={fetchMappingDetails} leftIcon={<RefreshCw className="w-4 h-4" />}>
                    <span>Retry</span>
                  </Button>
                </div>

                {isAirbnb && (
                  <div className="pt-2">
                    <AirbnbSwitchSoftwareGuide />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {localRooms.map((room) => {
                  const key = String(room.local_room_id ?? 'null');
                  const current = roomMapping[key] || { external_room_code: '', external_rate_code: '' };
                  const selectedOtaRoom = (mappingDetails?.rooms || []).find((r: any) => String(r.id) === current.external_room_code);
                  return (
                    <div key={key} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{room.name}</div>
                      {!room.channex_rate_plan_id && (
                        <div className="text-2xs text-red-600 dark:text-red-400">Not yet synced to Channex - sync property content first.</div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={current.external_room_code}
                          onChange={(e) => setRoomMapping((prev) => ({ ...prev, [key]: { external_room_code: e.target.value, external_rate_code: '' } }))}
                          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white px-2.5 py-2"
                        >
                          <option value="">Select {selectedAdapter?.title} room...</option>
                          {(mappingDetails?.rooms || []).map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
                        </select>
                        <select
                          value={current.external_rate_code}
                          onChange={(e) => setRoomMapping((prev) => ({ ...prev, [key]: { ...current, external_rate_code: e.target.value } }))}
                          disabled={!selectedOtaRoom}
                          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white px-2.5 py-2 disabled:opacity-50"
                        >
                          <option value="">Select rate...</option>
                          {(selectedOtaRoom?.rates || []).map((rate: any) => <option key={rate.id} value={rate.id}>{rate.title}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Review & Activate */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Ready to go live</div>
              <p className="text-2xs text-slate-600 dark:text-slate-300">
                Ground Code will immediately push live availability and rates for every mapped room to {selectedAdapter?.title}, and will automatically import incoming reservations into your Bookings list.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Readiness Check</div>
              {checkingReadiness ? (
                <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Verifying channel configuration on Channex...</div>
              ) : readinessProblems && readinessProblems.length > 0 ? (
                <ul className="space-y-1 text-2xs text-red-600 dark:text-red-400">
                  {readinessProblems.map((p: any, i: number) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{p.message || JSON.stringify(p)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> Ready to go live.
                </div>
              )}
            </div>

            <label className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedExistingBookings}
                onChange={(e) => setConfirmedExistingBookings(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-2xs font-semibold text-amber-900 dark:text-amber-300">
                I confirm any bookings that already exist on {selectedAdapter?.title} for this listing are already entered in Ground Code. Activating without this can double-book a room.
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
        {step > 1 && step < 4 ? (
          <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        ) : <div />}

        {step === 2 && isAirbnb && !airbnbAuthOpened && (
          <Button
            variant="primary"
            onClick={fetchAndOpenAirbnbLink}
            disabled={airbnbLinkLoading}
            className="w-full justify-center sm:w-auto bg-rose-600 hover:bg-rose-700 text-white"
          >
            {airbnbLinkLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-1" />}
            {t('authorize_with_airbnb_button', 'Authorize with Airbnb')}
          </Button>
        )}
        {step === 2 && isAirbnb && airbnbAuthOpened && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchAndOpenAirbnbLink}
              disabled={airbnbLinkLoading}
              className="text-xs"
            >
              {airbnbLinkLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
              Re-open Login
            </Button>
            <Button
              variant="primary"
              onClick={continueAfterAirbnbAuth}
              disabled={verifyingAirbnb}
              className="w-full justify-center sm:w-auto text-xs"
            >
              {t('continue_to_mapping_button', "Continue")}
              {verifyingAirbnb ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <ArrowRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        )}
        {step === 2 && !isAirbnb && selectedAdapter && (
          <Button
            variant="primary"
            onClick={handleTestConnection}
            disabled={testing || !prereqSatisfied || !isFormValid}
            className={(!prereqSatisfied || !isFormValid) ? 'opacity-50' : ''}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {testing ? 'Testing Connection...' : 'Test Connection'}
          </Button>
        )}
        {step === 3 && (
          <Button
            variant="primary"
            onClick={handleSaveMapping}
            disabled={savingMapping || !isMappingComplete}
            className={!isMappingComplete ? 'opacity-50' : ''}
          >
            {savingMapping ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {savingMapping ? 'Saving...' : 'Save Mapping'}
          </Button>
        )}
        {step === 4 && (
          <Button variant="primary" onClick={handleActivate} disabled={activating || !canActivate} className={!canActivate ? 'opacity-50' : ''}>
            {activating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            {activating ? 'Activating...' : 'Go Live'}
          </Button>
        )}
      </div>
    </Drawer>
  );
};
