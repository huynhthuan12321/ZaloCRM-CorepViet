import 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let listeners: Map<string, (event?: { data?: { type: string } }) => void>;
let registration: { waiting: { postMessage: ReturnType<typeof vi.fn> } | null; active: { postMessage: ReturnType<typeof vi.fn> }; unregister: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
let reload: ReturnType<typeof vi.fn>;
let register: ReturnType<typeof vi.fn>;
let control: ReturnType<typeof vi.fn>;
let module: typeof import('./register');
beforeEach(async () => {
  vi.resetModules(); listeners = new Map(); reload = vi.fn();
  registration = { waiting: { postMessage: vi.fn() }, active: { postMessage: vi.fn() }, unregister: vi.fn().mockResolvedValue(true), addEventListener: vi.fn(), update: vi.fn().mockResolvedValue(undefined) };
  register = vi.fn().mockResolvedValue(registration);
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: { controller: { old: true }, register, getRegistrations: vi.fn().mockResolvedValue([{ ...registration, scope: 'https://crm.test/' }]), addEventListener: (type: string, handler: (event?: { data?: { type: string } }) => void) => { listeners.set(type, handler); } } });
  vi.stubGlobal('window', { isSecureContext: true, location: { reload }, addEventListener: vi.fn(), setInterval: vi.fn() });
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn() });
  vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['crm-pwa-shell-old', 'crm-user-cache', 'foreign-app-cache']), delete: vi.fn().mockResolvedValue(true) });
  control = vi.fn().mockResolvedValue(new Response('{"enabled":true}')); vi.stubGlobal('fetch', control);
  module = await import('./register');
});
afterEach(() => vi.unstubAllGlobals());
describe('PWA update acceptance', () => {
  it('registers at root without cached worker updates and never reloads automatically', async () => {
    await module.registerPwa();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    expect(module.pwaWaiting.value).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
  it('blocks the update while a draft or outbox item remains', async () => {
    await module.registerPwa(); module.setPwaReloadGuard(() => false);
    expect(await module.acceptPwaUpdate()).toBe(false);
    expect(registration.waiting!.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it('rechecks draft guard at controllerchange; new typing during activation is preserved', async () => {
    await module.registerPwa(); module.setPwaReloadGuard(() => true);
    expect(await module.acceptPwaUpdate()).toBe(true);
    expect(registration.waiting!.postMessage).toHaveBeenCalledWith({ type: 'CRM_PWA_SKIP_WAITING' });
    module.setPwaReloadGuard(() => false);
    listeners.get('controllerchange')!();
    expect(reload).not.toHaveBeenCalled();
    expect(module.pwaWaiting.value).toBe(true);
    module.setPwaReloadGuard(() => true);
    expect(await module.acceptPwaUpdate()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('another tab activation only shows the prompt; does not reload this tab even if currently clean', async () => {
    await module.registerPwa(); module.setPwaReloadGuard(() => true);
    listeners.get('controllerchange')!();
    expect(reload).not.toHaveBeenCalled();
    expect(module.pwaWaiting.value).toBe(true);
  });
  it('server kill-switch unregisters root workers and clears caches without reload or auth changes', async () => {
    control.mockResolvedValue(new Response('{"enabled":false}'));
    await module.registerPwa();
    expect(register).not.toHaveBeenCalled();
    expect(registration.unregister).toHaveBeenCalled();
    expect(caches.delete).toHaveBeenCalledWith('crm-user-cache');
    expect(caches.delete).not.toHaveBeenCalledWith('foreign-app-cache');
    expect(module.pwaDisabled.value).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
