import React, { useState } from 'react';
import { MapPin, Pencil, Loader, CheckCircle2, X, ExternalLink, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n/en';
import { Input } from './Input';
import { Textarea } from './Textarea';

interface PropertyAddressBarProps {
  address: string;
  googleMapsLink: string;
  instructions?: string;
  onSaveLocation: (address: string, googleMapsLink: string, instructions: string) => Promise<boolean>;
}

/**
 * Small persistent address strip for the dashboard. PropertySetupWizard's
 * Step 1 address form disappears for good once an address is on file - this
 * is what stays behind so the address is still visible (and, for whoever's
 * allowed to touch it, still editable) after initial setup is done. Root
 * Admin can edit anything anywhere, so it's editable for root_admin too, not
 * just the property's own Super Admin.
 *
 * Editing opens a modal with the address, the Google Maps link, and a
 * free-text Instructions box (all stored on the properties row).
 */
export const PropertyAddressBar: React.FC<PropertyAddressBarProps> = ({
  address,
  googleMapsLink,
  instructions = '',
  onSaveLocation,
}) => {
  const { activeRole } = useAuth();
  const canEdit = activeRole === 'Super Admin' || activeRole === 'root_admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editAddress, setEditAddress] = useState(address);
  const [editMapsLink, setEditMapsLink] = useState(googleMapsLink);
  const [editInstructions, setEditInstructions] = useState(instructions);
  const [isSaving, setIsSaving] = useState(false);

  const openModal = () => {
    setEditAddress(address);
    setEditMapsLink(googleMapsLink);
    setEditInstructions(instructions);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSaveLocation(editAddress, editMapsLink, editInstructions);
      if (success) setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!address.trim() && !canEdit) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1.5 min-w-0 text-xs text-slate-500 dark:text-slate-400">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {address.trim() ? (
            <span className="truncate">{address}</span>
          ) : (
            <span className="italic">{t('no_address_label', 'No address')}</span>
          )}
          {googleMapsLink && (
            <a
              href={googleMapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
              title={t('open_in_google_maps_tooltip', 'Open in Google Maps')}
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {canEdit && (
          <button
            onClick={openModal}
            className="shrink-0 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title={t('edit_address_tooltip', 'Edit address')}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {instructions.trim() && (
        <p className="mt-1 px-1 text-xs text-slate-400 dark:text-slate-500 whitespace-pre-line">{instructions}</p>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !isSaving && setIsModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {t('property_details_header', 'Property Details')}
              </h2>
              <button
                onClick={() => !isSaving && setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Input
                label={t('address_label', 'Address')}
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                placeholder={t('full_property_address_placeholder', 'Full property address')}
                autoFocus
              />
              <Input
                label={t('google_maps_link_optional_label', 'Google Maps Link (optional)')}
                value={editMapsLink}
                onChange={(e) => setEditMapsLink(e.target.value)}
                placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('instructions_label', 'Instructions')}</label>
                <Textarea
                  rows={4}
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  placeholder={t('instructions_placeholder', 'e.g. How to reach, check-in instructions, parking notes…')}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={handleSave}
                disabled={isSaving || !editAddress.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isSaving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {t('save_address_button', 'Save Address')}
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {t('cancel_button', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
