import React, { useState } from 'react';
import { X, IndianRupee, Home, User, Calendar, AlertCircle } from 'lucide-react';
import { Guest, BillingReceipt } from '../types';

interface ReceiptEditModalProps {
  isOpen: boolean;
  guest: Guest | null;
  onClose: () => void;
  onCheckout: (receipt: BillingReceipt) => void;
  isProcessing?: boolean;
  mode?: 'edit-only' | 'edit-and-checkout';
  kitchenModuleEnabled?: boolean;
}

export const ReceiptEditModal: React.FC<ReceiptEditModalProps> = ({
  isOpen,
  guest,
  onClose,
  onCheckout,
  isProcessing = false,
  mode = 'edit-and-checkout',
  kitchenModuleEnabled = true,
}) => {
  const [roomCharges, setRoomCharges] = useState(0);
  const [foodCharges, setFoodCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [checkinDate, setCheckinDate] = useState('');
  const [checkoutDate, setCheckoutDate] = useState('');
  const [advanceReceivedBy, setAdvanceReceivedBy] = useState('');
  const [paymentReceivedBy, setPaymentReceivedBy] = useState('');

  // Initialize form with guest data when modal opens or guest changes
  React.useEffect(() => {
    if (guest && isOpen) {
      setCheckinDate(guest.checkinDate || '');
      setCheckoutDate(guest.expectedCheckout || '');
      setRoomCharges(guest.roomRate || guest.totalAmount || 0);
      setFoodCharges(kitchenModuleEnabled ? (guest.foodBill || 0) : 0);
      setOtherCharges(0);
      setDiscount(0);
      setAdvanceReceivedBy('');
      setPaymentReceivedBy('');
    }
  }, [guest, isOpen, kitchenModuleEnabled]);

  if (!isOpen || !guest) return null;

  const subtotal = roomCharges + (kitchenModuleEnabled ? foodCharges : 0) + otherCharges;
  const grandTotal = Math.max(0, subtotal - discount);
  const advancePaid = guest.advanceAmount || 0;
  const pendingAmount = Math.max(0, grandTotal - advancePaid);

  const handleCheckout = () => {
    const receipt: BillingReceipt = {
      id: `REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      guestId: guest.id,
      guestName: guest.guestName,
      roomNumber: guest.roomNumber,
      checkinDate: checkinDate || guest.checkinDate,
      checkoutDate: checkoutDate || new Date().toISOString().split('T')[0],
      roomTotal: roomCharges,
      kitchenTotal: kitchenModuleEnabled ? foodCharges : 0,
      miscTotal: otherCharges,
      discount,
      grandTotal,
      advancePaid,
      status: 'Paid',
      paymentMethod: 'Cash',
    };
    onCheckout(receipt);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Billing & Checkout</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Room {guest.roomNumber} • {guest.guestName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Active Resident Account */}
          <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Active Resident Account</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-md p-3">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{guest.guestName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Phone: {guest.phoneNumber}</p>
            </div>
          </div>

          {/* Accommodation Invoice Breakdown */}
          <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <Home className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Accommodation Invoice Breakdown</span>
            </div>

            <div className="space-y-3">
              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Check-In Date</label>
                  <input
                    type="date"
                    value={checkinDate}
                    onChange={(e) => setCheckinDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Check-Out Date</label>
                  <input
                    type="date"
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Room Charges */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Base Lodging Charges (₹)</label>
                <input
                  type="number"
                  value={roomCharges}
                  onChange={(e) => setRoomCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              {/* Advance Paid */}
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-md p-3 space-y-2 text-sm border border-emerald-200 dark:border-emerald-800">
                <div className="flex justify-between">
                  <span className="text-slate-700 dark:text-slate-300">Advance Paid:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">+₹{advancePaid.toFixed(2)}</span>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Received By (Booking)</label>
                  <input
                    type="text"
                    value={advanceReceivedBy}
                    onChange={(e) => setAdvanceReceivedBy(e.target.value)}
                    placeholder="Staff member name"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Pending Amount */}
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-md p-3 space-y-1 text-sm border border-amber-200 dark:border-amber-800">
                <div className="flex justify-between">
                  <span className="text-slate-700 dark:text-slate-300">Pending Lodging Due:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">₹{(roomCharges - advancePaid).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Food & Incidentals - Only if Kitchen Module Enabled */}
          {kitchenModuleEnabled && (
            <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Food Orders & Incidentals Log</span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Food & Beverages (₹)</label>
                <input
                  type="number"
                  value={foodCharges}
                  onChange={(e) => setFoodCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Custom Adjustments / Other Charges */}
          <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Additional Charges</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Other Charges (₹)</label>
                <input
                  type="number"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Discount (₹)</label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Final Checkout Split Settlement */}
          <div className="border-2 border-emerald-300 dark:border-emerald-700 rounded-lg p-4 bg-emerald-50 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 mb-3">
              <IndianRupee className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide">Final Checkout Split Settlement</span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-700 dark:text-slate-300">Pending Lodging Due:</span>
                <span className="font-bold text-slate-900 dark:text-white">₹{(roomCharges - advancePaid).toFixed(2)}</span>
              </div>

              {kitchenModuleEnabled && (
                <div className="flex justify-between">
                  <span className="text-slate-700 dark:text-slate-300">Food & Incidentals Subtotal:</span>
                  <span className="font-bold text-slate-900 dark:text-white">₹{foodCharges.toFixed(2)}</span>
                </div>
              )}

              {otherCharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-700 dark:text-slate-300">Other Charges:</span>
                  <span className="font-bold text-slate-900 dark:text-white">₹{otherCharges.toFixed(2)}</span>
                </div>
              )}

              {discount > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Discount:</span>
                  <span className="font-bold">-₹{discount.toFixed(2)}</span>
                </div>
              )}

              <div className="border-t border-emerald-200 dark:border-emerald-800 pt-2 flex justify-between font-bold text-lg">
                <span className="text-emerald-900 dark:text-emerald-100">Grand Target Due:</span>
                <span className="text-emerald-700 dark:text-emerald-400">₹{grandTotal.toFixed(2)}</span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Payment Received By (Checkout)</label>
                <input
                  type="text"
                  value={paymentReceivedBy}
                  onChange={(e) => setPaymentReceivedBy(e.target.value)}
                  placeholder="Staff member name"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-3">
            {mode === 'edit-only' ? (
              <>
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold text-sm rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleCheckout();
                    onClose();
                  }}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isProcessing ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold text-sm rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2.5 bg-emerald-600 text-white font-bold text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                >
                  <IndianRupee className="w-4 h-4" />
                  {isProcessing ? 'Processing...' : 'Checkout & Close Booking'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
