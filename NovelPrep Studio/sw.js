const CACHE_NAME = 'novelprep-studio-cache-v1.2.7';
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/normalizer.js',
    './js/epub_extractor.js',
    './js/url_fetcher.js',
    './libs/jszip.min.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME ? caches.delete(k) : null))).then(() => self.clients.claim())
    );
});

// Network-First 전략: 온라인 상태에서는 항상 최신 배포 코드를 가져오고, 오프라인 시 캐시 사용
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
                const clone = networkRes.clone();
                caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
            }
            return networkRes;
        }).catch(() => {
            return caches.match(e.request).then((cached) => cached || caches.match('./index.html'));
        })
    );
});
