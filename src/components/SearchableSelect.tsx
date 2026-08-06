import React, { useState, useRef, useEffect } from 'react';
import { t } from '../i18n/en';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  required?: boolean;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = t('searchable_select_placeholder'),
  className = '',
  inputClassName = '',
  dropdownClassName = '',
  required = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        required={required}
        disabled={disabled}
        value={isOpen ? search : selectedLabel}
        onFocus={() => { setIsOpen(true); setSearch(''); }}
        onChange={e => { setSearch(e.target.value); setIsOpen(true); if (!e.target.value) onChange(''); }}
        placeholder={placeholder}
        className={inputClassName}
      />
      {isOpen && (
        <div className={`absolute z-50 mt-1 w-full border rounded-lg shadow-lg bg-white dark:bg-slate-800 max-h-60 overflow-y-auto ${dropdownClassName}`}>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">{t('no_matches_text')}</div>
          ) : (
            filtered.map(opt => (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setSearch(''); setIsOpen(false); }}
                className={`px-3 py-2 text-xs cursor-pointer transition-colors ${
                  opt.value === value
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
