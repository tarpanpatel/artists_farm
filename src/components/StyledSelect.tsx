import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { t } from '../i18n/en';

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
  buttonClassName?: string;
  disabled?: boolean;
  error?: boolean;
  searchable?: boolean;
  id?: string;
}

export const StyledSelect: React.FC<StyledSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = t('styled_select_placeholder'),
  className = '',
  buttonClassName = '',
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
    <div className={`app-select-wrapper relative ${className} styled-select`} ref={containerRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`app-select-button w-full flex items-center justify-between gap-2 px-3.5 border transition-all duration-200 outline-none ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-[var(--select-border-default)] text-[var(--input-text-disabled)]'
            : error
            ? 'border-[var(--input-border-error)] focus:ring-4 focus:ring-[var(--input-ring-error)] cursor-pointer'
            : buttonClassName.includes('border-slate-200')
            ? 'border-[var(--select-border-default)] hover:border-[var(--select-border-hover)] cursor-pointer'
            : 'border-[var(--select-border-default)] hover:border-[var(--select-border-hover)] focus:border-[var(--select-border-focus)] focus:ring-4 focus:ring-[var(--select-ring-focus)] cursor-pointer'
        } ${isOpen && !buttonClassName.includes('ring-blue') ? 'border-[var(--select-border-focus)] ring-4 ring-[var(--select-ring-focus)]' : ''} ${
          isOpen && buttonClassName.includes('ring-blue') ? 'border-blue-500 ring-2 ring-blue-500/20' : ''
        } ${/(^|\s)(!?)h-/.test(buttonClassName) ? '' : 'h-10'} ${/(^|\s)(!?)rounded-/.test(buttonClassName) ? '' : 'rounded-lg'} ${
          /(^|\s)(!?)font-/.test(buttonClassName) ? '' : 'font-normal'
        } ${
          /(^|\s)(!?)text-/.test(buttonClassName)
            ? '' 
            : 'text-xs'
        } ${buttonClassName} styled-select__trigger`}
      >
        <span className={`truncate text-inherit ${selected ? 'text-[var(--input-text-default)]' : 'text-[var(--input-placeholder)]'} styled-select__value`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--input-placeholder)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} styled-select__chevron`}
        />
      </button>

      {isOpen && (
        <div className="app-select-dropdown absolute z-50 mt-1 w-full bg-[var(--select-dropdown-bg)] border border-[var(--select-dropdown-border)] rounded-lg shadow-lg overflow-hidden text-sm styled-select__dropdown">
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--select-dropdown-border)] styled-select__search">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                 placeholder={t('searchable_select_placeholder')}
                className="w-full bg-transparent outline-none text-[var(--input-text-default)] placeholder:text-slate-400 styled-select__search-input"
              />
            </div>
          )}
          <div className="max-h-60 overflow-auto py-1 styled-select__options">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-[var(--input-placeholder)] styled-select__empty">{t('no_matches_text')}</div>
            ) : (
              filteredOptions.map((option, idx) => {
                const isSelected = option.value === value;
                const prevGroup = idx > 0 ? filteredOptions[idx - 1].group : undefined;
                const showGroupHeader = !!option.group && option.group !== prevGroup;
                return (
                  <React.Fragment key={option.value}>
                    {showGroupHeader && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--input-placeholder)] styled-select__group-header">
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
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition styled-select__option ${
                        option.disabled
                          ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                          : isSelected
                          ? 'bg-[var(--select-option-selected-bg)] text-[var(--select-option-selected-text)] font-semibold cursor-pointer'
                          : 'text-[var(--input-text-default)] hover:bg-[var(--select-option-hover)] cursor-pointer'
                      }`}
                    >
                      <span className="truncate styled-select__option-label">{option.label}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0 styled-select__option-check" />}
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


