// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createWebHistory, type Router } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));

import MobileSettingsShell from './MobileSettingsShell.vue';
import { SETTINGS_GROUPS } from '@/composables/use-settings-nav';
import { MOBILE_SHELL_KEY, type MobileShellContext } from '@/components/mobile/shell/shell-context';
import { StubThemeProvider, installMemoryStorage } from '@/composables/mobile-crm/test-utils';
import { useAuthStore } from '@/stores/auth';

const page = { template: '<div class="page-body">nội dung trang</div>' };
const stub = { template: '<div />' };
const routes = [
  { path: '/account', name: 'Account', component: stub },
  { path: '/settings', name: 'Settings', component: stub },
  { path: '/settings/personal/profile', name: 'Settings.Profile', component: stub },
  { path: '/settings/org/profile', name: 'Settings.OrgProfile', component: stub },
  { path: '/settings/rbac/users', name: 'Settings.Users', component: stub },
  { path: '/settings/rbac/users-x', name: 'Settings.RbacUsers', component: stub },
  { path: '/settings/channels/zalo', name: 'Settings.ZaloAccounts', component: stub },
  { path: '/settings/rbac/permission-groups', name: 'Settings.RbacPermissionGroups', component: stub },
  { path: '/settings/personal/notifications', name: 'Settings.Notifications', component: stub },
];

function shellContext() {
  const release = vi.fn();
  const requestChrome = vi.fn(() => release);
  const ctx = { viewport: {}, tabbarVisible: ref(true), headerVisible: ref(true), requestChrome } as unknown as MobileShellContext;
  return { ctx, requestChrome, release };
}

async function setup(user: Record<string, unknown>, startAt = '/account') {
  installMemoryStorage();
  setActivePinia(createPinia());
  useAuthStore().user = user as never;
  window.history.replaceState(null, '', startAt);
  const router = createRouter({ history: createWebHistory(), routes });
  await router.push(startAt);
  await router.isReady();
  return router;
}

function mountShell(router: Router, ctx?: MobileShellContext) {
  return mount(MobileSettingsShell, {
    slots: { default: page },
    global: { plugins: [router], stubs: { VThemeProvider: StubThemeProvider }, provide: ctx ? { [MOBILE_SHELL_KEY as symbol]: ctx } : {} },
  });
}

async function waitPath(router: Router, path: string) {
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path), { timeout: 2000 });
  await flushPromises();
}

const admin = { id: 'a', fullName: 'Admin', role: 'admin', orgId: 'o' };
const groupLabels = (w: ReturnType<typeof mount>) => w.findAll('.crm-sm__gh').map(h => h.text());
const itemLabels = (w: ReturnType<typeof mount>) => w.findAll('.crm-sm__label').map(l => l.text());

beforeEach(() => { for (const f of Object.values(api)) f.mockReset(); });

