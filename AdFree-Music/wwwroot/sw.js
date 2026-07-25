// ─────────────────────────────────────────────────────────────────────────────
// AdFree Music — Service Worker v1
// Strategy:
//   • App shell (HTML, CSS, JS, fonts, icons) → Cache-first, update in background
//   • Audio streams (/api/stream/*) → Network-only  (live content, never cached here)
//   • API endpoints (/api/*) → Network-first with cache fallback
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = 'adfree-music-v1';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const API_CACHE     = `${CACHE_VERSION}-api`;

// Static assets to pre-cache on install
const SHELL_ASSETS = [
    '/',
    '/Search',
    '/Library',
    '/css/app.css',
    '/css/layout.css',
    '/css/home.css',
    '/css/search.css',
    '/js/app.js',
    '/js/player.js',
    '/js/search.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/favicon.ico'
];

// ─── Install: pre-cache app shell ────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: remove stale caches ───────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k.startsWith('adfree-music-') && k !== SHELL_CACHE && k !== API_CACHE)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ─── Fetch: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and cross-origin
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // Audio streams — always network-only, never cache
    if (url.pathname.startsWith('/api/stream/')) {
        return; // fall through to browser default
    }

    // Other API calls — network-first, cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    // App shell / static assets — cache-first, revalidate in background
    event.respondWith(cacheFirst(request, SHELL_CACHE));
});

// ─── Cache Strategies ─────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) {
        // Revalidate in background (stale-while-revalidate)
        updateCache(request, cacheName);
        return cached;
    }
    return fetchAndCache(request, cacheName);
}

async function networkFirst(request, cacheName) {
    try {
        return await fetchAndCache(request, cacheName);
    } catch {
        const cached = await caches.match(request);
        return cached ?? new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function fetchAndCache(request, cacheName) {
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
    }
    return response;
}

function updateCache(request, cacheName) {
    fetch(request).then(response => {
        if (response.ok) {
            caches.open(cacheName).then(cache => cache.put(request, response));
        }
    }).catch(() => {});
}
