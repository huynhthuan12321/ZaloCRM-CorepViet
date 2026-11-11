// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

const { api, openContactChat, isMobile } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  openContactChat: vi.fn(async () => true),
  isMobile: { value: true },
}));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));
vi.mock('@/composables/use-open-contact-chat', () => ({ openContactChat }));
// Desktop quá nặng để import trong jsdom: thay bằng stub có onMounted để chứng minh nó KHÔNG chạy trên mobile (H22/H23).
const desktopMounted = vi.hoisted(() => vi.fn());
vi.mock('@/views/DesktopContactsView.vue', () => ({ default: { name: 'DesktopContactsView', mounted: desktopMounted, template: '<div id="desktop-contacts" />' } }));
vi.mock('@/composables/use-mobile', async (orig) => {
  const mod = await orig<typeof import('@/composables/use-mobile')>();
  return { ...mod, useMobile: () => ({ isMobile: ref(isMobile.value), isOnline: ref(true) }) };
});

import ContactsView from '@/views/ContactsView.vue';
import MobileContactView from '@/views/MobileContactView.vue';
import MobileContactProfileView from './MobileContactProfileView.vue';
import MobileOverviewView from './MobileOverviewView.vue';
import MobileAgendaView from './MobileAgendaView.vue';
import { StubBottomSheet, installMemoryStorage } from '@/composables/mobile-crm/test-utils';
import { confirmState } from '@/composables/use-confirm';
import { useAuthStore } from '@/stores/auth';

const stub = { template: '<div />' };
const routes = [
  { path: '/', name: 'Dashboard', component: stub },
  { path: '/chat/:convId?', name: 'Chat', component: stub },
  { path: '/contacts', name: 'Contacts', component: stub },
  { path: '/contacts/:id/profile', name: 'ContactProfile', component: stub },
  { path: '/customers/:id/activity', name: 'CustomerActivityLog', component: stub },
  { path: '/appointments', name: 'Appointments', component: stub },
];

async function setup(user: Record<string, unknown> = { id: 'me', fullName: 'Tôi', role: 'admin', orgId: 'o' }, at = '/') {
  installMemoryStorage();
  setActivePinia(createPinia());
  useAuthStore().user = user as never;
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(at);
  await router.isReady();
  return router;
}
const globalOpts = (router: ReturnType<typeof createRouter>) => ({ global: { plugins: [router], stubs: { VBottomSheet: StubBottomSheet } } });

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  openContactChat.mockClear();
  desktopMounted.mockClear();
  confirmState.value = { open: false, title: '' };
  isMobile.value = true;
});

describe('Khách hàng: không chạy API desktop trên mobile', () => {
  it('wrapper ContactsView: mobile -> MobileContactView, DesktopContactsView KHÔNG mount (không onMounted desktop)', async () => {
    const router = await setup(undefined, '/contacts');
    api.get.mockResolvedValue({ data: { contacts: [], total: 0 } });
    const w = mount(ContactsView, globalOpts(router));
    await flushPromises();
    expect(w.find('#desktop-contacts').exists()).toBe(false);
    expect(desktopMounted).not.toHaveBeenCalled();
    expect(w.find('.crm-mobile-contacts').exists()).toBe(true);
  });

  it('MobileContactView chỉ gọi GET /contacts (không stats, duplicates, settings/statuses, users) khi vào màn', async () => {
    const router = await setup(undefined, '/contacts');
    api.get.mockResolvedValue({ data: { contacts: [{ id: 'c1', fullName: 'Lan', phone: null }], total: 1 } });
    mount(MobileContactView, globalOpts(router));
    await flushPromises();
    const urls = api.get.mock.calls.map(c => c[0]);
    expect(urls).toEqual(['/contacts']);
  });

  it('bấm thẻ -> /contacts/:id/profile; mở lọc mới tải /users (người phụ trách)', async () => {
    const router = await setup(undefined, '/contacts');
    api.get.mockImplementation(async (url: string) => (url === '/users' ? { data: { users: [{ id: 'u1', fullName: 'Minh' }] } } : { data: { contacts: [{ id: 'c1', fullName: 'Lan', phone: null }], total: 1 } }));
    const w = mount(MobileContactView, globalOpts(router));
    await flushPromises();
    await w.get('.crm-contact-card').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/contacts/c1/profile');
    await router.push('/contacts');
    await w.get('.crm-list__filter').trigger('click');
    await flushPromises();
    expect(api.get.mock.calls.map(c => c[0])).toContain('/users');
    expect(w.text()).toContain('Minh');
  });

  it('lỗi tải -> màn lỗi có Thử lại và tải lại được; không hiện "0 khách hàng"', async () => {
    const router = await setup(undefined, '/contacts');
    api.get.mockRejectedValueOnce(new Error('500'));
    const w = mount(MobileContactView, globalOpts(router));
    await flushPromises();
    expect(w.find('.m-feedback--error').exists()).toBe(true);
    expect(w.text()).not.toContain('0 khách hàng');
    api.get.mockResolvedValueOnce({ data: { contacts: [{ id: 'c1', fullName: 'Lan', phone: null }], total: 1 } });
    await w.get('.m-feedback__btn--primary').trigger('click');
    await flushPromises();
    expect(w.findAll('.crm-contact-card')).toHaveLength(1);
  });

  it('quyền: grant contact.create=false ẩn nút tạo khách', async () => {
    const router = await setup({ id: 'm', fullName: 'M', role: 'member', orgId: 'o', grants: { contact: { access: true, create: false } } }, '/contacts');
    api.get.mockResolvedValue({ data: { contacts: [], total: 0 } });
    const w = mount(MobileContactView, globalOpts(router));
    await flushPromises();
    expect(w.find('.crm-list__fab').exists()).toBe(false);
  });
});

