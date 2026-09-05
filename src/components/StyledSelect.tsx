import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, AlertTriangle } from './icons/FlowbiteIcons';
import { Dropdown, DropdownItem, DropdownHeader } from 'flowbite-react';
import { t } from '../i18n/en';

export interface StyledSelectOption {
  value: string;
  label: React.ReactNode;
  searchText?: string;
  disabled?: boolean;
  group?: string;
}

export interface StyledSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: StyledSelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  error?: string | boolean;
  searchable?: boolean;
  id?: string;
  variant?: 'standard' | 'floating';
  bgMode?: 'modal' | 'page' | 'drawer' | 'card';
}

const SelectSearchBox: React.FC<{ onSearch: (value: string) => void }> = ({ onSearch }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onSearch('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 styled-select__search">
      <Search className="w-4 h-4 text-gray-400 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch(e.target.value);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder={t('searchable_select_placeholder')}
        className="w-full bg-transparent outline-none text-xs text-gray-900 dark:text-white placeholder:text-gray-400"
      />
    </div>
  );
};

export const StyledSelect: React.FC<StyledSelectProps> = ({
  label,
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
  variant = 'floating',
  bgMode = 'modal',
}) => {
  const [search, setSearch] = useState('');

  const selected = options.find((o) => o.value === value);

  const filteredOptions = searchable && search
    ? options.filter((o) => (o.searchText ?? String(o.label)).toLowerCase().includes(search.toLowerCase()))
    : options;

  const errorMessage = typeof error === 'string' ? error : undefined;

  const isFloating = Boolean(label) && variant === 'floating';

  const bgToken =
    bgMode === 'page'
      ? 'bg-white dark:bg-gray-900'
      : bgMode === 'card'
      ? 'bg-gray-50 dark:bg-gray-800'
      : 'bg-white dark:bg-gray-800';

  return (
    <div className={`app-select-wrapper ${className} styled-select relative w-full min-w-0`}>
      {!isFloating && label && (
        <div className="mb-1.5 block">
          <label
            htmlFor={id}
            className={`app-label text-xs font-semibold ${
              disabled ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed' : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {label}
          </label>
        </div>
      )}
      <Dropdown
        placement="bottom-start"
        disabled={disabled}
        dismissOnClick
        label=""
        className="app-select-dropdown z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden text-xs p-0 styled-select__dropdown"
        renderTrigger={() => (
          <button
            type="button"
            id={id}
            disabled={disabled}
            className={`app-select-button peer group w-full flex items-center justify-between gap-2 px-2.5 border rounded-lg transition-colors outline-none ${
              isFloating ? 'pb-2.5 pt-4 bg-transparent text-sm' : 'h-10 bg-white dark:bg-gray-800 text-xs px-3'
            } ${
              disabled
                ? 'bg-gray-100 dark:bg-gray-800/90 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                : error
                ? 'border-red-600 dark:border-red-500 text-red-900 dark:text-white cursor-pointer'
                : 'border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:border-blue-600 focus:border-blue-600 cursor-pointer'
            } ${buttonClassName}`}
          >
            <span className={`truncate text-inherit ${disabled ? 'text-gray-400 dark:text-gray-500' : selected ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
              {selected ? selected.label : (isFloating ? ' ' : placeholder)}
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform group-focus:rotate-180 ${disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-400 dark:text-gray-500'}`} />
          </button>
        )}
      >
        {searchable && <SelectSearchBox onSearch={setSearch} />}
        <div className="overflow-auto max-h-60 py-1 styled-select__options">
          {filteredOptions.length === 0 ? (
            <DropdownHeader className="px-3 py-2 text-gray-400 normal-case tracking-normal font-normal">
              {t('no_matches_text')}
            </DropdownHeader>
          ) : (
            filteredOptions.map((option, idx) => {
              const isSelected = option.value === value;
              const prevGroup = idx > 0 ? filteredOptions[idx - 1].group : undefined;
              const showGroupHeader = !!option.group && option.group !== prevGroup;
              return (
                <React.Fragment key={option.value}>
                  {showGroupHeader && (
                    <DropdownHeader className="px-3 pt-2 pb-1 text-[10px] font-normal uppercase tracking-wide text-gray-400">
                      {option.group}
                    </DropdownHeader>
                  )}
                  <DropdownItem
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition text-xs ${
                      option.disabled
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold cursor-pointer'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
                  </DropdownItem>
                </React.Fragment>
              );
            })
          )}
        </div>
      </Dropdown>
      {isFloating && label && (
        <label
          className={`absolute text-sm duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] px-2 start-2 pointer-events-none transition-all ${bgToken} ${
            disabled
              ? 'text-gray-400 dark:text-gray-500'
              : error
              ? 'text-red-600 dark:text-red-500'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {label}
        </label>
      )}
      {errorMessage && (
        <p className="app-error-text mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
        </p>
      )}
    </div>
  );
};
