import React, { useState, useEffect, useMemo } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems, TextInput as FlowbiteTextInput, Button, Modal } from 'flowbite-react';
import { X, Search, History, Eye, Pencil, Trash2, Share2, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';
import { fetchWalkInTabHistoryFromDB, updateWalkInTabDB, deleteWalkInTabDB } from '../services/api';
import { formatDateOrdinal } from '../utils/dateUtils';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { Popover } from './Popover';
import { getWhatsAppShareUrl } from '../utils/phoneUtils';

export interface PastWalkInBillItem {
  id: number;
  label?: string;
  status: string;
  opened_at?: string;
  billed_at?: string;
  payment_method: string;
  discount: number;
  gst_enabled: boolean;
  gst_rate: number;
  gst_amount: number;
  grand_total: number;
  subtotal?: number;
  items?: { name: string; price: number; quantity: number; lineTotal: number }[];
}

interface PastWalkInBillsDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewBill: (bill: any) => void;
  propertyName?: string;
  propertyGstin?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
}

export const PastWalkInBillsDrawer: React.FC<PastWalkInBillsDrawerProps> = ({
  open,
  onClose,
  onViewBill,
  propertyUpiId,
}) => {
  const { showToast } = useToast();

  const [bills, setBills] = useState<PastWalkInBillItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Editing state
  const [editingBill, setEditingBill] = useState<PastWalkInBillItem | null>(null);
  const [editLabel, setEditLabel] = useState<string>('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('Cash');
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editGstEnabled, setEditGstEnabled] = useState<boolean>(false);
  const [editGstRate, setEditGstRate] = useState<number>(5);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Deleting state
  const [deletingBillId, setDeletingBillId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await fetchWalkInTabHistoryFromDB();
      setBills(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Failed to load past walk-in bills', { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open]);

  const filteredBills = useMemo(() => {
    if (!searchQuery.trim()) return bills;
    const q = searchQuery.toLowerCase().trim();
    return bills.filter((b) => {
      const label = (b.label || '').toLowerCase();
      const id = String(b.id);
      const method = (b.payment_method || '').toLowerCase();
      const total = String(b.grand_total);
      return label.includes(q) || id.includes(q) || method.includes(q) || total.includes(q);
    });
  }, [bills, searchQuery]);

  const handleStartEdit = (b: PastWalkInBillItem) => {
    setEditingBill(b);
    setEditLabel(b.label || '');
    setEditPaymentMethod(b.payment_method || 'Cash');
    setEditDiscount(Number(b.discount) || 0);
    setEditGstEnabled(Boolean(b.gst_enabled));
    setEditGstRate(Number(b.gst_rate) || 5);
  };

  const handleSaveEdit = async () => {
    if (!editingBill) return;
    setIsSavingEdit(true);
    try {
      const res = await updateWalkInTabDB({
        tabId: editingBill.id,
        label: editLabel.trim(),
        paymentMethod: editPaymentMethod,
        discount: editDiscount,
        gstEnabled: editGstEnabled,
        gstRate: editGstRate,
      });

      if (res.success && res.bill) {
        showToast('Walk-in bill updated successfully', { type: 'success' });
        setBills((prev) =>
          prev.map((b) => (b.id === editingBill.id ? { ...b, ...res.bill, grand_total: res.bill.grandTotal, payment_method: res.bill.paymentMethod, discount: res.bill.discount, gst_enabled: res.bill.gstEnabled, gst_rate: res.bill.gstRate, gst_amount: res.bill.gstAmount } : b))
        );
        setEditingBill(null);
      } else {
        showToast(res.message || 'Failed to update walk-in bill', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || 'Error updating bill', { type: 'error' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingBillId) return;
    setIsDeleting(true);
    try {
      const res = await deleteWalkInTabDB(deletingBillId);
      if (res.success) {
        showToast('Walk-in bill deleted', { type: 'success' });
        setBills((prev) => prev.filter((b) => b.id !== deletingBillId));
        setDeletingBillId(null);
      } else {
        showToast(res.message || 'Failed to delete walk-in bill', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || 'Error deleting bill', { type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleShareWhatsApp = (b: PastWalkInBillItem) => {
    const itemsText = (b.items || [])
      .map((it: any) => `${it.quantity}x ${it.name} - ₹${Number(it.lineTotal).toFixed(2)}`)
      .join('\n');
    const whatsappText = `🧾 *WALK-IN BILL #${b.id}*${b.label ? `\n👤 *${b.label}*` : ''}\n━━━━━━━━━━━━━━━━━━\n${itemsText || 'Kitchen Food Order'}\n━━━━━━━━━━━━━━━━━━\n💵 *Subtotal:* ₹${Number(b.subtotal ?? b.grand_total).toFixed(2)}${Number(b.discount) > 0 ? `\n➖ *Discount:* ₹${Number(b.discount).toFixed(2)}` : ''}${b.gst_enabled ? `\n➕ *GST (${b.gst_rate}%):* ₹${Number(b.gst_amount).toFixed(2)}` : ''}\n💰 *Grand Total:* ₹${Number(b.grand_total).toFixed(2)}${propertyUpiId ? `\n💳 *Pay via UPI:* ${propertyUpiId}` : ''}\n━━━━━━━━━━━━━━━━━━\nThank you!`;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(whatsappText).catch(() => {});
    }
    const url = getWhatsAppShareUrl('', whatsappText);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <FlowbiteDrawer
        open={open}
        onClose={onClose}
        position="right"
        className="past-walkin-bills-drawer z-60 w-full sm:max-w-lg h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('past_walkin_bills_title', 'Past Walk-in Bills')}
              </h2>
              <p className="text-2xs text-gray-500 dark:text-gray-400">
                {bills.length} {bills.length === 1 ? 'bill' : 'bills'} settled
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadHistory}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Refresh bills"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer shrink-0"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 shrink-0">
          <FlowbiteTextInput
            id="past-bills-search"
            icon={Search}
            placeholder="Search by table, customer, or amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sizing="sm"
          />
        </div>

        {/* Scrollable Bills List */}
        <DrawerItems className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && bills.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs text-gray-500">Loading past bills...</p>
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                <History className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {searchQuery ? 'No past bills match your search' : 'No settled walk-in bills yet'}
              </p>
              <p className="text-2xs text-gray-500 max-w-xs">
                When you settle a table tab using "Bill This Table", the bill will appear here.
              </p>
            </div>
          ) : (
            filteredBills.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3 shadow-xs hover:border-gray-300 dark:hover:border-gray-600 transition-all"
              >
                {/* Header: Label, Timestamp, Status & Amount */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {b.label || t('walk_in_badge', 'Walk-in')}
                      </h4>
                      <span className="text-2xs font-semibold text-gray-400">#{b.id}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        {b.payment_method || 'Cash'}
                      </span>
                    </div>
                    <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {b.billed_at ? formatDateOrdinal(b.billed_at) : 'Billed'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{Number(b.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    {Number(b.discount) > 0 && (
                      <p className="text-2xs text-amber-600 dark:text-amber-400">
                        -₹{Number(b.discount).toFixed(2)} off
                      </p>
                    )}
                  </div>
                </div>

                {/* Items Summary (compact) */}
                {b.items && b.items.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-900/60 rounded p-2 text-2xs space-y-1">
                    {b.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-gray-700 dark:text-gray-300">
                        <span className="truncate pr-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{it.quantity}x</span> {it.name}
                        </span>
                        <span className="font-medium shrink-0">₹{Number(it.lineTotal).toFixed(2)}</span>
                      </div>
                    ))}
                    {b.gst_enabled && (
                      <div className="flex justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-800">
                        <span>GST ({b.gst_rate}%)</span>
                        <span>₹{Number(b.gst_amount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      color="light"
                      onClick={() =>
                        onViewBill({
                          tabId: b.id,
                          id: b.id,
                          label: b.label,
                          items: b.items || [],
                          subtotal: Number(b.subtotal ?? b.grand_total),
                          discount: Number(b.discount || 0),
                          gstEnabled: Boolean(b.gst_enabled),
                          gstRate: Number(b.gst_rate || 5),
                          gstAmount: Number(b.gst_amount || 0),
                          grandTotal: Number(b.grand_total),
                          paymentMethod: b.payment_method,
                          billed_at: b.billed_at,
                        })
                      }
                      className="text-xs"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> View
                    </Button>

                    <Button
                      size="xs"
                      color="light"
                      onClick={() => handleShareWhatsApp(b)}
                      className="text-xs"
                    >
                      <Share2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Share
                    </Button>

                    <Button
                      size="xs"
                      color="light"
                      onClick={() => handleStartEdit(b)}
                      className="text-xs"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1 text-blue-600" /> Edit
                    </Button>
                  </div>

                  <Popover
                    trigger="hover"
                    content={
                      <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        Delete Bill
                      </div>
                    }
                  >
                    <button
                      type="button"
                      aria-label="Delete Bill"
                      onClick={() => setDeletingBillId(b.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </Popover>
                </div>
              </div>
            ))
          )}
        </DrawerItems>
      </FlowbiteDrawer>

      {/* Edit Bill Modal */}
      {editingBill && (
        <Modal
          show={!!editingBill}
          onClose={() => setEditingBill(null)}
          size="md"
          popup
        >
          <div className="p-5 space-y-4 bg-white dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Edit Walk-in Bill #{editingBill.id}
              </h3>
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-medium text-gray-900 dark:text-white">
                  Table / Customer Label
                </label>
                <Input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="e.g. Table 1 or Guest Name"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-900 dark:text-white">
                  Payment Method
                </label>
                <StyledSelect
                  value={editPaymentMethod}
                  onChange={(v) => setEditPaymentMethod(String(v))}
                  options={[
                    { value: 'Cash', label: 'Cash' },
                    { value: 'UPI', label: 'UPI' },
                    { value: 'Card', label: 'Card' },
                    { value: 'Online', label: 'Online' },
                    { value: 'Bank Transfer', label: 'Bank Transfer' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 font-medium text-gray-900 dark:text-white">
                    Discount (₹)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={editDiscount || ''}
                    onChange={(e) => setEditDiscount(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block mb-1 font-medium text-gray-900 dark:text-white">
                    GST Rate (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={editGstRate || ''}
                    onChange={(e) => setEditGstRate(Math.max(0, Number(e.target.value) || 0))}
                    disabled={!editGstEnabled}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-bill-gst-toggle"
                  checked={editGstEnabled}
                  onChange={(e) => setEditGstEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 cursor-pointer"
                />
                <label htmlFor="edit-bill-gst-toggle" className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  Apply GST ({editGstRate}%)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                color="light"
                size="sm"
                onClick={() => setEditingBill(null)}
                disabled={isSavingEdit}
              >
                Cancel
              </Button>
              <Button
                color="blue"
                size="sm"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBillId && (
        <Modal
          show={!!deletingBillId}
          onClose={() => setDeletingBillId(null)}
          size="sm"
          popup
        >
          <div className="p-5 text-center space-y-3 bg-white dark:bg-gray-800 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Delete Walk-in Bill #{deletingBillId}?
            </h3>
            <p className="text-2xs text-gray-500 dark:text-gray-400 leading-relaxed">
              This will remove this bill record and reverse its entry from your Financial Ledger and Cash Drawer. This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                color="light"
                size="sm"
                onClick={() => setDeletingBillId(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                color="failure"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                Delete Bill
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
