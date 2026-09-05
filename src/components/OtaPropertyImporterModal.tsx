import React, { useState } from 'react';
import { Modal } from 'flowbite-react';
import {
  X, CheckCircle2, AlertCircle, Loader2,
  Image as ImageIcon, MapPin, Clock, BedDouble, Sparkles, Check,
  RefreshCw,
} from './icons/FlowbiteIcons';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { BookingComIcon } from './icons/BookingComIcon';
import { Button } from './Button';
import { Input } from './Input';
import { useToast } from './ToastContext';
import { apiFetch, API_ROOT_BASE } from '../services/api';

/** One row of an Airbnb host profile's listing list, as built by
 *  PropertyImporter::fetchPreview - {id, url, name}, nothing more. */
interface HostListing {
  id: string;
  url: string;
  name: string;
}

/** Shape returned by router.php's `fetch_ota_listing_preview` /
 *  `apply_ota_listing_to_property` (see PropertyImporter::fetchPreview and
 *  ::applyToProperty). A host-profile URL comes back as a listing LIST
 *  (is_host_profile + listings); a single listing URL comes back as `data`. */
interface ImporterResponse {
  success?: boolean;
  message?: string;
  is_host_profile?: boolean;
  listings?: HostListing[];
  data?: ImportedPropertyData;
  /** Set by the extractors when the page yielded no real content (Airbnb
   *  serving a login wall or a soft 404) and `data` is therefore placeholder
   *  defaults, not scraped values. Worth saying so - the fields still need
   *  filling in by hand. */
  partial?: boolean;
}

/** apiFetch returns a raw Response, not parsed JSON - every call here has to
 *  .json() it itself. The router answers its own 400/500 cases with a JSON
 *  {success:false,message} body, so those parse fine and surface the real
 *  message; only a genuinely non-JSON response (a 404 served as HTML) throws,
 *  which each caller's catch block already handles. */
