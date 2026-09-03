import React, { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'flowbite-react';
import {
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, X, AlertCircle, AlertTriangle,
  Plug, ExternalLink, ShieldCheck,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
import { ToggleSwitch } from './ToggleSwitch';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { useToast } from './ToastContext';
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

// Prerequisite copy hand-authored per channel (the dynamic adapter schema has no
// concept of an EXTERNAL step the client must complete on the OTA's own site -
// see _the plan_/CLAUDE.md's Channex section). Booking.com's exact sequence
// confirmed live against docs.channex.io 3 Sep 2026.
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
  const [roomMapping, setRoomMapping] = useState<Record<string, { external_room_code: string; external_rate_code: string }>>({});
  const [savingMapping, setSavingMapping] = useState(false);

  const [readinessProblems, setReadinessProblems] = useState<any[] | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [confirmedExistingBookings, setConfirmedExistingBookings] = useState(false);
  const [activating, setActivating] = useState(false);

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
    setRoomMapping({});
    setReadinessProblems(null);
    setConfirmedExistingBookings(false);
    setAirbnbNote('');
    setAirbnbSubmitted(false);
  };

  // Load the adapter list once per open, and resume an in-progress connection
  // if one was passed in (Continue Setup from the connections list) rather
  // than starting over from Step 1.
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
      // A status of 'mapping'/'ready_to_activate'/'active' only means something
      // real exists on Channex's side if channex_channel_id was actually set -
      // that field is written exactly once, by a successful
      // channex_channel_start_airbnb (or equivalent) call. Trusting status
      // alone let a connection whose staff-handoff status got advanced without
      // the real Channex channel ever being created (confirmed live 3 Sep
      // 2026: Patel Colony's AirBNB row read status='mapping' while Channex's
      // own `GET channels` for that property returned zero results) jump
      // straight to room-mapping every time the wizard reopened, with no way
      // back to the "Request Airbnb Connection" step that actually creates it.
      const reallyConnected = Boolean(existing?.channex_channel_id)
        && !!existing && existing.status !== 'draft' && existing.status !== 'pending_test' && existing.status !== 'error';
      if (reallyConnected) {
        setPrereqConfirmed(true);
        setTestResult({ success: true, errors: null });
      }
      setStep(reallyConnected ? 3 : 2);
    } finally {
      setLoadingAdapterDetail(false);
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
      if (field.type === 'boolean' || field.type === 'select') return true; // has a default/is optional
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

  // Step 3 entry: fetch what rooms/rates the channel exposes for this connection's settings.
  useEffect(() => {
    if (step !== 3 || !selectedCode || mappingDetails) return;
    setLoadingMapping(true);
    apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_mapping_details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.status === 'success') setMappingDetails(json.data);
        else showToast(json?.message || 'Failed to load room/rate options from Channex', { type: 'error' });
      })
      .catch(() => showToast('Failed to load room/rate options from Channex', { type: 'error' }))
      .finally(() => setLoadingMapping(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedCode]);

  const isMappingComplete = useMemo(() => {
    if (localRooms.length === 0) return false;
    return localRooms.every((r) => {
      const key = String(r.local_room_id ?? 'null');
      const m = roomMapping[key];
      return m && m.external_room_code && m.external_rate_code;
    });
  }, [localRooms, roomMapping]);

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
      showToast('Room mapping saved.', { type: 'success' });
      setStep(4);
    } catch (err: any) {
      showToast(err.message || 'Failed to save room mapping', { type: 'error' });
    } finally {
      setSavingMapping(false);
    }
  };

  // Step 4 entry: authoritative readiness check from Channex itself.
  useEffect(() => {
    if (step !== 4 || !selectedCode) return;
    setCheckingReadiness(true);
    setReadinessProblems(null);
    apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_check_readiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode }),
    })
      .then((res) => res.json())
      .then((json) => setReadinessProblems(json?.status === 'success' ? (json.data || []) : []))
      .catch(() => setReadinessProblems([]))
      .finally(() => setCheckingReadiness(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedCode]);

  const canActivate = !checkingReadiness && (readinessProblems?.length ?? 1) === 0 && confirmedExistingBookings;

  const handleActivate = async () => {
    if (!selectedCode || !canActivate) return;
    setActivating(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, channel_code: selectedCode, confirmed_existing_bookings: true }),
      });
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast(json?.message || 'Failed to activate this channel', { type: 'error' });
        return;
      }
      showToast(`${selectedCode} is now live!`, { type: 'success' });
      onConnected(selectedCode);
    } catch (err: any) {
      showToast(err.message || 'Failed to activate this channel', { type: 'error' });
    } finally {
      setActivating(false);
    }
  };

  if (!isOpen) return null;

  const prereq = selectedCode ? CHANNEL_PREREQUISITES[selectedCode] : null;
  // Only Booking.com has an external prerequisite step; every other channel
  // has no checkbox to tick, so gating Test Connection on prereqConfirmed
  // being literally true left it permanently disabled for Airbnb et al.
  const prereqSatisfied = !prereq || prereqConfirmed;

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      position="right"
      className="fixed overflow-y-auto transition-transform right-0 top-0 h-screen transform-none z-50 w-full sm:w-140 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
    >
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Connect a Channel</h2>
          </div>
          {selectedAdapter && (
            <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">Step {step} of 4 &bull; {selectedAdapter.title}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* STEP 1: Choose channel */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose which OTA you'd like to connect to this property.</p>
            {loadingAdapters ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {adapters
                  .filter((a) => a.kind === 'ota' || a.kind === 'meta')
                  .map((a) => (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() => handleSelectChannel(a.code)}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 text-left transition-all"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</div>
                        {a.is_airbnb_oauth && (
                          <div className="text-2xs text-amber-600 dark:text-amber-400 mt-0.5">Our team completes this connection for you</div>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Connect */}
        {step === 2 && loadingAdapterDetail && (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
        )}

        {step === 2 && !loadingAdapterDetail && selectedAdapter?.is_airbnb_oauth && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Airbnb requires signing in on Airbnb's own site to authorize the connection. Submit your listing details below and our team will complete the connection on your behalf, then let you know once it's live.</span>
            </div>
            {airbnbSubmitted ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Request submitted</p>
                <p className="text-2xs text-slate-600 dark:text-slate-300">We'll reach out once your Airbnb listing is connected.</p>
              </div>
            ) : (
              <Input
                label="Anything we should know about your Airbnb listing? (optional)"
                value={airbnbNote}
                onChange={(e) => setAirbnbNote(e.target.value)}
                helperText="e.g. your listing name/URL, so our team can find it faster"
              />
            )}
          </div>
        )}

        {step === 2 && !loadingAdapterDetail && selectedAdapter && !selectedAdapter.is_airbnb_oauth && (
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
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
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

        {/* STEP 4: Go live */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Readiness check</span>
              </div>
              {checkingReadiness ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking with Channex...
                </div>
              ) : (readinessProblems?.length ?? 0) > 0 ? (
                <ul className="space-y-1">
                  {readinessProblems!.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-2xs text-red-700 dark:text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{typeof p === 'string' ? p : JSON.stringify(p)}</span>
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

      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
        {step > 1 && step < 4 ? (
          <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        ) : <div />}

        {step === 2 && selectedAdapter?.is_airbnb_oauth && !airbnbSubmitted && (
          <Button variant="primary" onClick={handleStartAirbnb} disabled={startingAirbnb} className="w-full justify-center sm:w-auto">
            {startingAirbnb ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ExternalLink className="w-4 h-4 mr-1" />}
            {startingAirbnb ? 'Submitting...' : 'Request Airbnb Connection'}
          </Button>
        )}
        {step === 2 && selectedAdapter?.is_airbnb_oauth && airbnbSubmitted && (
          <Button variant="primary" onClick={onClose} className="w-full justify-center sm:w-auto">Done</Button>
        )}
        {step === 2 && selectedAdapter && !selectedAdapter.is_airbnb_oauth && (
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
          <Button variant="primary" onClick={handleSaveMapping} disabled={savingMapping} className={!isMappingComplete ? 'opacity-50' : ''}>
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
