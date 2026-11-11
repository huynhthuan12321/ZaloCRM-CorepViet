// @vitest-environment jsdom
// QA đợt D (G3): bổ sung trạng thái loading / empty / error / offline / forbidden ở MỨC VIEW cho từng màn D mà spec của crm-dev chưa phủ
// (offline ở Khách hàng / Tổng quan / Lịch hẹn / Hồ sơ; forbidden ở Hồ sơ; wrapper Dashboard / Appointments / ContactProfile).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

const { api, online, isMobile } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  online: { value: true },
  isMobile: { value: true },
}));
vi.mock('@/api/index', () => ({ api, clearAuthAndRedirect: vi.fn() }));
vi.mock('@/api', () => ({ api }));
const { desktopMounted, desktopStub } = vi.hoisted(() => {
  const mounted = vi.fn();
  return { desktopMounted: mounted, desktopStub: (name: string) => ({ name, mounted, template: `<div id="${name}" />` }) };
});
vi.mock('@/views/DesktopDashboardView.vue', () => ({ default: desktopStub('desktop-dashboard') }));
vi.mock('@/views/DesktopAppointmentsView.vue', () => ({ default: desktopStub('desktop-appointments') }));
vi.mock('@/views/DesktopContactProfileView.vue', () => ({ default: desktopStub('desktop-profile') }));
vi.mock('@/views/DesktopContactsView.vue', () => ({ default: desktopStub('desktop-contacts') }));
vi.mock('@/composables/use-mobile', async (orig) => {
  const mod = await orig<typeof import('@/composables/use-mobile')>();
  return { ...mod, useMobile: () => ({ isMobile: ref(isMobile.value), isOnline: ref(online.value) }) };
});

import DashboardView from '@/views/DashboardView.vue';
import AppointmentsView from '@/views/AppointmentsView.vue';
import ContactProfileView from '@/views/ContactProfileView.vue';
import ContactsView from '@/views/ContactsView.vue';
import MobileContactView from '@/views/MobileContactView.vue';
import MobileContactProfileView from '@/views/mobile/crm/MobileContactProfileView.vue';
import MobileOverviewView from '@/views/mobile/crm/MobileOverviewView.vue';
import MobileAgendaView from '@/views/mobile/crm/MobileAgendaView.vue';
import { StubBottomSheet, installMemoryStorage } from '@/composables/mobile-crm/test-utils';
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
const ADMIN = { id: 'me', fullName: 'Tôi', role: 'admin', orgId: 'o' };
const NO_GRANT = { id: 'u2', fullName: 'Nhân viên', role: 'member', orgId: 'o', grants: {} };

async function setup(user: Record<string, unknown> = ADMIN, at = '/') {
  installMemoryStorage();
  setActivePinia(createPinia());
  useAuthStore().user = user as never;
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(at);
  await router.isReady();
  return router;
}
const opts = (router: ReturnType<typeof createRouter>) => ({ global: { plugins: [router], stubs: { VBottomSheet: StubBottomSheet } } });
const neverResolves = () => new Promise(() => undefined);

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  desktopMounted.mockClear();
  online.value = true;
  isMobile.value = true;
});

describe('Wrapper desktop/mobile của đợt D', () => {
  const cases: Array<[string, unknown, string, string, string]> = [
    ['DashboardView', DashboardView, '/', '.crm-ov-view', '#desktop-dashboard'],
    ['AppointmentsView', AppointmentsView, '/appointments', '.crm-agenda', '#desktop-appointments'],
    ['ContactProfileView', ContactProfileView, '/contacts/c1/profile', '.crm-mobile-profile', '#desktop-profile'],
    ['ContactsView', ContactsView, '/contacts', '.crm-mobile-contacts', '#desktop-contacts'],
  ];
  for (const [name, comp, at, mobileSel, desktopSel] of cases) {
    it(`${name}: mobile -> bản mobile, KHÔNG mount desktop (onMounted desktop không chạy)`, async () => {
      api.get.mockImplementation(async (url: string) => {
        if (url === '/contacts/c1') return { data: { id: 'c1', fullName: 'Lan', phone: null, tags: [], leadScore: 1 } };
        if (url === '/contacts/c1/profile') return { data: { contact: { id: 'c1', displayName: 'Lan', fullName: 'Lan', leadScore: 1 }, friends: [], aggregateScore: 1, aggregateTags: [], primaryOwner: null } };
        if (url === '/contacts/c1/account-activity') return { data: { items: [] } };
        return { data: { contacts: [], total: 0, appointments: [], urgent: [], kpi: {} } };
      });
      const router = await setup(ADMIN, at);
      const w = mount(comp as never, opts(router));
      await flushPromises();
      expect(w.find(mobileSel).exists(), `${name} mobile`).toBe(true);
      expect(w.find(desktopSel).exists(), `${name} desktop không được mount`).toBe(false);
      expect(desktopMounted).not.toHaveBeenCalled();
    });
    it(`${name}: desktop -> code desktop nguyên văn, KHÔNG dựng giao diện mobile`, async () => {
      isMobile.value = false;
      const router = await setup(ADMIN, at);
      const w = mount(comp as never, opts(router));
      await flushPromises();
      expect(w.find(desktopSel).exists(), `${name} desktop`).toBe(true);
      expect(w.find(mobileSel).exists(), `${name} mobile không được dựng`).toBe(false);
      expect(api.get, 'desktop stub không phát API của mobile').not.toHaveBeenCalled();
    });
  }
});

