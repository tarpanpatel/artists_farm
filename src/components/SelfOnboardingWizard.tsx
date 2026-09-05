import React, { useState } from 'react';
import { Drawer } from 'flowbite-react';
import {
  User, Home, Layers, ChefHat,
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, Sparkles, ShieldCheck, X, AlertCircle,
  Smartphone, Share, PlusSquare, MoreVertical, RefreshCw,
} from './icons/FlowbiteIcons';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { BookingComIcon } from './icons/BookingComIcon';
import { Button } from './Button';
import { Input } from './Input';
import { useToast } from './ToastContext';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import type { ImportedPropertyData } from './OtaPropertyImporterModal';

interface SelfOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (redirectUrl: string) => void;
}

type Step = 1 | 2 | 3 | 4;

export const SelfOnboardingWizard: React.FC<SelfOnboardingWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredRedirectUrl, setRegisteredRedirectUrl] = useState<string | null>(null);
  // 28 Aug 2026, explicit request: clicking a greyed-out "Next"/"Complete Setup" button used to
  // silently do nothing (native disabled buttons don't fire onClick at all) - these track whether
  // the user has actually tried to advance from that step, so field-level errors only appear after
  // a real attempt (never on a pristine untouched field) but then update live as they fix things.
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step3Attempted, setStep3Attempted] = useState(false);

  // --- Step 1: Owner Credentials ---
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [passcode, setPasscode] = useState('');

  // --- Step 3: Creation Mode & OTA Import ---
  const [creationMode, setCreationMode] = useState<'manual' | 'airbnb' | 'booking_com'>('manual');
  const [otaIdentifier, setOtaIdentifier] = useState('');
  const [otaFetching, setOtaFetching] = useState(false);
  const [otaPreview, setOtaPreview] = useState<ImportedPropertyData | null>(null);
  const [otaError, setOtaError] = useState<string | null>(null);
  const [hostListings, setHostListings] = useState<Array<{ id: string; url: string; name: string }> | null>(null);

  // --- Step 3: Property Setup ---
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

  const formatDate = (d: Date) => formatDateDDMMYYYY(d.toISOString());

  const isStep1Valid = !!fullName.trim() && !!email.trim() && phone.replace(/\D/g, '').length === 10 && passcode.length === 6;
  const isStep3Valid = !!propertyName.trim() && hasKitchen !== null && Number(defaultTariff) > 0;

  const fullNameError = step1Attempted && !fullName.trim() ? 'Full name is required' : undefined;
  const emailError = step1Attempted && !email.trim() ? 'Email address is required' : undefined;
  const phoneError = step1Attempted && phone.replace(/\D/g, '').length !== 10 ? 'Enter a valid 10-digit mobile number' : undefined;
  const passcodeError = step1Attempted && passcode.length !== 6 ? 'Enter a 6-digit passcode' : undefined;
  const propertyNameError = step3Attempted && !propertyName.trim() ? 'Property name is required' : undefined;
  const defaultTariffError = step3Attempted && !(Number(defaultTariff) > 0) ? 'Enter your standard room rate' : undefined;

  const handleFetchOta = async () => {
    if (!otaIdentifier.trim()) {
      setOtaError(`Please enter an ${creationMode === 'airbnb' ? 'Airbnb listing URL, Host profile URL, or listing ID' : 'Booking.com hotel link or hotel ID'}`);
      return;
    }

    setOtaError(null);
    setOtaFetching(true);
    setHostListings(null);
    try {
      const response = await fetch('/php/api/router.php?action=fetch_ota_listing_preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: creationMode,
          identifier: otaIdentifier.trim(),
        }),
      });

      const data = await response.json();
      if (data && data.success) {
        if (data.is_host_profile && data.listings && data.listings.length > 0) {
          setHostListings(data.listings);
          showToast(`Found ${data.listings.length} listings for this Host on Airbnb! Select one to import.`, { type: 'success' });
        } else if (data.data) {
          const preview = data.data as ImportedPropertyData;
          setOtaPreview(preview);
          setHostListings(null);
          if (preview.name) setPropertyName(preview.name);
          if (preview.property_type) setPropertyType(preview.property_type);
          if (preview.room_count) setRoomCount(preview.room_count);
          if (preview.default_tariff) setDefaultTariff(String(preview.default_tariff));
          if (preview.checkin_time) setCheckinTime(preview.checkin_time);
          if (preview.checkout_time) setCheckoutTime(preview.checkout_time);
          if (preview.has_kitchen !== undefined) setHasKitchen(preview.has_kitchen === 1);
          showToast(`Listing details & photos imported from ${creationMode === 'airbnb' ? 'Airbnb' : 'Booking.com'}!`, { type: 'success' });
        }
      } else {
        const msg = data?.message || 'Unable to fetch listing details. You can enter details manually.';
        setOtaError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err: any) {
      console.error('Fetch OTA listing failed:', err);
      const msg = 'Network error fetching listing. You can enter details manually.';
      setOtaError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setOtaFetching(false);
    }
  };

  const handleSelectListingFromHost = async (listingId: string) => {
    setOtaIdentifier(listingId);
    setHostListings(null);
    setOtaFetching(true);
    setOtaError(null);
    try {
      const response = await fetch('/php/api/router.php?action=fetch_ota_listing_preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'airbnb',
          identifier: listingId,
        }),
      });
      const data = await response.json();
      if (data && data.success && data.data) {
        const preview = data.data as ImportedPropertyData;
        setOtaPreview(preview);
        if (preview.name) setPropertyName(preview.name);
        if (preview.property_type) setPropertyType(preview.property_type);
        if (preview.room_count) setRoomCount(preview.room_count);
        if (preview.default_tariff) setDefaultTariff(String(preview.default_tariff));
        if (preview.checkin_time) setCheckinTime(preview.checkin_time);
        if (preview.checkout_time) setCheckoutTime(preview.checkout_time);
        if (preview.has_kitchen !== undefined) setHasKitchen(preview.has_kitchen === 1);
        showToast(`Listing #${listingId} details & photos imported!`, { type: 'success' });
      } else {
        setOtaError(data?.message || 'Failed to extract listing');
      }
    } catch (err: any) {
      setOtaError('Failed to extract listing');
    } finally {
      setOtaFetching(false);
    }
  };

  const handleNextStepClick = () => {
    if (step === 1 && !isStep1Valid) {
      setStep1Attempted(true);
      return;
    }
    setStep((s) => (s + 1) as Step);
  };

  const handleCompleteSetupClick = () => {
    if (loading) return;
    if (!isStep3Valid) {
      setStep3Attempted(true);
      if (hasKitchen === null) {
        showToast('Please select whether this property serves food.', { type: 'warning' });
      }
      return;
    }
    handleSubmit();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!isStep1Valid || !isStep3Valid) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/php/api/router.php?action=register_tenant_trial', {
        method: 'POST',
        credentials: 'include',
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
          imported_data: otaPreview,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const targetUrl = data.redirect_url || `/${data.property_slug}`;
        setRegisteredRedirectUrl(targetUrl);
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
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">Step {step} of 3 • Full access, no credit card required</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stepper Header */}
      <div className="px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="flex items-center justify-between text-2xs font-semibold text-slate-500 dark:text-slate-400">
          <span className={step === 1 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : step > 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            1. Account
          </span>
          <span className={step === 2 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : step > 2 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            2. License
          </span>
          <span className={step === 3 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : step > 3 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            3. Add Property
          </span>
          <span className={step === 4 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : ''}>
            4. Add App
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Form Content */}
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

        {/* STEP 2: 30-Day Trial License Summary */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200">30-Day Trial License</span>
                </div>
                <span className="px-2.5 py-0.5 text-2xs font-bold uppercase rounded-md bg-emerald-600 text-white border border-emerald-500 shadow-xs">
                  ₹0 Free Trial
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-200 dark:border-emerald-800 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-2xs">License Type</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Trial (Full Access)</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-2xs">Status</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active Immediately
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-2xs">Start Date</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(todayDate)}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-2xs">Expiration Date</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(expiryDate)}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-2 text-2xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>What happens after 30 days?</span>
              </div>
              <p className="leading-relaxed">
                Zero automatic charges. We will notify you 7 days prior to expiry. You can choose a monthly/annual plan or your dashboard seamlessly pauses in read-only mode with all guest data preserved.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: Property Setup */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Home className="w-4 h-4 text-indigo-600" />
                <span>Add Your First Property</span>
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                Import in 1-click from Airbnb or Booking.com, or create manually.
              </p>
            </div>

            {/* Creation Source Mode Switcher */}
            <div>
              <label className="block text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Setup Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreationMode('manual');
                    setOtaError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 text-center transition-all ${
                    creationMode === 'manual'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Home className="w-4 h-4 text-indigo-600 mb-1" />
                  <span className="text-xs">Manual Entry</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreationMode('airbnb');
                    setOtaError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 text-center transition-all ${
                    creationMode === 'airbnb'
                      ? 'border-[#FF5A5F] bg-red-50/50 dark:bg-red-950/30 text-gray-900 dark:text-white font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <AirbnbIcon className="w-4 h-4 mb-1" />
                  <span className="text-xs">Airbnb Import</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreationMode('booking_com');
                    setOtaError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 text-center transition-all ${
                    creationMode === 'booking_com'
                      ? 'border-[#003580] bg-blue-50/50 dark:bg-blue-950/30 text-gray-900 dark:text-white font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <BookingComIcon className="w-4 h-4 mb-1" />
                  <span className="text-xs">Booking.com</span>
                </button>
              </div>
            </div>

            {/* OTA Import Input Section */}
            {creationMode !== 'manual' && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    {creationMode === 'airbnb' ? <AirbnbIcon className="w-4 h-4" /> : <BookingComIcon className="w-4 h-4" />}
                    <span>{creationMode === 'airbnb' ? 'Import from Airbnb' : 'Import from Booking.com'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreationMode('manual')}
                    className="text-2xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Skip &amp; Type Manually
                  </button>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder={
                        creationMode === 'airbnb'
                          ? 'Paste Airbnb link (e.g. airbnb.com/rooms/12345678)'
                          : 'Paste Booking.com link or enter Hotel ID'
                      }
                      value={otaIdentifier}
                      onChange={(e) => setOtaIdentifier(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFetchOta();
                        }
                      }}
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleFetchOta}
                    disabled={otaFetching || !otaIdentifier.trim()}
                    className="h-10 shrink-0"
                  >
                    {otaFetching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1" /> Fetching...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1" /> Fetch
                      </>
                    )}
                  </Button>
                </div>

                {/* How to find link guide for Airbnb */}
                {creationMode === 'airbnb' && !otaPreview && !hostListings && (
                  <details className="text-2xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer group">
                    <summary className="font-semibold text-gray-700 dark:text-gray-300 flex items-center justify-between list-none">
                      <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold">
                        💡 How do I find my Airbnb Host Profile or Listing Link?
                      </span>
                      <span className="text-3xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-2 space-y-2 pt-1.5 border-t border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mb-0.5">👤 For Standard / Non-Professional Hosts (Imports all listings):</div>
                        <ul className="list-disc list-inside space-y-0.5 ml-1 text-3xs">
                          <li><strong className="text-slate-800 dark:text-slate-200">Via Desktop:</strong> airbnb.com ➔ Click avatar (top-right) ➔ <strong>Account</strong> ➔ <strong>Go to profile</strong> ➔ Copy URL (<code>airbnb.com/users/show/12345</code>).</li>
                          <li><strong className="text-slate-800 dark:text-slate-200">From Any Listing:</strong> Open your listing ➔ Scroll to <strong>&quot;Hosted by...&quot;</strong> ➔ Click host name ➔ Copy browser URL.</li>
                          <li><strong className="text-slate-800 dark:text-slate-200">Via Mobile App:</strong> Tap <strong>Profile</strong> ➔ Tap photo ➔ <strong>Share</strong> (top-right) ➔ <strong>Copy Link</strong>.</li>
                        </ul>
                      </div>

                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mb-0.5">🏢 For Professional Hosts (Custom Brand URL):</div>
                        <ul className="list-disc list-inside space-y-0.5 ml-1 text-3xs">
                          <li>Go to <strong>Account Settings ➔ Professional hosting tools</strong> ➔ Copy custom profile URL (<code>airbnb.co.in/p/your-brand</code>).</li>
                        </ul>
                      </div>

                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mb-0.5">🏠 For Single Listing Only:</div>
                        <ul className="list-disc list-inside space-y-0.5 ml-1 text-3xs">
                          <li>Go to <strong>Listings</strong> tab ➔ Click your property ➔ <strong>Preview / Share</strong> ➔ Copy link (<code>airbnb.com/rooms/12345678</code>) or enter just numerical Listing ID.</li>
                        </ul>
                      </div>
                    </div>
                  </details>
                )}

                {otaError && (
                  <div className="flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-2xs text-red-700 dark:text-red-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{otaError}</span>
                  </div>
                )}

                {/* Host Profile Multi-Listing Picker */}
                {hostListings && hostListings.length > 0 && (
                  <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <AirbnbIcon className="w-4 h-4" />
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          Found {hostListings.length} Listings for this Host
                        </span>
                      </div>
                      <span className="text-3xs text-gray-500 dark:text-gray-400">Click to import:</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {hostListings.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all shadow-2xs"
                        >
                          <div className="min-w-0 pr-1.5">
                            <div className="text-2xs font-bold text-gray-900 dark:text-white line-clamp-1">
                              {item.name}
                            </div>
                            <div className="text-3xs text-gray-500 dark:text-gray-400 font-mono">
                              ID: {item.id}
                            </div>
                          </div>
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => handleSelectListingFromHost(item.id)}
                            disabled={otaFetching}
                            className="text-3xs shrink-0 px-2 py-1"
                          >
                            Import
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fetched Preview Strip */}
                {otaPreview && (
                  <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between text-2xs text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Details &amp; Photos Extracted
                      </span>
                      {otaPreview.photos && otaPreview.photos.length > 0 && (
                        <span>{otaPreview.photos.length} photos ready</span>
                      )}
                    </div>

                    {otaPreview.photos && otaPreview.photos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {otaPreview.photos.slice(0, 5).map((imgUrl, idx) => (
                          <div key={idx} className="relative w-20 h-14 rounded-md overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                            <img src={imgUrl} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                            {idx === 0 && (
                              <span className="absolute bottom-0.5 left-0.5 bg-black/70 text-white text-3xs px-1 rounded">
                                Cover
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Input
              label="Property Name"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              helperText="e.g. Vrikshawan Resort Hut"
              error={propertyNameError}
            />

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Property Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPropertyType('SINGLE')}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-all ${propertyType === 'SINGLE' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <Home className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Single Villa / Hut</span>
                  <span className="text-2xs text-slate-500 dark:text-slate-400">Rented as one whole property</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPropertyType('MULTI_KEY')}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-all ${propertyType === 'MULTI_KEY' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}
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
              helperText={!defaultTariffError ? 'Used as the starting price for every room - you can change it any time later.' : undefined}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input type="time" label="Check-in Time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} />
              <Input type="time" label="Check-out Time" value={checkoutTime} onChange={(e) => setCheckoutTime(e.target.value)} />
            </div>

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Does this property serve food?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setHasKitchen(true)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${hasKitchen === true ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <ChefHat className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Yes (Kitchen & Food)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHasKitchen(false)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${hasKitchen === false ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <X className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">No Kitchen</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Add App to Mobile Guidance */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Account Created Successfully!</h3>
              <p className="text-2xs text-slate-600 dark:text-slate-300">
                Your 30-day trial for <strong>{propertyName}</strong> is active. We sent login details to your WhatsApp & Email.
              </p>
            </div>

            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 font-bold text-xs text-indigo-900 dark:text-indigo-200">
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <span>📱 Add Dashboard as an App on Your Mobile</span>
              </div>
              <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Add this resort dashboard to your phone's home screen for 1-tap instant access, push notifications, and fast offline load times!
              </p>

              <div className="space-y-2 pt-2 border-t border-indigo-100 dark:border-indigo-900 text-2xs">
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="font-semibold text-slate-900 dark:text-white mb-1">🍏 On iPhone (Safari):</div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                    <li>Tap <Share className="w-3 h-3 inline text-indigo-600" /> <strong>Share</strong> in Safari's bottom bar</li>
                    <li>Scroll down & tap <PlusSquare className="w-3 h-3 inline text-indigo-600" /> <strong>Add to Home Screen</strong></li>
                    <li>Tap <strong>Add</strong> in top-right corner</li>
                  </ol>
                </div>

                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="font-semibold text-slate-900 dark:text-white mb-1">🤖 On Android (Chrome):</div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                    <li>Tap <MoreVertical className="w-3 h-3 inline text-indigo-600" /> <strong>3 Dots Menu</strong> in top-right</li>
                    <li>Tap <strong>Install App</strong> or <strong>Add to Home screen</strong></li>
                    <li>Tap <strong>Install</strong> to confirm</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation Buttons */}
      {/* pb-[calc(1rem+env(safe-area-inset-bottom))] (28 Aug 2026, explicit report + screenshot:
          "Next Step" button sat with no breathing room above the home-indicator bar on iPhone) -
          see CLAUDE.md's "Bottom-Anchored Drawer Footer Safe Area" rule; this is a full h-screen
          Drawer with a footer as its last flex child, not App.tsx's shared <main> (which already
          handles its own safe-area-inset-bottom + persistent mobile nav bar clearance separately). */}
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
        {step > 1 && step < 4 ? (
          <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)} disabled={loading}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        ) : (
          <div />
        )}

        {step < 3 ? (
          <Button
            variant="primary"
            onClick={handleNextStepClick}
            className={step === 1 && !isStep1Valid ? 'opacity-50' : ''}
          >
            <span>Next Step</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : step === 3 ? (
          <Button
            variant="primary"
            onClick={handleCompleteSetupClick}
            disabled={loading}
            className={!isStep3Valid ? 'opacity-50' : ''}
          >{/* Not natively `disabled` for the !isStep3Valid case (28 Aug 2026, explicit
               request) - a real disabled button swallows the click entirely, which is exactly
               why this used to silently do nothing. Still visually greyed via opacity, still
               genuinely disabled while `loading` (a real in-flight submit must not be
               re-triggered). handleCompleteSetupClick surfaces the actual reason instead. */}
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
        ) : (
          <Button
            variant="primary"
            onClick={() => onSuccess(registeredRedirectUrl || '/')}
            className="w-full justify-center"
          >
            <span>Launch Property Dashboard Now</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </Drawer>
  );
};