describe('Cài đặt mobile — cấp 1 dùng CHUNG menu + lọc quyền với desktop', () => {
  it('admin: đủ nhóm theo đúng thứ tự SETTINGS_GROUPS của desktop', async () => {
    const router = await setup(admin, '/settings');
    const w = mountShell(router);
    await flushPromises();
    expect(groupLabels(w)).toEqual(SETTINGS_GROUPS.map(g => g.label));
    expect(itemLabels(w)).toEqual(SETTINGS_GROUPS.flatMap(g => g.items.filter(i => !i.extensionOnly).map(i => i.label)));
  });

  it('nhân viên thường (không grant): chỉ nhóm Cá nhân; không thấy Tổ chức / Hệ thống', async () => {
    const router = await setup({ id: 'm', fullName: 'M', role: 'member', orgId: 'o', grants: {} }, '/settings');
    const w = mountShell(router);
    await flushPromises();
    expect(groupLabels(w)).toEqual(['Cá nhân']);
    expect(itemLabels(w)).toEqual(['Tài khoản của tôi', 'Thông báo của tôi']);
  });

  it('có grant user + zalo_account (không settings): chỉ các mục có quyền, giữ thứ tự nhóm', async () => {
    const router = await setup({ id: 'm', fullName: 'M', role: 'member', orgId: 'o', grants: { user: { access: true }, zalo_account: { access: true } } }, '/settings');
    const w = mountShell(router);
    await flushPromises();
    expect(groupLabels(w)).toEqual(['Cá nhân', 'Tổ chức', 'Kênh & Tự động']);
    expect(itemLabels(w)).toContain('Nhân viên');
    expect(itemLabels(w)).toContain('Tài khoản Zalo');
    expect(itemLabels(w)).not.toContain('Hồ sơ tổ chức');
    expect(itemLabels(w)).not.toContain('Phân quyền');
  });

  it('chọn mục -> điều hướng tới route của mục; tìm kiếm lọc theo nhãn/alias; không có kết quả có thông báo', async () => {
    const router = await setup(admin, '/settings');
    const w = mountShell(router);
    await flushPromises();
    await w.get('input[type="search"]').setValue('phân quyền');
    expect(itemLabels(w)).toEqual(['Phân quyền']);
    await w.get('input[type="search"]').setValue('zzzz-không-có');
    expect(w.text()).toContain('Không tìm thấy');
    await w.get('input[type="search"]').setValue('');
    await w.findAll('.crm-sm__row').find(r => r.text().includes('Nhân viên'))!.trigger('click');
    await waitPath(router, '/settings/rbac/users');
  });

  it('không có mục nào được phép -> trạng thái forbidden thay vì danh sách trống', async () => {
    const router = await setup({ id: 'x', fullName: 'X', role: 'member', orgId: 'o', grants: {} }, '/settings');
    const w = mountShell(router);
    await flushPromises();
    // Nhóm Cá nhân luôn có (không cần resource) nên không bao giờ rỗng: khẳng định đúng ràng buộc đó.
    expect(w.find('.m-feedback--forbidden').exists()).toBe(false);
    expect(groupLabels(w)).toEqual(['Cá nhân']);
  });
});

describe('Cài đặt mobile — cấp 2', () => {
  it('header riêng có nút quay lại + tiêu đề; không breadcrumb; shell được xin ẩn header mặc định; nội dung là đảo Sáng', async () => {
    const { ctx, requestChrome } = shellContext();
    const router = await setup(admin, '/settings');
    const w = mountShell(router, ctx);
    await flushPromises();
    expect(requestChrome).not.toHaveBeenCalled(); // cấp 1 dùng header của shell
    await router.push('/settings/org/profile');
    await flushPromises();
    expect(w.get('.crm-settings__title').text()).toBe('Hồ sơ tổ chức');
    expect(w.get('.crm-settings__back').attributes('aria-label')).toBe('Quay lại danh sách cài đặt');
    expect(w.find('.sl-breadcrumb').exists()).toBe(false);
    expect(requestChrome).toHaveBeenCalledWith({ header: false });
    expect(w.get('.stub-theme').attributes('data-theme-name')).toBe('hsLight');
    expect(w.find('.page-body').exists()).toBe(true);
    await router.push('/settings');
    await flushPromises();
    expect(w.find('.crm-settings__head').exists()).toBe(false);
  });

  it('rời cấp 2 trả lại header cho shell (release)', async () => {
    const { ctx, release } = shellContext();
    const router = await setup(admin, '/settings');
    mountShell(router, ctx);
    await router.push('/settings/personal/profile');
    await flushPromises();
    await router.push('/settings');
    await flushPromises();
    expect(release).toHaveBeenCalled();
  });
});

