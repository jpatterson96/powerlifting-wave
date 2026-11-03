// Bump the version whenever any file changes so phones pick up the new copy.
const CACHE = 'wave-v11';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'logic.js',
  'sync.js',
  'rest.js',
  'charts.js',
  'extras.js',
  'merge.js',
  'manifest.webmanifest',
  'fonts/big-shoulders-display.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Answer from the cache straight away and refresh it in the background, so the app opens with no signal.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      event.waitUntil(network);
      return cached || network;
    }),
  );
});
