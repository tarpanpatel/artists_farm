import React from 'react';

// Matches the "📷 Payment QR Code: <url>" line both message templates emit
// (whatsappVoucherTemplate.ts / BookingDetailsModal's own share-preview
// builder) - shared here so a future tweak to that line's format only needs
// to change in one place instead of drifting between two near-identical
// copies (found in review, 2 Sep 2026 - BookingDetailsModal.tsx and
// PropertyEditForm.tsx each had their own, byte-for-byte matching version).
const QR_LINE_PATTERN = /^📷\s*\*?Payment QR Code:\*?\s*(https?:\/\/\S+)/i;

interface MessageQrPreviewProps {
  text: string;
  cardClassName?: string;
  captionClassName?: string;
}

/**
 * Renders a WhatsApp/booking-confirmation message preview line-by-line,
 * swapping the raw "📷 Payment QR Code: <url>" line for an actual QR image
 * card instead of showing the bare URL text. Shared between
 * BookingDetailsModal.tsx's Share Preview and PropertyEditForm.tsx's live
 * WhatsApp preview - both need identical behavior against the same message
 * format, only the surrounding card's colors/caption size differ, which is
 * why those two are the only exposed overrides.
 */
export const MessageQrPreview: React.FC<MessageQrPreviewProps> = ({
  text,
  cardClassName = 'my-2.5 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-start gap-1.5 shadow-2xs',
  captionClassName = 'text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5',
}) => {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, idx) => {
        const qrMatch = line.match(QR_LINE_PATTERN);
        if (qrMatch) {
          const qrUrl = qrMatch[1];
          return (
            <div key={idx} className={cardClassName}>
              <div className={captionClassName}>
                <span>📷 Payment QR Code</span>
              </div>
              <img
                src={qrUrl}
                alt="Payment QR Code"
                className="w-32 h-32 object-contain rounded border border-slate-200 dark:border-slate-700 bg-white p-1"
              />
            </div>
          );
        }
        return (
          <React.Fragment key={idx}>
            {line}
            {idx < lines.length - 1 && '\n'}
          </React.Fragment>
        );
      })}
    </>
  );
};
