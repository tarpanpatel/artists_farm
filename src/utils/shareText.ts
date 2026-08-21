/**
 * Shared "share this text" helper for the app's generic OS-share buttons
 * (ReceiptEditModal's "Share with guest", StaffManagement's "Share Login
 * Details", etc.) - both call sites used to hand-roll the same two-tier
 * navigator.share -> navigator.clipboard.writeText fallback independently.
 *
 * Both of those APIs require a secure context (HTTPS, or localhost) to even
 * exist on the `navigator` object - on a real phone testing over plain
 * `http://<lan-ip>:port` (the normal way this app gets tested on a physical
 * device against the local XAMPP dev server, see CLAUDE.md's URL examples),
 * `navigator.share` is `undefined` AND `navigator.clipboard` is also
 * `undefined`. The old code's clipboard branch then threw a synchronous
 * TypeError reading `.writeText` off `undefined`, which its own catch block
 * swallowed into a small error toast - easy to miss entirely on a phone, so
 * the button looked like it silently did nothing (found 21 Aug 2026).
 *
 * This adds a third tier - the legacy `document.execCommand('copy')`
 * technique via a temporary offscreen textarea - which (unlike the Clipboard
 * API) has no secure-context requirement in any major mobile browser, so the
 * button still does *something* useful on insecure/local-network testing
 * instead of only ever working once the site is served over real HTTPS.
 */
export async function shareTextContent(
  title: string,
  message: string,
  showToast: (message: string, options?: { type?: 'success' | 'error' | 'warning' | 'info'; duration?: number }) => void,
  copiedMessage: string,
  failedMessage: string,
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text: message });
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // user cancelled the native share sheet - not a failure
      console.error('Web Share failed:', err);
      // fall through to clipboard/legacy-copy below rather than giving up
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(message);
      showToast(copiedMessage, { type: 'success' });
      return;
    } catch (err) {
      console.error('Clipboard API copy failed:', err);
      // fall through to the legacy fallback below
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = message;
    // Keep it in the document (execCommand needs focusable, rendered content
    // in some browsers) but fully off-screen and non-interactive.
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, message.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!ok) throw new Error('execCommand copy returned false');
    showToast(copiedMessage, { type: 'success' });
  } catch (err) {
    console.error('Legacy copy fallback failed:', err);
    showToast(failedMessage, { type: 'error' });
  }
}
