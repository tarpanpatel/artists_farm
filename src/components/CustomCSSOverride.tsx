import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Paintbrush, Save, RotateCcw, Copy, Check, Trash2, Download, Upload, Eye, Code, Search, ChevronDown, ChevronUp, Palette, Minus, Plus, X, Lock, Loader2 } from 'lucide-react';
import { t } from '../i18n/en';
import { Input } from './Input';
import { Textarea } from './Textarea';

const STYLE_ID = 'artists-farm-custom-css-override';
const LUCIDE_STORAGE_KEY = 'artists_farm_lucide_settings';
const LUCIDE_STYLE_ID = 'artists-farm-lucide-global';

const DEFAULT_LUCIDE = { size: 24, strokeWidth: 2, color: '#334155' };

interface CustomCSSOverrideProps {
  activeRole?: string;
}

function injectCSS(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function removeCSS() {
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
}

function injectLucideGlobal(size: number, strokeWidth: number, color: string) {
  let el = document.getElementById(LUCIDE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = LUCIDE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `
    .lucide { width: ${size}px; height: ${size}px; stroke-width: ${strokeWidth}; color: ${color}; }
  `;
}

function removeLucideGlobal() {
  const el = document.getElementById(LUCIDE_STYLE_ID);
  if (el) el.remove();
}

const DEFAULT_CSS = `/* Artists Farm — Custom CSS Override
   Base typography rules are defined below so they can be tuned from this page.
   These rules are unlayered, so they already beat Tailwind utility classes;
   no force-priority flags are needed anywhere in the site. The override style
   block is injected after the main stylesheet, so anything here also wins the
   cascade.

   Edit the values below to restyle headings, labels and emphasis site-wide.
*/

/* Global Font Weight Mapping: caps font weights at 600 (semibold) system-wide */
.font-bold,
.font-extrabold,
.font-black,
strong,
b,
h1,
h2,
h3,
h4,
h5,
h6,
label {
  font-weight: 600;
}

/* Global Font Size Constraint: no heading or text element exceeds 16px (1rem) regardless of screen size */
h1, h2, h3, h4, h5, h6,
.text-4xl, .text-3xl, .text-2xl, .text-xl, .text-lg,
.md\\:text-4xl, .md\\:text-3xl, .md\\:text-2xl, .md\\:text-xl, .md\\:text-lg,
.lg\\:text-4xl, .lg\\:text-3xl, .lg\\:text-2xl, .lg\\:text-xl, .lg\\:text-lg,
.sm\\:text-4xl, .sm\\:text-3xl, .sm\\:text-2xl, .sm\\:text-xl, .sm\\:text-lg {
  font-size: 16px;
  line-height: 1.35;
}

/* Examples:
   body { font-family: 'Inter', sans-serif; }
   .bg-white { background-color: #f8fafc; }
   .text-slate-900 { color: #1e293b; }
*/`;

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#0ea5e9',
  '#14b8a6', '#a855f7', '#f43f5e', '#84cc16',
];

const ICONS_PER_PAGE = 120;

interface IconEntry {
  name: string;
  Component: React.ComponentType<any>;
}

export const CustomCSSOverride: React.FC<CustomCSSOverrideProps> = ({ activeRole = '' }) => {
  const isRootAdmin = activeRole?.toLowerCase().trim() === 'root admin';

  const [css, setCss] = useState<string>('');
  const [savedCss, setSavedCss] = useState<string>('');
  const [isApplied, setIsApplied] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Icon browser state
  const [showIconBrowser, setShowIconBrowser] = useState(false);
  const [allIcons, setAllIcons] = useState<IconEntry[]>([]);
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [iconSize, setIconSize] = useState(DEFAULT_LUCIDE.size);
  const [iconStroke, setIconStroke] = useState(DEFAULT_LUCIDE.strokeWidth);
  const [iconColor, setIconColor] = useState(DEFAULT_LUCIDE.color);
  const [iconPage, setIconPage] = useState(1);
  const [selectedIcon, setSelectedIcon] = useState<IconEntry | null>(null);
  const [copiedIcon, setCopiedIcon] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState(DEFAULT_LUCIDE.color);
  const [lucideSaved, setLucideSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const iconBrowserRef = useRef<HTMLDivElement>(null);

  // Load system settings from API on mount
  useEffect(() => {
    if (!isRootAdmin) {
      setLoading(false);
      return;
    }

    const loadSettings = async () => {
      try {
        const response = await fetch(`/php/api/router.php?action=get_system_settings`, {
          credentials: 'include',
        });
        const data = await response.json();

        if (data.status === 'success' && data.data) {
          const settings = data.data;
          if (settings.custom_css && settings.custom_css !== DEFAULT_CSS) {
            setCss(settings.custom_css);
            setSavedCss(settings.custom_css);
            injectCSS(settings.custom_css);
            setIsApplied(true);
            setLastSaved(new Date().toLocaleTimeString());
          } else {
            setCss(DEFAULT_CSS);
            setSavedCss(DEFAULT_CSS);
          }

          if (settings.lucide_settings) {
            try {
              const lucide = JSON.parse(settings.lucide_settings);
              setIconSize(lucide.size ?? DEFAULT_LUCIDE.size);
              setIconStroke(lucide.strokeWidth ?? DEFAULT_LUCIDE.strokeWidth);
              setIconColor(lucide.color ?? DEFAULT_LUCIDE.color);
              setCustomColor(lucide.color ?? DEFAULT_LUCIDE.color);
              setLucideSaved(true);
              injectLucideGlobal(lucide.size, lucide.strokeWidth, lucide.color);
            } catch (e) {
              console.error('Failed to parse lucide settings:', e);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load system settings:', err);
        setCss(DEFAULT_CSS);
        setSavedCss(DEFAULT_CSS);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [isRootAdmin]);

  // Load saved Lucide icon settings on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LUCIDE_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const s = saved.size ?? DEFAULT_LUCIDE.size;
        const sw = saved.strokeWidth ?? DEFAULT_LUCIDE.strokeWidth;
        const c = saved.color ?? DEFAULT_LUCIDE.color;
        setIconSize(s);
        setIconStroke(sw);
        setIconColor(c);
        setCustomColor(c);
        setLucideSaved(true);
        injectLucideGlobal(s, sw, c);
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // Dynamic import of all Lucide icons when browser is opened
  useEffect(() => {
    if (showIconBrowser && !iconsLoaded) {
      import('lucide-react').then((mod) => {
        const icons: IconEntry[] = [];
        Object.keys(mod).forEach((k) => {
          if (
            k[0] === k[0].toUpperCase() &&
            k.length > 1 &&
            !k.endsWith('Icon') &&
            !k.startsWith('create') &&
            !k.startsWith('default') &&
            typeof (mod as any)[k] === 'object' &&
            (mod as any)[k]?.render
          ) {
            icons.push({ name: k, Component: (mod as any)[k] });
          }
        });
        icons.sort((a, b) => a.name.localeCompare(b.name));
        setAllIcons(icons);
        setIconsLoaded(true);
      });
    }
  }, [showIconBrowser, iconsLoaded]);

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return allIcons;
    const q = iconSearch.toLowerCase().trim();
    return allIcons.filter((icon) => icon.name.toLowerCase().includes(q));
  }, [allIcons, iconSearch]);

  const totalPages = Math.ceil(filteredIcons.length / ICONS_PER_PAGE);
  const visibleIcons = filteredIcons.slice(0, iconPage * ICONS_PER_PAGE);

  // Reset page when search changes
  useEffect(() => {
    setIconPage(1);
  }, [iconSearch]);

  const handleApply = () => {
    injectCSS(css);
    setIsApplied(true);
  };

  const handleSave = async () => {
    if (!isRootAdmin) return;
    try {
      const response = await fetch(`/php/api/router.php?action=save_system_settings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'root_admin',
        },
        body: JSON.stringify({ setting_key: 'custom_css', setting_value: css }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        injectCSS(css);
        setSavedCss(css);
        setIsApplied(true);
        setLastSaved(new Date().toLocaleTimeString());
        setToast('CSS saved successfully to all properties');
        setTimeout(() => setToast(null), 2500);
      } else {
        setToast('Failed to save CSS');
        setTimeout(() => setToast(null), 2500);
      }
    } catch (err) {
      console.error('Failed to save CSS:', err);
      setToast('Error saving CSS');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleReset = async () => {
    if (!isRootAdmin) return;
    try {
      const response = await fetch(`/php/api/router.php?action=save_system_settings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'root_admin',
        },
        body: JSON.stringify({ setting_key: 'custom_css', setting_value: DEFAULT_CSS }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setCss(DEFAULT_CSS);
        removeCSS();
        setSavedCss(DEFAULT_CSS);
        setIsApplied(false);
        setLastSaved('');
        setToast('CSS reset to default for all properties');
        setTimeout(() => setToast(null), 2500);
      }
    } catch (err) {
      console.error('Failed to reset CSS:', err);
      setToast('Error resetting CSS');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const blob = new Blob([css], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artists-farm-custom-override.css';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCss(text);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLucideSave = async () => {
    if (!isRootAdmin) return;
    try {
      const data = { size: iconSize, strokeWidth: iconStroke, color: iconColor };
      const response = await fetch(`/php/api/router.php?action=save_system_settings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'root_admin',
        },
        body: JSON.stringify({ setting_key: 'lucide_settings', setting_value: JSON.stringify(data) }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        injectLucideGlobal(iconSize, iconStroke, iconColor);
        setLucideSaved(true);
        setToast('Icon settings applied to all properties');
        setTimeout(() => setToast(null), 2500);
      }
    } catch (err) {
      console.error('Failed to save icon settings:', err);
      setToast('Error saving icon settings');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleLucideReset = async () => {
    if (!isRootAdmin) return;
    try {
      const response = await fetch(`/php/api/router.php?action=save_system_settings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'root_admin',
        },
        body: JSON.stringify({ setting_key: 'lucide_settings', setting_value: JSON.stringify(DEFAULT_LUCIDE) }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        setIconSize(DEFAULT_LUCIDE.size);
        setIconStroke(DEFAULT_LUCIDE.strokeWidth);
        setIconColor(DEFAULT_LUCIDE.color);
        setCustomColor(DEFAULT_LUCIDE.color);
        removeLucideGlobal();
        setLucideSaved(false);
        setToast('Icon settings reset for all properties');
        setTimeout(() => setToast(null), 2500);
      }
    } catch (err) {
      console.error('Failed to reset icon settings:', err);
      setToast('Error resetting icon settings');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleCopyIconImport = useCallback((name: string) => {
    const text = `import { ${name} } from 'lucide-react';`;
    navigator.clipboard.writeText(text);
    setCopiedIcon(name);
    setTimeout(() => setCopiedIcon(null), 2000);
  }, []);

  const handleCopyIconJSX = useCallback((name: string) => {
    const text = `<${name} className="w-${Math.round(iconSize / 4)} h-${Math.round(iconSize / 4)}" />`;
    navigator.clipboard.writeText(text);
    setCopiedIcon(name);
    setTimeout(() => setCopiedIcon(null), 2000);
  }, [iconSize]);

  const hasChanges = css !== savedCss;

  // Only root admins can access this feature
  if (!isRootAdmin) {
    return (
      <div className="space-y-6 custom-css-override__root">
        <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-800 p-6 flex items-start gap-4 custom-css-override__access-denied">
          <Lock className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-900 dark:text-red-100 mb-1">{t('access_restricted_heading', 'Access Restricted')}</h3>
            <p className="text-sm text-red-800 dark:text-red-300">
              {t('access_restricted_description', 'Only root administrators can modify system-wide settings like custom CSS and icon configurations. These changes apply to all properties under all tenants.')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 custom-css-override__root">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 custom-css-override__loading">
          <p className="text-slate-600 dark:text-slate-400">{t('loading_system_settings_message', 'Loading system settings...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 custom-css-override__root">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs custom-css-override__header">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Paintbrush className="w-6 h-6 text-purple-600" />
              <span>{t('custom_css_override_title', 'Custom CSS Override')}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {t('custom_css_override_subtitle', 'Write custom CSS to override any site styling. Changes apply in real-time and persist across sessions.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isApplied && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                <Eye className="w-3 h-3" />
                {t('live_badge', 'LIVE')}
              </span>
            )}
            {lastSaved && (
              <span className="text-[10px] font-mono text-slate-400">
                Saved {lastSaved}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden custom-css-override__editor">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 custom-css-override__toolbar">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{t('styles_css_label', 'styles.css')}</span>
            {hasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title={t('unsaved_changes_tooltip', 'Unsaved changes')} />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              title={t('import_css_file_tooltip', 'Import CSS file')}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".css,.txt"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              title={t('export_css_file_tooltip', 'Export as .css file')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              title={t('copy_to_clipboard_tooltip', 'Copy to clipboard')}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="relative custom-css-override__textarea-wrapper">
          <Textarea
            ref={textareaRef}
            value={css}
            onChange={(e) => setCss(e.target.value)}
            spellCheck={false}
            className="w-full h-[480px] p-4 font-mono text-xs leading-relaxed text-emerald-700 dark:text-emerald-300 bg-white dark:bg-[#0d1117] resize-none focus:outline-none"
            placeholder={t('css_editor_placeholder', '/* Write your custom CSS here */')}
            style={{ tabSize: 2 }}
          />
          <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-300 dark:text-slate-600">
            {css.split('\n').length} lines | {css.length} chars
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 custom-css-override__action-bar">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Eye className="w-3.5 h-3.5" />
              {t('preview_button', 'Preview')}
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm ${
                hasChanges
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              {hasChanges ? t('save_and_apply_button', 'Save & Apply') : t('saved_button', 'Saved')}
            </button>
          </div>
          <button
            onClick={handleReset}
            className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('reset_all_button', 'Reset All')}
          </button>
        </div>
      </div>

      {/* Lucide Icon Browser */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden custom-css-override__icon-browser">
        <button
          onClick={() => setShowIconBrowser(!showIconBrowser)}
          className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('lucide_icon_browser_title', 'Lucide Icon Browser')}</h3>
              <p className="text-[11px] text-slate-500">
                {iconsLoaded ? `${allIcons.length} icons available` : t('browse_copy_lucide_message', 'Browse, customize, and copy the complete Lucide icon library')}
              </p>
            </div>
          </div>
          {showIconBrowser ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showIconBrowser && (
          <div ref={iconBrowserRef} className="border-t border-slate-200 dark:border-slate-700">
            {/* Customization Controls */}
            <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Size */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>{t('icon_size_label', 'Size')}</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">{iconSize}px</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIconSize(Math.max(8, iconSize - 2))}
                      className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <Input
                      type="range"
                      min="8"
                      max="64"
                      value={iconSize}
                      onChange={(e) => setIconSize(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <button
                      onClick={() => setIconSize(Math.min(64, iconSize + 2))}
                      className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Stroke Width */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>{t('icon_stroke_width_label', 'Stroke Width')}</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">{iconStroke}px</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIconStroke(Math.max(0.5, +(iconStroke - 0.25).toFixed(2)))}
                      className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <Input
                      type="range"
                      min="0.5"
                      max="4"
                      step="0.25"
                      value={iconStroke}
                      onChange={(e) => setIconStroke(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <button
                      onClick={() => setIconStroke(Math.min(4, +(iconStroke + 0.25).toFixed(2)))}
                      className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Color */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {t('icon_color_label', 'Color')}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setIconColor(c); setCustomColor(c); }}
                        className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
                          iconColor === c ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800' : 'border-slate-200 dark:border-slate-600'
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    <div className="relative">
                      <Input
                        type="color"
                        value={customColor}
                        onChange={(e) => { setCustomColor(e.target.value); setIconColor(e.target.value); }}
                        className="w-5 h-5 rounded-full border-2 border-slate-200 dark:border-slate-600 cursor-pointer appearance-none bg-transparent"
                        title={t('custom_color_tooltip', 'Custom color')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save / Reset Buttons */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleLucideSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {t('save_apply_site_wide_button', 'Save & Apply Site-Wide')}
                </button>
                <button
                  onClick={handleLucideReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t('reset_to_defaults_button', 'Reset to Defaults')}
                </button>
                {lucideSaved && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 ml-1">
                    <Eye className="w-2.5 h-2.5" /> {t('active_badge', 'ACTIVE')}
                  </span>
                )}
              </div>

              {/* Search */}
              <div className="mt-3 relative">
                <Input
                  type="text"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder={t('search_icons_placeholder', 'Search icons by name... (e.g. arrow, home, user)')}
                  leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                  className="pr-9"
                />
                {iconSearch && (
                  <button
                    onClick={() => setIconSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Icon Grid */}
            <div className="p-5">
              {!iconsLoaded ? (
                <div className="text-center py-16">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-xs text-slate-400 font-medium">{t('loading_lucide_library_message', 'Loading complete Lucide library...')}</p>
                </div>
              ) : filteredIcons.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-sm text-slate-400 font-semibold">No icons match "{iconSearch}"</p>
                </div>
              ) : (
                <>
                  <div className="text-[10px] text-slate-400 mb-3 font-mono">
                    Showing {visibleIcons.length} of {filteredIcons.length} icons
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1">
                    {visibleIcons.map((icon) => {
                      const isSelected = selectedIcon?.name === icon.name;
                      return (
                        <button
                          key={icon.name}
                          onClick={() => setSelectedIcon(isSelected ? null : icon)}
                          className={`group relative flex flex-col items-center justify-center p-2 rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950 border-2 border-blue-400 dark:border-blue-600 shadow-md'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-transparent'
                          }`}
                          title={icon.name}
                        >
                          <icon.Component
                            size={iconSize > 32 ? 32 : iconSize}
                            strokeWidth={iconStroke}
                            color={iconColor}
                          />
                          <span className="text-[8px] mt-1 text-slate-400 dark:text-slate-500 font-medium truncate w-full text-center leading-tight">
                            {icon.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {iconPage < totalPages && (
                    <div className="text-center mt-4">
                      <button
                        onClick={() => setIconPage((p) => p + 1)}
                        className="px-5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer transition-colors"
                      >
                        Load More ({filteredIcons.length - visibleIcons.length} remaining)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Selected Icon Detail Panel */}
            {selectedIcon && (
              <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-5 py-4">
                <div className="flex items-start gap-5">
                  {/* Preview */}
                  <div className="flex-shrink-0 w-28 h-28 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                    <selectedIcon.Component
                      size={iconSize}
                      strokeWidth={iconStroke}
                      color={iconColor}
                    />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white mb-1">{selectedIcon.name}</h4>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 w-16">{t('icon_import_label', 'Import:')}</span>
                        <code className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 truncate">
                          {`import { ${selectedIcon.name} } from 'lucide-react'`}
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 w-16">{t('icon_jsx_label', 'JSX:')}</span>
                        <code className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-blue-600 dark:text-blue-400 truncate">
                          {`<${selectedIcon.name} size={${iconSize}} strokeWidth={${iconStroke}} color="${iconColor}" />`}
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 w-16">{t('icon_size_detail_label', 'Size:')}</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300">{iconSize}px</span>
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <span className="text-slate-400">{t('icon_stroke_detail_label', 'Stroke:')}</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300">{iconStroke}</span>
                      </div>
                    </div>

                    {/* Copy buttons */}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => handleCopyIconImport(selectedIcon.name)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
                      >
                        {copiedIcon === selectedIcon.name ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedIcon === selectedIcon.name ? t('copied_exclamation_button', 'Copied!') : t('copy_import_button', 'Copy Import')}
                      </button>
                      <button
                        onClick={() => handleCopyIconJSX(selectedIcon.name)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
                      >
                        {copiedIcon === selectedIcon.name ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedIcon === selectedIcon.name ? t('copied_exclamation_button', 'Copied!') : t('copy_jsx_button', 'Copy JSX')}
                      </button>
                      <button
                        onClick={() => setSelectedIcon(null)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Reference */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3 custom-css-override__quick-reference">
        <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="bg-purple-100 dark:bg-purple-950 text-purple-600 px-2 py-0.5 rounded-md text-[10px]">{t('tips_badge', 'TIPS')}</span>
          {t('common_css_overrides_heading', 'Common CSS Overrides')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">{t('change_font_family_title', 'Change Font Family')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">body {'{'} font-family: 'Inter', sans-serif; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">{t('sidebar_background_title', 'Sidebar Background')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">nav {'{'} background: #1a1a2e; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">{t('card_border_radius_title', 'Card Border Radius')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">.rounded-2xl {'{'} border-radius: 8px; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">{t('button_styles_title', 'Button Styles')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">button {'{'} border-radius: 12px; {'}'}</code>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg animate-toast-in custom-css-override__toast">
          {toast}
        </div>
      )}
    </div>
  );
};
