// Self-destructing Service Worker
// Purpose: kill the stale Busan-era SW that some users still have cached
// on the stock-signal-eight.vercel.app origin. Browsers auto-check /sw.js
// for updates on every page navigation in scope (bypass-cache by default),
// so users who visit the URL will pick this up within 1-2 reloads.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Clear every cache in this origin
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((k) => caches.delete(k)));

    // 2. Unregister self
    await self.registration.unregister();

    // 3. Force all open tabs of this origin to reload with fresh network
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch (_) {}
    }
  })());
});

// No fetch handler — requests pass through to network normally.
