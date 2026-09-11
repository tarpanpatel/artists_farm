import React, { useState, useEffect } from 'react';
import { Card } from 'flowbite-react';
import { ScanLine, Loader2 } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';
import { ToggleSwitch } from './ToggleSwitch';

/**
 * Sitewide OCR kill switch (11 Sep 2026, explicit request: "I am not sure
 * if OCR system will work well, so i want to have a toggle in root
 * dashboard, which can deactivate it sitewide").
 *
 * Backed by the same generic system_settings key/value store every other
 * simple Root Admin flag already uses (custom_css, telegram_fallback_source
 * _path - see TelegramHealthPanel.tsx for the identical get/save pattern)
 * under the key 'ocr_enabled', rather than a new dedicated table or a
 * property_modules-style per-property toggle - this is a platform-wide kill
 * switch, not something any one tenant opts in/out of.
 *
 * The actual enforcement lives in src/utils/ocrScanner.ts's
 * performClientOcr() - the one function every OCR entry point
 * (scanUpiScreenshot, scanPettyCashReceipt, scanPassportMrz) funnels
 * through - so flipping this one flag covers all of them (UPI payment
 * screenshot verification, market/cash expense slip scanning, and the
 * passport MRZ reader) without touching each call site's own code.
 */
export const OcrSettingsPanel: React.FC = () => {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const res = await fetch(`/php/api/router.php?action=get_system_settings`, { credentials: 'include' });
        const data = await res.json();
        // Missing key = never toggled yet = stays enabled (this predates the
        // toggle and should keep working until someone deliberately flips
        // it off) - only an explicit '0' turns it off.
        if (data.status === 'success') {
          setEnabled(data.data?.ocr_enabled !== '0');
        }
      } catch (err) {
        console.error('Failed to load OCR setting:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSetting();
  }, []);

  const handleToggle = async (next: boolean) => {
    const previous = enabled;
    setEnabled(next); // optimistic - reverted below on failure
    setSaving(true);
    try {
      const res = await fetch(`/php/api/router.php?action=save_system_settings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setting_key: 'ocr_enabled', setting_value: next ? '1' : '0' }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        showToast(next ? 'OCR scanning enabled sitewide.' : 'OCR scanning disabled sitewide.', { type: 'success' });
      } else {
        setEnabled(previous);
        showToast(data.message || 'Failed to save OCR setting.', { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to save OCR setting:', err);
      setEnabled(previous);
      showToast('Error saving OCR setting.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 max-w-2xl">
      <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/50 rounded-lg flex items-center justify-center shrink-0">
            <ScanLine className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">OCR & Document Scanning</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md">
              Controls the client-side (Tesseract.js) auto-scan that reads UPI payment
              screenshots, cash/market expense bill slips, and passport MRZ lines for
              guest check-in. Turning this off does not remove the upload/attach
              controls themselves - staff can still attach a photo, it just won't be
              auto-read into the form.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <>
              <ToggleSwitch enabled={enabled} onChange={handleToggle} disabled={saving} />
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  enabled
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {enabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        Applies platform-wide, for every tenant and property - there is no per-property
        override. A browser already mid-scan when this is flipped off will still finish
        that one attempt; the very next scan attempt anywhere picks up the new setting
        within about a minute (cached client-side to avoid a network round trip on every
        single scan).
      </p>
    </Card>
  );
};