async function importerCall(action: string, body: Record<string, unknown>): Promise<ImporterResponse> {
  const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ImporterResponse;
}

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
  const [hostListings, setHostListings] = useState<HostListing[] | null>(null);

  // Checkboxes for selective update on edit_property
  // Re-fetch mode. Off = first import (keep photos/amenities already here and add
  // the listing's on top). On = the OTA listing is the source of truth, so its
  // photos/amenities REPLACE what's stored - the only way a picture deleted on
  // Airbnb can ever disappear from here.
  const [replaceMedia, setReplaceMedia] = useState(false);
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
      setError(`Please enter an ${source === 'airbnb' ? 'Airbnb listing URL, Host profile URL, or listing ID' : 'Booking.com hotel link or hotel ID'}`);
      return;
    }

    setError(null);
    setFetching(true);
    setPreview(null);
    setHostListings(null);

    try {
      const res = await importerCall('fetch_ota_listing_preview', {
        channel: source,
        identifier: identifier.trim(),
      });

      if (res && res.success) {
        if (res.is_host_profile && res.listings && res.listings.length > 0) {
          setHostListings(res.listings);
          showToast(`Found ${res.listings.length} listings for this Host on Airbnb! Select one to import.`, { type: 'success' });
        } else if (res.data) {
          setPreview(res.data);
          if (res.partial) {
            showToast(
              res.message || 'Only basic details could be read from that page - please review and fill in the fields below.',
              { type: 'warning' }
            );
          } else {
            showToast(`Successfully extracted listing metadata from ${source === 'airbnb' ? 'Airbnb' : 'Booking.com'}!`, { type: 'success' });
          }
        }
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

  const handleSelectListingFromHost = async (listingId: string) => {
    setIdentifier(listingId);
    setHostListings(null);
    setFetching(true);
    setError(null);
    try {
      const res = await importerCall('fetch_ota_listing_preview', {
        channel: 'airbnb',
        identifier: listingId,
      });
      if (res && res.success && res.data) {
        setPreview(res.data);
        showToast(`Extracted details for listing #${listingId}`, { type: 'success' });
      } else {
        setError(res?.message || 'Failed to extract listing');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch listing');
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
      // Photos and Amenities have had visible checkboxes all along but were never
      // mapped into the payload, so toggling them did nothing at all - the backend
      // applied both unconditionally. Fixed 4 Sep 2026 together with the backend
      // gate that makes these keys mean something.
      if (applyFields.photos) selectedFieldKeys.push('photos');
      if (applyFields.amenities) selectedFieldKeys.push('amenities');

      try {
        const res = await importerCall('apply_ota_listing_to_property', {
          property_id: propertyId,
          // Re-fetch replaces photos/amenities instead of merging, so a picture
          // the host removed on the OTA actually disappears here too.
          replace_media: replaceMedia,
          imported_data: preview,
          selected_fields: selectedFieldKeys,
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
                  label={source === 'airbnb' ? 'Airbnb Listing URL, Host Profile Link, or ID' : 'Booking.com Property Link or Hotel ID'}
                  placeholder={
                    source === 'airbnb'
                      ? 'e.g. airbnb.com/rooms/12345678 or host link airbnb.com/users/show/34816822'
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
                  helperText={
                    source === 'airbnb'
                      ? 'Supports individual listing links, listing IDs, and host profile pages with multiple listings.'
                      : 'Paste the full link from your browser or your numeric property ID'
                  }
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

            {/* How to find link guide for Airbnb */}
            {source === 'airbnb' && !preview && !hostListings && (
              <details className="text-2xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/60 p-3 rounded-lg border border-gray-200 dark:border-gray-700/80 cursor-pointer group">
                <summary className="font-semibold text-gray-700 dark:text-gray-300 flex items-center justify-between list-none">
                  <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold">
                    💡 How do I find my Airbnb Host Profile or Listing Link?
                  </span>
                  <span className="text-3xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-2.5 space-y-2.5 pt-2 border-t border-gray-200 dark:border-gray-700/80 text-gray-600 dark:text-gray-300">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white mb-0.5">👤 For Standard / Non-Professional Hosts (Imports all listings):</div>
                    <ul className="list-disc list-inside space-y-1 ml-1 text-3xs text-gray-600 dark:text-gray-300">
                      <li><strong className="text-gray-800 dark:text-gray-200">Via Desktop:</strong> Log in to airbnb.com ➔ Click avatar (top-right) ➔ Click <strong className="text-gray-800 dark:text-gray-200">Account</strong> ➔ Click <strong className="text-gray-800 dark:text-gray-200">Go to profile</strong> ➔ Copy URL (<code className="text-indigo-600 dark:text-indigo-400">airbnb.com/users/show/12345</code>).</li>
                      <li><strong className="text-gray-800 dark:text-gray-200">From Any Listing:</strong> Open your listing ➔ Scroll to <strong className="text-gray-800 dark:text-gray-200">&quot;Hosted by...&quot;</strong> ➔ Click your photo/name ➔ Copy browser URL.</li>
                      <li><strong className="text-gray-800 dark:text-gray-200">Via Mobile App:</strong> Tap <strong className="text-gray-800 dark:text-gray-200">Profile</strong> (bottom-right) ➔ Tap your name/photo ➔ Tap <strong className="text-gray-800 dark:text-gray-200">Share</strong> (top-right) ➔ <strong className="text-gray-800 dark:text-gray-200">Copy Link</strong>.</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-gray-900 dark:text-white mb-0.5">🏢 For Professional Hosts (Custom Brand URL):</div>
                    <ul className="list-disc list-inside space-y-1 ml-1 text-3xs text-gray-600 dark:text-gray-300">
                      <li>Go to <strong className="text-gray-800 dark:text-gray-200">Account Settings ➔ Professional hosting tools</strong> ➔ Copy your custom profile URL (<code className="text-indigo-600 dark:text-indigo-400">airbnb.co.in/p/your-brand</code>).</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-gray-900 dark:text-white mb-0.5">🏠 For Single Listing Only:</div>
                    <ul className="list-disc list-inside space-y-1 ml-1 text-3xs text-gray-600 dark:text-gray-300">
                      <li>Go to <strong className="text-gray-800 dark:text-gray-200">Listings</strong> tab ➔ Click your property ➔ Click <strong className="text-gray-800 dark:text-gray-200">Preview / Share</strong> ➔ Copy link (<code className="text-indigo-600 dark:text-indigo-400">airbnb.com/rooms/12345678</code>) or enter just the numerical Listing ID.</li>
                    </ul>
                  </div>
                </div>
              </details>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Host Profile Multi-Listing Picker */}
            {hostListings && hostListings.length > 0 && (
              <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AirbnbIcon className="w-5 h-5" />
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      Found {hostListings.length} Listings for this Host on Airbnb
                    </span>
                  </div>
                  <span className="text-2xs text-gray-500 dark:text-gray-400">Click a listing to import:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {hostListings.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all shadow-2xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-gray-900 dark:text-white line-clamp-1">
                          {item.name}
                        </div>
                        <div className="text-3xs text-gray-500 dark:text-gray-400 font-mono">
                          ID: {item.id}
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSelectListingFromHost(item.id)}
                        disabled={fetching}
                        className="text-xs shrink-0"
                      >
                        Select &amp; Import
                      </Button>
                    </div>
                  ))}
                </div>
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
                <span className="px-2.5 py-0.5 text-2xs font-semibold uppercase rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
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

                  {(applyFields.photos || applyFields.amenities) && (
                    <label className="mt-3 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-900/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replaceMedia}
                        onChange={() => setReplaceMedia((v) => !v)}
                        className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 dark:bg-gray-700"
                      />
                      <span className="text-gray-800 dark:text-gray-200">
                        <span className="font-medium">This is a re-fetch — replace photos &amp; amenities</span>
                        <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Use this when the listing changed and you want the current
                          version. Anything you deleted on {source === 'airbnb' ? 'Airbnb' : 'Booking.com'} is
                          removed here too. Leave it off to keep what's already saved
                          and just add anything new.
                        </span>
                      </span>
                    </label>
                  )}
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
