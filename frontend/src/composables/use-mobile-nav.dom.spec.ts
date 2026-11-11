// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';

const state = vi.hoisted(() => ({ auth: null as any, count: null as any }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('@/composables/use-mobile-waiting-count', () => ({ useMobileWaitingCount: () => ({ count: state.count }) }));

import { useMobileNavItems } from './use-mobile-nav';

function authWith(resources: string[]) {
  return reactive({
    user: { role: 'member' },
    grantedResources: resources,
    canAccess(resource: string) {
      return this.grantedResources.includes(resource);
    },
  });
}

describe('useMobileNavItems', () => {
  it('đủ quyền: 5 mục theo thứ tự, chỉ Hội thoại là nút nổi, không có tab Báo cáo', () => {
    state.auth = authWith(['contact', 'conversation']);
    state.count = ref(null);
    const items = useMobileNavItems();
    expect(items.value.map(i => i.key)).toEqual(['overview', 'contacts', 'chat', 'agenda', 'account']);
    expect(items.value.map(i => i.label)).toEqual(['Tổng quan', 'Khách hàng', 'Hội thoại', 'Lịch hẹn', 'Tài khoản']);
    expect(items.value.filter(i => i.prominent).map(i => i.key)).toEqual(['chat']);
    expect(items.value.some(i => /báo cáo/i.test(i.label))).toBe(false);
  });

  it('thiếu quyền conversation hoặc contact: ẩn mục tương ứng, các mục luôn có vẫn còn', () => {
    state.count = ref(null);
    state.auth = authWith(['contact']);
    expect(useMobileNavItems().value.map(i => i.key)).toEqual(['overview', 'contacts', 'agenda', 'account']);
    state.auth = authWith(['conversation']);
    expect(useMobileNavItems().value.map(i => i.key)).toEqual(['overview', 'chat', 'agenda', 'account']);
    state.auth = authWith([]);
    expect(useMobileNavItems().value.map(i => i.key)).toEqual(['overview', 'agenda', 'account']);
  });

  it('hạ quyền lúc đang mở: mục biến mất ngay', () => {
    state.count = ref(null);
    state.auth = authWith(['contact', 'conversation']);
    const items = useMobileNavItems();
    expect(items.value.map(i => i.key)).toContain('chat');
    state.auth.grantedResources = ['contact'];
    expect(items.value.map(i => i.key)).not.toContain('chat');
  });

  it('badge: null hoặc 0 -> không hiện; có số -> badge kèm nhãn đọc được', () => {
    state.auth = authWith(['conversation']);
    state.count = ref<number | null>(null);
    const items = useMobileNavItems();
    const chat = () => items.value.find(i => i.key === 'chat')!;
    expect(chat().badge).toBeNull();
    state.count.value = 0;
    expect(chat().badge).toBeNull();
    state.count.value = 7;
    expect(chat().badge).toBe(7);
    expect(chat().badgeLabel).toBe('7 khách đang chờ trả lời');
  });
});
