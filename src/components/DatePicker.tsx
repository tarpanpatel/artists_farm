import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X, ArrowDown } from 'lucide-react';
import { t } from '../i18n/en';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  onClear?: () => void;
  onClose?: () => void;
  otherDate?: string;
  isCheckout?: boolean;
  blockedDates?: string[];
  placeholder?: string;
  label?: string;
  isOpen?: boolean;
  // Overrides the modal heading for non-booking uses (e.g. a single "Expense
  // Date" field). Without this, the modal defaults to check-in/check-out
  // language - fine for the booking flow this component was originally built
  // for, wrong copy anywhere else. When set, the bouncing-arrow booking
  // decoration is skipped too, since it only makes sense when picking one
  // half of a check-in/check-out pair.
  title?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  onClear,
  onClose,
  otherDate,
  isCheckout = false,
  blockedDates = [],
  placeholder = 'Select date',
  label,
  isOpen: externalIsOpen,
  title,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(open);
    }
  };
  const today = new Date();
  const [startMonth, setStartMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

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

  const isDateInRange = (dateStr: string) => {
    if (!value || !otherDate) return false;
    const [minDate, maxDate] = [value, otherDate].sort();
    return dateStr > minDate && dateStr < maxDate;
  };

  const handleSelectDate = (day: number, monthOffset: number) => {
    const month = new Date(startMonth.getFullYear(), startMonth.getMonth() + monthOffset, 1);
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12, 0, 0);
    const dateStr = formatDate(date);

    // Check if date is blocked or in the past
    if (isDateBlocked(dateStr)) {
      return;
    }
    if (isDateBeforeToday(dateStr)) {
      return;
    }

    // For checkout date: must be after check-in date (if check-in is set)
    if (isCheckout && otherDate) {
      if (dateStr <= otherDate) {
        return;
      }
    }

    onChange(dateStr);
    // Don't auto-close - let user click Close button
  };

  const isDateBeforeToday = (dateStr: string): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(dateStr);
    return checkDate < today;
  };

  const renderMonthCalendar = (monthOffset: number) => {
    const month = new Date(startMonth.getFullYear(), startMonth.getMonth() + monthOffset, 1);
    const daysInMonth = getDaysInMonth(month);
    const firstDay = getFirstDayOfMonth(month);
    const days = [];

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${monthOffset}-${i}`} />);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day, 12, 0, 0);
      const dateStr = formatDate(date);
      const blocked = isDateBlocked(dateStr);
      const beforeToday = isDateBeforeToday(dateStr);

      // For checkout: disable dates that are not after check-in
      let invalidForPicker = false;
      if (isCheckout && otherDate && dateStr <= otherDate) {
        invalidForPicker = true;
      }

      const isDisabled = blocked || beforeToday || invalidForPicker;
      const selected = value === dateStr;
      const inRange = isDateInRange(dateStr);
      const isOtherDate = otherDate === dateStr;

      days.push(
        <button
          key={`${monthOffset}-${day}`}
          disabled={isDisabled}
          onClick={() => handleSelectDate(day, monthOffset)}
          className={`
            p-2 text-center rounded-full text-sm font-medium transition relative
            ${isDisabled
              ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-40'
              : selected || isOtherDate
              ? 'bg-black dark:bg-white text-white dark:text-black font-bold'
              : inRange
              ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
              : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
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
    <div className="relative">
      {label && (
        <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          {label}
        </label>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="app-input w-full h-10 px-3.5 text-sm font-medium rounded-lg transition-all duration-200 outline-none bg-[var(--input-bg-default)] text-[var(--input-text-default)] border border-[var(--input-border-default)] hover:border-slate-400 dark:hover:border-slate-500 focus:border-[var(--input-border-focus)] focus:ring-4 focus:ring-[var(--input-ring-focus)] text-left"
      >
        <span className={value ? '' : 'text-[var(--input-placeholder)]'}>
          {value ? new Date(value).toLocaleDateString('en-GB') : placeholder}
        </span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <div className="fixed z-[70] top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl p-6 w-11/12 max-w-2xl max-h-screen overflow-y-auto">
            {/* Title with Bouncing Arrow */}
            <div className="mb-6 text-center relative">
              {title ? (
                // Generic (non-booking) usage - plain heading, no check-in/
                // check-out decoration.
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {title}
                </h2>
              ) : isCheckout && value ? (
                // Show date range summary when checkout date is selected
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('check_in_label')} {new Date(otherDate || '').toLocaleDateString('en-GB')} - {t('check_out_label')} {new Date(value).toLocaleDateString('en-GB')}
                </p>
              ) : (
                // Show title with bouncing arrow when still selecting
                <>
                  <div className="flex items-center justify-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {isCheckout ? t('select_checkout_date_title', 'Select Check-Out Date') : t('select_checkin_date_title', 'Select Check-In Date')}
                    </h2>
                    <ArrowDown
                      size={20}
                      className="text-blue-600 animate-bounce"
                      style={{ animationDelay: '0s' }}
                    />
                  </div>
                  {otherDate && isCheckout && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      {t('check_in_label')} {new Date(otherDate).toLocaleDateString('en-GB')}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
            >
              <X size={20} />
            </button>

          {/* Two month calendars */}
          <div className="grid grid-cols-2 gap-6">
            {/* Month 1 */}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-center">
                {monthNames[month1.getMonth()]} {month1.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                  <div key={`month1-${idx}-${day}`} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 h-8">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {renderMonthCalendar(0)}
              </div>
            </div>

            {/* Month 2 */}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-center">
                {monthNames[month2.getMonth()]} {month2.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                  <div key={`month2-${idx}-${day}`} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 h-8">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {renderMonthCalendar(1)}
              </div>
            </div>
          </div>

          {/* Navigation and Buttons */}
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={() => setStartMonth(new Date(startMonth.getFullYear(), startMonth.getMonth() - 1, 1))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex gap-2">
              {onClear && (
                <button
                  onClick={() => {
                    onClear();
                    // Only close internally if not externally controlled
                    if (externalIsOpen === undefined) {
                      setIsOpen(false);
                    }
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-sm font-medium"
                >
                  {t('clear_dates_button', 'Clear dates')}
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  onClose?.();
                }}
                className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                  isCheckout && value
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200'
                }`}
              >
                {isCheckout && value ? t('save_button', 'Save') : t('close_button', 'Close')}
              </button>
            </div>
            <button
              onClick={() => setStartMonth(new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
};
