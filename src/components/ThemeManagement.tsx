import React, { useState, useEffect } from 'react';
import { Alert, Card } from 'flowbite-react';
import { Button } from './Button';
import { Save, RotateCcw, Loader2, Palette, Moon, Type, Box, Sparkles } from './icons/FlowbiteIcons';
import { fetchThemeSettings, saveThemeSettings, applyThemeSettings, getDefaultTheme, ThemeSettings } from '../services/themeService';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';

export const ThemeManagement: React.FC = () => {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
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
    } catch {
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
        const msg = 'Theme settings saved and applied successfully!';
        setMessage({ type: 'success', text: msg });
        showToast(msg, { type: 'success' });
      } else {
        const msg = 'Failed to save theme settings';
        setMessage({ type: 'error', text: msg });
        showToast(msg, { type: 'error' });
      }
    } catch {
      const msg = 'Error saving theme settings';
      setMessage({ type: 'error', text: msg });
      showToast(msg, { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await confirm({
      title: t('reset_theme_title', 'Reset Theme Colors'),
      message: t('reset_theme_message', 'Reset to Tailwind default colors?'),
      confirmText: t('reset_theme_confirm', 'Reset Colors'),
      variant: 'warning',
    });
    if (confirmed) {
      // Was a hand-duplicated copy of getDefaultTheme() that had drifted
      // out of sync (found 19 Aug 2026) - its borderRadius values
      // (0.375rem/0.5rem/1rem) were the same wrong ones that used to live
      // in getDefaultTheme() before that got fixed, meaning clicking
      // "Reset to Default" here would have silently re-saved the bug even
      // after the shared default was corrected. Calling the shared
      // function instead of hand-typing a second copy means the two can't
      // drift apart again.
      const defaultTheme: ThemeSettings = getDefaultTheme();

      try {
        setIsSaving(true);
        const success = await saveThemeSettings(defaultTheme, '');
        if (success) {
          setSettings(defaultTheme);
          applyThemeSettings(defaultTheme);
          setMessage({ type: 'success', text: 'Theme reset to defaults!' });
        }
      } catch {
        setMessage({ type: 'error', text: 'Failed to reset theme' });
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('theme_settings_heading', 'Theme Settings')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('theme_settings_description', 'Customize the platform appearance for all users')}
        </p>
      </div>

      {/* Alert Message */}
      {message && (
        <Alert color={message.type === 'success' ? 'success' : 'failure'} onDismiss={() => setMessage(null)}>
          <span>{message.text}</span>
        </Alert>
      )}

      {/* Grid: Colors & Dark Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Brand Colors */}
        <Card className="border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
            <Palette className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('colors_section_label', 'Brand & Palette Colors')}
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {Object.entries(settings.colors).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => handleColorChange(`colors.${key}`, e.target.value)}
                    className="w-9 h-9 p-0.5 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer bg-white dark:bg-gray-700 shrink-0 shadow-2xs"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {key}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {value}
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleColorChange(`colors.${key}`, e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-xs font-mono rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-28 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white uppercase"
                  placeholder="#000000"
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Dark Mode Colors */}
        <Card className="border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
            <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('dark_mode_section_label', 'Dark Mode Colors')}
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {Object.entries(settings.darkMode).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => handleColorChange(`darkMode.${key}`, e.target.value)}
                    className="w-9 h-9 p-0.5 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer bg-white dark:bg-gray-700 shrink-0 shadow-2xs"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {value}
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleColorChange(`darkMode.${key}`, e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-xs font-mono rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-28 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white uppercase"
                  placeholder="#000000"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Grid: Typography & Border Radius */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Typography */}
        <Card className="border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
            <Type className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('typography_section_label', 'Typography')}
            </h3>
          </div>
          <div className="space-y-4 pt-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('font_family_label', 'Font Family')}
              </label>
              <input
                type="text"
                value={settings.typography.fontFamily}
                onChange={(e) => handleTextChange('typography.fontFamily', e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('base_font_size_label', 'Base Font Size')}
                </label>
                <input
                  type="text"
                  value={settings.typography.baseFontSize}
                  onChange={(e) => handleTextChange('typography.baseFontSize', e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('heading_scale_label', 'Heading Scale')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.typography.headingScale}
                  onChange={(e) => handleTextChange('typography.headingScale', e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Border Radius */}
        <Card className="border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
            <Box className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('border_radius_section_label', 'Border Radius')}
            </h3>
          </div>
          <div className="space-y-4 pt-1">
            {Object.entries(settings.borderRadius).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 capitalize">
                  {key}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleTextChange(`borderRadius.${key}`, e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Shadows */}
      <Card className="border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('shadows_section_label', 'Shadows')}
          </h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
          {Object.entries(settings.shadows).map(([key, value]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 capitalize">
                {key}
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => handleTextChange(`shadows.${key}`, e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-xs font-mono rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={isSaving}
          leftIcon={isSaving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
        >
          <span>{isSaving ? t('saving_ellipsis_button', 'Saving...') : t('save_settings_button', 'Save Settings')}</span>
        </Button>

        <Button
          variant="secondary"
          size="md"
          onClick={handleReset}
          disabled={isSaving}
          leftIcon={<RotateCcw className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />}
        >
          <span>{t('reset_button', 'Reset')}</span>
        </Button>
      </div>
    </div>
  );
};
