// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const { api, push } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, push: vi.fn() }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));
vi.mock('vue-router', async (orig) => ({ ...(await orig<typeof import('vue-router')>()), useRouter: () => ({ push }) }));

import { StubBottomSheet, installMemoryStorage } from '@/composables/mobile-crm/test-utils';
import { useAuthStore } from '@/stores/auth';
import MobileNotificationsPage from './MobileNotificationsPage.vue';
import MobilePermissionGroupsPage from './MobilePermissionGroupsPage.vue';
import MobileDepartmentsPage from './MobileDepartmentsPage.vue';
import MobileIntegrationsPage from './MobileIntegrationsPage.vue';
import MobileAuditPage from './MobileAuditPage.vue';
import MobileStatusesPage from './MobileStatusesPage.vue';
import MobileTagsPage from './MobileTagsPage.vue';
import MobileAccountPage from './MobileAccountPage.vue';

const opts = { global: { stubs: { VBottomSheet: StubBottomSheet } } };
const offlineErr = Object.assign(new Error('Network Error'), {});

beforeEach(() => {
  installMemoryStorage();
  setActivePinia(createPinia());
  Object.values(api).forEach(f => f.mockReset());
  push.mockReset();
});

describe('Thông báo của tôi', () => {
  it('hiện danh sách và mở đúng đích như chuông desktop', async () => {
    api.get.mockResolvedValue({ data: { notifications: [{ id: 'unreplied', type: 'warning', title: '3 khách chờ', detail: 'x', priority: 'high' }, { id: 'zz', type: 'info', title: 'Tin', detail: 'y', priority: 'low' }] } });
    const w = mount(MobileNotificationsPage, opts);
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/notifications');
    expect(w.text()).toContain('3 khách chờ');
    await w.get('button.crm-np__row').trigger('click');
    expect(push).toHaveBeenCalledWith('/chat');
    expect(w.findAll('button.crm-np__row')).toHaveLength(1); // thông báo không có đích thì không là nút
    // không còn thay thế cấu hình Zalo: có lối sang wizard gốc
    await w.get('button.crm-np__cfg').trigger('click');
    expect(push).toHaveBeenLastCalledWith('/settings/channels/zalo?tab=internal-contact');
  });
  it('lỗi hiện lỗi (không giả làm rỗng); rỗng hiện rỗng', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    const w = mount(MobileNotificationsPage, opts);
    await flushPromises();
    expect(w.text()).toContain('Không tải được thông báo');
    expect(w.text()).not.toContain('Không có thông báo');
    api.get.mockResolvedValueOnce({ data: { notifications: [] } });
    await w.get('button').trigger('click'); // Thử lại
    await flushPromises();
    expect(w.text()).toContain('Không có thông báo');
  });
});

describe('Trạng thái KH', () => {
  const statuses = [{ id: 's1', name: 'Mới', order: 1, color: '#336699', isTerminal: false, isDefault: true }, { id: 's2', name: 'Chốt', order: 2, color: null, isTerminal: true, isDefault: false }];
  it('thẻ + đổi thứ tự gọi đúng API + chặn lên ở đầu', async () => {
    api.get.mockResolvedValue({ data: { statuses } });
    api.post.mockResolvedValue({ data: {} });
    const w = mount(MobileStatusesPage, opts);
    await flushPromises();
    expect(w.findAll('.crm-sp__card')).toHaveLength(2);
    const ups = w.findAll('button[aria-label^="Đưa"]');
    expect(ups[0].attributes('disabled')).toBeDefined(); // Mới: không lên được
    await ups[2].trigger('click'); // Chốt: lên
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/settings/statuses/reorder', { items: [{ id: 's2', order: 1 }, { id: 's1', order: 2 }] });
  });
  it('thêm: tên trống bị chặn, hợp lệ gọi POST rồi đóng; lỗi server giữ sheet mở', async () => {
    api.get.mockResolvedValue({ data: { statuses } });
    const w = mount(MobileStatusesPage, opts);
    await flushPromises();
    await w.get('.crm-sp__add').trigger('click');
    await w.get('form').trigger('submit');
    expect(api.post).not.toHaveBeenCalled();
    expect(w.text()).toContain('Tên không được trống');
    await w.get('#sf-name').setValue('Đã báo giá');
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Tên đã tồn tại' } } });
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('Tên đã tồn tại');
    expect(w.find('.stub-sheet').exists()).toBe(true);
    api.post.mockResolvedValueOnce({ data: {} });
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(api.post).toHaveBeenLastCalledWith('/settings/statuses', expect.objectContaining({ name: 'Đã báo giá', order: 3 }));
    expect(w.find('.stub-sheet').exists()).toBe(false);
  });
  it('lỗi tải -> có Thử lại; danh sách rỗng -> trạng thái rỗng', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    const w = mount(MobileStatusesPage, opts);
    await flushPromises();
    expect(w.text()).toContain('Không tải được trạng thái');
    api.get.mockResolvedValueOnce({ data: { statuses: [] } });
    await w.get('.m-feedback button').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Chưa có trạng thái');
  });
});

