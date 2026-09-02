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

    // Export to JPEG blob (universally supported across all mobile browsers)
    const mimeType = 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    });

    if (!blob) {
      return file;
    }

    // Only use the compressed file if it's actually smaller
    if (blob.size >= file.size) {
      return file;
    }

    // Rename extension to .jpg if needed
    const newName = file.name.replace(/\.[^.]+$/, '.jpg');
    return new File([blob], newName, {
      type: mimeType,
      lastModified: Date.now()
    });
  } catch (err) {
    console.warn('[imageCompressor] Compression skipped, using original file:', err);
    return file;
  }
}
