import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { t } from '../i18n/en';
import { PropertyEditForm } from './PropertyEditForm';
import { RoomsManagement } from './RoomsManagement';
import { PageHeader } from './PageHeader';

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
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => { window.location.hash = '#dashboard'; }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer shadow-2xs group hover:border-slate-300"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:-translate-x-1 transition-transform" />
          <span>Go Back</span>
        </button>
      </div>

      <div className="edit-property-page__header mb-4">
        <PageHeader
          title={isRoom ? t('edit_room_page_heading', 'Edit Room') : t('edit_property_page_heading', 'Edit Property')}
          subtitle={`${property.name || t('property_details_subtitle', 'Property details & contact information')}${property.slug ? ` · ${property.slug}` : ''}`}
        />
      </div>

      <div className="edit-property-page__grid grid grid-cols-1 lg:grid-cols-2 gap-6">
      {property.property_type === 'MULTI_KEY' && (
        <div className="edit-property-page__rooms-card bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
          <RoomsManagement
            propertyId={property.id}
            propertySlug={property.slug || ''}
            propertyType={property.property_type}
            onUpdated={() => window.location.reload()}
            onNavigateToRoom={onNavigateToRoom}
          />
        </div>
      )}

        <div className="edit-property-page__form-card bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
          <PropertyEditForm
            property={property}
            onSaved={() => window.location.reload()}
            isRoom={isRoom}
          />
        </div>
      </div>
    </div>
  );
};
