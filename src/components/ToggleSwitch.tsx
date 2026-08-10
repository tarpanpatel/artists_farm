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
    <div className="app-toggle-wrapper flex items-center gap-2">
      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={`app-toggle-switch relative inline-flex h-6 w-11 items-center rounded-full transition-colors overflow-visible ${
          enabled
            ? 'bg-blue-600 dark:bg-blue-500'
            : 'bg-gray-300 dark:bg-gray-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`app-toggle-thumb absolute h-4 w-4 rounded-full bg-white shadow-md transition-all ${
            enabled ? 'translate-x-5 left-1' : 'translate-x-0.5 left-0'
          }`}
        />
      </button>
      {label && (
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
      )}
    </div>
  );
};
