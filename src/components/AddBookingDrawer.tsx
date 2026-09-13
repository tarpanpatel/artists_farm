import React, { useState, useEffect, useRef } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems } from 'flowbite-react';
import { Calendar, X as CloseIcon } from './icons/FlowbiteIcons';
import { GuestManagement } from './GuestManagement';
import { Guest, BillingReceipt, MenuItem } from '../types';
import { t } from '../i18n/en';
import type { PropertyGuestInfo } from '../utils/whatsappVoucherTemplate';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order?: number;
  is_active?: number;
  default_tariff?: number | null;
  cancellation_policy?: string | null;
}

export interface AddBookingDrawerProps {
  open: boolean;
  onClose: () => void;
  guests: Guest[];
  receipts?: BillingReceipt[];
  menu?: MenuItem[];
  rooms?: Room[];
  isMultiKeyProperty?: boolean;
  selectedRoomSlug?: string | null;
  preSelectRoom?: string;
  preSelectCheckinDate?: string;
  preSelectCheckoutDate?: string;
  onAddGuest: (guest: Guest) => Promise<void>;
  onCheckoutGuest?: (receipt: BillingReceipt) => void;
  onDispatchTelegram?: (
    eventType: string,
    message: string,
    channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin',
    replyMarkup?: any,
    templateKey?: string,
    mediaUrls?: string[],
    deepLinkParams?: Record<string, string | number>
  ) => void;
  propertySecurityDeposit?: number | string | null;
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
  propertyMakeBookingTemplate?: string;
  propertyCancellationPolicy?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  propertyAddress?: string;
  propertyInstructions?: string;
  propertyGuestInfo?: PropertyGuestInfo;
  kitchenModuleEnabled?: boolean;
}

/**
 * Unified Add Booking Drawer
 * Single Source of Truth for the Add Booking drawer across App.tsx,
 * OperationalDashboard.tsx, and BillingCheckout.tsx.
 */
export const AddBookingDrawer: React.FC<AddBookingDrawerProps> = ({
  open,
  onClose,
  guests,
  receipts = [],
  menu = [],
  rooms = [],
  isMultiKeyProperty = false,
  selectedRoomSlug = null,
  preSelectRoom,
  preSelectCheckinDate,
  preSelectCheckoutDate,
  onAddGuest,
  onCheckoutGuest = () => {},
  onDispatchTelegram,
  propertySecurityDeposit,
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  propertyMakeBookingTemplate = '',
  propertyCancellationPolicy = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertyAddress = '',
  propertyInstructions = '',
  propertyGuestInfo,
  kitchenModuleEnabled,
}) => {
  const [isSaved, setIsSaved] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Drawer just opened - start fresh session
      setIsSaved(false);
      setSessionKey((k) => k + 1);
    }
    prevOpenRef.current = open;
  }, [open]);

  const handleClose = () => {
    setIsSaved(false);
    onClose();
  };

  return (
    <FlowbiteDrawer
      open={open}
      onClose={handleClose}
      position="right"
      className="z-60 w-full sm:max-w-lg md:max-w-xl h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Calendar className="w-4 h-4" />
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white m-0">
            {isSaved
              ? t('booking_created_heading', 'Booking Created')
              : t('add_booking_heading', 'Add Booking')}
          </h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors shrink-0"
          aria-label="Close drawer"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <DrawerItems className="flex-1 overflow-y-auto p-4 sm:p-5">
        <GuestManagement
          key={sessionKey}
          propertySecurityDeposit={propertySecurityDeposit}
          guests={guests}
          receipts={receipts}
          menu={menu}
          rooms={rooms}
          preSelectRoom={preSelectRoom}
          preSelectCheckinDate={preSelectCheckinDate}
          preSelectCheckoutDate={preSelectCheckoutDate}
          onSavedStateChange={setIsSaved}
          onAddGuest={async (guest) => {
            await onAddGuest(guest);
          }}
          onCheckoutGuest={onCheckoutGuest}
          onDispatchTelegram={onDispatchTelegram}
          activeMenuItemKey="guest_registration"
          isMultiKeyProperty={isMultiKeyProperty}
          selectedRoomSlug={selectedRoomSlug}
          onClose={handleClose}
          propertyName={propertyName}
          propertyMapsLink={propertyMapsLink}
          propertyPhone={propertyPhone}
          propertyWhatsappTemplate={propertyWhatsappTemplate}
          propertyMakeBookingTemplate={propertyMakeBookingTemplate}
          propertyCancellationPolicy={propertyCancellationPolicy}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
          propertyAddress={propertyAddress}
          propertyInstructions={propertyInstructions}
          propertyGuestInfo={propertyGuestInfo}
          kitchenModuleEnabled={kitchenModuleEnabled}
        />
      </DrawerItems>
    </FlowbiteDrawer>
  );
};
