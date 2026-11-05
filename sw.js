// Bump the version whenever any file changes so phones pick up the new copy.
const CACHE = 'wave-v18';
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
  'pad.js',
  'pics.js',
  'show.js',
  'stats.js',
  'manifest.webmanifest',
  'fonts/big-shoulders-display.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  // The exercise pictures, one per key in pics.js.
  ...['leg-press-calf', 'leg-press', 'seated-calf-raise', 'standing-calf-raise', 'hack-squat', 'step-up', 'pistol-squat', 'squat',
    'leg-extension', 'lying-leg-curl', 'seated-leg-curl', 'hip-thrust', 'glute-bridge', 'deadlift', 'preacher-curl-barbell', 'preacher-curl',
    'barbell-curl', 'dumbbell-curl', 'skull-crusher', 'pushdown', 'dips', 'lat-pulldown-wide', 'lat-pulldown-vbar', 'lat-pulldown', 'pull-up',
    'inverted-row', 'one-arm-row', 'chest-supported-row', 'seated-cable-row', 'dumbbell-row', 'bent-over-row', 'face-pull', 'reverse-fly',
    'pec-deck', 'cable-fly', 'lateral-raise', 'shrug', 'shoulder-press-dumbbell', 'overhead-press-barbell', 'shoulder-press-machine',
    'incline-dumbbell-press', 'incline-barbell-press', 'dumbbell-bench-press', 'chest-press-machine', 'bench-press', 'crunch', 'push-up',
  ].map((k) => `pics/${k}.svg`),
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
