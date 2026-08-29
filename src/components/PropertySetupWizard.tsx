import React, { useState } from 'react';
import { Drawer } from 'flowbite-react';
import {
  Home, Phone, Wallet, Clock, FileText,
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, ClipboardList, X, AlertCircle,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { UpiPaymentBlock, isValidUpiIdSyntax } from '../utils/upiQrCode';
import { t } from '../i18n/en';

/**
 * Restyled 26 Aug 2026 (explicit request: "this property wizard should now
 * replicate what we did on property owner dashboard") to match
 * PropertyCreationWizard.tsx's visual language, its exact 5-step set
 * (Basics/Contact & Tax/Payments/Operations/Notes & Finish - replacing the
 * previous, unrelated Address/Team/Units concept), AND its exact footer
 * button set/behavior (Back / Save & Exit / Skip / Next Step / Finish Setup -
 * explicit follow-up: "it should have exactly same buttons... exactly same
 * UI"). A property created via PropertyCreationWizard only requires step 0
 * (Basics) to publish; steps 1-4 are explicitly skippable there - this
 * checklist is the same 5 steps surfaced again on the property's own
 * dashboard afterward, so whatever got skipped at creation still gets a
 * nudge to come back and fill in, using the identical linear flow.
 *
 * Team/Units nudges from the old version are gone (explicit product
 * decision, 26 Aug 2026: "same number of steps... which were shown while
 * creating the property" - creation has no such steps, so this checklist no
 * longer does either).
 *
 * Saves call update_property directly and reload on success - same
 * established pattern EditPropertyPage.tsx already uses for these exact same
 * fields (onSaved={() => window.location.reload()}).
 */

interface PropertySetupWizardProps {
  propertyId: number;
  propertyType?: string;
  name: string;
  address: string;
  googleMapsLink: string;
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
  /** Called after any step saves successfully - reloads to pick up fresh data everywhere. */
  onSaved: () => void;
}

type StepKey = 'basics' | 'contact' | 'payments' | 'operations' | 'notes';

const STEP_DEFS: { key: StepKey; label: string; icon: React.ElementType }[] = [
  { key: 'basics', label: 'Basics', icon: Home },
  { key: 'contact', label: 'Contact', icon: Phone },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'operations', label: 'Operations', icon: Clock },
  { key: 'notes', label: 'Notes', icon: FileText },
];

// "Do it later" (added 27 Aug 2026, explicit request): the drawer used to auto-reopen on
// every single page load/navigation with no way to say "not now, but don't nag me again
// today" - only the X/Save & Exit, which just collapse it to the slim strip for the rest of
// THIS component instance's lifetime, not across a reload. Scoped per-property (not global)
// since a multi-property tenant could have one property mid-setup and another finished.
const SETUP_WIZARD_SNOOZE_KEY_PREFIX = 'ground_code_setup_wizard_snoozed_until_';
const SETUP_WIZARD_SNOOZE_MS = 24 * 60 * 60 * 1000;

function isSetupWizardSnoozed(propertyId: number): boolean {
  try {
    const raw = localStorage.getItem(`${SETUP_WIZARD_SNOOZE_KEY_PREFIX}${propertyId}`);
    return raw !== null && Date.now() < Number(raw);
  } catch {
    return false;
  }
}

function snoozeSetupWizard(propertyId: number): void {
  try {
    localStorage.setItem(`${SETUP_WIZARD_SNOOZE_KEY_PREFIX}${propertyId}`, String(Date.now() + SETUP_WIZARD_SNOOZE_MS));
  } catch {}
}