describe('Cài đặt mobile — Back: cấp 2 -> cấp 1 -> /account', () => {
  it('luồng thường: /account -> /settings -> cấp 2; nút quay lại về cấp 1; rồi Back về /account', async () => {
    const router = await setup(admin, '/account');
    const w = mountShell(router);
    await router.push('/settings');
    await flushPromises();
    await w.findAll('.crm-sm__row').find(r => r.text().includes('Hồ sơ tổ chức'))!.trigger('click');
    await waitPath(router, '/settings/org/profile');
    expect(window.history.state.back).toBe('/settings');
    await w.get('.crm-settings__back').trigger('click');
    await waitPath(router, '/settings');
    expect(window.history.state.back).toBe('/account');
    router.back();
    await waitPath(router, '/account');
  });

  it('từ /account đi thẳng vào cấp 2 (menu Tài khoản): chèn cấp 1 -> Back về cấp 1 rồi /account', async () => {
    const router = await setup(admin, '/account');
    const w = mountShell(router);
    await router.push('/settings/personal/profile');
    await waitPath(router, '/settings/personal/profile');
    await vi.waitFor(() => expect(window.history.state.back).toBe('/settings'));
    expect(w.find('.crm-settings__native').exists()).toBe(true); // Settings.Profile = trang mobile dựng riêng (F1), không còn slot desktop
    router.back();
    await waitPath(router, '/settings');
    expect(window.history.state.back).toBe('/account');
    router.back();
    await waitPath(router, '/account');
  });

  it('deep link mở thẳng /settings/... (cold start): ra đúng trang, nhưng Back vẫn về cấp 1', async () => {
    const router = await setup(admin, '/settings/channels/zalo');
    expect(window.history.state.back).toBeNull();
    const w = mountShell(router);
    expect(w.find('.page-body').exists()).toBe(false); // chưa chớp nội dung khi lịch sử chưa đúng
    await vi.waitFor(() => expect(window.history.state.back).toBe('/settings'));
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/settings/channels/zalo');
    expect(w.get('.crm-settings__title').text()).toBe('Tài khoản Zalo');
    expect(w.find('.page-body').exists()).toBe(true);
    await w.get('.crm-settings__back').trigger('click');
    await waitPath(router, '/settings');
    expect(w.find('.crm-sm').exists()).toBe(true);
  });

  it('giữ query của deep link (?tab=...) khi chuẩn hóa lịch sử', async () => {
    const router = await setup(admin, '/settings/channels/zalo?tab=privacy');
    mountShell(router);
    await vi.waitFor(() => expect(window.history.state.back).toBe('/settings'));
    expect(router.currentRoute.value.fullPath).toBe('/settings/channels/zalo?tab=privacy');
  });
});

