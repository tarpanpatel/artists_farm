import React, { useState } from 'react';
import { Globe, Loader2, CheckCircle2, Hash } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'flowbite-react';
import { Guest } from '../types';
import { Input } from './Input';
import { DateRangePicker } from './DateRangePicker';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { t } from '../i18n/en';

interface OtaBlockInfo {
  event_start: string;
  event_end: string;
  event_title?: string;
  source?: string;
  source_label?: string;
  external_event_id: string;
}

interface ConvertOtaBookingModalProps {
  otaBlock: OtaBlockInfo;
  // Room name to submit for the add_guest room lookup - only meaningful for a
  // MULTI_KEY_ROOM booking. Leave undefined for a SINGLE property, where the
  // booking has no separate room of its own (mirrors how a normal offline
  // booking on a single property omits room_number too).
  roomNumber?: string;
  // 'YYYY-MM-DD' strings already occupied elsewhere in this room (by other
  // guests or other unclaimed OTA blocks, never this block itself) - same
  // shape BookingDetailsModal's getBlockedDateStrings() feeds DateRangePicker,
  // so adjusting a converted booking's dates gets the same "date already
  // taken" highlighting as every other booking flow in the app.
  blockedDates?: string[];
  onClose: () => void;
  // Bubbles a fully-built Guest up to whichever onAddGuest prop the calling
  // calendar already receives from App.tsx - the same optimistic-create path
  // every offline booking already goes through (see handleAddGuest).
  onConvert: (guest: Guest) => void;
}

const toDateInputValue = (raw: string): string => (raw || '').split(' ')[0].split('T')[0];

export const ConvertOtaBookingModal: React.FC<ConvertOtaBookingModalProps> = ({
  otaBlock,
  roomNumber,
  onClose,
  onConvert,
}) => {
  const sourceLabel = otaBlock.source_label || otaBlock.source || 'external calendar';

  // iCal feeds never carry the guest's real name - SUMMARY is a booking
  // reference/confirmation code (or a privacy placeholder like "Reserved"),
  // never the person's name. Keep it as a read-only reference for staff to
  // cross-check on the OTA's own host dashboard, and leave Guest Name blank
  // for them to fill in once confirmed (usually at check-in).
  const [guestName, setGuestName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [checkin, setCheckin] = useState(toDateInputValue(otaBlock.event_start));
  const [checkout, setCheckout] = useState(toDateInputValue(otaBlock.event_end));
  const [numberOfGuests, setNumberOfGuests] = useState('1');
  const [roomRate, setRoomRate] = useState('0');
  const [isSaving, setIsSaving] = useState(false);

  const handleConvert = () => {
    setIsSaving(true);
    const rate = parseFloat(roomRate) || 0;
    const newGuest: Guest = {
      id: `g-${Date.now()}-${Math.random()}`,
      guestName: guestName.trim() || 'OTA Guest',
      phoneNumber: phoneNumber.trim(),
      checkinDate: checkin,
      expectedCheckout: checkout,
      roomNumber: roomNumber || '',
      status: 'Booked',
      numberOfGuests: parseInt(numberOfGuests, 10) || 1,
      roomRate: rate,
      totalAmount: rate,
      // OTA bookings are settled outside this app - either prepaid to the
      // platform or paid on arrival - so there's no "advance collected at
      // registration" the way there is for a walk-in. Pending starts as the
      // full rate; staff correct this at checkout if payment already
      // happened on the OTA side.
      advanceAmount: 0,
      advanceReceivedBy: '',
      pendingAmount: rate,
      otaSource: otaBlock.source || 'other',
      otaSourceLabel: sourceLabel,
      icalExternalEventId: otaBlock.external_event_id,
    } as Guest;
    onConvert(newGuest);
    // Optimistic - the parent's onAddGuest handler owns local state + the DB
    // write and never reports failure back here, matching how every other
    // "Add Booking" flow in this app already behaves.
    onClose();
  };

  const fieldLabelClass = 'text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase';

  return (
    // z-70: this modal opens from within an already-open calendar/booking
    // context, so it must stack above that z-58 page modal (see the z-index
    // scale note in src/index.css - z-60/70/100 are the "secondary modal
    // deliberately above an open page modal" tier).
    <Modal show onClose={onClose} dismissible={!isSaving} size="md" className="z-70 convert-ota-booking-modal__root">
      <ModalHeader as="div">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          {t('convert_ota_booking_heading', 'Convert to Booking')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-normal">
          {t('convert_ota_booking_subtitle', '{{source}} reservation, {{start}} - {{end}}. Editing this only changes this app - it never writes back to {{source}}.')
            .replace(/\{\{source\}\}/g, sourceLabel)
            .replace('{{start}}', formatDateDDMMYYYY(otaBlock.event_start))
            .replace('{{end}}', formatDateDDMMYYYY(otaBlock.event_end))}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {otaBlock.event_title && (() => {
          const cleanTitle = otaBlock.event_title.replace(/\s*-\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, '').trim();
          return (
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-slate-400 uppercase">{t('ota_reference_label', 'OTA Reference (not a guest name)')}</div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{cleanTitle || otaBlock.event_title}</div>
              </div>
            </div>
          );
        })()}

        <div>
          <label className={fieldLabelClass}>{t('today_guest_name_label', 'Guest Name')}</label>
          <div className="mt-1">
            <Input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder={t('ota_guest_name_placeholder', 'Not provided by the OTA feed - confirm at check-in')}
            />
          </div>
        </div>

        <div>
          <label className={fieldLabelClass}>{t('phone_label', 'Phone')}</label>
          <div className="mt-1">
            <Input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              placeholder={t('phone_ota_placeholder', 'Not provided by OTA - add if known')}
            />
          </div>
        </div>

        <DateRangePicker
          checkinDate={checkin}
          checkoutDate={checkout}
          onCheckinChange={setCheckin}
          onCheckoutChange={setCheckout}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={fieldLabelClass}>{t('no_of_guests_label', 'No. of Guests')}</label>
            <div className="mt-1">
              <Input type="number" min={1} value={numberOfGuests} onChange={(e) => setNumberOfGuests(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={fieldLabelClass}>{t('room_rent', 'Room Rent / Price (₹)')}</label>
            <div className="mt-1">
              <Input type="number" min={0} value={roomRate} onChange={(e) => setRoomRate(e.target.value)} />
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter className="justify-end">
        <button
          type="button"
          onClick={handleConvert}
          disabled={isSaving}
          className="h-9 px-5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{t('convert_to_booking_button', 'Convert to Booking')}</span>
        </button>
      </ModalFooter>
    </Modal>
  );
};
