import React, { useState, useMemo } from 'react';
import { Modal } from 'flowbite-react';
import { Button } from './Button';
import {
  Calendar, Search, X, AlertCircle,
} from './icons/FlowbiteIcons';
import {
  INDIAN_HOLIDAYS_AND_OCCASIONS,
  WEDDING_MUHURAT_SEASONS,
} from '../data/indianHolidaysAndMuhurats';
import { formatDateDDMMYY } from '../utils/dateUtils';

interface HolidaysGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRange?: (startDate: string, endDate: string, suggestedName?: string) => void;
}

type TabType = 'all' | '2026' | '2027' | '2028' | 'weddings';

export const HolidaysGuideModal: React.FC<HolidaysGuideModalProps> = ({
  isOpen,
  onClose,
  onSelectRange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const filteredHolidays = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return INDIAN_HOLIDAYS_AND_OCCASIONS.filter((item) => {
      if (activeTab === '2026' && item.year !== 2026) return false;
      if (activeTab === '2027' && item.year !== 2027) return false;
      if (activeTab === '2028' && item.year !== 2028) return false;
      if (activeTab === 'weddings') return false;

      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        item.startDate.includes(q) ||
        item.endDate.includes(q)
      );
    });
  }, [searchQuery, activeTab]);

  const filteredWeddings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (activeTab !== 'all' && activeTab !== 'weddings') return [];
    return WEDDING_MUHURAT_SEASONS.filter((item) => {
      if (!q) return true;
      return (
        item.month.toLowerCase().includes(q) ||
        item.datesText.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, activeTab]);

  return (
    <Modal
      show={isOpen}
      onClose={onClose}
      size="2xl"
      popup
      className="z-70 holidays-guide-modal"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50/70 dark:bg-gray-850">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                Indian Festivals & Wedding Dates Guide (2026–2028)
              </h3>
              <p className="text-2xs text-gray-500 dark:text-gray-400 truncate">
                High-demand holiday periods, long weekends & auspicious wedding muhurat dates
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Search and Filter Tabs */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3 shrink-0 bg-white dark:bg-gray-800">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search festival, holiday, month, or date (e.g. Diwali, Navratri, Dec)..."
              className="w-full pl-9 pr-9 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All Occasions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('2026')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                activeTab === '2026'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              2026 Festivals
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('2027')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                activeTab === '2027'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              2027 Festivals
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('2028')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                activeTab === '2028'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              2028 Festivals
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('weddings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                activeTab === 'weddings'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50'
              }`}
            >
              💍 Wedding Muhurats
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Section: Wedding Muhurats (if active tab is all or weddings) */}
          {(activeTab === 'all' || activeTab === 'weddings') && filteredWeddings.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-2xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                  💍 Wedding & Auspicious Muhurat Dates (Panchang)
                </span>
                <span className="text-2xs text-gray-400">({filteredWeddings.length} seasons)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredWeddings.map((season, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/20 flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-purple-950 dark:text-purple-200">
                          {season.month}
                        </span>
                        <span className="px-2 py-0.5 text-2xs font-semibold rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                          {season.year}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-1">
                        {season.datesText}
                      </p>
                      {season.notes && (
                        <p className="text-2xs text-gray-500 dark:text-gray-400 mt-1">
                          {season.notes}
                        </p>
                      )}
                    </div>

                    {onSelectRange && (
                      <div className="pt-2 border-t border-purple-100 dark:border-purple-900/40 flex justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            onSelectRange(season.startDate, season.endDate, `${season.month} Weddings`);
                            onClose();
                          }}
                        >
                          Apply Month Dates
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Festivals & Public Holidays */}
          {filteredHolidays.length > 0 && (
            <div className="space-y-2.5">
              {(activeTab === 'all' || activeTab === 'weddings') && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Festivals, National Holidays & Long Weekends
                  </span>
                  <span className="text-2xs text-gray-400">({filteredHolidays.length} occasions)</span>
                </div>
              )}

              <div className="divide-y divide-gray-100 dark:divide-gray-700/60 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {filteredHolidays.map((holiday) => {
                  const dateDisplay =
                    holiday.startDate === holiday.endDate
                      ? formatDateDDMMYY(holiday.startDate)
                      : `${formatDateDDMMYY(holiday.startDate)} → ${formatDateDDMMYY(holiday.endDate)}`;

                  return (
                    <div
                      key={holiday.id}
                      className="p-3 bg-white dark:bg-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-750 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">
                            {holiday.name}
                          </span>
                          <span className={`px-2 py-0.5 text-2xs font-medium rounded ${
                            holiday.type === 'festival'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                              : holiday.type === 'holiday'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                          }`}>
                            {holiday.year}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-2xs text-gray-500 dark:text-gray-400">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            📅 {dateDisplay}
                          </span>
                          {holiday.notes && (
                            <>
                              <span>•</span>
                              <span>{holiday.notes}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {onSelectRange && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            onSelectRange(holiday.startDate, holiday.endDate, holiday.name);
                            onClose();
                          }}
                          className="shrink-0"
                        >
                          Apply Dates
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty Search State */}
          {filteredHolidays.length === 0 && filteredWeddings.length === 0 && (
            <div className="py-12 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                No holidays or wedding dates found matching &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-2xs text-gray-500 dark:text-gray-400">
                Try searching for a different festival name, month or year.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 px-5 border-t border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50/70 dark:bg-gray-850 flex items-center justify-between">
          <span className="text-2xs text-gray-500 dark:text-gray-400">
            Dates formatted in <code className="text-gray-700 dark:text-gray-300">dd/mm/yy</code> per platform rule.
          </span>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={onClose}
          >
            Close Guide
          </Button>
        </div>
      </div>
    </Modal>
  );
};
