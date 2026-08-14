import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Building,
  X,
  Calendar,
  QrCode,
  Share2,
  Printer,
  Trash2,
  Home,
  Utensils,
  Plus,
  Flag,
  AlertTriangle,
  CheckCircle2,
  CornerDownRight
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { Guest, BillingReceipt, MiscChargeTemplate, MenuItem } from '../types';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { useStaff } from '../contexts/StaffContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useConfigurationData } from '../contexts/ConfigurationDataContext';
import {
  GUEST_STATUS_CHECKED_IN,
  GUEST_STATUS_CHECKED_OUT,
  GUEST_STATUS_BOOKED,
  GUEST_STATUS_ACTIVE_LEGACY,
  GUEST_STATUS_CHECKEDOUT_LEGACY,
} from '../constants/guestStatus';
import { getPropertySlug } from '../services/api';
import { DateRangePicker } from './DateRangePicker';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { getExpenseItemIcon } from '../utils/expenseIcons';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { BillingCheckout } from './BillingCheckout';
import { TodayOverview } from './TodayOverview';
import { GuestHistory } from './GuestHistory';
import { BookingDetailsModal } from './BookingDetailsModal';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order?: number;
  is_active?: number;
  default_tariff?: number | null;
}

interface GuestManagementProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  menu: MenuItem[];
  onAddGuest: (guest: Guest) => void;
  onCheckoutGuest: (receipt: BillingReceipt) => void;
  onUpdateGuest?: (updatedGuest: Guest) => void;
  onDeleteGuest?: (guestId: string) => Promise<void>;
  onCheckInGuest?: (guestId: string) => Promise<void>;
  onGuestVerificationUpdated?: (guestId: string, verified: boolean) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  activeMenuItemKey?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  isMultiKeyProperty?: boolean;
  rooms?: Room[];
  onNavigateToBilling?: (guestId: string) => void;
  onSetActiveMenuItemKey?: (key: string) => void;
  selectedRoomSlug?: string | null;
  preSelectRoom?: string;
  onClose?: () => void;
  focusGuestId?: string | null;
  onClearFocusGuest?: () => void;
  kitchenModuleEnabled?: boolean;
  propertyGstin?: string;
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
}



export interface IncidentalsItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface AdjustmentItem {
  id: string;
  reason: string;
  amount: number;
  type: 'charge' | 'discount';
}

export interface PaymentSplitRow {
  id: number;
  amount: number;
  mode: 'Cash' | 'UPI';
  recipient: string;
}

