/**
 * GroundCode Client-Side OCR Scanner (Tesseract.js WebAssembly)
 *
 * Runs 100% in the browser via Web Workers:
 * 1. Zero third-party API costs / zero recurring cloud vision charges.
 * 2. Complete data privacy (guest ID photos & financial screenshots never leave device).
 * 3. Lazy-loaded on demand so initial app bundle remains lightweight.
 *
 * Scoped strictly to 3 core operational workflows:
 * - UPI Payment Screenshot Verification (12-digit UTR + amount)
 * - Market Grocery & Cash Expense Slips (Receipt Total + Date + Shop)
 * - Foreign Guest C-Form in 3 Seconds (Passport MRZ TD3 Reader)
 */

import { API_BASE, API_ROOT_BASE } from '../services/api';

export interface OcrProgressCallback {
  (progress: number, statusMessage: string): void;
}

export interface UpiScanResult {
  rawText: string;
  utr: string | null;
  amount: number | null;
  date: string | null;
  status: 'success' | 'failed' | 'unknown';
  appHint: 'GPay' | 'PhonePe' | 'Paytm' | 'BHIM' | 'CRED' | 'Other';
  payee?: string | null;
}

export interface ReceiptScanResult {
  rawText: string;
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  vendor: string | null;
}

export interface PassportMrzResult {
  rawText: string;
  passportNumber: string | null;
  nationality: string | null;
  countryCode: string | null;
  fullName: string | null;
  dob: string | null; // YYYY-MM-DD
  expiryDate: string | null; // YYYY-MM-DD
  gender: 'Male' | 'Female' | 'Other' | null;
  isMrzDetected: boolean;
}

// ISO 3166-1 alpha-3 common nationality mapping for Form-C filing
const COUNTRY_CODES: Record<string, string> = {
  USA: 'United States',
  GBR: 'United Kingdom',
  FRA: 'France',
  DEU: 'Germany',
  CAN: 'Canada',
  AUS: 'Australia',
  RUS: 'Russia',
  ISR: 'Israel',
  ESP: 'Spain',
  ITA: 'Italy',
  NLD: 'Netherlands',
  JPN: 'Japan',
  KOR: 'South Korea',
  CHN: 'China',
  IND: 'India',
  BGD: 'Bangladesh',
  NPL: 'Nepal',
  LKA: 'Sri Lanka',
  ARE: 'United Arab Emirates',
  SGP: 'Singapore',
  MYS: 'Malaysia',
  THA: 'Thailand',
  ZAF: 'South Africa',
  BRA: 'Brazil',
  MEX: 'Mexico',
  NZL: 'New Zealand',
  SWE: 'Sweden',
  CHE: 'Switzerland',
  AUT: 'Austria',
  BEL: 'Belgium',
  DNK: 'Denmark',
  NOR: 'Norway',
  FIN: 'Finland',
  IRL: 'Ireland',
  POL: 'Poland',
  PRT: 'Portugal',
};

export interface OcrOptions {
  lang?: string;
  whitelist?: string;
  psm?: string | number;
  preprocess?: boolean;
  maxDimension?: number;
  enhanceContrast?: boolean;
}

/**
 * Sitewide OCR kill switch (11 Sep 2026, explicit request: "I am not sure
 * if OCR system will work well, so i want to have a toggle in root
 * dashboard, which can deactivate it sitewide"). Backed by the generic
 * system_settings key/value store (see php/api/configuration.php's
 * get_system_settings/save_system_settings) under 'ocr_enabled' - Root
 * Admin's OcrSettingsPanel.tsx is the only writer. Checked once, in
 * performClientOcr below, since every real OCR entry point
 * (scanUpiScreenshot/scanPettyCashReceipt/scanPassportMrz) already funnels
 * through it - see that function's own note on why this is the one choke
 * point for the whole feature.
 *
 * Cached client-side for OCR_ENABLED_CACHE_TTL_MS so a burst of scans (or a
 * multi-page receipt) doesn't cost a network round trip per attempt; a
 * toggle flipped in Root Admin takes effect for the next scan anywhere
 * within that window, not instantly - deliberately not "instant and
 * reactive", since nothing about this feature needs to be.
 */
const OCR_ENABLED_CACHE_TTL_MS = 60_000;
export const OCR_DISABLED_ERROR_MESSAGE = 'OCR_DISABLED';
let ocrEnabledCache: { value: boolean; fetchedAt: number } | null = null;

