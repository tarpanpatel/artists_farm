import React from 'react';
import { Phone } from './icons/FlowbiteIcons';
import { WhatsappIcon } from './icons/WhatsappIcon';
import { Popover } from './Popover';
import { getTelUri } from '../utils/phoneUtils';

export interface BookingContactActionsProps {
  phoneNumber: string;
  compact?: boolean;
  onOpenWhatsApp: (phoneNumber: string) => void;
}

/**
 * Clean booking contact buttons:
 * - Phone icon triggers a canonical Flowbite Popover containing the clickable tel: link.
 * - WhatsApp icon button triggers confirmation modal before directing to WhatsApp chat.
 * - Raw phone numbers are completely hidden from plain card text.
 */
export const BookingContactActions: React.FC<BookingContactActionsProps> = ({
  phoneNumber,
  compact = false,
  onOpenWhatsApp,
}) => {
  const iconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      <Popover
        trigger="click"
        placement="bottom"
        title={<span className="font-semibold text-xs text-slate-900 dark:text-white">Call Guest</span>}
        content={
          <div className="p-2">
            <a
              href={getTelUri(phoneNumber)}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-300 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{phoneNumber}</span>
            </a>
          </div>
        }
      >
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Show phone number for ${phoneNumber}`}
          className="inline-flex items-center justify-center p-1 rounded text-blue-600 hover:text-blue-700 hover:bg-blue-50/60 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-950/40 focus:outline-none transition-colors"
        >
          <Phone className={iconSize} />
        </button>
      </Popover>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenWhatsApp(phoneNumber);
        }}
        aria-label={`Open WhatsApp chat with ${phoneNumber}`}
        className="inline-flex items-center justify-center p-1 rounded text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/60 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/40 focus:outline-none transition-colors"
      >
        <WhatsappIcon className={iconSize} />
      </button>
    </div>
  );
};
