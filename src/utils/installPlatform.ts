export type InstallPlatform = 'ios' | 'android' | 'desktop';

/**
 * PWA installation differs by operating system: iOS requires Safari's share
 * sheet, Android uses Chrome's app install option, and desktop browsers show
 * an install control in the address bar or browser menu.
 */
export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';

  const userAgent = navigator.userAgent || '';
  const isIPad = /iPad/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIPad || /iPhone|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}
