// Minimal service worker for installability. It deliberately caches NOTHING and has no fetch
// handler: pages and API responses hold family data and must never end up in a cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  // Remove any caches an earlier version may have created.
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
});
