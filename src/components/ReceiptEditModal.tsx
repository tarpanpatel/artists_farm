import React, { useState, useEffect, useMemo } from 'react';
import { X, IndianRupee, Home, User, Calendar, AlertCircle, Plus, Trash2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Guest, BillingReceipt } from '../types';
import { StyledSelect } from './StyledSelect';
import { DateRangePicker } from './DateRangePicker';
import { fetchMenuFromDB } from '../services/api';

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
}

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
}

export const ReceiptEditModal: React.FC<ReceiptEditModalProps> = ({
  isOpen,
  guest,
  allGuests = [],
  onClose,
  onCheckout,
  onUpdateGuest,
  isProcessing = false,
  mode = 'edit-and-checkout',
  kitchenModuleEnabled = true,
}) => {
  // Base State
  const [roomCharges, setRoomCharges] = useState(0);
  const [checkinDate, setCheckinDate] = useState('');
  const [checkoutDate, setCheckoutDate] = useState('');
  const [advanceReceivedBy, setAdvanceReceivedBy] = useState('');
  const [deskCashier, setDeskCashier] = useState('Root Admin');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Calculate blocked dates for the room of this guest
  const blockedDates = useMemo(() => {
    if (!guest || !allGuests.length) return [];
    const blocked = new Set<string>();
    const roomName = guest.roomNumber;

    allGuests.forEach((g) => {
      if (g.status === 'CheckedOut' || (g.status as string) === 'Cancelled') return;
      if (g.id === guest.id) return; // Skip current guest being edited!

      const gRoom = (g.roomNumber || '').toLowerCase().trim();
      const targetRoom = (roomName || '').toLowerCase().trim();
      if (gRoom !== targetRoom && !gRoom.includes(targetRoom) && !targetRoom.includes(gRoom)) return;

      const checkinStr = (g.checkinDate || '').split(' ')[0].split('T')[0];
      const checkoutStr = (g.expectedCheckout || g.checkoutDate || g.checkinDate || '').split(' ')[0].split('T')[0];

      if (!checkinStr || checkinStr.length < 8) return;

      let cur = new Date(checkinStr);
      const end = new Date(checkoutStr || checkinStr);

      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        blocked.add(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
    });

    return Array.from(blocked);
  }, [guest, allGuests]);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'Select Date';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Kitchen / Incidentals State
  const [menuList, setMenuList] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [incidentals, setIncidentals] = useState<IncidentalItem[]>([]);

  // Custom Adjustments State
  const [adjType, setAdjType] = useState<'charge' | 'discount'>('charge');
  const [adjReasonCharge, setAdjReasonCharge] = useState('Misc');
  const [adjReasonDiscount, setAdjReasonDiscount] = useState('');
  const [adjAmount, setAdjAmount] = useState<number | ''>('');
  const [adjustments, setAdjustments] = useState<ManualAdjustment[]>([]);

  // GST State
  const [gstEnabled, setGstEnabled] = useState(false);

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

  // Initialize form with guest data when modal opens
  useEffect(() => {
    if (guest && isOpen) {
      setCheckinDate(toInputDateFormat(guest.checkinDate));
      setCheckoutDate(toInputDateFormat(guest.expectedCheckout || guest.checkoutDate));
      setRoomCharges(guest.roomRate || guest.totalAmount || 0);
      setIncidentals([]);
      setAdjustments([]);
      setGstEnabled(false);
      setAdvanceReceivedBy('');

      const lodgingDue = (guest.roomRate || guest.totalAmount || 0) - (guest.advanceAmount || 0);
      setSplitRows([{ id: '1', mode: 'Cash', amount: Math.max(0, lodgingDue) }]);
    }
  }, [guest, isOpen]);

  if (!isOpen || !guest) return null;

  // Food / Incidentals Subtotal
  const foodTotal = kitchenModuleEnabled ? incidentals.reduce((sum, i) => sum + i.price * i.quantity, 0) : 0;

  // Lodging Pending Due
  const advancePaid = guest.advanceAmount || 0;
  const lodgingPendingDue = Math.max(0, roomCharges - advancePaid);

  // Manual Adjustments Subtotals
  const extraCharges = adjustments.filter(a => a.type === 'charge').reduce((sum, a) => sum + a.amount, 0);
  const discounts = adjustments.filter(a => a.type === 'discount').reduce((sum, a) => sum + a.amount, 0);

  // Base Subtotal before GST
  const subtotalBeforeGst = Math.max(0, lodgingPendingDue + foodTotal + extraCharges - discounts);

  // GST Calculation Logic (Accommodation Slab: <=1000: 0%, 1001-7500: 12%, >7500: 18%. Food: 5%)
  const dailyRate = guest.roomRate || 0;
  const gstAccommodationRate = dailyRate > 7500 ? 18 : dailyRate > 1000 ? 12 : 0;
  const gstFoodRate = 5;

  const gstAccommodationAmount = gstEnabled ? lodgingPendingDue * (gstAccommodationRate / 100) : 0;
  const gstFoodAmount = (gstEnabled && kitchenModuleEnabled) ? foodTotal * (gstFoodRate / 100) : 0;

  const gstAmount = gstAccommodationAmount + gstFoodAmount;
  const gstCgst = gstAmount / 2;
  const gstSgst = gstAmount / 2;

  // Grand Target Due
  const grandTargetDue = subtotalBeforeGst + gstAmount;

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

  const handleRemoveIncidental = (id: string) => {
    setIncidentals(prev => prev.filter(i => i.id !== id));
  };

  // Add Custom Adjustment
  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjAmount || Number(adjAmount) <= 0) return;

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
  };

  const handleRemoveAdjustment = (id: string) => {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  };

  // Split Payment Rows Handlers
  const handleAddSplitRow = () => {
    setSplitRows(prev => [...prev, { id: String(Date.now()), mode: 'Cash', amount: 0 }]);
  };

  const handleUpdateSplitRow = (id: string, field: keyof SplitPaymentRow, val: any) => {
    setSplitRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const handleRemoveSplitRow = (id: string) => {
    if (splitRows.length <= 1) return;
    setSplitRows(prev => prev.filter(r => r.id !== id));
  };

  const handleSaveOrCheckout = () => {
    if (mode === 'edit-only') {
      if (onUpdateGuest && guest) {
        const updatedFoodBill = (guest.foodBill || 0) + foodTotal;
        const totalChargesCalculated = roomCharges + updatedFoodBill + extraCharges - discounts + gstAmount;

        onUpdateGuest({
          ...guest,
          checkinDate: checkinDate || guest.checkinDate,
          expectedCheckout: checkoutDate || guest.expectedCheckout,
          roomRate: roomCharges,
          foodBill: updatedFoodBill,
          totalAmount: totalChargesCalculated,
        });
      }
      onClose();
    } else {
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
      };

      onCheckout(receipt);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-700 my-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <IndianRupee className="w-5 h-5 text-blue-600" />
              {mode === 'edit-only' ? 'Edit Guest Booking & Billing Details' : 'Guest Billing & Final Checkout Settlement'}
            </h2>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              Room: {guest.roomNumber} • Guest: {guest.guestName} ({guest.phoneNumber})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body Grid */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: Accommodation + Food Orders (LG: 7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Accommodation & Booking Dates */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 pb-2">
                  <Home className="w-4 h-4 text-blue-600" />
                  <span>Accommodation Invoice Breakdown</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Check-In Date</label>
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(true)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white flex items-center justify-between hover:border-blue-500 cursor-pointer shadow-2xs"
                    >
                      <span>{checkinDate ? formatDisplayDate(checkinDate) : 'Select Date'}</span>
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Check-Out Date</label>
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(true)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white flex items-center justify-between hover:border-blue-500 cursor-pointer shadow-2xs"
                    >
                      <span>{checkoutDate ? formatDisplayDate(checkoutDate) : 'Select Date'}</span>
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Base Lodging Charges (₹)</label>
                  <input
                    type="number"
                    value={roomCharges}
                    onChange={(e) => setRoomCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3 space-y-2 text-xs border border-emerald-200 dark:border-emerald-800">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-700 dark:text-slate-300">Advance Paid:</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-extrabold text-sm">+₹{advancePaid.toFixed(2)}</span>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Received By (Booking)</label>
                    <input
                      type="text"
                      value={advanceReceivedBy}
                      onChange={(e) => setAdvanceReceivedBy(e.target.value)}
                      placeholder="Staff member name"
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-3 flex justify-between items-center text-xs font-bold border border-amber-200 dark:border-amber-800">
                  <span className="text-slate-700 dark:text-slate-300">Pending Lodging Due:</span>
                  <span className="text-amber-700 dark:text-amber-400 text-sm font-extrabold">₹{lodgingPendingDue.toFixed(2)}</span>
                </div>
              </div>

              {/* Food Orders & Incidentals Log (Interactive Dish Insertion if Kitchen Enabled) */}
              {kitchenModuleEnabled && (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-cyan-600" />
                      Food Orders & Incidentals Log
                    </span>
                    <span className="text-xs font-extrabold text-cyan-700 dark:text-cyan-400">
                      Subtotal: ₹{foodTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Dish / Item Selector Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-7">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Dish / Item</label>
                      <StyledSelect
                        value={selectedMenuId}
                        onChange={setSelectedMenuId}
                        options={[
                          { value: '', label: '-- Choose Menu Dish --' },
                          ...menuList.map(m => ({ value: m.id, label: `${m.name} (₹${m.price})` }))
                        ]}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={itemQty}
                        onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-2 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-center"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddIncidentalItem}
                        disabled={!selectedMenuId}
                        className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-extrabold text-xs rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Insert
                      </button>
                    </div>
                  </div>

                  {/* Table of Incidentals */}
                  {incidentals.length > 0 ? (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-600">
                          <tr>
                            <th className="py-2 px-3">Description Item</th>
                            <th className="py-2 px-3 text-center">Qty</th>
                            <th className="py-2 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {incidentals.map((item) => (
                            <tr key={item.id}>
                              <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                                {item.name} <span className="text-[10px] text-slate-400">(₹{item.price})</span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateIncidentalQty(item.id, -1)}
                                    className="w-5 h-5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 rounded font-bold text-xs"
                                  >
                                    -
                                  </button>
                                  <span className="font-extrabold text-xs px-1">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateIncidentalQty(item.id, 1)}
                                    className="w-5 h-5 bg-cyan-600 text-white hover:bg-cyan-700 rounded font-bold text-xs"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">
                                ₹{(item.price * item.quantity).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic text-center py-2">
                      No incidentals or food orders logged yet. Select a dish above to add.
                    </p>
                  )}
                </div>
              )}

            </div>

            {/* RIGHT COLUMN: Strategy Adjustments + Final Split Settlement (LG: 5 cols) */}
            <div className="lg:col-span-5 space-y-6">

              {/* Strategy Type Custom Adjustments */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide block border-b border-slate-200 dark:border-slate-700 pb-2">
                  ➕ Add Custom Adjustments
                </span>

                <form onSubmit={handleAddAdjustment} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Strategy Type</label>
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
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Charge Category</label>
                      <StyledSelect
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
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Discount Label</label>
                      <input
                        type="text"
                        value={adjReasonDiscount}
                        onChange={(e) => setAdjReasonDiscount(e.target.value)}
                        placeholder="e.g. Service Apology..."
                        className="w-full px-3 py-2 font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full px-3 py-2 font-extrabold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl transition-all cursor-pointer text-xs"
                  >
                    Apply Adjustment
                  </button>
                </form>

                {/* Applied Adjustments List */}
                {adjustments.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs mt-2">
                    <span className="font-bold text-slate-500 uppercase text-[10px] block">Applied Adjustments</span>
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-center justify-between font-bold">
                        <span className="text-slate-600 dark:text-slate-300">↳ {adj.reason}</span>
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
              <div className="bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl border-2 border-emerald-500/80 p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900 dark:text-emerald-200 uppercase tracking-wide border-b border-emerald-200/60 pb-2">
                  <IndianRupee className="w-4 h-4 text-emerald-600" />
                  <span>Final Checkout Split Settlement</span>
                </div>

                <div className="space-y-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Pending Lodging Due:</span>
                    <span className="font-bold">₹{lodgingPendingDue.toFixed(2)}</span>
                  </div>

                  {kitchenModuleEnabled && (
                    <div className="flex justify-between">
                      <span>Food & Incidentals Subtotal:</span>
                      <span className="font-bold">₹{foodTotal.toFixed(2)}</span>
                    </div>
                  )}

                  {extraCharges > 0 && (
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>(+) Extra Charges:</span>
                      <span>+₹{extraCharges.toFixed(2)}</span>
                    </div>
                  )}

                  {discounts > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>(-) Discount Rebate:</span>
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
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Apply GST</span>
                    </div>
                    {gstEnabled && (
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        Acc: {gstAccommodationRate}% | Food: 5%
                      </span>
                    )}
                  </div>

                  {/* Itemized GST Breakdown */}
                  {gstEnabled && (
                    <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-blue-200 dark:border-blue-800 space-y-1 text-[11px] text-blue-900 dark:text-blue-200">
                      <div className="flex justify-between">
                        <span>Accommodation GST @ {gstAccommodationRate}%:</span>
                        <span className="font-bold">₹{gstAccommodationAmount.toFixed(2)}</span>
                      </div>
                      {kitchenModuleEnabled && foodTotal > 0 && (
                        <div className="flex justify-between">
                          <span>Food GST @ {gstFoodRate}%:</span>
                          <span className="font-bold">₹{gstFoodAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="border-t border-dashed border-blue-200 dark:border-blue-700 pt-1 mt-1 flex justify-between font-extrabold text-[11px]">
                        <span>CGST (50%) / SGST (50%):</span>
                        <span>₹{gstCgst.toFixed(2)} / ₹{gstSgst.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Grand Target Due Header */}
                  <div className="border-t-2 border-emerald-300 dark:border-emerald-700 pt-2 flex justify-between items-center text-sm font-extrabold">
                    <span className="text-slate-900 dark:text-white">Grand Target Due:</span>
                    <span className="text-emerald-700 dark:text-emerald-400 text-lg">₹{grandTargetDue.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center text-[11px] pt-1">
                    <span>Total Stacked Entered:</span>
                    <span className={`font-bold ${isSplitMatching ? 'text-emerald-600' : 'text-red-600'}`}>
                      ₹{totalSplitSum.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Desk Cashier Selector */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Desk Cashier Handling Checkout</label>
                  <input
                    type="text"
                    value={deskCashier}
                    onChange={(e) => setDeskCashier(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>

                {/* Split Distribution Matrix */}
                <div className="space-y-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">Split Distribution Matrix</span>
                    <button
                      type="button"
                      onClick={handleAddSplitRow}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                    >
                      + Add Row
                    </button>
                  </div>

                  <div className="space-y-2">
                    {splitRows.map((row) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => handleUpdateSplitRow(row.id, 'amount', Number(e.target.value))}
                          placeholder="Amount (₹)"
                          className="flex-1 px-3 py-1.5 text-xs font-extrabold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
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
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-extrabold text-xs rounded-2xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveOrCheckout}
            disabled={isProcessing || (mode === 'edit-and-checkout' && !isSplitMatching)}
            className={`flex-2 py-3 text-white font-extrabold text-xs rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 ${
              mode === 'edit-only'
                ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                : !isSplitMatching
                ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-75'
                : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {isProcessing
              ? (mode === 'edit-only' ? 'Saving Changes...' : 'Processing Checkout...')
              : mode === 'edit-only'
              ? 'Save Booking Changes'
              : !isSplitMatching
              ? `Split Total Must Equal ₹${grandTargetDue.toFixed(2)}`
              : 'Checkout & Close Booking'
            }
          </button>
        </div>

      </div>

      {/* Date Range Picker Modal with Blocked Date Indicators */}
      <DateRangePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        checkinDate={checkinDate}
        checkoutDate={checkoutDate}
        onCheckinChange={setCheckinDate}
        onCheckoutChange={setCheckoutDate}
        onClear={() => {
          setCheckinDate('');
          setCheckoutDate('');
        }}
        blockedDates={blockedDates}
      />
    </div>
  );
};