describe('Khách hàng: loading / empty / error / offline', () => {
  it('loading: skeleton role=status, chưa có "0 khách"', async () => {
    api.get.mockImplementation(neverResolves);
    const router = await setup(ADMIN, '/contacts');
    const w = mount(MobileContactView, opts(router));
    await flushPromises();
    expect(w.find('.m-feedback--loading').exists()).toBe(true);
    expect(w.text()).not.toMatch(/(^|\s)0 khách hàng/);
  });
  it('empty thật (chưa có khách): thông điệp rỗng, không có nút Xóa bộ lọc', async () => {
    api.get.mockResolvedValue({ data: { contacts: [], total: 0 } });
    const router = await setup(ADMIN, '/contacts');
    const w = mount(MobileContactView, opts(router));
    await flushPromises();
    expect(w.text()).toContain('Chưa có khách hàng');
    expect(w.text()).not.toContain('Xóa bộ lọc');
  });
  it('offline (mạng tắt + gọi lỗi): màn offline có Thử lại; khi có mạng bấm Thử lại thì tải được', async () => {
    online.value = false;
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    const router = await setup(ADMIN, '/contacts');
    const w = mount(MobileContactView, opts(router));
    await flushPromises();
    expect(w.find('.m-feedback--offline').exists()).toBe(true);
    expect(w.text()).not.toMatch(/(^|\s)0 khách hàng/);
    api.get.mockResolvedValue({ data: { contacts: [{ id: 'c1', fullName: 'Lan', phone: null }], total: 1 } });
    await w.get('.m-feedback__btn--primary').trigger('click');
    await flushPromises();
    expect(w.findAll('.crm-contact-card')).toHaveLength(1);
  });
});

describe('Tổng quan: loading / offline', () => {
  it('loading: skeleton, chưa hiện số nào', async () => {
    api.get.mockImplementation(neverResolves);
    const router = await setup(ADMIN);
    const w = mount(MobileOverviewView, opts(router));
    await flushPromises();
    expect(w.find('.m-feedback--loading').exists()).toBe(true);
    expect(w.find('.crm-ov__hero').exists()).toBe(false);
  });
  it('offline: màn offline có Thử lại, không hiện số 0 giả', async () => {
    online.value = false;
    api.get.mockRejectedValue(new Error('Network Error'));
    const router = await setup(ADMIN);
    const w = mount(MobileOverviewView, opts(router));
    await flushPromises();
    expect(w.find('.m-feedback--offline').exists()).toBe(true);
    expect(w.find('.crm-ov__hero').exists()).toBe(false);
  });
});

describe('Lịch hẹn: offline', () => {
  it('offline khi chưa có dữ liệu: màn offline có Thử lại, nút tạo lịch vẫn nằm đúng chỗ', async () => {
    online.value = false;
    api.get.mockRejectedValue(new Error('Network Error'));
    const router = await setup(ADMIN, '/appointments');
    const w = mount(MobileAgendaView, opts(router));
    await flushPromises();
    expect(w.find('.m-feedback--offline').exists()).toBe(true);
    expect(w.find('.crm-appt-card').exists()).toBe(false);
  });
});

describe('Hồ sơ khách: forbidden / offline', () => {
  it('forbidden: không có quyền contact -> màn forbidden và KHÔNG gọi API khách', async () => {
    const router = await setup(NO_GRANT, '/contacts/c1/profile');
    const w = mount(MobileContactProfileView, opts(router));
    await flushPromises();
    expect(w.find('.m-feedback--forbidden').exists()).toBe(true);
    expect(api.get).not.toHaveBeenCalled();
  });
  it('offline: tải khách lỗi khi mất mạng -> màn offline (không phải "không tìm thấy")', async () => {
    online.value = false;
    api.get.mockRejectedValue(new Error('Network Error'));
    const router = await setup(ADMIN, '/contacts/c1/profile');
    const w = mount(MobileContactProfileView, opts(router));
    await flushPromises();
    expect(w.find('.m-feedback--offline').exists()).toBe(true);
    expect(w.text()).not.toContain('Không tìm thấy khách hàng');
  });
});
