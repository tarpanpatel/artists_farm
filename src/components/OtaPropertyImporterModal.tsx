import React, { useState } from 'react';
import { Modal } from 'flowbite-react';
import {
  X, CheckCircle2, AlertCircle, Loader2, ArrowRight,
  Image as ImageIcon, MapPin, Clock, BedDouble, Sparkles, Check,
  RefreshCw,
} from './icons/FlowbiteIcons';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { BookingComIcon } from './icons/BookingComIcon';
import { Button } from './Button';
import { Input } from './Input';
import { useToast } from './ToastContext';
import { apiFetch } from '../services/api';

export interface ImportedPropertyData {
  source: 'airbnb' | 'booking_com';
  source_id?: string;
  source_url?: string;
  name: string;
  description?: string;
  property_type: 'SINGLE' | 'MULTI_KEY';
  room_count: number;
  default_tariff: number;
  currency?: string;
  checkin_time?: string;
  checkout_time?: string;
  has_kitchen?: number;
  address?: string;
  city?: string;
  photos?: string[];
  amenities?: string[];
  rooms?: Array<{ name: string; tariff: number; capacity: number }>;
}

interface OtaPropertyImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
  onImportSuccess?: (data: ImportedPropertyData) => void;
}

export const OtaPropertyImporterModal: React.FC<OtaPropertyImporterModalProps> = ({
  isOpen,
  onClose,
  propertyId,
  onImportSuccess,
}) => {
  const { showToast } = useToast();
  const [source, setSource] = useState<'airbnb' | 'booking_com'>('airbnb');
  const [identifier, setIdentifier] = useState('');
  const [fetching, setFetching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportedPropertyData | null>(null);

  // Checkboxes for selective update on edit_property
  const [applyFields, setApplyFields] = useState<{
    name: boolean;
    description: boolean;
    address: boolean;
    checkin_checkout: boolean;
    default_tariff: boolean;
    photos: boolean;
    amenities: boolean;
  }>({
    name: true,
    description: true,
    address: true,
    checkin_checkout: true,
    default_tariff: true,
    photos: true,
    amenities: true,
  });

  const handleFetch = async () => {
    if (!identifier.trim()) {
      setError(`Please enter an ${source === 'airbnb' ? 'Airbnb listing URL or listing ID' : 'Booking.com hotel link or hotel ID'}`);
      return;
    }

    setError(null);
    setFetching(true);
    setPreview(null);

    try {
      const res = await apiFetch<any>('fetch_ota_listing_preview', {
        method: 'POST',
        body: JSON.stringify({
          channel: source,
          identifier: identifier.trim(),
        }),
      });

      if (res && res.success && res.data) {
        setPreview(res.data);
        showToast(`Successfully extracted listing metadata from ${source === 'airbnb' ? 'Airbnb' : 'Booking.com'}!`, { type: 'success' });
      } else {
        const msg = res?.message || 'Unable to fetch listing details. Please check the URL or ID and try again.';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err: any) {
      console.error('Fetch preview failed:', err);
      const msg = err?.message || 'Failed to connect to listing importer';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setFetching(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;

    if (propertyId) {
      // Direct server-side application to an existing property
      setApplying(true);
      setError(null);

      const selectedFieldKeys: string[] = [];
      if (applyFields.name) selectedFieldKeys.push('name');
      if (applyFields.description) selectedFieldKeys.push('instructions');
      if (applyFields.address) selectedFieldKeys.push('address');
      if (applyFields.default_tariff) selectedFieldKeys.push('default_tariff');
      if (applyFields.checkin_checkout) {
        selectedFieldKeys.push('checkin_time');
        selectedFieldKeys.push('checkout_time');
      }

      try {
        const res = await apiFetch<any>('apply_ota_listing_to_property', {
          method: 'POST',
          body: JSON.stringify({
            property_id: propertyId,
            imported_data: preview,
            selected_fields: selectedFieldKeys,
          }),
        });

        if (res && res.success) {
          showToast('Property updated with imported OTA listing details!', { type: 'success' });
          if (onImportSuccess) {
            onImportSuccess(preview);
          }
          onClose();
        } else {
          const msg = res?.message || 'Failed to apply imported details';
          setError(msg);
          showToast(msg, { type: 'error' });
        }
      } catch (err: any) {
        console.error('Apply OTA details failed:', err);
        const msg = err?.message || 'Failed to save imported details';
        setError(msg);
        showToast(msg, { type: 'error' });
      } finally {
        setApplying(false);
      }
    } else {
      // Client-side callback (e.g. For onboarding wizard)
      if (onImportSuccess) {
        onImportSuccess(preview);
      }
      onClose();
    }
  };

  const toggleField = (key: keyof typeof applyFields) => {
    setApplyFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isOpen) return null;

  return (
    <Modal show={isOpen} onClose={onClose} size="2xl" dismissible>
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Import Property Details from OTA
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Auto-fill photos, descriptions, rooms, rates, and policies from Airbnb or Booking.com
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Source Selection Buttons */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
              Select OTA Platform
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSource('airbnb');
                  setPreview(null);
                  setError(null);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-lg border-2 text-left transition-all ${
                  source === 'airbnb'
                    ? 'border-[#FF5A5F] bg-red-50/50 dark:bg-red-950/20 text-gray-900 dark:text-white shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700 shrink-0">
                  <AirbnbIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    <span>Airbnb</span>
                    {source === 'airbnb' && <CheckCircle2 className="w-4 h-4 text-[#FF5A5F]" />}
                  </div>
                  <div className="text-2xs text-gray-500 dark:text-gray-400">Import via Listing URL or Listing ID</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSource('booking_com');
                  setPreview(null);
                  setError(null);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-lg border-2 text-left transition-all ${
                  source === 'booking_com'
                    ? 'border-[#003580] bg-blue-50/50 dark:bg-blue-950/20 text-gray-900 dark:text-white shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700 shrink-0">
                  <BookingComIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    <span>Booking.com</span>
                    {source === 'booking_com' && <CheckCircle2 className="w-4 h-4 text-[#003580]" />}
                  </div>
                  <div className="text-2xs text-gray-500 dark:text-gray-400">Import via Hotel ID or Link</div>
                </div>
              </button>
            </div>
          </div>

          {/* Identifier Input */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  label={source === 'airbnb' ? 'Airbnb Listing URL or ID' : 'Booking.com Property Link or Hotel ID'}
                  placeholder={
                    source === 'airbnb'
                      ? 'e.g. https://www.airbnb.com/rooms/12345678 or 12345678'
                      : 'e.g. https://www.booking.com/hotel/in/my-hotel.html or hotel ID'
                  }
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFetch();
                    }
                  }}
                  helperText="Paste the full link from your browser or your numeric property ID"
                />
              </div>
              <div className="pt-6">
                <Button
                  variant="primary"
                  onClick={handleFetch}
                  disabled={fetching || !identifier.trim()}
                  className="h-10 shrink-0"
                >
                  {fetching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Fetching...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1.5" /> Fetch Listing
                    </>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Preview Section */}
          {preview && (
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Listing Preview Extracted</span>
                </div>
                <span className="px-2.5 py-0.5 text-2xs font-semibold uppercase rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {preview.source === 'airbnb' ? 'Airbnb Listing' : 'Booking.com Property'}
                </span>
              </div>

              {/* Photos Gallery Strip */}
              {preview.photos && preview.photos.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-2xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{preview.photos.length} High-Res Photos Fetched</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    {preview.photos.slice(0, 6).map((imgUrl, idx) => (
                      <div key={idx} className="relative w-28 h-20 rounded-lg overflow-hidden shrink-0 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                        <img src={imgUrl} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        {idx === 0 && (
                          <span className="absolute bottom-1 left-1 bg-black/70 text-white text-3xs px-1.5 py-0.5 rounded font-medium">
                            Cover
                          </span>
                        )}
                      </div>
                    ))}
                    {preview.photos.length > 6 && (
                      <div className="w-20 h-20 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
                        +{preview.photos.length - 6} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Property Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                  <span className="text-2xs text-gray-500 dark:text-gray-400 block font-medium">Property Name</span>
                  <div className="font-bold text-gray-900 dark:text-white line-clamp-1">{preview.name}</div>
                </div>

                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                  <span className="text-2xs text-gray-500 dark:text-gray-400 block font-medium">Structure & Rooms</span>
                  <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <BedDouble className="w-4 h-4 text-indigo-600" />
                    <span>
                      {preview.property_type === 'MULTI_KEY'
                        ? `Multi-Room Hotel (${preview.room_count} Rooms)`
                        : 'Single Villa / Whole Property'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                  <span className="text-2xs text-gray-500 dark:text-gray-400 block font-medium">Starting Tariff</span>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    ₹{Number(preview.default_tariff || 3500).toLocaleString('en-IN')} / night
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                  <span className="text-2xs text-gray-500 dark:text-gray-400 block font-medium">Check-In / Out Times</span>
                  <div className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    <span>In: {preview.checkin_time || '14:00'} • Out: {preview.checkout_time || '11:00'}</span>
                  </div>
                </div>
              </div>

              {/* Address */}
              {preview.address && (
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start gap-2 text-xs">
                  <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-gray-700 dark:text-gray-300">{preview.address}</div>
                </div>
              )}

              {/* Amenities tags */}
              {preview.amenities && preview.amenities.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-2xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Detected Amenities ({preview.amenities.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.amenities.map((am, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md text-2xs font-medium"
                      >
                        {am}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Field Selectors for existing property edit */}
              {propertyId && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-2xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">
                    Select Fields to Apply to Property #{propertyId}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyFields.name}
                        onChange={() => toggleField('name')}
                        className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
                      />
                      <span className="text-gray-800 dark:text-gray-200">Property Name</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyFields.photos}
                        onChange={() => toggleField('photos')}
                        className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
                      />
                      <span className="text-gray-800 dark:text-gray-200">Photo Gallery</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyFields.address}
                        onChange={() => toggleField('address')}
                        className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
                      />
                      <span className="text-gray-800 dark:text-gray-200">Address</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyFields.amenities}
                        onChange={() => toggleField('amenities')}
                        className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
                      />
                      <span className="text-gray-800 dark:text-gray-200">Amenities</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyFields.checkin_checkout}
                        onChange={() => toggleField('checkin_checkout')}
                        className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
                      />
                      <span className="text-gray-800 dark:text-gray-200">Checkin / Out</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyFields.default_tariff}
                        onChange={() => toggleField('default_tariff')}
                        className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
                      />
                      <span className="text-gray-800 dark:text-gray-200">Default Tariff</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancel
          </Button>

          {preview && (
            <Button
              variant="primary"
              onClick={handleApply}
              disabled={applying}
              className="gap-1.5"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Applying to Property...
                </>
              ) : (
                <>
                  <span>Apply Imported Details</span>
                  <Check className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
