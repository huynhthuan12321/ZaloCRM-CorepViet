// Emergency replacement for /sw.js, served from the ORIGINAL ROOT scope with no-store.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const origin = self.location.origin;
  for (const name of await caches.keys()) {
    const owned = /^(?:crm-pwa-shell-|crm-user-|zalocrm[-_:])/.test(name)
      || name === `workbox-runtime-${origin}/`
      || /^workbox-precache-v\d+-/.test(name) && name.endsWith(`-${origin}/`);
    if (owned) await caches.delete(name);
  }
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage({ type: 'CRM_PWA_DISABLED' });
  await self.registration.unregister();
})()));
// No fetch handler, no navigation/reload, no token removal, no API/customer caches.
