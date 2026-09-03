// Bump this on any deploy where the SW itself needs installed PWAs to
// actually notice - the fetch handler below deliberately serves the cached
// HTML shell instantly and only refreshes it in the background (for fast
// PWA startup), so a content-only deploy (CSS/JS/component changes with no
// edit to this file) leaves sw.js byte-identical - the browser's own SW
// update check finds nothing new, so neither the cache wipe on `activate`
// below NOR UpdateAvailableBanner's "Reload" prompt (main.tsx's
// 'controllerchange' listener, which only fires on a genuine new-worker
// install) ever trigger. Installed PWAs were stuck on a pre-deploy cached
// shell indefinitely - not just until their next relaunch - until this was
// bumped (found 25 Aug 2026: a same-day PageHeader/drawer-safe-area fix
// rendered correctly in a browser tab but stayed broken in the installed
// PWA). A fully automatic per-build version stamp would close this gap for
// every future deploy, not just this one - worth doing later, out of scope
// for this immediate fix.
// v23 (31 Aug 2026): 805a19d3 fixed the React <LoadingScreen> (inlined logo,
// render gated on authChecked) but sw.js was never bumped alongside it, so
// installed/cached browsers keep serving a pre-805a19d3 HTML shell - old
// bundle refs 404, forcing a recovery reload, and the boot logo flashes.
// v24 (2 Sep 2026): mobile card layout overhaul and auto-sync toolbar styling
// v25 (2 Sep 2026): logo un-rounding and interactive operational manual accordion
// v26 (2 Sep 2026): permanent drawer footer WhatsApp button and header title cleanup
// v27 (2 Sep 2026): standardize help drawer font sizes with rest of site
// v29 (2 Sep 2026): fix missing browser tab favicon across all tenant/property routes
// v30 (3 Sep 2026): performance bundle splitting and client-side image downscaler
// v31 (3 Sep 2026): Tally Prime XML export and GSTR-1 government tax CSV suite
// v32 (3 Sep 2026): direct Airbnb OAuth authorization and resilient room mapping
// v33 (3 Sep 2026): Airbnb switch software troubleshooting guide in wizard & help manual
// v34 (3 Sep 2026): retry and re-open Airbnb OAuth actions in connect wizard
// v35 (3 Sep 2026): Tenant Dashboard header cleanup, subtitle rename, and sticky bottom footer
// v36 (3 Sep 2026): Flowbite CRUD success modal for Airbnb OAuth landing page
const CACHE_NAME = 'farm-pos-v36';

// Hashed asset pattern — Vite content-hashed files (e.g. index-CrXjaekR.js)
// These must NEVER be cached by the SW; the browser cache handles them natively
// via the 1-year immutable Cache-Control headers set in .htaccess.
// Caching them in the SW causes stale asset failures after every new deployment.
const HASHED_ASSET_RE = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css|png|woff2?)(\?.*)?$/;

// 1. Install Event: Skip waiting (no pre-caching of JS/CSS bundles)
self.addEventListener('install', event => {
    self.skipWaiting();
});

// 2. Activate Event: Wipe ALL old caches and claim clients immediately
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(cacheNames.map(c => caches.delete(c)))
        ).then(() => self.clients.claim())
    );
});

const OFFLINE_FALLBACK_HTML =
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Offline — GroundCode Resort PMS</title>' +
    '<style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
    '.card{background:#1e293b;border:1px solid #334155;border-radius:24px;padding:40px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)}' +
    '.icon{width:64px;height:64px;margin:0 auto 20px;background:rgba(59,130,246,0.15);color:#60a5fa;border-radius:20px;display:flex;align-items:center;justify-content:center}' +
    'h2{margin:0 0 10px;font-size:22px;font-weight:700;color:#fff}p{margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.5}' +
    '.btn{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;width:100%;transition:all .2s}' +
    '.btn:hover{opacity:.9;transform:translateY(-1px)}</style></head><body>' +
    '<div class="card"><div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg></div>' +
    '<h2>You are currently offline</h2><p>Please check your internet connection and reload the application.</p>' +
    '<button class="btn" onclick="window.location.reload()">Retry Connection</button></div></body></html>';

// 3. Fetch Event: HTML shell uses stale-while-revalidate (paint instantly
// from cache, refresh in the background); everything else that reaches
// here (non-hashed static assets) stays network-first. Hashed assets and
// /php|/api calls never reach this — they're passed through above.
//
// Was network-first for HTML too (18 Aug 2026 fix): every PWA reopen blocked
// on a real network round-trip before React could even start mounting - on a
// cold relaunch (phone waking up radios, slow handshake) that round-trip is
// where the multi-second blank/loading-spinner delay came from. The static
// loader in index.html (#initial-loader) can only paint the instant #root
// exists in the DOM, which needs this HTML to have arrived first.
self.addEventListener('fetch', event => {
    // PASS-THROUGH: non-GET or non-HTTP requests
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    const url = new URL(event.request.url);

    // PASS-THROUGH: Vite hashed assets — let browser HTTP cache handle these
    if (HASHED_ASSET_RE.test(url.pathname)) {
        return;
    }

    // PASS-THROUGH: PHP API calls
    if (url.pathname.includes('/php/') || url.pathname.includes('/api/')) {
        return;
    }

    const isHtml = event.request.headers.get('accept')?.includes('text/html');

    if (isHtml) {
        event.respondWith(
            (async () => {
                const cachedResponse = await caches.match(event.request);

                const networkFetch = fetch(event.request)
                    .then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseToCache).catch(() => {});
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => null);

                if (cachedResponse) {
                    // Paint the cached shell now; refresh it in the background
                    // for next time without making this load wait on it. This
                    // is what "stale bundle → 404 → auto-reload" (index.html)
                    // still exists to catch: the shell we just served instantly
                    // may reference JS a deploy since then deleted.
                    event.waitUntil(networkFetch);
                    return cachedResponse;
                }

                // No cached shell yet (first-ever visit) - nothing to paint
                // instantly, so this one load has to wait on the network.
                const networkResponse = await networkFetch;
                if (networkResponse) return networkResponse;

                const spaFallback =
                    (await caches.match('/dist/index.html')) ||
                    (await caches.match('/index.html')) ||
                    (await caches.match('/'));
                if (spaFallback) return spaFallback;

                return new Response(OFFLINE_FALLBACK_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
            })()
        );
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() =>
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) return cachedResponse;
                return new Response(null, { status: 204, statusText: 'No Content' });
            })
        )
    );
});
