// @vitest-environment jsdom
/**
 * Hành vi mobile của component DÙNG CHUNG đã nhận qua shared.patch (UsersRbacView, OrgSettings, MobileSheet).
 * Kiểm: desktop không đổi (mặc định false), race tìm nhân viên, payload mutation giữ nguyên, Org loading/error/dirty.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { defineComponent, h } from 'vue';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));

import UsersRbacView from '@/views/rbac/UsersRbacView.vue';
import OrgSettings from '@/components/settings/OrgSettings.vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { MOBILE_SETTINGS_KEY } from './settings-context';
import { useAuthStore } from '@/stores/auth';
import { StubBottomSheet, installMemoryStorage } from '@/composables/mobile-crm/test-utils';

const user = (id: string, name: string) => ({
  id, fullName: name, email: null, phone: '84912345678', avatarUrl: null, role: 'member', permissionGroupId: null, permissionGroup: null, departmentMember: null,
  internalContactMethod: null, internalContactPhone: null, internalContactZaloAccountId: null, internalContactNick: null, recipientStatus: null, recipientError: null,
  passwordChangedAt: '2026-01-01', lastLoginAt: new Date().toISOString(), isActive: true, onboarding: null,
});
// Vuetify không được cài trong spec: v-text-field thay bằng input thật (v-model).
const TextFieldStub = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('input', { type: 'text', value: p.modelValue, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }) });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

const panelStub = defineComponent({ name: 'UserEditPanel', props: { open: Boolean, user: Object, currentUserId: String, currentUserRole: String, mobile: Boolean, handoffUsers: Array }, emits: ['close', 'changed'], setup: (p) => () => h('div', { class: 'panel-stub', 'data-mobile': String(!!p.mobile) }) });
const modalStub = defineComponent({ name: 'CreateUserWithZaloModal', props: { open: Boolean, mobile: Boolean, departments: Array, permissionGroups: Array }, emits: ['update:open', 'created'], setup: () => () => h('div', { class: 'modal-stub' }) });

async function mountUsers(mobile: boolean, role = 'admin') {
  installMemoryStorage();
  setActivePinia(createPinia());
  useAuthStore().user = { id: 'me', fullName: 'Me', role, orgId: 'o' } as never;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/');
  return mount(UsersRbacView, {
    global: { plugins: [router], provide: mobile ? { [MOBILE_SETTINGS_KEY as symbol]: true } : {}, stubs: { UserEditPanel: panelStub, CreateUserWithZaloModal: modalStub } },
  });
}

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); vi.useRealTimers(); });

describe('Nhân viên — controller gốc có nhánh mobile', () => {
  it('KHÔNG có cờ mobile -> DOM desktop nguyên gốc (bảng, không presenter thẻ), tải qua store như cũ', async () => {
    api.get.mockResolvedValue({ data: { users: [user('u1', 'Lan Anh')], tree: [] } });
    const w = await mountUsers(false);
    await flushPromises();
    expect(w.find('.mu-root').exists()).toBe(false);
    expect(w.find('.dept-page').exists()).toBe(true);
    expect(w.find('table.at-table').exists()).toBe(true);
    expect(w.find('.panel-stub').attributes('data-mobile')).toBe('false');
  });

  it('mobile: thẻ + presenter, UserEditPanel/Modal gốc nhận prop mobile, quyền tạo/bulk theo vai trò gốc', async () => {
    api.get.mockResolvedValue({ data: { users: [user('u1', 'Lan Anh')], tree: [] } });
    const admin = await mountUsers(true, 'admin');
    await flushPromises();
    expect(admin.find('.mu-root').exists()).toBe(true);
    expect(admin.find('.dept-page').exists()).toBe(false);
    expect(admin.find('.crm-el__add').exists()).toBe(true);
    expect(admin.find('.crm-el__check').exists()).toBe(true);
    expect(admin.find('.panel-stub').attributes('data-mobile')).toBe('true');
    const member = await mountUsers(true, 'member');
    await flushPromises();
    expect(member.find('.crm-el__add').exists()).toBe(false); // canCreateUser gốc
    expect(member.find('.crm-el__check').exists()).toBe(false); // canBulk gốc
  });

  it('RACE: gõ "an" rồi "anh", response "an" về SAU -> danh sách vẫn là kết quả "anh"', async () => {
    vi.useFakeTimers();
    const slow = deferred<{ data: { users: unknown[] } }>();
    api.get.mockImplementation((url: string) => {
      if (url.startsWith('/rbac/users?q=an&') || url === '/rbac/users?q=an') return slow.promise;
      if (url === '/rbac/users?q=anh') return Promise.resolve({ data: { users: [user('u2', 'Anh Tuấn')] } });
      if (url.startsWith('/rbac/users')) return Promise.resolve({ data: { users: [user('u0', 'Ban Đầu')] } });
      return Promise.resolve({ data: { tree: [], resources: [], actions: [], resourceActions: {} } });
    });
    const w = await mountUsers(true);
    await vi.advanceTimersByTimeAsync(0);
    const input = w.get('.crm-el__search input');
    await input.setValue('an');
    await vi.advanceTimersByTimeAsync(300);
    await input.setValue('anh');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(w.text()).toContain('Anh Tuấn');
    slow.resolve({ data: { users: [user('u3', 'Ân Cũ Về Muộn')] } }); // response cũ về sau
    await flushPromises();
    expect(w.text()).toContain('Anh Tuấn');
    expect(w.text()).not.toContain('Ân Cũ Về Muộn');
    vi.useRealTimers();
  });

  it('lỗi tải -> trạng thái lỗi có Thử lại (không phải "Chưa có nhân viên"); 403 -> forbidden', async () => {
    const failUsers = (status: number) => api.get.mockImplementation((url: string) => (url.startsWith('/rbac/users')
      ? Promise.reject({ response: { status } })
      : Promise.resolve({ data: { tree: [], resources: [], actions: [], resourceActions: {} } })));
    failUsers(500);
    const w = await mountUsers(true);
    await flushPromises();
    expect(w.text()).toContain('Không tải được danh sách nhân viên');
    expect(w.text()).not.toContain('Chưa có nhân viên nào');
    failUsers(403);
    const w2 = await mountUsers(true);
    await flushPromises();
    expect(w2.find('.m-feedback--forbidden').exists()).toBe(true);
  });

  it('gán hàng loạt: payload y hệt desktop (POST /users/bulk-assign {userIds, departmentId|permissionGroupId})', async () => {
    api.get.mockImplementation((url: string) => Promise.resolve(url.startsWith('/rbac/users') ? { data: { users: [user('u1', 'Lan Anh'), user('u2', 'Bình')] } } : { data: { tree: [{ id: 'd1', name: 'KD', parentId: null, path: '/', depth: 0, displayOrder: 0, archivedAt: null, memberCount: 0, leaderUserId: null, deputyUserId: null, children: [] }], resources: [], actions: [], resourceActions: {} } }));
    api.post.mockResolvedValue({ data: { affected: 2 } });
    vi.stubGlobal('alert', vi.fn());
    const w = await mountUsers(true);
    await flushPromises();
    await w.get('.crm-el__all input').setValue(true); // chọn tất cả (đang hiển thị)
    const selects = w.findAll('.crm-el__bulk select');
    await selects[0].setValue('d1');
    await w.get('.crm-el__btn--primary').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/users/bulk-assign', { userIds: ['u1', 'u2'], departmentId: 'd1' });
    vi.unstubAllGlobals();
  });
});

describe('Hồ sơ tổ chức — mobile', () => {
  const mountOrg = async (opts: { mobile?: boolean; provide?: boolean; owner?: boolean } = {}) => {
    installMemoryStorage();
    setActivePinia(createPinia());
    useAuthStore().user = { id: 'o', fullName: 'Owner', role: opts.owner === false ? 'admin' : 'owner', orgId: 'o' } as never;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/other', component: { template: '<div />' } }] });
    await router.push('/');
    const w = mount(OrgSettings, {
      props: opts.mobile ? { mobile: true } : {},
      global: { plugins: [router], provide: opts.provide ? { [MOBILE_SETTINGS_KEY as symbol]: true } : {}, stubs: { LoginPreview: true, VThemeProvider: { template: '<div class="tp"><slot /></div>' }, VTextField: TextFieldStub } },
    });
    return { w, router };
  };

  it('desktop (mặc định): lỗi tải im lặng như cũ, form vẫn hiện, không có trạng thái mobile', async () => {
    api.get.mockRejectedValue({ response: { status: 500 } });
    const { w } = await mountOrg();
    await flushPromises();
    expect(w.find('.m-feedback').exists()).toBe(false);
    expect(w.find('.org-form-col').exists()).toBe(true);
    expect(w.find('.org-settings-layout--m').exists()).toBe(false);
  });

  it('mobile: lỗi tải KHÔNG hiện form trống như dữ liệu thật; Thử lại tải được', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    const { w } = await mountOrg({ provide: true });
    await flushPromises();
    expect(w.find('.m-feedback--error').exists()).toBe(true);
    expect(w.find('.org-form-col').exists()).toBe(false);
    api.get.mockResolvedValueOnce({ data: { name: 'CRV', timezone: '+07:00', logoUrl: '', slogan: '', copyright: '', emailDomain: '' } });
    await w.get('.m-feedback button').trigger('click');
    await flushPromises();
    expect(w.find('.org-form-col').exists()).toBe(true);
  });

  it('mobile: 403 -> forbidden; 404 (chưa có tổ chức) -> form mặc định như cũ', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 403 } });
    const a = await mountOrg({ mobile: true });
    await flushPromises();
    expect(a.w.find('.m-feedback--forbidden').exists()).toBe(true);
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    const b = await mountOrg({ mobile: true });
    await flushPromises();
    expect(b.w.find('.org-form-col').exists()).toBe(true);
  });

  // onBeforeRouteLeave chỉ hoạt động khi component nằm trong RouterView -> test mount qua RouterView như shell thật.
  const mountRouted = async () => {
    installMemoryStorage();
    setActivePinia(createPinia());
    useAuthStore().user = { id: 'o', fullName: 'Owner', role: 'owner', orgId: 'o' } as never;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: OrgSettings }, { path: '/other', component: { template: '<div />' } }] });
    await router.push('/');
    const w = mount({ template: '<RouterView />' }, { global: { plugins: [router], provide: { [MOBILE_SETTINGS_KEY as symbol]: true }, stubs: { LoginPreview: true, VThemeProvider: { template: '<div class="tp"><slot /></div>' }, VTextField: TextFieldStub } } });
    await flushPromises();
    return { w, router };
  };

  it('mobile: form sửa dở -> rời trang hỏi xác nhận (kể cả tên rỗng); chưa sửa thì đi ngay', async () => {
    api.get.mockResolvedValue({ data: { name: 'CRV', timezone: '+07:00', logoUrl: '', slogan: '', copyright: '', emailDomain: '' } });
    const { confirmState, resolveConfirm } = await import('@/composables/use-confirm');
    const clean = await mountRouted();
    await clean.router.push('/other'); // không sửa: đi được ngay, không hỏi
    expect(clean.router.currentRoute.value.path).toBe('/other');
    expect(confirmState.value.open).toBe(false);

    const { w, router } = await mountRouted();
    await w.get('.org-form-col input').setValue('CRV mới');
    const nav = router.push('/other');
    await flushPromises();
    expect(confirmState.value.open).toBe(true);
    resolveConfirm(false, ''); // Tiếp tục chỉnh sửa
    await nav;
    expect(router.currentRoute.value.path).toBe('/');
    // tên rỗng KHÔNG dùng canSave (canSave=false) nhưng vẫn là thay đổi chưa lưu
    await w.get('.org-form-col input').setValue('');
    const nav2 = router.push('/other');
    await flushPromises();
    expect(confirmState.value.open).toBe(true);
    resolveConfirm(true, ''); // Bỏ thay đổi
    await nav2;
    expect(router.currentRoute.value.path).toBe('/other');
  });
});

describe('MobileSheet — persistent chặn cả nút Đóng ở header', () => {
  it('persistent=true: bấm Đóng không phát update:open; persistent=false: phát như cũ', async () => {
    const mk = (persistent: boolean) => mount(MobileSheet, { props: { open: true, title: 'T', persistent }, global: { stubs: { VBottomSheet: StubBottomSheet } } });
    const locked = mk(true);
    await locked.get('.m-sheet__close').trigger('click');
    await flushPromises();
    expect(locked.emitted('update:open')).toBeUndefined();
    const free = mk(false);
    await free.get('.m-sheet__close').trigger('click');
    await flushPromises();
    expect(free.emitted('update:open')?.[0]).toEqual([false]);
  });
});
