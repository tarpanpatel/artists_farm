const CACHE_NAME = 'farm-pos-v6';

// 1. Install Event: Skip waiting and cache root SPA entrypoints
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(['/', '/dist/', '/dist/index.html', '/index.html']).catch(() => {});
        })
    );
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
                // Cache successful HTML & main asset GET requests for offline availability
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache).catch(() => {});
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // SILENT FALLBACK: Check cache first, then SPA HTML fallback, then offline recovery screen
                return caches.match(event.request).then(async cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // For HTML page navigations during offline mode, try cached SPA entrypoint
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        const spaFallback = await caches.match('/dist/index.html') || await caches.match('/index.html') || await caches.match('/');
                        if (spaFallback) {
                            return spaFallback;
                        }

                        return new Response(
                            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Offline — GroundCode Resort PMS</title>' +
                            '<style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
                            '.card{background:#1e293b;border:1px solid #334155;border-radius:24px;padding:40px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)}' +
                            '.icon{width:64px;height:64px;margin:0 auto 20px;background:rgba(59,130,246,0.15);color:#60a5fa;border-radius:20px;display:flex;align-items:center;justify-content:center}' +
                            'h2{margin:0 0 10px;font-size:22px;font-weight:700;color:#fff}p{margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.5}' +
                            '.btn{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;width:100%;transition:all .2s}' +
                            '.btn:hover{opacity:.9;transform:translateY(-1px)}</style></head><body>' +
                            '<div class="card"><div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg></div>' +
                            '<h2>You are currently offline</h2><p>Please check your internet connection and reload the application.</p>' +
                            '<button class="btn" onclick="window.location.reload()">Retry Connection</button></div></body></html>',
                            {
                                status: 200,
                                headers: { 'Content-Type': 'text/html' }
                            }
                        );
                    }
                    
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
