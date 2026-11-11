// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));

import { SEARCH_DEBOUNCE_MS, useMobileContacts } from './use-mobile-contacts';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';

const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${from + i}`, fullName: `Khách ${from + i}`, phone: null }));
const page = (p: number, total = 45) => ({ data: { contacts: rows((p - 1) * 20 + 1, Math.min(20, total - (p - 1) * 20)), total } });

function setup() {
  const scope = effectScope();
  const c = scope.run(() => useMobileContacts())!;
  return { c, scope };
}

beforeEach(() => {
  api.get.mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => vi.useRealTimers());

describe('useMobileContacts', () => {
  it('reload: trang 1, chỉ gọi GET /contacts, có total + hasMore; mặc định threadType=user giữ nguyên hành vi cũ', async () => {
    api.get.mockResolvedValue(page(1));
    const { c, scope } = setup();
    await c.reload();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][0]).toBe('/contacts');
    expect(api.get.mock.calls[0][1].params).toMatchObject({ page: 1, limit: 20, threadType: 'user' });
    expect(c.state.value).toBe('ready');
    expect(c.items.value).toHaveLength(20);
    expect(c.total.value).toBe(45);
    expect(c.hasMore.value).toBe(true);
    scope.stop();
  });

  it('tải tiếp: page 2, 3 nối vào danh sách, loại trùng id, hết thì hasMore=false', async () => {
    api.get.mockResolvedValueOnce(page(1)).mockResolvedValueOnce(page(2)).mockResolvedValueOnce(page(3));
    const { c, scope } = setup();
    await c.reload();
    await c.loadMore();
    expect(api.get.mock.calls[1][1].params.page).toBe(2);
    expect(c.items.value).toHaveLength(40);
    await c.loadMore();
    expect(c.items.value).toHaveLength(45);
    expect(new Set(c.items.value.map(x => x.id)).size).toBe(45);
    expect(c.hasMore.value).toBe(false);
    await c.loadMore(); // không còn -> không gọi thêm
    expect(api.get).toHaveBeenCalledTimes(3);
    scope.stop();
  });

  it('tải tiếp lỗi: giữ nguyên danh sách và số trang, không đổi sang trạng thái lỗi toàn màn', async () => {
    api.get.mockResolvedValueOnce(page(1)).mockRejectedValueOnce(new Error('net'));
    const { c, scope } = setup();
    await c.reload();
    await c.loadMore();
    expect(c.items.value).toHaveLength(20);
    expect(c.state.value).toBe('ready');
    api.get.mockResolvedValueOnce(page(2));
    await c.loadMore();
    expect(api.get.mock.calls[2][1].params.page).toBe(2); // thử lại đúng trang 2
    expect(c.items.value).toHaveLength(40);
    scope.stop();
  });

  it('lọc hai pha: applyFilters ghi status/nguồn/người phụ trách, về trang 1, xóa danh sách cũ trong lúc tải', async () => {
    api.get.mockResolvedValueOnce(page(1)).mockResolvedValueOnce(page(1, 3));
    const { c, scope } = setup();
    await c.reload();
    c.applyFilters({ status: 'new', source: 'FB', assignedUserId: 'u1' });
    expect(c.items.value).toHaveLength(0);
    expect(c.state.value).toBe('loading');
    await vi.waitFor(() => expect(c.state.value).toBe('ready'));
    expect(api.get.mock.calls[1][1].params).toMatchObject({ page: 1, status: 'new', source: 'FB', assignedUserId: 'u1' });
    expect(c.items.value).toHaveLength(3);
    scope.stop();
  });

  it('clearFilters: xóa tìm kiếm + ba bộ lọc, tải lại trang 1', async () => {
    api.get.mockResolvedValue(page(1, 2));
    const { c, scope } = setup();
    c.applyFilters({ status: 'lost' });
    await vi.waitFor(() => expect(c.state.value).toBe('ready'));
    c.clearFilters();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    const last = api.get.mock.calls.at(-1)![1].params;
    expect(last.status).toBeUndefined();
    expect(last.search).toBeUndefined();
    scope.stop();
  });

  it('tìm kiếm debounce 300ms rồi mới gọi API', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(page(1, 2));
    const { c, scope } = setup();
    c.setSearch('lan');
    c.setSearch('lan nguyen');
    expect(api.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][1].params.search).toBe('lan nguyen');
    scope.stop();
  });

  it('lỗi tải lần đầu -> error (online) hoặc offline; có thể thử lại', async () => {
    api.get.mockRejectedValueOnce(new Error('500'));
    const { c, scope } = setup();
    await c.reload();
    expect(c.state.value).toBe('error');
    expect(c.items.value).toHaveLength(0);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    api.get.mockRejectedValueOnce(new Error('net'));
    await c.reload();
    expect(c.state.value).toBe('offline');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    api.get.mockResolvedValueOnce(page(1, 5));
    await c.reload();
    expect(c.state.value).toBe('ready');
    scope.stop();
  });

  it('đăng xuất / đổi người dùng (sự kiện reset của shell) xóa danh sách khách của người trước', async () => {
    api.get.mockResolvedValue(page(1));
    const { c, scope } = setup();
    await c.reload();
    window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId: 'a', userId: null } }));
    expect(c.items.value).toHaveLength(0);
    scope.stop();
  });
});
