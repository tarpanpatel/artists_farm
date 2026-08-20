import React, { useState, useEffect, useMemo } from 'react';
import { IndianRupee, Home, AlertCircle, Plus, Trash2, CheckCircle2, Share2, Printer, QrCode, Loader2, CornerDownRight, MessageSquare, CreditCard } from 'lucide-react';
import { Guest, BillingReceipt, PayeeEntity } from '../types';
import { StyledSelect } from './StyledSelect';
import { DateRangePicker } from './DateRangePicker';
import { Input } from './Input';
import { fetchMenuFromDB, fetchPayeesFromDB, fetchServiceRequestsFromDB } from '../services/api';
import { useToast } from './ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useStaff } from '../contexts/StaffContext';
import * as htmlToImage from 'html-to-image';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { UpiPaymentBlock } from '../utils/upiQrCode';
import { Modal as FlowbiteModal, ModalHeader, ModalBody, ModalFooter } from 'flowbite-react';

interface ReceiptEditModalProps {
  isOpen: boolean;
  guest: Guest | null;
  allGuests?: Guest[];
  onClose: () => void;
  onCheckout: (receipt: BillingReceipt) => void;
  onUpdateGuest?: (updatedGuest: Guest) => void;
  isProcessing?: boolean;
  mode?: 'edit-only' | 'edit-and-checkout';
  kitchenModuleEnabled?: boolean;
  propertyGstin?: string;
  propertyName?: string;
  propertyUpiId?: string;
}

interface GstRatesConfig {
  accLowMax: number;
  accMidMax: number;
  accLowRate: number;
  accMidRate: number;
  accHighRate: number;
  foodRate: number;
}

// Indian hotel GST slabs as of 2026: rooms billed <=1000/night are exempt,
// 1001-7500 is 5% (no input tax credit), above 7500 is 18% (full input tax
// credit); restaurant/food service is a flat 5%. Kept as the fallback default
// - Root Admin can override via system_settings (key "gst_rates_config")
// without a code change if rates change.
const DEFAULT_GST_RATES: GstRatesConfig = {
  accLowMax: 1000,
  accMidMax: 7500,
  accLowRate: 0,
  accMidRate: 5,
  accHighRate: 18,
  foodRate: 5,
};

interface IncidentalItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface ManualAdjustment {
  id: string;
  type: 'charge' | 'discount';
  reason: string;
  amount: number;
}

interface SplitPaymentRow {
  id: string;
  mode: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer';
  amount: number;
  refNo?: string;
  payToId?: string; // staff/payee id whose QR code this UPI row goes to
}