describe('Nhãn KH — tạo/lưu trữ/lọc', () => {
  const tag = (o: Record<string, unknown>) => ({ id: 't', name: 'VIP', slug: 'vip', color: '#0068FF', emoji: null, scope: 'crm', source: 'manual_crm', priority: 1, usageCount: 4, archivedAt: null, zaloAccount: null, zaloAccountId: null, ...o });
  const load = () => api.get.mockImplementation(async (u: string, cfg?: { params: { scope: string } }) => {
    if (u === '/tags/zalo-accounts') return { data: { accounts: [{ id: 'A', displayName: 'Nick A', phone: '0901' }, { id: 'B', displayName: 'Nick B' }] } };
    return { data: { tags: cfg!.params.scope === 'friend' ? [tag({ id: 'f1', name: 'Của A', scope: 'friend', source: 'zalo_real', zaloAccountId: 'A' }), tag({ id: 'f2', name: 'Của B', scope: 'friend', source: 'manual_per_nick', zaloAccountId: 'B' })] : [tag({ id: 'c1' })] } };
  });
  it('tạo nhãn bạn bè gửi ĐÚNG payload desktop (không zaloAccountId — backend không nhận), nguồn chọn được', async () => {
    load();
    api.post.mockResolvedValue({ data: {} });
    const w = mount(MobileTagsPage, opts);
    await flushPromises();
    await w.findAll('.crm-tp__tab')[1].trigger('click');
    await w.get('.crm-tp__add').trigger('click');
    await w.get('#tf-name').setValue('Mới');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/tags', { name: 'Mới', scope: 'friend', source: 'manual_per_nick', color: '#90A4AE', emoji: null });
  });
  it('lọc theo nick Zalo (tab bạn bè) như desktop', async () => {
    load();
    const w = mount(MobileTagsPage, opts);
    await flushPromises();
    await w.findAll('.crm-tp__tab')[1].trigger('click');
    expect(w.findAll('.crm-tp__card')).toHaveLength(2);
    const nick = w.findAll('.crm-tp__f select')[1];
    await nick.setValue('B');
    expect(w.findAll('.crm-tp__card')).toHaveLength(1);
    expect(w.text()).toContain('Của B');
  });
  it('lưu trữ nhãn: có xác nhận, gọi DELETE /tags/:id; hủy xác nhận thì không gọi', async () => {
    load();
    api.delete.mockResolvedValue({ data: {} });
    const w = mount(MobileTagsPage, opts);
    await flushPromises();
    await w.get('.crm-tp__card').trigger('click');
    const { confirmState, resolveConfirm } = await import('@/composables/use-confirm');
    await w.get('.crm-tf__archive').trigger('click');
    expect(confirmState.value.open).toBe(true);
    resolveConfirm(false, '');
    await flushPromises();
    expect(api.delete).not.toHaveBeenCalled();
    await w.get('.crm-tf__archive').trigger('click');
    resolveConfirm(true, '');
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith('/tags/c1');
  });
});

