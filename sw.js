// Offline support: app files are network-first (always fresh online, cached for offline);
// map tiles and fonts are cache-first with a size cap. Firestore traffic is never touched.
const VERSION = 'v0.2.0-2';
const APP_CACHE = 'app-' + VERSION;
const TILE_CACHE = 'tiles-v1';
const FONT_CACHE = 'fonts-v1';
const TILE_LIMIT = 2500;

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'app/styles.css', 'app/main.js', 'app/config.js', 'app/icons.js', 'app/util.js', 'app/sun.js', 'app/prefs.js',
  'app/store.js', 'app/cloud.js', 'app/trip.js', 'app/research.js', 'app/geo.js', 'app/map.js', 'app/gmap.js', 'app/pins.js', 'app/state.js',
  'app/ui/core.js', 'app/ui/places.js', 'app/ui/mapview.js', 'app/ui/card.js', 'app/ui/edit.js', 'app/ui/today.js',
  'app/ui/trip.js', 'app/ui/lists.js', 'app/ui/inbox.js', 'app/ui/settings.js', 'app/ui/sheet.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/leaflet.markercluster.js', 'vendor/leaflet/MarkerCluster.css',
  'vendor/firebase.js', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'data/research/index.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((k) => k.startsWith('app-') && k !== APP_CACHE)
    .map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles: cache-first.
  if (/tile\.openstreetmap\.(org|de)$/.test(url.hostname)) {
    e.respondWith(caches.open(TILE_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(TILE_CACHE, TILE_LIMIT); }
        return res;
      } catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  // Fonts: cache-first.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); c.put(req, res.clone()); return res; } catch (err) { return Response.error(); }
    }));
    return;
  }

  // Our own files: network-first, fall back to cache.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
  }
});
