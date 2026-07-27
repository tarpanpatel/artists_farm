import React, { useState, useEffect, useRef } from 'react';
import { Paintbrush, Save, RotateCcw, Copy, Check, Trash2, Download, Upload, Eye, Code } from 'lucide-react';

const STORAGE_KEY = 'artists_farm_custom_css';
const STYLE_ID = 'artists-farm-custom-css-override';

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

const DEFAULT_CSS = `/* Artists Farm — Custom CSS Override
   Edit below to override any site styling.
   
   Examples:
   
   body {
     font-family: 'Inter', sans-serif;
   }
   
   .bg-white {
     background-color: #f8fafc !important;
   }
   
   .text-slate-900 {
     color: #1e293b !important;
   }
*/`;

export const CustomCSSOverride: React.FC = () => {
  const [css, setCss] = useState<string>('');
  const [savedCss, setSavedCss] = useState<string>('');
  const [isApplied, setIsApplied] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_CSS;
    setCss(stored);
    setSavedCss(stored);
    if (stored !== DEFAULT_CSS) {
      injectCSS(stored);
      setIsApplied(true);
      setLastSaved(new Date().toLocaleTimeString());
    }
  }, []);

  const handleApply = () => {
    injectCSS(css);
    setIsApplied(true);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, css);
    injectCSS(css);
    setSavedCss(css);
    setIsApplied(true);
    setLastSaved(new Date().toLocaleTimeString());
  };

  const handleReset = () => {
    setCss(DEFAULT_CSS);
    localStorage.removeItem(STORAGE_KEY);
    removeCSS();
    setSavedCss(DEFAULT_CSS);
    setIsApplied(false);
    setLastSaved('');
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

  const hasChanges = css !== savedCss;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Paintbrush className="w-6 h-6 text-purple-600" />
              <span>Custom CSS Override</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Write custom CSS to override any site styling. Changes apply in real-time and persist across sessions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isApplied && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                <Eye className="w-3 h-3" />
                LIVE
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
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">styles.css</span>
            {hasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              title="Import CSS file"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".css,.txt"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              title="Export as .css file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={css}
            onChange={(e) => setCss(e.target.value)}
            spellCheck={false}
            className="w-full h-[480px] p-4 font-mono text-xs leading-relaxed text-emerald-700 dark:text-emerald-300 bg-white dark:bg-[#0d1117] resize-none focus:outline-none"
            placeholder="/* Write your custom CSS here */"
            style={{ tabSize: 2 }}
          />
          <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-300 dark:text-slate-600">
            {css.split('\n').length} lines | {css.length} chars
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
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
              {hasChanges ? 'Save & Apply' : 'Saved'}
            </button>
          </div>
          <button
            onClick={handleReset}
            className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset All
          </button>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
        <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="bg-purple-100 dark:bg-purple-950 text-purple-600 px-2 py-0.5 rounded-md text-[10px]">TIPS</span>
          Common CSS Overrides
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">Change Font Family</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">body {'{'} font-family: 'Inter', sans-serif; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">Sidebar Background</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">nav {'{'} background: #1a1a2e; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">Card Border Radius</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">.rounded-2xl {'{'} border-radius: 8px; {'}'}</code>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">Button Styles</p>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">button {'{'} border-radius: 12px; {'}'}</code>
          </div>
        </div>
      </div>
    </div>
  );
};
