import { SHELL_CACHE_PREFIX, isCrmOwnedCache, isCrmUserDatabase } from './policy';

/** PWA creates no user IndexedDB or response cache. Remove any legacy user/runtime stores at a session boundary. */
export async function clearUserBrowserStorage(): Promise<boolean> {
  let complete = true;
  if ('caches' in globalThis) {
    for (const name of await caches.keys()) {
      if (!name.startsWith(SHELL_CACHE_PREFIX) && isCrmOwnedCache(name, typeof location === 'undefined' ? undefined : location.origin)) await caches.delete(name);
    }
  }
  if ('indexedDB' in globalThis) {
    // No IndexedDB is introduced by this sprint. Old WebKit without enumeration can still remove known legacy stores.
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [{ name: 'workbox-expiration' }, { name: 'crm-user-cache' }, { name: 'zalocrm-user-cache' }];
    for (const database of databases) {
      if (!database.name || !isCrmUserDatabase(database.name)) continue;
      const done = await new Promise<boolean>(resolve => {
        const request = indexedDB.deleteDatabase(database.name!);
        const timeout = setTimeout(() => resolve(false), 3000);
        const finish = (value: boolean) => { clearTimeout(timeout); resolve(value); };
        request.onsuccess = () => finish(true);
        request.onerror = () => finish(false);
        request.onblocked = () => finish(false);
      });
      complete = complete && done;
    }
  }
  return complete;
}
