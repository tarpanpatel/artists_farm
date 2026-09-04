import React, { useState } from 'react';
import { Card } from 'flowbite-react';
import { t } from '../i18n/en';
import { PropertyEditForm } from './PropertyEditForm';
import { RoomsManagement } from './RoomsManagement';
import { PageHeader } from './PageHeader';
import { Button } from './Button';
import { Sparkles } from './icons/FlowbiteIcons';
import { OtaPropertyImporterModal } from './OtaPropertyImporterModal';

interface EditPropertyPageProps {
  onNavigateToRoom?: (roomSlug: string, initialTab?: string) => void;
  property: {
    id: number;
    name?: string;
    slug?: string;
    email?: string;
    phone?: string;
    gstin?: string;
    address?: string;
    google_maps_link?: string;
    instructions?: string;
    whatsapp_voucher_template?: string;
    telegram_template_customization_enabled?: number | boolean;
    property_type?: string;
    default_tariff?: number | null;
    checkin_time?: string | null;
    checkout_time?: string | null;
    walk_in_table_count?: number;
  };
}

export const EditPropertyPage: React.FC<EditPropertyPageProps> = ({ property, onNavigateToRoom }) => {
  const [showImporterModal, setShowImporterModal] = useState(false);

  if (!property) {
    return (
      <div className="edit-property-page__not-found text-center py-8 text-slate-500 text-sm">
        {t('property_not_found_label', 'Property not found')}
      </div>
    );
  }

  const isRoom = property.property_type === 'MULTI_KEY_ROOM';

  return (
    <div className="edit-property-page max-w-7xl mx-auto space-y-4">

      <div className="edit-property-page__header mb-4">
        <PageHeader
          title={isRoom ? t('edit_room_page_heading', 'Edit Room') : t('edit_property_page_heading', 'Edit Property')}
          subtitle={
            isRoom
              ? t('edit_room_help_text', 'Configure details, room name, and per-night tariff for this specific room.')
              : t('edit_property_help_text', "Use this page to update your property's details:\n• Phone & UPI payment info\n• Check-in & Check-out times\n• Address & special guest notes\nAll changes update live on guest receipts & messages!")
          }
        >
          {!isRoom && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowImporterModal(true)}
              className="flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Import from Airbnb / Booking.com</span>
            </Button>
          )}
        </PageHeader>
      </div>

      <OtaPropertyImporterModal
        isOpen={showImporterModal}
        onClose={() => setShowImporterModal(false)}
        propertyId={property.id}
        onImportSuccess={() => window.location.reload()}
      />

      <div className="edit-property-page__grid grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {property.property_type === 'MULTI_KEY' && (
        <Card className="edit-property-page__rooms-card">
          <RoomsManagement
            propertyId={property.id}
            propertySlug={property.slug || ''}
            propertyType={property.property_type}
            onUpdated={() => window.location.reload()}
            onNavigateToRoom={onNavigateToRoom}
          />
        </Card>
      )}

        <Card className="edit-property-page__form-card">
          <PropertyEditForm
            property={property}
            onSaved={() => window.location.reload()}
            isRoom={isRoom}
          />
        </Card>
      </div>

      {/* iCal Sync card (ARCHIVED 3 Sep 2026 - superseded by the Channex channel-manager
          integration; see _unwanted/ical/README.md). ICalSyncManager.tsx moved there, not
          deleted - the backend (php/api/ical_sync.php, sync_all_icals.php, and the
          unconverted-OTA-alerts cron that requires it as a function library) is untouched
          and still live for any already-configured feeds. Only this settings UI is gone. */}
    </div>
  );
};
