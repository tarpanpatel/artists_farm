import React, { useState, useMemo } from 'react';
import { Modal } from 'flowbite-react';
import { Button } from './Button';
import {
  Sparkles,
  X,
  Search,
  Plus,
  Check,
} from './icons/FlowbiteIcons';
import {
  AMENITY_CATEGORIES,
  ALL_CATALOG_AMENITIES,
  getAmenityIcon,
  normalizeAmenityList,
} from '../utils/amenityCatalog';
import { t } from '../i18n/en';

export interface AmenitiesSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAmenities: string[];
  onSave: (amenities: string[]) => void;
}

export const AmenitiesSelectModal: React.FC<AmenitiesSelectModalProps> = ({
  isOpen,
  onClose,
  selectedAmenities,
  onSave,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [customAmenity, setCustomAmenity] = useState('');

  // Sync state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      // Normalised on open so an Airbnb-imported vocabulary ticks its real
      // checkbox rather than piling up under "Custom Added Amenities"
      // (7 Sep 2026). Also collapses WIFI + WIRELESS_INTERNET into one row.
      setSelected(normalizeAmenityList(selectedAmenities));
      setSearchQuery('');
      setActiveCategory('all');
      setCustomAmenity('');
    }
  }, [isOpen, selectedAmenities]);

  const isSelected = (label: string): boolean => {
    const target = label.trim().toLowerCase();
    return selected.some((s) => s.trim().toLowerCase() === target);
  };

  const toggleAmenity = (label: string) => {
    const target = label.trim();
    if (!target) return;
    if (isSelected(target)) {
      setSelected((prev) => prev.filter((s) => s.trim().toLowerCase() !== target.toLowerCase()));
    } else {
      setSelected((prev) => [...prev, target]);
    }
  };

  const handleAddCustom = () => {
    const v = customAmenity.trim();
    if (!v) return;
    if (!isSelected(v)) {
      setSelected((prev) => [...prev, v]);
    }
    setCustomAmenity('');
  };

  // Filter items
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return AMENITY_CATEGORIES.map((cat) => {
      if (activeCategory !== 'all' && cat.id !== activeCategory) {
        return null;
      }
      const matchingItems = cat.items.filter((item) => {
        if (!q) return true;
        return (
          item.label.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
        );
      });

      if (matchingItems.length === 0) return null;
      return {
        ...cat,
        items: matchingItems,
      };
    }).filter(Boolean) as typeof AMENITY_CATEGORIES;
  }, [searchQuery, activeCategory]);

  // Also collect any selected custom amenities that aren't in the default catalog
  const customSelectedAmenities = useMemo(() => {
    const catalogLabels = new Set(ALL_CATALOG_AMENITIES.map((c) => c.label.trim().toLowerCase()));
    return selected.filter((s) => !catalogLabels.has(s.trim().toLowerCase()));
  }, [selected]);

  const handleSave = () => {
    onSave(selected);
    onClose();
  };

  return (
    <Modal
      show={isOpen}
      onClose={onClose}
      size="2xl"
      dismissible
      className="z-50"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white m-0 leading-tight">
              {t('select_amenities_heading', 'Select Amenities')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 m-0">
              {t('select_amenities_subheading', 'Choose what this space offers to guests.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close_button', 'Close')}
          className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 sm:p-5 overflow-y-auto max-h-[72vh] space-y-4">
        {/* Search & Custom Add Bar */}
        <div className="space-y-2">
          <div className="relative">
            <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_amenities_placeholder', 'Search amenities (e.g. Wi-Fi, AC, Balcony)...')}
              className="block w-full ps-9 pe-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors border ${
                activeCategory === 'all'
                  ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              {t('all_amenities_tab', 'All')}
            </button>
            {AMENITY_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors border ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amenity quick addition */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/80 flex items-center gap-2">
          <input
            type="text"
            value={customAmenity}
            onChange={(e) => setCustomAmenity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder={t('custom_amenity_placeholder', 'Add custom amenity (e.g. Hammock, Telescope)...')}
            className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddCustom}
            disabled={!customAmenity.trim()}
            className="shrink-0 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('add_button', 'Add')}</span>
          </Button>
        </div>

        {/* Custom selected amenities list (if any custom items exist) */}
        {customSelectedAmenities.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('custom_amenities_heading', 'Custom Added Amenities')} ({customSelectedAmenities.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {customSelectedAmenities.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                >
                  <span>{label}</span>
                  <button
                    type="button"
                    onClick={() => toggleAmenity(label)}
                    aria-label={`Remove ${label}`}
                    className="p-0.5 rounded text-blue-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Categorized Amenities Grid */}
        <div className="space-y-5">
          {filteredCategories.map((cat) => (
            <div key={cat.id} className="space-y-2.5">
              <h4 className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center justify-between">
                <span>{cat.name}</span>
                <span className="font-normal text-gray-400">
                  {cat.items.filter((i) => isSelected(i.label)).length}/{cat.items.length}
                </span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cat.items.map((item) => {
                  const checked = isSelected(item.label);
                  const Icon = getAmenityIcon(item.label);
                  return (
                    <div
                      key={`${cat.id}-${item.id}`}
                      onClick={() => toggleAmenity(item.label)}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border cursor-pointer select-none transition-all ${
                        checked
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-500 shadow-2xs'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            checked
                              ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold truncate ${
                            checked ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-white'
                          }`}>
                            {item.label}
                          </div>
                          {item.description && (
                            <div className="text-2xs text-gray-500 dark:text-gray-400 line-clamp-1">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            checked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredCategories.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-xs">
              {t('no_amenities_found', 'No amenities match your search query.')}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-lg flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold">
            {selected.length}
          </span>
          {selected.length === 1 ? 'amenity selected' : 'amenities selected'}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('cancel_button', 'Cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            {t('save_amenities_button', 'Save Amenities')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
