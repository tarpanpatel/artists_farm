import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, Alert, Toast, ToastToggle } from 'flowbite-react';
import { Paintbrush, Save, Copy, Check, Trash2, Download, Upload, Eye, Code, ChevronDown, ChevronUp, Palette, X, Lock, FLOWBITE_ICONS } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';
import { Input } from './Input';
import { Button } from './Button';
import { Badge } from './Badge';
import { Textarea } from './Textarea';

const STYLE_ID = 'artists-farm-custom-css-override';

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

const DEFAULT_CSS = `/* Ground Code — Custom CSS Override
   These rules are unlayered, so they already beat Tailwind utility classes;
   no force-priority flags are needed anywhere in the site. The override style
   block is injected after the main stylesheet, so anything here also wins the
   cascade.

   Empty by default (19 Aug 2026) - this used to ship with a global 14px
   text-size cap and a 600 font-weight cap on every heading, which flattened
   Flowbite's entire typography scale site-wide (a text-4xl heading computed
   identically to text-sm) and was the dominant reason headings/stat numbers
   never matched Flowbite's real reference sizing no matter how many
   individual component fixes were made. Removed so headings/large text
   render at their real size by default; add rules below only for an
   intentional, tenant-specific typography override.

   Examples:
   body { font-family: 'Inter', sans-serif; }
   .bg-white { background-color: #f8fafc; }
   .text-slate-900 { color: #1e293b; }
*/`;

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
  const [iconSearch, setIconSearch] = useState('');
  const [iconPage, setIconPage] = useState(1);
  const [selectedIcon, setSelectedIcon] = useState<IconEntry | null>(null);
  const [copiedIcon, setCopiedIcon] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // The full Flowbite icon catalog (444 outline+solid icons, already bundled
  // via FlowbiteIcons.tsx - no dynamic import/loading state needed, unlike
  // the old lucide-react version of this browser which had to import('lucide-react')
  // on demand since that library isn't otherwise part of the app bundle).
  const allIcons: IconEntry[] = useMemo(
    () =>
      Object.entries(FLOWBITE_ICONS)
        .map(([name, Component]) => ({ name, Component }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
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

  const handleCopyIconImport = useCallback((name: string) => {
    const text = `import { FLOWBITE_ICONS } from './icons/FlowbiteIcons';\nconst Icon = FLOWBITE_ICONS['${name}'];`;
    navigator.clipboard.writeText(text);
    setCopiedIcon(name);
    setTimeout(() => setCopiedIcon(null), 2000);
  }, []);

  const handleCopyIconJSX = useCallback((name: string) => {
    const text = `<Icon className="w-5 h-5" />`;
    navigator.clipboard.writeText(text);
    setCopiedIcon(name);
    setTimeout(() => setCopiedIcon(null), 2000);
  }, []);

  const hasChanges = css !== savedCss;

  // Only root admins can access this feature
  if (!isRootAdmin) {
    return (
      <div className="space-y-6 custom-css-override__root">
        <Alert color="failure" icon={Lock} className="custom-css-override__access-denied">
          <h3 className="custom-cssoverride__subtitle font-semibold mb-1">{t('access_restricted_heading', 'Access Restricted')}</h3>
          <p className="text-sm">
            {t('access_restricted_description', 'Only root administrators can modify system-wide settings like custom CSS and icon configurations. These changes apply to all properties under all tenants.')}
          </p>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 custom-css-override__root">
        <Card className="custom-css-override__loading">
          <p className="text-slate-600 dark:text-slate-400">{t('loading_system_settings_message', 'Loading system settings...')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 custom-css-override__root">
      {/* Header */}
      <Card className="custom-css-override__header">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="custom-cssoverride__title text-xl font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Paintbrush className="w-6 h-6 text-purple-600" />
              <span>{t('custom_css_override_title', 'Custom CSS Override')}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {t('custom_css_override_subtitle', 'Write custom CSS to override any site styling. Changes apply in real-time and persist across sessions.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isApplied && (
              <Badge variant="info" size="sm">
                                <Eye className="w-3 h-3" />
                                {t('live_badge', 'LIVE')}
                              </Badge>
            )}
            {lastSaved && (
              <span className="text-[10px] font-mono text-slate-400">
                Saved {lastSaved}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Editor */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden custom-css-override__editor">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 custom-css-override__toolbar">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('styles_css_label', 'styles.css')}</span>
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
            <Button variant="primary" size="sm" onClick={handleApply} leftIcon={<Eye className="w-3.5 h-3.5" />}>
                {t('preview_button', 'Preview')}
              </Button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm ${
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
            className="px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('reset_all_button', 'Reset All')}
          </button>
        </div>
      </div>

      {/* Flowbite Icon Browser (was the "Lucide Icon Browser" until the 22 Aug
          2026 "remove lucide-react site-wide" sweep - see FlowbiteIcons.tsx's
          own note on the retirement aliases. The old version dynamically
          import()'d lucide-react to enumerate ~1500 icons and injected a
          `.lucide { width/height/stroke-width/color }` global CSS rule to
          live-restyle every icon on the site - both mechanisms were entirely
          lucide-react-specific (the CSS keyed off a class lucide-react
          stamps on its own output) and had nothing left to do once
          lucide-react was removed. Rebuilt as a reference/lookup tool over
          the 444-icon FLOWBITE_ICONS catalog instead: no dynamic import
          needed (the catalog is already part of the app bundle), and no
          global size/stroke/color override, since Flowbite icons are
          rendered per-instance via Tailwind classes already, not through a
          single library-wide CSS hook the way lucide-react's `.lucide` class
          allowed. */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden custom-css-override__icon-browser">
        <button
          onClick={() => setShowIconBrowser(!showIconBrowser)}
          className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h3 className="custom-cssoverride__subtitle text-sm font-semibold text-slate-900 dark:text-white">{t('flowbite_icon_browser_title', 'Flowbite Icon Browser')}</h3>
              <p className="text-[11px] text-slate-500">
                {t('browse_copy_flowbite_message', 'Browse, search, and copy an import for any of the {count} icons used across the app.', { count: allIcons.length })}
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
            {/* Search */}
            <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder={t('search_icons_placeholder', 'Search icons by name... (e.g. arrow, home, user)')}
                  className="w-full"
                />
                {iconSearch && (
                  <button
                    type="button"
                    onClick={() => setIconSearch('')}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Icon Grid */}
            <div className="p-5">
              {filteredIcons.length === 0 ? (
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
                          className={`group relative flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950 border-2 border-blue-400 dark:border-blue-600 shadow-md'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-transparent'
                          }`}
                          title={icon.name}
                        >
                          <icon.Component className="w-6 h-6 text-slate-700 dark:text-slate-200" />
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
                        className="px-5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer transition-colors"
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
                  <div className="flex-shrink-0 w-28 h-28 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                    <selectedIcon.Component className="w-8 h-8 text-slate-700 dark:text-slate-200" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="custom-cssoverride__caption text-sm font-semibold text-slate-900 dark:text-white mb-1">{selectedIcon.name}</h4>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 w-16">{t('icon_import_label', 'Import:')}</span>
                        <code className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 truncate">
                          {`FLOWBITE_ICONS['${selectedIcon.name}']`}
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 w-16">{t('icon_jsx_label', 'JSX:')}</span>
                        <code className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-blue-600 dark:text-blue-400 truncate">
                          {`<Icon className="w-5 h-5" />`}
                        </code>
                      </div>
                    </div>

                    {/* Copy buttons */}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => handleCopyIconImport(selectedIcon.name)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
                      >
                        {copiedIcon === selectedIcon.name ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedIcon === selectedIcon.name ? t('copied_exclamation_button', 'Copied!') : t('copy_import_button', 'Copy Import')}
                      </button>
<Button variant="primary" size="sm" onClick={() => handleCopyIconJSX(selectedIcon.name)}>
                          {copiedIcon === selectedIcon.name ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedIcon === selectedIcon.name ? t('copied_exclamation_button', 'Copied!') : t('copy_jsx_button', 'Copy JSX')}
                        </Button>
<Button variant="primary" size="sm" onClick={() => setSelectedIcon(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Reference */}
      <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-3 custom-css-override__quick-reference">
        <h3 className="custom-cssoverride__subtitle text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="bg-purple-100 dark:bg-purple-950 text-purple-600 px-2 py-0.5 rounded-md text-[10px]">{t('tips_badge', 'TIPS')}</span>
          {t('common_css_overrides_heading', 'Common CSS Overrides')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('change_font_family_title', 'Change Font Family')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">body {'{'} font-family: 'Inter', sans-serif; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('sidebar_background_title', 'Sidebar Background')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">nav {'{'} background: #1a1a2e; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('card_border_radius_title', 'Card Border Radius')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">.rounded-lg {'{'} border-radius: 8px; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('button_styles_title', 'Button Styles')}</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">button {'{'} border-radius: 12px; {'}'}</code>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[9999] animate-toast-in custom-css-override__toast">
          <Toast className="border border-gray-200 dark:border-gray-700 shadow-xl bg-white dark:bg-gray-800">
            <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-500 dark:bg-green-800 dark:text-green-200">
              <Check className="w-5 h-5" />
              <span className="sr-only">Check icon</span>
            </div>
            <div className="ms-3 text-sm font-normal text-gray-900 dark:text-white">{toast}</div>
            <ToastToggle xIcon={X} onDismiss={() => setToast(null)} />
          </Toast>
        </div>
      )}
    </div>
  );
};

