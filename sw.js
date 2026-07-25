const CACHE_NAME = 'farm-pos-v2';

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
                    
                    // Silent 204 No Content for missing background assets instead of throwing 408
                    return new Response('', { status: 204, statusText: 'No Content' });
                });
            })
    );
});