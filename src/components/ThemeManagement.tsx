import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Loader } from 'lucide-react';
import { fetchThemeSettings, saveThemeSettings, applyThemeSettings, ThemeSettings } from '../services/themeService';
import { useConfirm } from './ConfirmDialogContext';

export const ThemeManagement: React.FC = () => {
  const { confirm } = useConfirm();
  const [settings, setSettings] = useState<ThemeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadThemeSettings();
  }, []);

  const loadThemeSettings = async () => {
    try {
      setIsLoading(true);
      const themeSettings = await fetchThemeSettings();
      setSettings(themeSettings);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load theme settings' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleColorChange = (path: string, value: string) => {
    if (!settings) return;

    const newSettings = { ...settings };
    const keys = path.split('.');
    let current: any = newSettings;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  const handleTextChange = (path: string, value: string) => {
    if (!settings) return;

    const newSettings = { ...settings };
    const keys = path.split('.');
    let current: any = newSettings;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      const success = await saveThemeSettings(settings, '');

      if (success) {
        applyThemeSettings(settings);
        setMessage({ type: 'success', text: 'Theme settings saved and applied successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save theme settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving theme settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await confirm({
      title: 'Reset Theme Colors',
      message: 'Reset to Tailwind default colors?',
      confirmText: 'Reset Colors',
      variant: 'warning',
    });
    if (confirmed) {
      const defaultTheme: ThemeSettings = {
        colors: {
          primary: '#3b82f6',
          secondary: '#1e293b',
          accent: '#06b6d4',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#0284c7',
        },
        darkMode: {
          background: '#0f172a',
          surface: '#1e293b',
          text: '#f1f5f9',
          textMuted: '#94a3b8',
        },
        typography: {
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
          baseFontSize: '16px',
          headingScale: 1.2,
        },
        spacing: {
          baseUnit: '4px',
        },
        borderRadius: {
          small: '0.375rem',
          medium: '0.5rem',
          large: '1rem',
        },
        shadows: {
          small: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
          medium: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          large: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
        },
      };

      setSettings(defaultTheme);

      // Save the defaults
      try {
        setIsSaving(true);
        const success = await saveThemeSettings(defaultTheme, '');
        if (success) {
          applyThemeSettings(defaultTheme);
          setMessage({ type: 'success', text: 'Reset to Tailwind default colors!' });
        } else {
          setMessage({ type: 'error', text: 'Failed to save defaults' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Error resetting theme' });
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Theme Settings</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Customize the platform appearance for all users
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Colors */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Colors</h3>
          <div className="space-y-3">
            {Object.entries(settings.colors).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-24 capitalize">
                  {key}
                </label>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => handleColorChange(`colors.${key}`, e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleColorChange(`colors.${key}`, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm"
                    placeholder="#000000"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dark Mode Colors */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Dark Mode</h3>
          <div className="space-y-3">
            {Object.entries(settings.darkMode).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-32 capitalize">
                  {key.replace(/([A-Z])/g, ' $1')}
                </label>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => handleColorChange(`darkMode.${key}`, e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleColorChange(`darkMode.${key}`, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm"
                    placeholder="#000000"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Typography */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Typography</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Font Family
              </label>
              <input
                type="text"
                value={settings.typography.fontFamily}
                onChange={(e) => handleTextChange('typography.fontFamily', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base Font Size
              </label>
              <input
                type="text"
                value={settings.typography.baseFontSize}
                onChange={(e) => handleTextChange('typography.baseFontSize', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Heading Scale
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.typography.headingScale}
                onChange={(e) => handleTextChange('typography.headingScale', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Border Radius */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Border Radius</h3>
          <div className="space-y-3">
            {Object.entries(settings.borderRadius).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                  {key}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleTextChange(`borderRadius.${key}`, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shadows */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Shadows</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Object.entries(settings.shadows).map(([key, value]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                {key}
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => handleTextChange(`shadows.${key}`, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-6 border-t border-gray-200 dark:border-slate-700">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
        >
          {isSaving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-slate-600 dark:hover:bg-slate-700 disabled:opacity-50 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>
    </div>
  );
};
