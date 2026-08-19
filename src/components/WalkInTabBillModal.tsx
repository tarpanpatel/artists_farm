import React, { useEffect, useState } from 'react';
import { Share2, Loader2, CheckCircle2 } from 'lucide-react';
import { Modal, ModalHeader, ModalBody } from 'flowbite-react';
import * as htmlToImage from 'html-to-image';
import { WalkInTab } from '../types';
import { billWalkInTabDB } from '../services/api';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { t } from '../i18n/en';
import { UpiPaymentBlock } from '../utils/upiQrCode';

interface WalkInTabBillModalProps {
  tab: WalkInTab;
  onClose: () => void;
  onBilled: () => void;
  propertyName?: string;
  propertyGstin?: string;
  propertyUpiId?: string;
}

// Same shape as ReceiptEditModal's bill, minus everything that's actually
// about a room (no accommodation split, no advance, no stay dates) - a
// walk-in tab is food only, so there's one flat GST line instead of the
// accommodation/food rate split a guest's receipt needs.
export const WalkInTabBillModal: React.FC<WalkInTabBillModalProps> = ({
  tab,
  onClose,
  onBilled,
  propertyName,
  propertyGstin,
  propertyUpiId,
}) => {
  const { showToast } = useToast();
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState(5);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Bank Transfer'>('Cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billedResult, setBilledResult] = useState<any | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Same config the guest receipt reads (system_settings key "gst_rates_config")
  // - a walk-in bill's food rate should never drift from what a guest's food
  // line already charges.
  useEffect(() => {
    fetch(`/php/api/router.php?action=get_system_settings`, { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        const raw = json?.data?.gst_rates_config;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.foodRate != null) setGstRate(Number(parsed.foodRate));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const subtotal = tab.subtotal;
  const afterDiscount = Math.max(0, subtotal - discount);
  const gstAmount = gstEnabled ? Math.round(afterDiscount * (gstRate / 100) * 100) / 100 : 0;
  const grandTotal = Math.round((afterDiscount + gstAmount) * 100) / 100;
  const cgstSgst = gstAmount / 2;

  const bill = billedResult || {
    label: tab.label,
    items: tab.items,
    subtotal,
    discount,
    gstEnabled,
    gstRate,
    gstAmount,
    grandTotal,
    paymentMethod,
  };
  const isBilled = !!billedResult;

  const handleConfirmBill = async () => {
    setIsSubmitting(true);
    const result = await billWalkInTabDB({ tabId: tab.id, paymentMethod, discount, gstEnabled, gstRate });
    setIsSubmitting(false);
    if (result.success && result.bill) {
      setBilledResult(result.bill);
      onBilled();
      showToast(t('tab_billed_toast', 'Tab billed'), { type: 'success' });
    } else {
      showToast(result.message || t('tab_bill_failed_toast', 'Failed to bill this tab'), { type: 'error' });
    }
  };

  const handleShareImage = async () => {
    const node = document.getElementById('walkInBillPrintable');
    if (!node) return;
    setIsSharing(true);
    try {
      const dataUrl = await htmlToImage.toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `walk-in-bill-${tab.id}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t('walk_in_bill_title', 'Walk-in Bill') });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `walk-in-bill-${tab.id}.png`;
        link.click();
      }
    } catch (err) {
      showToast(t('share_bill_failed_toast', 'Could not generate the bill image'), { type: 'error' });
    } finally {
      setIsSharing(false);
    }
  };

  const whatsappText = `🧾 *WALK-IN BILL*${bill.label ? `\n👤 *${bill.label}*` : ''}\n━━━━━━━━━━━━━━━━\n${bill.items
    .map((it: any) => `${it.quantity}x ${it.name} - ₹${it.lineTotal.toFixed(2)}`)
    .join('\n')}\n━━━━━━━━━━━━━━━━\n💵 *Subtotal:* ₹${bill.subtotal.toFixed(2)}${bill.discount > 0 ? `\n➖ *Discount:* ₹${bill.discount.toFixed(2)}` : ''}${bill.gstEnabled ? `\n➕ *GST (${bill.gstRate}%):* ₹${bill.gstAmount.toFixed(2)}` : ''}\n💰 *Grand Total:* ₹${bill.grandTotal.toFixed(2)}${propertyUpiId ? `\n💳 *Pay via UPI:* ${propertyUpiId}` : ''}\n━━━━━━━━━━━━━━━━\nThank you!`;

  return (
    <Modal show onClose={onClose} dismissible={!isSubmitting} size="md" className="z-58 walk-in-tab-bill-modal">
      <ModalHeader>
        {isBilled ? t('walk_in_bill_title', 'Walk-in Bill') : t('bill_this_tab_heading', 'Bill This Tab')}
      </ModalHeader>
      <ModalBody className="p-0">
        {!isBilled ? (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {tab.label || t('walk_in_badge', 'Walk-in')}
              </p>
              <div className="space-y-1 text-sm max-h-48 overflow-y-auto pr-1">
                {tab.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>{it.quantity}x {it.name}</span>
                    <span className="font-medium">₹{it.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('subtotal_label', 'Subtotal')}</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-slate-600 dark:text-slate-400">{t('discount_label', 'Discount')}</label>
                <Input
                  type="number"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-28 text-right"
                  placeholder="0"
                />
              </div>

              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-slate-600 dark:text-slate-400">{t('apply_gst_label', 'Apply GST')} ({gstRate}%)</span>
                <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} className="w-4 h-4 cursor-pointer" />
              </label>
              {gstEnabled && (
                <div className="flex justify-between text-slate-500 dark:text-slate-500 text-xs pl-2">
                  <span>{t('cgst_sgst_label', 'CGST (50%) / SGST (50%):')}</span>
                  <span>₹{cgstSgst.toFixed(2)} + ₹{cgstSgst.toFixed(2)}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <label className="text-slate-600 dark:text-slate-400">{t('payment_method_label', 'Payment Method')}</label>
                <StyledSelect
                  value={paymentMethod}
                  onChange={(v) => setPaymentMethod(v as any)}
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
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmBill}
              disabled={isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t('confirm_bill_button', 'Confirm & Bill')} - ₹{grandTotal.toFixed(2)}
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShareImage}
                disabled={isSharing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                {t('share_bill_png_button', 'Share Bill (PNG)')}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                {t('share_via_whatsapp_button', 'Share via WhatsApp')}
              </a>
            </div>

            <div id="walkInBillPrintable" className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-xs text-black">
              <div className="text-center pb-2 border-b border-slate-200">
                <h3 className="font-extrabold text-base uppercase">{propertyName || 'Ground Code Resort'}</h3>
                <p className="font-medium">{bill.gstEnabled ? t('tax_invoice_label', 'Tax Invoice') : t('walk_in_bill_title', 'Walk-in Bill')}</p>
                {bill.gstEnabled && propertyGstin && <p className="text-[10px]">GSTIN: {propertyGstin}</p>}
              </div>

              <div className="flex justify-between border-b border-dashed border-slate-300 pb-2 font-semibold">
                <span>{bill.label || t('walk_in_badge', 'Walk-in')}</span>
                <span>{new Date().toLocaleDateString('en-GB')}</span>
              </div>

              <div className="space-y-1">
                {bill.items.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.quantity}x {it.name}</span>
                    <span>₹{it.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 border-t border-dashed border-slate-300 pt-2">
                <div className="flex justify-between">
                  <span>{t('subtotal_label', 'Subtotal')}</span>
                  <span>₹{bill.subtotal.toFixed(2)}</span>
                </div>
                {bill.discount > 0 && (
                  <div className="flex justify-between">
                    <span>{t('discount_label', 'Discount')}</span>
                    <span>-₹{bill.discount.toFixed(2)}</span>
                  </div>
                )}
                {bill.gstEnabled && bill.gstAmount > 0 && (
                  <div className="flex justify-between">
                    <span>{t('cgst_split_label', 'CGST (50% split):')} / SGST</span>
                    <span>₹{bill.gstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200">
                  <span>{t('grand_total_label', 'Grand Total')}</span>
                  <span>₹{bill.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t('payment_method_label', 'Payment Method')}</span>
                  <span>{bill.paymentMethod}</span>
                </div>
              </div>

              {propertyUpiId && (
                <UpiPaymentBlock upiId={propertyUpiId} payeeName={propertyName || 'Ground Code Resort'} amount={bill.grandTotal} />
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-sm py-2.5 rounded-xl cursor-pointer"
            >
              {t('done_button', 'Done')}
            </button>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
};
