/**
 * Browser-side Web Push registration for kitchen alerts (8 Sep 2026).
 *
 * Replaced the KDS audio chime, which only ever made a sound on the one device
 * already looking at the order screen - and not even reliably there, since
 * mobile browsers refuse to play audio on a page nobody has tapped and iOS
 * mutes Web Audio whenever the physical silent switch is on. A push
 * notification reaches the phone in a pocket, uses the device's own alert
 * sound and vibration, and arrives with the app closed.
 *
 * The server half (subscription store, role filter, sending) lives in
 * php/api/push_notifications.php; the notification is drawn by the `push`
 * handler in sw.js.
 */

import { fetchVapidPublicKeyDB, savePushSubscriptionDB } from '../services/api';

export type PushEnableResult =
  | 'enabled'        // subscribed and registered with the server
  | 'denied'         // the user said no - only they can undo this, in browser settings
  | 'dismissed'      // the prompt was closed without an answer; asking again later is fine
  | 'unsupported'    // no service worker / no Push API (notably iOS Safari outside an installed PWA)
  | 'failed';        // something broke - key fetch, subscribe call, or the save

/**
 * A VAPID key arrives as base64url text but `pushManager.subscribe` wants raw
 * bytes. Base64url is not the same alphabet as base64 (`-_` vs `+/`) and the
 * padding is stripped, so both have to be restored before `atob` will accept
 * it - feeding it the raw string yields a subscription the push service later
 * rejects, which is a confusing failure to debug after the fact.
 */
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
};

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** What the browser currently thinks, without prompting anyone. */
export const getPushPermission = (): NotificationPermission | 'unsupported' =>
  isPushSupported() ? Notification.permission : 'unsupported';

/**
 * Subscribe this device and register it against the logged-in user.
 *
 * `requestPermission` MUST be reached from a real user gesture on Safari (and
 * is best practice everywhere), so call this from a click handler - never from
 * a mount effect - unless permission is already 'granted', in which case there
 * is no prompt to gesture-gate and `ensurePushSubscription` below is the right
 * entry point instead.
 */
export const enablePushNotifications = async (): Promise<PushEnableResult> => {
  if (!isPushSupported()) return 'unsupported';

  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return 'failed';
    }
  }
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'dismissed';

  try {
    const registration = await navigator.serviceWorker.ready;

    // Reuse an existing subscription rather than creating a second one for the
    // same device - but still re-save it, because the SERVER may not know
    // about it (fresh database, a different property, or a role that changed
    // since the row was written).
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = await fetchVapidPublicKeyDB();
      if (!publicKey) return 'failed';
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }

    return (await savePushSubscriptionDB(subscription)) ? 'enabled' : 'failed';
  } catch (err) {
    console.error('Push subscription failed:', err);
    return 'failed';
  }
};

/**
 * Silent top-up for a device that has ALREADY granted permission: makes sure
 * the server still has this subscription on file. Safe to call from a mount
 * effect because it never prompts - it returns immediately unless permission
 * is already granted.
 *
 * This matters more than it looks. A subscription lives in the browser, but
 * the row tying it to a user and property lives on the server, and the two can
 * drift apart - the same person signing in on a second property, a staff row
 * whose role changed from Front Desk to Kitchen, a restored database. Without
 * this, that person's phone stays silent while the browser insists it is
 * subscribed, which is close to undiagnosable from the outside.
 */
export const ensurePushSubscription = async (): Promise<void> => {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await savePushSubscriptionDB(subscription);
    }
  } catch {
    // Best-effort - a failure here just means the next explicit enable will
    // fix it, and there is nothing the user could usefully do about it now.
  }
};