describe('Cài đặt mobile — vòng sửa sau review', () => {
  it('HIGH: rời Cài đặt (gỡ shell) khi đang ở cấp 2 -> trả lại header cho shell, kể cả không phải deep link', async () => {
    const { ctx, requestChrome, release } = shellContext();
    const router = await setup(admin, '/settings');
    const w = mountShell(router, ctx);
    await router.push('/settings/org/profile');
    await flushPromises();
    expect(requestChrome).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    w.unmount(); // bấm tab khác trên tabbar -> SettingsLayout/shell bị gỡ
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('MEDIUM: cấp 2 A -> cấp 2 B bằng link trong trang rồi quay lại: về /settings, không nhân đôi entry; Back tiếp về /account', async () => {
    const router = await setup(admin, '/account');
    const w = mountShell(router);
    await router.push('/settings');
    await flushPromises();
    await w.findAll('.crm-sm__row').find(r => r.text().includes('Hồ sơ tổ chức'))!.trigger('click');
    await waitPath(router, '/settings/org/profile');
    await router.push('/settings/rbac/users'); // link trong trang A sang trang B
    await waitPath(router, '/settings/rbac/users');
    await w.get('.crm-settings__back').trigger('click');
    await waitPath(router, '/settings');
    expect(window.history.state.back).toBe('/account');
    router.back();
    await waitPath(router, '/account');
  });

  it('MEDIUM: chuẩn hóa deep link không chớp menu cấp 1 (isRoot tạm thời) và không dựng nội dung trang', async () => {
    const { ctx, requestChrome } = shellContext();
    const router = await setup(admin, '/settings/org/profile');
    const w = mountShell(router, ctx);
    let sawMenu = w.find('.crm-sm').exists();
    const stop = router.afterEach(() => { sawMenu = sawMenu || w.find('.crm-sm').exists(); });
    await vi.waitFor(() => expect(window.history.state.back).toBe('/settings'));
    await flushPromises();
    stop();
    expect(sawMenu).toBe(false);
    expect(w.find('.crm-sm').exists()).toBe(false);
    expect(w.find('.page-body').exists()).toBe(true);
    expect(requestChrome).toHaveBeenCalledTimes(1); // header chỉ đổi đúng một lần, không bật/tắt
  });
});

describe('F1 — chính sách trang cấp 2', () => {
  const owner = { id: 'o', fullName: 'Owner', role: 'owner', orgId: 'o' };
  it('Nhóm quyền: trang mobile ĐỌC (không inert), KHÔNG mount trang desktop, chọn nhóm xem được quyền', async () => {
    api.get.mockImplementation(async (u: string) => (u === '/permission-groups'
      ? { data: { tree: [{ id: 'g1', name: 'Quản lý', parentId: null, isSystem: true, displayOrder: 0, memberCount: 1, grants: { contact: { access: true } }, children: [] }] } }
      : { data: { resources: ['contact'], actions: ['access'], resourceActions: { contact: ['access'] } } }));
    const router = await setup(owner, '/settings');
    const w = mountShell(router);
    await router.push('/settings/rbac/permission-groups');
    await waitPath(router, '/settings/rbac/permission-groups');
    await vi.waitFor(() => expect(w.find('.crm-pg').exists()).toBe(true));
    await vi.waitFor(() => expect(w.find('.crm-pg__detail').exists()).toBe(true));
    expect(w.find('[inert]').exists()).toBe(false);
    expect(w.find('.crm-rof').exists()).toBe(false);
    expect(w.find('.page-body').exists()).toBe(false);
    expect(w.find('.stub-theme').exists()).toBe(false); // native: token Sáng/Tối, không phải đảo hsLight
  });
  it('Nhân viên: dùng lại component desktop (slot) trong khung token và PROVIDE cờ mobile cho controller gốc', async () => {
    const { inject } = await import('vue');
    const { MOBILE_SETTINGS_KEY } = await import('./settings-context');
    const probe = { setup: () => ({ mobile: inject(MOBILE_SETTINGS_KEY, false) }), template: '<div class="page-body" :data-mobile="String(mobile)">users</div>' };
    const router = await setup(admin, '/settings');
    const w = mount(MobileSettingsShell, { slots: { default: probe }, global: { plugins: [router], stubs: { VThemeProvider: StubThemeProvider } } });
    await router.push('/settings/rbac/users');
    await waitPath(router, '/settings/rbac/users');
    await router.replace({ name: 'Settings.RbacUsers' });
    await flushPromises();
    expect(w.get('.page-body').attributes('data-mobile')).toBe('true');
    expect(w.find('.crm-settings__native .page-body').exists()).toBe(true);
    expect(w.find('.stub-theme').exists()).toBe(false);
  });
  it('Hồ sơ tổ chức giữ component desktop nhưng theo Sáng/Tối; trang khác luôn Sáng', async () => {
    const router = await setup(admin, '/settings');
    const w = mountShell(router);
    await router.push('/settings/org/profile');
    await waitPath(router, '/settings/org/profile');
    expect(w.find('.stub-theme').attributes('data-theme-name')).toBe('hsLight');
    const { useUiThemeStore } = await import('@/stores/ui-theme');
    useUiThemeStore().setPreference('dark');
    await flushPromises();
    expect(w.find('.stub-theme').attributes('data-theme-name')).toBe('hsDark');
    await router.push('/settings/channels/zalo');
    await waitPath(router, '/settings/channels/zalo');
    expect(w.find('.stub-theme').attributes('data-theme-name')).toBe('hsLight');
  });
  it('menu: "Thông báo của tôi" GIỮ đích gốc (tab internal-contact) và mở cấu hình mobile chỉ đọc, không mount cả trang Zalo desktop', async () => {
    api.get.mockResolvedValue({ data: { method: null, ownedNicks: [], recipient: null, systemSender: null } });
    const router = await setup(admin, '/settings');
    const w = mountShell(router);
    const row = w.findAll('.crm-sm__row').find(r => r.text().includes('Thông báo của tôi'));
    await row!.trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/channels/zalo?tab=internal-contact'));
    await vi.waitFor(() => expect(w.find('.crm-ic').exists()).toBe(true));
    expect(w.find('.page-body').exists()).toBe(false); // slot (RouterView -> ZaloAccountsView) KHÔNG được dựng
    expect(api.get).toHaveBeenCalledWith('/me/internal-contact');
    expect(w.get('.crm-settings__title').text()).toBe('Thông báo của tôi');
    // tab khác của cùng route vẫn là trang desktop
    await router.push('/settings/channels/zalo');
    await flushPromises();
    expect(w.find('.page-body').exists()).toBe(true);
  });
});
