// Dedicated service worker for the Telescope Error Center PWA (added 22 Aug
// 2026) - separate from the main app's sw.js (different scope: /php/errors/
// vs /), so installing Telescope on a device doesn't interact with or
// interfere with the main POS app's own install/update lifecycle at all.
// Its only job is turning a Web Push message into a real OS notification,
// and handling a tap on that notification.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = { title: 'Telescope Alert', body: 'A new error was logged.', url: '/php/errors/' };
    try {
        if (event.data) {
            data = { ...data, ...event.data.json() };
        }
    } catch (e) {
        // Malformed/non-JSON push payload - fall back to the generic defaults
        // above rather than dropping the notification entirely.
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/app-icons/android-chrome-192x192.png',
            badge: '/app-icons/favicon-32x32.png',
            tag: data.tag || 'telescope-alert',
            renotify: true,
            data: { url: data.url || '/php/errors/' },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/php/errors/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('/php/errors/') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
