// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

const state = vi.hoisted(() => ({ auth: null as any, get: null as any }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('@/api/index', () => ({ api: { get: (...args: unknown[]) => state.get(...args) } }));

import {
  CHAT_INBOUND_EVENT,
  WAITING_COUNT_DEBOUNCE_MS,
  WAITING_COUNT_MIN_INTERVAL_MS,
  __resetWaitingCountForTests,
  useMobileWaitingCount,
} from './use-mobile-waiting-count';

let visibility: 'visible' | 'hidden' = 'visible';

async function mountHost() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/contacts', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  let api!: ReturnType<typeof useMobileWaitingCount>;
  const Host = defineComponent({
    setup() {
      api = useMobileWaitingCount();
      return () => h('div');
    },
  });
  const wrapper = mount(Host, { global: { plugins: [router] } });
  return { wrapper, router, getApi: () => api };
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetWaitingCountForTests();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  state.auth = reactive({ user: { id: 'u1' } as { id: string } | null });
  state.get = vi.fn().mockResolvedValue({ data: { unreplied: 5, unread: 9, total: 20, otherUnread: 1 } });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useMobileWaitingCount', () => {
  it('mount shell: gọi GET /conversations/counts một lần và lấy unreplied', async () => {
    const { wrapper, getApi } = await mountHost();
    await flushPromises();
    expect(state.get).toHaveBeenCalledTimes(1);
    expect(state.get).toHaveBeenCalledWith('/conversations/counts');
    expect(getApi().count.value).toBe(5);
    wrapper.unmount();
  });

  it('lỗi API -> null (không bao giờ là 0)', async () => {
    state.get = vi.fn().mockRejectedValue(new Error('500'));
    const { wrapper, getApi } = await mountHost();
    await flushPromises();
    expect(getApi().count.value).toBeNull();
    wrapper.unmount();
  });

  it('dữ liệu lạ (thiếu unreplied / số âm) -> null', async () => {
    state.get = vi.fn().mockResolvedValue({ data: { total: 3 } });
    const { wrapper, getApi } = await mountHost();
    await flushPromises();
    expect(getApi().count.value).toBeNull();
    state.get = vi.fn().mockResolvedValue({ data: { unreplied: -1 } });
    await getApi().refresh();
    expect(getApi().count.value).toBeNull();
    wrapper.unmount();
  });

  it('single-flight: nhiều refresh đồng thời chỉ tạo một request', async () => {
    let resolve!: (v: unknown) => void;
    state.get = vi.fn(() => new Promise(r => { resolve = r; }));
    const { wrapper, getApi } = await mountHost();
    const a = getApi().refresh();
    const b = getApi().refresh();
    expect(state.get).toHaveBeenCalledTimes(1);
    resolve({ data: { unreplied: 2 } });
    await Promise.all([a, b]);
    expect(getApi().count.value).toBe(2);
    wrapper.unmount();
  });

  it('debounce 2s + tối thiểu 30s giữa hai lần tự động; bắn nhiều tin mới chỉ gộp thành một lần', async () => {
    const { wrapper } = await mountHost();
    await flushPromises();
    expect(state.get).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i += 1) window.dispatchEvent(new CustomEvent(CHAT_INBOUND_EVENT));
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_DEBOUNCE_MS + 100);
    expect(state.get).toHaveBeenCalledTimes(1); // chưa đủ 30s kể từ lần gọi đầu

    await vi.advanceTimersByTimeAsync(WAITING_COUNT_MIN_INTERVAL_MS);
    expect(state.get).toHaveBeenCalledTimes(2); // đúng một lần bù sau mốc 30s
    wrapper.unmount();
  });

  it('đổi route lên lịch làm mới (không gọi ngay)', async () => {
    const { wrapper, router } = await mountHost();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_MIN_INTERVAL_MS + 1);
    state.get.mockClear();
    await router.push('/contacts');
    await nextTick();
    expect(state.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_DEBOUNCE_MS + 100);
    expect(state.get).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('tab ẩn: không làm mới nền; tab hiện lại: làm mới', async () => {
    const { wrapper } = await mountHost();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_MIN_INTERVAL_MS + 1);
    state.get.mockClear();

    visibility = 'hidden';
    window.dispatchEvent(new CustomEvent(CHAT_INBOUND_EVENT));
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_DEBOUNCE_MS + WAITING_COUNT_MIN_INTERVAL_MS);
    expect(state.get).not.toHaveBeenCalled();

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_DEBOUNCE_MS + 100);
    expect(state.get).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('logout -> count = null và bỏ qua kết quả đang bay của người cũ', async () => {
    let resolve!: (v: unknown) => void;
    const { wrapper, getApi } = await mountHost();
    await flushPromises();
    expect(getApi().count.value).toBe(5);

    state.get = vi.fn(() => new Promise(r => { resolve = r; }));
    const pending = getApi().refresh();
    state.auth.user = null; // logout trong lúc request đang bay
    await nextTick();
    expect(getApi().count.value).toBeNull();
    resolve({ data: { unreplied: 99 } });
    await pending;
    expect(getApi().count.value).toBeNull();
    wrapper.unmount();
  });

  it('đổi user -> xóa số cũ rồi lấy số mới', async () => {
    const { wrapper, getApi } = await mountHost();
    await flushPromises();
    let resolve!: (v: unknown) => void;
    state.get = vi.fn(() => new Promise(r => { resolve = r; }));
    state.auth.user = { id: 'u2' };
    await nextTick();
    expect(getApi().count.value).toBeNull(); // số của user cũ không còn
    expect(state.get).toHaveBeenCalledTimes(1);
    resolve({ data: { unreplied: 11 } });
    await flushPromises();
    expect(getApi().count.value).toBe(11);
    wrapper.unmount();
  });

  it('chưa đăng nhập -> không gọi API', async () => {
    state.auth.user = null;
    const { wrapper, getApi } = await mountHost();
    await getApi().refresh();
    expect(state.get).not.toHaveBeenCalled();
    expect(getApi().count.value).toBeNull();
    wrapper.unmount();
  });

  it('consumer cuối dispose -> gỡ listener window/document và hủy lịch', async () => {
    const { wrapper } = await mountHost();
    await flushPromises();
    state.get.mockClear();
    window.dispatchEvent(new CustomEvent(CHAT_INBOUND_EVENT)); // đặt lịch
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_DEBOUNCE_MS + WAITING_COUNT_MIN_INTERVAL_MS);
    expect(state.get).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent(CHAT_INBOUND_EVENT));
    await vi.advanceTimersByTimeAsync(WAITING_COUNT_DEBOUNCE_MS + WAITING_COUNT_MIN_INTERVAL_MS);
    expect(state.get).not.toHaveBeenCalled();
  });
});
