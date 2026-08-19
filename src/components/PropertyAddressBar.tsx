import React, { useState } from 'react';
import { MapPin, Pencil, Loader2, CheckCircle2, ExternalLink, Building2 } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'flowbite-react';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n/en';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { Button } from './Button';

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
      <div className="flex items-center justify-between gap-3 px-1 property-address-bar">
        <div className="flex items-center gap-1.5 min-w-0 text-xs text-slate-500 dark:text-slate-400 property-address-bar__display">
          <MapPin className="w-3.5 h-3.5 shrink-0 property-address-bar__icon" />
          {address.trim() ? (
            <span className="truncate property-address-bar__address">{address}</span>
          ) : (
            <span className="italic property-address-bar__empty">{t('no_address_label', 'No address')}</span>
          )}
          {googleMapsLink && (
            <a
              href={googleMapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 property-address-bar__maps-link"
              title={t('open_in_google_maps_tooltip', 'Open in Google Maps')}
            >
              <ExternalLink className="w-3 h-3 property-address-bar__maps-icon" />
            </a>
          )}
        </div>
        {canEdit && (
          <button
            onClick={openModal}
            className="shrink-0 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer property-address-bar__edit-btn"
            title={t('edit_address_tooltip', 'Edit address')}
          >
            <Pencil className="w-3.5 h-3.5 property-address-bar__edit-icon" />
          </button>
        )}
      </div>
      {instructions.trim() && (
        <p className="mt-1 px-1 text-xs text-slate-400 dark:text-slate-500 whitespace-pre-line property-address-bar__instructions">{instructions}</p>
      )}

      <Modal
        show={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        dismissible={!isSaving}
        className="z-58 property-address-bar__modal"
      >
        <ModalHeader as="div">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 property-address-bar__modal-title">
            <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {t('property_details_header', 'Property Details')}
          </h2>
        </ModalHeader>
        <ModalBody className="space-y-4 property-address-bar__modal-body">
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
          <div className="property-address-bar__instructions-field">
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('instructions_label', 'Instructions')}</label>
            <Textarea
              rows={4}
              value={editInstructions}
              onChange={(e) => setEditInstructions(e.target.value)}
              placeholder={t('instructions_placeholder', 'e.g. How to reach, check-in instructions, parking notes…')}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>
        </ModalBody>
        <ModalFooter className="property-address-bar__modal-footer">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !editAddress.trim()}
            leftIcon={isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            className="property-address-bar__save-btn"
          >
            {t('save_address_button', 'Save Address')}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};
