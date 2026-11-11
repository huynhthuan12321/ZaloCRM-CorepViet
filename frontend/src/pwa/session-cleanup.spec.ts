import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearUserBrowserStorage } from './session-cleanup';
afterEach(() => vi.unstubAllGlobals());
describe('PWA session cleanup', () => {
  it('keeps static shell and removes legacy user caches/IndexedDB', async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['crm-pwa-shell-v1', 'crm-user-api-cache', 'foreign-app-cache']), delete: del });
    const deleteDatabase = vi.fn(() => {
      const req: { onsuccess?: () => void } = {};
      queueMicrotask(() => req.onsuccess?.()); return req;
    });
    vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([{ name: 'crm-user-legacy-db' }, { name: 'foreign-app-db' }]), deleteDatabase });
    expect(await clearUserBrowserStorage()).toBe(true);
    expect(del).toHaveBeenCalledWith('crm-user-api-cache'); expect(del).not.toHaveBeenCalledWith('crm-pwa-shell-v1');
    expect(deleteDatabase).toHaveBeenCalledWith('crm-user-legacy-db');
    expect(deleteDatabase).not.toHaveBeenCalledWith('foreign-app-db');
    expect(del).not.toHaveBeenCalledWith('foreign-app-cache');
  });
  it('reports blocked legacy database deletion so UI can request closing another tab', async () => {
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]) });
    vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([{ name: 'crm-user-legacy' }]), deleteDatabase: () => {
      const req: { onblocked?: () => void } = {}; queueMicrotask(() => req.onblocked?.()); return req;
    } });
    expect(await clearUserBrowserStorage()).toBe(false);
  });
});
