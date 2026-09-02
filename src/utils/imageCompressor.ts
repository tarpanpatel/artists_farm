/**
 * Client-side image compression utility using browser HTML5 Canvas.
 *
 * Automatically downscales 8-12 MB smartphone camera photos (guest Aadhaar cards,
 * passports, expense bill receipts) down to ~200-350 KB before transmission over
 * mobile 4G, preserving crisp text readability while eliminating upload timeouts
 * and server disk bloat.
 */

export interface ImageCompressionOptions {
  maxDimension?: number;
  quality?: number;
  maxSizeThresholdBytes?: number;
}

/**
 * Compresses an image File or Blob.
 *
 * @param file The input File from an <input type="file">
 * @param options Compression options (defaults: maxDimension=1600px, quality=0.82)
 * @returns Promise resolving to the compressed File, or the original if not an eligible image.
 */
export async function compressImageFile(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  const {
    maxDimension = 1600,
    quality = 0.82,
    maxSizeThresholdBytes = 350 * 1024 // 350 KB
  } = options;

  // Only compress raster images. Skip PDFs, SVGs, GIFs, and non-image files.
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif'
  ) {
    return file;
  }

  // If already under the threshold, no compression needed
  if (file.size <= maxSizeThresholdBytes) {
    return file;
  }

  try {
    let sourceWidth = 0;
    let sourceHeight = 0;
    let drawSource: ImageBitmap | HTMLImageElement;

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
      drawSource = bitmap;
    } else {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for compression'));
        img.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      sourceWidth = img.naturalWidth || img.width;
      sourceHeight = img.naturalHeight || img.height;
      drawSource = img;
    }

    if (!sourceWidth || !sourceHeight) {
      return file;
    }

    // Compute aspect-ratio preserving dimensions
    let targetWidth = sourceWidth;
    let targetHeight = sourceHeight;

    if (sourceWidth > maxDimension || sourceHeight > maxDimension) {
      if (sourceWidth > sourceHeight) {
        targetHeight = Math.round((sourceHeight * maxDimension) / sourceWidth);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((sourceWidth * maxDimension) / sourceHeight);
        targetHeight = maxDimension;
      }
    }

    // Canvas rendering
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return file;
    }

    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

    // Clean up ImageBitmap if applicable
    if ('close' in drawSource && typeof (drawSource as ImageBitmap).close === 'function') {
      (drawSource as ImageBitmap).close();
    }

    // Preserve PNG/WebP output for PNG/WebP input (found 3 Sep 2026, code
    // review) - this used to always export as JPEG regardless of the source
    // format. Canvas has no alpha channel of its own, so ctx.drawImage()
    // onto an opaque canvas silently flattens any transparent pixel to
    // solid black before the JPEG encode even runs - confirmed live on a
    // transparent-background PNG. That's exactly the QR-code/logo upload
    // case (PettyCashManagement's UPI QR graphic, MenuManager/
    // KitchenManagement item images) this app already has a deliberate
    // "preserve PNG" comment for elsewhere (services/api.ts's
    // resizeImageFile, upload_image.php's own PNG branch) - this function
    // was the one place that didn't follow it. GIF/SVG never reach here
    // (skipped above); every other raster type still downgrades to JPEG.
    const preserveMimeType = file.type === 'image/png' || file.type === 'image/webp'
      ? file.type
      : 'image/jpeg';
    const outputExt = preserveMimeType === 'image/png' ? '.png' : preserveMimeType === 'image/webp' ? '.webp' : '.jpg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), preserveMimeType, quality);
    });

    if (!blob) {
      return file;
    }

    // Only use the compressed file if it's actually smaller
    if (blob.size >= file.size) {
      return file;
    }

    const newName = file.name.replace(/\.[^.]+$/, outputExt);
    return new File([blob], newName, {
      type: preserveMimeType,
      lastModified: Date.now()
    });
  } catch (err) {
    console.warn('[imageCompressor] Compression skipped, using original file:', err);
    return file;
  }
}