describe('Nhóm quyền — chọn nhóm để ĐỌC quyền, không có thao tác ghi', () => {
  it('chọn nhóm khác đổi danh sách quyền; không gọi API ghi; không có inert', async () => {
    api.get.mockImplementation(async (u: string) => (u === '/permission-groups'
      ? { data: { tree: [
        { id: 'g1', name: 'Quản lý', parentId: null, isSystem: true, displayOrder: 0, memberCount: 2, grants: { contact: { access: true, create: true } }, children: [] },
        { id: 'g2', name: 'Sale', parentId: null, isSystem: false, displayOrder: 1, memberCount: 5, grants: { contact: { access: true } }, children: [] },
      ] } }
      : { data: { resources: ['contact'], actions: ['access', 'create'], resourceActions: { contact: ['access', 'create'] } } }));
    const w = mount(MobilePermissionGroupsPage, opts);
    await flushPromises();
    expect(w.text()).toContain('Truy cập, Thêm'); // nhóm đầu được chọn sẵn
    await w.findAll('.crm-pg__item')[1].trigger('click');
    expect(w.get('.crm-pg__detail').text()).toContain('Sale');
    expect(w.get('.crm-pg__detail').text()).toContain('Truy cập');
    expect(w.get('.crm-pg__detail').text()).not.toContain('Thêm');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(w.find('[inert]').exists()).toBe(false);
  });
  it('lỗi tải hiện lỗi có Thử lại, không phải "chưa có nhóm"', async () => {
    api.get.mockRejectedValue({ response: { status: 500 } });
    const w = mount(MobilePermissionGroupsPage, opts);
    await flushPromises();
    expect(w.text()).toContain('Không tải được nhóm quyền');
    expect(w.text()).not.toContain('Chưa có nhóm quyền');
  });
});

describe('Phòng ban / Tích hợp / Audit — chỉ đọc', () => {
  it('Phòng ban: cây thụt lề + số thành viên', async () => {
    api.get.mockResolvedValue({ data: { tree: [{ id: 'd1', name: 'Kinh doanh', parentId: null, path: '/', depth: 0, displayOrder: 0, archivedAt: null, memberCount: 3, leaderUserId: null, deputyUserId: null, children: [{ id: 'd2', name: 'Miền Nam', parentId: 'd1', path: '/', depth: 1, displayOrder: 0, archivedAt: null, memberCount: 1, leaderUserId: null, deputyUserId: null, children: [] }] }] } });
    const w = mount(MobileDepartmentsPage, opts);
    await flushPromises();
    expect(w.findAll('.crm-dp__item')).toHaveLength(2);
    expect(w.text()).toContain('3 thành viên');
    expect(w.text()).toContain('cấp 2');
  });
  it('Tích hợp: KHÔNG bao giờ hiển thị cấu hình bí mật', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'i1', type: 'telegram', name: 'Bot CSKH', enabled: true, lastSyncAt: null, config: { botToken: 'SECRET-TOKEN-123', apiKey: 'KEY-XYZ' }, syncLogs: [{ id: 'l', status: 'success', recordCount: 7 }] }] });
    const w = mount(MobileIntegrationsPage, opts);
    await flushPromises();
    expect(w.text()).toContain('Bot CSKH');
    expect(w.text()).toContain('Thành công (7)');
    expect(w.html()).not.toContain('SECRET-TOKEN-123');
    expect(w.html()).not.toContain('KEY-XYZ');
  });
  it('Audit: lọc + phân trang gọi đúng tham số, nhãn đọc được; lỗi không giả làm rỗng', async () => {
    const logs = Array.from({ length: 3 }, (_, i) => ({ id: 'l' + i, action: 'user.handoff', createdAt: '2026-11-01T00:00:00Z', actor: { id: 'a', name: 'Admin' }, target: { id: 'b', name: 'Lan' }, details: { toName: 'Bình', contacts: 2, nicks: 1, appointments: 0 } }));
    api.get.mockResolvedValue({ data: { logs, total: 120 } });
    const w = mount(MobileAuditPage, opts);
    await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/audit-logs', { params: { limit: '50', offset: '0' } });
    expect(w.text()).toContain('Sang Bình: 2 khách');
    await w.findAll('.crm-au__chip')[2].trigger('click'); // Đặt lại mật khẩu
    expect(api.get).toHaveBeenLastCalledWith('/audit-logs', { params: { limit: '50', offset: '0', action: 'user.reset_password' } });
    expect(w.find('nav[aria-label="Phân trang nhật ký"]').exists()).toBe(true);
    await flushPromises();
    await w.findAll('.crm-au__btn')[1].trigger('click'); // Sau
    expect(api.get).toHaveBeenLastCalledWith('/audit-logs', { params: { limit: '50', offset: '50', action: 'user.reset_password' } });
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    await w.findAll('.crm-au__chip')[0].trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Không tải được nhật ký');
    expect(w.text()).not.toContain('Chưa có thao tác nào');
  });
});

