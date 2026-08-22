import React, { useState } from 'react';
import { Progress } from 'flowbite-react';
import { MapPin, Users, DoorOpen, CheckCircle2, ArrowRight, Loader2, X } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
import { Tooltip } from './Tooltip';
import { t } from '../i18n/en';

interface PropertySetupWizardProps {
  address: string;
  googleMapsLink: string;
  staffCount: number; // total staff rows for this property, including the tenant's own auto-seeded row
  isStaffLoading?: boolean;
  showRoomsStep?: boolean;
  roomCount?: number;
  onSaveLocation: (address: string, googleMapsLink: string) => Promise<boolean>;
  onGoToStaff: () => void;
  onAddUnit?: () => void;
}

export const PropertySetupWizard: React.FC<PropertySetupWizardProps> = ({
  address,
  googleMapsLink,
  staffCount,
  isStaffLoading = false,
  showRoomsStep = true,
  roomCount,
  onSaveLocation,
  onGoToStaff,
  onAddUnit,
}) => {
  const [editAddress, setEditAddress] = useState(address);
  const [editMapsLink, setEditMapsLink] = useState(googleMapsLink);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dismissed_property_setup_wizard') === 'true';
    } catch {
      return false;
    }
  });

  if (isDismissed) return null;

  const step1Done = !!address.trim();
  const step2Done = staffCount >= 1; // 1 user (owner) or more staff members
  const step3Done = (roomCount ?? 0) > 0;

  // If setup is already complete, return null IMMEDIATELY - no skeleton flash!
  if (step1Done && step2Done && (!showRoomsStep || step3Done)) return null;

  // While staff is still loading we can't yet tell whether step 2 is done,
  // so step2Done reads false regardless of how long the property has
  // actually had staff. Rendering a skeleton here defaults to "assume
  // incomplete" and flashes it on every load for the common case
  // (an established property that finished setup ages ago) - render
  // nothing instead and let the real wizard pop in only if staff data
  // comes back and setup turns out to genuinely be incomplete.
  if (isStaffLoading) return null;

  const applicableSteps = showRoomsStep ? [step1Done, step2Done, step3Done] : [step1Done, step2Done];
  const totalSteps = applicableSteps.length;
  const stepsDone = applicableSteps.filter(Boolean).length;

  const handleSaveLocation = async () => {
    setIsSavingLocation(true);
    try {
      await onSaveLocation(editAddress, editMapsLink);
    } finally {
      setIsSavingLocation(false);
    }
  };

  // Detailed Stepper (https://flowbite.com/docs/components/stepper/#detailed-stepper):
  // a vertical connected track - numbered/checkmark circle per step, joined by a
  // border-left line, each step's own content to the right. flowbite-react ships no
  // Stepper component (it's plain Flowbite HTML/Tailwind, not a React package export),
  // so this is that markup pattern hand-built with the same circle+ring+connecting-line
  // structure, swapped in for the old 3-card grid.
  const circleBase = 'absolute flex items-center justify-center w-8 h-8 rounded-full -start-4 ring-4 ring-amber-50 dark:ring-amber-950/30 shrink-0';
  const circleDone = `${circleBase} bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300`;
  const circlePending = `${circleBase} bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300`;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 shadow-xs overflow-hidden property-setup-wizard transition-all duration-300 animate-in fade-in">
      <div className="px-5 py-3.5 bg-amber-100 dark:bg-amber-900/50 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between">
        <div>
          <h2 className="property-setup-wizard__title text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">{t('finish_setup_property_heading', 'Finish Setting Up This Property')}</h2>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">{stepsDone} {t('setup_steps_done_of_prefix', 'of')} {totalSteps} {t('setup_steps_done_suffix', 'steps done')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-28 sm:w-32">
            <Progress progress={Math.round((stepsDone / totalSteps) * 100)} color="yellow" size="sm" />
          </div>
          <Tooltip content="Dismiss Setup Banner">
            <button
              type="button"
              onClick={() => {
                try { localStorage.setItem('dismissed_property_setup_wizard', 'true'); } catch {}
                setIsDismissed(true);
              }}
              className="p-1 text-amber-700 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white rounded-lg hover:bg-amber-200/70 dark:hover:bg-amber-800/70 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="p-6">
        <ol className="relative border-s border-amber-200 dark:border-amber-800 ms-4">
          {/* Step 1: Address + Maps Link */}
          <li className="ms-6 pb-8">
            <span className={step1Done ? circleDone : circlePending}>
              {step1Done ? <CheckCircle2 className="w-4 h-4" /> : <span className="font-semibold text-sm">1</span>}
            </span>
            <h3 className="property-setup-wizard__subtitle text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <MapPin className={`w-4 h-4 ${step1Done ? 'text-emerald-500' : 'text-amber-500'}`} /> {t('add_property_address_heading', 'Add the property address')}
            </h3>
            {step1Done ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1.5">{t('address_setup_complete_text', 'Address saved')}</p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('property_address_step_description', 'Guests and staff need to know where this property actually is.')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('address_label', 'Address')}</label>
                    <Input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder={t('full_property_address_placeholder', 'Full property address')}
                    />
                  </div>
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('google_maps_link_optional_label', 'Google Maps Link (optional)')}</label>
                    <Input
                      type="text"
                      value={editMapsLink}
                      onChange={(e) => setEditMapsLink(e.target.value)}
                      placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveLocation}
                    disabled={isSavingLocation || !editAddress.trim()}
                    leftIcon={isSavingLocation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  >
                    {t('save_address_button', 'Save Address')}
                  </Button>
                  {!isSavingLocation && <ArrowRight className="w-4 h-4 text-amber-500 animate-bounce shrink-0" />}
                </div>
              </div>
            )}
          </li>

          {/* Step 2: Users */}
          <li className={`ms-6 ${showRoomsStep ? 'pb-8' : ''}`}>
            <span className={step2Done ? circleDone : circlePending}>
              {step2Done ? <CheckCircle2 className="w-4 h-4" /> : <span className="font-semibold text-sm">2</span>}
            </span>
            <h3 className="property-setup-wizard__subtitle text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Users className={`w-4 h-4 ${step2Done ? 'text-emerald-500' : 'text-amber-500'}`} /> {t('add_team_member_heading', 'Add at least one team member')}
            </h3>
            {step2Done ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1.5">{t('staff_setup_complete_text', 'Staff added')}</p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('add_team_member_description', "You're already registered as Super Admin. Add whoever else will run the front desk, kitchen, or bookings.")}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onGoToStaff}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5 animate-bounce" />}
                >
                  {t('add_staff_button', 'Add Staff')}
                </Button>
              </div>
            )}
          </li>

          {/* Step 3: Units - Multi-Key properties only, see showRoomsStep doc above */}
          {showRoomsStep && (
            <li className="ms-6">
              <span className={step3Done ? circleDone : circlePending}>
                {step3Done ? <CheckCircle2 className="w-4 h-4" /> : <span className="font-semibold text-sm">3</span>}
              </span>
              <h3 className="property-setup-wizard__subtitle text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <DoorOpen className={`w-4 h-4 ${step3Done ? 'text-emerald-500' : 'text-amber-500'}`} /> {t('create_first_unit_heading', 'Create your first unit')}
              </h3>
              {step3Done ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1.5">{t('rooms_setup_complete_text', 'Rooms added')}</p>
              ) : (
                <div className="mt-2 flex flex-col gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('create_first_unit_description', 'Rooms, cottages, or suites - whatever you rent out - each become a unit you can take bookings against.')}
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={onAddUnit}
                    rightIcon={<ArrowRight className="w-4 h-4 animate-bounce" />}
                  >
                    {t('add_new_unit_button', 'Add New Unit')}
                  </Button>
                </div>
              )}
            </li>
          )}
        </ol>
      </div>
    </div>
  );
};
