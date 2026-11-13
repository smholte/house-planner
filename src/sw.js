/* House Planner service worker: keeps the app available offline. Your data is not here; it lives in IndexedDB.
   The asset library (lib/, task 0009) is left alone: the app keeps what it fetched from there in its own database
   (house-planner-lib), so a new version of the app does not download the pictures and models again. */
const CACHE = 'hp-__VERSION__';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('hp-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdnjs.cloudflare.com';   // pdf.js, only loaded when a PDF is imported
  if (!same && !cdn) return;
  if (same && url.pathname.startsWith(new URL('lib/', self.registration.scope).pathname)) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const key = req.mode === 'navigate' ? './index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: same });
    const fresh = fetch(req).then(res => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(fresh); return cached; }
    const res = await fresh;
    return res || (await cache.match('./index.html')) || Response.error();
  }));
});