export const GuestManagement: React.FC<GuestManagementProps> = ({
  guests,
  receipts,
  menu,
  onAddGuest,
  onCheckoutGuest,
  onUpdateGuest,
  onDeleteGuest,
  activeMenuItemKey,
  onDispatchTelegram,
  isMultiKeyProperty = false,
  rooms = [],
  onNavigateToBilling,
  onSetActiveMenuItemKey: _onSetActiveMenuItemKey,
  selectedRoomSlug,
  preSelectRoom,
  onClose,
  onCFormFiledUpdated,
  kitchenModuleEnabled = true,
  propertyGstin = '',
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
}) => {
  const { orders } = useKitchenContext();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { staff } = useStaff();
  const { miscCharges } = useConfigurationData();
  const [isAddBookingModalOpen, setIsAddBookingModalOpen] = useState(false);


  // Form Checkin State
  const [guestName, setGuestName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [bookingSourceLocal, setBookingSourceLocal] = useState('Offline');
  const [advanceReceivedBy, setAdvanceReceivedBy] = useState('');
  const [pendingReceivedBy, setPendingReceivedBy] = useState('');
  const [checkinDate, setCheckinDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkinTime, setCheckinTime] = useState('14:00');
  const [expectedCheckout, setExpectedCheckout] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  );
  const [checkoutTime, setCheckoutTime] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [showGuestNotes, setShowGuestNotes] = useState(false);
  const [isForeignGuest, setIsForeignGuest] = useState(false);
  const [showDynamicIncidentals, setShowDynamicIncidentals] = useState(false);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [noOfGuests, setNoOfGuests] = useState(1);
  const [createdBooking, setCreatedBooking] = useState<Guest | null>(null);
  // Set when "Manage" is clicked on a row in the recent-bookings list on this
  // same page - carried over to BillingCheckout below so it lands on the
  // right Today/Upcoming/Past tab with this exact booking already filtered
  // into view, instead of just dropping the admin on the page in general.
  const [focusBookingGuestId] = useState<string | null>(null);
  const [selectedGuestForDetails, setSelectedGuestForDetails] = useState<Guest | null>(null);

  // Set default room for MultiKey properties on component mount
  useEffect(() => {
    if (isMultiKeyProperty && rooms && rooms.length > 0) {
      let roomToSelect = null;

      // If preSelectRoom is provided (e.g., from modal on room view), use that
      if (preSelectRoom) {
        // Check if preSelectRoom exactly matches a room name
        const exactMatch = rooms.find((r) => r.name === preSelectRoom);
        if (exactMatch) {
          roomToSelect = preSelectRoom;
        } else {
          // Try to find room by extracting number from name
          roomToSelect = preSelectRoom;
        }
      } else if (selectedRoomSlug) {
        // If coming from a specific room view, pre-select that room
        const selectedRoom = rooms.find((r) => r.slug === selectedRoomSlug);
        if (selectedRoom) {
          roomToSelect = selectedRoom.name;
        }
      } else if (!roomNumber) {
        // Otherwise, pre-select the first room
        roomToSelect = rooms[0].name;
      }

      if (roomToSelect) {
        setRoomNumber(roomToSelect);
      }
    }
  }, [isMultiKeyProperty, rooms.length, selectedRoomSlug, preSelectRoom]);

  // Registration Form State
  const [bookingRoomTariff, setBookingRoomTariff] = useState<number>(0);
  const [bookingAdvance, setBookingAdvance] = useState<number>(0);
  const [bookingPending, setBookingPending] = useState<number>(0);
  const [bookingIncidentals, setBookingIncidentals] = useState<{type: string, amount: number}[]>([]);
  const [miscChargesList, setMiscChargesList] = useState<MiscChargeTemplate[]>([]);
  const [blockedDates, setBlockedDates] = useState<Array<{
    event_start: string;
    event_end: string;
    event_title: string;
    reservation_url?: string;
    source?: string;
    source_label?: string;
    room_id?: number;
  }>>([]);

  useEffect(() => {
    setMiscChargesList(miscCharges as MiscChargeTemplate[]);
  }, [miscCharges]);

  // Fetch blocked dates from iCal
  useEffect(() => {
    const fetchBlockedDates = async () => {
      try {
        const propertySlug = getPropertySlug();
        const response = await fetch('/php/api/ical_sync.php?action=get_blocked_dates', {
          headers: { 'X-Property-Slug': propertySlug },
          credentials: 'include',
        });
        const data = await response.json();
        if (data.status === 'success' && data.data) {
          setBlockedDates(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch blocked dates:', error);
      }
    };
    fetchBlockedDates();
  }, []);

  // Get all blocked date strings for DatePicker
  const getBlockedDateStrings = (): string[] => {
    const blocked: string[] = [];

    // Resolved once, used by both sections below - iCal blocks need this too
    // (see 1.), not just existing guest bookings (2.).
    const selectedRoomObj = rooms.find((r) => r.name === roomNumber || r.slug === roomNumber);
    const selectedRoomId = selectedRoomObj?.id;

    // 1. iCal blocked dates - only the currently selected room's own blocks.
    // For a multi-key property, ical_sync.php's get_blocked_dates returns every
    // room's synced events in one call (room_id per row) so the calendar view
    // can show all of them - but here, picking a date for Room 101 must not
    // also disable dates that are only actually blocked on Room 102's feed.
    // isMultiKeyProperty ? undefined room_id rows (shouldn't happen once every
    // sync is tied to a room) fall through and are ignored, not blocked -
    // safer to under-block than to falsely block an available room.
    blockedDates
      .filter((bd) => !isMultiKeyProperty || (selectedRoomId != null && Number(bd.room_id) === Number(selectedRoomId)))
      .forEach((bd) => {
        const start = new Date(bd.event_start.split(' ')[0]);
        const end = new Date(bd.event_end.split(' ')[0]);
        let current = new Date(start);
        while (current < end) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          blocked.push(`${year}-${month}-${day}`);
          current = new Date(current.getTime() + 86400000);
        }
      });

    // 2. Existing guest bookings for the currently selected room

    guests
      .filter((g) => g.status === GUEST_STATUS_CHECKED_IN || (g.status as string) === GUEST_STATUS_ACTIVE_LEGACY || g.status === GUEST_STATUS_BOOKED)
      .filter((g) => {
        const gRoomId = (g as any).roomId || (g as any).room_id;
        if (selectedRoomId && gRoomId && Number(gRoomId) === Number(selectedRoomId)) return true;
        if (g.roomNumber && roomNumber && g.roomNumber.toLowerCase().trim() === roomNumber.toLowerCase().trim()) return true;
        return false;
      })
      .forEach((g) => {
        const checkinStr = (g.checkinDate || '').split(' ')[0].split('T')[0];
        const checkoutStr = (g.expectedCheckout || g.checkoutDate || g.checkinDate || '').split(' ')[0].split('T')[0];
        if (!checkinStr) return;

        const [sy, sm, sd] = checkinStr.split('-').map(Number);
        const [ey, em, ed] = (checkoutStr || checkinStr).split('-').map(Number);

        if (!sy || !sm || !sd) return;

        const start = new Date(sy, sm - 1, sd, 12, 0, 0);
        const end = ey && em && ed ? new Date(ey, em - 1, ed, 12, 0, 0) : new Date(start);

        const current = new Date(start);
        while (current < end) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          blocked.push(`${y}-${m}-${d}`);
          current.setDate(current.getDate() + 1);
        }
      });

    return blocked;
  };

  const handleTariffChange = (val: number) => {
    setBookingRoomTariff(val);
    setBookingPending(val - bookingAdvance);
  };
  const handleRoomChange = (roomName: string) => {
    setRoomNumber(roomName);
    if (bookingRoomTariff === 0) {
      const selectedRoom = rooms.find(r => r.name === roomName);
      if (selectedRoom && selectedRoom.default_tariff != null) {
        setBookingRoomTariff(selectedRoom.default_tariff);
      }
    }
  };
  const handleAdvanceChange = (val: number) => {
    setBookingAdvance(val);
    setBookingPending(bookingRoomTariff - val);
  };
  const handlePendingChange = (val: number) => {
    setBookingPending(val);
    setBookingAdvance(bookingRoomTariff - val);
  };

  // Used right after a successful save (the form previously stayed populated
  // with the just-submitted guest's details - the "Booking saved" toast fired,
  // but nothing was actually cleared for the next entry) and by the voucher's
  // Close button.
  const resetBookingForm = () => {
    setGuestName('');
    setPhoneNumber('');
    setBookingSourceLocal('Offline');
    setAdvanceReceivedBy('');
    setPendingReceivedBy('');
    setCheckinDate(new Date().toISOString().split('T')[0]);
    setCheckinTime('14:00');
    setExpectedCheckout(new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]);
    setCheckoutTime('11:00');
    setNotes('');
    setShowGuestNotes(false);
    setIsForeignGuest(false);
    setShowDynamicIncidentals(false);
    setNoOfGuests(1);
    setBookingRoomTariff(0);
    setBookingAdvance(0);
    setBookingPending(0);
    setBookingIncidentals([]);
    if (isMultiKeyProperty && rooms && rooms.length > 0) {
      setRoomNumber(rooms[0].name);
    }
  };

  // Selected Active Guest for Billing
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkedInGuests = guests.filter((g) => {
    if (g.status !== GUEST_STATUS_ACTIVE_LEGACY && (g.status as string) !== GUEST_STATUS_CHECKED_IN) return false;
    // Also check if guest is currently staying (today is between checkin and checkout)
    const checkinDate = new Date(g.checkinDate);
    const checkoutDate = new Date(g.expectedCheckout);
    checkinDate.setHours(0, 0, 0, 0);
    checkoutDate.setHours(0, 0, 0, 0);
    return today >= checkinDate && today < checkoutDate;
  });
  const [selectedGuestId, setSelectedGuestId] = useState<string>(checkedInGuests[0]?.id || '');

  // BUG 2 FIX: Auto-select first Active guest when guests prop changes
  useEffect(() => {
    if (checkedInGuests.length > 0 && !checkedInGuests.find((g) => g.id === selectedGuestId)) {
      setSelectedGuestId(checkedInGuests[0].id);
    }
  }, [guests]);

  // Lodging Breakdown Data â€” initialized from guest data (BUG 6 FIX)
  const [baseLodging, setBaseLodging] = useState(0);
  const [advancePaid, setAdvancePaid] = useState(0);
  const [advancePayer] = useState('');
  const [pendingSettledBy] = useState('');

  // Incidentals Log Items
  const [incidentals, setIncidentals] = useState<IncidentalsItem[]>([]);

  // Insert Food Form
  const [selectedDishId, setSelectedDishId] = useState<string>('');
  const [customDishName, setCustomDishName] = useState('');
  const [customDishPrice, setCustomDishPrice] = useState<number | ''>('');
  const [insertQty, setInsertQty] = useState<number>(1);

  // Custom Adjustments
  const [adjustments, setAdjustments] = useState<AdjustmentItem[]>([
    { id: 'adj-1', reason: 'Misc', amount: 200, type: 'charge' },
  ]);

  // Add Adjustment Form
  const [adjType, setAdjType] = useState<'charge' | 'discount'>('charge');
  const [adjReasonCharge, setAdjReasonCharge] = useState('Misc');
  const [adjReasonDiscount, setAdjReasonDiscount] = useState('');
  const [adjAmount, setAdjAmount] = useState<number | ''>('');

  // Desk Cashier Handling
  const [deskCashier] = useState(staff.length > 0 ? staff[0].name : '');

  // Split Payment Matrix Rows
  const [splitRows, setSplitRows] = useState<PaymentSplitRow[]>([
    { id: 1, amount: 2293.0, mode: 'Cash', recipient: 'On-Site Cash Safe' },
  ]);

  // QR Modal Lightbox
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrModalTitle, setQrModalTitle] = useState('');
  const [qrModalHasCode, setQrModalHasCode] = useState(false);

  // Track which order-items the cashier manually removed â€” persisted to localStorage so page refresh doesn't restore them
  const getRemovedKey = (guestId: string) => `billing_removed_${guestId}`;

  const getRemovedIds = (guestId: string): Set<string> => {
    try {
      const saved = localStorage.getItem(getRemovedKey(guestId));
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  };

  const addRemovedId = (guestId: string, itemId: string) => {
    const set = getRemovedIds(guestId);
    set.add(itemId);
    localStorage.setItem(getRemovedKey(guestId), JSON.stringify([...set]));
  };

  // GST optional toggle â€” rate auto-detected from room tariff slab
  const [gstEnabled, setGstEnabled] = useState(false);
  const getGstSlab = (rate: number): number => {
    if (rate <= 1000) return 5;
    if (rate <= 2500) return 12;
    if (rate <= 5000) return 18;
    return 28;
  };
  const gstAccommodationRate = getGstSlab(baseLodging);
  const gstFoodRate = 5;

  // Print-Friendly Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Active Guest Object â€” BUG 3 FIX: fallback to first Active guest, not guests[0]
  const currentGuest = guests.find((g) => g.id === selectedGuestId) || checkedInGuests[0];

  // Whenever selected guest changes, auto-load their fulfilled orders into incidentals
  // BUG 6 FIX: Initialize lodging amounts from guest data
  // BUG 9 FIX: Clear hardcoded incidentals on guest switch (initialize to [])
  // BUG 10 FIX: Reset adjustments and split state on guest switch
  useEffect(() => {
    if (currentGuest) {
      // BUG 6: Initialize lodging from guest data
      setBaseLodging(currentGuest.roomRate ?? currentGuest.totalAmount ?? 0);
      setAdvancePaid(currentGuest.advanceAmount ?? 0);

      const savedRemoved = getRemovedIds(currentGuest.id);
      const guestOrders = orders.filter((o) => o.guestId === currentGuest.id || o.guestName === currentGuest.guestName);
      if (guestOrders.length > 0) {
        const loadedItems: IncidentalsItem[] = [];
        guestOrders.forEach((o) => {
          o.items.forEach((it, idx) => {
            const itemId = `order-${o.id}-${idx}`;
            if (!savedRemoved.has(itemId)) {
              loadedItems.push({
                id: itemId,
                name: it.name,
                price: it.unitPrice,
                quantity: it.quantity,
              });
            }
          });
        });
        setIncidentals(loadedItems);
      } else {
        setIncidentals([]);
      }
      // BUG 10: Reset adjustments and split state when switching guests
      setAdjustments([]);
      setSplitRows([{ id: 1, amount: 0, mode: 'Cash', recipient: 'On-Site Cash Safe' }]);
    }
  }, [selectedGuestId]);

  // Calculate Subtotals & Totals
  const foodTotal = incidentals.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const extraCharges = adjustments
    .filter((a) => a.type === 'charge')
    .reduce((sum, a) => sum + a.amount, 0);
  const discounts = adjustments
    .filter((a) => a.type === 'discount')
    .reduce((sum, a) => sum + a.amount, 0);
  const netAdjustments = extraCharges - discounts;

  const lodgingPendingDue = Math.max(0, baseLodging - advancePaid);
  const preGstTotal = Math.max(0, lodgingPendingDue + foodTotal + netAdjustments);
  const gstAccommodationAmount = gstEnabled ? Math.round((lodgingPendingDue + netAdjustments) * gstAccommodationRate) / 100 : 0;
  const gstFoodAmount = gstEnabled ? Math.round(foodTotal * gstFoodRate) / 100 : 0;
  const gstAmount = gstAccommodationAmount + gstFoodAmount;
  const gstCgst = gstAmount / 2;
  const gstSgst = gstAmount / 2;
  const grandTargetDue = preGstTotal + gstAmount;

  // Auto Balance Split Payment Rows
  const totalSplitSum = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const isSplitMatching = Math.abs(totalSplitSum - grandTargetDue) < 0.01;

  // Sync first split row when grandTargetDue changes if only 1 split row
  useEffect(() => {
    if (splitRows.length === 1) {
      setSplitRows([{ ...splitRows[0], amount: grandTargetDue }]);
    }
  }, [grandTargetDue]);

  // Handle Qty Update on Incidentals Item
  const handleUpdateIncidentalsQty = (id: string, delta: number) => {
    setIncidentals((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) {
              // Persist removal to localStorage so it survives page refresh
              if (currentGuest) addRemovedId(currentGuest.id, id);
              return null;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as IncidentalsItem[]
    );
  };

  // Handle Direct Food Insert
  const handleInsertFoodItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDishId) return;

    let dishName = '';
    let dishPrice = 0;

    if (selectedDishId === 'custom') {
      if (!customDishName.trim() || !customDishPrice || Number(customDishPrice) <= 0) {
        showToast('Please provide a valid Custom Dish Name and Price.', { type: 'warning' });
        return;
      }
      dishName = customDishName.trim();
      dishPrice = Number(customDishPrice);
    } else {
      const dish = menu.find((d) => d.id === Number(selectedDishId));
      if (!dish) return;
      dishName = dish.name;
      dishPrice = dish.price;
    }

    const newItem: IncidentalsItem = {
      id: `inc-${Date.now()}`,
      name: dishName,
      price: dishPrice,
      quantity: Math.max(1, insertQty),
    };

    setIncidentals((prev) => [...prev, newItem]);

    // Reset Form
    setSelectedDishId('');
    setCustomDishName('');
    setCustomDishPrice('');
    setInsertQty(1);
  };

  // Handle Custom Adjustment Form Submit
  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjAmount || Number(adjAmount) <= 0) return;

    const reasonText =
      adjType === 'charge' ? adjReasonCharge : adjReasonDiscount.trim() || 'Service Rebate';

    const newAdj: AdjustmentItem = {
      id: `adj-${Date.now()}`,
      reason: reasonText,
      amount: Number(adjAmount),
      type: adjType,
    };

    setAdjustments((prev) => [...prev, newAdj]);
    setAdjAmount('');
    setAdjReasonDiscount('');
  };

  const handleRemoveAdjustment = (id: string) => {
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
  };

  // Split Row Handlers
  const handleAddSplitRow = () => {
    const nextId = Date.now();
    const remaining = Math.max(0, grandTargetDue - totalSplitSum);
    setSplitRows((prev) => [
      ...prev,
      { id: nextId, amount: remaining, mode: 'UPI', recipient: 'Tarpan [Staff]' },
    ]);
  };

  const handleRemoveSplitRow = (id: number) => {
    if (splitRows.length === 1) return;
    setSplitRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      // Balance remaining into first row
      const otherSum = next.slice(1).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const firstBal = Math.max(0, grandTargetDue - otherSum);
      if (next[0]) next[0].amount = firstBal;
      return next;
    });
  };

  const handleUpdateSplitRow = (id: number, field: keyof PaymentSplitRow, value: any) => {
    setSplitRows((prev) => {
      return prev.map((row, idx) => {
        if (row.id === id) {
          const updated = { ...row, [field]: value };
          if (field === 'amount' && idx !== 0) {
            // Auto balance back into row 0
            const numVal = Number(value) || 0;
            const otherRowsSum = prev.reduce((acc, r, i) => {
              if (i === 0 || r.id === id) return acc;
              return acc + (Number(r.amount) || 0);
            }, numVal);
            const bal0 = Math.max(0, grandTargetDue - otherRowsSum);
            if (prev[0]) prev[0].amount = bal0;
          }
          return updated;
        }
        return row;
      });
    });
  };

  // QR Code Lightbox Trigger
  const handleTriggerQrModal = (recipient: string) => {
    setQrModalTitle(recipient);
    // Has screenshot for Tarpan or Nandkishore
    const hasCode = recipient.includes('Tarpan') || recipient.includes('Nandkishore');
    setQrModalHasCode(hasCode);
    setIsQrModalOpen(true);
  };

  // Complete Checkout Execution
  const handleCompleteCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSplitMatching) {
      showToast(`Error: Split sum (₹${totalSplitSum.toFixed(2)}) must equal target due (₹${grandTargetDue.toFixed(2)}) exactly.`, { type: 'error' });
      return;
    }

    const confirmed = await confirm({
      title: 'Finalize Checkout',
      message: 'Finalize room contract checkout distribution operations?',
      confirmText: 'Finalize Checkout',
      variant: 'warning',
    });

    if (confirmed) {
      if (currentGuest) {
        const checkoutDateStr = new Date().toISOString().split('T')[0];
        const primaryMode = splitRows[0]?.mode || 'UPI';

        const receipt: BillingReceipt = {
          id: `REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
          guestId: currentGuest.id,
          guestName: currentGuest.guestName,
          roomNumber: currentGuest.roomNumber,
          checkinDate: currentGuest.checkinDate,
          checkoutDate: checkoutDateStr,
          roomRatePerNight: currentGuest.roomRate ?? (baseLodging > 0 ? Math.round(baseLodging / 2) : 0),
          nightsCount: Math.max(1, Math.ceil((new Date(checkoutDateStr).getTime() - new Date(currentGuest.checkinDate).getTime()) / 86400000)),
          roomTotal: lodgingPendingDue,
          kitchenTotal: foodTotal,
          miscTotal: extraCharges,
          discount: discounts,
          grandTotal: grandTargetDue,
          gstEnabled,
          gstRate: gstAccommodationRate,
          gstAmount,
          gstCgst,
          gstSgst,
          gstAccommodationRate,
          gstFoodRate,
          gstAccommodationAmount,
          gstFoodAmount,
          status: 'Paid',
          paidAt: `${checkoutDateStr} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          paymentMethod: primaryMode,
          advancePaid: advancePaid,
          foodItems: incidentals.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.price, total: i.price * i.quantity })),
          adjustments: adjustments.map(a => ({ type: a.type, label: a.reason, amount: a.amount }))
        };

        onCheckoutGuest(receipt);

        if (onDispatchTelegram) {
          const modes = splitRows.map(r => `${r.mode}: ₹${r.amount.toLocaleString('en-IN')}`).join(', ');
          const msg = `<b>📶 GUEST CHECKOUT</b>\n━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> ${receipt.guestName}\n🏠 <b>Room:</b> ${receipt.roomNumber}\n🏨 <b>Lodging:</b> ₹${(receipt.roomTotal || 0).toLocaleString('en-IN')}\n🍽 <b>Food:</b> ₹${(receipt.kitchenTotal || 0).toLocaleString('en-IN')}\n📋 <b>Misc:</b> ₹${(receipt.miscTotal || 0).toLocaleString('en-IN')}\n💳 <b>Payment:</b> ${modes}\n💰 <b>Grand Total:</b> ₹${receipt.grandTotal.toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━`;
          onDispatchTelegram('Guest Checkout Settlement', msg, 'finance');
        }

        showToast(`Settlement completed for ${currentGuest.guestName}! Receipt generated.`, { type: 'success' });
        window.location.hash = '#dashboard';
      }
    }
  };

  // Share Receipt PNG Handler
  const handleShareReceipt = async () => {
    const receiptBox = document.getElementById('printableReceiptModalContent');
    const actionsBar = document.getElementById('printableReceiptActionsBar');
    if (!receiptBox) return;

    if (actionsBar) actionsBar.style.display = 'none';

    try {
      const blob = await htmlToImage.toBlob(receiptBox, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) return;
      const file = new File([blob], `Bill_${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Final Bill Settlement' });
      } else {
        const link = document.createElement('a');
        link.download = `Bill_${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    } catch (err) {
      showToast('Failed to generate image print: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
      console.error(err);
    } finally {
      if (actionsBar) actionsBar.style.display = 'flex';
    }
  };

  // Share Booking Voucher PNG Handler
  const handleShareBookingVoucher = async () => {
    const voucherBox = document.getElementById('printableBookingVoucherContent');
    const actionsBar = document.getElementById('printableBookingVoucherActionsBar');
    if (!voucherBox) return;

    if (actionsBar) actionsBar.style.display = 'none';

    try {
      const blob = await htmlToImage.toBlob(voucherBox, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) return;
      const file = new File([blob], `Booking_${createdBooking?.guestName || 'Voucher'}_${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Booking Confirmation Voucher' });
      } else {
        const link = document.createElement('a');
        link.download = `Booking_${createdBooking?.guestName || 'Voucher'}_${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    } catch (err) {
      showToast('Failed to generate voucher image: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
      console.error(err);
    } finally {
      if (actionsBar) actionsBar.style.display = 'flex';
    }
  };


  if (activeMenuItemKey === 'guest_history') {
    return <GuestHistory guests={guests} onCFormFiledUpdated={onCFormFiledUpdated} />;
  }

  if (activeMenuItemKey === 'guest_registration') {
    return (
      <div className="guest-management w-full flex justify-center items-start">
        {/* Form Card */}
        <div className="guest-management__registration-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-3 max-w-[550px] w-full">
          <div className="border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center justify-between">
            <h3 className="guest-management__subtitle text-slate-800 dark:text-slate-200 text-[10px] uppercase tracking-wide flex items-center gap-2">
              <span className="font-normal">{t('add_guest_booking_header', 'Add Guest Booking')} </span>
              {isMultiKeyProperty && roomNumber ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 normal-case">
                  {roomNumber}
                </span>
              ) : (
                <span className="font-extrabold">
                  (Backdating Allowed)
                </span>
              )}
            </h3>
            {onClose && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
              >
                <X size={20} />
              </button>
            )}
          </div>
          
          <form noValidate className="app-form app-form--add-guest space-y-4 text-xs font-semibold text-slate-700 dark:text-slate-300" onSubmit={(e) => {
            e.preventDefault();
            const newCheckinStr = checkinTime ? `${checkinDate} ${checkinTime}:00` : checkinDate;
            const newCheckoutStr = checkoutTime ? `${expectedCheckout} ${checkoutTime}:00` : expectedCheckout;

            if (!guestName.trim()) {
              showToast('Booking Rejected: Guest name is required.', { type: 'error' });
              return;
            }
            if (!phoneNumber.trim()) {
              showToast('Booking Rejected: Phone number is required.', { type: 'error' });
              return;
            }
            if (!checkinDate || !expectedCheckout) {
              showToast('Booking Rejected: Check-in and check-out dates are required.', { type: 'error' });
              return;
            }

            if (isMultiKeyProperty && (!roomNumber || !roomNumber.trim())) {
              showToast('Booking Rejected: An assigned room/villa selection is required.', { type: 'error' });
              return;
            }

            // 1. Strict Conflict Check: Check if room is already booked for overlapping dates
            const selectedRoomObj = rooms.find((r) => r.name === roomNumber || r.slug === roomNumber);
            const selectedRoomId = selectedRoomObj?.id;

            const hasRoomConflict = guests.some((g) => {
              if ((g.status as string) === GUEST_STATUS_CHECKED_OUT || (g.status as string) === GUEST_STATUS_CHECKEDOUT_LEGACY || (g.status as string) === 'Cancelled') return false;
              const gRoomId = (g as any).roomId || (g as any).room_id;

              const isSameRoom = (selectedRoomId && gRoomId && Number(gRoomId) === Number(selectedRoomId)) ||
                (g.roomNumber && roomNumber && g.roomNumber.toLowerCase().trim() === roomNumber.toLowerCase().trim());

              if (!isSameRoom) return false;

              const existingCheckin = new Date(g.checkinDate);
              const existingCheckout = new Date(g.expectedCheckout || g.checkoutDate || g.checkinDate);
              const newCheckin = new Date(newCheckinStr);
              const newCheckout = new Date(newCheckoutStr);

              return newCheckin < existingCheckout && existingCheckin < newCheckout;
            });

            if (hasRoomConflict) {
              showToast(`Booking Rejected! ${roomNumber} is ALREADY booked for these dates.`, { type: 'error' });
              return;
            }

            // 2. Strict Duplicate Check: Prevent duplicate entry for same guest on same check-in date
            const isDuplicate = guests.some((g) => {
              if (g.status === 'CheckedOut' || (g.status as string) === GUEST_STATUS_CHECKED_OUT || (g.status as string) === 'Cancelled') return false;
              const gPhone = (g.phoneNumber || '').trim();
              const gCheckin = (g.checkinDate || '').split(' ')[0];
              return gPhone === phoneNumber.trim() && gCheckin === checkinDate;
            });

            if (isDuplicate) {
              showToast('Booking Rejected! A reservation for this contact on this check-in date already exists.', { type: 'error' });
              return;
            }

            const guestObj: Guest = {
              id: Math.random().toString(36).substr(2, 9),
              guestName: guestName.trim(),
              phoneNumber: phoneNumber.trim(),
              roomNumber,
              checkinDate: newCheckinStr,
              expectedCheckout: newCheckoutStr,
              status: 'Booked',
              bookingSource: bookingSourceLocal,
              numberOfGuests: noOfGuests,
              roomRate: bookingRoomTariff,
              advanceAmount: bookingAdvance,
              // These were being collected as *required* fields on this form and
              // then silently discarded - never in guestObj, never sent, despite
              // the guests table having columns for both all along.
              advanceReceivedBy: bookingAdvance > 0 ? advanceReceivedBy : '',
              pendingAmount: bookingPending,
              pendingReceivedBy: bookingPending > 0 ? pendingReceivedBy : '',
              notes: showGuestNotes ? notes : '',
              isForeignGuest,
            };

            onAddGuest(guestObj);
            setCreatedBooking(guestObj);
            resetBookingForm();
            showToast('Guest booked successfully!', { type: 'success' });
          }}>
            {/* Row 0: Guest Name (Full width) */}
            <div>
              <Input
                label={t('guest_name_label', 'Guest Name *')}
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Enter guest's full name"
                required
              />
            </div>

            {/* Row 1: Contact Phone + Assigned Room (2 columns) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label={t('contact_phone_label', 'Contact Phone Number *')}
                  type="tel"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="Enter mobile number"
                  required
                />
              </div>

              {/* Room Selector for MultiKey Properties */}
              {isMultiKeyProperty && rooms && rooms.length > 0 && (
                <div>
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('assigned_room_label', 'Assigned Room / Villa *')}</label>
                  <StyledSelect
                    value={roomNumber}
                    onChange={handleRoomChange}
                    options={rooms.map((room) => ({ value: room.name, label: room.name }))}
                    buttonClassName="!h-[38px] !rounded-xl !border-slate-200 !font-normal !text-xs focus:!ring-blue-500 focus:!border-blue-500 !ring-blue-500/20"
                  />
                </div>
              )}
            </div>

            {/* Row 2: Booking Source + No. of Guests (2 columns) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('booking_source_label', 'Booking Source')}</label>
                <StyledSelect
                  value={bookingSourceLocal}
                  onChange={setBookingSourceLocal}
                  options={[
                    { value: 'Offline', label: 'Offline' },
                    { value: 'Online', label: 'Online' },
                  ]}
                  buttonClassName="!h-[38px] !rounded-xl !border-slate-200 !font-normal !text-xs focus:!ring-blue-500 focus:!border-blue-500 !ring-blue-500/20"
                />
              </div>
              <div>
                <Input
                  label={t('no_of_guests_label', 'No. of Guests')}
                  type="number"
                  min="1"
                  value={noOfGuests}
                  onChange={(e) => setNoOfGuests(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>

            {/* Airbnb-Style Date Range Picker Modal Popover */}
            <DateRangePicker
              isOpen={showDateRangePicker}
              onClose={() => setShowDateRangePicker(false)}
              checkinDate={checkinDate}
              checkoutDate={expectedCheckout}
              onCheckinChange={setCheckinDate}
              onCheckoutChange={setExpectedCheckout}
              onClear={() => {
                setCheckinDate('');
                setExpectedCheckout('');
              }}
              blockedDates={getBlockedDateStrings()}
            />

            {/* Check-In & Check-Out Date Buttons (2 columns) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('checkin_date_label', 'Check-In Date *')}</label>
                <button
                  type="button"
                  onClick={() => setShowDateRangePicker(true)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none text-left flex items-center justify-between cursor-pointer transition-all"
                >
                  <span>{checkinDate ? formatDateDDMMYYYY(checkinDate) : 'Select date'}</span>
                  <Calendar className="w-4 h-4 text-blue-600" />
                </button>
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('checkout_date_label', 'Check-Out Date *')}</label>
                <button
                  type="button"
                  onClick={() => setShowDateRangePicker(true)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none text-left flex items-center justify-between cursor-pointer transition-all"
                >
                  <span>{expectedCheckout ? formatDateDDMMYYYY(expectedCheckout) : 'Select date'}</span>
                  <Calendar className="w-4 h-4 text-blue-600" />
                </button>
              </div>
            </div>

            {/* Row: Check-In & Check-Out Time (2 columns) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label={t('checkin_time_label', 'Check-In Time (Optional)')}
                  type="time"
                  value={checkinTime}
                  onChange={e => setCheckinTime(e.target.value)}
                />
              </div>
              <div>
                <Input
                  label={t('checkout_time_label', 'Check-Out Time (Optional)')}
                  type="time"
                  value={checkoutTime}
                  onChange={e => setCheckoutTime(e.target.value)}
                />
              </div>
            </div>

            {/* Total Room Tariff */}
            <div>
              <Input
                label={t('room_rent', 'Room Rent / Price (₹)')}
                type="number"
                value={bookingRoomTariff || ''}
                onChange={e => handleTariffChange(Number(e.target.value))}
              />
            </div>

            {/* Advance Paid + Advance Received By - one row, 2 columns. Advance
                Paid shows once Room Tariff has a value; Advance Received By
                only joins it once an actual advance amount is entered. */}
            {bookingRoomTariff > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label={t('advance_paid', 'Advance Paid (₹)')}
                    type="number"
                    value={bookingAdvance || ''}
                    onChange={e => handleAdvanceChange(Number(e.target.value))}
                  />
                </div>

                {bookingAdvance > 0 && (
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('advance_received_by', 'Advance Received By *')}</label>
                    <StyledSelect
                      value={advanceReceivedBy}
                      onChange={setAdvanceReceivedBy}
                      placeholder="-- Select Staff/User --"
                      options={staff.filter(s => s.isFinancialHandler).map(s => ({ value: s.name, label: s.name }))}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Pending Balance + Pending Received By - same one row, 2 column
                pattern as Advance above. */}
            {bookingAdvance > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label={t('pending_balance_label', 'Pending Balance (₹)')}
                    type="number"
                    value={bookingPending || ''}
                    onChange={e => handlePendingChange(Number(e.target.value))}
                  />
                </div>

                {bookingPending > 0 && (
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('pending_received_by_label', 'Pending Received By')}</label>
                    <StyledSelect
                      value={pendingReceivedBy}
                      onChange={setPendingReceivedBy}
                      placeholder="-- Select Staff/User --"
                      options={staff.filter(s => s.isFinancialHandler).map(s => ({ value: s.name, label: s.name }))}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Guest Notes & Additional Charges on same row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGuestNotes}
                    onChange={(e) => setShowGuestNotes(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-200 dark:border-slate-600 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold">{t('guest_notes_label', 'Guest Notes')}</span>
                </label>
                {showGuestNotes && (
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Dietary adjustments..."
                    rows={2}
                    className="w-full mt-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isForeignGuest}
                    onChange={(e) => setIsForeignGuest(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-200 dark:border-slate-600 dark:bg-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-xs font-semibold">{t('foreign_national_guest_label', 'Foreign National Guest')}</span>
                </label>
                {isForeignGuest && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    C-Form must be filed with FRRO within 24 hours of check-in. A reminder will appear on the dashboard.
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDynamicIncidentals}
                    onChange={(e) => setShowDynamicIncidentals(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-200 dark:border-slate-600 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold">{t('additional_charges_label', 'Additional Charges (Optional)')}</span>
                </label>
                {showDynamicIncidentals && (
                  <div className="mt-2">
                    <div className="flex justify-between items-center mb-2">
                      <button
                        type="button"
                        onClick={() => setBookingIncidentals([...bookingIncidentals, {type: '', amount: 0}])}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold"
                      >
                        + Add Line
                      </button>
                    </div>
                    {bookingIncidentals.length === 0 ? (
                      <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 text-center text-slate-400 text-xs">
                        No incidentals added
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {bookingIncidentals.map((inc, idx) => (
                          <div key={idx} className="flex gap-2 items-center text-xs">
                            <StyledSelect
                              className="flex-1"
                              value={inc.type}
                              onChange={(val) => {
                                const newInc = [...bookingIncidentals];
                                newInc[idx].type = val;
                                setBookingIncidentals(newInc);
                              }}
                              placeholder="-- Select Type --"
                              options={miscChargesList.map(m => {
                                const Icon = getExpenseItemIcon(m.label, m.category);
                                return {
                                  value: m.label,
                                  label: (
                                    <span className="flex items-center gap-2">
                                      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span>{m.label}</span>
                                    </span>
                                  ),
                                  searchText: m.label,
                                };
                              })}
                            />
                              <Input
                                type="number"
                                value={inc.amount || ''}
                                onChange={(e) => {
                                  const newInc = [...bookingIncidentals];
                                  newInc[idx].amount = Number(e.target.value);
                                  setBookingIncidentals(newInc);
                                }}
                                placeholder="Amount"
                                className="w-24"
                                fullWidth={false}
                                required={!!inc.type}
                              />
                            <button
                              type="button"
                              onClick={() => setBookingIncidentals(bookingIncidentals.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500 p-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className="btn-register-guest w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl shadow-md transition-colors text-sm">
              {t('save_guest_booking_button', 'Save Guest Booking')}
            </button>
          </form>
        </div>

        {/* Right Column: Booking Calendar (hidden in guest_registration mode) */}
        {activeMenuItemKey !== 'guest_registration' && (
          <div className="active-guests-table-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
              <TodayOverview
                guests={guests}
                rooms={rooms}
                isMultiKeyProperty={isMultiKeyProperty}
                kitchenModuleEnabled={true}
                onAddBooking={() => setIsAddBookingModalOpen(true)}
                onUpdateGuest={onUpdateGuest}
                onDeleteGuest={onDeleteGuest}
                propertyName={propertyName}
                propertyMapsLink={propertyMapsLink}
                propertyPhone={propertyPhone}
                propertyWhatsappTemplate={propertyWhatsappTemplate}
              />
            </div>
          </div>
        )}

        {/* Add Booking Modal Overlay inside GuestManagement */}
        {isAddBookingModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setIsAddBookingModalOpen(false)}
          >
            <div
              className="w-full max-w-[550px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl bg-white dark:bg-slate-800 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <GuestManagement
                guests={guests}
                receipts={receipts}
                menu={menu}
                rooms={rooms}
                onAddGuest={async (guest) => {
                  await onAddGuest?.(guest);
                  setIsAddBookingModalOpen(false);
                }}
                onCheckoutGuest={onCheckoutGuest}
                onDispatchTelegram={onDispatchTelegram}
                activeMenuItemKey="guest_registration"
                isMultiKeyProperty={isMultiKeyProperty}
                selectedRoomSlug={selectedRoomSlug}
                onClose={() => setIsAddBookingModalOpen(false)}
              />
            </div>
          </div>
        )}
        {/* Booking details editor overlay */}
        {selectedGuestForDetails && (
          <BookingDetailsModal
            guest={selectedGuestForDetails}
            onClose={() => setSelectedGuestForDetails(null)}
            onSave={async (updatedGuest) => {
              onUpdateGuest?.(updatedGuest);
              setSelectedGuestForDetails(null);
              showToast('Booking details updated successfully!', { type: 'success' });
            }}
            rooms={rooms}
            checkedInGuests={guests}
            propertyName={propertyName}
          />
        )}
      </div>
    );
  }

  // For ALL properties, show the unified Bookings view
  if (activeMenuItemKey === 'all_bookings' || activeMenuItemKey === 'guest_registration') {
    return (
      <BillingCheckout
        guests={guests}
        receipts={receipts}
        onCheckoutGuest={onCheckoutGuest}
        onUpdateGuest={onUpdateGuest}
        onAddGuest={onAddGuest}
        isMultiKeyProperty={isMultiKeyProperty}
        rooms={rooms}
        onCheckoutClick={onNavigateToBilling}
        kitchenModuleEnabled={kitchenModuleEnabled}
        propertyGstin={propertyGstin}
        propertyName={propertyName}
        focusGuestId={focusBookingGuestId}
      />
    );
  }

  return (
    <div className="guest-management space-y-6">
      {/* Top Banner Header for Billing */}
      <div className="guest-management__banner flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="guest-management__banner-text">
          <h2 className="guest-management__title text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-blue-600" />
            Guest Billing & Checkout Terminal
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage lodging contracts, insert food incidentals, apply adjustments, and run split settlement checkouts
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BILLING & CHECKOUT WORKSPACE - FOR SINGLE-PROPERTY SYSTEMS                   */}
      {/* ========================================================================= */}
      {activeMenuItemKey === 'all_bookings' && (
        <div className="guest-management__checkout-workspace space-y-6">
          {/* BUG 5 FIX: Guard for empty Active guest list */}
          {checkedInGuests.length === 0 ? (
            <div className="guest-management__empty-state bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs text-center">
              <Building className="guest-management__empty-state-icon w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="guest-management__empty-state-title text-lg font-semibold text-slate-700 mb-1">No Active Residents</h3>
              <p className="guest-management__empty-state-desc text-sm text-slate-500">There are no guests currently checked in. Register a new guest or check in an existing booking to begin billing.</p>
            </div>
          ) : (<>
          {/* Active Resident Selector Bar */}
          <div className="guest-management__resident-selector bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="guest-management__resident-selector-left flex items-center gap-3">
              <span className="guest-management__resident-label font-semibold text-slate-700">Active Resident Account:</span>
              <StyledSelect
                className="w-64"
                value={selectedGuestId}
                onChange={setSelectedGuestId}
                options={guests
                  .filter((g) => g.status === GUEST_STATUS_CHECKED_IN || (g.status as string) === GUEST_STATUS_ACTIVE_LEGACY)
                  .map((g) => ({
                    value: g.id,
                    label: `${g.guestName} (${g.roomNumber}) â€” Phone: ${g.phoneNumber}`,
                  }))}
              />
            </div>

            <div className="guest-management__resident-status flex items-center gap-2">
              {currentGuest ? (
                <span className={`guest-management__status-badge inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full text-[11px] border ${
                  currentGuest.status === GUEST_STATUS_CHECKED_IN
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : currentGuest.status === GUEST_STATUS_BOOKED
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-800 border-slate-300'
                }`}>
                  <span className={`guest-management__status-dot w-1.5 h-1.5 rounded-full ${
                    currentGuest.status === GUEST_STATUS_CHECKED_IN
                      ? 'bg-emerald-600'
                      : currentGuest.status === GUEST_STATUS_BOOKED
                      ? 'bg-amber-600'
                      : 'bg-slate-500'
                  }`}></span>
                  {currentGuest.status === GUEST_STATUS_CHECKED_IN ? 'Checked In' : currentGuest.status === GUEST_STATUS_BOOKED ? 'Reservation Booked' : currentGuest.status}
                </span>
              ) : (
                <span className="guest-management__status-empty bg-slate-100 text-slate-500 font-semibold px-2.5 py-1 rounded-full text-[11px] border border-slate-300">
                  No Checked-In Resident Selected
                </span>
              )}
            </div>
          </div>

          {/* 2-COLUMN SPLIT WORKSPACE PANEL */}
          <div className="guest-management__workspace grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT COLUMN: ACCOMMODATION + FOOD LOG (LG: 7 COLS) */}
            <div className="guest-management__workspace-left lg:col-span-7 space-y-6">
              {/* CARD 1: ACCOMMODATION INVOICE BREAKDOWN */}
              <div className="guest-management__accommodation-card bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Home className="w-4 h-4" /> Accommodation Invoice Breakdown
                </div>
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-slate-600 font-semibold">Base Lodging Charges:</span>
                  <strong className="text-slate-900 font-semibold">₹{baseLodging.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-slate-600 font-semibold">Advance Paid:</span>
                  <strong className="summary-line summary-line--advance-paid text-emerald-600 font-semibold">
                    + ₹{advancePaid.toFixed(2)} by {advancePayer}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-xs py-1 border-t border-dashed border-slate-200 pt-2">
                  <span className="text-slate-600 font-semibold">Pending Lodging Due:</span>
                  <strong className="summary-line summary-line--pending-lodging-due text-emerald-700 font-semibold">
                    ₹{lodgingPendingDue.toFixed(2)} Settled via {pendingSettledBy}
                  </strong>
                </div>
              </div>

              {/* CARD 2: FOOD ORDERS & INCIDENTALS LOG */}
              <div className="guest-management__incidentals-card receipts-log-table-card bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Utensils className="w-4 h-4" /> Food Orders & Incidentals Log
                </div>

                {/* INSERTION FORM WITH --CUSTOM-- DISH OPTION */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                   <form onSubmit={handleInsertFoodItem} className="app-form app-form--add-food-order space-y-3">
                    <div className="flex flex-wrap items-end gap-3 text-xs">
                      <div className="flex-1 min-w-[200px]">
                        <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                          Select Dish / Item
                        </label>
                        <StyledSelect
                          value={selectedDishId}
                          onChange={setSelectedDishId}
                          placeholder="-- Choose Menu Dish --"
                          options={[
                            { value: 'custom', label: <span className="font-semibold text-cyan-600">-- CUSTOM --</span> },
                            ...menu.map((dish) => ({
                              value: String(dish.id),
                              label: `${dish.name} (₹${dish.price.toFixed(2)})`,
                            })),
                          ]}
                        />
                      </div>

                      <div className="w-24">
                        <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 text-center">
                          Quantity
                        </label>
                        <Input
                          label="Quantity"
                          type="number"
                          value={insertQty}
                          min={1}
                          required
                          onChange={(e) => setInsertQty(Number(e.target.value))}
                          className="text-center"
                          fullWidth={false}
                        />
                      </div>

                      <div>
                        <button
                          type="submit"
                          className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer shadow-2xs h-[36px]"
                        >
                          + Insert
                        </button>
                      </div>
                    </div>

                    {/* Custom Dish Fields (Visible when -- CUSTOM -- selected) */}
                    {selectedDishId === 'custom' && (
                      <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-dashed border-slate-300 text-xs animate-in fade-in">
                        <div className="flex-1 min-w-[180px]">
                          <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                            Custom Dish Name *
                          </label>
                          <Input
                            label="Custom Dish Name *"
                            type="text"
                            required
                            value={customDishName}
                            onChange={(e) => setCustomDishName(e.target.value)}
                            placeholder="e.g. Special Thali / Extra Raita"
                          />
                        </div>
                        <div className="w-32">
                          <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                            Price (₹) *
                          </label>
                          <Input
                            label="Price (₹) *"
                            type="number"
                            step="0.01"
                            required
                            value={customDishPrice}
                            onChange={(e) =>
                              setCustomDishPrice(e.target.value === '' ? '' : Number(e.target.value))
                            }
                            className="w-32"
                            fullWidth={false}
                          />
                        </div>
                      </div>
                    )}
                  </form>
                </div>

                {/* FOOD LOG TABLE */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="datatable w-full text-left text-xs text-slate-800 guest-management__table">
                    <thead className="bg-slate-100 font-semibold border-b border-slate-200 text-slate-600 uppercase text-[10px] guest-management__table-header">
                      <tr className="guest-management__table-header-row">
                        <th className="py-2.5 px-3 guest-management__table-header-cell">Description Item</th>
                        <th className="py-2.5 px-3 text-center w-[130px] guest-management__table-header-cell">Quantity</th>
                        <th className="py-2.5 px-3 text-right guest-management__table-header-cell">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 guest-management__table-body">
                      {incidentals.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="guest-management__cell py-2.5 px-3 font-semibold text-slate-900">{item.name}</td>
                          <td className="guest-management__cell py-2 px-3 text-center">
                            <div className="inline-flex items-center bg-slate-100 border border-slate-300 rounded-md p-1 gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateIncidentalsQty(item.id, -1)}
                                className="w-7 h-7 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 font-semibold text-sm flex items-center justify-center cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-8 text-center font-extrabold text-sm text-slate-800">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateIncidentalsQty(item.id, 1)}
                                className="w-7 h-7 bg-cyan-600 hover:bg-cyan-700 rounded text-white font-semibold text-sm flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="guest-management__cell py-2.5 px-3 text-right font-semibold text-slate-900">
                            ₹{(item.price * item.quantity).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MANUAL ADJUSTMENTS APPLIED SUMMARY BOX */}
                {adjustments.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <span className="font-semibold text-slate-700 block text-[10px] uppercase tracking-wider">
                      Manual Adjustments Applied
                    </span>
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-center justify-between font-semibold">
                                <span className="text-slate-600 flex items-center gap-1">
                          <CornerDownRight className="w-3.5 h-3.5" /> {adj.reason}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              adj.type === 'charge'
                                ? 'text-red-600 font-semibold'
                                : 'text-emerald-600 font-semibold'
                            }
                          >
                            {adj.type === 'charge' ? '+' : '-'}₹{adj.amount.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAdjustment(adj.id)}
                            className="text-red-500 hover:text-red-700 font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                            title="Remove Adjustment"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* INCIDENTALS SUBTOTAL ROW */}
                <div className="pt-2 border-t border-slate-200 text-right text-xs">
                  <span className="font-semibold text-slate-700">
                    Food Items Subtotal:&nbsp;
                    <strong className="text-sky-600 text-sm font-extrabold">
                      ₹{foodTotal.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: CUSTOM ADJUSTMENTS + SPLIT CHECKOUT (LG: 5 COLS) */}
            <div className="guest-management__workspace-right lg:col-span-5 space-y-6">
              {/* CARD 3: ADD CUSTOM ADJUSTMENTS */}
              <div className="guest-management__adjustments-card bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4 text-xs">
                <div className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Custom Adjustments
                </div>

                <form onSubmit={handleAddAdjustment} className="app-form app-form--add-adjustment space-y-3">
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      Strategy Type
                    </label>
                    <StyledSelect
                      value={adjType}
                      onChange={(val) => setAdjType(val as 'charge' | 'discount')}
                      options={[
                        { value: 'charge', label: 'Extra Incidentals Charge (+)' },
                        { value: 'discount', label: 'Discount Rebate (-)' },
                      ]}
                    />
                  </div>

                  {adjType === 'charge' ? (
                    <div>
                      <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                        Charge Category
                      </label>
                      <StyledSelect
                        value={adjReasonCharge}
                        onChange={setAdjReasonCharge}
                        options={['Decoration Fees', 'Extra Housekeeping', 'Misc', 'Pet Stay Charges'].map((label) => {
                          const Icon = getExpenseItemIcon(label);
                          return {
                            value: label,
                            label: (
                              <span className="flex items-center gap-2">
                                <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{label}</span>
                              </span>
                            ),
                            searchText: label,
                          };
                        })}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                        Discount Label
                      </label>
                      <Input
                        label="Discount Label"
                        type="text"
                        value={adjReasonDiscount}
                        onChange={(e) => setAdjReasonDiscount(e.target.value)}
                        placeholder="e.g. Service Apology..."
                      />
                    </div>
                  )}

                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      Amount (₹)
                    </label>
                    <Input
                      label="Amount (₹)"
                      type="number"
                      step="0.01"
                      required
                      value={adjAmount}
                      onChange={(e) =>
                        setAdjAmount(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 rounded-lg transition-all cursor-pointer shadow-2xs"
                  >
                    Apply Adjustment
                  </button>
                </form>
              </div>

              {/* CARD 4: SPLIT PAYMENT INTEGRATED FINAL CHECKOUT SETTLEMENT BLOCK */}
              <div className="guest-management__checkout-card bg-white p-5 rounded-2xl border-2 border-emerald-500/80 shadow-md space-y-4 text-xs">
                <div className="text-sm font-extrabold text-emerald-800 border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <Flag className="w-4 h-4" /> Final Checkout Split Settlement
                </div>

                <form onSubmit={handleCompleteCheckout} className="app-form app-form--complete-checkout space-y-4">
                  {/* Target Due & Running Stack Summary */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                      <span>Pending Lodging Due:</span>
                      <span className="summary-line summary-line--pending-lodging-due">₹{lodgingPendingDue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                      <span>Food & Incidentals Subtotal:</span>
                      <span className="summary-line summary-line--food-subtotal">₹{foodTotal.toFixed(2)}</span>
                    </div>
                    {extraCharges > 0 && (
                      <div className="flex justify-between items-center text-red-600 font-semibold">
                        <span>(+) Extra Charges:</span>
                        <span>+₹{extraCharges.toFixed(2)}</span>
                      </div>
                    )}
                    {discounts > 0 && (
                      <div className="flex justify-between items-center text-emerald-600 font-semibold">
                        <span>(-) Discount Rebate:</span>
                        <span>-₹{discounts.toFixed(2)}</span>
                      </div>
                    )}
                    {/* GST Toggle â€” rate auto-detected from room tariff slab */}
                    <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-1.5">
                      <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={gstEnabled}
                            onChange={(e) => setGstEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-300 peer-checked:bg-blue-600 rounded-full peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
                        </label>
                        <span className="font-semibold text-slate-600 text-[11px]">Apply GST</span>
                      </div>
                      {gstEnabled && (
                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          Acc: {gstAccommodationRate}% | Food: 5%
                        </span>
                      )}
                    </div>
                    {gstEnabled && gstAmount > 0 && (
                      <>
                        <div className="border-t border-dashed border-slate-100 pt-1 mb-1" />
                        <div className="font-semibold text-[10px] text-slate-500 uppercase tracking-wider mb-1">Item-wise GST</div>
                        <div className="flex justify-between items-center text-blue-700 font-semibold text-[11px]">
                          <span>Accommodation GST @ {gstAccommodationRate}%:</span>
                          <span>₹{gstAccommodationAmount.toFixed(2)}</span>
                        </div>
                        {foodTotal > 0 && (
                          <div className="flex justify-between items-center text-blue-700 font-semibold text-[11px]">
                            <span>Food GST @ {gstFoodRate}%:</span>
                            <span>₹{gstFoodAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="border-t border-dashed border-slate-200 pt-1 mt-1">
                          <div className="flex justify-between items-center text-blue-700 font-semibold text-[11px]">
                            <span>Total CGST @ 50%:</span>
                            <span>₹{gstCgst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-blue-700 font-semibold text-[11px]">
                            <span>Total SGST @ 50%:</span>
                            <span>₹{gstSgst.toFixed(2)}</span>
                          </div>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center font-extrabold text-slate-900 border-t border-slate-200 pt-1.5">
                      <span>Grand Target Due:</span>
                      <span className="summary-line summary-line--grand-target-due text-emerald-700 text-base">₹{grandTargetDue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1 border-t border-dashed border-slate-200">
                      <span>Total Stacked Entered:</span>
                      <span
                        className={`summary-line summary-line--total-stacked font-semibold ${
                          isSplitMatching ? 'text-emerald-600' : 'text-red-600 font-extrabold'
                        }`}
                      >
                        ₹{totalSplitSum.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Cashier Field */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                      Desk Cashier Handling checkout:
                    </label>
                    <Input
                      label="Desk Cashier Handling checkout:"
                      type="text"
                      readOnly
                      value={deskCashier}
                      disabled
                    />
                  </div>

                  {/* Dynamic Split Distribution Matrix */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold text-slate-600 uppercase">
                      Split Distribution Matrix
                    </div>

                    <div className="space-y-2.5">
                      {splitRows.map((row) => (
                        <div
                          key={row.id}
                          className="bg-slate-50 border border-slate-300 p-3 rounded-xl relative space-y-2"
                        >
                          {splitRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSplitRow(row.id)}
                              className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-semibold text-sm cursor-pointer"
                              title="Remove row"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                required
                                value={row.amount}
                                onChange={(e) =>
                                  handleUpdateSplitRow(row.id, 'amount', Number(e.target.value))
                                }
                                placeholder="Amount (₹)"
                                className="flex-1"
                                fullWidth={false}
                              />
                            <StyledSelect
                              className="w-24"
                              value={row.mode}
                              onChange={(val) =>
                                handleUpdateSplitRow(row.id, 'mode', val as 'Cash' | 'UPI')
                              }
                              options={[
                                { value: 'Cash', label: 'Cash' },
                                { value: 'UPI', label: 'UPI' },
                              ]}
                            />
                          </div>

                          {row.mode === 'UPI' && (
                            <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                              <StyledSelect
                                className="flex-1"
                                value={row.recipient}
                                onChange={(val) =>
                                  handleUpdateSplitRow(row.id, 'recipient', val)
                                }
                                options={[
                                  { value: 'On-Site Cash Safe', label: 'On-Site Cash Safe (System)' },
                                  { value: 'Kamlesh [Staff]', label: 'Kamlesh [Staff]', group: 'Staff Accounts (Login Team)' },
                                  { value: 'Rohit [Staff]', label: 'Rohit [Staff]', group: 'Staff Accounts (Login Team)' },
                                  { value: 'Subrata [Staff]', label: 'Subrata [Staff]', group: 'Staff Accounts (Login Team)' },
                                  { value: 'Tarpan [Staff]', label: 'Tarpan [Staff]', group: 'Staff Accounts (Login Team)' },
                                  { value: 'Disposable Shop [Vendor]', label: 'Disposable Shop [Vendor]', group: 'Core Business Vendors (Groceries/Upkeep)' },
                                  { value: 'Raju [Vendor]', label: 'Raju [Vendor]', group: 'Core Business Vendors (Groceries/Upkeep)' },
                                  { value: 'Nandkishore [ThirdParty]', label: 'Nandkishore [ThirdParty]', group: 'Third Parties (Pass-Through Routing)' },
                                ]}
                              />

                              <button
                                type="button"
                                onClick={() => handleTriggerQrModal(row.recipient)}
                                className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer text-xs h-[32px] flex items-center gap-1"
                              >
                                <QrCode className="w-3.5 h-3.5" /> Show QR
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddSplitRow}
                      className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-400 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      Add Payment Split Row
                    </button>
                  </div>

                  {/* Validation Error Alert */}
                  {!isSplitMatching && (
                    <div className="p-2.5 bg-red-50 border border-red-200 text-red-800 text-center font-semibold text-[11px] rounded-lg">
                      Split sum (₹{totalSplitSum.toFixed(2)}) must equal target due (₹
                      {grandTargetDue.toFixed(2)}) exactly.
                    </div>
                  )}

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      className="btn-print-receipt w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" /> View Print Receipt
                    </button>

                    <button
                      type="submit"
                      disabled={!isSplitMatching}
                      className={`btn-checkout-guest w-full py-3 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer ${
                        isSplitMatching
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Complete Checkout & Submit Bill
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      )}


      {/* ========================================================================= */}
      {/* POPUP MODAL 1: HIGH CONTRAST UPI QR LIGHTBOX                             */}
      {/* ========================================================================= */}
      {isQrModalOpen && (
        <div className="guest-management__qr-modal fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
            <h4 className="guest-management__caption font-semibold text-[10px] uppercase tracking-wider text-slate-900">
              Scan UPI QR Target: {qrModalTitle}
            </h4>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[200px]">
              {qrModalHasCode ? (
                <div className="space-y-3 flex flex-col items-center">
                  <div className="w-48 h-48 bg-white border-2 border-slate-800 p-3 rounded-xl flex flex-col items-center justify-center shadow-md relative">
                    <QrCode className="w-36 h-36 text-slate-900" />
                    <span className="text-[10px] font-mono font-semibold text-slate-600 mt-1">
                      artistsfarm@upi
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified Payee: {qrModalTitle}
                  </span>
                </div>
              ) : (
                <div className="p-4 text-amber-700 font-semibold text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> No QR screenshot registered for this recipient ({qrModalTitle}).
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
            >
              Close Preview Box
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP MODAL 2: CLEAN PRINT-FRIENDLY RECEIPT                              */}
      {/* ========================================================================= */}
      {isPrintModalOpen && (
        <div className="guest-management__receipt-modal fixed inset-0 bg-black/50 backdrop-blur-xs flex items-start justify-center p-4 z-50 overflow-y-auto pt-8">
          <div
            id="printableReceiptModalContent"
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs relative"
          >
            {/* Modal Actions Bar */}
            <div
              id="printableReceiptActionsBar"
              className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2"
            >
              <button
                type="button"
                onClick={handleShareReceipt}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer text-xs"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Bill (PNG)
              </button>
              {currentGuest && (
                <a
                  href={`https://api.whatsapp.com/send?phone=${currentGuest.phoneNumber.replace(/\D/g, '').length === 10 ? '91' + currentGuest.phoneNumber.replace(/\D/g, '') : currentGuest.phoneNumber.replace(/\D/g, '')}&text=${encodeURIComponent(
                     `📶 *GUEST CHECKOUT & BILL SETTLEMENT*\n━━━━━━━━━━━━━━━━\n👤 *Guest:* ${currentGuest.guestName}\n🏠 *Room:* ${currentGuest.roomNumber}\n📅 *Check-In:* ${formatDateDDMMYYYY(currentGuest.checkinDate)}\n📅 *Check-Out:* ${formatDateDDMMYYYY(new Date().toISOString())}\n🏨 *Accommodation:* ₹${baseLodging.toFixed(2)}\n🍽 *Food/Incidentals:* ₹${foodTotal.toFixed(2)}\n📋 *Adjustments:* ₹${(extraCharges - discounts).toFixed(2)}\n➕ *GST/Tax:* ₹${gstAmount.toFixed(2)}\n💰 *Grand Total Paid:* ₹${grandTargetDue.toFixed(2)}\n━━━━━━━━━━━━━━━━\nThank you for choosing Ground Code Resort! We hope to see you again soon.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer text-center text-xs"
                >
                  Share via WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg cursor-pointer text-xs"
              >
                Close
              </button>
            </div>

            {/* Receipt Content */}
            <div className="space-y-3 pt-2">
              <div className="text-center pb-2 border-b border-slate-200">
                <h3 className="guest-management__subtitle font-extrabold text-base text-black">Ground Code JAIPUR</h3>
                <p className="text-[11px] text-black font-medium">Consolidated Stay & KOT Settlement</p>
              </div>

              <div className="flex justify-between text-[11px] border-b border-dashed border-slate-300 pb-2 text-black font-semibold">
                <span>
                  <b>Phone:</b> 8888888
                </span>
                <span>
                  <b>Date:</b> {formatDateDDMMYYYY(new Date().toISOString())}
                </span>
              </div>

              {/* Stay Logistics */}
              <div className="space-y-1">
                <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                  Stay Logistics
                </div>
                <div className="flex justify-between text-black">
                  <span>Lodging Contract Charges:</span>
                  <span>Rm ₹{baseLodging.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-black font-semibold">
                  <span>[-] Advance Paid:</span>
                  <span className="summary-line summary-line--advance-paid">₹{advancePaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-black font-semibold border-t border-dashed border-slate-200 pt-1">
                  <span>Pending Lodging Settled:</span>
                  <span className="summary-line summary-line--pending-lodging-due">₹{lodgingPendingDue.toFixed(2)}</span>
                </div>
              </div>

              {/* KOT Kitchen Incidentals */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between items-center font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                  <span>KOT Kitchen Incidentals</span>
                  <span>Subtotal: ₹{foodTotal.toFixed(2)}</span>
                </div>
                <div className="space-y-1 pt-1">
                  {incidentals.map((it) => (
                    <div key={it.id} className="flex justify-between text-black">
                      <span>
                        {it.name} x{it.quantity}
                      </span>
                      <span>₹{(it.price * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Adjustments: Extra Charges and Discounts */}
              {adjustments.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-dashed border-slate-200">
                  <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                    Applied Adjustments
                  </div>
                  <div className="space-y-1 pt-1">
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex justify-between text-black">
                        <span className="flex items-center gap-1">
                          <CornerDownRight className="w-3.5 h-3.5" /> {adj.reason}
                        </span>
                        <span className="font-semibold">
                          {adj.type === 'charge' ? '+' : '-'}₹{adj.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GST Breakdown â€” item-wise */}
              {gstEnabled && gstAmount > 0 && (
                <div className="space-y-1 pt-2 border-t border-dashed border-slate-200">
                  <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                    Tax Breakdown (GST)
                  </div>
                  <div className="flex justify-between text-black text-[11px]">
                    <span>Accommodation @ {gstAccommodationRate}%:</span>
                    <span>₹{gstAccommodationAmount.toFixed(2)}</span>
                  </div>
                  {gstFoodAmount > 0 && (
                    <div className="flex justify-between text-black text-[11px]">
                      <span>Food @ {gstFoodRate}%:</span>
                      <span>₹{gstFoodAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-dashed border-slate-300 pt-1">
                    <div className="flex justify-between text-black text-[11px] font-semibold">
                      <span>CGST (50% split):</span>
                      <span>₹{gstCgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-black text-[11px] font-semibold">
                      <span>SGST (50% split):</span>
                      <span>₹{gstSgst.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="border-t-2 border-b-2 border-black py-2 flex justify-between font-extrabold text-sm text-black">
                <span>Grand Total Payable:</span>
                <span className="summary-line summary-line--grand-total-payable">₹{grandTargetDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* POPUP MODAL 3: CLEAN PRINT-FRIENDLY BOOKING CONFIRMATION VOUCHER          */}
      {/* ========================================================================= */}
      {createdBooking && (
        <div className="guest-management__voucher-modal fixed inset-0 bg-black/50 backdrop-blur-xs flex items-start justify-center p-4 z-50 overflow-y-auto pt-8">
          <div
            id="printableBookingVoucherContent"
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs relative"
          >
            {/* Modal Actions Bar */}
            <div
              id="printableBookingVoucherActionsBar"
              className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2"
            >
              <button
                type="button"
                onClick={handleShareBookingVoucher}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer text-xs"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Voucher (PNG)
              </button>
              <a
                href={`https://api.whatsapp.com/send?phone=${createdBooking.phoneNumber.replace(/\D/g, '').length === 10 ? '91' + createdBooking.phoneNumber.replace(/\D/g, '') : createdBooking.phoneNumber.replace(/\D/g, '')}&text=${encodeURIComponent(
                  renderWhatsappVoucherTemplate(propertyWhatsappTemplate || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
                    guest_name: createdBooking.guestName,
                    room_name: createdBooking.roomNumber,
                    property_name: propertyName || 'us',
                    checkin_date: formatDateDDMMYYYY(createdBooking.checkinDate),
                    checkout_date: formatDateDDMMYYYY(createdBooking.expectedCheckout),
                    guest_count: String(createdBooking.numberOfGuests ?? 1),
                    room_tariff: (createdBooking.roomRate || 0).toFixed(2),
                    advance_paid: (createdBooking.advanceAmount || 0).toFixed(2),
                    maps_link: propertyMapsLink,
                    contact_phone: propertyPhone,
                  })
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer text-center text-xs"
              >
                Share via WhatsApp
              </a>
              <button
                type="button"
                onClick={() => {
                  setCreatedBooking(null);
                  resetBookingForm();
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg cursor-pointer text-xs"
              >
                Close
              </button>
            </div>

            {/* Receipt Content */}
            <div className="space-y-3 pt-2 font-mono">
              <div className="text-center pb-2 border-b border-slate-200">
                <h3 className="guest-management__subtitle font-extrabold text-base text-black uppercase">
                  {propertyName || 'Booking Confirmation'}
                </h3>
                <p className="text-[11px] text-black font-medium">Booking Confirmation Voucher</p>
              </div>

              <div className="flex justify-between text-[11px] border-b border-dashed border-slate-300 pb-2 text-black font-semibold">
                <span>
                  <b>Guest:</b> {createdBooking.guestName}
                </span>
                <span>
                  <b>Date:</b> {formatDateDDMMYYYY(new Date().toISOString())}
                </span>
              </div>

              {/* Stay Logistics */}
              <div className="space-y-1">
                <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                  Booking Logistics
                </div>
                <div className="flex justify-between text-black">
                  <span>Assigned Room / Villa:</span>
                  <span className="font-semibold">{createdBooking.roomNumber}</span>
                </div>
                <div className="flex justify-between text-black">
                  <span>Check-In Date/Time:</span>
                  <span>{formatDateDDMMYYYY(createdBooking.checkinDate)}</span>
                </div>
                <div className="flex justify-between text-black">
                  <span>Check-Out Date/Time:</span>
                  <span>{formatDateDDMMYYYY(createdBooking.expectedCheckout)}</span>
                </div>
                <div className="flex justify-between text-black">
                  <span>No. of Guests:</span>
                  <span>{createdBooking.numberOfGuests}</span>
                </div>
                <div className="flex justify-between text-black">
                  <span>Booking Source:</span>
                  <span>{createdBooking.bookingSource || 'Offline'}</span>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="space-y-1 pt-2 border-t border-dashed border-slate-200">
                <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                  Financial Summary
                </div>
                <div className="flex justify-between text-black">
                  <span>{t('room_rent', 'Total Room Rent')}:</span>
                  <span>₹{(createdBooking.roomRate || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-black font-semibold">
                  <span>[-] Advance Paid:</span>
                  <span>₹{(createdBooking.advanceAmount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-black font-semibold border-t border-dashed border-slate-200 pt-1">
                  <span>Balance Due:</span>
                  <span>₹{Math.max(0, (createdBooking.roomRate || 0) - (createdBooking.advanceAmount || 0)).toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              {createdBooking.notes && (
                <div className="pt-2 border-t border-dashed border-slate-200">
                  <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                    Guest Notes
                  </div>
                  <p className="text-black italic mt-1 pl-2">{createdBooking.notes}</p>
                </div>
              )}

              {/* Welcome Message */}
              <div className="border-t-2 border-black pt-3 text-center text-[10px] text-black font-semibold">
                <p>Thank you for choosing Ground Code Resort!</p>
                <p>For support, contact us at 8888888888</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Booking details editor overlay */}
      {selectedGuestForDetails && (
        <BookingDetailsModal
          guest={selectedGuestForDetails}
          onClose={() => setSelectedGuestForDetails(null)}
          onSave={async (updatedGuest) => {
            onUpdateGuest?.(updatedGuest);
            setSelectedGuestForDetails(null);
            showToast('Booking details updated successfully!', { type: 'success' });
          }}
          rooms={rooms}
          checkedInGuests={guests}
          propertyName={propertyName}
        />
      )}
    </div>
  );
};