/** True when `err` is the disabled-by-admin error performClientOcr throws,
 * so a catch block can show a clear "an admin turned this off" message
 * instead of a generic "scan failed" one. */
export function isOcrDisabledError(err: unknown): boolean {
  return err instanceof Error && err.message === OCR_DISABLED_ERROR_MESSAGE;
}

export async function isOcrEnabled(): Promise<boolean> {
  if (ocrEnabledCache && Date.now() - ocrEnabledCache.fetchedAt < OCR_ENABLED_CACHE_TTL_MS) {
    return ocrEnabledCache.value;
  }
  try {
    const res = await fetch(`${API_BASE}?action=get_system_settings`, { credentials: 'include' });
    const data = await res.json();
    // Missing key = never toggled = stays enabled (this predates the
    // toggle and must keep working until someone deliberately turns it
    // off) - only an explicit '0' disables it.
    const value = data?.status === 'success' ? data.data?.ocr_enabled !== '0' : true;
    ocrEnabledCache = { value, fetchedAt: Date.now() };
    return value;
  } catch (err) {
    console.warn('[OCR] Failed to check ocr_enabled setting, defaulting to enabled:', err);
    // A network hiccup checking the flag must not itself block scanning -
    // fail open, same as the "missing key" case above, and don't cache a
    // failure so the next attempt gets a fresh try at the real value.
    return ocrEnabledCache?.value ?? true;
  }
}

// Module-level worker singleton map so subsequent scans start in < 150ms instead of 3-4s
const cachedWorkerPromises: Record<string, Promise<any>> = {};
let currentProgressCallback: OcrProgressCallback | null = null;

// Serializes performClientOcr calls (found 11 Sep 2026 code review): each
// language has exactly ONE shared, cached Tesseract worker, and a worker's
// setParameters()/recognize() pair is not reentrant - two scans started
// close together (e.g. a bill scan then a UPI-proof scan, before the first
// resolves) would otherwise run interleaved `setParameters(A) ->
// setParameters(B) -> recognize -> recognize` on the same worker, so the
// first scan's OCR runs under the second scan's page-segmentation mode, and
// module-level `currentProgressCallback` drives whichever scan's progress
// bar last overwrote it rather than the one that owns it. Chaining every
// call onto this promise guarantees only one scan's setParameters+recognize
// pair is ever in flight at a time, app-wide.
let ocrQueue: Promise<void> = Promise.resolve();

/** Runs `fn` only once every earlier-queued scan has finished (success or
 * failure), so worker acquisition + setParameters + recognize for one scan
 * never overlaps another's. See ocrQueue's own comment for why this exists. */
async function withOcrLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = ocrQueue;
  let release: () => void = () => {};
  ocrQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function getOcrWorker(lang: string = 'eng'): Promise<any> {
  if (!cachedWorkerPromises[lang]) {
    cachedWorkerPromises[lang] = (async () => {
      const { createWorker } = await import('tesseract.js');
      const options: any = {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 85) + 10;
            currentProgressCallback?.(pct, `Scanning image (${pct}%)...`);
          } else if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
            currentProgressCallback?.(10, `Loading ${lang.toUpperCase()} OCR model...`);
          }
        },
      };

      if (lang === 'mrz') {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        // The built app is always served under a literal "/dist/" URL prefix
        // on staging/production (see deploy-staging.ps1/deploy.ps1's
        // $LiveUrl) - public/tessdata/ is copied verbatim into dist/tessdata/
        // on build, hence the /dist prefix there. Vite's own dev server has
        // no such prefix - it serves public/ straight from the site root -
        // so resolving to /dist/tessdata while running `npm run dev` 404s
        // (found 11 Sep 2026 code review).
        const distPrefix = import.meta.env.DEV ? '' : '/dist';
        options.langPath = `${origin}${API_ROOT_BASE}${distPrefix}/tessdata`;
        options.gzip = true;
      }

      // Deliberately no try/catch-and-fall-back-to-eng here (there used to
      // be one): it resolved this promise - the one cached under the FAILED
      // language's own key - to the eng worker, so a transient failure (or,
      // before the fix above, the dev-server 404) meant every future 'mrz'
      // scan for the rest of the tab's session silently reused eng with no
      // retry, since cachedWorkerPromises['mrz'] was already "successfully"
      // resolved. Letting the rejection propagate to the .catch below evicts
      // the cache entry instead, so the NEXT call gets a fresh attempt at
      // the real model; performClientOcr below is the one place that falls
      // back to a plain (uncached-under-the-wrong-key) eng worker for the
      // scan actually in flight.
      return createWorker(lang, undefined, options);
    })().catch((err) => {
      delete cachedWorkerPromises[lang];
      throw err;
    });
  }
  return cachedWorkerPromises[lang];
}

