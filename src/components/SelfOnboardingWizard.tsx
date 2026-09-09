import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Drawer } from 'flowbite-react';
import {
  User, Home, Layers, ChefHat,
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, Sparkles, ShieldCheck, X, AlertCircle,
  Smartphone, Share, PlusSquare, MoreVertical, ExternalLink, RefreshCw, Apple, Monitor, Download,
  MapPin, Building,
} from './icons/FlowbiteIcons';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { Button } from './Button';
import { Input } from './Input';
import { useToast } from './ToastContext';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { detectInstallPlatform } from '../utils/installPlatform';

interface SelfOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (redirectUrl: string) => void;
}

type Step = 1 | 2 | 3 | 4;

interface DiscoveredListing {
  id: string;
  title: string;
  max_occupancy?: number | null;
  listing_type?: string;
  city?: string;
}

export const SelfOnboardingWizard: React.FC<SelfOnboardingWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const installPlatform = detectInstallPlatform();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredRedirectUrl, setRegisteredRedirectUrl] = useState<string | null>(null);

  // Field touch tracking for error display
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step3Attempted, setStep3Attempted] = useState(false);

  // --- Step 1: Owner Credentials ---
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [passcode, setPasscode] = useState('');

  // --- Step 2: Setup Mode ---
  const [setupMode, setSetupMode] = useState<'airbnb' | 'manual'>('airbnb');

  // Created property ID & status
  const [createdPropertyId, setCreatedPropertyId] = useState<number | null>(null);

  // --- Step 3 (Airbnb Mode State) ---
  const [airbnbAuthUrl, setAirbnbAuthUrl] = useState<string | null>(null);
  const [airbnbAuthOpened, setAirbnbAuthOpened] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [airbnbConnected, setAirbnbConnected] = useState(false);
  const [checkingAirbnbStatus, setCheckingAirbnbStatus] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);
  const [discoveredListings, setDiscoveredListings] = useState<DiscoveredListing[]>([]);
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [autoProvisioning, setAutoProvisioning] = useState(false);

  // Locations represented by the CURRENT selection. Airbnb returns `city` per listing, so the
  // obvious cross-city mistake (importing Jaipur and Goa listings into one property) can be
  // caught outright instead of only warned about in prose.
  //
  // Deliberately framed as a prompt, not a block. `city` is a WEAK proxy for "same location":
  // two separate buildings in the same city are still two locations for staffing purposes -
  // this account's own Patel Colony and Winter are both in Jaipur, 2.4km apart - and the cheap
  // listings call returns nothing that can tell those apart (only listing_details carries
  // street/lat/lng; see CHANNEX.md 6, "Where a listing actually is").
  //
  // So this prompt fires on ANY multi-listing selection, not only when the cities differ
  // (9 Sep 2026): silence on the same-city case is exactly what let a two-location selection
  // through unremarked. Where the cities genuinely differ it says so; otherwise it asks, and
  // says plainly that we cannot check it. Never auto-split or refuse on it.
  //
  // NOTE: `AirbnbListingPicker.tsx` (the creation/setup wizards' shared picker) does this
  // properly - it fetches the real addresses in the background and clusters by coordinates.
  // This screen still has its own older copy of the listing UI; folding it onto that picker is
  // the real fix and is tracked in ROADMAP.md.
  const selectedCities = useMemo(() => {
    const seen = new Set<string>();
    discoveredListings.forEach((l) => {
      if (selectedListingIds.includes(l.id) && l.city && l.city.trim()) seen.add(l.city.trim());
    });
    return Array.from(seen);
  }, [discoveredListings, selectedListingIds]);

  // --- Step 3 (Manual Setup State) ---
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState<'SINGLE' | 'MULTI_KEY'>('SINGLE');
  const [roomCount, setRoomCount] = useState<number>(5);
  const [checkinTime, setCheckinTime] = useState('14:00');
  const [checkoutTime, setCheckoutTime] = useState('11:00');
  const [defaultTariff, setDefaultTariff] = useState('');
  const [hasKitchen, setHasKitchen] = useState<boolean | null>(true);

  // Trial dates calculation
  const todayDate = new Date();
  const expiryDate = new Date(todayDate);
  expiryDate.setDate(expiryDate.getDate() + 30);

  const isStep1Valid = !!fullName.trim() && !!email.trim() && phone.replace(/\D/g, '').length === 10 && passcode.length === 6;
  const isManualFormValid = !!propertyName.trim() && hasKitchen !== null && Number(defaultTariff) > 0;

  const fullNameError = step1Attempted && !fullName.trim() ? 'Full name is required' : undefined;
  const emailError = step1Attempted && !email.trim() ? 'Email address is required' : undefined;
  const phoneError = step1Attempted && phone.replace(/\D/g, '').length !== 10 ? 'Enter a valid 10-digit mobile number' : undefined;
  const passcodeError = step1Attempted && passcode.length !== 6 ? 'Enter a 6-digit passcode' : undefined;
  const propertyNameError = step3Attempted && !propertyName.trim() ? 'Property name is required' : undefined;
  const defaultTariffError = step3Attempted && !(Number(defaultTariff) > 0) ? 'Enter your standard room rate' : undefined;

  // Check Airbnb connection and discovered listings
  const checkAirbnbConnectionAndListings = useCallback(async (propId: number) => {
    if (!propId) return;
    setCheckingAirbnbStatus(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_connection_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propId }),
      });
      const json = await res.json();
      const conn = (json?.data?.connections || []).find((c: any) => c.channel_code === 'AirBNB');
      const isConnected = !!conn && ['mapping', 'ready_to_activate', 'active'].includes(conn.status);
      setAirbnbConnected(isConnected);

      if (isConnected) {
        setLoadingListings(true);
        const mapRes = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_mapping_details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: propId, channel_code: 'AirBNB' }),
        });
        const mapJson = await mapRes.json();
        if (mapJson?.status === 'success' && Array.isArray(mapJson.data?.rooms)) {
          const listings: DiscoveredListing[] = mapJson.data.rooms;
          setDiscoveredListings(listings);
          setSelectedListingIds(listings.map((l) => l.id));
          if (!propertyName && listings.length > 0) {
            setPropertyName(listings[0].title);
          }
        }
      }
    } catch (err) {
      console.error('Failed to verify Airbnb connection status:', err);
    } finally {
      setCheckingAirbnbStatus(false);
      setLoadingListings(false);
    }
  }, [propertyName]);

  // Window focus listener: auto-detects when the host closes the Airbnb OAuth popup
  useEffect(() => {
    if (step !== 3 || setupMode !== 'airbnb' || !createdPropertyId) return;
    const onFocus = () => {
      void checkAirbnbConnectionAndListings(createdPropertyId);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [step, setupMode, createdPropertyId, checkAirbnbConnectionAndListings]);

  // Generate and open Airbnb OAuth link
  const handleOpenAirbnbAuth = async () => {
    if (!createdPropertyId) return;
    if (airbnbAuthUrl) {
      window.open(airbnbAuthUrl, '_blank');
      setAirbnbAuthOpened(true);
      return;
    }
    setGeneratingLink(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_airbnb_connection_link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: createdPropertyId }),
      });
      const json = await res.json();
      if (json?.status === 'success' && json.data?.url) {
        setAirbnbAuthUrl(json.data.url);
        window.open(json.data.url, '_blank');
        setAirbnbAuthOpened(true);
      } else {
        const msg = json?.message || 'Failed to generate Airbnb connection link';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err: any) {
      const msg = err.message || 'Network error generating Airbnb connection link';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setGeneratingLink(false);
    }
  };

  // 1-Click Auto-Provision from Airbnb
  const handleAutoProvision = async () => {
    if (!createdPropertyId) return;
    setAutoProvisioning(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_auto_provision_from_airbnb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: createdPropertyId,
          selected_listing_ids: selectedListingIds,
          property_name: propertyName.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json?.status === 'success') {
        const targetUrl = json.redirect_url || `/${json.property_slug}`;
        setRegisteredRedirectUrl(targetUrl);
        showToast(
          json?.message ||
            'Imported from Airbnb. Nothing was sent to Airbnb - the channel is not live yet.',
          { type: 'success' },
        );
        setStep(4);
      } else {
        const msg = json?.message || 'Failed to auto-provision property from Airbnb';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err: any) {
      const msg = err.message || 'Network error during auto-provisioning';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setAutoProvisioning(false);
    }
  };

  // Handles navigation from Step 1 to Step 2
  const handleStep1Next = () => {
    if (!isStep1Valid) {
      setStep1Attempted(true);
      return;
    }
    setStep(2);
  };

  // Handles moving from Step 2 (Setup Mode Choice) to Step 3
  const handleStep2Next = async () => {
    if (setupMode === 'airbnb') {
      // Create initial trial account shell if not already registered
      if (!createdPropertyId) {
        setLoading(true);
        try {
          setError(null);
          const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=register_tenant_trial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: fullName.trim(),
              email: email.trim(),
              phone: phone.replace(/\D/g, ''),
              passcode: passcode.trim(),
              property_name: `${fullName.trim()}'s Homestay`,
              property_type: 'SINGLE',
              room_count: 1,
              default_tariff: 2500,
              checkin_time: '14:00',
              checkout_time: '11:00',
              has_kitchen: 1,
            }),
          });
          const data = await res.json();
          if (data.success) {
            const propId = Number(data.property_id);
            setCreatedPropertyId(propId);
            setRegisteredRedirectUrl(data.redirect_url || `/${data.property_slug}`);
            setStep(3);
            void checkAirbnbConnectionAndListings(propId);
          } else {
            const msg = data.message || 'Failed to create trial account';
            setError(msg);
            showToast(msg, { type: 'error' });
          }
        } catch (err) {
          console.error('Registration failed:', err);
          const msg = 'Network error. Please try again.';
          setError(msg);
          showToast(msg, { type: 'error' });
        } finally {
          setLoading(false);
        }
      } else {
        setStep(3);
        void checkAirbnbConnectionAndListings(createdPropertyId);
      }
    } else {
      // Manual path: advance to Step 3 to collect full property form
      setStep(3);
    }
  };

  // Handles submission of manual setup form in Step 3
  const handleManualSubmit = async () => {
    if (loading) return;
    if (!isManualFormValid) {
      setStep3Attempted(true);
      if (hasKitchen === null) {
        showToast('Please select whether this property serves food.', { type: 'warning' });
      }
      return;
    }

    setLoading(true);
    try {
      setError(null);
      const response = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=register_tenant_trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.replace(/\D/g, ''),
          passcode: passcode.trim(),
          property_name: propertyName.trim(),
          property_type: propertyType,
          room_count: propertyType === 'MULTI_KEY' ? roomCount : 1,
          default_tariff: Number(defaultTariff),
          checkin_time: checkinTime,
          checkout_time: checkoutTime,
          has_kitchen: hasKitchen ? 1 : 0,
        }),
      });

      const data = await response.json();
      if (data.success) {
        const targetUrl = data.redirect_url || `/${data.property_slug}`;
        setRegisteredRedirectUrl(targetUrl);
        setCreatedPropertyId(Number(data.property_id) || null);
        showToast('Account & Property created successfully! 30-Day trial active.', { type: 'success' });
        setStep(4);
      } else {
        const msg = data.message || 'Failed to complete registration';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err) {
      console.error('Registration failed:', err);
      const msg = 'Network error. Please try again.';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const toggleListingSelection = (id: string) => {
    setSelectedListingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  if (!isOpen) return null;

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      position="right"
      className="fixed overflow-y-auto transition-transform right-0 top-0 h-screen transform-none z-50 w-full sm:w-140 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Start Your 30-Day Free Trial</h2>
          </div>
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
            Step {step} of 4 • Full access, zero automatic charges
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stepper Progress Indicator */}
      <div className="px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="flex items-center justify-between text-2xs font-semibold text-slate-500 dark:text-slate-400">
          <span className={step === 1 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : step > 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            1. Account
          </span>
          <span className={step === 2 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : step > 2 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            2. Setup Method
          </span>
          <span className={step === 3 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : step > 3 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            3. Property Setup
          </span>
          <span className={step === 4 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : ''}>
            4. Launch
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Form Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Account Credentials */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-lg text-xs text-indigo-800 dark:text-indigo-300 flex items-start gap-2.5">
              <User className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Create your master admin account. Mobile number will be used for daily logins.</span>
            </div>

            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              helperText="e.g. Rajesh Sharma"
              error={fullNameError}
            />

            <Input
              type="email"
              label="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helperText="e.g. rajesh@vrikshawanresort.com - official tax bills & invoices will be sent here."
              error={emailError}
            />

            <Input
              type="tel"
              inputMode="numeric"
              label="Mobile Number (Login Username)"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              helperText="10-digit mobile number - this is your login username."
              error={phoneError}
            />

            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              label="6-Digit Passcode (PIN)"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              helperText="e.g. 123456 - a 6-digit numeric PIN for quick login."
              error={passcodeError}
            />
          </div>
        )}

        {/* STEP 2: Onboarding Setup Choice */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="pb-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                How would you like to set up your property?
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                Connect your existing OTA listings or enter details manually from scratch.
              </p>
            </div>

            {/* Option A: Hero Airbnb Import */}
            <div
              onClick={() => setSetupMode('airbnb')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                setupMode === 'airbnb'
                  ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AirbnbIcon className="w-8 h-8 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        Import from Airbnb
                      </span>
                      <span className="px-2 py-0.5 text-2xs font-semibold rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                        ✨ Recommended (99% of hosts)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Connect your Airbnb host account. Ground Code will automatically create your rooms, import base tariffs, check-in times, cleaning fees, house rules, and amenities in 60 seconds.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 mt-1">
                  <input
                    type="radio"
                    name="setup_mode"
                    checked={setupMode === 'airbnb'}
                    onChange={() => setSetupMode('airbnb')}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-indigo-100 dark:border-indigo-900/60 grid grid-cols-2 gap-2 text-2xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Real rooms & rates imported</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Zero manual mapping</span>
                </div>
              </div>
            </div>

            {/* Option B: Manual Setup */}
            <div
              onClick={() => setSetupMode('manual')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                setupMode === 'manual'
                  ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Home className="w-6 h-6 text-slate-600 dark:text-slate-300 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Set up manually (From scratch)
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Type in room names, tariffs, and operating rules by hand. Best if your property is brand new and not yet listed on Airbnb or OTAs.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 mt-1">
                  <input
                    type="radio"
                    name="setup_mode"
                    checked={setupMode === 'manual'}
                    onChange={() => setSetupMode('manual')}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 30-Day License Guarantee */}
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                  30-Day Free Trial Included (Full Access)
                </span>
              </div>
              <span className="px-2 py-0.5 text-2xs font-bold uppercase rounded-md bg-emerald-600 text-white border border-emerald-500">
                ₹0 Trial
              </span>
            </div>
          </div>
        )}

        {/* STEP 3: Property Setup (Airbnb Import Path) */}
        {step === 3 && setupMode === 'airbnb' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AirbnbIcon className="w-5 h-5 shrink-0" />
                <span>Import from Your Airbnb Account</span>
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                Connect Airbnb to auto-provision your real rooms and tariffs.
              </p>
            </div>

            {!airbnbConnected ? (
              <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center space-y-4">
                <AirbnbIcon className="w-12 h-12 mx-auto" />
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Connect Your Airbnb Account
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                    Click the button below to authorize Ground Code via Airbnb's official secure portal.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleOpenAirbnbAuth}
                    disabled={generatingLink}
                    className="w-full sm:w-auto justify-center bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {generatingLink ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating Link...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4 mr-2" /> Authorize with Airbnb
                      </>
                    )}
                  </Button>
                </div>

                {airbnbAuthOpened && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
                    <p className="text-xs text-blue-900 dark:text-blue-200">
                      Sign in to Airbnb in the popup window and click 'Allow'. When finished, click below to check listings:
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => createdPropertyId && checkAirbnbConnectionAndListings(createdPropertyId)}
                      disabled={checkingAirbnbStatus}
                      className="text-xs"
                    >
                      {checkingAirbnbStatus ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Checking Connection...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1" /> I've Authorized - Check My Listings
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Airbnb Account Connected
                  </span>
                </div>

                {loadingListings ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-2">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                    <p className="text-xs text-slate-500">Discovering your listings from Airbnb...</p>
                  </div>
                ) : discoveredListings.length > 0 ? (
                  <div className="space-y-3">
                    {/* Location guidance, shown BEFORE anything is selected (9 Sep 2026, explicit
                        request). One property = one location, with its units as rooms under it -
                        because staff, expenses, kitchen and menu all attach to the parent, so this
                        is what lets an owner run a separate team and separate books per location.
                        Owners do not arrive at this on their own, and picking the wrong shape here
                        is expensive to unwind once bookings and ledger entries have accumulated
                        against it. Placed above the list on purpose: after the checkboxes it would
                        be advice about a decision already made. */}
                    <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <Building className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                      <div className="text-xs text-blue-900 dark:text-blue-200">
                        <p className="font-bold">Select only the listings at one location.</p>
                        <p className="mt-1 font-normal">
                          They become rooms under a single property. Anything at a different
                          address should be a separate property, created the same way afterwards
                          &mdash; that is what lets you give each location its own staff, expenses
                          and kitchen.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Found {discoveredListings.length} Listing{discoveredListings.length === 1 ? '' : 's'}:
                      </span>
                      <span className="text-2xs text-slate-500 dark:text-slate-400">
                        {selectedListingIds.length} selected for import
                      </span>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {discoveredListings.map((listing) => {
                        const isSelected = selectedListingIds.includes(listing.id);
                        return (
                          <div
                            key={listing.id}
                            onClick={() => toggleListingSelection(listing.id)}
                            className={`p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700'
                                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 opacity-60'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {listing.title}
                              </div>
                              <div className="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                                {listing.max_occupancy ? <span>Sleeps {listing.max_occupancy} guests</span> : null}
                                {listing.city ? <span>• {listing.city}</span> : null}
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleListingSelection(listing.id)}
                              className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500 cursor-pointer"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {selectedListingIds.length > 1 && (
                      <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="text-xs text-amber-900 dark:text-amber-300">
                          <p className="font-bold">
                            {selectedCities.length > 1
                              ? `These listings are in ${selectedCities.length} different cities: ${selectedCities.join(', ')}.`
                              : `Are all ${selectedListingIds.length} of these at the same address?`}
                          </p>
                          <p className="mt-1 font-normal">
                            They would all become rooms of one property sharing one staff list. If
                            they are separate places, import one now and create another property
                            for the rest.
                            {selectedCities.length > 1
                              ? ''
                              : ' Airbnb only tells us the city here, so we cannot check this for you.'}
                          </p>
                        </div>
                      </div>
                    )}

                    <Input
                      label="Property / Resort Name"
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                      helperText="Name of your property or resort (can be edited later)."
                    />

                    {/* No consent checkboxes here on purpose (9 Sep 2026). They were added
                        8 Sep 2026, when this button also activated the channel and pushed a
                        500-day availability + rate window to Airbnb. It no longer does either:
                        this imports only, and the channel is left switched off until the owner
                        goes live deliberately. There is nothing outward-facing to consent to,
                        so asking would be theatre - the real gates live on Go Live, which is
                        the action that actually writes to Airbnb. */}
                    <div className="flex items-start gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                      <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                        This only reads from Airbnb. Your rooms, prices and settings are copied
                        into Ground Code, and your existing Airbnb bookings are pulled in - but
                        nothing is sent back. Your Airbnb calendar, blocked dates and prices are
                        left exactly as they are. You choose when to go live afterwards.
                      </span>
                    </div>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleAutoProvision}
                      disabled={autoProvisioning || selectedListingIds.length === 0}
                      className="w-full justify-center py-2.5"
                    >
                      {autoProvisioning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Importing Property & Rooms...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2 text-amber-300" />
                          <span>✨ Import My Property from Airbnb</span>
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-center space-y-2">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      No active listings found on this Airbnb account. You can switch to manual setup or retry.
                    </p>
                    <div className="flex justify-center gap-2 pt-1">
                      <Button variant="secondary" size="xs" onClick={() => setSetupMode('manual')}>
                        Switch to Manual Setup
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => createdPropertyId && checkAirbnbConnectionAndListings(createdPropertyId)}
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Property Setup (Manual Form Path) */}
        {step === 3 && setupMode === 'manual' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Home className="w-4 h-4 text-indigo-600" />
                <span>Add Your Property Manually</span>
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                Set up your room count and nightly tariffs.
              </p>
            </div>

            <Input
              label="Property Name"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              helperText="e.g. Vrikshawan Resort Hut"
              error={propertyNameError}
            />

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Property Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPropertyType('SINGLE')}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${
                    propertyType === 'SINGLE'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Home className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Single Villa / Hut</span>
                  <span className="text-2xs text-slate-500 dark:text-slate-400">Rented as one whole property</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPropertyType('MULTI_KEY')}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${
                    propertyType === 'MULTI_KEY'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Multi-Room Hotel</span>
                  <span className="text-2xs text-slate-500 dark:text-slate-400">Multiple bookable rooms</span>
                </button>
              </div>
            </div>

            {propertyType === 'MULTI_KEY' && (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                label="Number of Rooms"
                value={roomCount}
                onChange={(e) => setRoomCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            )}

            <Input
              type="number"
              inputMode="decimal"
              min={1}
              label={propertyType === 'MULTI_KEY' ? 'Default Room Rate (₹ per room, per night)' : 'Room Rate (₹ per night)'}
              placeholder="e.g. 2500"
              value={defaultTariff}
              onChange={(e) => setDefaultTariff(e.target.value)}
              error={defaultTariffError}
              helperText={!defaultTariffError ? 'Starting price for rooms - you can change it any time later.' : undefined}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input type="time" label="Check-in Time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} />
              <Input type="time" label="Check-out Time" value={checkoutTime} onChange={(e) => setCheckoutTime(e.target.value)} />
            </div>

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Does this property serve food?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setHasKitchen(true)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    hasKitchen === true
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <ChefHat className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Yes (Kitchen & Food)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHasKitchen(false)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    hasKitchen === false
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <X className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">No Kitchen</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Success & Mobile App Guidance */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Account & Property Created Successfully!</h3>
              <p className="text-2xs text-slate-600 dark:text-slate-300">
                Your 30-day trial for <strong>{propertyName || 'Your Resort'}</strong> is active. We sent login details to your WhatsApp & Email.
              </p>
            </div>

            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 font-bold text-xs text-indigo-900 dark:text-indigo-200">
                <img src="/app-icons/icon-source.png" alt="GroundCode" className="w-5 h-5" />
                <span>Add GroundCode as an App on Your Mobile</span>
              </div>
              <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Add this resort dashboard to your phone's home screen for 1-tap instant access and fast offline loading!
              </p>

              <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900 text-2xs">
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  {installPlatform === 'ios' ? (
                    <>
                      <div className="font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5"><Apple className="w-3.5 h-3.5" /> On iPhone or iPad (Safari):</div>
                      <ol className="list-decimal pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                        <li>Tap <Share className="w-3 h-3 inline text-indigo-600" /> <strong>Share</strong> in Safari's toolbar</li>
                        <li>Scroll down and tap <PlusSquare className="w-3 h-3 inline text-indigo-600" /> <strong>Add to Home Screen</strong></li>
                        <li>Tap <strong>Add</strong> to confirm</li>
                      </ol>
                    </>
                  ) : installPlatform === 'android' ? (
                    <>
                      <div className="font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> On Android (Chrome):</div>
                      <ol className="list-decimal pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                        <li>Tap <MoreVertical className="w-3 h-3 inline text-indigo-600" /> <strong>3 Dots Menu</strong> in Chrome's top-right corner</li>
                        <li>Tap <strong>Install App</strong> or <strong>Add to Home screen</strong></li>
                        <li>Tap <strong>Install</strong> to confirm</li>
                      </ol>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5" /> On desktop (Chrome or Edge):</div>
                      <ol className="list-decimal pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                        <li>Click the <Download className="w-3 h-3 inline text-indigo-600" /> <strong>Install</strong> icon at the right of the address bar</li>
                        <li>Or open <MoreVertical className="w-3 h-3 inline text-indigo-600" /> the browser menu and choose <strong>Install GroundCode</strong></li>
                        <li>Click <strong>Install</strong> to confirm</li>
                      </ol>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation Buttons */}
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
        {step > 1 && step < 4 ? (
          <Button
            variant="secondary"
            onClick={() => setStep((s) => (s - 1) as Step)}
            disabled={loading || autoProvisioning}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        ) : (
          <div />
        )}

        {step === 1 ? (
          <Button
            variant="primary"
            onClick={handleStep1Next}
            className={!isStep1Valid ? 'opacity-50' : ''}
          >
            <span>Next Step</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : step === 2 ? (
          <Button
            variant="primary"
            onClick={handleStep2Next}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" /> Setting Up...
              </>
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        ) : step === 3 && setupMode === 'manual' ? (
          <Button
            variant="primary"
            onClick={handleManualSubmit}
            disabled={loading}
            className={!isManualFormValid ? 'opacity-50' : ''}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" /> Creating Account...
              </>
            ) : (
              <>
                <span>Complete Setup & Launch</span>
                <CheckCircle2 className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        ) : step === 4 ? (
          <Button
            variant="primary"
            onClick={() => onSuccess(registeredRedirectUrl || '/')}
            className="w-full justify-center"
          >
            <span>Launch Property Dashboard Now</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <div />
        )}
      </div>
    </Drawer>
  );
};
