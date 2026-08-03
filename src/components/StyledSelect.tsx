import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface StyledSelectOption {
  value: string;
  label: React.ReactNode;
  searchText?: string;
  disabled?: boolean;
  group?: string;
}

interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: StyledSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  searchable?: boolean;
  id?: string;
}

export const StyledSelect: React.FC<StyledSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  error = false,
  searchable = false,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (isOpen && searchable) {
      setSearch('');
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen, searchable]);

  const selected = options.find((o) => o.value === value);

  const filteredOptions = searchable && search
    ? options.filter((o) => (o.searchText ?? String(o.label)).toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-sm text-left transition ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700'
            : error
            ? 'border-red-400 dark:border-red-500 hover:border-red-500 cursor-pointer'
            : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer'
        } ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full text-sm bg-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
          )}
          <div className="max-h-60 overflow-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">No matches</div>
            ) : (
              filteredOptions.map((option, idx) => {
                const isSelected = option.value === value;
                const prevGroup = idx > 0 ? filteredOptions[idx - 1].group : undefined;
                const showGroupHeader = !!option.group && option.group !== prevGroup;
                return (
                  <React.Fragment key={option.value}>
                    {showGroupHeader && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {option.group}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={option.disabled}
                      onClick={() => {
                        if (option.disabled) return;
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition ${
                        option.disabled
                          ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold cursor-pointer'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer'
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