describe('Nhãn KH', () => {
  const tag = (o: Record<string, unknown>) => ({ id: 't', name: 'VIP', slug: 'vip', color: '#0068FF', emoji: null, scope: 'crm', source: 'manual_crm', priority: 1, usageCount: 4, archivedAt: null, zaloAccount: null, ...o });
  it('tải cả hai phạm vi, tab Nhãn bạn bè đổi danh sách, sửa gọi PATCH /tags/:id', async () => {
    api.get.mockImplementation(async (_u: string, cfg: { params: { scope: string } }) => ({ data: { tags: cfg.params.scope === 'crm' ? [tag({ id: 'c1' })] : [tag({ id: 'f1', name: 'Bạn thân', scope: 'friend', source: 'zalo_real' })] } }));
    api.patch.mockResolvedValue({ data: {} });
    const w = mount(MobileTagsPage, opts);
    await flushPromises();
    expect(w.text()).toContain('VIP');
    await w.findAll('.crm-tp__tab')[1].trigger('click');
    expect(w.text()).toContain('Bạn thân');
    await w.get('.crm-tp__card').trigger('click');
    await w.get('#tf-name').setValue('Bạn rất thân');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(api.patch).toHaveBeenCalledWith('/tags/f1', { name: 'Bạn rất thân', color: '#0068FF', emoji: null, priority: 1 });
  });
  it('lỗi tải hiện lỗi, không phải rỗng', async () => {
    api.get.mockRejectedValue(offlineErr);
    const w = mount(MobileTagsPage, opts);
    await flushPromises();
    expect(w.text()).toContain('Không tải được nhãn');
  });
});

describe('Tài khoản của tôi', () => {
  it('sửa họ tên: không đổi -> Lưu bị khóa; đổi -> PATCH /me/profile và cập nhật store', async () => {
    const auth = useAuthStore();
    auth.user = { id: 'me', fullName: 'Thuận', role: 'admin', orgId: 'o', orgName: 'CRV', email: 'a@b.c', phone: null, avatarUrl: null } as never;
    api.patch.mockResolvedValue({ data: { fullName: 'Thuận Huỳnh' } });
    const w = mount(MobileAccountPage, opts);
    await w.get('button[aria-label="Sửa họ tên"]').trigger('click');
    const save = () => w.get('button[type="submit"]');
    expect(save().attributes('disabled')).toBeDefined();
    await w.get('#crm-ap-fullname').setValue('Thuận Huỳnh');
    expect(save().attributes('disabled')).toBeUndefined();
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(api.patch).toHaveBeenCalledWith('/me/profile', { fullName: 'Thuận Huỳnh' });
    expect((auth.user as { fullName: string } | null)?.fullName).toBe('Thuận Huỳnh');
    expect(w.find('.stub-sheet').exists()).toBe(false);
  });
});


describe('F1 reviewer regressions', () => {
  it('vẫn đọc phòng ban khi không được đọc danh sách người dùng', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url === '/departments') return { data: { tree: [{ id: 'd1', name: 'Đội thử nghiệm', children: [], memberCount: 1, leaderUserId: 'outside', deputyUserId: null }] } };
      throw { response: { status: 403 } };
    });
    const w = mount(MobileDepartmentsPage, opts);
    await flushPromises();
    expect(w.text()).toContain('Đội thử nghiệm');
    expect(w.text()).toContain('Không có thông tin trong phạm vi quyền');
    expect(w.find('.crm-dp__list').exists()).toBe(true);
  });
  it('khóa lưu trữ nhãn Zalo Real và không gửi DELETE', async () => {
    api.get.mockImplementation(async (url: string, cfg?: { params: { scope: string } }) => {
      if (url === '/tags/zalo-accounts') return { data: { accounts: [] } };
      return { data: { tags: cfg?.params.scope === 'friend' ? [{ id: 'real', name: 'Đồng bộ Zalo', slug: 'dong-bo', color: '#0068FF', emoji: null, scope: 'friend', source: 'zalo_real', priority: 1, usageCount: 1, archivedAt: null, zaloAccount: null }] : [] } };
    });
    const w = mount(MobileTagsPage, opts);
    await flushPromises();
    await w.findAll('.crm-tp__tab')[1].trigger('click');
    await w.get('.crm-tp__card').trigger('click');
    expect(w.get('.crm-tf__archive').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Nhãn Zalo Real không thể lưu trữ');
    expect(api.delete).not.toHaveBeenCalled();
  });
});
