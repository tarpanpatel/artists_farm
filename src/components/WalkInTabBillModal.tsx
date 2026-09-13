import React, { useEffect, useState, useMemo } from 'react';
import { Share2, Loader2, CheckCircle2, X, Plus, Minus, Trash2, Pencil, Printer } from './icons/FlowbiteIcons';
import { Drawer as FlowbiteDrawer, DrawerItems, Checkbox } from 'flowbite-react';
import * as htmlToImage from 'html-to-image';
import { WalkInTab, MenuItem } from '../types';
import { billWalkInTabDB, updateWalkInTabDB } from '../services/api';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { Button } from './Button';
import { t } from '../i18n/en';
import { UpiPaymentBlock } from '../utils/upiQrCode';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { getWhatsAppShareUrl } from '../utils/phoneUtils';

export interface WalkInTabBillModalProps {
  tab?: WalkInTab | null;
  bill?: any | null;
  mode?: 'bill' | 'view' | 'audit-modify';
  open?: boolean;
  onClose: () => void;
  onBilled?: () => void;
  onUpdateBill?: (updatedBill: any) => void;
  menu?: MenuItem[];
  propertyName?: string;
  propertyGstin?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  initialBill?: any;
}

export const WalkInTabBillModal: React.FC<WalkInTabBillModalProps> = ({
  tab,
  bill,
  mode = 'bill',
  open = true,
  onClose,
  onBilled,
  onUpdateBill,
  menu = [],
  propertyName,
  propertyGstin,
  propertyUpiId,
  propertyUpiQrCodeUrl,
  initialBill,
}) => {
  const { showToast } = useToast();
  const [currentMode, setCurrentMode] = useState<'bill' | 'view' | 'audit-modify'>(
    mode === 'bill' && (initialBill || tab?.status?.toLowerCase() === 'billed') ? 'view' : mode
  );

  // Sync mode if prop changes
  useEffect(() => {
    if (mode === 'bill' && (initialBill || tab?.status?.toLowerCase() === 'billed')) {
      setCurrentMode('view');
    } else {
      setCurrentMode(mode);
    }
  }, [mode, initialBill, tab?.status]);

  // Billing & editing state
  const [billedResult, setBilledResult] = useState<any | null>(initialBill || bill || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Form states for Live Billing (mode='bill')
  const [billGstEnabled, setBillGstEnabled] = useState(false);
  const [billGstRate, setBillGstRate] = useState(5);
  const [billDiscount, setBillDiscount] = useState(0);
  const [billPaymentMethod, setBillPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Bank Transfer'>('Cash');

  // Form states for Audit/Modify (mode='audit-modify')
  const [editLabel, setEditLabel] = useState<string>('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('Cash');
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editGstEnabled, setEditGstEnabled] = useState<boolean>(false);
  const [editGstRate, setEditGstRate] = useState<number>(5);
  const [editItems, setEditItems] = useState<Array<{ menu_item_id?: number; name: string; price: number; quantity: number }>>([]);
  const [dishSelectValue, setDishSelectValue] = useState<string>('');

  // Fetch default GST rate from system_settings
  useEffect(() => {
    fetch(`/php/api/router.php?action=get_system_settings`, { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        const raw = json?.data?.gst_rates_config;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.foodRate != null) {
              const rate = Number(parsed.foodRate);
              setBillGstRate(rate);
              setEditGstRate(rate);
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Initialize edit form when switching to audit-modify
  useEffect(() => {
    const source = billedResult || bill || tab;
    if (source && currentMode === 'audit-modify') {
      setEditLabel(source.label || '');
      setEditPaymentMethod(source.payment_method || source.paymentMethod || 'Cash');
      setEditDiscount(Number(source.discount) || 0);
      setEditGstEnabled(Boolean(source.gst_enabled ?? source.gstEnabled));
      setEditGstRate(Number(source.gst_rate ?? source.gstRate ?? 5));
      setEditItems(
        (source.items || []).map((it: any) => ({
          menu_item_id: it.menu_item_id ?? it.menuItemId,
          name: it.name,
          price: Number(it.price) || 0,
          quantity: Math.max(1, Number(it.quantity) || 1),
        }))
      );
      setDishSelectValue('');
    }
  }, [currentMode, billedResult, bill, tab]);

  // Normalized active bill data for 'view' and 'bill' modes
  const normalizedBill = useMemo(() => {
    const source = billedResult || bill || tab;
    if (!source) return null;
    const items = (source.items || []).map((it: any) => ({
      menu_item_id: it.menu_item_id ?? it.menuItemId,
      name: it.name || 'Item',
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 1),
      lineTotal: Number(it.lineTotal ?? (Number(it.price || 0) * Number(it.quantity || 1))),
    }));
    const subtotal = Number(source.subtotal ?? items.reduce((sum: number, it: any) => sum + it.lineTotal, 0));
    const discount = Number(source.discount ?? (currentMode === 'bill' ? billDiscount : 0));
    const gstEnabled = Boolean(source.gst_enabled ?? source.gstEnabled ?? (currentMode === 'bill' ? billGstEnabled : false));
    const gstRate = Number(source.gst_rate ?? source.gstRate ?? (currentMode === 'bill' ? billGstRate : 5));
    const gstAmount = Number(source.gst_amount ?? source.gstAmount ?? 0);
    const grandTotal = Number(source.grand_total ?? source.grandTotal ?? (subtotal - discount + gstAmount));
    const paymentMethod = source.payment_method ?? source.paymentMethod ?? (currentMode === 'bill' ? billPaymentMethod : 'Cash');
    const label = source.label ?? '';
    const billedAt = source.billed_at ?? source.billedAt ?? source.opened_at ?? new Date().toISOString();

    return {
      id: source.id,
      label,
      items,
      subtotal,
      discount,
      gstEnabled,
      gstRate,
      gstAmount,
      grandTotal,
      paymentMethod,
      billedAt,
    };
  }, [billedResult, bill, tab, currentMode, billDiscount, billGstEnabled, billGstRate, billPaymentMethod]);

  // Calculations for Live Billing mode
  const tabSubtotal = tab?.subtotal || 0;
  const liveAfterDiscount = Math.max(0, tabSubtotal - billDiscount);
  const liveGstAmount = billGstEnabled ? Math.round(liveAfterDiscount * (billGstRate / 100) * 100) / 100 : 0;
  const liveGrandTotal = Math.round((liveAfterDiscount + liveGstAmount) * 100) / 100;
  const liveCgstSgst = liveGstAmount / 2;

  // Calculations for Edit mode
  const editSubtotal = useMemo(() => {
    return editItems.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
  }, [editItems]);
  const editAfterDiscount = Math.max(0, editSubtotal - editDiscount);
  const editGstAmount = editGstEnabled ? Math.round(editAfterDiscount * (editGstRate / 100) * 100) / 100 : 0;
  const editGrandTotal = Math.round((editAfterDiscount + editGstAmount) * 100) / 100;

  // Confirm & Bill action
  const handleConfirmBill = async () => {
    if (!tab) return;
    setIsSubmitting(true);
    const result = await billWalkInTabDB({
      tabId: tab.id,
      paymentMethod: billPaymentMethod,
      discount: billDiscount,
      gstEnabled: billGstEnabled,
      gstRate: billGstRate,
    });
    setIsSubmitting(false);
    if (result.success && result.bill) {
      setBilledResult(result.bill);
      setCurrentMode('view');
      if (onBilled) onBilled();
      showToast(t('tab_billed_toast', 'Tab billed'), { type: 'success' });
    } else {
      showToast(result.message || t('tab_bill_failed_toast', 'Failed to bill this tab'), { type: 'error' });
    }
  };

  // Dish edit handlers
  const handleItemQuantityChange = (index: number, delta: number) => {
    setEditItems((prev) => {
      const next = [...prev];
      const item = next[index];
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== index);
      }
      next[index] = { ...item, quantity: newQty };
      return next;
    });
  };

  const handleRemoveEditItem = (index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddDishToEdit = (menuItemIdStr: string) => {
    if (!menuItemIdStr) return;
    const menuItemId = Number(menuItemIdStr);
    const dish = (menu || []).find((m) => m.id === menuItemId);
    if (!dish) return;

    setEditItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => (it.menu_item_id && it.menu_item_id === dish.id) || it.name.toLowerCase() === dish.name.toLowerCase()
      );
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], quantity: next[existingIdx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          menu_item_id: dish.id,
          name: dish.name,
          price: Number(dish.price) || 0,
          quantity: 1,
        },
      ];
    });
    setDishSelectValue('');
  };

  const menuOptions = useMemo(() => {
    return (menu || [])
      .filter((m) => m.available !== false)
      .map((m) => ({
        value: String(m.id),
        label: `${m.name} (₹${Number(m.price).toFixed(2)})`,
      }));
  }, [menu]);

  // Save Audit/Modify changes
  const handleSaveEdit = async () => {
    const targetId = billedResult?.id ?? bill?.id ?? tab?.id;
    if (!targetId) return;
    if (editItems.length === 0) {
      showToast('A bill must have at least one dish', { type: 'warning' });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await updateWalkInTabDB({
        tabId: targetId,
        label: editLabel.trim(),
        paymentMethod: editPaymentMethod,
        discount: editDiscount,
        gstEnabled: editGstEnabled,
        gstRate: editGstRate,
        items: editItems,
      });

      if (res.success && res.bill) {
        showToast('Walk-in bill updated successfully', { type: 'success' });
        const updated = {
          ...res.bill,
          id: targetId,
          grand_total: res.bill.grandTotal,
          payment_method: res.bill.paymentMethod,
          discount: res.bill.discount,
          gst_enabled: res.bill.gstEnabled,
          gst_rate: res.bill.gstRate,
          gst_amount: res.bill.gstAmount,
          subtotal: res.bill.subtotal,
          items: res.bill.items,
        };
        setBilledResult(updated);
        if (onUpdateBill) onUpdateBill(updated);
        setCurrentMode('view');
      } else {
        showToast(res.message || 'Failed to update walk-in bill', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || 'Error updating bill', { type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sharing PNG & WhatsApp
  const handleShareImage = async () => {
    const node = document.getElementById('walkInBillPrintable');
    if (!node) return;
    setIsSharing(true);
    try {
      const dataUrl = await htmlToImage.toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const blob = await (await fetch(dataUrl)).blob();
      const billId = normalizedBill?.id || 'receipt';
      const file = new File([blob], `walk-in-bill-${billId}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t('walk_in_bill_title', 'Walk-in Bill') });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `walk-in-bill-${billId}.png`;
        link.click();
      }
    } catch (err) {
      showToast(t('share_bill_failed_toast', 'Could not generate the bill image'), { type: 'error' });
    } finally {
      setIsSharing(false);
    }
  };

  const whatsappText = useMemo(() => {
    if (!normalizedBill) return '';
    const b = normalizedBill;
    return `🧾 *WALK-IN BILL*${b.label ? `\n👤 *${b.label}*` : ''}\n━━━━━━━━━━━━━━━━━━\n${b.items
      .map((it: any) => `${it.quantity}x ${it.name} - ₹${Number(it.lineTotal).toFixed(2)}`)
      .join('\n')}\n━━━━━━━━━━━━━━━━━━\n💵 *Subtotal:* ₹${b.subtotal.toFixed(2)}${
      b.discount > 0 ? `\n➖ *Discount:* ₹${b.discount.toFixed(2)}` : ''
    }${b.gstEnabled ? `\n➕ *GST (${b.gstRate}%):* ₹${b.gstAmount.toFixed(2)}` : ''}\n💰 *Grand Total:* ₹${b.grandTotal.toFixed(
      2
    )}${propertyUpiId ? `\n💳 *Pay via UPI:* ${propertyUpiId}` : ''}\n━━━━━━━━━━━━━━━━━━\nThank you!`;
  }, [normalizedBill, propertyUpiId]);

  if (!open) return null;

  return (
    <FlowbiteDrawer
      open={open}
      onClose={isSubmitting ? () => {} : onClose}
      position="right"
      className="walk-in-tab-bill-modal z-70 w-full sm:max-w-md md:max-w-lg h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            {currentMode === 'audit-modify' ? (
              <Pencil className="w-4 h-4" />
            ) : currentMode === 'view' ? (
              <Printer className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {currentMode === 'audit-modify'
                ? `Edit Walk-in Bill #${normalizedBill?.id || ''}`
                : currentMode === 'view'
                ? t('walk_in_bill_title', 'Walk-in Bill')
                : t('bill_this_tab_heading', 'Bill This Tab')}
            </h2>
            <p className="text-2xs text-gray-500 dark:text-gray-400">
              {currentMode === 'audit-modify'
                ? 'Modify dishes, quantities, discounts, and payment methods'
                : currentMode === 'view'
                ? 'Printable tax receipt, PNG export, and WhatsApp share'
                : 'Review dishes, apply discounts, and complete payment'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors shrink-0 disabled:opacity-50"
          aria-label="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <DrawerItems className="flex-1 overflow-y-auto">
        {/* MODE 1: LIVE BILLING OF ACTIVE TAB */}
        {currentMode === 'bill' && tab && (
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {tab.label || t('walk_in_badge', 'Walk-in')}
              </p>
              <div className="space-y-1 text-sm max-h-48 overflow-y-auto pr-1">
                {tab.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>
                      {it.quantity}x {it.name}
                    </span>
                    <span className="font-medium">₹{it.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('subtotal_label', 'Subtotal')}</span>
                <span>₹{tabSubtotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-slate-600 dark:text-slate-400">{t('discount_label', 'Discount')}</label>
                <Input
                  type="number"
                  min="0"
                  value={billDiscount || ''}
                  onChange={(e) => setBillDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-28 text-right"
                  placeholder="0"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  checked={billGstEnabled}
                  onChange={(e) => setBillGstEnabled(e.target.checked)}
                />
                <span className="text-slate-600 dark:text-slate-400 text-xs">
                  {t('apply_gst_label', 'Apply GST')} ({billGstRate}%)
                </span>
              </div>
              {billGstEnabled && (
                <div className="flex justify-between text-slate-500 dark:text-slate-500 text-2xs pl-6">
                  <span>{t('cgst_sgst_label', 'CGST (50%) / SGST (50%):')}</span>
                  <span>
                    ₹{liveCgstSgst.toFixed(2)} + ₹{liveCgstSgst.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="text-slate-600 dark:text-slate-400">{t('payment_method_label', 'Payment Method')}</label>
                <StyledSelect
                  value={billPaymentMethod}
                  onChange={(v) => setBillPaymentMethod(v as any)}
                  options={[
                    { value: 'Cash', label: 'Cash' },
                    { value: 'UPI', label: 'UPI' },
                    { value: 'Card', label: 'Card' },
                    { value: 'Bank Transfer', label: 'Bank Transfer' },
                  ]}
                  className="w-40"
                />
              </div>

              <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-700">
                <span>{t('grand_total_label', 'Grand Total')}</span>
                <span>₹{liveGrandTotal.toFixed(2)}</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              block
              onClick={handleConfirmBill}
              disabled={isSubmitting}
              leftIcon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            >
              {t('confirm_bill_button', 'Confirm & Bill')} - ₹{liveGrandTotal.toFixed(2)}
            </Button>
          </div>
        )}

        {/* MODE 2: PRINTABLE RECEIPT VIEW */}
        {currentMode === 'view' && normalizedBill && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={handleShareImage}
                disabled={isSharing}
                leftIcon={isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              >
                {t('share_bill_png_button', 'Share Bill (PNG)')}
              </Button>
              <a
                href={getWhatsAppShareUrl('', whatsappText)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(whatsappText).catch(() => {});
                  }
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                {t('share_via_whatsapp_button', 'Share via WhatsApp')}
              </a>
            </div>

            {/* Printable Thermal Receipt Card */}
            <div id="walkInBillPrintable" className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 text-xs text-black">
              <div className="text-center pb-2 border-b border-slate-200">
                <h3 className="font-extrabold text-base uppercase">{propertyName || 'Ground Code Resort'}</h3>
                <p className="font-medium">
                  {normalizedBill.gstEnabled ? t('tax_invoice_label', 'Tax Invoice') : t('walk_in_bill_title', 'Walk-in Bill')}
                </p>
                {normalizedBill.gstEnabled && propertyGstin && <p className="text-2xs">GSTIN: {propertyGstin}</p>}
              </div>

              <div className="flex justify-between border-b border-dashed border-slate-300 pb-2 font-semibold">
                <span>{normalizedBill.label || t('walk_in_badge', 'Walk-in')}</span>
                <span>{formatDateDDMMYYYY(normalizedBill.billedAt)}</span>
              </div>

              <div className="space-y-1">
                {normalizedBill.items.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {it.quantity}x {it.name}
                    </span>
                    <span>₹{Number(it.lineTotal).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 border-t border-dashed border-slate-300 pt-2">
                <div className="flex justify-between">
                  <span>{t('subtotal_label', 'Subtotal')}</span>
                  <span>₹{normalizedBill.subtotal.toFixed(2)}</span>
                </div>
                {normalizedBill.discount > 0 && (
                  <div className="flex justify-between">
                    <span>{t('discount_label', 'Discount')}</span>
                    <span>-₹{normalizedBill.discount.toFixed(2)}</span>
                  </div>
                )}
                {normalizedBill.gstEnabled && normalizedBill.gstAmount > 0 && (
                  <div className="flex justify-between">
                    <span>{t('cgst_split_label', 'CGST (50% split):')} / SGST</span>
                    <span>₹{normalizedBill.gstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200">
                  <span>{t('grand_total_label', 'Grand Total')}</span>
                  <span>₹{normalizedBill.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t('payment_method_label', 'Payment Method')}</span>
                  <span>{normalizedBill.paymentMethod}</span>
                </div>
              </div>

              {propertyUpiId && (
                <UpiPaymentBlock
                  upiId={propertyUpiId}
                  qrCodeImageUrl={propertyUpiQrCodeUrl}
                  payeeName={propertyName || 'Ground Code Resort'}
                  amount={normalizedBill.grandTotal}
                />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="edit"
                size="sm"
                className="flex-1"
                onClick={() => setCurrentMode('audit-modify')}
                leftIcon={<Pencil className="w-3.5 h-3.5" />}
              >
                Edit Bill
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={onClose}
              >
                {t('done_button', 'Done')}
              </Button>
            </div>
          </div>
        )}

        {/* MODE 3: AUDIT & MODIFY PAST BILL */}
        {currentMode === 'audit-modify' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-900 dark:text-white">
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
                <label className="block mb-1 text-xs font-medium text-gray-900 dark:text-white">
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
            </div>

            {/* Dishes Section */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-850 space-y-2.5">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="text-xs font-semibold text-gray-900 dark:text-white">
                  Dishes on Bill ({editItems.length})
                </span>
                <span className="text-2xs font-semibold text-gray-500 dark:text-gray-400">
                  Subtotal: ₹{editSubtotal.toFixed(2)}
                </span>
              </div>

              {editItems.length === 0 ? (
                <div className="py-3 text-center text-2xs text-amber-600 dark:text-amber-400 font-medium">
                  No dishes on this bill. Please add at least one dish below.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {editItems.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2 rounded bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{it.name}</div>
                        <div className="text-2xs text-gray-500 dark:text-gray-400">₹{Number(it.price).toFixed(2)} each</div>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleItemQuantityChange(idx, -1)}
                          className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs text-gray-900 dark:text-white">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleItemQuantityChange(idx, 1)}
                          className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="w-16 text-right font-semibold text-xs text-gray-900 dark:text-white shrink-0">
                        ₹{(it.price * it.quantity).toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveEditItem(idx)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Dish Dropdown */}
              <div className="pt-1.5 border-t border-gray-200 dark:border-gray-700">
                <StyledSelect
                  value={dishSelectValue}
                  onChange={(v) => handleAddDishToEdit(String(v))}
                  options={[{ value: '', label: '+ Add a dish from menu...' }, ...menuOptions]}
                  placeholder="+ Add a dish from menu..."
                />
              </div>
            </div>

            {/* Discount and GST */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-900 dark:text-white">Discount (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={editDiscount || ''}
                  onChange={(e) => setEditDiscount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block mb-1 text-xs font-medium text-gray-900 dark:text-white">GST Rate (%)</label>
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

            <div className="flex items-center gap-2 pt-0.5">
              <Checkbox
                id="edit-bill-gst-toggle"
                checked={editGstEnabled}
                onChange={(e) => setEditGstEnabled(e.target.checked)}
              />
              <label
                htmlFor="edit-bill-gst-toggle"
                className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              >
                Apply GST ({editGstRate}%)
              </label>
            </div>

            {/* Live Calculation Summary */}
            <div className="bg-gray-100 dark:bg-gray-750 rounded-lg p-3 space-y-1 text-2xs">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal:</span>
                <span className="font-semibold text-gray-900 dark:text-white">₹{editSubtotal.toFixed(2)}</span>
              </div>
              {editDiscount > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Discount:</span>
                  <span>-₹{editDiscount.toFixed(2)}</span>
                </div>
              )}
              {editGstEnabled && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>GST ({editGstRate}%):</span>
                  <span>+₹{editGstAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400 pt-1 border-t border-gray-200 dark:border-gray-600">
                <span>Grand Total:</span>
                <span>₹{editGrandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentMode(billedResult || bill ? 'view' : 'bill')}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
                disabled={isSubmitting || editItems.length === 0}
                leftIcon={isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              >
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </DrawerItems>
    </FlowbiteDrawer>
  );
};
