const CACHE = 'qwr-wallet-v3';
const SHELL = [
  '/wallet/',
  '/wallet/index.html',
  '/wallet/manifest.json',
  '/wallet/icon-192.png',
  '/wallet/icon-512.png',
  '/wallet/lib/secp256k1.js',
  '/wallet/lib/sha256.js',
  '/wallet/lib/ripemd160.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to network for the API
  if (url.hostname === 'api.qweercoin.com') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for app shell; cache response for future offline use
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
