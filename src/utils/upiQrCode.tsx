import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Builds a standard UPI deep-link (`upi://pay?...`) that any UPI app resolves
 * into its own "confirm payment" screen when scanned - the same format a
 * printed/PhonePe/GPay merchant QR encodes. Amount is optional: omit it (or
 * pass 0/undefined) to let the guest key in the amount themselves, which is
 * the right call whenever the exact due amount isn't settled yet.
 */
export function buildUpiPaymentLink(params: { upiId: string; payeeName: string; amount?: number; note?: string }): string {
  const search = new URLSearchParams();
  search.set('pa', params.upiId.trim());
  search.set('pn', (params.payeeName || 'Payment').trim());
  search.set('cu', 'INR');
  if (params.amount && params.amount > 0) {
    search.set('am', params.amount.toFixed(2));
  }
  if (params.note) {
    search.set('tn', params.note);
  }
  return `upi://pay?${search.toString()}`;
}

interface UpiPaymentBlockProps {
  upiId: string;
  payeeName: string;
  amount?: number;
  note?: string;
  amountLabel?: string;
  size?: number;
  // Property's own uploaded QR code image (bank/PhonePe/GPay-issued), set via
  // "Upload QR Code" next to UPI ID in PropertyEditForm.tsx. When present,
  // this is shown instead of the auto-generated upi://pay deep-link QR below
  // - some properties' bank accounts don't resolve correctly through a
  // generated deep link (e.g. certain current-account UPI handles), so the
  // property's own real QR code is the more reliable/trusted option once
  // they've uploaded one. Falls back to the generated QR when absent.
  qrCodeImageUrl?: string;
}

/**
 * Scannable UPI-pay QR + the UPI ID as text, side by side - dropped straight
 * into a printable/shareable voucher or bill card (GuestManagement.tsx,
 * BookingDetailsModal.tsx, ReceiptEditModal.tsx), so it's baked into the PNG
 * those "Share via WhatsApp"/"Share (PNG)" buttons already send. Deliberately
 * plain black-on-white, no dark: classes - matches every other line in those
 * printable cards, which always render white regardless of app theme.
 * Renders nothing when no UPI ID is configured for the property (optional
 * feature, same pattern as maps_link/contact_phone being dropped from the
 * voucher template when empty).
 */
export const UpiPaymentBlock: React.FC<UpiPaymentBlockProps> = ({ upiId, payeeName, amount, note, amountLabel, size = 92, qrCodeImageUrl }) => {
  if (!upiId?.trim()) return null;
  const link = buildUpiPaymentLink({ upiId, payeeName, amount, note });
  return (
    <div className="upi-payment-block flex items-center gap-3 border border-dashed border-slate-300 rounded-lg p-2.5">
      {qrCodeImageUrl ? (
        <img
          src={qrCodeImageUrl}
          alt="UPI QR Code"
          width={size}
          height={size}
          className="shrink-0 object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <QRCodeSVG value={link} size={size} level="M" className="shrink-0" />
      )}
      <div className="text-[10.5px] text-black leading-snug">
        <p className="font-bold">Scan to Pay via UPI</p>
        <p className="font-mono">{upiId}</p>
        {amount && amount > 0 ? (
          <p className="font-semibold">{amountLabel || 'Amount'}: ₹{amount.toFixed(2)}</p>
        ) : null}
      </div>
    </div>
  );
};
