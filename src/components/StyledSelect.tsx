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

interface StyledSelectProps {
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
}

// Own component instance per open, since Flowbite's Dropdown fully unmounts
// its floating content on close (no controlled open/close prop is exposed to
// hook a "just opened" effect off of otherwise) - mounting this fresh each
// time an open happens IS that signal: it clears the parent's search filter
// and grabs focus exactly once per open, matching the old requestAnimationFrame
// behavior without needing Dropdown to expose its internal open state.
const SelectSearchBox: React.FC<{ onSearch: (value: string) => void }> = ({ onSearch }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onSearch('');
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--select-dropdown-border)] styled-select__search">
      <Search className="w-4 h-4 text-slate-400 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch(e.target.value);
        }}
        // flowbite-react's Dropdown wires Floating UI's useListNavigation +
        // useTypeahead onto the floating panel div that wraps this input
        // (see Dropdown.js) - useTypeahead treats every printable keydown
        // as "jump to the menu item starting with this letter" and calls
        // preventDefault() on it, which silently blocks the browser's
        // native text-insertion behavior here even though the input has
        // real focus (found 20 Aug 2026 - reported as "can't type in the
        // search box"). Stopping propagation at the input itself keeps the
        // keydown from ever reaching that ancestor handler, since
        // target-phase listeners run before bubble-phase ones.
        onKeyDown={(e) => e.stopPropagation()}
        placeholder={t('searchable_select_placeholder')}
        className="w-full bg-transparent outline-none text-[var(--input-text-default)] placeholder:text-slate-400 styled-select__search-input"
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
}) => {
  const [search, setSearch] = useState('');

  const selected = options.find((o) => o.value === value);

  const filteredOptions = searchable && search
    ? options.filter((o) => (o.searchText ?? String(o.label)).toLowerCase().includes(search.toLowerCase()))
    : options;

  const errorMessage = typeof error === 'string' ? error : undefined;

  return (
    <div className={`app-select-wrapper ${className} styled-select`}>
      {label && (
        // mb-2/mt-2 match Flowbite's own canonical form spacing (27 Aug 2026, same report
        // as Input.tsx's identical fix - see that file's comment for the full why).
        <div className="mb-2 block">
          <label
            htmlFor={id}
            className="app-label text-xs font-semibold text-slate-700 dark:text-slate-200"
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
        className="app-select-dropdown z-50 bg-[var(--select-dropdown-bg)] border border-[var(--select-dropdown-border)] rounded-lg shadow-lg overflow-hidden text-sm p-0 styled-select__dropdown"
        renderTrigger={() => (
          <button
            type="button"
            id={id}
            className={`app-select-button peer group w-full flex items-center justify-between gap-2 px-3.5 border transition-colors outline-none h-10 rounded-lg font-normal text-sm ${
              disabled
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-100'
                : error
                ? 'bg-gray-50 dark:bg-gray-700 border-red-500 focus:ring-4 focus:ring-red-200 dark:focus:ring-red-900 cursor-pointer text-gray-900 dark:text-white'
                : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:border-blue-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 cursor-pointer'
            } ${buttonClassName} styled-select__trigger form-field__select`}
          >
            <span className={`truncate text-inherit ${disabled ? 'text-gray-500 dark:text-gray-400' : selected ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} styled-select__value`}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform group-focus:rotate-180 styled-select__chevron ${disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`} />
          </button>
        )}
      >
        {searchable && <SelectSearchBox onSearch={setSearch} />}
        <div className="overflow-auto max-h-60 py-1 styled-select__options">
          {filteredOptions.length === 0 ? (
            <DropdownHeader className="px-3 py-2 text-[var(--input-placeholder)] normal-case tracking-normal font-normal styled-select__empty">
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
                    <DropdownHeader className="px-3 pt-2 pb-1 text-[10px] font-normal uppercase tracking-wide text-[var(--input-placeholder)] styled-select__group-header">
                      {option.group}
                    </DropdownHeader>
                  )}
                  <DropdownItem
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition styled-select__option ${
                      option.disabled
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : isSelected
                        ? 'bg-[var(--select-option-selected-bg)] text-[var(--select-option-selected-text)] font-normal cursor-pointer'
                        : 'text-[var(--input-text-default)] hover:bg-[var(--select-option-hover)] cursor-pointer'
                    }`}
                  >
                    <span className="truncate styled-select__option-label">{option.label}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0 styled-select__option-check" />}
                  </DropdownItem>
                </React.Fragment>
              );
            })
          )}
        </div>
      </Dropdown>
      {errorMessage && (
        <p className="app-error-text mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
        </p>
      )}
    </div>
  );
};