/**
 * Preprocesses an image on an off-screen HTML5 Canvas:
 * 1. Proportional downscale (e.g. 12MP/48MP mobile photos -> maxDimension 1600px),
 *    reducing WebAssembly OCR execution time by 5x-8x with zero text clarity loss.
 * 2. High-contrast grayscale conversion to separate faint ink from paper shadows & app gradients.
 */
export async function preprocessImageForOcr(
  imageSource: File | Blob | string,
  options?: {
    maxDimension?: number;
    enhanceContrast?: boolean;
    grayscale?: boolean;
  }
): Promise<Blob | File | string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return imageSource;
  }

  const maxDim = options?.maxDimension ?? 1600;
  const enhanceContrast = options?.enhanceContrast ?? true;
  const toGrayscale = options?.grayscale ?? true;

  let urlToRevoke: string | null = null;
  let srcUrl: string;

  if (imageSource instanceof File || imageSource instanceof Blob) {
    srcUrl = URL.createObjectURL(imageSource);
    urlToRevoke = srcUrl;
  } else if (typeof imageSource === 'string') {
    srcUrl = imageSource;
  } else {
    return imageSource;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let { naturalWidth: width, naturalHeight: height } = img;
        if (!width || !height) {
          if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
          return resolve(imageSource);
        }

        // Calculate downscaled dimensions if larger than maxDim
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
          return resolve(imageSource);
        }

        ctx.drawImage(img, 0, 0, width, height);

        if (toGrayscale || enhanceContrast) {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;
          // Contrast factor: 35 gives a clean contrast stretch
          const contrast = enhanceContrast ? 35 : 0;
          const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

          for (let i = 0; i < data.length; i += 4) {
            let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (enhanceContrast) {
              gray = factor * (gray - 128) + 128;
              if (gray < 0) gray = 0;
              if (gray > 255) gray = 255;
            }
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }
          ctx.putImageData(imgData, 0, 0);
        }

        canvas.toBlob(
          (blob) => {
            if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
            resolve(blob || imageSource);
          },
          'image/jpeg',
          0.92
        );
      } catch {
        if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
        resolve(imageSource);
      }
    };
    img.onerror = () => {
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
      resolve(imageSource);
    };
    img.src = srcUrl;
  });
}

/**
 * Executes OCR on an image source (File, Blob, or URL) using cached Tesseract.js worker and Canvas pre-processing.
 */
