import React, { useState } from 'react';
import { Globe, Loader2, CheckCircle2, Hash, AlertTriangle } from './icons/FlowbiteIcons';
import { Drawer, Alert } from 'flowbite-react';
import { X } from './icons/FlowbiteIcons';
import { Guest } from '../types';
import { Input } from './Input';
import { DateRangePicker } from './DateRangePicker';
import { Popover } from './Popover';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { t } from '../i18n/en';

interface OtaBlockInfo {
  event_start: string;
  event_end: string;
  event_title?: string;
  source?: string;
  source_label?: string;
  external_event_id: string;
  // The OTA's own hosting-reservation URL, parsed server-side out of the
  // iCal DESCRIPTION field (see ical_sync.php's extractReservationUrl()) -
  // present for Airbnb feeds, which always include a "Reservation URL:"
  // line; may be absent for other/generic iCal sources that don't. 23 Aug
  // 2026: shown as a real clickable link here so staff can jump straight to
  // the reservation on the OTA's own dashboard to cross-check it, instead of
  // only seeing the opaque SUMMARY/title text.
  reservation_url?: string;
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
    <Drawer
      open
      onClose={onClose}
      position="right"
      className="z-70 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between convert-ota-booking-modal__root"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0">
              {t('convert_ota_booking_heading', 'Convert to Booking')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 m-0 font-normal">
              {t('convert_ota_booking_subtitle', '{{source}} reservation, {{start}} - {{end}}.')
                .replace(/\{\{source\}\}/g, sourceLabel)
                .replace('{{start}}', formatDateDDMMYYYY(otaBlock.event_start))
                .replace('{{end}}', formatDateDDMMYYYY(otaBlock.event_end))}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Moved out of the header subtitle and given real warning treatment (25 Aug 2026,
            explicit request) - it used to be tacked onto the end of the factual "{{source}}
            reservation, {{start}} - {{end}}" line in plain gray subtitle text, easy to miss
            since it reads as routine metadata rather than a caveat. */}
        <Alert
          color="warning"
          icon={AlertTriangle}
          className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
        >
          <p className="text-xs">
            {t('convert_ota_booking_warning', 'Editing this only changes it in this app - it never writes back to {{source}}.').replace(/\{\{source\}\}/g, sourceLabel)}
          </p>
        </Alert>

        {(otaBlock.event_title || otaBlock.reservation_url) && (() => {
          const cleanTitle = otaBlock.event_title
            ? otaBlock.event_title.replace(/\s*-\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, '').trim()
            : '';
          // The reservation_url's own trailing path segment IS the real
          // human-facing booking reference/confirmation code (e.g.
          // ".../reservations/details/HMXXXXXXX" -> "HMXXXXXXX") - far more
          // useful here than event_title, which for Airbnb is frequently
          // just the literal privacy placeholder "Reserved" with no
          // reference info at all. Falls back to the (cleaned) title for
          // feeds that don't provide a reservation_url. The separate
          // clickable "View reservation on {{source}}" link was removed (25
          // Aug 2026, explicit request) - this reference text is enough for
          // staff to cross-check on the OTA's own dashboard themselves.
          const bookingReference = otaBlock.reservation_url
            ? otaBlock.reservation_url.split('?')[0].replace(/\/+$/, '').split('/').pop()
            : '';
          const referenceText = bookingReference || cleanTitle || otaBlock.event_title;
          if (!referenceText) return null;
          return (
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-start gap-2">
              <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-2xs font-semibold text-slate-400 uppercase">{t('ota_reference_label', 'OTA Reference (not a guest name)')}</div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{referenceText}</div>
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
              // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): it
              // truncates raw typed characters before digit-stripping runs, silently dropping
              // trailing digits from any formatted phone number.
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
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
            <label className={`${fieldLabelClass} flex items-center gap-1.5`}>
              <span>{t('room_rent', 'Room Rent')}</span>
              <Popover
                trigger="click"
                placement="top"
                zIndex={80}
                content={
                  <div className="w-56 p-2.5 text-xs normal-case font-normal text-gray-600 dark:text-gray-300">
                    {t('room_rent_help_content', 'Net amount you will get excluding taxes and fees.')}
                  </div>
                }
              >
                <button
                  type="button"
                  className="appearance-none border-0 p-0 m-0 leading-none normal-case font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {t('room_rent_help_label', 'Help?')}
                </button>
              </Popover>
            </label>
            <div className="mt-1">
              <Input type="number" min={0} value={roomRate} onChange={(e) => setRoomRate(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          // FIXED 25 Aug 2026 (live report: "barely visible... should be exactly like rest of
          // the cancel buttons in the site") - this was `bg-gray-100` with NO border, sitting on
          // this same footer's own `bg-gray-50` background - two shades of gray a couple of
          // points apart, so the button had almost no visible edge. The site's actual canonical
          // secondary/cancel style is `src/components/Button.tsx`'s `secondary` variant
          // (bg-white + a real border) - see DESIGN.md's Buttons section, which says any
          // hand-rolled action button should match that when touched. Copied those exact color
          // tokens here (keeping this footer's own h-9/px-4 sizing so it still lines up pixel-
          // for-pixel with the Convert button beside it) rather than swapping to the <Button>
          // component itself, since that component's own size steps (h-8/h-10) don't have a
          // matching h-9 and could reintroduce a height mismatch with Convert next to it.
          className="h-9 px-4 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          {t('cancel_button', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={handleConvert}
          disabled={isSaving}
          // shadow-xs dropped (25 Aug 2026) - DESIGN.md's Buttons section: "No button ever has a
          // box-shadow, in any state" - flat fill + border only, site-wide.
          className="h-9 px-5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{t('convert_to_booking_button', 'Convert to Booking')}</span>
        </button>
      </div>
    </Drawer>
  );
};
