import React from 'react';

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  enabled,
  onChange,
  disabled = false,
  label,
}) => {
  return (
    <label className="app-toggle-wrapper flex items-center gap-2.5 cursor-pointer select-none toggle-switch">
      <button
        type="button"
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={`app-toggle-switch relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled
            ? 'bg-blue-600 dark:bg-blue-500'
            : 'bg-slate-300 dark:bg-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} toggle-switch__track`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`app-toggle-thumb pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          } toggle-switch__thumb`}
        />
      </button>
      {label && (
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 toggle-switch__label">
          {label}
        </span>
      )}
    </label>
  );
};
