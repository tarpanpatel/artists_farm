import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import type { PropertyGuestInfo } from '../utils/whatsappVoucherTemplate';
import { ChevronLeft, ChevronRight, Plus, Calendar, LogOut, Bell, User, Globe, ArrowRightLeft } from './icons/FlowbiteIcons';
import { Popover } from './Popover';
import { Guest } from '../types';
import { BookingDetailsModal } from './BookingDetailsModal';
import { RateRuleModal } from './RateRuleModal';
import { CalendarEditorPanel, CalendarSelection } from './CalendarEditorPanel';
import { KpiCard } from './KpiCard';
import { fetchRateRulesDB, RateRule } from '../services/api';
import { Button } from './Button';
import { useToast } from './ToastContext';
import { isCFormGenuinelyFiled } from '../utils/cFormStatus';
import { getFirstName } from '../utils/nameUtils';
import { getOtaIcon } from '../utils/otaIcons';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { t } from '../i18n/en';
import { GUEST_STATUS_CHECKED_IN } from '../constants/guestStatus';

interface TodayOverviewProps {
  guests: Guest[];
  // default_tariff (4 Sep 2026, unbooked-date price display) - already
  // present on the real objects this prop is fed (App.tsx passes
  // preloadedData.currentProperty.rooms straight through, and RateRuleModal
  // below reads default_tariff off this same array), just not declared
  // here until now.
  rooms?: Array<{ id: number; name: string; slug: string; default_tariff?: number }>;
  isMultiKeyProperty?: boolean;
  kitchenModuleEnabled?: boolean;
  onNavigateToRoom?: (roomSlug: string) => void;
  onNavigate?: (tab: any, menuItemKey?: string) => void;
  // Optional prefill (added 3 Sep 2026, click-to-select-a-range on the
  // calendar) - the header "+ Add Booking" button still calls this with no
  // argument, opening the form blank exactly as before.
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
  /** Refundable deposit for a SINGLE property. A MULTI_KEY room carries its
   *  own on the room object, so this is only the single-unit fallback. */
  propertySecurityDeposit?: number | string | null;
  propertyAddress?: string;
  propertyInstructions?: string;
  propertyGuestInfo?: PropertyGuestInfo;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
  serviceRequests?: any[];
  // Per-role Service Requests permission (25 Aug 2026) - see App.tsx's
  // serviceRequestsAccessAllowed / OperationalDashboard's own prop of the same
  // name for the full explanation. Defaults true so this stays harmless if a
  // call site ever forgets to pass it.
  serviceRequestsAccessAllowed?: boolean;
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  guests,
  rooms = [],
  isMultiKeyProperty = false,
  // kitchenModuleEnabled: still in the props interface (App.tsx passes it) but
  // no longer read here since "Share Food Menu" moved to the sidebar.
  onNavigateToRoom: _onNavigateToRoom,
  onNavigate: _onNavigate,
  onAddBooking,
  // Only ever called from the OTA-conversion modal, removed 3 Sep 2026 (iCal
  // sync retired) - kept in the props interface so App.tsx's call site
  // doesn't need editing (same convention as _onNavigateToRoom above).
  onAddGuest: _onAddGuest,
  onUpdateGuest,
  onDeleteGuest,
  onCheckInGuest,
  onGuestVerificationUpdated,
  onCFormFiledUpdated,
  onCheckout,
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertySecurityDeposit,
  propertyAddress = '',
  propertyInstructions = '',
  propertyGuestInfo,
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
  serviceRequests = [],
  serviceRequestsAccessAllowed = true,
}) => {
  const { showToast } = useToast();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  // Popover-first click on a booking capsule (7 Sep 2026, explicit request:
  // "just like it is in single calendar") - matches OperationalDashboard.tsx's
  // own booking-segment Popover exactly: click shows a quick-info popover with
  // a "View More" button, rather than jumping straight to the full
  // BookingDetailsModal on the first tap. Was previously trigger="hover" with
  // an immediate onClick on the capsule itself - the same
  // stuck-open-on-mobile-tap problem documented in CLAUDE.md's Popover mistake
  // #15 (a touch device fires a synthetic hover with no matching "leave"), and
  // the single calendar was already fixed for exactly this reason 22 Aug 2026.
  const [openGuestPopoverId, setOpenGuestPopoverId] = useState<string | null>(null);
  // Same fix, same reason, for the OTA-blocked capsule's own popover just
  // below - OperationalDashboard.tsx's equivalent was already click-
  // triggered (22 Aug 2026), this one wasn't. The "Convert to Booking"
  // action itself is inert in both calendars post-iCal-retirement (see
  // setOtaConversionTarget's own write-only comment) - only the popover's
  // trigger mode is the actual parity gap being closed here.
  const [openOtaPopoverId, setOpenOtaPopoverId] = useState<string | null>(null);
  // Same-day-turnover combined marker (7 Sep 2026, explicit request): even
  // with the capsule inset above leaving a real gap, a checkout tail and a
  // check-in head sitting right next to each other on one shared date can
  // still be fiddly to tell apart or tap precisely on a narrow mobile
  // column - see the marker rendered near `turnoverPoints` below.
  const [openTurnoverPopoverId, setOpenTurnoverPopoverId] = useState<string | null>(null);

  /**
   * Airbnb-Multi-Calendar-style rectangular selection (6 Sep 2026, explicit
   * request: "make the whole system of prices and booking more like how airbnb
   * does").
   *
   * This REPLACES the old two-mode calendar. Before, the grid had an "Add
   * Booking" / "Change Prices" toggle, and each mode had its own two-click
   * range gesture that opened a different screen. The owner had already called
   * the two modes confusing, and the deeper problem was that the toggle had to
   * be set BEFORE picking dates - so getting it wrong meant discovering the
   * mistake only after the dates were chosen, and picking them all over again.
   *
   * Airbnb has no mode at all: you drag a rectangle across listings x dates and
   * a panel appears offering the things you can do with that rectangle. The
   * selection is the state; the mode question never comes up. That is what this
   * is, plus one thing Airbnb has no equivalent for - "Add booking" - since on
   * Airbnb guests do the booking, not the host.
   *
   * The rectangle is anchor + focus (grid indices, not dates), min/maxed on
   * both axes, so dragging in any direction works and either corner can be the
   * one you started from.
   */
  const [selAnchor, setSelAnchor] = useState<{ roomIdx: number; dateIdx: number } | null>(null);
  const [selFocus, setSelFocus] = useState<{ roomIdx: number; dateIdx: number } | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // Room scope for the "See all pricing rules" escape hatch into RateRuleModal.
  const [rateModalRoomIds, setRateModalRoomIds] = useState<number[] | undefined>(undefined);

  /**
   * Drag bookkeeping, in a ref rather than state: a pointer drag fires on every
   * move, and re-rendering the whole grid just to record "still dragging" would
   * make the gesture stutter. Only anchor/focus are state, because only they
   * are drawn.
   *
   * `armed` is what separates a drag from a scroll ON TOUCH. A finger moving
   * horizontally across this grid is genuinely ambiguous - it is either drawing
   * a range or scrolling the calendar sideways, and both are things people do
   * here constantly. So touch requires a short long-press to arm the drag (the
   * cell lights up to say so); a plain tap selects that one night, and an
   * unarmed swipe scrolls as normal. A mouse has no such ambiguity and arms
   * immediately.
   */
  const dragRef = useRef<{
    armed: boolean;
    pointerType: string;
    startX: number;
    startY: number;
    moved: boolean;
    longPressTimer: number | null;
    columnMode: boolean;
    isClickSelecting: boolean;
    // True only from a real pointerdown until its matching pointerup/cancel
    // (7 Sep 2026 fix - see the note on handleGridPointerMove's own "not
    // armed yet" branch for why this exists: startX/startY are stale once a
    // gesture is over, and until this flag existed nothing distinguished a
    // genuinely fresh not-yet-armed touch from an already-finished one).
    pointerDownActive: boolean;
  }>({
    armed: false,
    pointerType: 'mouse',
    startX: 0,
    startY: 0,
    moved: false,
    longPressTimer: null,
    columnMode: false,
    isClickSelecting: false,
    pointerDownActive: false,
  });
  const [isDragArmed, setIsDragArmed] = useState(false);

  const formatDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** Cancel any pending long-press and disarm. */
  const endDrag = () => {
    if (dragRef.current.longPressTimer !== null) {
      window.clearTimeout(dragRef.current.longPressTimer);
      dragRef.current.longPressTimer = null;
    }
    dragRef.current.armed = false;
    dragRef.current.columnMode = false;
    dragRef.current.pointerDownActive = false;
    setIsDragArmed(false);
  };

  useEffect(() => () => {
    if (dragRef.current.longPressTimer !== null) window.clearTimeout(dragRef.current.longPressTimer);
  }, []);

  const clearSelection = () => {
    dragRef.current.isClickSelecting = false;
    setSelAnchor(null);
    setSelFocus(null);
    setIsPanelOpen(false);
  };

  // Escape key cancels active click-selection or closes editor panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dragRef.current.isClickSelecting || isPanelOpen) {
          clearSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen]);

  /**
   * Resolve whichever grid cell is under a pointer. Used instead of
   * onPointerEnter because touch takes IMPLICIT POINTER CAPTURE on the element
   * the finger went down on - every later move event is delivered there, and
   * enter/leave never fire on the cells being dragged across. Hit-testing the
   * real coordinates is the one approach that behaves identically for a mouse
   * and for a finger.
   */
  const cellFromPoint = (clientX: number, clientY: number): { roomIdx: number; dateIdx: number } | null => {
    const el = document.elementFromPoint(clientX, clientY);
    const cell = el && (el as HTMLElement).closest ? (el as HTMLElement).closest('[data-cal-room-idx]') as HTMLElement | null : null;
    if (!cell) return null;
    const roomIdx = Number(cell.dataset.calRoomIdx);
    const dateIdx = Number(cell.dataset.calDateIdx);
    if (isNaN(roomIdx) || isNaN(dateIdx)) return null;
    // Past nights carry the attributes (so a drag passing over them still
    // hit-tests cleanly) but can never become the selection's edge - Channex
    // rejects past dates outright, so a rectangle that reached backwards would
    // save locally and fail at the channel with nothing said.
    if (cell.dataset.calPast === '1') return null;
    return { roomIdx, dateIdx };
  };

  const handleGridPointerDown = (e: React.PointerEvent, roomIdx: number, dateIdx: number) => {
    // Booking capsules sit above the cells and own their own click (they open
    // the booking details drawer), so a press that starts on one is not a
    // selection.
    if ((e.target as HTMLElement).closest('[data-cal-capsule]')) return;

    const d = dragRef.current;
    d.pointerType = e.pointerType;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.moved = false;
    d.columnMode = false;
    d.pointerDownActive = true;

    // If currently in 2-click selection mode, this click is Click 2!
    if (d.isClickSelecting && selAnchor) {
      setSelFocus({ roomIdx, dateIdx });
      return;
    }

    setSelAnchor({ roomIdx, dateIdx });
    setSelFocus({ roomIdx, dateIdx });
    setIsPanelOpen(false);

    if (e.pointerType === 'mouse') {
      d.armed = true;
      setIsDragArmed(true);
    } else {
      if (d.longPressTimer !== null) window.clearTimeout(d.longPressTimer);
      d.longPressTimer = window.setTimeout(() => {
        d.longPressTimer = null;
        d.armed = true;
        setIsDragArmed(true);
      }, 280);
    }
  };

  const handleGridPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!selAnchor) return;

    // Mode A: Hovering during 2-click selection mode (mouse moving freely across grid)
    if (d.isClickSelecting) {
      const hit = cellFromPoint(e.clientX, e.clientY);
      if (hit && hit.roomIdx >= 0) {
        setSelFocus(hit);
      }
      return;
    }

    // Mode B: Pointer drag (mouse held down or long-pressed touch)
    if (!d.armed) {
      if (!d.pointerDownActive) return;
      // A finger that has already travelled before the long-press fired is
      // scrolling, not selecting - stand down and let the scroller have it.
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (dist > 10) {
        endDrag();
        setSelAnchor(null);
        setSelFocus(null);
      }
      return;
    }

    const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (dist > 5) {
      d.moved = true;
    }

    // Once armed on touch the gesture belongs to the grid, not the scroller.
    if (e.pointerType !== 'mouse') e.preventDefault();

    const hit = cellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    if (d.columnMode) {
      setSelFocus({ roomIdx: Math.max(0, gridRooms.length - 1), dateIdx: hit.dateIdx });
      return;
    }
    // roomIdx -1 is a date header. Reachable only by dragging up out of the
    // grid onto the header strip; there is no row there to anchor a rectangle
    // to, so hold the current focus rather than collapsing it.
    if (hit.roomIdx < 0) return;
    setSelFocus(hit);
  };

  const handleGridPointerUp = () => {
    const d = dragRef.current;
    if (!selAnchor) { endDrag(); return; }

    // If pointer actually dragged across cells (distance > 5px)
    if (d.moved) {
      d.isClickSelecting = false;
      endDrag();
      setIsPanelOpen(true);
      return;
    }

    // If click 2 in 2-click selection mode
    if (d.isClickSelecting) {
      d.isClickSelecting = false;
      endDrag();
      setIsPanelOpen(true);
      return;
    }

    // Click 1: enter 2-click selection mode (highlight anchor cell, wait for 2nd click/hover)
    d.isClickSelecting = true;
    endDrag();
    setIsPanelOpen(false);
  };

  // A drag can end anywhere - over the sticky room-name column, past the last
  // row, outside the window entirely. Without a global release listener those
  // all leave the rectangle stuck to the cursor with no panel, which reads as
  // the grid having frozen.
  useEffect(() => {
    if (!isDragArmed) return;
    const finish = () => handleGridPointerUp();
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  });

  /**
   * Press (or drag across) the date headers: select that whole date column,
   * i.e. every unit on that date. A festival weekend is a column, not a row,
   * and it is the single most common thing an owner reprices - worth its own
   * gesture rather than a seven-row drag.
   */
  const handleHeaderPointerDown = (e: React.PointerEvent, dateIdx: number) => {
    if (gridRooms.length === 0) return;
    const d = dragRef.current;
    d.pointerType = e.pointerType;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.moved = false;
    d.columnMode = true;
    d.armed = true;
    d.isClickSelecting = false;
    d.pointerDownActive = true;
    setIsDragArmed(true);
    setSelAnchor({ roomIdx: 0, dateIdx });
    setSelFocus({ roomIdx: gridRooms.length - 1, dateIdx });
    setIsPanelOpen(false);
  };

  const handleHeaderPointerMove = (dateIdx: number) => {
    const d = dragRef.current;
    if (!d.armed || !d.columnMode || !selAnchor) return;
    d.moved = true;
    setSelFocus({ roomIdx: Math.max(0, gridRooms.length - 1), dateIdx });
  };

  // "Share Food Menu" and "Direct Booking Link" moved off this page header
  // 4 Sep 2026 (explicit request) - Share Food Menu / Share Availability live
  // in the sidebar's Quick Actions now, and the header is back to a single
  // "+ Add Booking" action.

  // OTA-synced blocked dates (Airbnb/Booking.com/etc via connected iCal
  // feeds) - same fetch OperationalDashboard.tsx already does for single
  // properties; this multi-key calendar never had it at all (found 14 Aug
  // 2026), so a room's iCal-blocked dates never showed here regardless of
  // how many feeds were connected. get_blocked_dates itself already expands
  // a MULTI_KEY parent to include all its rooms, but the room-level
  // `room_id` on each returned event is what actually scopes a block to one
  // room's own row below.
  const [blockedDates] = useState<Array<{
    event_start: string;
    event_end: string;
    event_title: string;
    external_event_id: string;
    room_id?: number;
    reservation_url?: string;
    source?: string;
    source_label?: string;
  }>>([]);
  // Write-only now (3 Sep 2026, iCal sync retired) - same reasoning as
  // OperationalDashboard.tsx's identical comment on its own copy of this.
  const [, setOtaConversionTarget] = useState<{ block: (typeof blockedDates)[number]; roomName: string; blockedDateStrings: string[] } | null>(null);
  const [showRateRuleModal, setShowRateRuleModal] = useState(false);
  const [rateRuleStartDate, setRateRuleStartDate] = useState<string | undefined>(undefined);
  const [rateRuleEndDate, setRateRuleEndDate] = useState<string | undefined>(undefined);
  const [rateRules, setRateRules] = useState<RateRule[]>([]);
  const [pricingMode, setPricingMode] = useState<'flat' | 'variable'>('flat');
  const [defaultTariff, setDefaultTariff] = useState<number | null>(null);

  const loadRateRules = async () => {
    const data = await fetchRateRulesDB();
    setRateRules(data.rules);
    setPricingMode(data.pricing_mode);
    if (data.default_tariff !== null) setDefaultTariff(data.default_tariff);
  };

  useEffect(() => {
    loadRateRules();
  }, []);

  // Small per-day price shown on unbooked cells (4 Sep 2026, explicit
  // request). Day-of-week matching follows Channex's own 2-letter codes - a
  // rule only claims a date if it has no days_of_week restriction, or that
  // date's weekday is in it.
  const DAY_CODE_BY_JS_DAY = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

  /**
   * Rate rules in the SAME precedence order the server resolves them in
   * (6 Sep 2026 fix).
   *
   * get_rate_rules returns rows ordered `start_date ASC, created_at DESC` -
   * fine for listing them in a table, wrong as a precedence order. Every place
   * that decides what a night actually COSTS resolves `room_id DESC,
   * created_at DESC` and takes the first hit: a room-specific rule outranks a
   * property-wide one, and among equals the newest wins (see
   * AriDrainWorker::computeCompressedRestrictions() and public_booking.php).
   *
   * Reading the list in its display order instead meant the earliest-starting
   * rule won here, so the number printed on the calendar could differ from what
   * a guest is quoted on the booking page and from what is pushed to Airbnb -
   * two sources of price truth, with the owner's own screen being the one that
   * lies. Sorted once per rules load rather than per cell; there can be
   * thousands of rules after a PriceLabs import and this runs for every visible
   * cell.
   */
  const resolvedRateRules = useMemo(() => {
    return [...rateRules].sort((a, b) => {
      const roomA = a.room_id ? Number(a.room_id) : 0;
      const roomB = b.room_id ? Number(b.room_id) : 0;
      if (roomA !== roomB) return roomB - roomA;
      const timeA = a.created_at ? Date.parse(a.created_at.replace(' ', 'T')) : 0;
      const timeB = b.created_at ? Date.parse(b.created_at.replace(' ', 'T')) : 0;
      if (timeA !== timeB) return timeB - timeA;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [rateRules]);

  const getDayPrice = (dateStr: string, room: { id: number; default_tariff?: number }): number => {
    if (pricingMode === 'variable') {
      const dayCode = DAY_CODE_BY_JS_DAY[new Date(dateStr + 'T00:00:00').getDay()];
      const match = resolvedRateRules.find((r) => {
        const roomMatch = !r.room_id || Number(r.room_id) === Number(room.id);
        const dayMatch = !r.days_of_week || r.days_of_week.split(',').includes(dayCode);
        return roomMatch && dayMatch && r.start_date <= dateStr && r.end_date >= dateStr
          && r.rate_per_night != null;
      });
      if (match && match.rate_per_night != null) return Number(match.rate_per_night);
    }
    return room.default_tariff || defaultTariff || 0;
  };

  // iCal sync retired app-wide (3 Sep 2026, superseded by the Channex channel
  // manager - see _unwanted/ical/README.md). This used to fetch
  // php/api/ical_sync.php?action=get_blocked_dates on mount, now archived;
  // blockedDates stays permanently empty (its initial state), which makes
  // every OTA-block consumer below produce nothing to render - left in
  // place rather than excised, same reasoning as OperationalDashboard.tsx's
  // identical copy of this comment.

  // Rolling window instead of a fixed calendar month (14 Aug 2026 fix): this
  // used to be locked to whichever single calendar month currentMonth/
  // currentYear pointed at (columns 1..daysInMonth only, matching a real
  // date only by coincidence of "today" being that month) - so dates from
  // the next month were never visible without clicking the next-month
  // arrow, even one day before month-end. Now a wide rolling window
  // (PAST_BUFFER_DAYS back, FUTURE_BUFFER_DAYS forward) so the user can
  // freely scroll through past and future months with the native
  // horizontal scrollbar, no arrow-clicking needed for typical use - the
  // arrows just page the whole window further out for longer trips.
  // BUG (found 14 Aug 2026): this used to be a hardcoded `64` (the nominal
  // px value of the day columns' `w-16` Tailwind class at the default 16px
  // root font-size). This app's root font-size is actually 14px, so `w-16`
  // (4rem) renders at 56px, not 64 - every place that did day-index*64 math
  // (capsule left/width, the visible-month-label calc) silently drifted
  // further and further from where the day columns actually are the more
  // days out from the window start it measured, while the columns
  // themselves (plain CSS, unaffected) rendered correctly. That's what
  // made checked-out bookings look like they were sitting near "today"
  // instead of where they actually are, and made the month label fail to
  // pick up the next month even once it was well into view. Now measured
  // from the real rendered column below instead of assumed.
  const [columnWidth, setColumnWidth] = useState(64);
  const columnWidthRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const w = columnWidthRef.current?.getBoundingClientRect().width;
      if (w) setColumnWidth(w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const PAST_BUFFER_DAYS = 60;
  const FUTURE_BUFFER_DAYS = 89;
  const WINDOW_DAYS = PAST_BUFFER_DAYS + FUTURE_BUFFER_DAYS + 1; // + today itself

  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - PAST_BUFFER_DAYS);
    return d;
  });

  const navigateWindow = (direction: number) => {
    // Page by ~a month at a time - the window is already wide enough for
    // ordinary scrolling, this is just for reaching further out.
    setWindowStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + direction * 30);
      return d;
    });
  };

  const isSameDate = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const scrollRef = useRef<HTMLDivElement>(null);
  // Header label reflects whichever month(s) are ACTUALLY scrolled into
  // view right now (not a fixed date range) - "August" while only August
  // columns are visible, "August - September" while the view straddles
  // both, then "September" once August scrolls out. Recomputed on every
  // scroll event.
  const [visibleMonthLabel, setVisibleMonthLabel] = useState('');

  const monthYearLabel = (d: Date) => d.toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthOnlyLabel = (d: Date) => d.toLocaleString('default', { month: 'long' });

  const updateVisibleMonthLabel = (days: Date[]) => {
    const el = scrollRef.current;
    if (!el || days.length === 0) return;
    const startIdx = Math.max(0, Math.floor(el.scrollLeft / columnWidth));
    const endIdx = Math.min(
      days.length - 1,
      Math.max(startIdx, Math.ceil((el.scrollLeft + el.clientWidth) / columnWidth) - 1)
    );
    const startDate = days[startIdx];
    const endDate = days[endIdx];
    const sameMonth = startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth();
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    setVisibleMonthLabel(
      sameMonth
        ? monthYearLabel(startDate)
        : sameYear
        ? `${monthOnlyLabel(startDate)} - ${monthYearLabel(endDate)}`
        : `${monthYearLabel(startDate)} - ${monthYearLabel(endDate)}`
    );
  };

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const todaysArrivals = guests.filter((g) => (g.checkinDate || '').split(' ')[0] === todayStr).length;
  const todaysDepartures = guests.filter((g) => (g.expectedCheckout || '').split(' ')[0] === todayStr).length;
  const pendingRequests = (serviceRequests || []).filter((r) => r.status === 'Pending').length;

  const inHouseCount = useMemo(() => {
    return guests.filter((g) => {
      const status = String(g.status || '').trim().toLowerCase();
      if (status !== 'active' && status !== 'checked in') return false;
      const checkinDate = new Date(g.checkinDate);
      const checkoutDate = new Date(g.expectedCheckout);
      checkinDate.setHours(0, 0, 0, 0);
      checkoutDate.setHours(0, 0, 0, 0);
      return today >= checkinDate && today < checkoutDate;
    }).length;
  }, [guests, today]);

  const calendarGuests = useMemo(() => {
    return guests.filter((g) => {
      const status = String(g.status || '').trim().toLowerCase();
      return !['cancelled', 'canceled'].includes(status);
    });
  }, [guests]);

  const isCheckedOutStatus = (status: any) => {
    const s = String(status || '').trim().toLowerCase();
    return s === 'checkedout' || s === 'checked out';
  };

  const getGuestPendingReasons = (guest: any): string[] => {
    const reasons: string[] = [];
    const status = String(guest.status || '').trim().toLowerCase();
    const isCheckedOut = status === 'checkedout' || status === 'checked out';
    if (isCheckedOut || status === 'cancelled' || status === 'canceled') return reasons;

    const isCheckedIn = status === 'active' || status === 'checked in' || status === 'checkedin';
    const isBooked = !isCheckedIn;

    // Check if this is an upcoming booking (arrival date is in the future)
    let isUpcoming = false;
    if (isBooked && guest.checkinDate) {
      const checkinDate = new Date(guest.checkinDate);
      checkinDate.setHours(0, 0, 0, 0);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      if (todayStart < checkinDate) {
        isUpcoming = true;
      }
    }

    // For upcoming bookings (guest has not arrived yet), ID, C-Form, and check-in are not pending
    if (isUpcoming) {
      return reasons;
    }

    // 1. ID Upload Pending (only for checked-in guests or guests arriving today/overdue)
    if (guest.idVerificationStatus !== 'Complete') {
      reasons.push('ID Pending');
    }

    // 2. Check-in Pending (Arrival date was today or earlier, but stay is not checked in)
    if (isBooked && guest.checkinDate) {
      const checkinDate = new Date(guest.checkinDate);
      checkinDate.setHours(0, 0, 0, 0);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      if (todayStart >= checkinDate) {
        reasons.push('Check-in Pending');
      }
    }

    // 3. Checkout Pending (Expected checkout is today or earlier, but still checked in)
    if (isCheckedIn && guest.expectedCheckout) {
      const checkoutDate = new Date(guest.expectedCheckout);
      checkoutDate.setHours(0, 0, 0, 0);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      if (todayStart >= checkoutDate) {
        reasons.push('Checkout Pending');
      }
    }

    // 4. C-Form Pending (Foreign guest without filed C-Form arriving today or currently
    // checked in). isCFormGenuinelyFiled(), not a bare AND of cFormFiledAt/cFormNumber (25
    // Aug 2026) - see that helper's own comment; the old condition required ALL of them
    // falsy to count as pending, so cFormFiledAt alone being set (no number) was never
    // flagged either.
    if (guest.isForeignGuest && !isCFormGenuinelyFiled(guest)) {
      reasons.push('C-Form Pending');
    }

    return reasons;
  };

  const getGuestsForRoom = (roomId: number, roomName?: string) => {
    return calendarGuests
      .filter((guest) => {
        if (roomId) {
          const guestRoomId = (guest as any).roomId || (guest as any).room_id;
          if (guestRoomId && Number(guestRoomId) === Number(roomId)) return true;
        }
        if (roomName && guest.roomNumber === roomName) return true;
        return false;
      })
      .sort((a, b) => new Date(a.checkinDate).getTime() - new Date(b.checkinDate).getTime());
  };

  const getGuestColor = (_guestId: any, status?: any) => {
    if (isCheckedOutStatus(status)) {
      return 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600';
    }
    return 'bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 text-white border border-blue-700/30';
  };

  const daysArray = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [windowStart]
  );
  const windowEnd = daysArray[daysArray.length - 1];

  // ------------------------------------------------------------------
  // Selection maths for the Airbnb-style grid editor (6 Sep 2026).
  // ------------------------------------------------------------------

  // The rows the grid actually draws, in draw order. Selection is stored as
  // indices into THIS array (and into daysArray), not as room ids and dates,
  // because a rectangle is naturally expressed in grid coordinates - converting
  // to ids/dates once, at the edge, is far less error-prone than min/maxing
  // dates and room ids on every pointer move.
  const gridRooms = useMemo(
    () => (rooms || []).filter((r) => r.id !== undefined),
    [rooms]
  );

  const selRect = useMemo(() => {
    if (!selAnchor || !selFocus || gridRooms.length === 0) return null;
    const roomFrom = Math.min(selAnchor.roomIdx, selFocus.roomIdx);
    const roomTo = Math.max(selAnchor.roomIdx, selFocus.roomIdx);
    const dateFrom = Math.min(selAnchor.dateIdx, selFocus.dateIdx);
    const dateTo = Math.max(selAnchor.dateIdx, selFocus.dateIdx);
    return {
      roomFrom,
      roomTo,
      dateFrom,
      dateTo,
      spansAllRooms: roomFrom === 0 && roomTo === gridRooms.length - 1,
    };
  }, [selAnchor, selFocus, gridRooms.length]);

  const expandStayToNights = (startVal: any, endVal: any): string[] => {
    const out: string[] = [];
    const toDate = (v: any) => {
      const str = String(v || '').split(' ')[0].split('T')[0];
      const parts = str.split('-');
      return parts.length === 3
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0)
        : new Date(NaN);
    };
    const cur = toDate(startVal);
    const end = toDate(endVal);
    if (isNaN(cur.getTime()) || isNaN(end.getTime())) return out;
    // Half-open: a checkout date is not a night slept. Same convention as the
    // row renderer's own expandRangeToDayStrings.
    while (cur < end) {
      out.push(formatDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  };

  /** roomId -> every night that room is already sold. */
  const occupiedNightsByRoom = useMemo(() => {
    const map = new Map<number, Set<string>>();
    gridRooms.forEach((room) => {
      const nights = new Set<string>();
      getGuestsForRoom(room.id, room.name).forEach((g: any) => {
        expandStayToNights(g.checkinDate, g.expectedCheckout || g.checkoutDate || g.checkinDate)
          .forEach((d) => nights.add(d));
      });
      map.set(room.id, nights);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRooms, guests]);

  /**
   * Is this night currently closed to bookings for this unit?
   *
   * Gated on the same `pricing_mode === 'variable'` check getDayPrice uses, and
   * for the same reason: "Flat Base Rate" suspends every rate rule for a scope,
   * a stop_sell block included, both here and in what gets pushed to the OTAs
   * (see AriDrainWorker::isDynamicPricingMode()). Drawing a night as blocked
   * that Airbnb is still happily selling would be worse than not drawing it.
   */
  const isNightBlocked = (dateStr: string, roomId: number): boolean => {
    if (pricingMode !== 'variable') return false;
    // ANY overlapping stop_sell rule closes the night - deliberately not "the
    // winning rule happens to carry stop_sell". That mirrors the server
    // exactly: AriDrainWorker's availability query filters `stop_sell = 1` and
    // marks every day in every matching range, with no precedence pass and no
    // days_of_week filter at all. Resolving it more cleverly here would draw
    // nights as open that Airbnb is actually being told are closed.
    return rateRules.some(
      (r) =>
        !!r.stop_sell &&
        (!r.room_id || Number(r.room_id) === Number(roomId)) &&
        r.start_date <= dateStr &&
        r.end_date >= dateStr
    );
  };

  /**
   * Everything the editor panel needs about the current rectangle, computed in
   * one pass: which units, which nights, the price spread to show as the
   * placeholder ("1514-1802", exactly like Airbnb), how many cells are blocked,
   * and how many are already sold.
   */
  const selectionInfo = useMemo(() => {
    if (!selRect) return null;
    const selectedRooms = gridRooms.slice(selRect.roomFrom, selRect.roomTo + 1);
    const selectedDays = daysArray.slice(selRect.dateFrom, selRect.dateTo + 1).map(formatDateStr);
    if (selectedRooms.length === 0 || selectedDays.length === 0) return null;

    let low = Infinity;
    let high = -Infinity;
    let blocked = 0;
    let booked = 0;
    selectedRooms.forEach((room) => {
      const occupied = occupiedNightsByRoom.get(room.id) || new Set<string>();
      selectedDays.forEach((d) => {
        if (occupied.has(d)) { booked += 1; return; }
        if (isNightBlocked(d, room.id)) blocked += 1;
        const price = getDayPrice(d, room);
        if (price < low) low = price;
        if (price > high) high = price;
      });
    });

    const totalCells = selectedRooms.length * selectedDays.length;
    return {
      selection: {
        roomIds: selectedRooms.map((r) => r.id as number),
        roomNames: selectedRooms.map((r) => r.name),
        startDate: selectedDays[0],
        endDate: selectedDays[selectedDays.length - 1],
      } as CalendarSelection,
      priceLow: low === Infinity ? 0 : low,
      priceHigh: high === -Infinity ? 0 : high,
      blockedCells: blocked,
      bookedCells: booked,
      totalCells: totalCells - booked,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selRect, gridRooms, daysArray, occupiedNightsByRoom, rateRules, pricingMode, defaultTariff]);

  /**
   * Move the selection to an explicit date range (the panel's own date inputs).
   * Snapped back into the visible window, since the rectangle is drawn from
   * grid indices - a date outside the window has no column to highlight.
   */
  const setSelectionDates = (startStr: string, endStr: string) => {
    if (!selRect) return;
    const idxOf = (dateStr: string) => daysArray.findIndex((d) => formatDateStr(d) === dateStr);
    const a = idxOf(startStr);
    const b = idxOf(endStr);
    if (a < 0 || b < 0) {
      showToast('Pick a date inside the visible calendar, or scroll to it first.', { type: 'info' });
      return;
    }
    setSelAnchor({ roomIdx: selRect.roomFrom, dateIdx: Math.min(a, b) });
    setSelFocus({ roomIdx: selRect.roomTo, dateIdx: Math.max(a, b) });
  };

  // Column that should sit at the left edge on initial view: "today - 2
  // days" (only meaningful right after mount/paging, while today is still
  // inside the buffer - falls back to the very start of the window
  // otherwise). Referenced by the header cell below and scrolled to via
  // scrollIntoView in the layout effect underneath it.
  const todayIdx = daysArray.findIndex((d) => isSameDate(d, today));
  const scrollTargetIdx = todayIdx >= 0 ? Math.max(0, todayIdx - 2) : 0;
  const scrollTargetRef = useRef<HTMLDivElement>(null);

  // BUG (found 14 Aug 2026): the previous approach computed a pixel offset
  // by hand (targetIdx * COLUMN_WIDTH) and applied it via a bare
  // setTimeout(..., 50) - a guess at how long layout takes, not a real
  // signal that it's actually safe to scroll yet. On a slower/first paint
  // (real data still loading, rooms not rendered yet, etc.) 50ms wasn't
  // always enough, so the scroll landed at whatever position the browser's
  // default (0, or mid-scroll from a still-settling layout) happened to be
  // - reported as the view opening days away from "today" instead of at it,
  // inconsistently between loads. scrollIntoView in a layout effect lets
  // the browser itself handle "is this actually laid out yet" - it runs
  // synchronously after DOM mutations, before paint, so there's no visible
  // jump and no timing to guess at. `block: 'nearest'` stops it from also
  // vertically scrolling the whole page to center this row.
  useLayoutEffect(() => {
    scrollTargetRef.current?.scrollIntoView({ inline: 'start', block: 'nearest' });
    updateVisibleMonthLabel(daysArray);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysArray]);

  return (
    <div className="today-overview space-y-6">
      {/* Sleek Dashboard Header with Top Right Add Booking Button */}
      <div className="today-overview__page-header flex flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <h1 className="today-overview__page-title text-base font-semibold text-slate-900 dark:text-white tracking-tight truncate">
            {t('dashboard_heading', 'Dashboard')}
          </h1>
        </div>
        <div className="today-overview__header-actions flex items-center gap-2 shrink-0">
          {onAddBooking && (
            <button
              onClick={() => onAddBooking()}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold rounded-lg text-xs px-3.5 py-2 flex items-center gap-2 shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{t('add_booking_button', 'Add Booking')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Blocks Grid - Sleek 1-Row Horizontal Cards */}
      <div className={`today-overview__metrics grid grid-cols-1 ${isMultiKeyProperty ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-2.5 md:gap-4`}>
        <KpiCard
          label="Arrivals"
          icon={Calendar}
          badge={{ text: 'Today', color: 'info' }}
          value={todaysArrivals}
        />
        <KpiCard
          label="Departures"
          icon={LogOut}
          badge={{ text: 'Today', color: 'warning' }}
          value={todaysDepartures}
        />
        {isMultiKeyProperty && (
          <KpiCard
            label="Checked-In Guests"
            icon={User}
            badge={{ text: 'Active', color: 'success' }}
            value={inHouseCount}
          />
        )}
        {serviceRequestsAccessAllowed && (
          <KpiCard
            label="Service Requests"
            icon={Bell}
            badge={{ text: 'Active', color: 'failure' }}
            value={pendingRequests}
          />
        )}
      </div>

      <div data-tour="booking-grid" className="today-overview__calendar bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <h2 className="today-overview__title text-base font-semibold text-slate-900 dark:text-white">{visibleMonthLabel}</h2>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                const newStart = new Date(today);
                newStart.setDate(newStart.getDate() - PAST_BUFFER_DAYS);
                setWindowStart(newStart);
                setTimeout(() => {
                  scrollTargetRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                }, 50);
              }}
              className="h-7 text-xs font-semibold px-2.5 shrink-0"
            >
              {t('today_button', 'Today')}
            </Button>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
            {/* No mode toggle any more (6 Sep 2026) - the selection IS the
                mode. Drag a rectangle on the grid and the editor panel offers
                whatever that rectangle supports: price it, block it, or book it.
                See the selAnchor/selFocus block above for why the old
                Add Booking / Change Prices pair was removed. */}
            <span className="text-2xs text-slate-500 dark:text-slate-400 hidden md:inline">
              Drag across the grid to price or block dates &middot; tap a date at the top for every unit
            </span>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => { setRateModalRoomIds(undefined); setShowRateRuleModal(true); }}
              className="h-7 text-xs font-semibold px-2.5 shrink-0"
            >
              Prices &amp; rules
            </Button>
            <div className="flex items-center gap-1 ms-auto sm:ms-0">
              <button
                onClick={() => navigateWindow(-1)}
                className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigateWindow(1)}
                className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

      <div
        ref={scrollRef}
        onScroll={() => updateVisibleMonthLabel(daysArray)}
        // Once a touch drag is armed the grid owns the gesture; letting the
        // horizontal scroller keep it too would mean the calendar slides away
        // underneath the rectangle being drawn.
        style={isDragArmed ? { touchAction: 'none' } : undefined}
        className={`today-overview__scroll-container overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg${
          isDragArmed ? ' calendar--dragging' : ''
        }`}
      >
        <div className="min-w-max">
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            {/* w-24 (not w-32) - MUST match each room row's own sticky
                room-name column width below (found 22 Aug 2026, reported as
                "booking dates don't match what I'm seeing"). The header and
                each room row are separate flex rows stacked vertically -
                nothing structurally forces their day-columns to align, so a
                header label column wider than the rows' own label column
                shifts every date header 32px to the right of the actual
                day-column grid lines the capsules are positioned against,
                making bookings appear to sit under the wrong date. */}
            <div className="w-24 min-w-24 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">
              Room
            </div>
            {daysArray.map((day, idx) => {
              const dayName = day.toLocaleString('default', { weekday: 'short' });
              const isToday = isSameDate(day, today);
              // Whole-column selection - see handleHeaderPointerDown.
              const isColumnPickable = gridRooms.length > 0;
              const isColumnPending =
                !!selRect && selRect.dateFrom <= idx && idx <= selRect.dateTo && selRect.spansAllRooms;

              return (
                <div
                  key={day.toISOString()}
                  ref={(el) => {
                    if (idx === scrollTargetIdx) scrollTargetRef.current = el;
                    if (idx === 0) columnWidthRef.current = el;
                  }}
                  data-cal-room-idx={-1}
                  data-cal-date-idx={idx}
                  onPointerDown={isColumnPickable ? (e) => handleHeaderPointerDown(e, idx) : undefined}
                  onPointerEnter={isColumnPickable ? () => handleHeaderPointerMove(idx) : undefined}
                  onPointerMove={isColumnPickable ? handleGridPointerMove : undefined}
                  onPointerUp={isColumnPickable ? handleGridPointerUp : undefined}
                  role={isColumnPickable ? 'button' : undefined}
                  tabIndex={isColumnPickable ? 0 : undefined}
                  onKeyDown={isColumnPickable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelAnchor({ roomIdx: 0, dateIdx: idx });
                      setSelFocus({ roomIdx: gridRooms.length - 1, dateIdx: idx });
                      setIsPanelOpen(true);
                    }
                  } : undefined}
                  title={isColumnPickable ? 'Select this date across every unit - drag for a range' : undefined}
                  className={`w-16 min-w-16 shrink-0 px-1 py-1.5 text-center border-r transition-all ${
                    isColumnPickable ? 'cursor-pointer' : ''
                  } ${
                    // A pending column outranks the today ring - it's the thing
                    // the user is actively doing, and the two rings on one cell
                    // would otherwise fight.
                    isColumnPending
                      ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 ring-2 ring-inset ring-amber-500 border-amber-500 z-10'
                      : isToday
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm ring-2 ring-inset ring-blue-500 border-blue-500 z-10'
                      : `bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 ${
                          isColumnPickable ? 'hover:bg-amber-50 dark:hover:bg-amber-950/40' : ''
                        }`
                  }`}
                >
                  <div className={`text-[8px] uppercase tracking-wider font-bold ${isToday ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>{dayName}</div>
                  <div className="text-sm font-extrabold leading-none mt-0.5">{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Room Rows */}
          {rooms && rooms.length > 0 ? (
            gridRooms.map((room, roomIdx) => {
              const roomGuests = getGuestsForRoom(room.id, room.name);

              const parseLocalDate = (dateVal: any): Date => {
                if (dateVal instanceof Date) {
                  const d = new Date(dateVal);
                  d.setHours(0, 0, 0, 0);
                  return d;
                }
                const str = String(dateVal || '').split(' ')[0].split('T')[0];
                const parts = str.split('-');
                if (parts.length === 3) {
                  const y = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10) - 1;
                  const d = parseInt(parts[2], 10);
                  return new Date(y, m, d, 0, 0, 0, 0);
                }
                const fallback = new Date(dateVal);
                fallback.setHours(0, 0, 0, 0);
                return fallback;
              };

              const getDaysDiff = (a: Date, b: Date): number => {
                const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
                const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
                return Math.round((utcA - utcB) / (24 * 60 * 60 * 1000));
              };

              // Filter guests overlapping the visible rolling window
              const activeWindowGuests = roomGuests.filter((guest) => {
                const checkinDate = parseLocalDate(guest.checkinDate);
                const checkoutDate = parseLocalDate(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate);
                return checkinDate <= windowEnd && checkoutDate >= windowStart;
              });

              const roomBlockedDates = blockedDates.filter((bd) => {
                if (Number(bd.room_id) !== Number(room.id)) return false;
                const start = parseLocalDate(bd.event_start);
                const end = parseLocalDate(bd.event_end);
                return start <= windowEnd && end >= windowStart;
              });

              // Every date already spoken for in this room (any other guest stay,
              // or any other still-unclaimed OTA block), expanded to individual
              // day strings - fed to ConvertOtaBookingModal's DateRangePicker so
              // adjusting a converted booking's dates gets the same "already
              // taken" highlighting every other booking flow gets. Deliberately
              // not window-limited (unlike activeWindowGuests/roomBlockedDates
              // above, which only cover the visible scroll range) - a staff
              // member could legitimately pick dates outside today's scroll
              // position.
              const expandRangeToDayStrings = (startVal: any, endVal: any): string[] => {
                const days: string[] = [];
                const cur = parseLocalDate(startVal);
                const end = parseLocalDate(endVal);
                while (cur < end) {
                  days.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
                  cur.setDate(cur.getDate() + 1);
                }
                return days;
              };
              const roomOccupiedDateStrings = [
                ...roomGuests.flatMap((g) => expandRangeToDayStrings(g.checkinDate, g.expectedCheckout || g.checkoutDate || g.checkinDate)),
                ...blockedDates
                  .filter((bd) => Number(bd.room_id) === Number(room.id))
                  .flatMap((bd) => expandRangeToDayStrings(bd.event_start, bd.event_end)),
              ];

              type TimelineItem =
                | { kind: 'guest'; start: Date; end: Date; guest: Guest }
                | { kind: 'ota'; start: Date; end: Date; label: string; tooltip: string; block: (typeof blockedDates)[number] };

              const timelineItems: TimelineItem[] = [
                ...activeWindowGuests.map((guest): TimelineItem => ({
                  kind: 'guest',
                  start: parseLocalDate(guest.checkinDate),
                  end: parseLocalDate(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate),
                  guest,
                })),
                ...roomBlockedDates.map((bd): TimelineItem => ({
                  kind: 'ota',
                  start: parseLocalDate(bd.event_start),
                  end: parseLocalDate(bd.event_end),
                  label: bd.source_label || bd.source || t('ota_blocked_label', 'Blocked'),
                  tooltip: t('ota_blocked_tooltip_convertible', '{{source}} - not yet a booking. Click to convert.').replace('{{source}}', bd.source_label || bd.source || 'external calendar'),
                  block: bd,
                })),
              ];

              // Sort by start date ascending
              timelineItems.sort((a, b) => a.start.getTime() - b.start.getTime());

              // Lane assignment algorithm for non-overlapping vertical alignment
              const laneEndDates: Date[] = [];
              const timelineLanesInfo = timelineItems.map((item) => {
                const clampedStart = item.start < windowStart ? windowStart : item.start;
                const clampedEnd = item.end > windowEnd ? new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate() + 1) : item.end;
                const startCol = getDaysDiff(clampedStart, windowStart) + 1;
                const endCol = getDaysDiff(clampedEnd, windowStart) + 1;

                const span = Math.max(1, endCol - startCol);

                let nightlyRate = 0;
                if (item.kind === 'guest') {
                  const amount = (item.guest as any).totalCharge || (item.guest as any).totalAmount || (item.guest as any).total_charge || 0;
                  nightlyRate = Math.round(amount / Math.max(1, span));
                }

                let assignedLane = 0;
                let foundLane = false;
                for (let l = 0; l < laneEndDates.length; l++) {
                  if (laneEndDates[l] <= item.start) {
                    assignedLane = l;
                    laneEndDates[l] = item.end;
                    foundLane = true;
                    break;
                  }
                }
                if (!foundLane) {
                  assignedLane = laneEndDates.length;
                  laneEndDates.push(item.end);
                }

                return {
                  item,
                  startCol,
                  span,
                  nightlyRate,
                  lane: assignedLane,
                };
              });

              const maxLanes = Math.max(1, laneEndDates.length);
              const laneHeight = 32;
              const capsuleHeight = 26;
              const minRowHeight = 44;
              const dynamicHeight = Math.max(minRowHeight, maxLanes * laneHeight + 12);

              // Same-day turnover marker (7 Sep 2026, explicit request): find
              // every pair of items in this room where one's checkout date
              // equals the other's check-in date - i.e. the exact case the
              // capsule inset above exists to keep legible. Rendered as one
              // small combined marker on the shared date instead of relying
              // on the two capsules' own tails/heads alone, since on a
              // narrow mobile column those can still be fiddly to tell apart
              // or tap precisely even with a real gap between them. O(n^2)
              // over this room's own items only - always a small handful in
              // the visible window, never worth a smarter algorithm.
              type TurnoverPoint = {
                dateStr: string;
                dayIdx: number;
                outInfo: (typeof timelineLanesInfo)[number];
                inInfo: (typeof timelineLanesInfo)[number];
              };
              const turnoverPoints: TurnoverPoint[] = [];
              for (const outInfo of timelineLanesInfo) {
                for (const inInfo of timelineLanesInfo) {
                  if (outInfo === inInfo) continue;
                  if (!isSameDate(outInfo.item.end, inInfo.item.start)) continue;
                  const dayIdx = getDaysDiff(outInfo.item.end, windowStart);
                  if (dayIdx < 0 || dayIdx >= daysArray.length) continue; // shared date outside the visible window
                  turnoverPoints.push({ dateStr: formatDateStr(outInfo.item.end), dayIdx, outInfo, inInfo });
                }
              }

              return (
                <div
                  key={room.id}
                  className="flex border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition"
                  style={{ height: `${dynamicHeight}px` }}
                >
                  {/* Room Name */}
                  <div className="w-24 min-w-24 px-2 py-0 font-semibold text-slate-900 dark:text-white text-xs sticky left-0 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-100 dark:border-slate-700/50 flex items-center z-30 shrink-0">
                    {room.name}
                  </div>

                  {/* Days Grid - Background with diagonal stripes */}
                  <div className="flex relative flex-1 overflow-hidden" style={{ width: `${daysArray.length * columnWidth}px`, minWidth: `${daysArray.length * columnWidth}px` }}>
                    {daysArray.map((day, dateIdx) => {
                      const isToday = isSameDate(day, today);
                      const dateStr = formatDateStr(day);
                      const isPast = day < today;
                      const isOccupied = roomOccupiedDateStrings.includes(dateStr);
                      const isUnavailable = isPast || isOccupied;
                      const isBlockedNight = !isOccupied && isNightBlocked(dateStr, room.id);
                      // Airbnb draws the selection as one outlined rectangle
                      // over the whole block, not a border per cell - so each
                      // cell contributes only the edges that are on the outside
                      // of the rectangle.
                      const inSel =
                        !!selRect &&
                        selRect.roomFrom <= roomIdx && roomIdx <= selRect.roomTo &&
                        selRect.dateFrom <= dateIdx && dateIdx <= selRect.dateTo;
                      const selEdge = inSel && selRect
                        ? [
                            roomIdx === selRect.roomFrom ? 'border-t-2 border-t-slate-900 dark:border-t-white' : '',
                            roomIdx === selRect.roomTo ? 'border-b-2 border-b-slate-900 dark:border-b-white' : '',
                            dateIdx === selRect.dateFrom ? 'border-l-2 border-l-slate-900 dark:border-l-white' : '',
                            dateIdx === selRect.dateTo ? 'border-r-2 border-r-slate-900 dark:border-r-white' : '',
                          ].join(' ')
                        : '';
                      return (
                        <div
                          key={`bg-${day.toISOString()}`}
                          data-cal-room-idx={roomIdx}
                          data-cal-date-idx={dateIdx}
                          data-cal-past={isPast ? '1' : undefined}
                          onPointerDown={isPast ? undefined : (e) => handleGridPointerDown(e, roomIdx, dateIdx)}
                          onPointerMove={isPast ? undefined : handleGridPointerMove}
                          onPointerUp={isPast ? undefined : handleGridPointerUp}
                          title={isPast ? undefined : 'Drag to select these nights'}
                          className={`w-16 min-w-16 shrink-0 border-r transition flex items-center justify-center select-none ${
                            isPast ? '' : 'cursor-pointer'
                          } ${
                            inSel
                              ? 'bg-slate-900/[0.07] dark:bg-white/10'
                              : isBlockedNight
                              ? 'bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                              : isToday
                              ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-900/40'
                              : 'border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800/30'
                          } ${!isPast && !inSel ? 'hover:bg-blue-50/60 dark:hover:bg-blue-900/20' : ''} ${selEdge}`}
                          style={inSel ? { touchAction: 'none' } : undefined}
                        >
                          {/* Small per-day price on unbooked dates (4 Sep
                              2026, explicit request) - z-10 to sit above the
                              capsule overlay's own stacking context, though
                              in practice a capsule never actually reaches an
                              unavailable/unbooked cell in the first place. */}
                          {!isUnavailable && (
                            <span
                              className={`relative z-10 text-[9px] leading-none font-medium select-none pointer-events-none ${
                                isBlockedNight
                                  ? 'text-slate-400 dark:text-slate-500 line-through'
                                  : inSel
                                  ? 'text-slate-900 dark:text-white font-bold'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              ₹{Math.round(getDayPrice(dateStr, room))}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Spanning capsules overlaid */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                      {timelineLanesInfo.map((info, idx) => {
                        const topOffset = (dynamicHeight - maxLanes * laneHeight) / 2 + info.lane * laneHeight + (laneHeight - capsuleHeight) / 2;
                        // DESIGN.md "Booking Capsules Must Inset Into the Check-in and
                        // Check-out Cells" - current value 35% per side, see that file's
                        // own revision-history note for how this number was reached (a
                        // same-day turnover's checkout tail + checkin head share ONE date
                        // cell, so they only avoid overlapping when the two visible
                        // fractions sum under 100% - 35%+35%=70% leaves a real 30%-of-a-
                        // cell gap, the fullest a capsule can get while that gap still
                        // reads as a gap, not a seam). CAPSULE_INSET_FRACTION below is
                        // that visible fraction v - NOT how much is trimmed away, so a
                        // BIGGER v means a FULLER capsule (this was flipped backwards in
                        // an earlier pass here - 10% was mistakenly thinner than the
                        // original 20%, not fuller as intended; caught when even larger
                        // numbers were proposed and the arithmetic was re-checked). left =
                        // (S + (1-v)) * w, width = (E - S - (1-2v)) * w, where
                        // S = startCol - 1 (0-based check-in column) and E - S =
                        // info.span (nights). No minimum-width floor here on purpose - a
                        // 1-night stay's true inset width (0.7 * columnWidth at v=0.35) is
                        // already close to a full cell; clamping it wider would push the
                        // capsule past the v mark and recreate the exact collision this
                        // rule exists to prevent. A tiny floor guards only against a
                        // literal zero/negative width, never against "too thin to read" -
                        // detail lives in the click popover, not the bar.
                        const CAPSULE_INSET_FRACTION = 0.35;
                        const commonStyle = {
                          left: `${(info.startCol - CAPSULE_INSET_FRACTION) * columnWidth}px`,
                          width: `${Math.max(2, (info.span - (1 - 2 * CAPSULE_INSET_FRACTION)) * columnWidth)}px`,
                          top: `${topOffset}px`,
                          height: `${capsuleHeight}px`,
                        };

                        if (info.item.kind === 'ota') {
                          const otaItem = info.item;
                          const otaPopoverKey = `ota-${idx}`;
                          const handleConvert = () => {
                            const ownDays = new Set(expandRangeToDayStrings(otaItem.block.event_start, otaItem.block.event_end));
                            setOtaConversionTarget({
                              block: otaItem.block,
                              roomName: room.name,
                              blockedDateStrings: roomOccupiedDateStrings.filter((d) => !ownDays.has(d)),
                            });
                            setOpenOtaPopoverId(null);
                          };
                          return (
                            <Popover
                              key={otaPopoverKey}
                              trigger="click"
                              placement="top"
                              open={openOtaPopoverId === otaPopoverKey}
                              onOpenChange={(isOpen) => setOpenOtaPopoverId(isOpen ? otaPopoverKey : null)}
                              title={
                                <h4 className="font-semibold text-gray-900 dark:text-white text-xs truncate">{otaItem.label}</h4>
                              }
                              content={
                                <div className="w-64 text-xs">
                                  <div className="p-3 space-y-1 text-gray-600 dark:text-gray-300">
                                    <div>{otaItem.tooltip}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleConvert}
                                    className="w-full text-center py-2 text-2xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700/60 transition-colors"
                                  >
                                    {t('convert_to_booking_button', 'Convert to Booking')} →
                                  </button>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                data-cal-capsule="1"
                                className="px-2.5 rounded-md font-semibold cursor-pointer absolute bg-red-600 dark:bg-red-700 hover:bg-red-500 text-white border border-red-700/40 pointer-events-auto shadow-md flex items-center z-20 overflow-hidden transition-colors"
                                style={commonStyle}
                              >
                                <span className="font-semibold truncate text-[11px] leading-none">{otaItem.label}</span>
                              </button>
                            </Popover>
                          );
                        }

                        const guest = info.item.guest;
                        const isOtaBooking = !!(guest as any).otaSource;
                        const OtaIcon = isOtaBooking ? getOtaIcon(guest.otaSourceLabel || guest.otaSource) : null;
                        const isCheckedOut = isCheckedOutStatus(guest.status);
                        const pendingReasons = getGuestPendingReasons(guest);
                        const hasPending = pendingReasons.length > 0;
                        const guestPopoverKey = `${guest.id}-${idx}`;
                        return (
                          <Popover
                            key={guestPopoverKey}
                            trigger="click"
                            placement="top"
                            open={openGuestPopoverId === guestPopoverKey}
                            onOpenChange={(isOpen) => setOpenGuestPopoverId(isOpen ? guestPopoverKey : null)}
                            title={
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="font-semibold text-gray-900 dark:text-white text-xs truncate">{guest.guestName}</h4>
                                {info.nightlyRate > 0 && (
                                  <span className="text-2xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                                    ₹{info.nightlyRate}/night
                                  </span>
                                )}
                              </div>
                            }
                            content={
                              <div className="w-64 text-xs">
                                <div className="p-3 space-y-1.5 text-gray-600 dark:text-gray-300">
                                  <div className="flex items-center justify-between text-2xs">
                                    <span className="text-gray-500 dark:text-gray-400">Room:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">{room.name}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-2xs">
                                    <span className="text-gray-500 dark:text-gray-400">Dates:</span>
                                    <span className="font-medium text-gray-700 dark:text-gray-200">
                                      {formatDateDDMMYYYY(guest.checkinDate)} — {formatDateDDMMYYYY(guest.expectedCheckout || (guest as any).checkoutDate)}
                                    </span>
                                  </div>
                                  {hasPending && (
                                    <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700/60 text-amber-600 dark:text-amber-400 text-2xs font-semibold flex items-center gap-1.5">
                                      <span className="flex w-2 h-2 bg-yellow-400 dark:bg-yellow-300 rounded-full shrink-0 shadow-xs ring-1 ring-yellow-600/40" />
                                      <span>Action Pending: {pendingReasons.join(', ')}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-800/50">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedGuest(guest);
                                      setOpenGuestPopoverId(null);
                                    }}
                                    className="w-full text-center text-2xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer transition-colors"
                                  >
                                    {t('view_more_button', 'View More')} →
                                  </button>
                                </div>
                              </div>
                            }
                          >
                            <div
                              data-tour="checkin-open-booking-bar"
                              className={`px-2.5 rounded-md font-semibold cursor-pointer hover:shadow-md transition-all absolute ${
                                isOtaBooking && !isCheckedOut
                                  ? 'bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 text-white border border-amber-700/30'
                                  : getGuestColor(guest.id, guest.status)
                              } pointer-events-auto shadow-md flex items-center justify-between gap-1.5 z-20 overflow-hidden`}
                              data-cal-capsule="1"
                              style={commonStyle}
                            >
                              <span className="font-semibold truncate text-[11px] leading-none flex items-center gap-1.5 min-w-0">
                                {hasPending && (
                                  <span
                                    className="flex w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-300 rounded-full shrink-0 shadow-xs ring-1 ring-yellow-600/50"
                                  />
                                )}
                                {isOtaBooking && (OtaIcon ? (
                                  <OtaIcon className="w-3 h-3 shrink-0 rounded-[2px]" />
                                ) : (
                                  <Globe className="w-2.5 h-2.5 shrink-0" />
                                ))}
                                <span className="truncate">
                                  {getFirstName(guest.guestName)}
                                  {isOtaBooking && (guest.otaSourceLabel || guest.otaSource) ? ` (${guest.otaSourceLabel || guest.otaSource})` : ''}
                                </span>
                              </span>
                              <span className="text-[10px] font-medium opacity-90 whitespace-nowrap leading-none shrink-0">₹{info.nightlyRate}</span>
                            </div>
                          </Popover>
                        );
                      })}

                      {/* Same-day turnover markers (7 Sep 2026, explicit
                          request): a small combined marker on the shared
                          date, on top of the two capsules (z-30 above
                          their z-20), so a fiddly tap between two adjacent
                          tails/heads isn't the only way to tell them apart -
                          tapping it lists both and lets you pick. Deliberately
                          doesn't touch the two capsules' own name/rate labels;
                          this is additive, not a replacement for them. */}
                      {turnoverPoints.map((tp, tpIdx) => {
                        const badgeLane = Math.min(tp.outInfo.lane, tp.inInfo.lane);
                        const topOffset = (dynamicHeight - maxLanes * laneHeight) / 2 + badgeLane * laneHeight + (laneHeight - capsuleHeight) / 2;
                        const turnoverKey = `turnover-${tp.dateStr}-${tpIdx}`;
                        const describeItem = (info: (typeof timelineLanesInfo)[number]) =>
                          info.item.kind === 'guest' ? info.item.guest.guestName : info.item.label;
                        const viewItem = (info: (typeof timelineLanesInfo)[number]) => {
                          if (info.item.kind === 'guest') {
                            setSelectedGuest(info.item.guest);
                          } else {
                            const ownDays = new Set(expandRangeToDayStrings(info.item.block.event_start, info.item.block.event_end));
                            setOtaConversionTarget({
                              block: info.item.block,
                              roomName: room.name,
                              blockedDateStrings: roomOccupiedDateStrings.filter((d) => !ownDays.has(d)),
                            });
                          }
                          setOpenTurnoverPopoverId(null);
                        };
                        return (
                          <Popover
                            key={turnoverKey}
                            trigger="click"
                            placement="top"
                            open={openTurnoverPopoverId === turnoverKey}
                            onOpenChange={(isOpen) => setOpenTurnoverPopoverId(isOpen ? turnoverKey : null)}
                            title={
                              <h4 className="font-semibold text-gray-900 dark:text-white text-xs">
                                {t('turnover_popover_title', '2 bookings on {{date}}').replace('{{date}}', formatDateDDMMYYYY(tp.dateStr))}
                              </h4>
                            }
                            content={
                              <div className="w-56 text-xs divide-y divide-gray-100 dark:divide-gray-700/60">
                                <button
                                  type="button"
                                  onClick={() => viewItem(tp.outInfo)}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                >
                                  <span className="text-gray-500 dark:text-gray-400">{t('turnover_checkout_label', 'Checks out')}</span>
                                  <span className="font-semibold text-gray-900 dark:text-white truncate ml-2">{describeItem(tp.outInfo)}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => viewItem(tp.inInfo)}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                >
                                  <span className="text-gray-500 dark:text-gray-400">{t('turnover_checkin_label', 'Checks in')}</span>
                                  <span className="font-semibold text-gray-900 dark:text-white truncate ml-2">{describeItem(tp.inInfo)}</span>
                                </button>
                              </div>
                            }
                          >
                            <button
                              type="button"
                              data-cal-capsule="1"
                              aria-label={t('turnover_marker_label', 'Same-day turnover - view both bookings')}
                              className="absolute flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md ring-2 ring-white dark:ring-slate-900 pointer-events-auto z-30 cursor-pointer hover:scale-110 transition-transform"
                              style={{
                                left: `${tp.dayIdx * columnWidth + columnWidth / 2 - 12}px`,
                                top: `${topOffset + capsuleHeight / 2 - 12}px`,
                              }}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                          </Popover>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-slate-600 dark:text-slate-400">
              {t('today_no_rooms_message', 'No rooms available')}
            </div>
          )}
        </div>
      </div>

      {/* Multi-Calendar Legend Footer */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-start gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          {/* "Today" swatch (7 Sep 2026, feature-parity pass) - this grid
              highlights today's column in blue (see the isToday styling on
              the date header/day cells above) exactly like
              OperationalDashboard.tsx's month grid does, so it needs the
              same legend entry explaining the convention. Its own legend
              comment used to claim this calendar "doesn't need" a Today
              swatch since it "has no month-grid to mark a day within" - that
              was true when written, not any more: this calendar visually
              marks today the same way the single-property one does. */}
          <div className="flex items-center gap-2">
            <span className="w-5 h-3.5 rounded-xs bg-blue-50 dark:bg-blue-900/50 border border-blue-400 inline-block shadow-md" />
            <span>{t('legend_today', 'Today')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-3.5 rounded-xs bg-blue-600 inline-block shadow-md" />
            <span>{t('legend_direct_booking', 'Direct Booking')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-3.5 rounded-xs bg-amber-600 inline-flex items-center justify-center text-white text-[9px] shadow-md">
              <Globe className="w-2.5 h-2.5" />
            </span>
            <span>{t('legend_ota_converted', 'Converted OTA Bookings')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-3.5 rounded-xs bg-red-600 dark:bg-red-700 border border-red-700/40 inline-block shadow-md" />
            <span>{t('legend_ota_blocked', 'OTA Blocked Date')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-3.5 rounded-xs bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 inline-block shadow-md" />
            <span>{t('legend_checked_out', 'Checked Out Stay')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-300 rounded-full shadow-xs ring-1 ring-yellow-600/50" />
            <span>{t('legend_pending_action', 'Action Pending (ID, C-Form, Check-in/out)')}</span>
          </div>
        </div>
      </div>
      </div>

      {selectedGuest && onUpdateGuest && (
        <BookingDetailsModal
          guest={selectedGuest}
          onClose={() => setSelectedGuest(null)}
          onSave={async (updated) => { await onUpdateGuest(updated); setSelectedGuest(updated); }}
          onDelete={onDeleteGuest ? async (id) => { await onDeleteGuest(id); setSelectedGuest(null); } : undefined}
          rooms={rooms}
          checkedInGuests={calendarGuests}
          propertyName={propertyName}
          propertyMapsLink={propertyMapsLink}
          propertyPhone={propertyPhone}
          propertyWhatsappTemplate={propertyWhatsappTemplate}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
          propertySecurityDeposit={propertySecurityDeposit}
          propertyAddress={propertyAddress}
          propertyInstructions={propertyInstructions}
          propertyGuestInfo={propertyGuestInfo}
          propertyCheckinTime={propertyCheckinTime}
          propertyCheckoutTime={propertyCheckoutTime}
          onCheckout={onCheckout ? () => { onCheckout(selectedGuest.id); setSelectedGuest(null); } : undefined}
          // Both endpoints have already written to the DB by the time these
          // fire - these only keep the calendar and the rest of the app in
          // step with what the modal just did, without a reload.
          onCheckedIn={(guestId) => {
            setSelectedGuest((prev) => (prev ? { ...prev, status: GUEST_STATUS_CHECKED_IN as any } : prev));
            onCheckInGuest?.(guestId);
          }}
          onIdVerified={(guestId) => {
            setSelectedGuest((prev) => (prev ? { ...prev, idVerificationStatus: 'Complete' } : prev));
            onGuestVerificationUpdated?.(guestId);
          }}
          onCFormFiled={(guestId, filedAt) => {
            setSelectedGuest((prev) => (prev ? { ...prev, cFormFiledAt: filedAt } : prev));
            onCFormFiledUpdated?.(guestId, filedAt);
          }}
        />
      )}

      {/* Convert OTA Block to Booking - removed 3 Sep 2026, iCal sync retired
          (ConvertOtaBookingModal.tsx archived to _unwanted/ical/). otaConversionTarget
          can never actually be set any more (see the blockedDates comment above). */}

      {/* Airbnb-style editor for whatever rectangle is selected on the grid.
          Deliberately backdrop-free so the calendar stays visible and the
          selection can still be adjusted underneath it - see the component's
          own header comment. */}
      {isPanelOpen && selectionInfo && (
        <CalendarEditorPanel
          selection={selectionInfo.selection}
          priceLow={selectionInfo.priceLow}
          priceHigh={selectionInfo.priceHigh}
          blockedCells={selectionInfo.blockedCells}
          totalCells={selectionInfo.totalCells}
          bookedCells={selectionInfo.bookedCells}
          onChangeDates={setSelectionDates}
          onClose={clearSelection}
          onSaved={() => { loadRateRules(); clearSelection(); }}
          // Offered only when the rectangle is one unit with nothing already
          // sold in it - a booking is one guest in one room, so a multi-unit
          // selection has no single booking to create, and a selection with a
          // sold night in it would collide with that stay.
          onAddBooking={
            selectionInfo.selection.roomIds.length === 1 && selectionInfo.bookedCells === 0
              ? () => {
                  const checkoutDate = new Date(selectionInfo.selection.endDate + 'T00:00:00');
                  checkoutDate.setDate(checkoutDate.getDate() + 1);
                  // The panel's range is NIGHTS (last night inclusive); a
                  // booking's second date is its CHECK-OUT, the morning after
                  // the last night. Hence the +1 - the same conversion the old
                  // two-click flow did in reverse.
                  onAddBooking?.({
                    roomName: selectionInfo.selection.roomNames[0],
                    checkin: selectionInfo.selection.startDate,
                    checkout: formatDateStr(checkoutDate),
                  });
                  clearSelection();
                }
              : undefined
          }
          onOpenAllRules={() => {
            setRateModalRoomIds(selectionInfo.selection.roomIds);
            setRateRuleStartDate(selectionInfo.selection.startDate);
            setRateRuleEndDate(selectionInfo.selection.endDate);
            setShowRateRuleModal(true);
          }}
        />
      )}

      {showRateRuleModal && (
        <RateRuleModal
          isOpen={showRateRuleModal}
          onClose={() => { setShowRateRuleModal(false); setRateModalRoomIds(undefined); setRateRuleStartDate(undefined); setRateRuleEndDate(undefined); }}
          rooms={rooms}
          rateRules={rateRules}
          pricingMode={pricingMode}
          defaultTariff={defaultTariff}
          onRulesUpdated={loadRateRules}
          initialStartDate={rateRuleStartDate}
          initialEndDate={rateRuleEndDate}
          initialRoomIds={rateModalRoomIds}
        />
      )}
    </div>
  );
};

