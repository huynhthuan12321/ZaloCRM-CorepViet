// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';


// Node 26 có localStorage dựng sẵn che mất của jsdom (window.localStorage === undefined) -> dùng bản RAM.
function memoryStorage(failing = { value: false }) {
  const data = new Map<string, string>();
  const guard = () => { if (failing.value) throw new Error('denied'); };
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => { guard(); return data.has(k) ? data.get(k)! : null; },
    setItem: (k: string, v: string) => { guard(); data.set(k, String(v)); },
    removeItem: (k: string) => { guard(); data.delete(k); },
    clear: () => { data.clear(); },
  } as unknown as Storage;
}

const failing = { value: false };
let darkListeners: Set<(e: MediaQueryListEvent) => void>;
let systemDark = false;

function stubMatchMedia() {
  darkListeners = new Set();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    media: query,
    get matches() { return query.includes('prefers-color-scheme: dark') ? systemDark : false; },
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => darkListeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => darkListeners.delete(l),
  })));
  // jsdom không có window.matchMedia riêng: stubGlobal đã gắn cả vào window.
}

beforeEach(() => {
  failing.value = false;
  vi.stubGlobal('localStorage', memoryStorage(failing));
  Object.defineProperty(window, 'localStorage', { value: globalThis.localStorage, configurable: true });
  systemDark = false;
  stubMatchMedia();
  setActivePinia(createPinia());
});
afterEach(() => { vi.unstubAllGlobals(); });

async function loadStore() {
  const mod = await import('./ui-theme');
  return { mod, store: mod.useUiThemeStore() };
}

describe('useUiThemeStore', () => {
  it('mặc định là light; resolved = light', async () => {
    const { store } = await loadStore();
    expect(store.preference).toBe('light');
    expect(store.resolved).toBe('light');
  });

  it('giá trị lạ trong storage -> light', async () => {
    window.localStorage.setItem('crm.mobile.themePreference', 'neon');
    const { store } = await loadStore();
    expect(store.preference).toBe('light');
  });

  it('đọc giá trị hợp lệ đã lưu', async () => {
    window.localStorage.setItem('crm.mobile.themePreference', 'dark');
    const { store } = await loadStore();
    expect(store.preference).toBe('dark');
    expect(store.resolved).toBe('dark');
  });

  it('KHÔNG đọc key cũ "theme" (desktop ghi hsLight vào đó) và không ghi vào nó', async () => {
    window.localStorage.setItem('theme', 'dark');
    const { store } = await loadStore();
    expect(store.preference).toBe('light');
    store.setPreference('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark'); // nguyên trạng, store không đụng
    expect(window.localStorage.getItem('crm.mobile.themePreference')).toBe('dark');
  });

  it('system theo matchMedia và phản ứng khi máy đổi chế độ', async () => {
    systemDark = true;
    const { store } = await loadStore();
    store.setPreference('system');
    expect(store.systemPrefersDark).toBe(true);
    expect(store.resolved).toBe('dark');
    darkListeners.forEach(l => l({ matches: false } as MediaQueryListEvent));
    await nextTick();
    expect(store.resolved).toBe('light');
  });

  it('setPreference ghi storage; giá trị lạ bị chuẩn hóa về light', async () => {
    const { store } = await loadStore();
    store.setPreference('system');
    expect(window.localStorage.getItem('crm.mobile.themePreference')).toBe('system');
    store.setPreference('xyz' as never);
    expect(store.preference).toBe('light');
  });

  it('storage bị chặn (Safari private mode) -> vẫn chạy trong RAM', async () => {
    failing.value = true;
    const { store } = await loadStore();
    expect(store.preference).toBe('light');
    expect(() => store.setPreference('dark')).not.toThrow();
    expect(store.preference).toBe('dark');
  });

  it('lưu theo người dùng: mỗi user một lựa chọn, user chưa chọn -> light, logout không rò sang người kế', async () => {
    const { store } = await loadStore();
    store.bindUser('u1');
    store.setPreference('dark');
    expect(window.localStorage.getItem('crm.mobile.themePreference:u1')).toBe('dark');

    store.bindUser('u2');
    expect(store.preference).toBe('light'); // không thừa hưởng lựa chọn của u1
    store.setPreference('system');

    store.bindUser('u1');
    expect(store.preference).toBe('dark');
    store.bindUser('u2');
    expect(store.preference).toBe('system');

    store.bindUser(null); // logout: không mang lựa chọn của u2 sang màn đăng nhập/người kế
    expect(store.preference).toBe('light');
  });

  it('$dispose gỡ listener matchMedia', async () => {
    const { store } = await loadStore();
    expect(darkListeners.size).toBe(1);
    store.$dispose();
    expect(darkListeners.size).toBe(0);
  });
});
