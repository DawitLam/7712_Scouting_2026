// Service Worker for Team 7712 Scouting App
const CACHE_NAME = 'team-7712-scouting-v2.7.2';
const urlsToCache = [
    './',
    '/index.html',
    '/styles.css?v=20251216',
    '/app.js?v=2.7.2',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/team7712_logo_reefscape.png',
    '/vendor/qrcode.min.js',
    '/vendor/jsqr.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames.map((cn) => cn !== CACHE_NAME && caches.delete(cn))
        )).then(() => {
            // Force all open tabs to reload so they pick up the new version immediately
            return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clients) => clients.forEach((c) => c.navigate(c.url)));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    // Handle navigation requests (e.g., typing URL or refreshing) with offline fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).then((netRes) => {
                if (!netRes || netRes.status !== 200 || (netRes.type !== 'basic' && netRes.type !== 'cors')) return netRes;
                const copy = netRes.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return netRes;
            }).catch(() => caches.match('/index.html'));
        })
    );
});
