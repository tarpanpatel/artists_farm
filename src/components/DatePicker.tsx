import React from 'react';
import { Datepicker as FlowbiteDatepicker } from 'flowbite-react';

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
  title?: string;
  disabled?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select date',
  disabled,
  label,
}) => {
  const parseInputDate = (dateStr: string): Date | undefined => {
    if (!dateStr) return undefined;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr) || undefined;
  };

  const formatDateString = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <div className="relative date-picker w-full">
      {label && (
        <div className="mb-1 block">
          <label className="app-label text-xs font-semibold text-slate-700 dark:text-slate-200">
            {label}
          </label>
        </div>
      )}
      <FlowbiteDatepicker
        placeholder={placeholder}
        value={parseInputDate(value)}
        disabled={disabled}
        onChange={(date: Date | null) => onChange(formatDateString(date))}
      />
    </div>
  );
};
