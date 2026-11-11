// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
// Vuetify thật chèn stylesheet @layer mà jsdom 25 không parse được (log lỗi giả) -> mock useTheme, kiểm đúng lệnh change().
const vuetifyMock = vi.hoisted(() => ({ name: { value: 'hsLight' }, change: null as any }));
vi.mock('vuetify', () => ({
  useTheme: () => ({ change: vuetifyMock.change, global: { name: vuetifyMock.name } }),
}));

import { THEME_COLOR, useMobileThemeEffects } from './use-mobile-theme-effects';
import { useUiThemeStore } from '@/stores/ui-theme';


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

// vitest chặn css (?raw trả rỗng) và dự án không có @types/node -> đọc file bằng built-in của Node.
const readText = (rel: string): string =>
  (globalThis as any).process.getBuiltinModule('node:fs').readFileSync(new URL(rel, import.meta.url), 'utf8');

let systemDark = false;
const forceLight = ref(false);

function meta(name: string) {
  return document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.getAttribute('content');
}

function mountHost() {
  let effective!: { value: string };
  const Host = defineComponent({
    setup() {
      const fx = useMobileThemeEffects({ forceLight });
      effective = fx.effective;
      return () => h('div');
    },
  });
  const wrapper = mount(Host);
  return { wrapper, get name() { return vuetifyMock.name.value; }, effective: () => effective.value };
}

beforeEach(() => {
  vuetifyMock.name.value = 'hsLight';
  vuetifyMock.change = vi.fn((name: string) => { vuetifyMock.name.value = name; });
  document.head.innerHTML = '<meta name="color-scheme" content="light only"><meta name="theme-color" content="#0A192F">';
  document.documentElement.removeAttribute('data-theme');
  vi.stubGlobal('localStorage', memoryStorage());
  Object.defineProperty(window, 'localStorage', { value: globalThis.localStorage, configurable: true });
  systemDark = false;
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    get matches() { return query.includes('prefers-color-scheme: dark') ? systemDark : false; },
    addEventListener: () => {},
    removeEventListener: () => {},
  })));
  forceLight.value = false;
  setActivePinia(createPinia());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('useMobileThemeEffects', () => {
  it('Sáng: hsLight, data-theme=light, color-scheme "light only", theme-color nền sáng', () => {
    const host = mountHost();
    expect(host.name).toBe('hsLight');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(meta('color-scheme')).toBe('light only');
    expect(meta('theme-color')).toBe('#f7f9fc');
    host.wrapper.unmount();
  });

  it('đổi sang Tối: hsDark, data-theme=dark, color-scheme "dark", theme-color nền tối', async () => {
    const host = mountHost();
    useUiThemeStore().setPreference('dark');
    await host.wrapper.vm.$nextTick();
    expect(host.name).toBe('hsDark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(meta('color-scheme')).toBe('dark');
    expect(meta('theme-color')).toBe('#0f1720');
    host.wrapper.unmount();
  });

  it('Theo máy: theo prefers-color-scheme', () => {
    systemDark = true;
    setActivePinia(createPinia());
    useUiThemeStore().setPreference('system');
    const host = mountHost();
    expect(host.effective()).toBe('dark');
    expect(host.name).toBe('hsDark');
    host.wrapper.unmount();
  });

  it('Báo cáo ép Sáng dù đang chọn Tối, rồi trở lại Tối khi rời Báo cáo', async () => {
    useUiThemeStore().setPreference('dark');
    const host = mountHost();
    expect(host.name).toBe('hsDark');
    forceLight.value = true;
    await host.wrapper.vm.$nextTick();
    expect(host.effective()).toBe('light');
    expect(host.name).toBe('hsLight');
    expect(meta('color-scheme')).toBe('light only');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    forceLight.value = false;
    await host.wrapper.vm.$nextTick();
    expect(host.name).toBe('hsDark');
    host.wrapper.unmount();
  });

  it('unmount (sang desktop) khôi phục: hsLight, gỡ data-theme, color-scheme sáng, theme-color ban đầu', () => {
    useUiThemeStore().setPreference('dark');
    const host = mountHost();
    expect(host.name).toBe('hsDark');
    host.wrapper.unmount();
    expect(host.name).toBe('hsLight');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(meta('color-scheme')).toBe('light only');
    expect(meta('theme-color')).toBe('#0A192F');
  });

  it('Tối: nền html/body = token nền tối; sang Báo cáo hoặc unmount khôi phục giá trị cũ', async () => {
    document.documentElement.style.backgroundColor = 'rgb(1, 2, 3)';
    document.body.style.backgroundColor = '';
    useUiThemeStore().setPreference('dark');
    const host = mountHost();
    expect(document.documentElement.style.backgroundColor).toBe('rgb(15, 23, 32)');
    expect(document.body.style.backgroundColor).toBe('rgb(15, 23, 32)');
    forceLight.value = true;
    await host.wrapper.vm.$nextTick();
    expect(document.documentElement.style.backgroundColor).toBe('rgb(1, 2, 3)');
    expect(document.body.style.backgroundColor).toBe('');
    forceLight.value = false;
    await host.wrapper.vm.$nextTick();
    expect(document.documentElement.style.backgroundColor).toBe('rgb(15, 23, 32)');
    host.wrapper.unmount();
    expect(document.documentElement.style.backgroundColor).toBe('rgb(1, 2, 3)');
    expect(document.body.style.backgroundColor).toBe('');
    document.documentElement.style.backgroundColor = '';
  });

  it('THEME_COLOR khớp --m-bg trong mobile-tokens.css (Sáng và Tối)', () => {
    const css = readText('../assets/mobile-tokens.css');
    const bgOf = (selector: string) => {
      const start = css.indexOf(selector);
      const block = css.slice(css.indexOf('{', start), css.indexOf('}', start));
      return block.match(/--m-bg:\s*(#[0-9a-fA-F]+)/)?.[1];
    };
    const light = bgOf('.crm-mobile {');
    const dark = bgOf('.crm-mobile[data-theme="dark"]');
    expect(light?.toLowerCase()).toBe(THEME_COLOR.light);
    expect(dark?.toLowerCase()).toBe(THEME_COLOR.dark);
  });
});
