import React, { useState } from 'react';
import { MapPin, Users, DoorOpen, CheckCircle2, ArrowRight, Loader } from 'lucide-react';

interface PropertySetupWizardProps {
  address: string;
  googleMapsLink: string;
  staffCount: number; // total staff rows for this property, including the tenant's own auto-seeded row
  roomCount: number;
  onSaveLocation: (address: string, googleMapsLink: string) => Promise<boolean>;
  onGoToStaff: () => void;
  onAddUnit: () => void;
}

/**
 * Shown on a multi-key property's dashboard until all three setup steps are
 * satisfied, then renders nothing. Each step is independently checked off
 * and disappears on its own as soon as its condition is met - this isn't a
 * linear wizard you page through, it's a checklist that shrinks as the
 * property actually gets set up.
 */
export const PropertySetupWizard: React.FC<PropertySetupWizardProps> = ({
  address,
  googleMapsLink,
  staffCount,
  roomCount,
  onSaveLocation,
  onGoToStaff,
  onAddUnit,
}) => {
  const [editAddress, setEditAddress] = useState(address);
  const [editMapsLink, setEditMapsLink] = useState(googleMapsLink);
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  const step1Done = !!address.trim();
  // "minimum 1 user excluding the tenant" - the tenant's own auto-seeded row
  // always exists once a property is created, so the real bar is staffCount > 1.
  const step2Done = staffCount > 1;
  const step3Done = roomCount > 0;

  if (step1Done && step2Done && step3Done) return null;

  const stepsDone = [step1Done, step2Done, step3Done].filter(Boolean).length;

  const handleSaveLocation = async () => {
    setIsSavingLocation(true);
    try {
      await onSaveLocation(editAddress, editMapsLink);
    } finally {
      setIsSavingLocation(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-indigo-200 dark:border-indigo-900 shadow-xs overflow-hidden">
      <div className="px-6 py-4 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Finish Setting Up This Property</h2>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{stepsDone} of 3 steps done</p>
        </div>
        <div className="w-32 h-1.5 bg-indigo-100 dark:bg-indigo-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all"
            style={{ width: `${(stepsDone / 3) * 100}%` }}
          />
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Step 1: Address + Maps Link */}
        {!step1Done && (
          <div className="flex gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">1</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                <MapPin className="w-4 h-4 text-indigo-500" /> Add the property address
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Guests and staff need to know where this property actually is.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Address</label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Full property address"
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Google Maps Link (optional)</label>
                  <input
                    type="text"
                    value={editMapsLink}
                    onChange={(e) => setEditMapsLink(e.target.value)}
                    placeholder="https://maps.app.goo.gl/..."
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveLocation}
                disabled={isSavingLocation || !editAddress.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingLocation ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Address
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Users */}
        {!step2Done && (
          <div className="flex gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">2</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                <Users className="w-4 h-4 text-indigo-500" /> Add at least one team member
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                You're already registered as Super Admin. Add whoever else will run the front desk, kitchen, or bookings.
              </p>
              <button
                onClick={onGoToStaff}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                Add Staff <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Units */}
        {!step3Done && (
          <div className="flex gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">3</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                <DoorOpen className="w-4 h-4 text-indigo-500" /> Create your first unit
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Rooms, cottages, or suites - whatever you rent out - each become a unit you can take bookings against.
              </p>
              <button
                onClick={onAddUnit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                Add New Unit <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
