import React, { useState } from 'react';
import { Progress } from 'flowbite-react';
import { MapPin, Users, DoorOpen, CheckCircle2, ArrowRight, Loader2 } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
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

  const step1Done = !!address.trim();
  const step2Done = staffCount >= 1; // 1 user (owner) or more staff members
  const step3Done = (roomCount ?? 0) > 0;

  // Initial active step index: first incomplete step (0: Address, 1: Staff, 2: Units)
  const firstIncompleteIndex = !step1Done ? 0 : !step2Done ? 1 : 2;
  const [activeStepIndex, setActiveStepIndex] = useState<number>(firstIncompleteIndex);

  // If setup is already complete, return null IMMEDIATELY - no skeleton flash!
  if (step1Done && step2Done && (!showRoomsStep || step3Done)) return null;

  if (isStaffLoading) return null;

  const applicableSteps = showRoomsStep ? [step1Done, step2Done, step3Done] : [step1Done, step2Done];
  const totalSteps = applicableSteps.length;
  const stepsDone = applicableSteps.filter(Boolean).length;

  const handleSaveLocation = async () => {
    setIsSavingLocation(true);
    try {
      const ok = await onSaveLocation(editAddress, editMapsLink);
      if (ok && activeStepIndex === 0) {
        setActiveStepIndex(1);
      }
    } finally {
      setIsSavingLocation(false);
    }
  };

  const steps = [
    {
      id: 0,
      title: t('add_property_address_heading', 'Add Property Address'),
      shortLabel: 'Address',
      icon: MapPin,
      isDone: step1Done,
    },
    {
      id: 1,
      title: t('add_team_member_heading', 'Add Team Member'),
      shortLabel: 'Team',
      icon: Users,
      isDone: step2Done,
    },
    ...(showRoomsStep
      ? [
          {
            id: 2,
            title: t('create_first_unit_heading', 'Create First Unit'),
            shortLabel: 'Units',
            icon: DoorOpen,
            isDone: step3Done,
          },
        ]
      : []),
  ];

  const activeStep = steps.find((s) => s.id === activeStepIndex) || steps[0];

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 shadow-xs overflow-hidden property-setup-wizard transition-all duration-300 animate-in fade-in mb-6">
      {/* Top Header Bar */}
      <div className="px-5 py-3.5 bg-amber-100 dark:bg-amber-900/50 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between">
        <div>
          <h2 className="property-setup-wizard__title text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
            {t('finish_setup_property_heading', 'Finish Setting Up This Property')}
          </h2>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
            {stepsDone} {t('setup_steps_done_of_prefix', 'of')} {totalSteps} {t('setup_steps_done_suffix', 'steps done')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-28 sm:w-32">
            <Progress progress={Math.round((stepsDone / totalSteps) * 100)} color="yellow" size="sm" />
          </div>
        </div>
      </div>

      {/* Flowbite Progress Stepper Bar (https://flowbite.com/docs/components/stepper/#progress-stepper) */}
      <div className="p-4 bg-amber-100/40 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 overflow-x-auto">
        <ol className="flex items-center w-full text-xs font-medium text-center text-slate-500 dark:text-slate-400">
          {steps.map((step, idx) => {
            const StepIcon = step.icon;
            const isLast = idx === steps.length - 1;
            const isActive = step.id === activeStep.id;

            return (
              <li
                key={step.id}
                onClick={() => setActiveStepIndex(step.id)}
                className={`flex items-center cursor-pointer ${
                  !isLast
                    ? 'w-full after:content-[\'\'] after:w-full after:h-1.5 after:rounded-full after:inline-block after:mx-2 sm:after:mx-4 ' +
                      (step.isDone
                        ? 'after:bg-emerald-500 dark:after:bg-emerald-600'
                        : 'after:bg-slate-200 dark:after:bg-slate-700')
                    : ''
                }`}
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all ${
                      step.isDone
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-500'
                        : isActive
                        ? 'bg-amber-500 text-white shadow-xs ring-4 ring-amber-200 dark:ring-amber-900/60'
                        : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {step.isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <StepIcon className="w-4 h-4" />
                    )}
                  </span>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      isActive
                        ? 'text-amber-900 dark:text-amber-200'
                        : step.isDone
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {step.shortLabel}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Active Step Panel Content */}
      <div className="p-5 bg-white dark:bg-slate-900">
        {activeStep.id === 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className={`w-4 h-4 ${step1Done ? 'text-emerald-500' : 'text-amber-500'}`} />
                {t('add_property_address_heading', 'Add Property Address')}
              </h3>
              {step1Done && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('property_address_step_description', 'Guests and staff need to know where this property actually is.')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('address_label', 'Address')}
                </label>
                <Input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder={t('full_property_address_placeholder', 'Full property address')}
                />
              </div>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('google_maps_link_optional_label', 'Google Maps Link (optional)')}
                </label>
                <Input
                  type="text"
                  value={editMapsLink}
                  onChange={(e) => setEditMapsLink(e.target.value)}
                  placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveLocation}
                disabled={isSavingLocation || !editAddress.trim()}
                leftIcon={isSavingLocation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              >
                {t('save_address_button', 'Save Address')}
              </Button>
              {!step1Done && !isSavingLocation && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  Save address to continue <ArrowRight className="w-3.5 h-3.5 animate-bounce" />
                </span>
              )}
            </div>
          </div>
        )}

        {activeStep.id === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className={`w-4 h-4 ${step2Done ? 'text-emerald-500' : 'text-amber-500'}`} />
                {t('add_team_member_heading', 'Add at least one team member')}
              </h3>
              {step2Done && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Staff Added
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('add_team_member_description', "You're already registered as Super Admin. Add whoever else will run the front desk, kitchen, or bookings.")}
            </p>

            <div>
              <Button
                variant="primary"
                size="sm"
                onClick={onGoToStaff}
                rightIcon={<ArrowRight className="w-3.5 h-3.5 animate-bounce" />}
              >
                {t('add_staff_button', 'Add Staff')}
              </Button>
            </div>
          </div>
        )}

        {activeStep.id === 2 && showRoomsStep && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <DoorOpen className={`w-4 h-4 ${step3Done ? 'text-emerald-500' : 'text-amber-500'}`} />
                {t('create_first_unit_heading', 'Create your first unit')}
              </h3>
              {step3Done && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Rooms Added
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('create_first_unit_description', 'Rooms, cottages, or suites - whatever you rent out - each become a unit you can take bookings against.')}
            </p>

            <div>
              <Button
                variant="primary"
                size="md"
                onClick={onAddUnit}
                rightIcon={<ArrowRight className="w-4 h-4 animate-bounce" />}
              >
                {t('add_new_unit_button', 'Add New Unit')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
