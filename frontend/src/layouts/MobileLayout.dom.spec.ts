// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

const state = vi.hoisted(() => ({
  auth: null as any,
  online: null as any,
  themeName: { value: 'hsLight' },
  change: null as any,
}));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('@/api/index', () => ({ api: { get: vi.fn().mockResolvedValue({ data: { unreplied: 3 } }) } }));
vi.mock('@/composables/use-mobile', () => ({
  useMobile: () => ({ isMobile: ref(true), isOnline: state.online }),
  MOBILE_MEDIA_QUERY: 'not all and (min-width: 768px)',
}));
vi.mock('@/components/ui/ToastContainer.vue', () => ({ default: { template: '<div class="toast-container-stub" />' } }));
vi.mock('vuetify', () => ({ useTheme: () => ({ change: state.change, global: { name: state.themeName } }) }));
vi.mock('@/components/NotificationBell.vue', () => ({ default: { template: '<button class="bell" aria-label="Thông báo" />' } }));

import MobileLayout from './MobileLayout.vue';
import { useUiThemeStore } from '@/stores/ui-theme';
import { MOBILE_SESSION_RESET_EVENT, useMobileShell } from '@/components/mobile/shell/shell-context';

function memoryStorage() {
  const data = new Map<string, string>();
  const reads: string[] = [];
  const writes: string[] = [];
  const storage = {
    getItem: (k: string) => { reads.push(k); return data.has(k) ? data.get(k)! : null; },
    setItem: (k: string, v: string) => { writes.push(k); data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  return { storage, reads, writes };
}

// vitest chặn css (?raw trả rỗng) và dự án không có @types/node -> đọc file bằng built-in của Node.
const readText = (rel: string): string =>
  (globalThis as any).process.getBuiltinModule('node:fs').readFileSync(new URL(rel, import.meta.url), 'utf8');

const VApp = { template: '<div class="v-app"><slot /></div>' };
const Page = { template: '<div class="page">page</div>' };

async function mountAt(path: string, slot: unknown = Page) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Dashboard', component: Page },
      { path: '/chat/:convId?', name: 'Chat', component: Page },
      { path: '/account', name: 'Account', component: Page },
      { path: '/media', name: 'Media', component: Page },
      { path: '/reports/tong-quan', name: 'Reports.Overview', component: Page },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(MobileLayout, {
    slots: { default: () => h(slot as never) },
    global: { plugins: [router], stubs: { VApp } },
  });
  await flushPromises();
  return { wrapper, router };
}

let mem: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  mem = memoryStorage();
  vi.stubGlobal('localStorage', mem.storage);
  Object.defineProperty(window, 'localStorage', { value: mem.storage, configurable: true });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })));
  document.head.innerHTML = '<meta name="color-scheme" content="light only"><meta name="theme-color" content="#0A192F">';
  state.themeName.value = 'hsLight';
  state.change = vi.fn((n: string) => { state.themeName.value = n; });
  state.online = ref(true);
  state.auth = reactive({
    user: { id: 'u1', fullName: 'Người Dùng A', orgName: 'Tổ chức A', role: 'admin' },
    canAccess: () => true,
  });
  setActivePinia(createPinia());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('MobileLayout', () => {
  it('khung flex: header + main + tabbar 5 mục; không còn v-app-bar / v-bottom-navigation / padding 72px', async () => {
    const { wrapper } = await mountAt('/');
    expect(wrapper.find('header.m-header').exists()).toBe(true);
    expect(wrapper.get('h1').text()).toBe('Tổng quan');
    expect(wrapper.find('main.m-main .page').exists()).toBe(true);
    expect(wrapper.findAll('nav a.m-tab')).toHaveLength(5);
    expect(wrapper.find('.v-app-bar').exists()).toBe(false);
    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('72px');
    expect(wrapper.html()).not.toMatch(/100vh/);
    wrapper.unmount();
  });

  it('root .crm-mobile nhận cssVars viewport: không có VisualViewport (jsdom) -> 100dvh', async () => {
    const { wrapper } = await mountAt('/');
    const root = wrapper.get('.crm-mobile.m-shell');
    expect(root.attributes('style')).toContain('--m-app-height: 100dvh');
    expect(root.attributes('style')).toContain('--m-keyboard-inset: 0px');
    expect(root.attributes('data-theme')).toBe('light');
    wrapper.unmount();
  });

  it('không còn toggle theme cũ: không đọc/ghi localStorage "theme", không có nút đổi theme/đăng xuất ở header', async () => {
    const { wrapper } = await mountAt('/');
    expect(mem.reads).not.toContain('theme');
    expect(mem.writes).not.toContain('theme');
    expect(wrapper.find('button[aria-label="Đăng xuất"]').exists()).toBe(false);
    expect(wrapper.find('.mdi-weather-night, .mdi-weather-sunny').exists()).toBe(false);
    wrapper.unmount();
  });

  it('chọn Tối -> root data-theme=dark, Vuetify hsDark, html data-theme=dark; unmount trả về sáng', async () => {
    const { wrapper } = await mountAt('/');
    useUiThemeStore().setPreference('dark');
    await flushPromises();
    expect(wrapper.get('.m-shell').attributes('data-theme')).toBe('dark');
    expect(state.themeName.value).toBe('hsDark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    wrapper.unmount();
    expect(state.themeName.value).toBe('hsLight');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('lưu giao diện theo người dùng (khóa có id), không phải khóa chung', async () => {
    const { wrapper } = await mountAt('/');
    useUiThemeStore().setPreference('dark');
    expect(mem.writes).toContain('crm.mobile.themePreference:u1');
    expect(mem.writes).not.toContain('theme');
    wrapper.unmount();
  });

  it('Báo cáo: class rpt-mobile-app, header riêng "Báo cáo · CRM · tổ chức", luôn Sáng dù đang chọn Tối', async () => {
    useUiThemeStore().setPreference('dark');
    const { wrapper } = await mountAt('/reports/tong-quan');
    expect(wrapper.get('.v-app').classes()).toEqual(expect.arrayContaining(['rpt-app', 'rpt-mobile-app']));
    expect(wrapper.get('h1').text()).toBe('Báo cáo');
    expect(wrapper.get('header').text()).toContain('CRM · Tổ chức A');
    expect(wrapper.get('header').classes()).toContain('m-header--brand');
    expect(wrapper.get('.m-shell').attributes('data-theme')).toBe('light');
    expect(state.themeName.value).toBe('hsLight');
    expect(wrapper.find('button[aria-label="Quay lại"]').exists()).toBe(true);
    // tabbar vẫn có và sáng mục Tài khoản
    expect(wrapper.get('a[aria-current="page"]').text()).toBe('Tài khoản');
    wrapper.unmount();
  });

  it('thread /chat/:convId: ẩn tabbar + header; main nhận safe-area trên/dưới', async () => {
    const { wrapper } = await mountAt('/chat/abc');
    expect(wrapper.find('header').exists()).toBe(false);
    expect(wrapper.find('nav.m-tabbar').exists()).toBe(false);
    const main = wrapper.get('main');
    expect(main.classes()).toContain('m-main--pad-top');
    expect(main.classes()).toContain('m-main--pad-bottom');
    wrapper.unmount();
  });

  it('inbox /chat: có header + tabbar, Hội thoại sáng và có badge khách chờ', async () => {
    const { wrapper } = await mountAt('/chat');
    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.get('a[aria-current="page"]').text()).toContain('Hội thoại');
    expect(wrapper.get('.m-tab__badge').text()).toBe('3');
    wrapper.unmount();
  });

  it('màn con tab Tài khoản (/media): có nút quay lại', async () => {
    const { wrapper } = await mountAt('/media');
    expect(wrapper.get('h1').text()).toBe('Kho media');
    expect(wrapper.find('button[aria-label="Quay lại"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('offline: banner trong luồng, header không cộng safe-top lần hai (class m-shell--banner)', async () => {
    state.online.value = false;
    const { wrapper } = await mountAt('/');
    expect(wrapper.get('.m-offline').text()).toBe('Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng');
    expect(wrapper.get('.m-shell').classes()).toContain('m-shell--banner');
    wrapper.unmount();
  });

  it('màn con xin ẩn header qua useMobileShell().requestChrome và tự trả lại khi unmount', async () => {
    let release = () => {};
    const Child = defineComponent({
      setup() {
        release = useMobileShell().requestChrome({ header: false });
        return () => h('div', { class: 'child' });
      },
    });
    const { wrapper } = await mountAt('/', Child);
    expect(wrapper.find('header').exists()).toBe(false);
    release();
    await flushPromises();
    expect(wrapper.find('header').exists()).toBe(true);
    wrapper.unmount();
  });

  it('logout / đổi user: phát MOBILE_SESSION_RESET_EVENT, badge về null, giao diện gắn theo user mới', async () => {
    const events: Array<{ previousUserId: string | null; userId: string | null }> = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(MOBILE_SESSION_RESET_EVENT, listener);
    const { wrapper } = await mountAt('/chat');
    expect(wrapper.find('.m-tab__badge').exists()).toBe(true);
    expect(events).toEqual([]); // mount đầu tiên không phải reset

    useUiThemeStore().setPreference('dark');
    state.auth.user = null;
    await flushPromises();
    expect(events).toEqual([{ previousUserId: 'u1', userId: null }]);
    expect(wrapper.find('.m-tab__badge').exists()).toBe(false);
    expect(useUiThemeStore().preference).toBe('light'); // lựa chọn của u1 không rò sang phiên sau

    // null -> id (đăng nhập lại) KHÔNG phát thêm sự kiện reset
    state.auth.user = { id: 'u2', fullName: 'B', orgName: 'O', role: 'admin' };
    await flushPromises();
    expect(events).toHaveLength(1);
    window.removeEventListener(MOBILE_SESSION_RESET_EVENT, listener);
    wrapper.unmount();
  });

  it('đổi trực tiếp A -> B: phát đúng một sự kiện, badge hiện số của B (không bị reset hủy request)', async () => {
    const events: Array<{ previousUserId: string | null; userId: string | null }> = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(MOBILE_SESSION_RESET_EVENT, listener);
    const { api } = await import('@/api/index');
    const get = api.get as unknown as ReturnType<typeof vi.fn>;
    const { wrapper } = await mountAt('/chat');
    expect(wrapper.get('.m-tab__badge').text()).toBe('3');
    get.mockResolvedValue({ data: { unreplied: 8 } });

    state.auth.user = { id: 'u2', fullName: 'B', orgName: 'O', role: 'admin' };
    await flushPromises();
    expect(events).toEqual([{ previousUserId: 'u1', userId: 'u2' }]);
    expect(wrapper.get('.m-tab__badge').text()).toBe('8');
    get.mockResolvedValue({ data: { unreplied: 3 } });
    window.removeEventListener(MOBILE_SESSION_RESET_EVENT, listener);
    wrapper.unmount();
  });

  it('lần đầu có user (null -> id, đăng nhập/F5 muộn) không phát reset', async () => {
    state.auth.user = null;
    const events: unknown[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(MOBILE_SESSION_RESET_EVENT, listener);
    const { wrapper } = await mountAt('/');
    state.auth.user = { id: 'u1', fullName: 'A', orgName: 'O', role: 'admin' };
    await flushPromises();
    expect(events).toEqual([]);
    window.removeEventListener(MOBILE_SESSION_RESET_EVENT, listener);
    wrapper.unmount();
  });

  it('thiếu quyền contact + conversation: tabbar 3 mục chia đều, không nút nổi, nội dung không chừa chỗ cho nút nổi', async () => {
    state.auth.canAccess = (r: string) => r !== 'contact' && r !== 'conversation';
    const { wrapper } = await mountAt('/');
    expect(wrapper.findAll('nav a.m-tab')).toHaveLength(3);
    expect(wrapper.find('.m-tab--prominent').exists()).toBe(false);
    expect(wrapper.get('ul.m-tabbar__list').attributes('style')).toContain('repeat(3, minmax(0, 1fr))');
    expect(wrapper.get('.m-main__scroll').classes()).not.toContain('m-main__scroll--fab');
    wrapper.unmount();
  });

  it('đủ quyền + tabbar hiện: vùng cuộn chừa chỗ cho nút nổi; thread (ẩn tabbar) thì không', async () => {
    const a = await mountAt('/');
    expect(a.wrapper.get('.m-main__scroll').classes()).toContain('m-main__scroll--fab');
    a.wrapper.unmount();
    const b = await mountAt('/chat/abc');
    expect(b.wrapper.get('.m-main__scroll').classes()).not.toContain('m-main__scroll--fab');
    b.wrapper.unmount();
  });

  it('ToastContainer được mount trong shell và body được đánh dấu để toast tránh tabbar; gỡ khi unmount', async () => {
    const { wrapper, router } = await mountAt('/');
    expect(wrapper.find('.toast-container-stub').exists()).toBe(true);
    expect(document.body.classList.contains('m-toast-host')).toBe(true);
    expect(document.body.classList.contains('m-toast-host--tabbar')).toBe(true);
    await router.push('/chat/abc');
    await flushPromises();
    expect(document.body.classList.contains('m-toast-host--tabbar')).toBe(false);
    wrapper.unmount();
    expect(document.body.classList.contains('m-toast-host')).toBe(false);
  });

  it('z-index toast ở body khớp --m-z-toast trong mobile-tokens.css', () => {
    const tokens = readText('../assets/mobile-tokens.css').match(/--m-z-toast:\s*(\d+)/)?.[1];
    const layout = readText('./MobileLayout.vue').match(/--m-z-toast:\s*(\d+)/)?.[1];
    expect(layout).toBe(tokens);
  });
});