describe('Hồ sơ khách: nút Nhắn tin mở đúng hội thoại', () => {
  const profileResp = { contact: { id: 'c1', displayName: 'Lan', fullName: 'Lan', crmName: null, email: null, addressLine: null, occupation: null, phone: null, phone2: null, phone3: null, gender: null, birthDate: null, birthYear: null, province: null, district: null, ward: null, leadScore: 1, statusId: null, statusName: null, avatarUrl: null }, friends: [], aggregateScore: 1, aggregateTags: [], primaryOwner: null };
  const act = (...ids: string[]) => ids.map(id => ({ zaloAccountId: `a-${id}`, zaloAccount: { id: `a-${id}`, displayName: `Nick ${id}`, phone: null, avatarUrl: null }, conversationId: id, totalInbound: 1, totalOutbound: 1, lastInbound: null, lastOutbound: null }));
  function route(items: ReturnType<typeof act>, contactId = 'c1') {
    api.get.mockImplementation(async (url: string) => {
      if (url === `/contacts/${contactId}`) return { data: { id: contactId, fullName: 'Lan', phone: null, tags: [], leadScore: 1 } };
      if (url === `/contacts/${contactId}/profile`) return { data: { ...profileResp, contact: { ...profileResp.contact, id: contactId } } };
      if (url === `/contacts/${contactId}/account-activity`) return { data: { items } };
      throw new Error(`unexpected ${url}`);
    });
  }
  const mkProfile = async (id: string) => {
    const router = await setup(undefined, `/contacts/${id}/profile`);
    const w = mount(MobileContactProfileView, globalOpts(router));
    await flushPromises();
    return { w, router };
  };
  const message = (w: ReturnType<typeof mount>) => w.findAll('.crm-profile__act').find(b => b.text().includes('Nhắn tin'))!;

  it('đúng 1 hội thoại -> /chat/:convId', async () => {
    route(act('conv-1'), 'c10');
    const { w, router } = await mkProfile('c10');
    await message(w).trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/chat/conv-1');
    expect(openContactChat).not.toHaveBeenCalled();
  });

  it('0 hội thoại -> openContactChat(router, contactId)', async () => {
    route([], 'c11');
    const { w } = await mkProfile('c11');
    await message(w).trigger('click');
    await flushPromises();
    expect(openContactChat).toHaveBeenCalledTimes(1);
    expect((openContactChat.mock.calls[0] as unknown[])[1]).toBe('c11');
  });

  it('>=2 hội thoại -> mở picker (nick + người phụ trách), chọn -> /chat/:convId đã chọn', async () => {
    route(act('conv-a', 'conv-b'), 'c12');
    const { w, router } = await mkProfile('c12');
    await message(w).trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/contacts/c12/profile');
    const rows = w.findAll('.crm-picker__row');
    expect(rows).toHaveLength(2);
    await rows[1].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/chat/conv-b');
  });

  it('không tải được khách -> trạng thái không tìm thấy (không crash); xóa khách hỏi xác nhận trước', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });
    const { w } = await mkProfile('zzz');
    expect(w.text()).toContain('Khách không tồn tại hoặc đã xóa');
    route([], 'c13');
    const { w: w2 } = await mkProfile('c13');
    const del = w2.get('.crm-mobile-profile__delete');
    await del.trigger('click');
    expect(confirmState.value.open).toBe(true);
    expect(confirmState.value.tone).toBe('danger');
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('Tổng quan', () => {
  const meResp = {
    targetUserId: 'me', isViewingSelf: true,
    kpi: { unreplied: { public: 3, private: 1 }, todayAppointments: { public: 0, private: 0 }, dormantContacts: { public: 2, private: 0 }, totalContacts: 50, closedThisMonth: 1 },
    urgent: [{ conversationId: 'v1', contactName: 'Lan', unreadCount: 2, lastMessageAt: new Date().toISOString(), nickName: 'Nick A' }],
    appointments: [], quotaNicks: [],
  };

  it('chỉ chủ nhân (không quản lý): chỉ gọi /me, không hiện tab team/system, không chip phạm vi', async () => {
    const router = await setup({ id: 'me', fullName: 'Lê Thị Lan', role: 'member', orgId: 'o' });
    api.get.mockResolvedValue({ data: meResp });
    const w = mount(MobileOverviewView, globalOpts(router));
    await flushPromises();
    expect(api.get.mock.calls.map(c => c[0])).toEqual(['/dashboard/action-hub/me']);
    expect(w.find('[role="tablist"]').exists()).toBe(false);
    expect(w.find('.crm-ov-view__scope').exists()).toBe(false);
    expect(w.text()).toContain('Đang chờ trả lời');
    expect(w.get('.crm-ov-view__greet').text()).toContain('Lan');
  });

  it('quản lý: chip phạm vi + tab team; team tải lỗi -> hiện LỖI chứ không 0; chọn nhân viên -> fetchMe(asUserId)', async () => {
    const router = await setup({ id: 'boss', fullName: 'Sếp', role: 'admin', orgId: 'o' });
    api.get.mockImplementation(async (url: string, cfg?: { params?: Record<string, string> }) => {
      if (url === '/dashboard/action-hub/me') return { data: meResp };
      if (url === '/dashboard/action-hub/picker/users') return { data: { canViewAll: true, users: [{ id: 'u2', fullName: 'Trần B', email: '', isSelf: false, departmentName: 'PKD' }] } };
      if (url === '/dashboard/action-hub/picker/depts') return { data: { depts: [] } };
      if (url === '/dashboard/action-hub/system') return { data: { orgKpi: { totalNicks: 2, nickHealth: { healthy: 1, overlimit: 0, banned: 0, offline: 1, private: 0 }, newLeadsThisMonth: 3, totalContacts: 10, auditCountToday: 0 }, deptRanking: [], funnel: [], recentAudit: [] } };
      if (url === '/dashboard/action-hub/team') throw Object.assign(new Error('500'), { response: { status: 500 } });
      throw new Error(`unexpected ${url} ${JSON.stringify(cfg)}`);
    });
    const w = mount(MobileOverviewView, globalOpts(router));
    await flushPromises();
    expect(w.findAll('[role="tab"]').map(t => t.text())).toEqual(['Việc của tôi', 'Quản lý team', 'Hệ thống']);
    const scope = w.get('.crm-ov-view__scope');
    expect(scope.text()).toContain('Tôi (Sếp)');
    await w.findAll('[role="tab"]')[1].trigger('click');
    expect(w.find('.m-feedback--error').exists()).toBe(true);
    await w.findAll('[role="tab"]')[0].trigger('click');
    await scope.trigger('click');
    await flushPromises();
    const pick = w.findAll('.crm-sc__row').find(r => r.text().includes('Trần B'))!;
    await pick.trigger('click');
    await flushPromises();
    const last = api.get.mock.calls.filter(c => c[0] === '/dashboard/action-hub/me').at(-1)!;
    expect(last[1]).toEqual({ params: { asUserId: 'u2' } });
  });

  it('fetch /me lỗi -> màn lỗi có Thử lại (không hiện số 0)', async () => {
    const router = await setup({ id: 'me', fullName: 'Lan', role: 'member', orgId: 'o' });
    api.get.mockRejectedValueOnce(new Error('500'));
    const w = mount(MobileOverviewView, globalOpts(router));
    await flushPromises();
    expect(w.find('.m-feedback--error').exists()).toBe(true);
    expect(w.find('.crm-ov__hero').exists()).toBe(false);
    api.get.mockResolvedValueOnce({ data: meResp });
    await w.get('.m-feedback__btn--primary').trigger('click');
    await flushPromises();
    expect(w.find('.crm-ov__hero').exists()).toBe(true);
  });

  it('mở hội thoại từ hàng chờ -> /chat/:convId', async () => {
    const router = await setup({ id: 'me', fullName: 'Lan', role: 'member', orgId: 'o' });
    api.get.mockResolvedValue({ data: meResp });
    const w = mount(MobileOverviewView, globalOpts(router));
    await flushPromises();
    await w.get('.crm-ov__wait-row').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/chat/v1');
  });
});

describe('Lịch hẹn', () => {
  const appt = { id: 'a1', contactId: 'c1', appointmentDate: '2026-11-10T00:00:00.000Z', appointmentTime: '09:30', type: 'call', status: 'scheduled', notes: null, createdAt: '', source: 'zalo', externalRef: 'r', zaloMessageId: 'm', emoji: null, conversationId: 'conv-7', statusChangedAt: null, statusChangedBy: null, title: 'Hẹn xem nhà', durationMin: 30, assignedUserId: 'me', contact: { id: 'c1', fullName: 'Lan', phone: null } };

  it('loading -> lỗi có Thử lại -> dữ liệu; agenda hiện giờ + người phụ trách; Mở hội thoại dẫn tới /chat/conv-7', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T03:00:00.000Z'));
    try {
      const router = await setup({ id: 'me', fullName: 'Tôi', role: 'admin', orgId: 'o' }, '/appointments');
      api.get.mockRejectedValueOnce(new Error('500'));
      const w = mount(MobileAgendaView, globalOpts(router));
      await flushPromises();
      expect(w.find('.m-feedback--error').exists()).toBe(true);
      api.get.mockResolvedValue({ data: { appointments: [appt], total: 1 } });
      await w.get('.m-feedback__btn--primary').trigger('click');
      await flushPromises();
      const card = w.get('.crm-appt-card');
      expect(card.text()).toContain('09:30');
      expect(card.text()).toContain('Hẹn xem nhà');
      expect(card.text()).toContain('Tạo từ Zalo');
      await card.trigger('click');
      await flushPromises();
      const open = w.findAll('.crm-ad__btn').find(b => b.text().includes('Mở hội thoại'))!;
      await open.trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/chat/conv-7');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ngày trống -> thông báo rỗng; bộ lọc ẩn lịch -> gợi ý xóa lọc; FAB nằm trên tabbar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T03:00:00.000Z'));
    try {
      const router = await setup({ id: 'me', fullName: 'Tôi', role: 'admin', orgId: 'o' }, '/appointments');
      api.get.mockResolvedValue({ data: { appointments: [{ ...appt, appointmentDate: '2026-11-12T00:00:00.000Z', assignedUserId: 'other' }], total: 1 } });
      const w = mount(MobileAgendaView, globalOpts(router));
      await flushPromises();
      expect(w.text()).toContain('Không có lịch hẹn trong ngày này');
      expect(w.text()).toContain('đang bị ẩn bởi bộ lọc');
      expect(w.get('.crm-agenda__fab').attributes('style')).toContain('--m-tabbar');
      await w.get('.m-feedback__btn').trigger('click'); // Xóa bộ lọc
      await flushPromises();
      expect(w.findAll('.crm-appt-card')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hủy lịch: hỏi xác nhận (ConfirmHost) trước khi gọi API', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T03:00:00.000Z'));
    try {
      const router = await setup({ id: 'me', fullName: 'Tôi', role: 'admin', orgId: 'o' }, '/appointments');
      api.get.mockResolvedValue({ data: { appointments: [appt], total: 1 } });
      const w = mount(MobileAgendaView, globalOpts(router));
      await flushPromises();
      await w.get('.crm-appt-card').trigger('click');
      await flushPromises();
      await w.findAll('.crm-ad__btn').find(b => b.text().includes('Hủy lịch'))!.trigger('click');
      expect(confirmState.value.open).toBe(true);
      expect(api.patch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