export const ReceiptEditModal: React.FC<ReceiptEditModalProps> = ({
  isOpen,
  guest,
  allGuests: _allGuests = [],
  onClose,
  onCheckout,
  onUpdateGuest,
  isProcessing = false,
  mode = 'edit-and-checkout',
  kitchenModuleEnabled = true,
  propertyGstin = '',
  propertyName = '',
  propertyUpiId = '',
}) => {
  const { activeRole } = useAuth();
  const isRootAdmin = activeRole?.toLowerCase().trim() === 'root admin';
  const { showToast } = useToast();
  const { staff } = useStaff();
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  // Only staff marked as a cash handler can be attributed as having
  // received money - a free-text field let anyone type any name, which
  // isn't real accountability for who actually took the payment.
  const cashHandlers = staff.filter((s) => s.isFinancialHandler);

  // Local override of the `mode` prop - lets "Save and Proceed to Checkout"
  // transition the same open modal from editing straight into the final
  // checkout settlement screen, instead of only ever reflecting whatever
  // mode it was opened in.
  const [internalMode, setInternalMode] = useState(mode);
  useEffect(() => {
    if (isOpen) setInternalMode(mode);
  }, [isOpen, mode]);

  // Base State
  const [editGuestName, setEditGuestName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [roomCharges, setRoomCharges] = useState(0);
  const [advancePaid, setAdvancePaid] = useState(0);
  const [checkinDate, setCheckinDate] = useState('');
  const [checkoutDate, setCheckoutDate] = useState('');
  const [advanceReceivedBy, setAdvanceReceivedBy] = useState('');
  const [pendingReceivedBy, setPendingReceivedBy] = useState('');
  // Kitchen / Incidentals State
  const [menuList, setMenuList] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [incidentals, setIncidentals] = useState<IncidentalItem[]>([]);

  // Custom Adjustments State
  // No default - staff must explicitly pick a strategy before adding an
  // adjustment, rather than silently inheriting "charge" if they don't touch
  // the dropdown.
  const [adjType, setAdjType] = useState<'charge' | 'discount' | ''>('');
  const [adjReasonCharge, setAdjReasonCharge] = useState('Misc');
  const [adjReasonDiscount, setAdjReasonDiscount] = useState('');
  const [adjAmount, setAdjAmount] = useState<number | ''>('');
  const [adjustments, setAdjustments] = useState<ManualAdjustment[]>([]);

  // GST State
  const [gstEnabled, setGstEnabled] = useState(false);
  // Inter-state (IGST) billing was removed as an option - guests are always
  // billed same-state (CGST+SGST split), so there's nothing left to toggle.
  const [guestGstin, setGuestGstin] = useState('');
  const [guestBillingName, setGuestBillingName] = useState('');
  const [gstRates, setGstRates] = useState<GstRatesConfig>(DEFAULT_GST_RATES);
  const [isEditingRates, setIsEditingRates] = useState(false);
  const [rateDraft, setRateDraft] = useState<GstRatesConfig>(DEFAULT_GST_RATES);
  const [savingRates, setSavingRates] = useState(false);

  // Split Payment Rows
  const [splitRows, setSplitRows] = useState<SplitPaymentRow[]>([
    { id: '1', mode: 'Cash', amount: 0 },
  ]);

  const toInputDateFormat = (dateStr?: string): string => {
    if (!dateStr) return '';
    const clean = dateStr.split(' ')[0].split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return clean;
    }
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch {
      return '';
    }
  };

  // Fetch Menu items from DB if kitchen module enabled
  useEffect(() => {
    if (kitchenModuleEnabled && isOpen) {
      fetchMenuFromDB().then((data) => {
        if (data && Array.isArray(data)) {
          setMenuList(data.map((m: any) => ({
            id: String(m.id),
            name: m.name || m.dishName || 'Item',
            price: Number(m.price || 0),
          })));
        }
      });
    }
  }, [kitchenModuleEnabled, isOpen]);

  // Vendors/third parties with a QR code on file - lets a UPI split row be
  // paid straight into their account instead of always the property's own.
  const [payees, setPayees] = useState<PayeeEntity[]>([]);
  useEffect(() => {
    if (isOpen) {
      fetchPayeesFromDB().then((data) => setPayees(Array.isArray(data) ? data : []));
    }
  }, [isOpen]);

  // Which row's QR code is currently expanded for scanning (only one at a
  // time - keeps the split matrix from turning into a wall of QR images).
  const [visibleQrRowId, setVisibleQrRowId] = useState<string | null>(null);

  // Anyone a UPI split row can be paid to: staff cash handlers (personal QR)
  // plus vendors/third parties (PayeeEntity) - only those with a QR code on
  // file, since picking someone without one wouldn't show anything useful.
  const payToOptions = useMemo(() => {
    const staffOptions = cashHandlers
      .filter((s) => s.qrCodeUrl)
      .map((s) => ({ id: `staff-${s.id}`, name: s.name, qrCodeUrl: s.qrCodeUrl!, group: 'Staff' }));
    const payeeOptions = payees
      .filter((p) => p.qrCodeUrl)
      .map((p) => ({ id: `payee-${p.id}`, name: p.name, qrCodeUrl: p.qrCodeUrl!, group: 'Registered Payees' }));
    return [...staffOptions, ...payeeOptions];
  }, [cashHandlers, payees]);

  // GST rates are a config value (system_settings key "gst_rates_config"), not
  // hardcoded - falls back to DEFAULT_GST_RATES until a Root Admin overrides it.
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/php/api/router.php?action=get_system_settings`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        const raw = json?.data?.gst_rates_config;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setGstRates({ ...DEFAULT_GST_RATES, ...parsed });
          } catch {}
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Initialize form with guest data when modal opens
  useEffect(() => {
    if (guest && isOpen) {
      setEditGuestName(guest.guestName || '');
      setEditPhoneNumber(guest.phoneNumber || '');
      setCheckinDate(toInputDateFormat(guest.checkinDate));
      setCheckoutDate(toInputDateFormat(guest.expectedCheckout || guest.checkoutDate));
      // "Base Lodging Charges" is the TOTAL charge for the stay (it's what the
      // GST calc below divides by nights to derive a per-night rate for slab
      // lookup, and what gets multiplied by the GST% directly) - was
      // roomRate-first, but roomRate is the PER-NIGHT tariff. For any guest
      // with a roomRate set (the normal case), that silently pre-filled the
      // form with 1 night's worth of charge instead of the full stay,
      // understating both the base invoice and the GST collected on
      // multi-night stays unless staff happened to notice and correct it.
      setRoomCharges(guest.totalAmount ?? guest.roomRate ?? 0);
      setAdvancePaid(guest.advanceAmount || 0);
      setIncidentals([]);
      setAdjustments([]);
      setGstEnabled(false);
      setGuestGstin('');
      setGuestBillingName('');
      // Was hardcoded to '' regardless of what's already on the guest record
      // - "Received By (Booking)" always opened blank at checkout even when
      // the advance was recorded as received by someone at booking time,
      // while "Pending Received By" right next to it correctly loaded from
      // the guest. Same fix BookingDetailsModal.tsx already applies.
      setAdvanceReceivedBy((guest as any).advance_received_by || guest.advanceReceivedBy || '');
      setPendingReceivedBy((guest as any).pending_received_by || guest.pendingReceivedBy || '');

      const lodgingDue = (guest.totalAmount ?? guest.roomRate ?? 0) - (guest.advanceAmount || 0);
      setSplitRows([{ id: '1', mode: 'Cash', amount: Math.max(0, lodgingDue) }]);

      // Auto-load charged service requests for this guest / room
      fetchServiceRequestsFromDB().then((allReqs) => {
        if (!allReqs || !Array.isArray(allReqs)) return;
        const gRoomId = (guest as any).roomId || (guest as any).room_id;
        const gRoomName = (guest.roomNumber || '').toLowerCase().trim();

        const chargedReqs = allReqs.filter((r) => {
          const amt = Number(r.chargeAmount || (r as any).charge_amount || 0);
          if (amt <= 0) return false;
          if ((r.status as string) === 'Cancelled') return false;

          if (gRoomId && Number(r.roomId) === Number(gRoomId)) return true;
          const reqRoom = String(r.roomName || '').toLowerCase().trim();
          if (reqRoom && gRoomName && (reqRoom === gRoomName || reqRoom.includes(gRoomName) || gRoomName.includes(reqRoom))) return true;

          return false;
        });

        if (chargedReqs.length > 0) {
          const serviceReqAdjustments: ManualAdjustment[] = chargedReqs.map((sr) => {
            const raw = sr.requestType || 'Service Request';
            const label = raw.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            return {
              id: `svc-req-${sr.id}`,
              type: 'charge',
              reason: `[Service Request] ${label}`,
              amount: Number(sr.chargeAmount || (sr as any).charge_amount || 0),
            };
          });

          setAdjustments((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const newItems = serviceReqAdjustments.filter((a) => !existingIds.has(a.id));
            return [...prev, ...newItems];
          });
        }
      });
    }
  }, [guest, isOpen]);

  if (!isOpen || !guest) return null;

  // Food / Incidentals Subtotal
  const foodTotal = kitchenModuleEnabled ? incidentals.reduce((sum, i) => sum + i.price * i.quantity, 0) : 0;

  // Lodging Pending Due - both roomCharges and advancePaid are editable
  // fields (state), so this recalculates live as either is typed.
  const lodgingPendingDue = Math.max(0, roomCharges - advancePaid);

  // Manual Adjustments Subtotals
  const extraCharges = adjustments.filter(a => a.type === 'charge').reduce((sum, a) => sum + a.amount, 0);
  const discounts = adjustments.filter(a => a.type === 'discount').reduce((sum, a) => sum + a.amount, 0);

  // Base Subtotal before GST
  const subtotalBeforeGst = Math.max(0, lodgingPendingDue + foodTotal + extraCharges - discounts);

  // GST Calculation Logic - accommodation rate is a configurable slab (see
  // gstRates / DEFAULT_GST_RATES), food is a flat configurable rate. The slab
  // is keyed off the per-night tariff, not the total stay cost, so derive it
  // from the actual lodging charge being billed rather than the guest's
  // stale registration-time roomRate (which may be 0 or long out of date).
  const nightsForGst = (() => {
    const inD = new Date(checkinDate || guest.checkinDate);
    const outD = new Date(checkoutDate || new Date().toISOString().split('T')[0]);
    const diff = Math.round((outD.getTime() - inD.getTime()) / 86400000);
    return Math.max(1, diff);
  })();
  const dailyRate = roomCharges / nightsForGst;
  const gstAccommodationRate = dailyRate > gstRates.accMidMax
    ? gstRates.accHighRate
    : dailyRate > gstRates.accLowMax
    ? gstRates.accMidRate
    : gstRates.accLowRate;
  const gstFoodRate = gstRates.foodRate;

  // GST is owed on the full accommodation invoice value, not on whatever
  // happens to still be outstanding after subtracting an advance - a guest
  // who paid a bigger advance doesn't thereby owe less tax. Base it on
  // roomCharges (the actual charge for the stay), not lodgingPendingDue.
  const gstAccommodationAmount = gstEnabled ? roomCharges * (gstAccommodationRate / 100) : 0;
  const gstFoodAmount = (gstEnabled && kitchenModuleEnabled) ? foodTotal * (gstFoodRate / 100) : 0;

  const gstAmount = gstAccommodationAmount + gstFoodAmount;
  // Tax is always split evenly into CGST+SGST (same-state billing only - see
  // the removed inter-state/IGST option above).
  const gstCgst = gstAmount / 2;
  const gstSgst = gstAmount / 2;

  // Grand Target Due = what's left to collect right now (after the advance).
  const grandTargetDue = subtotalBeforeGst + gstAmount;
  // Grand Total = the true, full invoice value for the entire stay - what
  // the guest would have paid start to finish, advance included. Shown
  // separately so "the bill" and "what's still owed today" are never
  // conflated into one number.
  const grandTotalFullStay = grandTargetDue + advancePaid;

  // Total entered in Split Rows
  const totalSplitSum = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const isSplitMatching = Math.abs(totalSplitSum - grandTargetDue) < 0.01;

  // Add Incidental Item from dropdown
  const handleAddIncidentalItem = () => {
    if (!selectedMenuId) return;
    const menuItem = menuList.find(m => m.id === selectedMenuId);
    if (!menuItem) return;

    const validQty = Math.max(1, itemQty);

    setIncidentals(prev => {
      const existing = prev.find(i => i.id === menuItem.id);
      if (existing) {
        return prev.map(i => i.id === menuItem.id ? { ...i, quantity: i.quantity + validQty } : i);
      }
      return [...prev, { id: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: validQty }];
    });

    setSelectedMenuId('');
    setItemQty(1);
  };

  const handleUpdateIncidentalQty = (id: string, delta: number) => {
    setIncidentals(prev =>
      prev
        .map(i => (i.id === id ? { ...i, quantity: i.quantity + delta } : i))
        .filter(i => i.quantity > 0)
    );
  };

  // Add Custom Adjustment
  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjType || !adjAmount || Number(adjAmount) <= 0) return;

    const reason = adjType === 'charge' ? adjReasonCharge : (adjReasonDiscount.trim() || 'Discount Rebate');
    const newAdj: ManualAdjustment = {
      id: `adj-${Date.now()}`,
      type: adjType,
      reason,
      amount: Number(adjAmount),
    };

    setAdjustments(prev => [...prev, newAdj]);
    setAdjAmount('');
    setAdjReasonDiscount('');
    setAdjType('');
  };

  const handleRemoveAdjustment = (id: string) => {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  };

  // Split Payment Rows Handlers
  const handleAddSplitRow = () => {
    // New row starts pre-filled with whatever's still unaccounted for, not 0 -
    // staff shouldn't have to do the subtraction themselves.
    const remaining = Math.max(0, grandTargetDue - totalSplitSum);
    setSplitRows(prev => [...prev, { id: String(Date.now()), mode: 'Cash', amount: remaining }]);
  };

  const handleUpdateSplitRow = (id: string, field: keyof SplitPaymentRow, val: any) => {
    setSplitRows(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, [field]: val } : r);
      // Editing any row's amount (other than the last) auto-balances the
      // LAST row to make the total match what's actually due, instead of
      // leaving staff to do the subtraction and re-type it themselves.
      if (field === 'amount' && updated.length > 1) {
        const lastIdx = updated.length - 1;
        if (updated[lastIdx].id !== id) {
          const sumExceptLast = updated.slice(0, lastIdx).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
          updated[lastIdx] = { ...updated[lastIdx], amount: Math.max(0, grandTargetDue - sumExceptLast) };
        }
      }
      return updated;
    });
  };

  const handleRemoveSplitRow = (id: string) => {
    if (splitRows.length <= 1) return;
    setSplitRows(prev => prev.filter(r => r.id !== id));
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

  // Shared by both "Save Booking Changes" and "Save and Proceed to Checkout" -
  // pushes the current edits back to the guest record. Returns whether there
  // was anything to save. Accepts overrides so a caller that just changed
  // roomCharges/advancePaid/pendingReceivedBy via setState can save the FRESH
  // value immediately instead of racing React's async state update (state
  // wouldn't be committed yet if we just read the closured variable here).
  const saveGuestEdits = (overrides: Partial<{ roomCharges: number; advancePaid: number; pendingReceivedBy: string }> = {}): boolean => {
    if (!onUpdateGuest || !guest) return false;
    const effectiveRoomCharges = overrides.roomCharges ?? roomCharges;
    const effectiveAdvancePaid = overrides.advancePaid ?? advancePaid;
    const effectivePendingReceivedBy = overrides.pendingReceivedBy ?? pendingReceivedBy;
    const updatedFoodBill = (guest.foodBill || 0) + foodTotal;
    const totalChargesCalculated = effectiveRoomCharges + updatedFoodBill + extraCharges - discounts + gstAmount;

    onUpdateGuest({
      ...guest,
      guestName: editGuestName.trim() || guest.guestName,
      phoneNumber: editPhoneNumber.trim() || guest.phoneNumber,
      checkinDate: checkinDate || guest.checkinDate,
      expectedCheckout: checkoutDate || guest.expectedCheckout,
      roomRate: effectiveRoomCharges,
      foodBill: updatedFoodBill,
      totalAmount: totalChargesCalculated,
      advanceAmount: effectiveAdvancePaid,
      // advanceReceivedBy (the "Received By (Booking)" dropdown) was never
      // included here - the ...guest spread above always won with the
      // original, unedited value, so correcting who received the advance at
      // checkout was silently discarded on save. Same bug class as
      // pendingReceivedBy below, which already had this fix.
      advanceReceivedBy: advanceReceivedBy || guest.advanceReceivedBy,
      pendingReceivedBy: effectivePendingReceivedBy || guest.pendingReceivedBy,
    });
    return true;
  };

  // Naming someone in "Pending Received By" IS the payment event (confirmed
  // with the user 19 Aug 2026) - not mere attribution. It means this specific
  // person just collected the outstanding lodging balance right now, so fold
  // it straight into Advance Paid (the running "collected so far" counter -
  // see lodgingPendingDue = roomCharges - advancePaid above) and save
  // immediately, same real-time treatment as editing Advance Paid directly.
  // Clearing the dropdown back to blank does NOT reverse this - money doesn't
  // un-collect itself; a mistaken selection must be fixed via Advance Paid.
  const handlePendingReceivedByChange = (val: string) => {
    setPendingReceivedBy(val);
    if (val) {
      setAdvancePaid(roomCharges);
      saveGuestEdits({ advancePaid: roomCharges, pendingReceivedBy: val });
    }
  };

  // Advance Paid and Base Lodging Charges directly determine Pending Lodging
  // Due (see lodgingPendingDue above) - staff correcting either one at
  // checkout (e.g. guest hands over the balance in cash right before
  // settlement) need that reflected in the guest record immediately, not
  // only after the final "Checkout & Close Booking" click. Fires the same
  // save used by that button, just on blur of either field.
  const handleMoneyFieldBlur = () => {
    saveGuestEdits();
  };

  const handleSaveOrCheckout = () => {
    if (internalMode === 'edit-only') {
      saveGuestEdits();
      onClose();
    } else {
      // Persist who's collecting the pending due (and any other edits) to
      // the guest record before settling - this branch used to skip
      // saveGuestEdits entirely when the modal opens straight into checkout
      // mode (not via "Save and Proceed"), so pending_received_by picked
      // here was silently dropped instead of reaching guests.php.
      saveGuestEdits();

      const receipt: BillingReceipt = {
        id: `REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        guestId: guest.id,
        guestName: guest.guestName,
        roomNumber: guest.roomNumber,
        checkinDate: checkinDate || guest.checkinDate,
        checkoutDate: checkoutDate || new Date().toISOString().split('T')[0],
        roomTotal: roomCharges,
        kitchenTotal: foodTotal,
        miscTotal: extraCharges,
        discount: discounts,
        grandTotal: grandTargetDue,
        advancePaid,
        status: 'Paid',
        paymentMethod: splitRows[0]?.mode || 'Cash',
        gstEnabled,
        gstRate: gstAccommodationRate,
        gstAmount,
        gstCgst,
        gstSgst,
        gstAccommodationRate,
        gstFoodRate,
        gstAccommodationAmount,
        gstFoodAmount,
        gstTaxType: 'cgst_sgst',
        guestGstin: guestGstin || undefined,
        guestBillingName: guestBillingName || undefined,
      };

      onCheckout(receipt);
      onClose();
    }
  };

  // Saves the current edits without closing, then flips this same modal
  // into checkout mode - staff no longer have to save, close, and reopen
  // through a different entry point to go straight to final settlement.
  const handleSaveAndProceedToCheckout = () => {
    saveGuestEdits();
    setInternalMode('edit-and-checkout');
  };

  return (
    <>
      {/* z-[58] matches the app's "real full-page modal" z-index tier (see the
          scale note in src/index.css) - Flowbite's Modal portals to
          document.body at a bare z-50, which the CSS rule that auto-bumps
          `fixed inset-0 z-50` backdrops can't reach (different class tokens),
          so every Flowbite modal needs this override or it renders behind
          the header/sidebar. */}
      <FlowbiteModal show={isOpen} onClose={onClose} size="5xl" dismissible className="z-58">
      <ModalHeader>
        <div>
          <h2 className="receipt-edit-modal__title text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-blue-600" />
            {internalMode === 'edit-only' ? t('edit_booking_billing_heading', 'Edit Guest Booking & Billing Details') : t('checkout_settlement_heading', 'Guest Billing & Final Checkout Settlement')}
          </h2>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
            Room: {guest.roomNumber} • Guest: {editGuestName || guest.guestName} ({editPhoneNumber || guest.phoneNumber})
          </p>
        </div>
      </ModalHeader>

      <ModalBody className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: Accommodation + Food Orders (LG: 7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Accommodation & Booking Dates */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 pb-2">
                  <Home className="w-4 h-4 text-blue-600" />
                  <span>{t('accommodation_breakdown_heading', 'Accommodation Invoice Breakdown')}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input
                      label={t('guest_name_only_label', 'Guest Name')}
                      type="text"
                      value={editGuestName}
                      onChange={(e) => setEditGuestName(e.target.value)}
                      className="text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <Input
                      label={t('phone_number_label', 'Phone Number')}
                      type="tel"
                      value={editPhoneNumber}
                      onChange={(e) => setEditPhoneNumber(e.target.value)}
                      className="text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <DateRangePicker
                  checkinDate={checkinDate}
                  checkoutDate={checkoutDate}
                  onCheckinChange={setCheckinDate}
                  onCheckoutChange={setCheckoutDate}
                />

                <div>
                  <Input
                    label={t('base_lodging_charges_label', 'Base Lodging Charges (₹)')}
                    type="number"
                    value={roomCharges}
                    onChange={(e) => setRoomCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                    onBlur={handleMoneyFieldBlur}
                    className="text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-3 space-y-2 text-xs border border-emerald-200 dark:border-emerald-800">
                  <div className="flex justify-between items-center font-semibold gap-2">
                    <span className="text-slate-700 dark:text-slate-300 shrink-0">{t('advance_paid_label', 'Advance Paid:')}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">+₹</span>
                      <input
                        type="number"
                        value={advancePaid}
                        onChange={(e) => setAdvancePaid(Math.max(0, parseFloat(e.target.value) || 0))}
                        onBlur={handleMoneyFieldBlur}
                        className="summary-line summary-line--advance-paid w-24 text-right text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>
                  <div>
                    <StyledSelect
                      label={t('received_by_booking_label', 'Received By (Booking)')}
                      value={advanceReceivedBy}
                      onChange={setAdvanceReceivedBy}
                      placeholder={t('choose_cash_handler_placeholder', '-- Choose cash handler --')}
                      options={cashHandlers.map((s) => ({ value: s.name, label: s.name }))}
                    />
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3 space-y-2 text-xs border border-amber-200 dark:border-amber-800">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-slate-700 dark:text-slate-300">{t('pending_lodging_due_label', 'Pending Lodging Due:')}</span>
                    <span className="summary-line summary-line--pending-lodging-due text-amber-700 dark:text-amber-400 text-sm font-semibold">₹{lodgingPendingDue.toFixed(2)}</span>
                  </div>
                  <div>
                    <StyledSelect
                      label={t('pending_received_by_label', 'Pending Received By')}
                      value={pendingReceivedBy}
                      onChange={handlePendingReceivedByChange}
                      placeholder={t('choose_cash_handler_placeholder', '-- Choose cash handler --')}
                      options={cashHandlers.map((s) => ({ value: s.name, label: s.name }))}
                    />
                  </div>
                </div>
              </div>

              {/* Food Orders & Incidentals Log (Interactive Dish Insertion if Kitchen Enabled) */}
              {kitchenModuleEnabled && (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="text-[10px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-cyan-600" />
                      {t('food_incidentals_heading', 'Food Orders & Incidentals Log')}
                    </span>
                    <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                      Subtotal: ₹{foodTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Dish / Item Selector Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-7">
                      <StyledSelect
                        label={t('select_dish_item_label', 'Select Dish / Item')}
                        value={selectedMenuId}
                        onChange={setSelectedMenuId}
                        options={[
                          { value: '', label: t('choose_menu_dish_placeholder', '-- Choose Menu Dish --') },
                          ...menuList.map(m => ({ value: m.id, label: `${m.name} (₹${m.price})` }))
                        ]}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label={t('quantity_label', 'Quantity')}
                        type="number"
                        min="1"
                        value={itemQty}
                        onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="text-xs font-semibold text-center"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddIncidentalItem}
                        disabled={!selectedMenuId}
                        className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs rounded-lg disabled:opacity-50 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('insert_button', 'Insert')}
                      </button>
                    </div>
                  </div>

                  {/* Table of Incidentals */}
                  {incidentals.length > 0 ? (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                      <table className="w-full text-xs text-left receipt-edit-modal__table">
                        <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-600 receipt-edit-modal__table-header">
                          <tr className="receipt-edit-modal__table-header-row">
                            <th className="py-2 px-3 receipt-edit-modal__table-header-cell">{t('description_item_column', 'Description Item')}</th>
                            <th className="py-2 px-3 text-center receipt-edit-modal__table-header-cell">{t('qty_column', 'Qty')}</th>
                            <th className="py-2 px-3 text-right receipt-edit-modal__table-header-cell">{t('total_column', 'Total')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 receipt-edit-modal__table-body">
                          {incidentals.map((item) => (
                            <tr key={item.id}>
                              <td className="receipt-edit-modal__cell py-2 px-3 font-semibold text-slate-900 dark:text-white">
                                {item.name} <span className="text-[10px] text-slate-400">(₹{item.price})</span>
                              </td>
                              <td className="receipt-edit-modal__cell py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateIncidentalQty(item.id, -1)}
                                    className="w-5 h-5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 rounded font-semibold text-xs"
                                  >
                                    -
                                  </button>
                                  <span className="font-semibold text-xs px-1">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateIncidentalQty(item.id, 1)}
                                    className="w-5 h-5 bg-cyan-600 text-white hover:bg-cyan-700 rounded font-semibold text-xs"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="receipt-edit-modal__cell py-2 px-3 text-right font-semibold text-slate-900 dark:text-white">
                                ₹{(item.price * item.quantity).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic text-center py-2">
                      {t('no_incidentals_message', 'No incidentals or food orders logged yet. Select a dish above to add.')}
                    </p>
                  )}
                </div>
              )}

            </div>

            {/* RIGHT COLUMN: Strategy Adjustments + Final Split Settlement (LG: 5 cols) */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-0 self-start">

              {internalMode === 'edit-and-checkout' && (
                <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/30">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Ready to settle this stay</p>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-300">Confirm the balance, choose a payment method, then close the booking.</p>
                  </div>
                </div>
              )}

              {/* Strategy Type Custom Adjustments */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 space-y-3">
                <span className="text-[10px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide block border-b border-slate-200 dark:border-slate-700 pb-2">
                  {t('add_custom_adjustments_heading', 'Add Custom Adjustments')}
                </span>

                <form onSubmit={handleAddAdjustment} className="app-form app-form--add-adjustment space-y-3 text-xs">
                  <div>
                    <StyledSelect
                      label={t('strategy_type_label', 'Strategy Type')}
                      value={adjType}
                      onChange={(val) => setAdjType(val as 'charge' | 'discount')}
                      placeholder={t('choose_placeholder', '-- Choose --')}
                      options={[
                        { value: 'charge', label: t('extra_incidentals_charge_option', 'Extra Incidentals Charge (+)') },
                        { value: 'discount', label: t('discount_rebate_option', 'Discount Rebate (-)') },
                      ]}
                    />
                  </div>

                  {adjType === 'charge' && (
                    <div>
                      <StyledSelect
                        label={t('charge_category_label', 'Charge Category')}
                        value={adjReasonCharge}
                        onChange={setAdjReasonCharge}
                        options={[
                          { value: 'Decoration Fees', label: 'Decoration Fees' },
                          { value: 'Extra Housekeeping', label: 'Extra Housekeeping' },
                          { value: 'Misc', label: 'Misc' },
                          { value: 'Pet Stay Charges', label: 'Pet Stay Charges' },
                        ]}
                      />
                    </div>
                  )}
                  {adjType === 'discount' && (
                    <div>
                      <Input
                        label={t('discount_label_label', 'Discount Label')}
                        type="text"
                        value={adjReasonDiscount}
                        onChange={(e) => setAdjReasonDiscount(e.target.value)}
                        placeholder={t('discount_label_placeholder', 'e.g. Service Apology...')}
                        className="font-semibold"
                      />
                    </div>
                  )}

                  <div>
                    <Input
                      label={t('amount_label', 'Amount (₹)')}
                      type="number"
                      step="0.01"
                      min="0"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="font-semibold"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!adjType || !adjAmount || Number(adjAmount) <= 0}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all cursor-pointer text-xs"
                  >
                    {t('apply_adjustment_button', 'Apply Adjustment')}
                  </button>
                </form>

                {/* Applied Adjustments List */}
                {adjustments.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs mt-2">
                    <span className="font-semibold text-slate-500 uppercase text-[10px] block">{t('applied_adjustments_label', 'Applied Adjustments')}</span>
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-center justify-between font-semibold">
                        <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          <CornerDownRight className="w-3.5 h-3.5" /> {adj.reason}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={adj.type === 'charge' ? 'text-red-600' : 'text-emerald-600'}>
                            {adj.type === 'charge' ? '+' : '-'}₹{adj.amount.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAdjustment(adj.id)}
                            className="text-red-500 hover:text-red-700 p-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Final Checkout Split Settlement Box */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/30 rounded-lg border-2 border-emerald-500/80 p-4 sm:p-6 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-900 dark:text-emerald-200 uppercase tracking-wide border-b border-emerald-200/60 pb-2">
                  <IndianRupee className="w-4 h-4 text-emerald-600" />
                  <span>{t('final_checkout_split_heading', 'Final Checkout Split Settlement')}</span>
                </div>

                <div className="space-y-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>{t('pending_lodging_due_label', 'Pending Lodging Due:')}</span>
                    <span className="font-semibold">₹{lodgingPendingDue.toFixed(2)}</span>
                  </div>

                  {kitchenModuleEnabled && (
                    <div className="flex justify-between">
                      <span>{t('food_incidentals_subtotal_label', 'Food & Incidentals Subtotal:')}</span>
                      <span className="font-semibold">₹{foodTotal.toFixed(2)}</span>
                    </div>
                  )}

                  {extraCharges > 0 && (
                    <div className="flex justify-between text-red-600 font-semibold">
                      <span>{t('extra_charges_label', '(+) Extra Charges:')}</span>
                      <span>+₹{extraCharges.toFixed(2)}</span>
                    </div>
                  )}

                  {discounts > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>{t('discount_rebate_label', '(-) Discount Rebate:')}</span>
                      <span>-₹{discounts.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Apply GST Toggle Switch */}
                  <div className="flex items-center justify-between border-t border-dashed border-emerald-200 dark:border-emerald-800 pt-2">
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
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{t('apply_gst_label', 'Apply GST')}</span>
                    </div>
                    {gstEnabled && (
                      <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        Acc: {gstAccommodationRate}% | Food: {gstFoodRate}%
                      </span>
                    )}
                  </div>

                  {/* Itemized GST Breakdown */}
                  {gstEnabled && (
                    <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2 text-[11px] text-blue-900 dark:text-blue-200">
                      <div className="flex justify-between">
                        <span>Accommodation GST @ {gstAccommodationRate}%:</span>
                        <span className="font-semibold">₹{gstAccommodationAmount.toFixed(2)}</span>
                      </div>
                      {kitchenModuleEnabled && foodTotal > 0 && (
                        <div className="flex justify-between">
                          <span>Food GST @ {gstFoodRate}%:</span>
                          <span className="font-semibold">₹{gstFoodAmount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="border-t border-dashed border-blue-200 dark:border-blue-700 pt-1 mt-1 flex justify-between font-extrabold text-[11px]">
                        <span>{t('cgst_sgst_label', 'CGST (50%) / SGST (50%):')}</span>
                        <span>₹{gstCgst.toFixed(2)} / ₹{gstSgst.toFixed(2)}</span>
                      </div>

                      {/* Optional guest/company GSTIN for a proper tax invoice */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Input
                          type="text"
                          value={guestGstin}
                          onChange={(e) => setGuestGstin(e.target.value.toUpperCase())}
                          placeholder={t('guest_gstin_placeholder', 'Guest/Company GSTIN (optional)')}
                          className="text-[11px]"
                        />
                        <Input
                          type="text"
                          value={guestBillingName}
                          onChange={(e) => setGuestBillingName(e.target.value)}
                          placeholder={t('billing_name_placeholder', 'Billing Name (optional)')}
                          className="text-[11px]"
                        />
                      </div>

                      {isRootAdmin && (
                        <div className="pt-1 border-t border-dashed border-blue-200 dark:border-blue-700">
                          {!isEditingRates ? (
                            <button
                              type="button"
                              onClick={() => { setRateDraft(gstRates); setIsEditingRates(true); }}
                              className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 underline cursor-pointer"
                            >
                              {t('edit_gst_rates_button', 'Edit GST Rates (Root Admin)')}
                            </button>
                          ) : (
                            <div className="space-y-1.5 pt-1">
                              <div className="grid grid-cols-2 gap-1.5">
                                <Input
                                  label={t('low_tier_max_label', 'Low tier max (₹)')}
                                  type="number"
                                  value={rateDraft.accLowMax}
                                  onChange={(e) => setRateDraft({ ...rateDraft, accLowMax: Number(e.target.value) })}
                                  labelClassName="text-[10px]"
                                />
                                <Input
                                  label={t('mid_tier_max_label', 'Mid tier max (₹)')}
                                  type="number"
                                  value={rateDraft.accMidMax}
                                  onChange={(e) => setRateDraft({ ...rateDraft, accMidMax: Number(e.target.value) })}
                                  labelClassName="text-[10px]"
                                />
                                <Input
                                  label={t('low_rate_label', 'Low rate (%)')}
                                  type="number"
                                  value={rateDraft.accLowRate}
                                  onChange={(e) => setRateDraft({ ...rateDraft, accLowRate: Number(e.target.value) })}
                                  labelClassName="text-[10px]"
                                />
                                <Input
                                  label={t('mid_rate_label', 'Mid rate (%)')}
                                  type="number"
                                  value={rateDraft.accMidRate}
                                  onChange={(e) => setRateDraft({ ...rateDraft, accMidRate: Number(e.target.value) })}
                                  labelClassName="text-[10px]"
                                />
                                <Input
                                  label={t('high_rate_label', 'High rate (%)')}
                                  type="number"
                                  value={rateDraft.accHighRate}
                                  onChange={(e) => setRateDraft({ ...rateDraft, accHighRate: Number(e.target.value) })}
                                  labelClassName="text-[10px]"
                                />
                                <Input
                                  label={t('food_rate_label', 'Food rate (%)')}
                                  type="number"
                                  value={rateDraft.foodRate}
                                  onChange={(e) => setRateDraft({ ...rateDraft, foodRate: Number(e.target.value) })}
                                  labelClassName="text-[10px]"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setIsEditingRates(false)} className="text-[10px] font-semibold text-slate-500 cursor-pointer">{t('cancel_button', 'Cancel')}</button>
                                <button
                                  type="button"
                                  disabled={savingRates}
                                  onClick={async () => {
                                    setSavingRates(true);
                                    try {
                                      const res = await fetch(`/php/api/router.php?action=save_system_settings`, {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json', 'X-User-Role': 'root_admin' },
                                        body: JSON.stringify({ setting_key: 'gst_rates_config', setting_value: JSON.stringify(rateDraft) }),
                                      });
                                      const json = await res.json();
                                      if (json.status === 'success' || json.success) {
                                        setGstRates(rateDraft);
                                        setIsEditingRates(false);
                                        showToast('GST rates updated', { type: 'success' });
                                      } else {
                                        showToast(json.error || json.message || 'Failed to save GST rates', { type: 'error' });
                                      }
                                    } catch (err) {
                                      showToast('Failed to save GST rates', { type: 'error' });
                                    } finally {
                                      setSavingRates(false);
                                    }
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                                >
                                  {savingRates ? 'Saving...' : t('save_rates_button', 'Save Rates')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Grand Total (full stay, advance included) vs. what's
                      still owed right now - kept as two distinct numbers so
                      "the bill" and "the pending payment" are never the same
                      line. */}
                  <div className="border-t-2 border-emerald-300 dark:border-emerald-700 pt-2 space-y-1">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span>{t('grand_total_full_stay_label', 'Grand Total (Full Stay):')}</span>
                      <span className="summary-line summary-line--grand-total">₹{grandTotalFullStay.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-extrabold">
                      <span className="text-slate-900 dark:text-white">{t('grand_target_due_label', 'Grand Target Due (Pending Today):')}</span>
                      <span className="summary-line summary-line--grand-target-due text-emerald-700 dark:text-emerald-400 text-lg">₹{grandTargetDue.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] pt-1">
                    <span>{t('total_stacked_entered_label', 'Total Stacked Entered:')}</span>
                    <span className={`summary-line summary-line--total-stacked font-semibold ${isSplitMatching ? 'text-emerald-600' : 'text-red-600'}`}>
                      ₹{totalSplitSum.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Split Distribution Matrix */}
                <div className="space-y-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{t('split_distribution_matrix_heading', 'Split Distribution Matrix')}</span>
                    <button
                      type="button"
                      onClick={handleAddSplitRow}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('add_row_button', 'Add Row')}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {splitRows.map((row) => {
                      const selectedPayTo = payToOptions.find((p) => p.id === row.payToId);
                      return (
                      <div key={row.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(e) => handleUpdateSplitRow(row.id, 'amount', Math.max(0, Number(e.target.value)))}
                            placeholder={t('amount_placeholder', 'Amount (₹)')}
                            className="flex-1 font-extrabold"
                          />
                          <StyledSelect
                            value={row.mode}
                            onChange={(val) => handleUpdateSplitRow(row.id, 'mode', val as any)}
                            options={[
                              { value: 'Cash', label: 'Cash' },
                              { value: 'UPI', label: 'UPI' },
                              { value: 'Card', label: 'Card' },
                              { value: 'Bank Transfer', label: 'Bank Transfer' },
                            ]}
                          />
                          {splitRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSplitRow(row.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* UPI rows: choose whose account this goes to (own
                            staff or a vendor/payee) and reveal their QR to
                            scan - lets a payment be taken directly into a
                            vendor's account rather than always the desk's. */}
                        {row.mode === 'UPI' && (
                          <div className="flex items-center gap-2 pl-1">
                            <StyledSelect
                              value={row.payToId || ''}
                              onChange={(val) => { handleUpdateSplitRow(row.id, 'payToId', val); setVisibleQrRowId(null); }}
                              placeholder={t('pay_to_placeholder', '-- Pay to --')}
                              className="flex-1"
                              options={payToOptions.map((p) => ({ value: p.id, label: p.name, group: p.group }))}
                            />
                            <button
                              type="button"
                              disabled={!selectedPayTo}
                              onClick={() => setVisibleQrRowId((prev) => (prev === row.id ? null : row.id))}
                              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                            >
                              <QrCode className="w-3.5 h-3.5" /> {visibleQrRowId === row.id ? t('hide_qr_button', 'Hide QR') : t('show_qr_button', 'Show QR')}
                            </button>
                          </div>
                        )}
                        {row.mode === 'UPI' && visibleQrRowId === row.id && selectedPayTo && (
                          <div className="flex flex-col items-center gap-1 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                            <img src={selectedPayTo.qrCodeUrl} alt={`${selectedPayTo.name} UPI QR code`} className="w-32 h-32 object-contain" />
                            <span className="text-[10px] font-semibold text-slate-500">{selectedPayTo.name}</span>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>

              </div>

          </div>
        </div>
      </ModalBody>

      {/* Footer Actions */}
      <ModalFooter className="flex items-center gap-3">
        {internalMode === 'edit-and-checkout' && (
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="flex-1 h-12 py-3 px-4 bg-cyan-600 hover:bg-cyan-700 active:scale-98 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shrink-0"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>{t('preview_share_bill_button', 'Preview & Share Bill')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleSaveOrCheckout}
          disabled={isProcessing || (internalMode === 'edit-and-checkout' && !isSplitMatching)}
          className="flex-1 h-12 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shrink-0"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>
            {isProcessing
              ? (internalMode === 'edit-only' ? 'Saving Changes...' : 'Processing Checkout...')
              : internalMode === 'edit-only'
              ? t('save_booking_changes_button', 'Save Booking Changes')
              : !isSplitMatching
              ? `Split Total Must Equal ₹${grandTargetDue.toFixed(2)}`
              : t('checkout_close_booking_button', 'Checkout & Close Booking')
            }
          </span>
        </button>

        {internalMode === 'edit-only' && (
          <button
            type="button"
            onClick={handleSaveAndProceedToCheckout}
            disabled={isProcessing}
            className="flex-1 h-12 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 shrink-0"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{t('save_and_proceed_checkout_button', 'Save and Proceed to Checkout')}</span>
          </button>
        )}
      </ModalFooter>
    </FlowbiteModal>



      {/* ========================================================================= */}
      {/* POPUP MODAL: CLEAN PRINT-FRIENDLY RECEIPT                                 */}
      {/* ========================================================================= */}
      <FlowbiteModal
        show={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        size="md"
        dismissible
        className="z-[58]"
      >
        <ModalHeader>Receipt preview</ModalHeader>
        <ModalFooter className="order-3 flex items-center gap-2">
          <div className="space-y-4 text-xs">
            {/* Modal Actions Bar */}
            <div
              id="printableReceiptActionsBar"
              className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2"
            >
              <button
                type="button"
                onClick={handleShareReceipt}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer text-xs transition-colors shadow-2xs"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span>{t('share_bill_png_button', 'Share Bill (PNG)')}</span>
              </button>

              <a
                href={`https://api.whatsapp.com/send?phone=${guest.phoneNumber.replace(/\D/g, '').length === 10 ? '91' + guest.phoneNumber.replace(/\D/g, '') : guest.phoneNumber.replace(/\D/g, '')}&text=${encodeURIComponent(
                  `📶 *GUEST CHECKOUT & BILL SETTLEMENT*\n━━━━━━━━━━━━━━━━\n👤 *Guest:* ${guest.guestName}\n🏠 *Room:* ${guest.roomNumber}\n📅 *Check-In:* ${formatDateDDMMYYYY(checkinDate)}\n📅 *Check-Out:* ${formatDateDDMMYYYY(checkoutDate)}\n🏨 *Accommodation:* ₹${roomCharges.toFixed(2)}\n🍽 *Food/Incidentals:* ₹${foodTotal.toFixed(2)}\n📋 *Adjustments:* ₹${(extraCharges - discounts).toFixed(2)}\nâž• *GST/Tax:* ₹${gstAmount.toFixed(2)}\n💰 *Grand Total Paid:* ₹${grandTargetDue.toFixed(2)}${propertyUpiId ? `\n💳 *Pay via UPI:* ${propertyUpiId}` : ''}\n━━━━━━━━━━━━━━━━\nThank you for choosing Ground Code Resort! We hope to see you again soon.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer text-xs transition-colors shadow-2xs text-center"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>Share via WhatsApp</span>
              </a>

            </div>
          </div>
        </ModalFooter>
        <ModalBody className="order-2 max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          {/* Receipt Content */}
          <div id="printableReceiptModalContent" className="space-y-3 text-xs">
              <div className="text-center pb-2 border-b border-slate-200">
                <h3 className="receipt-edit-modal__subtitle font-extrabold text-base text-black uppercase">
                  {propertyName || (guest as any).propertyName || 'Ground Code RESORT'}
                </h3>
                <p className="text-[11px] text-black font-medium">
                  {gstEnabled ? t('tax_invoice_label', 'Tax Invoice') : t('consolidated_settlement_label', 'Consolidated Stay & KOT Settlement')}
                </p>
                {gstEnabled && propertyGstin && (
                  <p className="text-[10px] text-black">GSTIN: {propertyGstin}</p>
                )}
              </div>

              <div className="flex justify-between text-[11px] border-b border-dashed border-slate-300 pb-2 text-black font-semibold">
                <span>
                  <b>{t('guest_colon_label', 'Guest:')}</b> {guest.guestName}
                </span>
                <span>
                  <b>{t('date_colon_label', 'Date:')}</b> {formatDateDDMMYYYY(new Date().toISOString())}
                </span>
              </div>

              {gstEnabled && (guestGstin || guestBillingName) && (
                <div className="text-[11px] border-b border-dashed border-slate-300 pb-2 text-black">
                  {guestBillingName && <div><b>{t('billed_to_label', 'Billed To:')}</b> {guestBillingName}</div>}
                  {guestGstin && <div><b>{t('guest_company_gstin_label', 'Guest/Company GSTIN:')}</b> {guestGstin}</div>}
                </div>
              )}

              {/* Stay Logistics */}
              <div className="space-y-1">
                <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                  Stay Logistics (Room {guest.roomNumber})
                </div>
                <div className="flex justify-between text-black">
                  <span>{t('lodging_contract_charges_label', 'Lodging Contract Charges:')}</span>
                  <span>₹{roomCharges.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-black font-semibold">
                  <span>{t('advance_paid_dash_label', '[-] Advance Paid:')}</span>
                  <span className="summary-line summary-line--advance-paid">₹{advancePaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-black font-semibold border-t border-dashed border-slate-200 pt-1">
                  <span>{t('pending_lodging_settled_label', 'Pending Lodging Settled:')}</span>
                  <span className="summary-line summary-line--pending-lodging-due">₹{lodgingPendingDue.toFixed(2)}</span>
                </div>
              </div>

              {/* KOT Kitchen Incidentals */}
              {kitchenModuleEnabled && incidentals.length > 0 && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between items-center font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                    <span>{t('kot_kitchen_incidentals_heading', 'KOT Kitchen Incidentals')}</span>
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
              )}

              {/* Adjustments: Extra Charges and Discounts */}
              {adjustments.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-dashed border-slate-200">
                  <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                    {t('applied_adjustments_label', 'Applied Adjustments')}
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

              {/* GST Breakdown — item-wise */}
              {gstEnabled && gstAmount > 0 && (
                <div className="space-y-1 pt-2 border-t border-dashed border-slate-200">
                  <div className="font-semibold border-l-2 border-slate-400 pl-2 text-black text-xs">
                    {t('tax_breakdown_heading', 'Tax Breakdown (GST)')}
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
                      <span>{t('cgst_split_label', 'CGST (50% split):')}</span>
                      <span>₹{gstCgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-black text-[11px] font-semibold">
                      <span>{t('sgst_split_label', 'SGST (50% split):')}</span>
                      <span>₹{gstSgst.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="border-t-2 border-b-2 border-black py-2 flex justify-between font-extrabold text-sm text-black">
                <span>{t('grand_total_payable_label', 'Grand Total Payable:')}</span>
                <span className="summary-line summary-line--grand-total-payable">₹{grandTargetDue.toFixed(2)}</span>
              </div>

              {/* UPI Payment (only when the property has a UPI ID configured) */}
              <UpiPaymentBlock
                upiId={propertyUpiId}
                payeeName={propertyName || 'Bill Settlement'}
                amount={grandTargetDue}
                amountLabel="Grand Total"
                note={`Bill - ${guest.guestName}`}
              />
          </div>
        </ModalBody>
      </FlowbiteModal>
    </>
  );
};

