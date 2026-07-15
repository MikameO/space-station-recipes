// B2: offline service worker.
// Strategy: precache the core shell at install; every same-origin GET is
// network-first with cache fallback — fresh while online, functional offline.
// data.json is requested with a ?v=Date.now() cache-buster, so fallback
// matching ignores the query string to hit the cached copy.
const CACHE = 'chemdb-v13';
// Data lives in its own UNVERSIONED cache: shell-cache bumps must never
// wipe the 3MB data.json — losing it right after an update + one flaky
// network moment = hard "Failed to load" (user-reported on mobile).
const DATA_CACHE = 'chemdb-data';
const PRECACHE = [
  './',
  './index.html',
  './style.css?v=28',
  './app.js?v=26',
  './tutorial.js?v=2',
  './maps.js?v=10',
  './manifest.json',
  './libs/vis-network.min.js',
];
// Maps data (maps/index.json + per-map PNG/JSON) is NOT precached: one station's
// JSON runs to ~1MB and the tab lazy-loads only what you open. The generic
// network-first handler below caches each map you visit, so a map you've looked
// at once stays available offline.

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // data.json (3MB): stale-while-revalidate — serve the cached copy
  // instantly, refresh in the background. First visit falls through to
  // the network. This is what makes reopening (and the PiP companion
  // window) near-instant.
  if (url.pathname.endsWith('/data.json')) {
    e.respondWith(
      caches.open(DATA_CACHE).then(dc =>
        dc.match(url.pathname).then(cached => {
          const fresh = fetch(e.request).then(resp => {
            if (resp.ok) dc.put(url.pathname, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fresh;
        }))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() =>
        caches.match(e.request)
          .then(m => m || caches.match(e.request, { ignoreSearch: true }))
          .then(m => m || (e.request.mode === 'navigate'
            ? caches.match('./index.html', { ignoreSearch: true })
            : undefined))
      )
  );
});
