import React from 'react';
import { Card } from 'flowbite-react';
import { t } from '../i18n/en';
import { PropertyEditForm } from './PropertyEditForm';
import { RoomsManagement } from './RoomsManagement';
import { PageHeader } from './PageHeader';
import { ICalSyncManager } from './ICalSyncManager';

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
        />
      </div>

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

      {/* Calendar Sync (formerly its own standalone "iCal Sync" sidebar page,
          removed - a single property has exactly one calendar to manage, so
          this is just another property-level setting. A MULTI_KEY parent
          isn't itself bookable (each room is), so it has no calendar of its
          own here - see the room's own Edit Room page in
          MultiKeyPropertyOverview.tsx for that case instead. Only two real
          property types exist (SINGLE/MULTI_KEY, see TenantDashboard.tsx's
          creation UI) - any other value is stale legacy data self-healed to
          SINGLE in php/config/database.php, not a type this should branch
          on. */}
      {property.property_type === 'SINGLE' && (
        <div className="edit-property-page__ical-card bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
          <ICalSyncManager propertyId={property.id} propertySlug={property.slug} embedded />
        </div>
      )}
    </div>
  );
};
