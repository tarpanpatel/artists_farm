import React from 'react';
import { TodayOverview } from './TodayOverview';
import { Guest } from '../types';
import { PropertyGuestInfo } from '../utils/whatsappVoucherTemplate';
import { Button } from './Button';
import { ArrowLeft, Monitor } from './icons/FlowbiteIcons';

interface CompactCalendarTestPageProps {
  guests: Guest[];
  rooms?: Array<{ id: number; name: string; slug: string; default_tariff?: number }>;
  isMultiKeyProperty?: boolean;
  kitchenModuleEnabled?: boolean;
  onNavigateToRoom?: (roomSlug: string) => void;
  onNavigate?: (tab: any, menuItemKey?: string) => void;
  onAddBooking?: (prefill?: { roomName: string; checkin: string; checkout: string }) => void;
  onAddGuest?: (guest: Guest) => void;
  onUpdateGuest?: (guest: Guest) => void | Promise<void>;
  onDeleteGuest?: (guestId: string) => void | Promise<void>;
  onCheckInGuest?: (guestId: string) => void;
  onGuestVerificationUpdated?: (guestId: string) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  onCheckout?: (guestId: string) => void;
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  propertySecurityDeposit?: number | string | null;
  propertyAddress?: string;
  propertyInstructions?: string;
  propertyGuestInfo?: PropertyGuestInfo;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
  serviceRequests?: any[];
  serviceRequestsAccessAllowed?: boolean;
}

export const CompactCalendarTestPage: React.FC<CompactCalendarTestPageProps> = (props) => {
  const {
    rooms,
    propertyName = '',
    onNavigate,
  } = props;

  // If rooms list is empty (e.g. single-unit property), provide a fallback room
  // so the multi-unit calendar grid renders properly for testing.
  const effectiveRooms = rooms && rooms.length > 0
    ? rooms
    : [{ id: 0, name: propertyName || 'Main Unit', slug: 'main-unit' }];

  const handleReturnToDashboard = () => {
    if (onNavigate) {
      onNavigate('dashboard');
    } else {
      window.location.hash = '#dashboard';
    }
  };

  return (
    <div className="space-y-4">
      {/* Test Prototype Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-800 dark:via-indigo-950/40 dark:to-purple-950/40 border border-blue-200 dark:border-indigo-800 rounded-lg shadow-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-gray-900 dark:text-white">
                🧪 Compact Calendar Test View
              </h2>
              <span className="text-2xs font-semibold px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                1366x768 Laptop Density
              </span>
            </div>
            <p className="text-2xs text-gray-600 dark:text-gray-300 mt-0.5">
              Testing slim 1-line KPI strip and 32px compact room rows so 8+ rooms are visible above the fold without vertical scrolling.
            </p>
          </div>
        </div>
        <div className="shrink-0 self-end sm:self-center">
          <Button
            variant="secondary"
            size="xs"
            onClick={handleReturnToDashboard}
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            className="h-8 text-xs font-medium"
          >
            <span>Return to Standard Dashboard</span>
          </Button>
        </div>
      </div>

      {/* Render Compact TodayOverview */}
      <TodayOverview
        {...props}
        rooms={effectiveRooms}
        isCompactView={true}
      />
    </div>
  );
};
