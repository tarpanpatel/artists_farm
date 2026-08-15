const CACHE_NAME = 'farm-pos-v5';

// 1. Install Event: Skip waiting to activate immediately
self.addEventListener('install', event => {
    self.skipWaiting();
});

// 2. Activate Event: Clean up old cache storage and claim clients
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch Event: Network-First strategy (GET requests only)
self.addEventListener('fetch', event => {
    // PASS-THROUGH: Ignore non-GET requests (POST, PUT, DELETE) and non-HTTP URLs
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // If fetch succeeded, return network response cleanly
                return networkResponse;
            })
            .catch(() => {
                // SILENT FALLBACK: Check cache first, then return clean offline response
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // For HTML page navigations during offline mode
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return new Response(
                            '<div style="font-family:sans-serif;text-align:center;padding:50px;color:#333;">' +
                            '<h2>Offline Mode</h2><p>Please check your network connection and reload.</p></div>',
                            {
                                status: 200,
                                headers: { 'Content-Type': 'text/html' }
                            }
                        );
                    }
                    
                    // Silent 204 No Content for missing background assets instead of
                    // throwing 408. Must be `null`, not '' - 204 is a null-body status
                    // per the Fetch spec, and Chrome throws "Response with null body
                    // status cannot have body" if you pass anything else, even an
                    // empty string.
                    return new Response(null, { status: 204, statusText: 'No Content' });
                });
            })
    );
});

// 4. Push Event: Handle background Web Push Notifications when app is closed
self.addEventListener('push', event => {
    let data = {
        title: 'Ground Code Alert',
        body: 'New alert received from your property.',
        icon: '/icons/android-chrome-192x192.png',
        badge: '/icons/favicon-32x32.png',
        url: '/#dashboard',
        tag: 'groundcode-alert'
    };

    if (event.data) {
        try {
            data = Object.assign({}, data, event.data.json());
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icons/android-chrome-192x192.png',
        badge: data.badge || '/icons/favicon-32x32.png',
        tag: data.tag || 'groundcode-notification',
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        data: {
            url: data.url || '/#dashboard'
        },
        actions: [
            { action: 'open', title: 'View Alert' },
            { action: 'close', title: 'Dismiss' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// 5. Notification Click Event: Focus or open the app when notification is tapped
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'close') return;

    const targetUrl = event.notification.data?.url || '/#dashboard';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let client of windowClients) {
                if ('focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
