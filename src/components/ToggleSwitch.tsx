import React from 'react';

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  enabled,
  onChange,
  disabled = false,
  label,
  className = '',
}) => {
  return (
    <label className={`inline-flex items-center select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onChange(!enabled);
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 ${
          enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label && (
        <span className="ms-2.5 text-xs font-medium text-slate-900 dark:text-slate-300">
          {label}
        </span>
      )}
    </label>
  );
};

