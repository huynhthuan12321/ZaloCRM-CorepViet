import { CONTROL_URL, SHELL_CACHE_PREFIX, isSpaPath, isStaticShellPath, isShellContentType, isCrmOwnedCache, readServerPolicy, shellCacheName, type ShellEntry } from './policy';
interface LifetimeEvent { waitUntil(promise: Promise<unknown>): void }
interface WorkerClient { postMessage(message: unknown): void }
interface PwaWorkerScope {
  __WB_MANIFEST: ShellEntry[];
  location: { origin: string };
  registration: ServiceWorkerRegistration;
  clients: { claim(): Promise<void>; matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WorkerClient[]> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', handler: (event: LifetimeEvent) => void): void;
  addEventListener(type: 'fetch', handler: (event: { request: Request; respondWith(response: Promise<Response>): void }) => void): void;
  addEventListener(type: 'message', handler: (event: LifetimeEvent & { data?: { type?: string } }) => void): void;
}
// Local structural worker types avoid adding WebWorker globals to the Vue/DOM tsconfig.
declare const self: PwaWorkerScope;
const entries = self.__WB_MANIFEST;
const cacheName = shellCacheName(entries);
const known = new Map(entries.map(entry => [new URL(entry.url, self.location.origin + '/').href, entry]));
let disabled = false;

async function notifyDisabled(): Promise<void> {
  disabled = true;
  for (const name of await caches.keys()) if (isCrmOwnedCache(name, self.location.origin)) await caches.delete(name);
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    client.postMessage({ type: 'CRM_PWA_DISABLED' });
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (await readServerPolicy() === false) { await notifyDisabled(); await self.skipWaiting(); return; }
    // Fail closed: a mistaken build glob must not put API/media/PII in the precache.
    if ([...known.keys()].some(url => !isStaticShellPath(new URL(url).pathname))) throw new Error('PWA unsafe precache entry');
    const cache = await caches.open(cacheName);
    // Six concurrent requests stay below Safari connection pressure and Quick Tunnel in-flight caps.
    const urls = [...known.keys()];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        const response = await fetch(url, { cache: 'reload', credentials: 'omit' });
        if (!response.ok || !isShellContentType(new URL(url).pathname, response.headers.get('content-type') ?? '')) throw new Error('PWA shell asset unavailable or wrong MIME');
        await cache.put(url, response);
      }
    }));
    // Deliberately no skipWaiting. A new build stays waiting until the user accepts it.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (disabled || await readServerPolicy() === false) { await notifyDisabled(); return; }
    // Keep previous static build caches for other tabs still composing against an old build.
    // They contain only the same allowlisted public files; logout cleanup removes non-shell caches.
    await self.clients.claim();
  })());
});

async function cachedStatic(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.origin + url.pathname;
  const names = await caches.keys();
  for (const name of [cacheName, ...names.filter(n => n !== cacheName && n.startsWith(SHELL_CACHE_PREFIX))]) {
    const response = await (await caches.open(name)).match(key);
    if (response) return response;
  }
  return fetch(request);
}

async function navigation(request: Request): Promise<Response> {
  if (await readServerPolicy() === false) { await notifyDisabled(); return fetch(request); }
  try {
    // Never cache navigation responses: URLs may contain private IDs or public action tokens.
    // A maintenance/authorization/HTTP error is returned as-is, not hidden by the offline shell.
    return await fetch(request);
  } catch (error) {
    const shell = await (await caches.open(cacheName)).match(new URL('/index.html', self.location.origin).href);
    if (shell) return shell;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (disabled || request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === CONTROL_URL) return;
  if (request.mode === 'navigate' && isSpaPath(url.pathname)) {
    event.respondWith(navigation(request)); return;
  }
  // Only exact entries from a verified precache (or a prior static build), never arbitrary /assets uploads.
  if (!url.search && isStaticShellPath(url.pathname)) event.respondWith(cachedStatic(request));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'CRM_PWA_SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CRM_PWA_DISABLE') event.waitUntil(notifyDisabled());
});
