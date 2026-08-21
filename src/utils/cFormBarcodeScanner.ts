import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';
import * as pdfjsLib from 'pdfjs-dist';
// Vite's `?url` suffix returns the built asset's final URL instead of trying
// to bundle the worker script itself - pdf.js's rendering work happens on a
// dedicated worker thread, and this is how it finds that thread's script.
// eslint-disable-next-line import/no-unresolved
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Scoped to the barcode families a govt Form-C confirmation is actually
// likely to carry (linear 1D codes, plus QR/DataMatrix in case a future
// portal revision switches to a 2D code) - narrowing this list (vs. trying
// every format ZXing supports) meaningfully speeds up each decode attempt.
const hints = new Map<DecodeHintType, unknown>();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
]);
hints.set(DecodeHintType.TRY_HARDER, true);

/**
 * Renders page 1 of a PDF to a PNG data URL, at 2x scale - a 1x render of a
 * full A4/letter page can shrink a barcode's bars below what the decoder can
 * reliably tell apart, especially on a phone-camera scan rather than a clean
 * digital export.
 */
async function renderFirstPdfPageToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL('image/png');
}

/**
 * Reads the Applicant ID barcode off an uploaded photo or PDF of a filed
 * Form 'C' (FRRO Arrival Report) - the barcode encodes the exact same string
 * as the printed "Applicant ID" field, so decoding it is far more reliable
 * than OCR'ing the government form's actual text would be (no misread
 * characters from scan/font quality). Runs entirely client-side, no upload
 * needed just to scan (added 21 Aug 2026 - see DESIGN.md/BookingDetailsModal
 * C-Form section).
 *
 * Never throws - a failed/absent scan resolves to null so the caller can
 * fall back to "please enter the Applicant ID manually" rather than treating
 * it as a hard error.
 */
export async function scanApplicantIdFromFile(file: File): Promise<string | null> {
  let imageUrl: string;
  let objectUrlToRevoke: string | null = null;

  try {
    if (file.type === 'application/pdf') {
      imageUrl = await renderFirstPdfPageToDataUrl(file);
    } else {
      imageUrl = URL.createObjectURL(file);
      objectUrlToRevoke = imageUrl;
    }

    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageUrl(imageUrl);
    const text = result.getText()?.trim();
    return text || null;
  } catch (err) {
    if (!(err instanceof NotFoundException)) {
      // NotFoundException just means "no barcode in this image" - the
      // expected outcome for a non-Form-C upload or a scan too blurry to
      // read. Anything else (a corrupt PDF, a canvas/worker failure) is
      // worth a console trace for debugging, but still resolves to null.
      console.error('C-Form barcode scan failed:', err);
    }
    return null;
  } finally {
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
  }
}
