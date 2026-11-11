// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

const state = vi.hoisted(() => ({ auth: null as any, logout: null as any, get: null as any }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('@/api/index', () => ({ api: { get: (...a: unknown[]) => state.get(...a) } }));
vi.mock('@/components/ui/Avatar.vue', () => ({ default: { props: ['name'], template: '<span class="avatar">{{ name }}</span>' } }));
vi.mock('@/components/settings/ChangePasswordModal.vue', () => ({
  default: { emits: ['close'], template: '<div class="pw-modal"><button class="pw-close" @click="$emit(\'close\')">x</button></div>' },
}));
// MobileSheet bọc VBottomSheet (cần Vuetify đầy đủ): stub tối giản để kiểm danh sách thông báo.
vi.mock('@/components/mobile/shell/MobileSheet.vue', () => ({
  default: { props: ['open', 'title'], template: '<section v-if="open" class="sheet"><h2>{{ title }}</h2><slot /></section>' },
}));

import MobileAccountView from './MobileAccountView.vue';
import { useUiThemeStore } from '@/stores/ui-theme';
import { confirmState, resolveConfirm } from '@/composables/use-confirm';

function user(overrides: Record<string, unknown> = {}) {
  return { id: 'u1', fullName: 'Nguyễn Văn A', orgName: 'Công ty Mẫu', permissionGroupName: 'Sale', role: 'member', avatarUrl: null, ...overrides };
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/account', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
      { path: '/settings/personal/profile', component: { template: '<div />' } },
      { path: '/settings/org/profile', component: { template: '<div />' } },
      { path: '/media', component: { template: '<div />' } },
      { path: '/chat', component: { template: '<div />' } },
    ],
  });
  await router.push('/account');
  await router.isReady();
  const wrapper = mount(MobileAccountView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
  Object.defineProperty(window, 'localStorage', { value: globalThis.localStorage, configurable: true });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })));
  confirmState.value = { open: false, title: '' };
  state.logout = vi.fn();
  state.get = vi.fn().mockResolvedValue({ data: { notifications: [] } });
  state.auth = reactive({
    user: user(),
    granted: [] as string[],
    // giống auth.canAccess thật: owner/admin toàn quyền, còn lại theo grants
    canAccess(resource: string) { return ['owner', 'admin'].includes(this.user?.role ?? '') || this.granted.includes(resource); },
    logout: (...a: unknown[]) => state.logout(...a),
  });
  setActivePinia(createPinia());
});

describe('MobileAccountView', () => {
  it('đầu màn: tên, tổ chức, nhóm quyền của người dùng', async () => {
    const { wrapper } = await mountView();
    const profile = wrapper.get('.m-account__profile');
    expect(profile.text()).toContain('Nguyễn Văn A');
    expect(profile.text()).toContain('Công ty Mẫu');
    expect(profile.text()).toContain('Sale');
    wrapper.unmount();
  });

  it('menu lọc theo quyền và cập nhật khi hạ quyền lúc đang mở', async () => {
    state.auth.user = user({ role: 'admin' });
    const { wrapper } = await mountView();
    const labels = () => wrapper.findAll('.m-menu__label').map(l => l.text());
    expect(labels()).toEqual(['Thông tin cá nhân', 'Đổi mật khẩu', 'Thông báo', 'Nick Zalo', 'Kho media', 'Báo cáo', 'Cài đặt tổ chức', 'Marketing', 'Nhóm', 'Bạn bè']);
    state.auth.user = user({ role: 'member' });
    state.auth.granted = ['media'];
    await flushPromises();
    expect(labels()).toEqual(['Thông tin cá nhân', 'Đổi mật khẩu', 'Thông báo', 'Kho media', 'Marketing', 'Nhóm']);
    wrapper.unmount();
  });

  it('chọn giao diện Tối ghi store (khóa theo user chưa bind -> khóa gốc) và picker phản ánh', async () => {
    const { wrapper } = await mountView();
    await wrapper.findAll('input[type="radio"]')[1].setValue(true);
    expect(useUiThemeStore().preference).toBe('dark');
    expect((wrapper.findAll('input[type="radio"]')[1].element as HTMLInputElement).checked).toBe(true);
    wrapper.unmount();
  });

  it('hàng có đích điều hướng đi tới đúng route', async () => {
    state.auth.granted = ['media'];
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-menu-id="media"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/media');
    wrapper.unmount();
  });

  it('Đổi mật khẩu mở modal hiện có và đóng được', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('.pw-modal').exists()).toBe(false);
    await wrapper.get('[data-menu-id="password"]').trigger('click');
    expect(wrapper.find('.pw-modal').exists()).toBe(true);
    await wrapper.get('.pw-close').trigger('click');
    expect(wrapper.find('.pw-modal').exists()).toBe(false);
    wrapper.unmount();
  });

  it('Thông báo mở danh sách trong app (GET /notifications), lỗi hiện lỗi chứ không giả "trống"', async () => {
    state.get = vi.fn().mockResolvedValue({ data: { notifications: [{ id: 'unreplied', type: 'warning', title: '5 khách chưa trả lời', detail: 'Hãy xử lý', priority: 'high' }] } });
    const { wrapper } = await mountView();
    await wrapper.get('[data-menu-id="notifications"]').trigger('click');
    await flushPromises();
    expect(state.get).toHaveBeenCalledWith('/notifications');
    expect(wrapper.get('.sheet').text()).toContain('5 khách chưa trả lời');
    wrapper.unmount();

    state.get = vi.fn().mockRejectedValue(new Error('500'));
    const second = await mountView();
    await second.wrapper.get('[data-menu-id="notifications"]').trigger('click');
    await flushPromises();
    expect(second.wrapper.get('.sheet').text()).toContain('Không tải được thông báo');
    expect(second.wrapper.get('.sheet').text()).not.toContain('Không có thông báo');
    second.wrapper.unmount();
  });

  it('Đăng xuất có xác nhận: hủy -> không đăng xuất; đồng ý -> auth.logout() rồi về /login', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('.m-account__logout').trigger('click');
    expect(confirmState.value.open).toBe(true);
    resolveConfirm(false, '');
    await flushPromises();
    expect(state.logout).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/account');

    await wrapper.get('.m-account__logout').trigger('click');
    resolveConfirm(true, '');
    await flushPromises();
    expect(state.logout).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/login');
    wrapper.unmount();
  });
});
