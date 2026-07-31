import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateRangePickerProps {
  checkinDate: string;
  checkoutDate: string;
  onCheckinChange: (date: string) => void;
  onCheckoutChange: (date: string) => void;
  onClear?: () => void;
  blockedDates?: string[];
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  checkinDate,
  checkoutDate,
  onCheckinChange,
  onCheckoutChange,
  onClear,
  blockedDates = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const today = new Date();
  const [startMonth, setStartMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedMode, setSelectedMode] = useState<'checkin' | 'checkout'>('checkin');

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

    // Check if date is blocked or in the past
    if (isDateBlocked(dateStr) || isDateBeforeToday(dateStr)) {
      return;
    }

    if (selectedMode === 'checkin') {
      onCheckinChange(dateStr);
      // Auto-switch to checkout mode after selecting checkin
      setSelectedMode('checkout');
    } else {
      // Checkout date must be after check-in
      if (checkinDate && dateStr <= checkinDate) {
        return;
      }
      onCheckoutChange(dateStr);
      // Close calendar after checkout selection
      setTimeout(() => setIsOpen(false), 100);
    }
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
      const dateStr = formatDate(new Date(month.getFullYear(), month.getMonth(), day));
      const blocked = isDateBlocked(dateStr);
      const beforeToday = isDateBeforeToday(dateStr);

      // Checkout mode: disable dates <= checkin
      let invalidForCheckout = false;
      if (selectedMode === 'checkout' && checkinDate && dateStr <= checkinDate) {
        invalidForCheckout = true;
      }

      const isDisabled = blocked || beforeToday || invalidForCheckout;
      const isCheckinSelected = checkinDate === dateStr;
      const isCheckoutSelected = checkoutDate === dateStr;
      const inRange = isDateInRange(dateStr);

      days.push(
        <button
          key={`${monthOffset}-${day}`}
          disabled={isDisabled}
          onClick={() => handleSelectDate(day, monthOffset)}
          className={`
            p-2 text-center rounded-full text-sm font-bold transition relative w-full aspect-square flex items-center justify-center
            ${isDisabled
              ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-40'
              : isCheckinSelected || isCheckoutSelected
              ? 'bg-black dark:bg-white text-white dark:text-black ring-2 ring-white dark:ring-gray-800'
              : inRange
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
              : 'text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
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
    <div className="space-y-4">
      {/* Input Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Check-In Date *
          </label>
          <button
            onClick={() => {
              setIsOpen(true);
              setSelectedMode('checkin');
            }}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {checkinDate ? new Date(checkinDate).toLocaleDateString('en-GB') : 'Select date'}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Check-Out Date *
          </label>
          <button
            onClick={() => {
              setIsOpen(true);
              setSelectedMode(checkinDate ? 'checkout' : 'checkin');
            }}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {checkoutDate ? new Date(checkoutDate).toLocaleDateString('en-GB') : 'Select date'}
          </button>
        </div>
      </div>

      {/* Calendar Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <div className="fixed z-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl p-6 w-11/12 max-w-2xl max-h-screen overflow-y-auto">
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
            >
              <X size={20} />
            </button>

            {/* Mode Indicator */}
            <div className="mb-6 text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedMode === 'checkin' ? 'Select Check-In Date' : 'Select Check-Out Date'}
              </h3>
              {checkinDate && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Check-in: {new Date(checkinDate).toLocaleDateString('en-GB')}
                </p>
              )}
            </div>

            {/* Two month calendars */}
            <div className="grid grid-cols-2 gap-6">
              {/* Month 1 */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-center">
                  {monthNames[month1.getMonth()]} {month1.getFullYear()}
                </h3>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 h-8">
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
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 h-8">
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
                      setIsOpen(false);
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-sm font-medium"
                  >
                    Clear dates
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 rounded-lg transition text-sm font-medium"
                >
                  Close
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
