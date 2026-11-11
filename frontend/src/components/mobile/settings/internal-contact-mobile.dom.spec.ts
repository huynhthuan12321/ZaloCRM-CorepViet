// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import Page from '@/views/mobile/settings/MobileInternalContactPage.vue';
beforeEach(() => { Object.values(api).forEach(f => f.mockReset()); });
describe('Thông báo của tôi giữ khóa thiết lập thủ công', () => {
  it('chỉ GET cấu hình, không dựng wizard hay thao tác ghi', async () => {
    api.get.mockResolvedValue({ data: { method: null, recipient: null } });
    const w = mount(Page); await flushPromises();
    expect(w.text()).toContain('Chưa có cấu hình');
    expect(w.text()).toContain('Thiết lập thủ công đã được khóa');
    expect(w.find('.ic-page').exists()).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/me/internal-contact');
    expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
  });
  it('hiện trạng thái và nick đang có; không lộ trường ngoài cấu hình', async () => {
    api.get.mockResolvedValue({ data: { recipient: { status: 'ready' }, internalContactNick: { displayName: 'Nick Giả' } } });
    const w = mount(Page); await flushPromises();
    expect(w.text()).toContain('Sẵn sàng nhận thông báo'); expect(w.text()).toContain('Nick Giả');
  });
  it('403 và 500 hiện đúng lỗi, không giả làm chưa cấu hình', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 403 } });
    const a = mount(Page); await flushPromises(); expect(a.find('.m-feedback--forbidden').exists()).toBe(true);
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    const b = mount(Page); await flushPromises(); expect(b.find('.m-feedback--error').exists()).toBe(true);
    expect(b.text()).not.toContain('Chưa có cấu hình');
  });
});
