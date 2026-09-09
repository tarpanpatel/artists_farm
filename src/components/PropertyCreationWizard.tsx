import React, { useEffect, useMemo, useState } from 'react';
import { FieldHelpModeProvider } from './FieldHelpPopover';
import {
  Home, Hotel, Layers, Phone, Wallet,
  Clock, FileText, CheckCircle2, Loader2, ArrowRight, ArrowLeft, X,
  ChefHat, AlertCircle, Sparkles,
} from './icons/FlowbiteIcons';
import { Drawer } from 'flowbite-react';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { Button } from './Button';
import { UpiPaymentBlock, isValidUpiIdSyntax } from '../utils/upiQrCode';
import { AirbnbListingPicker, type DiscoveredListing } from './AirbnbListingPicker';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { apiFetch, API_ROOT_BASE } from '../services/api';

/**
 * Owner-facing Property Setup Wizard (added 26 Aug 2026, explicit request) - replaces the old
 * single-screen "Add Property" drawer in TenantDashboard.tsx with a multi-step, timeline-stepper
 * flow (see https://flowbite.com/docs/components/stepper/#stepper-with-form for the visual
 * pattern this follows) collecting the same field set as the Edit Property page
 * (PropertyEditForm.tsx), minus OTA/iCal sync setup (a separate, later step outside this wizard).
 *
 * DRAFT ARCHITECTURE (explicit requirement: "let user save and exit in between, property becomes
 * DRAFT status"): only step 0's fields (property type, name, address, has-kitchen) are mandatory.
 * The property is actually CREATED the moment step 0 is completed - with status='draft' - so
 * "Save & Exit" on any later step has something real already saved, not just local component
 * state that would be lost. Every step after that calls update_property (which already accepts
 * every field this wizard collects, and already accepts 'status' - see router.php) against that
 * same property_id. The final step publishes by setting status='active'. Resuming a draft later
 * just means passing that property row back in as `existingProperty` - every field pre-fills from
 * what get_tenant_properties already returned (a plain `SELECT p.*`, so nothing extra to fetch).
 */

export interface WizardProperty {
  id: number;
  name?: string;
  slug?: string;
  property_type?: string;
  status?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  upi_id?: string;
  upi_qr_code_url?: string;
  walk_in_table_count?: number;
  address?: string;
  google_maps_link?: string;
  instructions?: string;
  default_tariff?: number | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  room_count?: number;
}

interface PropertyCreationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after ANY successful save (Save & Exit, or Finish) so the parent can refresh its list. */
  onSaved: () => void;
  tenantId: number;
  remainingSlots: number;
  /** Present when resuming a draft; absent for a brand-new property. */
  existingProperty?: WizardProperty | null;
}

const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type StepKey = 'basics' | 'listings' | 'contact' | 'payments' | 'operations' | 'notes';

const STEP_DEFS: { key: StepKey; label: string; icon: React.ElementType }[] = [
  { key: 'basics', label: 'Basics', icon: Home },
  // Import sits immediately after Basics on purpose (9 Sep 2026, explicit request). Basics is
  // where the draft property row is created, which is the only thing the import ever needed -
  // a Channex channel has to attach to a property that exists. Everything after this step is
  // then pre-filled from the listing instead of retyped, which is the whole point. Before this,
  // the wizard only showed a note telling the owner to finish here and go find Channel
  // Connections afterwards.
  { key: 'listings', label: 'Listings', icon: AirbnbIcon },
  { key: 'contact', label: 'Contact', icon: Phone },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'operations', label: 'Operations', icon: Clock },
  { key: 'notes', label: 'Notes', icon: FileText },
];

