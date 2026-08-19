import React from 'react';
import { ToggleSwitch as FlowbiteToggleSwitch, createTheme } from 'flowbite-react';

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  label?: string;
}

// Literal stock Flowbite tokens (19 Aug 2026: per-tenant branding dropped
// site-wide) - just a thin size/label tweak over Flowbite's own defaults.
const toggleTheme = createTheme({
  root: {
    label: 'ms-2.5 text-xs font-medium text-gray-900 dark:text-gray-300',
  },
});

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  enabled,
  onChange,
  disabled = false,
  label,
}) => {
  return (
    <FlowbiteToggleSwitch
      theme={toggleTheme}
      checked={enabled}
      onChange={onChange}
      disabled={disabled}
      label={label}
      color="blue"
      className="app-toggle-wrapper toggle-switch"
    />
  );
};