export const PropertySetupWizard: React.FC<PropertySetupWizardProps> = ({
  propertyId,
  propertyType,
  name,
  address,
  googleMapsLink,
  email = '',
  phone = '',
  gstin = '',
  upiId = '',
  upiQrCodeUrl = '',
  checkinTime = '14:00',
  checkoutTime = '11:00',
  defaultTariff,
  walkInTableCount,
  instructions = '',
  onSaved,
}) => {
  const isMultiKey = propertyType === 'MULTI_KEY';

  // Open by default (auto-surfaces the checklist the moment a property with
  // incomplete setup loads) - dismissible via the Drawer's own X, at which
  // point the slim strip below takes over as the way back in. Starts closed
  // instead if "Do it later" was chosen within the last 24h (see
  // snoozeSetupWizard above) - the slim strip still renders either way, so
  // there's still a quiet way back in, it just won't force itself open.
  const [isOpen, setIsOpen] = useState(() => !isSetupWizardSnoozed(propertyId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  // --- Local editable copies, one per step (mirrors PropertyCreationWizard) ---
  const [editAddress, setEditAddress] = useState(address);
  const [editAddressTouched, setEditAddressTouched] = useState(false);
  const [editMapsLink, setEditMapsLink] = useState(googleMapsLink);
  const [editEmail, setEditEmail] = useState(email);
  const [editPhone, setEditPhone] = useState(phone);
  const [editGstin, setEditGstin] = useState(gstin);
  const [editUpiId, setEditUpiId] = useState(upiId);
  const [editCheckinTime, setEditCheckinTime] = useState(checkinTime);
  const [editCheckoutTime, setEditCheckoutTime] = useState(checkoutTime);
  const [editDefaultTariff, setEditDefaultTariff] = useState(defaultTariff != null ? String(defaultTariff) : '');
  const [editWalkInTableCount, setEditWalkInTableCount] = useState(walkInTableCount != null ? String(walkInTableCount) : '10');
  const [editInstructions, setEditInstructions] = useState(instructions);

  const basicsDone = !!name.trim() && (!!editAddress.trim() || !!address.trim());
  const contactDone = !!(editEmail.trim() || editPhone.trim() || email.trim() || phone.trim());
  const paymentsDone = !!(editUpiId.trim() || editGstin.trim() || upiId.trim() || upiQrCodeUrl.trim() || gstin.trim());
  const operationsDone = isMultiKey || !!editCheckinTime || !!checkinTime || (editDefaultTariff.trim() !== '') || (defaultTariff != null && String(defaultTariff).trim() !== '');
  const notesDone = !!(editInstructions.trim() || instructions.trim());

  const doneMap: Record<StepKey, boolean> = {
    basics: basicsDone,
    contact: contactDone,
    payments: paymentsDone,
    operations: operationsDone,
    notes: notesDone,
  };

  const steps = STEP_DEFS.map((s) => ({ ...s, isDone: doneMap[s.key] }));
  const totalSteps = steps.length;
  const stepsDone = steps.filter((s) => s.isDone).length;

  const firstIncompleteIndex = Math.max(steps.findIndex((s) => !s.isDone), 0);
  const [stepIndex, setStepIndex] = useState(firstIncompleteIndex);
  const activeStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const step0Valid = !!editAddress.trim();

  // If setup is already complete, return null IMMEDIATELY - no skeleton flash!
  if (stepsDone === totalSteps) return null;

  /** Persists whatever the CURRENT step holds. Returns true on success. */
  const persistCurrentStep = async (): Promise<boolean> => {
    setError(null);
    if (activeStep.key === 'payments' && editUpiId.trim() && !isValidUpiIdSyntax(editUpiId)) {
      setError('Enter a valid UPI ID, e.g. name@bank');
      return false;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> =
        activeStep.key === 'basics'
          ? { address: editAddress.trim(), google_maps_link: editMapsLink.trim() }
          : activeStep.key === 'contact'
          ? { email: editEmail.trim(), phone: editPhone.trim() }
          : activeStep.key === 'payments'
          ? { upi_id: editUpiId.trim(), gstin: editGstin.trim() }
          : activeStep.key === 'operations'
          ? {
              checkin_time: editCheckinTime,
              checkout_time: editCheckoutTime,
              walk_in_table_count: editWalkInTableCount,
              ...(isMultiKey ? {} : { default_tariff: editDefaultTariff }),
            }
          : { instructions: editInstructions };

      const res = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, ...payload }),
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
    const ok = await persistCurrentStep();
    if (ok) setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const handleSkip = () => {
    // Purely optional steps (1-3) can be skipped without even attempting a save of empty fields.
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const handleBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  // Clickable stepper circles (per DESIGN.md "Wizard / Setup Stepper"). Forward
  // jumps persist the current step and apply the same first-step gate as "Next
  // Step", but never validate/save/auto-fill the steps skipped over - those just
  // render in the existing amber "passed but incomplete" state via the position-
  // based logic below. Backward jumps are a plain move, matching handleBack.
  const handleStepClick = async (idx: number) => {
    if (saving || finished || idx === stepIndex) return;
    if (idx < stepIndex) {
      setError(null);
      setStepIndex(idx);
      return;
    }
    if (stepIndex === 0 && !step0Valid) {
      setError('Add the property address before moving on.');
      return;
    }
    const ok = await persistCurrentStep();
    if (ok) setStepIndex(idx);
  };

  // Dismisses without saving (unlike Save & Exit) and suppresses the drawer's auto-open for
  // 24h - a "not now" for the whole checklist, not just the current step (that's Skip's job).
  const handleDoItLater = () => {
    snoozeSetupWizard(propertyId);
    setIsOpen(false);
  };

  const handleSaveAndExit = async () => {
    const ok = await persistCurrentStep();
    if (ok) {
      onSaved();
      setIsOpen(false);
    }
  };

  const handleFinish = async () => {
    const ok = await persistCurrentStep();
    if (ok) {
      setFinished(true);
      setTimeout(() => {
        onSaved();
        setIsOpen(false);
      }, 1200);
    }
  };

  if (!isOpen) {
    // Full-bleed notice bar (26 Aug 2026: "there should be a notice in top of
    // the site") - edge-to-edge, no rounded corners/margin, sits directly
    // under the fixed header as a site-wide notice rather than an inset card
    // mixed among regular page content (see its render site in App.tsx).
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-left cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors shrink-0"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
          <ClipboardList className="w-4 h-4 shrink-0" />
          {t('finish_setup_property_heading', 'Finish Setting Up This Property')}
          <span className="font-normal text-amber-700 dark:text-amber-400">
            ({stepsDone} {t('setup_steps_done_of_prefix', 'of')} {totalSteps} {t('setup_steps_done_suffix', 'steps done')})
          </span>
        </span>
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1 shrink-0">
          {t('continue_setup_button', 'Continue Setup')} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  }

  return (
    <Drawer
      open={isOpen}
      onClose={() => setIsOpen(false)}
      position="right"
      className="z-58 w-full sm:w-140 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between property-setup-wizard"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div>
            <h2 className="property-setup-wizard__title text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('finish_setup_property_heading', 'Finish Setting Up This Property')}
            </h2>
            <p className="text-2xs text-slate-500 dark:text-slate-400 m-0">
              {stepsDone} {t('setup_steps_done_of_prefix', 'of')} {totalSteps} {t('setup_steps_done_suffix', 'steps done')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Timeline stepper - identical shape and identical 5 steps to PropertyCreationWizard's.
          Each circle is a clickable button that jumps to its step (see handleStepClick and
          DESIGN.md's "Wizard / Setup Stepper" rule) - the footer Back/Next buttons still work
          too. Step status stays purely position-based (idx vs stepIndex) + each step's isDone. */}
      <div className="px-4 pt-3 pb-7 border-b border-gray-200 dark:border-gray-700 overflow-x-auto shrink-0">
        <ol className="flex items-center w-full">
          {steps.map((step, idx) => {
            const StepIcon = step.icon;
            const isStepComplete = step.isDone;
            const isCurrent = idx === stepIndex && !finished;
            const isPassedOrVisited = idx < stepIndex || (idx === stepIndex && finished);
            const isPassedIncomplete = isPassedOrVisited && !isStepComplete;
            const isFullyComplete = isStepComplete && (idx !== stepIndex || finished);
            const isLast = idx === steps.length - 1;

            return (
              <li key={step.key} className={`flex items-center ${!isLast ? 'flex-1' : ''}`}>
                <div className="relative flex items-center justify-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStepClick(idx)}
                    disabled={saving || finished}
                    aria-label={`Go to ${step.label} step`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all cursor-pointer disabled:cursor-default ${
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
                  </button>
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
                      steps[idx].isDone && idx < stepIndex
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
            {error}
          </div>
        )}

        {activeStep.key === 'basics' && (
          <div className="space-y-4">
            <Input
              label="Property Name"
              value={name}
              disabled
              helperText="Can't be renamed here - use Edit Property in the sidebar instead."
            />
            <Input
              label="Address"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              onBlur={() => setEditAddressTouched(true)}
              error={editAddressTouched && !editAddress.trim() ? 'This field is required' : undefined}
              placeholder="Full property address"
            />
            <Input label="Google Maps Link (optional)" value={editMapsLink} onChange={(e) => setEditMapsLink(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
          </div>
        )}

        {activeStep.key === 'contact' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">All optional - skip if you'd rather add these later.</p>
            <Input type="email" label="Email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="info@example.com" />
            <Input
              type="tel"
              label="Property Phone Number"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
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
              error={editUpiId.trim() && !isValidUpiIdSyntax(editUpiId) ? 'Enter a valid UPI ID, e.g. name@bank' : undefined}
              success={editUpiId.trim() && isValidUpiIdSyntax(editUpiId) ? 'Valid UPI ID format' : undefined}
              helperText="A scannable UPI QR code (generated automatically from this ID) and the ID itself are added to booking/bill messages shared over WhatsApp."
            />
            {editUpiId.trim() && isValidUpiIdSyntax(editUpiId) && (
              <UpiPaymentBlock upiId={editUpiId.trim()} payeeName={name} qrCodeImageUrl={upiQrCodeUrl} />
            )}
          </div>
        )}

        {activeStep.key === 'operations' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Sensible defaults are already filled in - change only what's different for you.</p>
            <div className="grid grid-cols-2 gap-4">
              <Input type="time" label="Check-in Time" value={editCheckinTime} onChange={(e) => setEditCheckinTime(e.target.value)} />
              <Input type="time" label="Check-out Time" value={editCheckoutTime} onChange={(e) => setEditCheckoutTime(e.target.value)} />
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
            <Input
              type="number"
              min={1}
              max={200}
              label="Number of Tables (Walk-in Orders)"
              value={editWalkInTableCount}
              onChange={(e) => setEditWalkInTableCount(e.target.value)}
              placeholder="10"
            />
          </div>
        )}

        {activeStep.key === 'notes' && (
          <div className="space-y-4">
            {finished ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Setup saved!</p>
              </div>
            ) : (
              <Textarea
                label="Other Notes (optional)"
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                placeholder="e.g. How to reach, check-in instructions, parking notes…"
                rows={4}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer - exact same button set/behavior as PropertyCreationWizard's:
          Back / Save & Exit on the left, Skip / Next Step / Finish Setup on the right. "Do it
          later" (added 27 Aug 2026) sits alongside them unconditionally - unlike Skip (which
          only advances past the current step) it dismisses the whole checklist and snoozes
          its auto-open for 24h, so it needs to be reachable from step 0 too, not just once
          Back/Save & Exit are already showing. */}
      {/* pb-[calc(1rem+env(safe-area-inset-bottom))] per DESIGN.md's "Bottom-Anchored Drawer
          Footer Safe Area" rule - this footer is a shrink-0 child pinned to the drawer's
          physical bottom edge, so on a home-indicator device a plain p-4 leaves the primary
          action button with zero breathing room. Mirrors SelfOnboardingWizard.tsx's footer. */}
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-850 shrink-0">
        <div className="flex items-center gap-2">
          {stepIndex > 0 && !finished && (
            <Button type="button" variant="secondary" size="sm" onClick={handleBack} disabled={saving}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
          )}
          {stepIndex > 0 && !isLastStep && !finished && (
            <Button type="button" variant="secondary" size="sm" onClick={handleSaveAndExit} disabled={saving}>
              Save &amp; Exit
            </Button>
          )}
          {!finished && (
            <Button type="button" variant="link" size="sm" onClick={handleDoItLater} disabled={saving}>
              Do it later
            </Button>
          )}
        </div>

        {!finished && (
          <div className="flex items-center gap-2">
            {stepIndex > 0 && !isLastStep && (
              <Button type="button" variant="secondary" size="sm" onClick={handleSkip} disabled={saving}>
                Skip
              </Button>
            )}
            {isLastStep ? (
              <Button type="button" variant="primary" size="sm" onClick={handleFinish} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span className="ml-1.5">Finish Setup</span>
              </Button>
            ) : (
              <Button type="button" variant="primary" size="sm" onClick={handleNext} disabled={saving || (stepIndex === 0 && !step0Valid)}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span className={saving ? 'ml-1.5' : ''}>Next Step: {steps[stepIndex + 1]?.label}</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
};
