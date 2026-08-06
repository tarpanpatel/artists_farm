import React, { useState } from 'react';
import { MapPin, Pencil, Loader, CheckCircle2, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n/en';

interface PropertyAddressBarProps {
  address: string;
  googleMapsLink: string;
  onSaveLocation: (address: string, googleMapsLink: string) => Promise<boolean>;
}

/**
 * Small persistent address strip for the dashboard. PropertySetupWizard's
 * Step 1 address form disappears for good once an address is on file - this
 * is what stays behind so the address is still visible (and, for whoever's
 * allowed to touch it, still editable) after initial setup is done. Root
 * Admin can edit anything anywhere, so it's editable for root_admin too, not
 * just the property's own Super Admin.
 */
export const PropertyAddressBar: React.FC<PropertyAddressBarProps> = ({
  address,
  googleMapsLink,
  onSaveLocation,
}) => {
  const { activeRole } = useAuth();
  const canEdit = activeRole === 'Super Admin' || activeRole === 'root_admin';

  const [isEditing, setIsEditing] = useState(false);
  const [editAddress, setEditAddress] = useState(address);
  const [editMapsLink, setEditMapsLink] = useState(googleMapsLink);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setEditAddress(address);
    setEditMapsLink(googleMapsLink);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSaveLocation(editAddress, editMapsLink);
      if (success) setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-indigo-200 dark:border-indigo-900 shadow-2xs p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('address_label', 'Address')}</label>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              placeholder={t('full_property_address_placeholder', 'Full property address')}
              autoFocus
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('google_maps_link_optional_label', 'Google Maps Link (optional)')}</label>
            <input
              type="text"
              value={editMapsLink}
              onChange={(e) => setEditMapsLink(e.target.value)}
              placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !editAddress.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {isSaving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {t('save_address_button', 'Save Address')}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            {t('cancel_button', 'Cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (!address.trim() && !canEdit) return null;

  return (
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
          onClick={startEditing}
          className="shrink-0 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          title={t('edit_address_tooltip', 'Edit address')}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
