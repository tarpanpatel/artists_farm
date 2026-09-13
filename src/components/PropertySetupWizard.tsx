import React, { useState, useEffect, useRef } from 'react';
import { FieldHelpModeProvider } from './FieldHelpPopover';
import { Drawer, Modal } from 'flowbite-react';
import {
  Home, Hotel, Phone, Wallet, Clock, Building, Smartphone, Apple, Monitor, Download,
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, ClipboardList, X, AlertCircle, ExternalLink,
  Share, PlusSquare, MoreVertical, Bed, ChefHat,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { UpiPaymentBlock, isValidUpiIdSyntax } from '../utils/upiQrCode';
import { AirbnbListingPicker } from './AirbnbListingPicker';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';
import { detectInstallPlatform } from '../utils/installPlatform';

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

export interface PropertySetupWizardProps {
  mode?: 'setup' | 'create';
  propertyId?: number;
  propertyType?: string;
  name?: string;
  address?: string;
  googleMapsLink?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  upiId?: string;
  upiQrCodeUrl?: string;
  checkinTime?: string;
  checkoutTime?: string;
  defaultTariff?: number | string | null;
  walkInTableCount?: number | string | null;
  instructions?: string;
  rooms?: any[];
  onSaved: () => void;
  // Mode='create' specifics
  isOpen?: boolean;
  onClose?: () => void;
  tenantId?: number;
  remainingSlots?: number;
  existingProperty?: WizardProperty | null;
}

type StepKey = 'basics' | 'listings' | 'contact' | 'payments' | 'operations' | 'rooms' | 'app' | 'notes';

const autoSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const buildStepDefs = (
  isMultiKey: boolean,
  isCreateMode: boolean,
): { key: StepKey; label: string; icon: React.ElementType; optional?: boolean }[] => [
  { key: 'basics', label: 'Basics', icon: Building },
  { key: 'listings', label: 'Listings', icon: Home, optional: true },
  { key: 'contact', label: 'Contact', icon: Phone },
  { key: 'payments', label: 'Payments', icon: Wallet },
  isMultiKey
    ? { key: 'rooms', label: 'Rooms', icon: Bed }
    : { key: 'operations', label: 'Operations', icon: Clock },
  isCreateMode
    ? { key: 'notes', label: 'Notes', icon: ClipboardList }
    : { key: 'app', label: 'App', icon: Smartphone },
];

/** One room's readiness, as shown in the Rooms step. */
interface RoomReadiness {
  id: number;
  name: string;
  missing: string[];
  description?: string;
  defaultTariff?: number;
}

function roomGaps(r: any): string[] {
  const missing: string[] = [];
  if (!(Number(r?.default_tariff) > 0)) missing.push('rate');
  if (!(Number(r?.max_capacity) > 0)) missing.push('capacity');
  if (!r?.checkin_time || !r?.checkout_time) missing.push('times');
  if (!String(r?.description || '').trim()) missing.push('description');
  return missing;
}

const SETUP_WIZARD_SNOOZE_KEY_PREFIX = 'ground_code_setup_wizard_snoozed_until_';
const SETUP_WIZARD_SNOOZE_HOURS = 6;
const SETUP_WIZARD_SNOOZE_MS = SETUP_WIZARD_SNOOZE_HOURS * 60 * 60 * 1000;

function isSetupWizardSnoozed(id: number | string | undefined | null): boolean {
  try {
    if (!id) return false;
    const raw = localStorage.getItem(`${SETUP_WIZARD_SNOOZE_KEY_PREFIX}${id}`);
    return raw !== null && Date.now() < Number(raw);
  } catch {
    return false;
  }
}

function snoozeSetupWizard(id: number | string | undefined | null): void {
  try {
    if (!id) return;
    localStorage.setItem(`${SETUP_WIZARD_SNOOZE_KEY_PREFIX}${id}`, String(Date.now() + SETUP_WIZARD_SNOOZE_MS));
  } catch {}
}

export const PropertySetupWizard: React.FC<PropertySetupWizardProps> = ({
  mode = 'setup',
  propertyId: initialPropertyId,
  propertyType: initialPropertyType,
  name: initialName = '',
  address: initialAddress = '',
  googleMapsLink: initialMapsLink = '',
  email: initialEmail = '',
  phone: initialPhone = '',
  gstin: initialGstin = '',
  upiId: initialUpiId = '',
  upiQrCodeUrl: initialUpiQrCodeUrl = '',
  checkinTime: initialCheckinTime = '14:00',
  checkoutTime: initialCheckoutTime = '11:00',
  defaultTariff: initialDefaultTariff,
  walkInTableCount: initialWalkInTableCount,
  instructions: initialInstructions = '',
  rooms: initialRooms = [],
  onSaved,
  isOpen: externalIsOpen,
  onClose,
  tenantId,
  remainingSlots = 999,
  existingProperty = null,
}) => {
  const isCreateMode = mode === 'create';
  const { showToast } = useToast();
  const installPlatform = detectInstallPlatform();

  // Resolved property ID (may start null in create mode, then get assigned on Step 0 draft save)
  const [propertyId, setPropertyId] = useState<number | null>(() => {
    if (initialPropertyId && initialPropertyId > 0) return initialPropertyId;
    if (existingProperty?.id) return existingProperty.id;
    return null;
  });

  // Modal / Drawer open state
  const [internalIsOpen, setInternalIsOpen] = useState(() => {
    if (isCreateMode) return externalIsOpen ?? true;
    return !isSetupWizardSnoozed(initialPropertyId);
  });

  const isDrawerOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const [showDoItLaterModal, setShowDoItLaterModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  // Form Fields State
  const [editName, setEditName] = useState(existingProperty?.name || initialName);
  const [editPropertyType, setEditPropertyType] = useState(
    existingProperty?.property_type || initialPropertyType || 'SINGLE_UNIT'
  );
  const [editRoomCount, setEditRoomCount] = useState<number>(existingProperty?.room_count || 1);
  const [editHasKitchen, setEditHasKitchen] = useState(true);
  const [editAddress, setEditAddress] = useState(existingProperty?.address || initialAddress);
  const [editAddressTouched, setEditAddressTouched] = useState(false);
  const [editMapsLink, setEditMapsLink] = useState(existingProperty?.google_maps_link || initialMapsLink);
  const [editEmail, setEditEmail] = useState(existingProperty?.email || initialEmail);
  const [editPhone, setEditPhone] = useState(existingProperty?.phone || initialPhone);
  const [editGstin, setEditGstin] = useState(existingProperty?.gstin || initialGstin);
  const [editUpiId, setEditUpiId] = useState(existingProperty?.upi_id || initialUpiId);
  const [editUpiQrCodeUrl, setEditUpiQrCodeUrl] = useState(existingProperty?.upi_qr_code_url || initialUpiQrCodeUrl);
  const [editCheckinTime, setEditCheckinTime] = useState(existingProperty?.checkin_time || initialCheckinTime);
  const [editCheckoutTime, setEditCheckoutTime] = useState(existingProperty?.checkout_time || initialCheckoutTime);
  const [editDefaultTariff, setEditDefaultTariff] = useState(
    existingProperty?.default_tariff != null
      ? String(existingProperty.default_tariff)
      : initialDefaultTariff != null
      ? String(initialDefaultTariff)
      : ''
  );
  const [editWalkInTableCount, setEditWalkInTableCount] = useState<number | string>(
    existingProperty?.walk_in_table_count ?? initialWalkInTableCount ?? 0
  );
  const [editInstructions, setEditInstructions] = useState(existingProperty?.instructions || initialInstructions);

  // Listings & Rooms
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [airbnbConnected, setAirbnbConnected] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [freshRooms, setFreshRooms] = useState<any[] | null>(null);

  const isMultiKey = editPropertyType === 'MULTI_KEY';

  // Server state tracking for setup mode
  const [savedValues, setSavedValues] = useState({
    address: initialAddress,
    email: initialEmail,
    phone: initialPhone,
    gstin: initialGstin,
    upiId: initialUpiId,
    upiQrCodeUrl: initialUpiQrCodeUrl,
    checkinTime: initialCheckinTime,
    defaultTariff: initialDefaultTariff,
  });

  useEffect(() => {
    if (!isCreateMode) {
      setSavedValues({
        address: initialAddress,
        email: initialEmail,
        phone: initialPhone,
        gstin: initialGstin,
        upiId: initialUpiId,
        upiQrCodeUrl: initialUpiQrCodeUrl,
        checkinTime: initialCheckinTime,
        defaultTariff: initialDefaultTariff,
      });
    }
  }, [
    isCreateMode,
    initialPropertyId,
    initialAddress,
    initialEmail,
    initialPhone,
    initialGstin,
    initialUpiId,
    initialUpiQrCodeUrl,
    initialCheckinTime,
    initialDefaultTariff,
  ]);

  const trimmed = (v: unknown): string => String(v ?? '').trim();
  const basicsDone = isCreateMode
    ? !!editName.trim() && !!trimmed(editAddress)
    : !!initialName.trim() && !!trimmed(savedValues.address);
  const contactDone = !!(trimmed(savedValues.email) || trimmed(savedValues.phone));
  const paymentsDone = !!(trimmed(savedValues.upiId) || trimmed(savedValues.upiQrCodeUrl) || trimmed(savedValues.gstin));
  const operationsDone = isMultiKey || !!trimmed(savedValues.checkinTime) || trimmed(savedValues.defaultTariff) !== '';

  const roomReadiness: RoomReadiness[] = ((freshRooms ?? initialRooms) || []).map((r: any) => ({
    id: Number(r?.id),
    name: String(r?.name || 'Room'),
    missing: roomGaps(r),
    description: String(r?.description || '').trim(),
    defaultTariff: Number(r?.default_tariff ?? r?.defaultTariff ?? 0),
  }));
  const blockingRooms = roomReadiness.filter((r) => r.missing.includes('rate') || r.missing.includes('times'));
  const roomsDone = roomReadiness.length > 0 && blockingRooms.length === 0;

  const doneMap: Partial<Record<StepKey, boolean>> = {
    basics: basicsDone,
    listings: !!importResult,
    contact: contactDone,
    payments: paymentsDone,
    operations: operationsDone,
    rooms: roomsDone,
    app: true,
    notes: !!editInstructions.trim(),
  };

  const steps = buildStepDefs(isMultiKey, isCreateMode).map((s) => ({ ...s, isDone: !!doneMap[s.key] }));
  const requiredSteps = steps.filter((s) => !s.optional);
  const totalSteps = requiredSteps.length;
  const stepsDone = requiredSteps.filter((s) => s.isDone).length;
  const setupComplete = stepsDone === totalSteps;

  const firstIncompleteIndex = Math.max(steps.findIndex((s) => !s.optional && !s.isDone), 0);
  const [stepIndex, setStepIndex] = useState(firstIncompleteIndex);
  const activeStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const step0Valid = isCreateMode
    ? !!editName.trim() && !!editAddress.trim()
    : !!editAddress.trim();

  // Close handler
  const handleClose = () => {
    if (isCreateMode) {
      if (onClose) onClose();
      setInternalIsOpen(false);
    } else {
      setInternalIsOpen(false);
    }
  };

  // Listings import
  const handleImportListings = async () => {
    if (!propertyId) return;
    if (selectedListingIds.length === 0) {
      setError('Select at least one listing to import, or use Skip to move on.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_auto_provision_from_airbnb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, selected_listing_ids: selectedListingIds }),
      });
      const json = await res.json();
      if (json?.status !== 'success') {
        setError(json?.message || 'Import failed');
        return;
      }
      const pendingPrice: Array<{ room_id: number | null; room_name: string }> = json.pending_price_units || [];
      const mappedCount = json.mapped_count ?? json.rooms_count ?? selectedListingIds.length;
      let resultMsg = `Imported ${json.rooms_count ?? selectedListingIds.length} listing(s). Nothing was sent to Airbnb - the channel is not live yet.`;
      if (pendingPrice.length > 0) {
        const names = pendingPrice.map((u) => u.room_name).join(', ');
        resultMsg =
          `Imported ${json.rooms_count ?? selectedListingIds.length} listing(s), ${mappedCount} fully mapped. ` +
          `${pendingPrice.length} unit${pendingPrice.length === 1 ? '' : 's'} - ${names} - ` +
          `${pendingPrice.length === 1 ? "wasn't" : "weren't"} mapped yet: no price could be read from Airbnb. ` +
          `Add a base price for ${pendingPrice.length === 1 ? 'it' : 'them'} on the Go Live Status page, then import again.`;
      }
      setImportResult(resultMsg);

      // Refetch rooms from server
      try {
        const refreshRes = await apiFetch(
          `${API_ROOT_BASE}/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`
        );
        const refreshJson = await refreshRes.json();
        if (refreshJson?.success && Array.isArray(refreshJson?.data?.rooms)) {
          setFreshRooms(refreshJson.data.rooms);
        }
      } catch (refreshErr) {
        console.warn('Failed to refresh rooms after import', refreshErr);
      }
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Step persistence
  const persistCurrentStep = async (publish = false): Promise<boolean> => {
    setError(null);
    if (activeStep.key === 'payments' && editUpiId.trim() && !isValidUpiIdSyntax(editUpiId)) {
      setError('Enter a valid UPI ID, e.g. name@bank');
      return false;
    }

    setSaving(true);
    try {
      // Step 0: Basics
      if (activeStep.key === 'basics') {
        if (isCreateMode && !propertyId) {
          const slotsNeeded = editPropertyType === 'MULTI_KEY' ? editRoomCount : 1;
          if (slotsNeeded > remainingSlots) {
            setError(`Not enough slots - you need ${slotsNeeded} but only ${remainingSlots} remain.`);
            setSaving(false);
            return false;
          }
          const res = await fetch('/php/api/router.php?action=create_property_for_tenant', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenant_id: tenantId,
              name: editName.trim(),
              slug: autoSlug(editName),
              property_type: editPropertyType,
              room_count: editRoomCount,
              address: editAddress.trim(),
              google_maps_link: editMapsLink.trim(),
              status: 'draft',
              has_kitchen: editHasKitchen,
            }),
          });
          const data = await res.json();
          if (!data.success) {
            setError(data.message || 'Failed to create property');
            setSaving(false);
            return false;
          }
          setPropertyId(data.property_id);
          return true;
        }

        // Updating basics
        const targetId = propertyId || initialPropertyId;
        const res = await fetch('/php/api/router.php?action=update_property', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: targetId,
            ...(isCreateMode ? { name: editName.trim() } : {}),
            address: editAddress.trim(),
            google_maps_link: editMapsLink.trim(),
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.message || 'Failed to save');
          setSaving(false);
          return false;
        }

        if (isCreateMode && targetId) {
          await fetch('/php/api/router.php?action=toggle_property_module', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_id: targetId, module_name: 'kitchen', enabled: !!editHasKitchen }),
          }).catch(() => {});
        }
        return true;
      }

      if (activeStep.key === 'listings') return true;

      const targetId = propertyId || initialPropertyId;
      if (!targetId) return false;

      const payload: Record<string, any> = { property_id: targetId };
      if (activeStep.key === 'contact') {
        payload.email = editEmail.trim();
        payload.phone = editPhone.trim();
      } else if (activeStep.key === 'payments') {
        payload.upi_id = editUpiId.trim();
        payload.upi_qr_code_url = editUpiQrCodeUrl.trim();
        payload.gstin = editGstin.trim().toUpperCase();
      } else if (activeStep.key === 'operations') {
        payload.checkin_time = editCheckinTime;
        payload.checkout_time = editCheckoutTime;
        payload.walk_in_table_count = editWalkInTableCount;
        if (!isMultiKey) payload.default_tariff = editDefaultTariff;
      } else if (activeStep.key === 'notes') {
        payload.instructions = editInstructions;
      }

      if (publish) {
        payload.status = 'active';
        payload.onboarding_completed = 1;
      }

      if (Object.keys(payload).length > 1) {
        const res = await fetch('/php/api/router.php?action=update_property', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.message || 'Failed to save');
          setSaving(false);
          return false;
        }
      }

      return true;
    } catch (err: any) {
      setError(err?.message || 'Network error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await persistCurrentStep(false);
    if (!ok) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const handleSkip = () => {
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  };

  const handleSaveAndExit = async () => {
    await persistCurrentStep(false);
    onSaved();
    handleClose();
  };

  const handleFinish = async () => {
    const ok = await persistCurrentStep(true);
    if (!ok) return;
    setFinished(true);
    showToast('Setup complete! Property is now ready.', { type: 'success' });
    onSaved();
    handleClose();
  };

  const handleDoItLater = () => {
    setShowDoItLaterModal(true);
  };

  const confirmDoItLater = () => {
    if (propertyId) snoozeSetupWizard(propertyId);
    setShowDoItLaterModal(false);
    handleClose();
  };

  // If in setup mode and fully completed, don't show the persistent banner
  if (!isCreateMode && setupComplete && !isDrawerOpen) {
    return null;
  }

  return (
    <FieldHelpModeProvider>
      <>
        {/* Persistent top/bottom strip in setup mode */}
        {!isCreateMode && !isDrawerOpen && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                  Finish Property Setup ({stepsDone} of {totalSteps} steps done)
                </h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  Complete rates, check-in times, and payment details to make your property ready.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setInternalIsOpen(true)}
              leftIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Resume Setup
            </Button>
          </div>
        )}

        {/* Main Wizard Drawer */}
        <Drawer
          open={isDrawerOpen}
          onClose={handleClose}
          position="right"
          className="z-80 w-full sm:max-w-xl md:max-w-2xl h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {isCreateMode
                    ? existingProperty
                      ? `Resume Property Setup (${existingProperty.name})`
                      : 'Create New Property'
                    : `Set Up ${initialName || 'Property'}`}
                </h2>
                <p className="text-2xs text-gray-500 dark:text-gray-400">
                  Step {stepIndex + 1} of {steps.length} &middot; {activeStep.label}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors shrink-0"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stepper Navigation */}
          <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-850 shrink-0 overflow-x-auto">
            <ol className="flex items-center justify-between gap-1 w-full min-w-[320px]">
              {steps.map((step, idx) => {
                const isCurrent = idx === stepIndex;
                const isComplete = step.isDone;
                const Icon = step.icon;
                return (
                  <li
                    key={step.key}
                    onClick={() => {
                      if (idx < stepIndex || step0Valid) setStepIndex(idx);
                    }}
                    className={`flex items-center gap-1.5 cursor-pointer select-none text-2xs font-semibold ${
                      isCurrent
                        ? 'text-blue-600 dark:text-blue-400'
                        : isComplete
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
                        isCurrent
                          ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:border-blue-500 dark:text-blue-400'
                          : isComplete
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:border-emerald-500 dark:text-emerald-400'
                          : 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800'
                      }`}
                    >
                      {isComplete && !isCurrent ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                    </div>
                    <span className="hidden md:inline truncate max-w-[60px]">{step.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* STEP 0: BASICS */}
            {activeStep.key === 'basics' && (
              <div className="space-y-4">
                {isCreateMode && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-gray-900 dark:text-white">
                      Property Structure
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditPropertyType('SINGLE_UNIT');
                          setEditRoomCount(1);
                        }}
                        className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${
                          editPropertyType === 'SINGLE_UNIT'
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 dark:border-blue-500'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <Home className="w-5 h-5 text-blue-600 mb-1" />
                        <div className="text-xs font-bold text-slate-900 dark:text-white">Single Unit</div>
                        <div className="text-2xs text-slate-500">Villa, apartment, or entire homestay</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditPropertyType('MULTI_KEY')}
                        className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${
                          editPropertyType === 'MULTI_KEY'
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 dark:border-blue-500'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <Hotel className="w-5 h-5 text-indigo-600 mb-1" />
                        <div className="text-xs font-bold text-slate-900 dark:text-white">Multi-Unit / Resort</div>
                        <div className="text-2xs text-slate-500">Resort, hotel, or multiple rooms</div>
                      </button>
                    </div>

                    {editPropertyType === 'MULTI_KEY' && (
                      <Input
                        type="number"
                        min="1"
                        label="Number of Rooms / Units"
                        value={editRoomCount}
                        onChange={(e) => setEditRoomCount(Math.max(1, Number(e.target.value) || 1))}
                        placeholder="e.g. 5"
                      />
                    )}

                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2.5">
                        <ChefHat className="w-4 h-4 text-amber-500" />
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">
                            Has Kitchen / Restaurant
                          </div>
                          <div className="text-2xs text-slate-500">Enable food menu &amp; KOT orders</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={editHasKitchen}
                        onChange={(e) => setEditHasKitchen(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                <Input
                  label={isMultiKey ? 'Parent Property Name' : 'Property Name'}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={!isCreateMode}
                  helperText={
                    !isCreateMode
                      ? "Can't be renamed here - use Edit Property in the sidebar instead."
                      : undefined
                  }
                  placeholder="e.g. Whispering Palms Resort"
                />

                <Input
                  label="Address"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  onBlur={() => setEditAddressTouched(true)}
                  error={editAddressTouched && !editAddress.trim() ? 'This field is required' : undefined}
                  placeholder="Full property address"
                />

                <Input
                  label="Google Maps Link (optional)"
                  value={editMapsLink}
                  onChange={(e) => setEditMapsLink(e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                />
              </div>
            )}

            {/* STEP 1: LISTINGS (AIRBNB IMPORT) */}
            {activeStep.key === 'listings' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Import your listings</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Optional. Connecting Airbnb pulls your real check-in times, fees, capacity, bed
                    layout, amenities and base price straight from the listing. Nothing is sent to Airbnb &mdash; this
                    only reads.
                  </p>
                </div>

                {propertyId ? (
                  <AirbnbListingPicker
                    propertyId={propertyId}
                    selectedIds={selectedListingIds}
                    onSelectionChange={setSelectedListingIds}
                    onConnectionChange={setAirbnbConnected}
                  />
                ) : (
                  <p className="text-xs text-gray-500">Save basics first to enable listing import.</p>
                )}

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
                    >
                      {importing
                        ? 'Importing...'
                        : `Import ${selectedListingIds.length || ''} selected listing${
                            selectedListingIds.length === 1 ? '' : 's'
                          }`}
                    </Button>
                  )
                )}
              </div>
            )}

            {/* STEP 2: CONTACT & TAX */}
            {activeStep.key === 'contact' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All optional - skip if you'd rather add these later.
                </p>
                <Input
                  type="email"
                  label="Email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="info@example.com"
                />
                <Input
                  type="tel"
                  label={isMultiKey ? 'Parent Property Phone Number' : 'Property Phone Number'}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter 10-digit mobile number"
                  helperText="This is the phone number guests will be shown to contact the property."
                />
              </div>
            )}

            {/* STEP 3: PAYMENTS */}
            {activeStep.key === 'payments' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All optional - skip if you'd rather add these later.
                </p>
                <Input
                  label="GSTIN (optional)"
                  value={editGstin}
                  onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                  placeholder="27ABCDE1234F1Z5"
                  helperText="Printed on GST tax invoices at checkout."
                />
                <Input
                  label="UPI ID (optional)"
                  value={editUpiId}
                  onChange={(e) => setEditUpiId(e.target.value)}
                  placeholder="yourproperty@okicici"
                  error={
                    editUpiId.trim() && !isValidUpiIdSyntax(editUpiId)
                      ? 'Enter a valid UPI ID, e.g. name@bank'
                      : undefined
                  }
                  success={editUpiId.trim() && isValidUpiIdSyntax(editUpiId) ? 'Valid UPI ID format' : undefined}
                  helperText="A scannable UPI QR code (generated automatically from this ID) is included in booking messages."
                />
                {editUpiId.trim() && isValidUpiIdSyntax(editUpiId) && (
                  <UpiPaymentBlock
                    upiId={editUpiId.trim()}
                    payeeName={editName || 'Resort'}
                    qrCodeImageUrl={editUpiQrCodeUrl}
                  />
                )}
              </div>
            )}

            {/* STEP 4A: OPERATIONS (SINGLE UNIT) */}
            {activeStep.key === 'operations' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sensible defaults are already filled in - change only what's different for you.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="time"
                    label="Check-in Time"
                    value={editCheckinTime}
                    onChange={(e) => setEditCheckinTime(e.target.value)}
                  />
                  <Input
                    type="time"
                    label="Check-out Time"
                    value={editCheckoutTime}
                    onChange={(e) => setEditCheckoutTime(e.target.value)}
                  />
                </div>
                {!isMultiKey && (
                  <Input
                    type="number"
                    label="Default Tariff / Night (₹, optional)"
                    value={editDefaultTariff}
                    onChange={(e) => setEditDefaultTariff(e.target.value)}
                    placeholder="e.g. 2000"
                    helperText="Pre-fills the rate when creating a new booking - still editable per booking."
                  />
                )}
                {editHasKitchen && (
                  <Input
                    type="number"
                    min="0"
                    label="Walk-in Tables Count (optional)"
                    value={editWalkInTableCount}
                    onChange={(e) => setEditWalkInTableCount(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="e.g. 8"
                    helperText="Number of restaurant/diner tables for walk-in tabs."
                  />
                )}
              </div>
            )}

            {/* STEP 4B: ROOMS (MULTI-KEY) */}
            {activeStep.key === 'rooms' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This property is a building with {roomReadiness.length || 'no'} unit
                  {roomReadiness.length === 1 ? '' : 's'}. Each one carries its own rate, capacity and times.
                </p>

                {roomReadiness.length === 0 ? (
                  <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      No units yet. Import listings above or add rooms from Edit Property.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                    {roomReadiness.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{r.name}</div>
                          {r.description || (r.defaultTariff && r.defaultTariff > 0) ? (
                            <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400">
                              {r.defaultTariff && r.defaultTariff > 0 ? (
                                <span className="shrink-0 font-medium">₹{r.defaultTariff}/night</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        {r.missing.length === 0 ? (
                          <span className="flex shrink-0 items-center gap-1 text-2xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                          </span>
                        ) : (
                          <span className="shrink-0 text-2xs font-medium text-amber-600 dark:text-amber-400">
                            needs {r.missing.join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 5A: NOTES (CREATE MODE) */}
            {activeStep.key === 'notes' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                    Other Notes (optional)
                  </label>
                  <Textarea
                    value={editInstructions}
                    onChange={(e) => setEditInstructions(e.target.value)}
                    placeholder="e.g. How to reach, check-in instructions, parking notes…"
                    rows={4}
                  />
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 m-0">Ready to go live</p>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 m-0">
                    "{editName || 'This property'}" will become fully active once you finish - guests can be booked in
                    immediately.
                  </p>
                </div>
              </div>
            )}

            {/* STEP 5B: APP (SETUP MODE) */}
            {activeStep.key === 'app' && (
              <div className="space-y-3">
                <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center shrink-0">
                      <img src="/app-icons/icon-source.png" alt="GroundCode" className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-200 m-0">
                        Add GroundCode to Your Phone
                      </h4>
                      <p className="text-2xs text-indigo-800/80 dark:text-indigo-300/80 m-0">
                        Run your property from your home screen with 1 tap.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  {installPlatform === 'ios' ? (
                    <>
                      <div className="flex items-center gap-2 font-semibold text-xs text-gray-900 dark:text-white mb-2">
                        <Apple className="w-4 h-4 text-slate-700 dark:text-slate-300" /> On iPhone or iPad (Safari):
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 text-2xs text-gray-600 dark:text-gray-300">
                        <li>
                          Tap <Share className="w-3 h-3 inline text-blue-600 mx-0.5" /> <strong>Share</strong> in
                          Safari's toolbar
                        </li>
                        <li>
                          Scroll down and tap <PlusSquare className="w-3 h-3 inline text-blue-600 mx-0.5" />{' '}
                          <strong>Add to Home Screen</strong>
                        </li>
                        <li>
                          Tap <strong>Add</strong> to confirm
                        </li>
                      </ol>
                    </>
                  ) : installPlatform === 'android' ? (
                    <>
                      <div className="flex items-center gap-2 font-semibold text-xs text-gray-900 dark:text-white mb-2">
                        <Smartphone className="w-4 h-4 text-slate-700 dark:text-slate-300" /> On Android (Chrome):
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 text-2xs text-gray-600 dark:text-gray-300">
                        <li>
                          Tap <MoreVertical className="w-3 h-3 inline text-blue-600 mx-0.5" /> <strong>3 Dots</strong>{' '}
                          in Chrome's top-right corner
                        </li>
                        <li>
                          Tap <strong>Install App</strong> or <strong>Add to Home screen</strong>
                        </li>
                        <li>
                          Tap <strong>Install</strong> to confirm
                        </li>
                      </ol>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 font-semibold text-xs text-gray-900 dark:text-white mb-2">
                        <Monitor className="w-4 h-4 text-slate-700 dark:text-slate-300" /> On desktop (Chrome or Edge):
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 text-2xs text-gray-600 dark:text-gray-300">
                        <li>
                          Click the <Download className="w-3 h-3 inline text-blue-600 mx-0.5" /> <strong>Install</strong>{' '}
                          icon at the right of the address bar
                        </li>
                        <li>
                          Or open <MoreVertical className="w-3 h-3 inline text-blue-600 mx-0.5" /> the browser menu and
                          choose <strong>Install GroundCode</strong>
                        </li>
                        <li>
                          Click <strong>Install</strong> to confirm
                        </li>
                      </ol>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-2xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Your property details, rates, and payments are configured! Click <strong>Finish Setup</strong> below
                    to start managing.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-850 shrink-0 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2">
              {stepIndex > 0 && !finished && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleBack}
                  disabled={saving}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                >
                  Back
                </Button>
              )}

              {!isCreateMode && !finished && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleDoItLater}
                  disabled={saving}
                >
                  Do It Later
                </Button>
              )}

              {stepIndex > 0 && !isLastStep && !finished && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveAndExit}
                  disabled={saving}
                >
                  Save &amp; Exit
                </Button>
              )}
            </div>

            {!finished && (
              <div className="flex items-center gap-2">
                {stepIndex > 0 && !isLastStep && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleSkip}
                    disabled={saving}
                  >
                    Skip
                  </Button>
                )}
                {isLastStep ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleFinish}
                    disabled={saving}
                    leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  >
                    <span>{isCreateMode ? 'Publish Property' : 'Finish Setup'}</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleNext}
                    disabled={saving || (stepIndex === 0 && !step0Valid)}
                    leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                    rightIcon={!saving ? <ArrowRight className="w-3.5 h-3.5" /> : undefined}
                  >
                    <span>Next Step</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </Drawer>

        {/* Do It Later Modal */}
        <Modal
          show={showDoItLaterModal}
          size="md"
          popup
          onClose={() => setShowDoItLaterModal(false)}
          className="z-9999"
        >
          <div className="p-5 text-center bg-white dark:bg-gray-800 rounded-lg">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto mb-3 text-amber-600 dark:text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Setup Paused</h3>
            <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 mb-5 text-left bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 font-bold">•</span>
                <span>We will remind you again in 6 hours.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-500 font-bold">•</span>
                <span>Your property is not fully bookable yet.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-500 font-bold">•</span>
                <span>Guests cannot view rates or pay online.</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowDoItLaterModal(false)}>
                Keep Setting Up
              </Button>
              <Button variant="primary" size="sm" onClick={confirmDoItLater}>
                Got It (Remind in 6 hrs)
              </Button>
            </div>
          </div>
        </Modal>
      </>
    </FieldHelpModeProvider>
  );
};
