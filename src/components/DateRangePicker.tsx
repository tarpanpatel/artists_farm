import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateRangePickerProps {
  isOpen: boolean;
  onClose: () => void;
  checkinDate: string;
  checkoutDate: string;
  onCheckinChange: (date: string) => void;
  onCheckoutChange: (date: string) => void;
  onClear?: () => void;
  blockedDates?: string[];
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
    if (!dateStr) return 'Add date';
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
                ? 'text-gray-300 dark:text-gray-600 line-through cursor-not-allowed'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : isCheckinSelected || isCheckoutSelected
              ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold shadow-md z-10'
              : inRange
              ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-none'
              : 'text-gray-800 dark:text-gray-200 hover:border hover:border-gray-900 dark:hover:border-white'
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
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Centered Modal Popover Container */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 border border-gray-100 dark:border-slate-700">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Select dates
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Add your reservation dates for exact pricing & availability
            </p>
          </div>

          {/* Airbnb Dual Pill Switcher */}
          <div className="flex items-center border border-gray-300 dark:border-slate-600 rounded-2xl p-1 bg-gray-50 dark:bg-slate-900/50 shadow-2xs">
            <button
              type="button"
              onClick={() => setSelectedMode('checkin')}
              className={`px-3 py-1.5 rounded-xl text-left transition-all ${
                selectedMode === 'checkin'
                  ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-xs font-bold ring-2 ring-gray-900 dark:ring-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-gray-400 dark:text-gray-500">CHECK-IN</div>
              <div className="text-xs font-semibold">{formatDisplayDate(checkinDate)}</div>
            </button>

            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />

            <button
              type="button"
              onClick={() => setSelectedMode('checkout')}
              className={`px-3 py-1.5 rounded-xl text-left transition-all ${
                selectedMode === 'checkout'
                  ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-xs font-bold ring-2 ring-gray-900 dark:ring-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-gray-400 dark:text-gray-500">CHECKOUT</div>
              <div className="text-xs font-semibold">{formatDisplayDate(checkoutDate)}</div>
            </button>
          </div>
        </div>

        {/* Month Navigation Header & Side-by-Side Calendars */}
        <div className="relative pt-2">
          {/* Previous Month Arrow */}
          <button
            type="button"
            onClick={() => setStartMonth(new Date(startMonth.getFullYear(), startMonth.getMonth() - 1, 1))}
            className="absolute left-0 top-3 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition cursor-pointer text-gray-700 dark:text-gray-300"
            title="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Next Month Arrow */}
          <button
            type="button"
            onClick={() => setStartMonth(new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1))}
            className="absolute right-0 top-3 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition cursor-pointer text-gray-700 dark:text-gray-300"
            title="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* 2-Month Grid View */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-4">
            {/* Month 1 */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-center text-gray-900 dark:text-white">
                {monthNames[month1.getMonth()]} {month1.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-gray-400 dark:text-gray-500">
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-1 justify-items-center">
                {renderMonthCalendar(0)}
              </div>
            </div>

            {/* Month 2 */}
            <div className="space-y-3 hidden sm:block">
              <h3 className="text-sm font-bold text-center text-gray-900 dark:text-white">
                {monthNames[month2.getMonth()]} {month2.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-gray-400 dark:text-gray-500">
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-1 justify-items-center">
                {renderMonthCalendar(1)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-slate-700">
          {onClear ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                setSelectedMode('checkin');
              }}
              className="text-xs font-bold text-gray-600 dark:text-gray-400 underline hover:text-gray-900 dark:hover:text-white transition"
            >
              Clear dates
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2.5 text-xs font-bold rounded-2xl shadow-md transition cursor-pointer ${
              checkinDate && checkoutDate
                ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white border-0'
                : 'bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900'
            }`}
          >
            {checkinDate && checkoutDate ? 'Save' : 'Close'}
          </button>
        </div>
      </div>
    </>
  );
};