export async function performClientOcr(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback,
  options?: OcrOptions
): Promise<string> {
  // Sitewide kill switch - see isOcrEnabled's own comment. Checked before
  // any preprocessing/worker work starts (not just before recognize) so a
  // disabled scan fails fast with no wasted canvas work or worker spin-up,
  // and before the caller's progress UI ever shows "scanning".
  if (!(await isOcrEnabled())) {
    throw new Error(OCR_DISABLED_ERROR_MESSAGE);
  }

  onProgress?.(5, 'Optimizing image for scan...');

  let processedSource: File | Blob | string = imageSource;
  let tempObjectUrl: string | null = null;
  const targetLang = options?.lang || 'eng';
  // Tracks whichever language actually ended up loaded for this scan -
  // starts equal to targetLang, but drops to 'eng' if targetLang's own
  // model failed to load (see the try/catch around getOcrWorker below).
  // Read from the outer catch too, so a failure after a fallback evicts the
  // worker that actually failed rather than re-evicting the target that
  // already failed and was already dropped from the cache.
  let effectiveLang = targetLang;

  try {
    if (options?.preprocess !== false) {
      processedSource = await preprocessImageForOcr(imageSource, {
        maxDimension: options?.maxDimension ?? 1600,
        enhanceContrast: options?.enhanceContrast ?? true,
      });
    }

    if (processedSource instanceof File || processedSource instanceof Blob) {
      tempObjectUrl = URL.createObjectURL(processedSource);
    }

    onProgress?.(15, `Initializing ${targetLang.toUpperCase()} OCR engine...`);
    // Worker acquisition through recognize is the section that touches the
    // shared per-language worker and the module-level progress callback -
    // see ocrQueue's comment for why this has to be exclusive.
    const text = await withOcrLock(async () => {
      // Set AND cleared from inside the lock, not the outer finally below -
      // clearing it after release() would race the next queued scan, which
      // can already be running and may have set its own callback the
      // instant this one releases the lock (found 11 Sep 2026 code review,
      // same root cause as the worker-sharing race this lock exists for).
      currentProgressCallback = onProgress || null;
      try {
        let worker: any;
        try {
          worker = await getOcrWorker(targetLang);
        } catch (err) {
          if (targetLang === 'eng') throw err;
          // Fall back to eng for THIS scan only - see getOcrWorker's comment
          // on why the fallback must not be cached under the failed
          // language's key.
          console.warn(`[OCR] Failed to load ${targetLang} model, falling back to eng for this scan:`, err);
          effectiveLang = 'eng';
          worker = await getOcrWorker('eng');
        }

        // Reset or configure parameters for this specific scan
        const params: Record<string, string> = {
          tessedit_char_whitelist: options?.whitelist || '',
          tessedit_pageseg_mode: String(options?.psm || '3'),
        };
        await worker.setParameters(params);

        onProgress?.(25, 'Analyzing image content...');
        const result = await worker.recognize(tempObjectUrl || processedSource);
        onProgress?.(100, 'Scan complete.');
        return result.data?.text || '';
      } finally {
        currentProgressCallback = null;
      }
    });

    return text;
  } catch (err) {
    delete cachedWorkerPromises[effectiveLang];
    throw err;
  } finally {
    if (tempObjectUrl) {
      URL.revokeObjectURL(tempObjectUrl);
    }
  }
}

/**
 * Explicitly terminates all OCR Web Workers to free system memory if needed.
 */
export async function terminateOcrWorker(): Promise<void> {
  for (const lang of Object.keys(cachedWorkerPromises)) {
    try {
      const worker = await cachedWorkerPromises[lang];
      await worker.terminate();
    } catch {
      // Ignored
    }
    delete cachedWorkerPromises[lang];
  }
  currentProgressCallback = null;
}

/**
 * 1. UPI Payment Screenshot Parser
 * Extracts 12-digit UTR / Ref No, Amount (₹), and Payment Status.
 */
