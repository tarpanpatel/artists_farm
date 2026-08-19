import React, { useEffect, useRef } from 'react';
import FlowbiteDateRangePicker from 'flowbite-datepicker/DateRangePicker';

interface DateRangePickerProps {
  checkinDate: string;
  checkoutDate: string;
  onCheckinChange: (date: string) => void;
  onCheckoutChange: (date: string) => void;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  className?: string;
  label?: string;
  // Optional legacy props for seamless compatibility
  isOpen?: boolean;
  onClose?: () => void;
  onClear?: () => void;
  blockedDates?: string[];
  heading?: string;
  description?: string;
  fromLabel?: string;
  toLabel?: string;
}

const CalendarIcon: React.FC = () => (
  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z" />
  </svg>
);

const fieldClass =
  'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full ps-9 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500';

function toIsoDate(date: number | Date | undefined): string {
  if (date === undefined) return '';
  const d = typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parts = value.split(' ')[0].split('-');
  if (parts.length !== 3) return undefined;
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

/**
 * Checkin/checkout field built directly on flowbite-datepicker's own
 * DateRangePicker - the vanilla-JS library flowbite.com's own docs use for
 * their "Date Range Picker" example.
 */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  checkinDate,
  checkoutDate,
  onCheckinChange,
  onCheckoutChange,
  fromPlaceholder = 'Select date start',
  toPlaceholder = 'Select date end',
  className = '',
  label,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const rangepickerRef = useRef<InstanceType<typeof FlowbiteDateRangePicker> | null>(null);
  const callbacksRef = useRef({ onCheckinChange, onCheckoutChange });
  callbacksRef.current = { onCheckinChange, onCheckoutChange };

  useEffect(() => {
    const container = containerRef.current;
    const startEl = startInputRef.current;
    const endEl = endInputRef.current;
    if (!container || !startEl || !endEl) return;

    const rangepicker = new FlowbiteDateRangePicker(container, {
      format: 'dd/mm/yyyy',
      autohide: false,
      todayBtn: true,
      clearBtn: true,
      todayHighlight: true,
    });
    rangepickerRef.current = rangepicker;

    const reportCurrentRange = () => {
      const [start, end] = rangepicker.dates;
      callbacksRef.current.onCheckinChange(toIsoDate(start));
      callbacksRef.current.onCheckoutChange(toIsoDate(end));
    };
    startEl.addEventListener('changeDate', reportCurrentRange);
    endEl.addEventListener('changeDate', reportCurrentRange);

    return () => {
      startEl.removeEventListener('changeDate', reportCurrentRange);
      endEl.removeEventListener('changeDate', reportCurrentRange);
      rangepicker.destroy();
      rangepickerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rangepicker = rangepickerRef.current;
    if (!rangepicker) return;
    const [currentStart, currentEnd] = rangepicker.dates;
    if (toIsoDate(currentStart) === checkinDate && toIsoDate(currentEnd) === checkoutDate) return;

    rangepicker.setDates(
      fromIsoDate(checkinDate) ?? { clear: true },
      fromIsoDate(checkoutDate) ?? { clear: true }
    );
  }, [checkinDate, checkoutDate]);

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 block">
          <label className="app-label text-xs font-semibold text-slate-700 dark:text-slate-200">
            {label}
          </label>
        </div>
      )}
      <div ref={containerRef} className={`flex items-center gap-2 ${className}`}>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <CalendarIcon />
          </div>
          <input ref={startInputRef} name="start" type="text" className={fieldClass} placeholder={fromPlaceholder} />
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">to</span>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <CalendarIcon />
          </div>
          <input ref={endInputRef} name="end" type="text" className={fieldClass} placeholder={toPlaceholder} />
        </div>
      </div>
    </div>
  );
};
