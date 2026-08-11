import React from 'react';
import { t } from '../i18n/en';
import { PropertyEditForm } from './PropertyEditForm';
import { RoomsManagement } from './RoomsManagement';
import { PageHeader } from './PageHeader';

interface EditPropertyPageProps {
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
  };
}

export const EditPropertyPage: React.FC<EditPropertyPageProps> = ({ property }) => {
  if (!property) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        {t('property_not_found_label', 'Property not found')}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <PageHeader
          title={t('edit_property_page_heading', 'Edit Property')}
          subtitle={`${property.name || t('property_details_subtitle', 'Property details & contact information')}${property.slug ? ` · ${property.slug}` : ''}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {property.property_type === 'MULTI_KEY' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
          <RoomsManagement
            propertyId={property.id}
            propertySlug={property.slug || ''}
            propertyType={property.property_type}
            onUpdated={() => window.location.reload()}
          />
        </div>
      )}

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
          <PropertyEditForm
            property={property}
            onSaved={() => window.location.reload()}
          />
        </div>
      </div>
    </div>
  );
};