export const PropertyCreationWizard: React.FC<PropertyCreationWizardProps> = ({
  isOpen,
  onClose,
  onSaved,
  tenantId,
  remainingSlots,
  existingProperty = null,
}) => {
  const isResuming = !!existingProperty;

  const [stepIndex, setStepIndex] = useState(0);

  // --- Step 1: Listings (Airbnb import) ---
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [airbnbConnected, setAirbnbConnected] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<number | null>(existingProperty?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  // --- Step 0: Basics ---
  const [propertyType, setPropertyType] = useState<'SINGLE' | 'MULTI_KEY'>(
    (existingProperty?.property_type as 'SINGLE' | 'MULTI_KEY') || 'SINGLE'
  );
  const [roomCount, setRoomCount] = useState(existingProperty?.room_count || 1);
  const [name, setName] = useState(existingProperty?.name || '');
  const [address, setAddress] = useState(existingProperty?.address || '');
  const [nameTouched, setNameTouched] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);
  const [mapsLink, setMapsLink] = useState(existingProperty?.google_maps_link || '');
  // null = not yet answered (fresh property, forces an explicit choice - see step0Valid below).
  // When resuming a draft, this is NOT assumed true/on-by-default - it's fetched from the real
  // property_modules state below, since a resumed draft may have already been saved with "No".
  const [hasKitchen, setHasKitchen] = useState<boolean | null>(isResuming ? null : null);
  const [kitchenAnswerLoaded, setKitchenAnswerLoaded] = useState(!isResuming);

  useEffect(() => {
    if (!isOpen || !isResuming || !existingProperty?.id) return;
    let cancelled = false;
    fetch(`/php/api/router.php?action=get_property_modules&property_id=${existingProperty.id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setHasKitchen(typeof data.kitchen_enabled === 'boolean' ? data.kitchen_enabled : true);
      })
      .catch(() => {
        if (!cancelled) setHasKitchen(true); // fail open to the system default rather than block the wizard
      })
      .finally(() => {
        if (!cancelled) setKitchenAnswerLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isResuming, existingProperty?.id]);

  // --- Step 1: Contact & Tax ---
  const [email, setEmail] = useState(existingProperty?.email || '');
  const [phone, setPhone] = useState(existingProperty?.phone || '');
  const [gstin, setGstin] = useState(existingProperty?.gstin || '');

  // --- Step 2: Payments ---
  const [upiId, setUpiId] = useState(existingProperty?.upi_id || '');
  // Read-only pass-through: no UI path sets this anymore (26 Aug 2026 - upload
  // removed in favor of an always-on auto-generated QR, see UpiPaymentBlock
  // below), but a property that already has a legacy uploaded QR on file
  // still has it preserved on save and still takes precedence at checkout.
  const [upiQrCodeUrl] = useState(existingProperty?.upi_qr_code_url || '');

  // --- Step 3: Operations ---
  const [checkinTime, setCheckinTime] = useState(existingProperty?.checkin_time || '14:00');
  const [checkoutTime, setCheckoutTime] = useState(existingProperty?.checkout_time || '11:00');
  const [defaultTariff, setDefaultTariff] = useState(
    existingProperty?.default_tariff != null ? String(existingProperty.default_tariff) : ''
  );
  const walkInTableCount = existingProperty?.walk_in_table_count != null ? String(existingProperty.walk_in_table_count) : '10';

  // --- Step 4: Notes ---
  const [instructions, setInstructions] = useState(existingProperty?.instructions || '');

  // The slug this wizard's property is actually reachable at. Every Channex call below must be
  // addressed to it (apiFetch's propertySlugOverride): router.php authorises against the property
  // the REQUEST resolves to, and this wizard runs from the Tenant Dashboard where nothing is in
  // scope - which is exactly why the Listings step returned "Access denied for this property."
  // when it first shipped. A resumed draft carries its real slug; a new one is created with
  // autoSlug(name), the same value sent to create_property_for_tenant.
  const wizardPropertySlug = existingProperty?.slug || autoSlug(name);

  const steps = useMemo(() => STEP_DEFS, []);
  const activeStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const slotsNeeded = propertyType === 'MULTI_KEY' ? roomCount : 1;
  // A draft already occupies its slot(s) once created - only re-check availability before the
  // FIRST save (property doesn't exist yet), never on later steps of the same draft.
  const step0Valid = !!name.trim() && !!address.trim() && hasKitchen !== null && kitchenAnswerLoaded;

  /**
   * Runs the Airbnb import against the draft property, then pulls the property back so the
   * remaining wizard steps show what the listing actually said instead of empty fields.
   *
   * Imports only. `autoProvisionPropertyFromAirbnb()` never pushes ARI and never activates the
   * channel (CHANNEX.md 5.4a), so nothing reaches Airbnb from here - going live is a separate,
   * deliberate action behind the Push Confirmation Gate.
   */
  const handleImportListings = async () => {
    if (!propertyId) return;
    if (selectedListingIds.length === 0) {
      setError('Select at least one listing to import, or use Next to skip this step.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_auto_provision_from_airbnb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          selected_listing_ids: selectedListingIds,
          // Name is deliberately NOT sent. The server refuses it for a MULTI_KEY parent anyway,
          // and for a SINGLE property the owner has already got it from the picker's blank-fill.
        }),
      }, wizardPropertySlug);
      const json = await res.json();
      if (json?.status !== 'success') {
        setError(json?.message || 'Import failed');
        return;
      }
      setImportResult(
        `Imported ${json.rooms_count ?? selectedListingIds.length} listing${(json.rooms_count ?? selectedListingIds.length) === 1 ? '' : 's'}. Nothing was sent to Airbnb - the channel is not live yet.`,
      );

      // Re-read the property so the later steps reflect the imported values. Best-effort: a
      // failed refresh must not undo a successful import, it just means the owner types those
      // fields as they would have before.
      try {
        // There is no single-property GET action - `get_tenant_properties` is the one that
        // returns full property rows (verified 9 Sep 2026; `get_property_modules` returns only
        // module flags). Filter to ours rather than inventing an endpoint.
        const propRes = await fetch(
          `/php/api/router.php?action=get_tenant_properties&tenant_id=${encodeURIComponent(String(tenantId))}`,
          { credentials: 'include' },
        );
        const propJson = await propRes.json();
        const p = Array.isArray(propJson?.data)
          ? propJson.data.find((row: any) => Number(row.id) === Number(propertyId))
          : null;
        if (p) {
          if (p.checkin_time) setCheckinTime(String(p.checkin_time).slice(0, 5));
          if (p.checkout_time) setCheckoutTime(String(p.checkout_time).slice(0, 5));
          if (p.default_tariff != null && String(p.default_tariff) !== '') setDefaultTariff(p.default_tariff);
          if (p.instructions && !instructions.trim()) setInstructions(String(p.instructions));
          if (p.address && !address.trim()) setAddress(String(p.address));
        }
      } catch { /* keep the import */ }
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  /**
   * Persists whatever the CURRENT step holds. Step 0 either creates the draft (first ever save)
   * or updates it (resuming/editing an already-created one); every later step is always an update
   * against the propertyId step 0 established. Returns true on success.
   */
  const persistCurrentStep = async (publish = false): Promise<boolean> => {
    setError(null);
    if (activeStep.key === 'payments' && upiId.trim() && !isValidUpiIdSyntax(upiId)) {
      setError('Enter a valid UPI ID, e.g. name@bank');
      return false;
    }
    setSaving(true);
    try {
      if (activeStep.key === 'basics') {
        if (!propertyId) {
          if (slotsNeeded > remainingSlots) {
            setError(`Not enough slots - you need ${slotsNeeded} but only ${remainingSlots} remain.`);
            return false;
          }
          const res = await fetch('/php/api/router.php?action=create_property_for_tenant', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenant_id: tenantId,
              name: name.trim(),
              slug: autoSlug(name),
              property_type: propertyType,
              room_count: roomCount,
              address: address.trim(),
              google_maps_link: mapsLink.trim(),
              status: 'draft',
              has_kitchen: hasKitchen,
            }),
          });
          const data = await res.json();
          if (!data.success) {
            setError(data.message || 'Failed to create property');
            return false;
          }
          setPropertyId(data.property_id);
        } else {
          const res = await fetch('/php/api/router.php?action=update_property', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: propertyId,
              name: name.trim(),
              address: address.trim(),
              google_maps_link: mapsLink.trim(),
            }),
          });
          const data = await res.json();
          if (!data.success) {
            setError(data.message || 'Failed to save');
            return false;
          }
          // Kitchen toggle applied every time this step saves (create or edit) - idempotent, and
          // the only path that keeps a LATER change of mind (resuming a draft, changing the
          // answer) actually taking effect, not just the value at creation time.
          await fetch('/php/api/router.php?action=toggle_property_module', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_id: propertyId, module_name: 'kitchen', enabled: !!hasKitchen }),
          }).catch(() => {});
        }
        return true;
      }

      // Listings has nothing of its own to persist - the import (if the owner ran one) already
      // wrote straight to the property row via channex_auto_provision_from_airbnb, and skipping
      // the step entirely is a valid choice.
      if (activeStep.key === 'listings') return true;

      // The remaining steps always operate on an already-created property_id (step 0 guarantees
      // this by the time any later step is reachable, since Next is disabled on step 0 until it
      // saves).
      if (!propertyId) return false;

      const payload: Record<string, any> = { property_id: propertyId };
      if (activeStep.key === 'contact') {
        payload.email = email.trim();
        payload.phone = phone.trim();
      } else if (activeStep.key === 'payments') {
        payload.upi_id = upiId.trim();
        payload.upi_qr_code_url = upiQrCodeUrl.trim();
        payload.gstin = gstin.trim().toUpperCase();
      } else if (activeStep.key === 'operations') {
        payload.checkin_time = checkinTime;
        payload.checkout_time = checkoutTime;
        payload.walk_in_table_count = walkInTableCount;
        if (propertyType !== 'MULTI_KEY') payload.default_tariff = defaultTariff;
      } else if (activeStep.key === 'notes') {
        payload.instructions = instructions;
      }
      if (publish) payload.status = 'active';

      const res = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to save');
        return false;
      }
      return true;
    } catch {
      setError('Network error. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await persistCurrentStep(false);
    if (ok) setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const handleSkip = () => {
    // Purely optional steps (1-3) can be skipped without even attempting a save of empty fields -
    // there's nothing to persist if the owner typed nothing, and this keeps "Skip" instant.
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const handleBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const handleSaveAndExit = async () => {
    const ok = await persistCurrentStep(false);
    if (ok) {
      onSaved();
      onClose();
    }
  };

  const handleFinish = async () => {
    const ok = await persistCurrentStep(true);
    if (ok) {
      setFinished(true);
      onSaved();
      setTimeout(() => {
        setFinished(false);
        onClose();
      }, 1200);
    }
  };


  // Setup screens show field guidance BELOW the field, always visible, rather than behind a
  // "?" popover (9 Sep 2026, explicit request). The owner is meeting each field for the first
  // time here, so the help IS the content - a popover nobody opens is help nobody reads.
  // Scoped to this screen only; the rest of the app keeps the popover.
  return (
    <FieldHelpModeProvider mode="inline">
      <Drawer
        open={isOpen}
        onClose={onClose}
        position="right"
        className="z-58 w-full sm:w-140 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Hotel className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {isResuming ? 'Continue Property Setup' : 'Set Up Your New Property'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Timeline stepper (https://flowbite.com/docs/components/stepper/#stepper-with-form) -
            small circular step icons connected by progress bars, current step highlighted, done
            steps checked. */}
        <div className="px-4 pt-3 pb-7 border-b border-gray-200 dark:border-gray-700 overflow-x-auto shrink-0">
          <ol className="flex items-center w-full">
            {steps.map((step, idx) => {
              const StepIcon = step.icon;
              const step0Done = !!name.trim() && !!address.trim();
              const step1Done = !!(email.trim() || phone.trim());
              const step2Done = !!(upiId.trim() || gstin.trim());
              const step3Done = propertyType === 'MULTI_KEY' || !!checkinTime || (defaultTariff != null && String(defaultTariff).trim() !== '');
              const step4Done = !!instructions.trim();
              // Listings is optional (a property with no OTA listing is perfectly valid), so it
              // counts as done once anything was actually imported.
              const listingsDone = !!importResult;
              const stepDoneFlags = [step0Done, listingsDone, step1Done, step2Done, step3Done, step4Done];

              const isStepComplete = stepDoneFlags[idx] ?? false;
              const isCurrent = idx === stepIndex && !finished;
              const isPassedOrVisited = idx < stepIndex || (idx === stepIndex && finished);
              const isPassedIncomplete = isPassedOrVisited && !isStepComplete;
              const isFullyComplete = isStepComplete && (idx !== stepIndex || finished);
              const isLast = idx === steps.length - 1;

              return (
                <li key={step.key} className={`flex items-center ${!isLast ? 'flex-1' : ''}`}>
                  <div className="relative flex items-center justify-center shrink-0">
                    <span
                      className={`wizard-step-btn flex items-center justify-center w-9 h-9 min-w-[36px] max-w-[36px] min-h-[36px] max-h-[36px] aspect-square rounded-full shrink-0 transition-all ${
                        isCurrent
                          ? 'bg-indigo-600 text-white shadow-xs ring-4 ring-indigo-100 dark:ring-indigo-900/60'
                          : isFullyComplete
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-500'
                          : isPassedIncomplete
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-2 border-amber-500'
                          : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isFullyComplete ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isPassedIncomplete ? (
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <StepIcon className="w-4 h-4" />
                      )}
                    </span>
                    <span
                      className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 text-2xs font-semibold whitespace-nowrap ${
                        isCurrent
                          ? 'text-indigo-700 dark:text-indigo-300'
                          : isPassedIncomplete
                          ? 'text-amber-700 dark:text-amber-400 font-bold'
                          : isFullyComplete
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className={`flex-1 h-1 rounded-full mx-1.5 ${
                        stepDoneFlags[idx] && idx < stepIndex
                          ? 'bg-emerald-500'
                          : idx < stepIndex
                          ? 'bg-amber-400 dark:bg-amber-600'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {activeStep.key === 'basics' && (
            <div className="space-y-4">
              {/* The "Import from Airbnb or Booking.com" shortcut that used to sit
                  here is gone (6 Sep 2026). It scraped the public listing page,
                  which is how a 7-room property once took its name from an og:title
                  meta tag - and it could never reach the values that actually
                  matter (guests included, extra-guest charge, fees, bed layout)
                  because those are not on the page at all.

                  A REAL import now lives in the next step (9 Sep 2026). The blocker was only ever
                  that a Channex channel has to attach to a property that exists - and this step
                  creates the draft row, so by the Listings step there is one. The scraper is still
                  not coming back: the import there goes through the Channex channel API, same as
                  Edit Property's "Import from Airbnb". */}
              {!isResuming && (
                <div className="flex items-start gap-2.5 p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/80 rounded-xl">
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-indigo-100 dark:border-indigo-800 shrink-0 text-amber-500">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Already listed on Airbnb?
                    </div>
                    <div className="text-2xs text-indigo-700/80 dark:text-indigo-300/80">
                      Just name it here &mdash; the next step connects Airbnb and imports your
                      listings, so your check-in times, fees, capacity and base price arrive filled
                      in instead of retyped.
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Property Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isResuming}
                    onClick={() => setPropertyType('SINGLE')}
                    className={`flex flex-col items-start gap-1.5 p-3.5 rounded-lg border-2 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${propertyType === 'SINGLE' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                  >
                    <Home className={`w-5 h-5 ${propertyType === 'SINGLE' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className={`text-xs font-semibold ${propertyType === 'SINGLE' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>Single Property</span>
                    <span className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                      One whole place rented as a single unit - a house, cottage, or apartment. Guests book the whole thing at once.
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isResuming}
                    onClick={() => setPropertyType('MULTI_KEY')}
                    className={`flex flex-col items-start gap-1.5 p-3.5 rounded-lg border-2 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${propertyType === 'MULTI_KEY' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                  >
                    <Layers className={`w-5 h-5 ${propertyType === 'MULTI_KEY' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className={`text-xs font-semibold ${propertyType === 'MULTI_KEY' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>Multi-Key Property</span>
                    <span className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                      One address, several separately bookable keys - rooms, suites, or even whole villas/cottages - like a small hotel, guesthouse, or resort. Different guests can be in different keys at the same time.
                    </span>
                  </button>
                </div>
                {isResuming && (
                  <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1.5">Property type can't be changed after creation.</p>
                )}
              </div>

              {propertyType === 'MULTI_KEY' && (
                <div>
                  <Input
                    type="number"
                    min={1}
                    max={remainingSlots}
                    disabled={isResuming}
                    label="Number of Rooms"
                    value={roomCount}
                    onChange={(e) => setRoomCount(Math.max(1, parseInt(e.target.value) || 1))}
                    helperText={isResuming ? 'Add or delete rooms later from the property dashboard.' : `Max ${remainingSlots} slot(s) available`}
                  />
                </div>
              )}

              <Input
                label={propertyType === 'MULTI_KEY' ? 'Parent Property Name' : 'Property Name'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                error={nameTouched && !name.trim() ? 'This field is required' : undefined}
                placeholder="e.g. Sea View Villa"
              />
              {name && !isResuming && (
                <p className="text-2xs text-slate-400 dark:text-slate-500 -mt-2">Slug: <span className="font-mono text-indigo-500">/{autoSlug(name)}</span></p>
              )}

              <Input
                label="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => setAddressTouched(true)}
                error={addressTouched && !address.trim() ? 'This field is required' : undefined}
                placeholder="Full property address"
              />

              <Input
                label="Google Maps Link (optional)"
                value={mapsLink}
                onChange={(e) => setMapsLink(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
              />

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Does this property have a kitchen?</label>
                {!kitchenAnswerLoaded ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading current setting...
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setHasKitchen(true)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${hasKitchen === true ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'}`}
                  >
                    <ChefHat className={`w-5 h-5 ${hasKitchen === true ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <div className={`text-xs font-semibold ${hasKitchen === true ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>Yes</div>
                      <div className="text-2xs text-slate-500 dark:text-slate-400">Food orders, KDS, recipes</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasKitchen(false)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${hasKitchen === false ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                  >
                    <X className={`w-5 h-5 ${hasKitchen === false ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <div className={`text-xs font-semibold ${hasKitchen === false ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>No</div>
                      <div className="text-2xs text-slate-500 dark:text-slate-400">No food service - can turn on later</div>
                    </div>
                  </button>
                </div>
                )}
              </div>
            </div>
          )}

          {activeStep.key === 'listings' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Import your listings
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Optional. Connecting Airbnb pulls your real check-in times, fees, capacity, bed
                  layout, amenities and base price straight from the listing, so the rest of this
                  wizard arrives filled in instead of typed. You can skip this and do it later.
                </p>
              </div>

              <AirbnbListingPicker
                propertyId={propertyId}
                propertySlug={wizardPropertySlug}
                selectedIds={selectedListingIds}
                onSelectionChange={setSelectedListingIds}
                onConnectionChange={setAirbnbConnected}
                onListingsLoaded={(found: DiscoveredListing[]) => {
                  // Only ever FILLS A BLANK. Never overwrite a name the owner has already typed,
                  // and never touch it at all for a MULTI_KEY parent - a parent is the building,
                  // not one listing, and an import renaming one reached the public booking engine
                  // once already (CLAUDE.md, "OTA Import Must Never Rewrite a Property's Identity").
                  if (!name.trim() && propertyType === 'SINGLE' && found.length > 0) {
                    setName(found[0].title);
                  }
                }}
              />

              {importResult ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                    {importResult}
                  </span>
                </div>
              ) : (
                airbnbConnected && (
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    onClick={handleImportListings}
                    disabled={importing}
                    // Greyed but still clickable when nothing is selected, so the click can say why
                    // instead of silently doing nothing (28 Aug 2026 rule).
                  >
                    {importing ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
                    ) : (
                      <><Sparkles className="mr-2 h-4 w-4" /> Import {selectedListingIds.length || ''} selected listing{selectedListingIds.length === 1 ? '' : 's'}</>
                    )}
                  </Button>
                )
              )}
            </div>
          )}

          {activeStep.key === 'contact' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">All optional - skip if you'd rather add these later.</p>
              <Input type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@example.com" />
              <Input
                type="tel"
                label={propertyType === 'MULTI_KEY' ? 'Parent Property Phone Number' : 'Property Phone Number'}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Enter 10-digit mobile number"
                helperText="This is the phone number guests will be shown to contact the property."
              />
            </div>
          )}

          {activeStep.key === 'payments' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">All optional - skip if you'd rather add these later.</p>
              <Input
                label="GSTIN (optional)"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="27ABCDE1234F1Z5"
                helperText="Printed on GST tax invoices at checkout."
              />
              <Input
                label="UPI ID (optional)"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="yourproperty@okicici"
                error={upiId.trim() && !isValidUpiIdSyntax(upiId) ? 'Enter a valid UPI ID, e.g. name@bank' : undefined}
                success={upiId.trim() && isValidUpiIdSyntax(upiId) ? 'Valid UPI ID format' : undefined}
                helperText="A scannable UPI QR code (generated automatically from this ID) and the ID itself are added to booking/bill messages shared over WhatsApp."
              />
              {upiId.trim() && isValidUpiIdSyntax(upiId) && (
                <UpiPaymentBlock upiId={upiId.trim()} payeeName={name.trim() || 'Payment'} qrCodeImageUrl={upiQrCodeUrl} />
              )}
            </div>
          )}

          {activeStep.key === 'operations' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Sensible defaults are already filled in - change only what's different for you.</p>
              <div className="grid grid-cols-2 gap-4">
                <Input type="time" label="Check-in Time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} />
                <Input type="time" label="Check-out Time" value={checkoutTime} onChange={(e) => setCheckoutTime(e.target.value)} />
              </div>
              {propertyType !== 'MULTI_KEY' && (
                <Input
                  type="number"
                  label="Default Tariff / Night (₹, optional)"
                  value={defaultTariff}
                  onChange={(e) => setDefaultTariff(e.target.value)}
                  placeholder="e.g. 2000"
                  helperText="Pre-fills the rate when creating a new booking - still editable per booking."
                />
              )}
            </div>
          )}

          {activeStep.key === 'notes' && (
            <div className="space-y-4">
              {finished ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Property is live!</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Other Notes (optional)</label>
                    <Textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="e.g. How to reach, check-in instructions, parking notes…"
                      rows={4}
                    />
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 m-0">Ready to go live</p>
                    <p className="text-2xs text-slate-500 dark:text-slate-400 m-0">
                      "{name || 'This property'}" will become fully active once you finish - guests can be booked in immediately.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* pb-[calc(1rem+env(safe-area-inset-bottom,0px))], not plain p-4 (2 Sep
            2026, site-wide audit) - see DESIGN.md's "Bottom-Anchored Drawer
            Footer Safe Area" rule. This footer is a shrink-0 flex child pinned
            to the physical bottom edge, same as SelfOnboardingWizard.tsx's and
            PropertySetupWizard.tsx's own footers (already fixed) - this sibling
            wizard was missed at the time. */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-850 shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2">
            {stepIndex > 0 && !finished && (
              <Button type="button" variant="secondary" size="sm" onClick={handleBack} disabled={saving} className="whitespace-nowrap flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </Button>
            )}
            {stepIndex > 0 && !isLastStep && !finished && (
              <Button type="button" variant="secondary" size="sm" onClick={handleSaveAndExit} disabled={saving} className="whitespace-nowrap">
                Save &amp; Exit
              </Button>
            )}
          </div>

          {!finished && (
            <div className="flex items-center gap-2">
              {stepIndex > 0 && !isLastStep && (
                <Button type="button" variant="secondary" size="sm" onClick={handleSkip} disabled={saving} className="whitespace-nowrap">
                  Skip
                </Button>
              )}
              {isLastStep ? (
                <Button type="button" variant="primary" size="sm" onClick={handleFinish} disabled={saving} className="whitespace-nowrap flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Finish Setup</span>
                </Button>
              ) : (
                <Button type="button" variant="primary" size="sm" onClick={handleNext} disabled={saving || (stepIndex === 0 && !step0Valid)} className="whitespace-nowrap flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>Next Step</span>
                  {!saving && <ArrowRight className="w-3.5 h-3.5" />}
                </Button>
              )}
            </div>
          )}
        </div>
      </Drawer>
    </FieldHelpModeProvider>
  );
};
