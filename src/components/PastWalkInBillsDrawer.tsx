import React, { useState, useEffect, useMemo } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems, TextInput as FlowbiteTextInput, Modal } from 'flowbite-react';
import { X, Search, History, Eye, Pencil, Trash2, RefreshCw, AlertCircle, Loader2 } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';
import { fetchWalkInTabHistoryFromDB, deleteWalkInTabDB } from '../services/api';
import { formatDateOrdinal } from '../utils/dateUtils';
import { Popover } from './Popover';
import { Button } from './Button';
import { MenuItem } from '../types';
import { WalkInTabBillModal } from './WalkInTabBillModal';

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
  items?: { menu_item_id?: number; name: string; price: number; quantity: number; lineTotal: number }[];
}

interface PastWalkInBillsDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewBill?: (bill: any) => void;
  menu?: MenuItem[];
  propertyName?: string;
  propertyGstin?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
}

export const PastWalkInBillsDrawer: React.FC<PastWalkInBillsDrawerProps> = ({
  open,
  onClose,
  menu = [],
  propertyName,
  propertyGstin,
  propertyUpiId,
  propertyUpiQrCodeUrl,
}) => {
  const { showToast } = useToast();

  const [bills, setBills] = useState<PastWalkInBillItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active bill management delegated to unified WalkInTabBillModal
  const [activeBill, setActiveBill] = useState<PastWalkInBillItem | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'audit-modify'>('view');

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

  return (
    <>
      <FlowbiteDrawer
        open={open}
        onClose={onClose}
        position="right"
        className="past-walkin-bills-drawer z-60 w-full sm:max-w-md md:max-w-lg h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
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
                      variant="secondary"
                      onClick={() => {
                        setActiveBill(b);
                        setModalMode('view');
                      }}
                      leftIcon={<Eye className="w-3.5 h-3.5 text-blue-600" />}
                    >
                      View
                    </Button>

                    <Button
                      size="xs"
                      variant="edit"
                      onClick={() => {
                        setActiveBill(b);
                        setModalMode('audit-modify');
                      }}
                      leftIcon={<Pencil className="w-3.5 h-3.5" />}
                    >
                      Edit
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

      {/* Unified WalkInTabBillModal for View & Audit */}
      {activeBill && (
        <WalkInTabBillModal
          bill={activeBill}
          mode={modalMode}
          open={!!activeBill}
          onClose={() => setActiveBill(null)}
          onUpdateBill={(updated) => {
            setBills((prev) =>
              prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
            );
          }}
          menu={menu}
          propertyName={propertyName}
          propertyGstin={propertyGstin}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingBillId && (
        <Modal
          show={!!deletingBillId}
          onClose={() => setDeletingBillId(null)}
          size="sm"
          popup
          className="z-70"
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
                variant="secondary"
                size="sm"
                onClick={() => setDeletingBillId(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                leftIcon={isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              >
                Delete Bill
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
