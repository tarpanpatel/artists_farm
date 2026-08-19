/**
 * Web Push Notification Service
 * Manages browser push permission requests, device notification triggers,
 * and service worker integration.
 */

export interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

export const isWebPushSupported = (): boolean => {
  return 'Notification' in window && 'serviceWorker' in navigator;
};

export const getPushPermissionState = (): NotificationPermission => {
  if (!isWebPushSupported()) return 'denied';
  return Notification.permission;
};

export const requestPushNotificationPermission = async (): Promise<boolean> => {
  if (!isWebPushSupported()) {
    console.warn('Web Push Notifications are not supported by this browser.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Web Push Notification permission granted.');
      // Register / active service worker
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification('Notifications Active 🔔', {
            body: 'You will now receive instant push alerts on this device.',
            icon: '/icons/android-chrome-192x192.png',
            badge: '/icons/favicon-32x32.png',
            tag: 'welcome-notification',
          });
        });
      }
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return false;
  }
};

export const sendBrowserNotification = (options: PushNotificationOptions): void => {
  if (!isWebPushSupported() || Notification.permission !== 'granted') return;

  const defaultIcon = '/icons/android-chrome-192x192.png';
  const defaultBadge = '/icons/favicon-32x32.png';

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || defaultIcon,
        badge: options.badge || defaultBadge,
        tag: options.tag || 'groundcode-alert',
        renotify: true,
        data: { url: options.url || '/#dashboard' },
      } as any);
    });
  } else {
    try {
      new Notification(options.title, {
        body: options.body,
        icon: options.icon || defaultIcon,
        badge: options.badge || defaultBadge,
        tag: options.tag || 'groundcode-alert',
      });
    } catch (e) {
      console.warn('Direct notification constructor failed:', e);
    }
  }
};
