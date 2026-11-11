import { shallowRef } from 'vue';
import { isCrmOwnedCache, readServerPolicy } from './policy';

export const pwaWaiting = shallowRef(false);
export const pwaDisabled = shallowRef(false);
export const pwaUpdating = shallowRef(false);
let registration: ServiceWorkerRegistration | undefined;
let booted = false;
let updateRequested = false;
let activatedWithoutReload = false;
let previousController: ServiceWorker | null = null;
let canReload: () => boolean = () => false;

export function setPwaReloadGuard(guard: () => boolean): void { canReload = guard; }

export async function disablePwa(): Promise<void> {
  pwaDisabled.value = true; pwaWaiting.value = false; updateRequested = false; activatedWithoutReload = false;
  if ('serviceWorker' in navigator) {
    for (const entry of await navigator.serviceWorker.getRegistrations()) {
      if (new URL(entry.scope).pathname !== '/') continue;
      entry.active?.postMessage({ type: 'CRM_PWA_DISABLE' });
      await entry.unregister();
    }
  }
  if ('caches' in globalThis) for (const name of await caches.keys()) {
    if (isCrmOwnedCache(name, window.location.origin)) await caches.delete(name);
  }
}

export async function checkPwaUpdate(): Promise<void> {
  if (await readServerPolicy() === false) { await disablePwa(); return; }
  if (navigator.onLine) await registration?.update().catch(() => {});
  pwaWaiting.value = activatedWithoutReload || !!registration?.waiting;
}

export async function acceptPwaUpdate(): Promise<boolean> {
  if (!canReload() || pwaUpdating.value) return false;
  if (activatedWithoutReload) { window.location.reload(); return true; }
  if (!registration?.waiting) return false;
  updateRequested = true; pwaUpdating.value = true;
  registration.waiting.postMessage({ type: 'CRM_PWA_SKIP_WAITING' });
  return true;
}

export async function registerPwa(): Promise<void> {
  if (booted || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  booted = true;
  if (await readServerPolicy() === false) { await disablePwa(); return; }
  try {
    previousController = navigator.serviceWorker.controller;
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    pwaWaiting.value = !!registration.waiting;
    registration.addEventListener('updatefound', () => {
      const installing = registration?.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) pwaWaiting.value = true;
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const controller = navigator.serviceWorker.controller;
      if (!previousController || pwaDisabled.value || !controller) { previousController = controller; return; }
      previousController = controller;
      if (updateRequested && canReload()) window.location.reload();
      else { activatedWithoutReload = true; pwaWaiting.value = true; updateRequested = false; pwaUpdating.value = false; }
    });
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'CRM_PWA_DISABLED') { pwaDisabled.value = true; pwaWaiting.value = false; }
    });
    window.addEventListener('online', () => { void checkPwaUpdate(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkPwaUpdate(); });
    window.setInterval(() => { if (!document.hidden && navigator.onLine) void checkPwaUpdate(); }, 60_000);
  } catch (error) {
    // Registration failure must never prevent the regular web application from starting.
    console.warn('[PWA] Registration unavailable', error);
  }
}
