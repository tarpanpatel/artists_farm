import React, { useState } from 'react';
import { Modal } from 'flowbite-react';
import { Button } from './Button';
import { Copy, Check, ExternalLink, Calendar, Sparkles } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';
import { getPropertySlug } from '../services/api';

interface BookingEngineShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyName?: string;
  propertySlug?: string;
}

export const BookingEngineShareModal: React.FC<BookingEngineShareModalProps> = ({
  isOpen,
  onClose,
  propertyName: _propertyName,
  propertySlug,
}) => {
  const { showToast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const slug = propertySlug || getPropertySlug() || 'patel-colony';
  const directUrl = `${window.location.origin}/${slug}/#book`;
  const embedCode = `<iframe src="${directUrl}" width="100%" height="850" style="border:none;border-radius:12px;" allowfullscreen></iframe>`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directUrl);
    setCopiedLink(true);
    showToast('Direct booking link copied to clipboard!', { type: 'success' });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    showToast('Iframe embed code copied to clipboard!', { type: 'success' });
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  return (
    <Modal show={isOpen} onClose={onClose} size="lg" popup>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                Direct Booking Engine
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-3xs font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <Sparkles className="w-2.5 h-2.5" /> 0% Commission
                </span>
              </h3>
              <p className="text-2xs text-gray-500 dark:text-gray-400">
                Share your live multi-room calendar with guests to accept instant offline bookings.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 text-xs">
          {/* Key Advantages Card */}
          <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/80 space-y-1.5">
            <p className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              💡 Zero Payment Gateway & Zero OTA Commission
            </p>
            <p className="text-2xs text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
              When a guest reserves via this link, their room is immediately locked in the PMS and blocked across Airbnb & Booking.com. Payment is collected in full when they arrive at the property.
            </p>
          </div>

          {/* Direct Link Section */}
          <div className="space-y-2">
            <label className="block text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Direct Public Booking Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={directUrl}
                className="flex-1 h-10 px-3 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleCopyLink}
                className="h-10 text-xs font-semibold px-4"
              >
                {copiedLink ? <Check className="w-4 h-4 me-1.5 text-emerald-300" /> : <Copy className="w-4 h-4 me-1.5" />}
                {copiedLink ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          {/* Embed Code Snippet */}
          <div className="space-y-2">
            <label className="block text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Embed on Your Website (HTML Iframe)
            </label>
            <div className="relative">
              <textarea
                readOnly
                rows={2}
                value={embedCode}
                className="w-full p-2.5 text-2xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono"
              />
              <button
                onClick={handleCopyEmbed}
                className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-3xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition flex items-center gap-1"
              >
                {copiedEmbed ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copiedEmbed ? 'Copied' : 'Copy Embed'}
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Preview Booking Page in New Tab
            </a>
            <Button variant="secondary" size="sm" onClick={onClose} className="h-9 text-xs font-semibold">
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