export async function scanUpiScreenshot(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<UpiScanResult> {
  const text = await performClientOcr(imageSource, onProgress, {
    maxDimension: 1600,
    enhanceContrast: true,
    psm: '3',
  });
  const cleanText = text.replace(/\r\n/g, '\n');

  // Detect App Hint
  let appHint: UpiScanResult['appHint'] = 'Other';
  const lower = cleanText.toLowerCase();
  if (lower.includes('google pay') || lower.includes('gpay')) appHint = 'GPay';
  else if (lower.includes('phonepe') || lower.includes('ybl') || lower.includes('ibl')) appHint = 'PhonePe';
  else if (lower.includes('paytm') || lower.includes('paytm payments')) appHint = 'Paytm';
  else if (lower.includes('bhim')) appHint = 'BHIM';
  else if (lower.includes('cred')) appHint = 'CRED';

  // Detect Status
  let status: UpiScanResult['status'] = 'unknown';
  if (/paid\s*successfully|payment\s*successful|transaction\s*successful|completed|successful|transferred\s*successfully/i.test(cleanText)) {
    status = 'success';
  } else if (/failed|declined|unsuccessful/i.test(cleanText)) {
    status = 'failed';
  }

  // 12-digit UPI UTR / Ref No.
  // UPI UTRs are universally 12 numeric digits in India (e.g. 425189201948)
  let utr: string | null = null;
  const labeledUtrMatch = cleanText.match(
    /(?:UTR|Ref(?:\s*No\.?|\s*Number)?|UPI\s*(?:Ref|Transaction\s*ID)|Txn\s*ID|Transaction\s*ID|Google\s*Transaction\s*ID)[:\s#]*([0-9]{12})\b/i
  );
  if (labeledUtrMatch && labeledUtrMatch[1]) {
    utr = labeledUtrMatch[1];
  } else {
    // Fallback: search for any standalone 12-digit sequence
    const standalone12Match = cleanText.match(/\b([0-9]{12})\b/);
    if (standalone12Match) {
      utr = standalone12Match[1];
    }
  }

  // Payee / Merchant Name (e.g., "Paid to Blinkit", "Paid to Amul Parlour", "Sent to Ram")
  let payee: string | null = null;
  const payeeMatch = cleanText.match(/(?:Paid\s*to|Sent\s*to|Payment\s*to|To)\s*[:\s]*([A-Za-z0-9\s&.'_-]{3,35})/i);
  if (payeeMatch && payeeMatch[1]) {
    const rawPayee = payeeMatch[1].trim().replace(/\n.*$/, '').replace(/[<>«»]/g, '').trim();
    if (!/^(?:account|bank|upi|success|completed|details|statement|reference)/i.test(rawPayee) && rawPayee.length >= 3) {
      payee = rawPayee;
    }
  }

  // Amount Extraction
  let amount: number | null = null;
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. Explicit labeled or currency-prefixed patterns (including OCR artifacts like '#', '?', '~')
  const amountPatterns = [
    /(?:[₹₹#?*~]|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Paid|Sent|Amount|Total|Received)[:\s]*(?:[₹₹#?*~]|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  // 2. Standalone line amount (PhonePe / GPay style):
  // Sits near "Transaction Successful" / "Payment Successful" or right before "Paid to"
  if (!amount) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(?:[₹₹#?*~F]|\b)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]{1,6}(?:\.[0-9]{1,2})?)$/.test(line)) {
        // Exclude 12-digit UTRs, dates, phone numbers, times
        if (line.length >= 10 && !line.includes('.')) continue;
        if (/^[0-9]{2}:[0-9]{2}/.test(line)) continue;

        const rawVal = line.replace(/[^0-9.]/g, '');
        let val = parseFloat(rawVal);

        // Handle misread ₹ as leading 7 (e.g. '7403' for ₹403)
        if (rawVal.startsWith('7') && rawVal.length >= 3 && !line.includes('.')) {
          const prev = lines[i - 1] || '';
          const next = lines[i + 1] || '';
          if (/transaction|payment|successful|paid\s*to|completed/i.test(prev + ' ' + next)) {
            const stripped = parseFloat(rawVal.slice(1));
            if (stripped > 0 && stripped < 50000) {
              val = stripped;
            }
          }
        }

        if (!isNaN(val) && val > 0) {
          amount = val;
          break;
        }
      }
    }
  }

  // Date extraction
  let date: string | null = null;
  const dateMatch = cleanText.match(/\b([0-3]?[0-9]\s+[A-Za-z]{3,9}\s+20[2-9][0-9])\b/) ||
    cleanText.match(/\b([0-3]?[0-9][./-][0-1]?[0-9][./-]20[2-9][0-9])\b/);
  if (dateMatch) {
    date = dateMatch[1];
  } else if (/\btoday\b/i.test(cleanText)) {
    date = new Date().toISOString().slice(0, 10);
  }

  return {
    rawText: cleanText,
    utr,
    amount,
    date,
    status,
    appHint,
    payee,
  };
}

/**
 * 2. Market Grocery & Cash Expense Slips Parser
 * Extracts Total Cash Amount (₹), Date (YYYY-MM-DD), and Vendor / Store Name.
 */
export async function scanPettyCashReceipt(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<ReceiptScanResult> {
  const text = await performClientOcr(imageSource, onProgress, {
    maxDimension: 1600,
    enhanceContrast: true,
    psm: '4',
  });
  const cleanText = text.replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. Vendor Name
  let vendor: string | null = null;
  const knownApps = [
    { pattern: /blinkit/i, name: 'Blinkit' },
    { pattern: /zepto/i, name: 'Zepto' },
    { pattern: /instamart/i, name: 'Swiggy Instamart' },
    { pattern: /bigbasket|bbnow/i, name: 'BigBasket' },
    { pattern: /dmart/i, name: 'DMart' },
    { pattern: /amazon\s*fresh/i, name: 'Amazon Fresh' },
    { pattern: /zomato/i, name: 'Zomato' },
    { pattern: /swiggy/i, name: 'Swiggy' },
  ];

  for (const app of knownApps) {
    if (app.pattern.test(cleanText)) {
      vendor = app.name;
      break;
    }
  }

  if (!vendor) {
    for (const line of lines.slice(0, 8)) {
      // Ignore mobile status bar icons, battery, dynamic island, order summary, etc.
      if (/^[«<>]|[«<>]{2,}|order\s*summary|arriving\s*in|items?\s*in\s*this|bill\s*details/i.test(line)) continue;
      if (line.length < 3) continue;
      if (/^[0-9:\sAPMapm./-]+$/.test(line)) continue;
      if (/^[^\w\s]+$/.test(line)) continue;
      if (/tax|invoice|bill|receipt|date|gst|cash|memo|phone|tel/i.test(line)) continue;
      // Skip status bar glyph noise like "D> oF -." or lines with irregular symbols
      if (/^[a-z0-9]\s*[><=+\-~]\s*[a-z0-9]/i.test(line) || /[><=~]{2,}/.test(line)) continue;
      vendor = line.slice(0, 40);
      break;
    }
  }

  // 2. Amount extraction
  let amount: number | null = null;
  const totalKeywords = [
    /(?:Bill\s*Total|Order\s*Total|Grand\s*Total|Net\s*Total|Total\s*Amount|Total|Net\s*Payable|To\s*Pay|Amount|Final)[:\s]*(?:[₹₹#?*~]|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Cash|Paid)[:\s]*(?:[₹₹#?*~]|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const regex of totalKeywords) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      const rawVal = match[1].replace(/,/g, '');
      let parsed = parseFloat(rawVal);
      // Handle ₹ misread as 7 before digits (e.g. 'Bill total 7403' -> 403)
      if (rawVal.startsWith('7') && rawVal.length >= 3) {
        const without7 = parseFloat(rawVal.slice(1));
        if (without7 > 0 && without7 < 10000) {
          parsed = without7;
        }
      }
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  // Multi-line fallback: line with "Bill total" followed by next line with number
  if (!amount) {
    for (let i = 0; i < lines.length; i++) {
      if (/^(?:Bill\s*total|Order\s*total|Total|Grand\s*total|To\s*pay)$/i.test(lines[i])) {
        if (i + 1 < lines.length) {
          const nextMatch = lines[i + 1].match(/(?:[₹₹#?*~]|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
          if (nextMatch && nextMatch[1]) {
            const rawVal = nextMatch[1].replace(/,/g, '');
            let val = parseFloat(rawVal);
            if (rawVal.startsWith('7') && rawVal.length >= 3) {
              const without7 = parseFloat(rawVal.slice(1));
              if (without7 > 0 && without7 < 10000) val = without7;
            }
            if (!isNaN(val) && val > 0) {
              amount = val;
              break;
            }
          }
        }
      }
    }
  }

  // 3. Date extraction and format to YYYY-MM-DD
  let date: string | null = null;
  const dateMatch = cleanText.match(/\b([0-3]?[0-9])[./-]([0-1]?[0-9])[./-](20[2-9][0-9]|[2-9][0-9])\b/);
  if (dateMatch) {
    const d = dateMatch[1].padStart(2, '0');
    const m = dateMatch[2].padStart(2, '0');
    let y = dateMatch[3];
    if (y.length === 2) y = `20${y}`;
    date = `${y}-${m}-${d}`;
  } else if (/\b(?:placed\s+)?today\b/i.test(cleanText)) {
    date = new Date().toISOString().slice(0, 10);
  } else if (/\byesterday\b/i.test(cleanText)) {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    date = yest.toISOString().slice(0, 10);
  }

  return {
    rawText: cleanText,
    amount,
    date,
    vendor,
  };
}

/**
 * 3. Foreign Guest Passport MRZ Reader (ICAO 9303 TD3)
 * Extracts Passport Number, Nationality Country Code, Full Name, DOB, Expiry Date, Sex.
 */
export async function scanPassportMrz(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<PassportMrzResult> {
  const text = await performClientOcr(imageSource, onProgress, {
    lang: 'mrz',
    maxDimension: 1800,
    enhanceContrast: true,
    psm: '3',
  });
  const cleanText = text.replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.replace(/\s+/g, '').toUpperCase());

  let line1: string | null = null;
  let line2: string | null = null;

  // Search for the 2 MRZ lines (each standard TD3 line is 44 characters)
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    // Line 1 starts with 'P<' or 'P' and contains many '<' characters
    if ((cur.startsWith('P<') || cur.startsWith('P')) && cur.includes('<<') && cur.length >= 35) {
      line1 = cur;
      if (i + 1 < lines.length && lines[i + 1].length >= 35) {
        line2 = lines[i + 1];
      }
      break;
    }
  }

  let passportNumber: string | null = null;
  let nationality: string | null = null;
  let countryCode: string | null = null;
  let fullName: string | null = null;
  let dob: string | null = null;
  let expiryDate: string | null = null;
  let gender: PassportMrzResult['gender'] = null;
  let isMrzDetected = false;

  if (line1 && line2) {
    isMrzDetected = true;

    // Line 1 format: P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
    // Chars 2-5: Issuing Country Code
    const issuingCountry = line1.substring(2, 5).replace(/</g, '');
    countryCode = issuingCountry;

    // Name parsing from Line 1
    const namePart = line1.substring(5);
    const [lastNameRaw, firstNamesRaw] = namePart.split('<<');
    if (lastNameRaw) {
      const lastName = lastNameRaw.replace(/</g, ' ').trim();
      const firstNames = (firstNamesRaw || '').replace(/</g, ' ').trim();
      fullName = firstNames ? `${firstNames} ${lastName}`.trim() : lastName;
    }

    // Line 2 format: L898902C36UTO7408122F1204159ZE184226B<<<<<10
    // Chars 0-9: Passport Document Number
    passportNumber = line2.substring(0, 9).replace(/</g, '').trim();

    // Chars 10-13: Nationality Code
    const natCode = line2.substring(10, 13).replace(/</g, '').trim();
    if (natCode) {
      countryCode = natCode;
      nationality = COUNTRY_CODES[natCode] || natCode;
    }

    // Chars 13-19: Date of Birth YYMMDD
    const dobRaw = line2.substring(13, 19);
    if (/^[0-9]{6}$/.test(dobRaw)) {
      const yy = parseInt(dobRaw.substring(0, 2), 10);
      const mm = dobRaw.substring(2, 4);
      const dd = dobRaw.substring(4, 6);
      // If YY > current 2-digit year + 5, assume 1900s; else 2000s
      const currentYY = new Date().getFullYear() % 100;
      const fullYear = yy > currentYY ? `19${yy.toString().padStart(2, '0')}` : `20${yy.toString().padStart(2, '0')}`;
      dob = `${fullYear}-${mm}-${dd}`;
    }

    // Char 20: Sex (M/F/<)
    const sexChar = line2.charAt(20);
    if (sexChar === 'M') gender = 'Male';
    else if (sexChar === 'F') gender = 'Female';
    else if (sexChar === 'X' || sexChar === '<') gender = 'Other';

    // Chars 21-27: Expiry Date YYMMDD
    const expRaw = line2.substring(21, 27);
    if (/^[0-9]{6}$/.test(expRaw)) {
      const yy = expRaw.substring(0, 2);
      const mm = expRaw.substring(2, 4);
      const dd = expRaw.substring(4, 6);
      expiryDate = `20${yy}-${mm}-${dd}`;
    }
  } else {
    // Fallback if MRZ characters were partially skewed or phone took top-half crop
    const passMatch = cleanText.match(/(?:Passport\s*(?:No\.?|Number)?|Doc\s*No\.?)[:\s]*([A-Z0-9]{7,9})\b/i) ||
      cleanText.match(/\b([A-Z][0-9]{7,8})\b/);
    if (passMatch) passportNumber = passMatch[1];

    const natMatch = cleanText.match(/Nationality[:\s]*([A-Za-z\s]+)/i);
    if (natMatch) nationality = natMatch[1].trim();

    const nameMatch = cleanText.match(/(?:Given\s*Name|Name|Full\s*Name)[:\s]*([A-Za-z\s]+)/i);
    if (nameMatch) fullName = nameMatch[1].trim();
  }

  if (countryCode && !nationality) {
    nationality = COUNTRY_CODES[countryCode] || countryCode;
  }

  return {
    rawText: cleanText,
    passportNumber,
    nationality,
    countryCode,
    fullName,
    dob,
    expiryDate,
    gender,
    isMrzDetected,
  };
}
