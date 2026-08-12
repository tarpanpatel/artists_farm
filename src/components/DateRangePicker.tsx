import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { t } from '../i18n/en';

interface DateRangePickerProps {
  isOpen: boolean;
  onClose: () => void;
  checkinDate: string;
  checkoutDate: string;
  onCheckinChange: (date: string) => void;
  onCheckoutChange: (date: string) => void;
  onClear?: () => void;
  blockedDates?: string[];
  // Overrides for non-booking uses (e.g. a plain "from/to" report filter) -
  // default text is booking-specific ("Select dates", "CHECK-IN"/"CHECKOUT",
  // "reservation dates"), which is wrong copy anywhere this is reused outside
  // an actual check-in/check-out flow.
  heading?: string;
  description?: string;
  fromLabel?: string;
  toLabel?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  isOpen,
  onClose,
  checkinDate,
  checkoutDate,
  onCheckinChange,
  onCheckoutChange,
  onClear,
  blockedDates = [],
  heading,
  description,
  fromLabel,
  toLabel,
}) => {
  const today = new Date();
  const [startMonth, setStartMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedMode, setSelectedMode] = useState<'checkin' | 'checkout'>('checkin');

  if (!isOpen) return null;

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isDateBlocked = (dateStr: string) => {
    return blockedDates.includes(dateStr);
  };

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return t('add_date_label', 'Add date');
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const isDateBeforeToday = (dateStr: string): boolean => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const checkDate = new Date(dateStr);
    return checkDate < todayDate;
  };

  const isDateInRange = (dateStr: string) => {
    if (!checkinDate || !checkoutDate) return false;
    return dateStr > checkinDate && dateStr < checkoutDate;
  };

  const handleSelectDate = (day: number, monthOffset: number) => {
    const month = new Date(startMonth.getFullYear(), startMonth.getMonth() + monthOffset, 1);
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const dateStr = formatDate(date);

    if (isDateBlocked(dateStr) || isDateBeforeToday(dateStr)) {
      return;
    }

    if (selectedMode === 'checkin' || !checkinDate) {
      onCheckinChange(dateStr);
      onCheckoutChange('');
      setSelectedMode('checkout');
    } else {
      if (checkinDate && dateStr < checkinDate) {
        // Reset check-in if user picked an earlier check-out date. Same-day
        // is allowed on purpose - a late check-in with a same-morning
        // check-out is a real booking, distinguished by the separate
        // Check-In/Check-Out Time fields, not by the date alone.
        onCheckinChange(dateStr);
        onCheckoutChange('');
        setSelectedMode('checkout');
        return;
      }
      onCheckoutChange(dateStr);
    }
  };

  const renderMonthCalendar = (monthOffset: number) => {
    const month = new Date(startMonth.getFullYear(), startMonth.getMonth() + monthOffset, 1);
    const daysInMonth = getDaysInMonth(month);
    const firstDay = getFirstDayOfMonth(month);
    const days = [];

    // Empty lead cells
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${monthOffset}-${i}`} className="w-9 h-9" />);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day, 12, 0, 0);
      const dateStr = formatDate(date);
      const blocked = isDateBlocked(dateStr);
      const beforeToday = isDateBeforeToday(dateStr);
      const isDisabled = blocked || beforeToday;

      const isCheckinSelected = checkinDate === dateStr;
      const isCheckoutSelected = checkoutDate === dateStr;
      const inRange = isDateInRange(dateStr);

      days.push(
        <button
          key={`${monthOffset}-${day}`}
          type="button"
          disabled={isDisabled}
          onClick={() => handleSelectDate(day, monthOffset)}
          className={`
            w-9 h-9 rounded-full text-xs font-semibold flex items-center justify-center transition-all relative
            ${isDisabled
              ? blocked
                ? 'text-slate-300 dark:text-slate-600 line-through cursor-not-allowed'
                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
              : isCheckinSelected || isCheckoutSelected
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold shadow-md z-10'
              : inRange
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-none'
              : 'text-slate-800 dark:text-slate-200 hover:border hover:border-slate-900 dark:hover:border-white'
            }
          `}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const month1 = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  const month2 = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1);

  return (
    <>
      {/* Dark Overlay Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 transition-opacity date-range-picker__backdrop"
        onClick={onClose}
      />

      {/* Centered Modal Popover Container */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 border border-slate-100 dark:border-slate-700 relative date-range-picker__modal">
        {/* Close Button Inside Modal */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer z-10 date-range-picker__close"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pr-8 sm:pr-10 date-range-picker__header">
          <div className="date-range-picker__header-info">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight date-range-picker__heading">
              {heading ?? t('select_dates_heading', 'Select dates')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 date-range-picker__description">
              {description ?? t('select_dates_description', 'Add your reservation dates for exact pricing & availability')}
            </p>
          </div>

          {/* Airbnb Dual Pill Switcher */}
          <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-2xl p-1 bg-slate-50 dark:bg-slate-900/50 shadow-2xs date-range-picker__mode-switcher">
            <button
              type="button"
              onClick={() => setSelectedMode('checkin')}
              className={`px-3 py-1.5 rounded-xl text-left transition-all date-range-picker__mode-btn ${
                selectedMode === 'checkin'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold ring-2 ring-slate-900 dark:ring-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 date-range-picker__mode-label">{fromLabel ?? t('checkin_pill_label', 'CHECK-IN')}</div>
              <div className="text-xs font-semibold date-range-picker__mode-date">{formatDisplayDate(checkinDate)}</div>
            </button>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1 date-range-picker__mode-divider" />

            <button
              type="button"
              onClick={() => setSelectedMode('checkout')}
              className={`px-3 py-1.5 rounded-xl text-left transition-all date-range-picker__mode-btn ${
                selectedMode === 'checkout'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold ring-2 ring-slate-900 dark:ring-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 date-range-picker__mode-label">{toLabel ?? t('checkout_pill_label', 'CHECKOUT')}</div>
              <div className="text-xs font-semibold date-range-picker__mode-date">{formatDisplayDate(checkoutDate)}</div>
            </button>
          </div>
        </div>

        {/* Month Navigation Header & Side-by-Side Calendars */}
        <div className="relative pt-2 date-range-picker__calendars-container">
          {/* Previous Month Arrow */}
          <button
            type="button"
            onClick={() => setStartMonth(new Date(startMonth.getFullYear(), startMonth.getMonth() - 1, 1))}
            className="absolute left-0 top-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition cursor-pointer text-slate-700 dark:text-slate-300 date-range-picker__nav-btn"
            title={t('previous_month_tooltip', 'Previous month')}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Next Month Arrow */}
          <button
            type="button"
            onClick={() => setStartMonth(new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1))}
            className="absolute right-0 top-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition cursor-pointer text-slate-700 dark:text-slate-300 date-range-picker__nav-btn"
            title={t('next_month_tooltip', 'Next month')}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* 2-Month Grid View */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-4 date-range-picker__calendars">
            {/* Month 1 */}
            <div className="space-y-3 date-range-picker__month">
              <h3 className="text-sm font-bold text-center text-slate-900 dark:text-white date-range-picker__month-title">
                {monthNames[month1.getMonth()]} {month1.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 date-range-picker__weekdays">
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-1 justify-items-center date-range-picker__days">
                {renderMonthCalendar(0)}
              </div>
            </div>

            {/* Month 2 */}
            <div className="space-y-3 hidden sm:block date-range-picker__month">
              <h3 className="text-sm font-bold text-center text-slate-900 dark:text-white date-range-picker__month-title">
                {monthNames[month2.getMonth()]} {month2.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 date-range-picker__weekdays">
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-1 justify-items-center date-range-picker__days">
                {renderMonthCalendar(1)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700 date-range-picker__footer">
          {onClear ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                setSelectedMode('checkin');
              }}
              className="text-xs font-bold text-slate-600 dark:text-slate-400 underline hover:text-slate-900 dark:hover:text-white transition date-range-picker__clear-btn"
            >
              {t('clear_dates_button', 'Clear dates')}
            </button>
          ) : <div className="date-range-picker__clear-placeholder" />}

          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2.5 text-xs font-bold rounded-2xl shadow-md transition cursor-pointer date-range-picker__confirm-btn ${
              checkinDate && checkoutDate
                ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white border-0'
                : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900'
            }`}
          >
            {checkinDate && checkoutDate ? t('save_button', 'Save') : t('close_button', 'Close')}
          </button>
        </div>
      </div>
    </>
  );
};
