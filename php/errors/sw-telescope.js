// Dedicated service worker for the Telescope Error Center PWA (added 22 Aug
// 2026) - separate from the main app's sw.js (different scope: /php/errors/
// vs /), so installing Telescope on a device doesn't interact with or
// interfere with the main POS app's own install/update lifecycle at all.
// Originally only turned a Web Push message into a real OS notification and
// handled a tap on it - no fetch handler at all, so the installed PWA had
// zero offline reliability (roadmap item 4).
//
// Added 28 Aug 2026: cache + serve the app SHELL only (index.php,
// telescope_auth.php, telescope.css, manifest, icons) with the same
// stale-while-revalidate approach the main app's sw.js uses for its own HTML
// shell - paint the last-known shell instantly, refresh it in the background.
// Deliberately does NOT cache anything that looks like a live log/API call
// (any request whose querystring carries `action=`, which is how every real
// log-fetching/action request in index.php's own JS is built - see its
// `fetch('index.php?action=...')` call sites). Caching log DATA would be
// actively misleading for a tool whose entire purpose is showing what's
// happening *right now* during a real outage - only the shell (so the page
// can open and show "can't reach the server" instead of a blank white
// screen) belongs in a cache here.
const TELESCOPE_CACHE_NAME = 'telescope-shell-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names
                .filter((name) => name !== TELESCOPE_CACHE_NAME)
                .map((name) => caches.delete(name))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    const url = new URL(event.request.url);
    if (!url.pathname.includes('/php/errors/')) {
        return; // out of this service worker's own scope - never intercept
    }
    if (url.search.includes('action=')) {
        return; // live log/API data - always network, never cached
    }

    event.respondWith(
        (async () => {
            const cachedResponse = await caches.match(event.request);

            const networkFetch = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(TELESCOPE_CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache).catch(() => {});
                        });
                    }
                    return networkResponse;
                })
                .catch(() => null);

            if (cachedResponse) {
                event.waitUntil(networkFetch);
                return cachedResponse;
            }

            const networkResponse = await networkFetch;
            return networkResponse || new Response(null, { status: 204, statusText: 'No Content' });
        })()
    );
});

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
