// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref } from 'vue';

const isMobile = ref(true);
const online = ref(true);
vi.mock('@/composables/use-mobile', () => ({ useMobile: () => ({ isMobile, isOnline: online }) }));

const h2 = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn(), path: { value: '/marketing/group-scan' } }));
vi.mock('@/api', () => ({ api: { get: h2.get, post: h2.post, patch: h2.patch, put: h2.put, delete: h2.del } }));
vi.mock('@/api/index', () => ({ api: { get: h2.get, post: h2.post, patch: h2.patch, put: h2.put, delete: h2.del } }));
vi.mock('vue-router', async (orig) => {
  const actual = await orig<typeof import('vue-router')>();
  return { ...actual, useRoute: () => ({ get path() { return h2.path.value; } }), RouterLink: { props: ['to'], template: '<a class="stub-link" :href="String(to)"><slot /></a>' } };
});

// Cờ tính năng chỉnh được; các hàm suy ra từ cờ này đúng như bản thật (MARKETING_PATH_FEATURES).
const gate = vi.hoisted(() => ({ value: {} as Record<string, boolean> }));
vi.mock('@/utils/marketingFeatureFlags', async (orig) => {
  const actual = await orig<typeof import('@/utils/marketingFeatureFlags')>();
  gate.value = Object.fromEntries(actual.MARKETING_FEATURE_KEYS.map(k => [k, true]));
  const feature = (p: string) => actual.getMarketingFeatureForPath(p);
  return {
    ...actual,
    marketingFeatureGate: gate.value,
    isMarketingPathEnabled: (p: string) => { const f = feature(p); return f ? gate.value[f] : true; },
    getMarketingFallbackPath: () => {
      const order: Array<[string, string]> = [
        ['targets', '/marketing/targets'], ['sequences', '/marketing/sequences'], ['contentBlocks', '/marketing/content-blocks'],
        ['broadcasts', '/marketing/broadcasts'], ['lists', '/marketing/lists'], ['messageTemplates', '/marketing/message-templates'], ['groupScan', '/marketing/group-scan'],
      ];
      return order.find(([k]) => gate.value[k])?.[1] ?? '/marketing/group-scan';
    },
  };
});

import { enabledMarketingFeatures, marketingEntryPath, marketingFeatureOfPath, resolveToolEntries, toolForPath } from './tools-model';
import MobileToolPage from './MobileToolPage.vue';
import { mobileToolRoute } from '@/views/mobile/tools/mobile-tool-route';
import { useAuthStore } from '@/stores/auth';
import { installMemoryStorage } from '@/__tests__/mobile/test-utils';
import { MARKETING_FEATURE_KEYS } from '@/utils/marketingFeatureFlags';
import { StubBottomSheet } from '@/__tests__/mobile/test-utils';
import { mapFriendRow, mapGroupRow, mapListEntryRow, mapListRow, mapScanRow } from '@/composables/mobile-tools/mobile-tool-readers';

const auth = (signedIn: boolean, granted: string[]) => ({ user: signedIn ? {} : null, canAccess: (r: string) => granted.includes(r) });
const setAll = (on: boolean) => { for (const k of MARKETING_FEATURE_KEYS) gate.value[k] = on; };

beforeEach(() => { setAll(true); });

describe('tools-model: quyền + tính năng, sao đúng desktop', () => {
  it('Community: Marketing hiện khi đã đăng nhập và còn ít nhất một chức năng bật; trỏ group-scan', () => {
    expect(marketingEntryPath(auth(true, []), false)).toBe('/marketing/group-scan');
    expect(marketingEntryPath(auth(false, []), false)).toBeNull();
  });
  it('Community: group-scan tắt -> rơi về fallback của router guard (targets đầu tiên)', () => {
    gate.value.groupScan = false;
    expect(marketingEntryPath(auth(true, []), false)).toBe('/marketing/targets');
    gate.value.targets = false;
    expect(marketingEntryPath(auth(true, []), false)).toBe('/marketing/sequences');
  });
  it('Community: TẤT CẢ cờ tắt -> Marketing ẨN khỏi menu dù đã đăng nhập', () => {
    setAll(false);
    expect(marketingEntryPath(auth(true, []), false)).toBeNull();
    const ids = resolveToolEntries(auth(true, ['friend']), false).filter(e => e.visible).map(e => e.id);
    expect(ids).toEqual(['groups', 'friends']);
    expect(enabledMarketingFeatures()).toEqual([]);
  });
  it('mở rộng: lists trước group-scan; không quyền hoặc cờ tắt -> ẩn / chọn chức năng kế', () => {
    expect(marketingEntryPath(auth(true, []), true)).toBeNull();
    expect(marketingEntryPath(auth(true, ['friend']), true)).toBe('/marketing/group-scan');
    expect(marketingEntryPath(auth(true, ['friend', 'customer_list']), true)).toBe('/marketing/lists');
    gate.value.lists = false;
    expect(marketingEntryPath(auth(true, ['friend', 'customer_list']), true)).toBe('/marketing/group-scan');
    gate.value.groupScan = false;
    expect(marketingEntryPath(auth(true, ['friend', 'customer_list']), true)).toBeNull();
  });
  it('Nhóm chỉ cần đăng nhập (route chỉ requiresAuth, không có resource); Bạn bè cần friend', () => {
    const ids = (a: ReturnType<typeof auth>) => resolveToolEntries(a, false).filter(e => e.visible).map(e => e.id);
    expect(ids(auth(true, []))).toEqual(['marketing', 'groups']);
    expect(ids(auth(true, ['friend']))).toEqual(['marketing', 'groups', 'friends']);
    expect(ids(auth(false, ['friend']))).toEqual([]);
  });
  it('toolForPath + marketingFeatureOfPath (cả alias và chi tiết)', () => {
    expect(toolForPath('/marketing/lists/abc')).toBe('marketing');
    expect(toolForPath('/groups')).toBe('groups');
    expect(toolForPath('/groupsX')).toBeNull();
    expect(marketingFeatureOfPath('/marketing/lists/abc')).toBe('lists');
    expect(marketingFeatureOfPath('/marketing/templates')).toBe('messageTemplates');
    expect(marketingFeatureOfPath('/marketing/blocks')).toBe('contentBlocks');
    expect(marketingFeatureOfPath('/marketing')).toBeNull();
  });
  it('chỉ liệt kê chức năng đang bật; mỗi chức năng có đường dẫn khớp bộ khóa cờ', () => {
    const keys = (g?: Record<string, boolean>) => enabledMarketingFeatures(g as never).map(f => f.key);
    expect(keys().sort()).toEqual([...MARKETING_FEATURE_KEYS].sort());
    gate.value.broadcasts = false;
    gate.value.careSessions = false;
    expect(keys()).not.toContain('broadcasts');
    expect(keys()).not.toContain('careSessions');
    expect(keys()).toContain('groupScan');
    for (const f of enabledMarketingFeatures()) expect(marketingFeatureOfPath(f.to)).toBe(f.key);
  });
  it('ánh xạ dữ liệu thuần: tên khách, nhóm, tệp, dòng tệp, lần quét', () => {
    expect(mapFriendRow({ id: 'f1', relationshipKind: 'friend', contact: { crmName: 'Lan' }, leadScore: 7 }, false)).toMatchObject({ title: 'Lan', badge: { text: 'Đã kết bạn' } });
    expect(mapFriendRow({ id: 'f2', zaloUidInNick: '123456', zaloAccount: { displayName: 'Nick A' } }, true)).toMatchObject({ title: 'KH-3456', subtitle: 'Nick Nick A' });
    expect(mapGroupRow({ id: 'g', name: 'Nhóm A', totalMember: 12 })).toMatchObject({ title: 'Nhóm A', meta: ['12 thành viên'] });
    expect(mapListRow({ id: 'l1', name: 'Tệp 1', totalEntries: 5, hasZaloEntries: 3 }).to).toBe('/marketing/lists/l1');
    expect(mapListEntryRow({ id: 'e', phoneValid: false, phoneRaw: '0123' }).badge?.text).toBe('Không hợp lệ');
    expect(mapScanRow({ id: 's', groupNames: ['X', 'Y'], scannedGroups: 2, memberCount: 10, friendCount: 4, notFriendCount: 6 }).title).toBe('X, Y');
  });
});

describe('MobileToolPage: dữ liệu thật, chỉ đọc', () => {
  beforeEach(() => {
    installMemoryStorage();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    online.value = true;
    h2.path.value = '/marketing/group-scan';
  });
  const stubs = { VBottomSheet: StubBottomSheet };
  const mountPage = async (tool: 'marketing' | 'groups' | 'friends', grants: string[] = []) => {
    const store = useAuthStore();
    store.$patch({ user: { id: 'u1', role: 'member' } as never });
    vi.spyOn(store, 'canAccess').mockImplementation((r: string) => grants.includes(r));
    const w = mount(MobileToolPage, { props: { tool }, global: { stubs }, attachTo: document.body });
    await flushPromises();
    await flushPromises();
    return w;
  };
  const nicks = [{ id: 'n1', displayName: 'Nick Bán Hàng', status: 'connected' }, { id: 'n2', displayName: 'Nick Phụ', status: 'connected' }];
  const mutations = () => h2.post.mock.calls.length + h2.patch.mock.calls.length + h2.put.mock.calls.length + h2.del.mock.calls.length;

  it('Bạn bè: chọn nick -> tải friends-db, hiện tên khách + nick, phân trang, lọc loại; không có thao tác ghi', async () => {
    h2.get.mockImplementation(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      if (url === '/zalo-accounts') return { data: nicks };
      if (url === '/zalo-accounts/n1/friends-db') {
        const page = Number(cfg?.params?.page ?? 1);
        const friends = page === 1
          ? [{ id: 'f1', relationshipKind: 'friend', contact: { crmName: 'Khách Lan' } }, { id: 'f2', relationshipKind: 'pending_friend', contact: { fullName: 'Khách Mai' } }]
          : [{ id: 'f3', relationshipKind: 'ghost', contact: { crmName: 'Khách Cúc' } }];
        return { data: { friends, total: 3, counts: { friend: 1, pending_friend: 1, ghost: 1 } } };
      }
      return { data: {} };
    });
    const w = await mountPage('friends', ['friend']);
    expect(w.text()).toContain('Khách Lan');
    expect(w.text()).toContain('Đang chờ');
    expect(w.text()).toContain('Đã ngắt (1)');
    expect(w.find('table').exists()).toBe(false);
    await w.get('[data-action="load-more"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Khách Cúc');
    expect(w.find('[data-action="load-more"]').exists()).toBe(false);

    h2.get.mockClear();
    await w.get('[data-kind="ghost"]').trigger('click');
    await flushPromises();
    expect(h2.get.mock.calls.some(c => c[0] === '/zalo-accounts/n1/friends-db' && (c[1] as { params: { kind: string } }).params.kind === 'ghost')).toBe(true);
    expect(mutations()).toBe(0);
  });

  it('Bạn bè: lỗi 500 -> trạng thái lỗi có Thử lại; offline -> báo mất kết nối; không có quyền -> không lộ nội dung', async () => {
    h2.get.mockImplementation(async (url: string) => {
      if (url === '/zalo-accounts') return { data: nicks };
      throw { response: { status: 500 } };
    });
    const w = await mountPage('friends', ['friend']);
    expect(w.text()).toContain('Không tải được bạn bè');
    expect(w.find('.m-feedback__btn').exists()).toBe(true);

    online.value = false;
    h2.get.mockImplementation(async (url: string) => { if (url === '/zalo-accounts') return { data: nicks }; throw {}; });
    const off = await mountPage('friends', ['friend']);
    expect(off.text()).toContain('mất kết nối');

    const denied = await mountPage('friends', []);
    expect(denied.text()).toContain('không có quyền');
    expect(denied.find('select').exists()).toBe(false);
  });

  it('Bạn bè: danh sách rỗng -> trạng thái rỗng, không phải lỗi', async () => {
    h2.get.mockImplementation(async (url: string) => (url === '/zalo-accounts' ? { data: nicks } : { data: { friends: [], total: 0, counts: {} } }));
    const w = await mountPage('friends', ['friend']);
    expect(w.text()).toContain('Chưa có bạn bè');
  });

  it('Nhóm: danh sách nhóm của nick, tìm ở client, chạm nhóm -> thành viên (GET members)', async () => {
    h2.get.mockImplementation(async (url: string) => {
      if (url === '/zalo-accounts') return { data: nicks };
      if (url === '/zalo-accounts/n1/groups') return { data: { groups: [{ id: 'g1', name: 'Nhóm Bếp', totalMember: 20 }, { id: 'g2', name: 'Nhóm Xe', totalMember: 5 }] } };
      if (url === '/zalo-accounts/n1/groups/g1/members') return { data: { members: [{ id: 'm1', displayName: 'Chị Hoa', isOwner: true }, { id: 'm2', name: 'Anh Nam' }] } };
      return { data: {} };
    });
    const w = await mountPage('groups');
    expect(w.text()).toContain('Nhóm Bếp');
    expect(w.text()).toContain('20 thành viên');
    await w.get('input[type="search"]').setValue('xe');
    expect(w.text()).not.toContain('Nhóm Bếp');
    expect(w.text()).toContain('Nhóm Xe');
    await w.get('input[type="search"]').setValue('');
    await w.findAll('[data-row]')[0].trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Chị Hoa');
    expect(w.text()).toContain('Trưởng nhóm');
    expect(mutations()).toBe(0);
  });

  it('Marketing > Quét nhóm: lần quét đã xong + thành viên đã thu (phân trang)', async () => {
    h2.path.value = '/marketing/group-scan';
    h2.get.mockImplementation(async (url: string) => {
      if (url === '/zalo-accounts') return { data: nicks };
      if (url === '/target-jobs/group-scans/n1') return { data: { scans: [{ id: 's1', groupNames: ['Nhóm Bếp'], scannedGroups: 1, memberCount: 30, friendCount: 10, notFriendCount: 20, createdAt: '2026-05-01T00:00:00Z' }] } };
      if (url === '/zalo-accounts/n1/group-scans/s1/members') return { data: { members: [{ id: 'x1', displayName: 'Cô Thu', isFriend: false }], total: 1 } };
      return { data: {} };
    });
    const w = await mountPage('marketing');
    expect(w.text()).toContain('Nhóm Bếp');
    expect(w.text()).toContain('30 thành viên');
    await w.findAll('[data-row]')[0].trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Cô Thu');
    expect(w.text()).toContain('Chưa là bạn');
    expect(mutations()).toBe(0);
  });

  it('Marketing > Tệp khách hàng: danh sách có liên kết sang chi tiết; chi tiết hiện dòng + quay lại danh sách', async () => {
    h2.path.value = '/marketing/lists';
    h2.get.mockImplementation(async (url: string) => {
      if (url === '/customer-lists') return { data: { lists: [{ id: 'l1', name: 'Tệp tháng 5', totalEntries: 40, hasZaloEntries: 30, invalidEntries: 2 }], total: 1 } };
      if (url === '/customer-lists/l1') return { data: { name: 'Tệp tháng 5', totalEntries: 40, hasZaloEntries: 30 } };
      if (url === '/customer-lists/l1/entries') return { data: { entries: [{ id: 'e1', nameRaw: 'Cô Lệ', phoneLocal: '0900000001', phoneValid: true, hasZalo: true }], total: 1 } };
      return { data: {} };
    });
    const list = await mountPage('marketing');
    expect(list.text()).toContain('Tệp tháng 5');
    expect(list.findAll('.stub-link').some(a => a.attributes('href') === '/marketing/lists/l1')).toBe(true);

    h2.path.value = '/marketing/lists/l1';
    const detail = await mountPage('marketing');
    expect(detail.text()).toContain('Cô Lệ');
    expect(detail.text()).toContain('Có Zalo');
    expect(detail.get('[data-action="back-to-lists"]').attributes('href')).toBe('/marketing/lists');
    expect(mutations()).toBe(0);
  });

  it('Marketing: thanh chức năng chỉ có chức năng bật, đường dẫn đúng; chức năng tắt không có link', async () => {
    gate.value.broadcasts = false;
    h2.get.mockImplementation(async () => ({ data: [] }));
    const w = await mountPage('marketing');
    const links = w.findAll('[data-feature]').map(a => [a.attributes('data-feature'), a.attributes('href')]);
    expect(links).toContainEqual(['lists', '/marketing/lists']);
    expect(links).toContainEqual(['groupScan', '/marketing/group-scan']);
    expect(links.map(l => l[0])).not.toContain('broadcasts');
  });

  it.each([
    ['targets', '/target-jobs', { jobs: [{ id: 'j1', name: 'Mục tiêu Bếp', status: 'active', sentCount: 3, maxTotal: 50 }] }, 'Mục tiêu Bếp'],
    ['broadcasts', '/broadcast-jobs', { jobs: [{ id: 'b1', name: 'Khuyến mãi tháng 5', status: 'paused', scheduleType: 'daily' }] }, 'Khuyến mãi tháng 5'],
    ['sequences', '/automation/sequences', { sequences: [{ id: 's1', name: 'Luồng chào', stepCount: 3 }] }, 'Luồng chào'],
    ['content-blocks', '/content-blocks', { blocks: [{ id: 'k1', name: 'Khối giá', messageText: 'Giá gói bếp' }] }, 'Khối giá'],
    ['message-templates', '/automation/templates', { templates: [{ id: 't1', name: 'Chào mới', shortcut: 'chao', content: '<p>Xin chào</p>' }] }, 'Gõ /chao'],
    ['care-sessions', '/automation/care-sessions', { sessions: [{ id: 'c1', contactId: 'x', contactName: 'Anh Tư', sequenceName: 'Luồng chào', nickName: 'N', state: 'running' }] }, 'Anh Tư'],
  ])('Marketing > %s hiện dữ liệu thật từ %s', async (seg, url, payload, expected) => {
    h2.path.value = `/marketing/${seg}`;
    h2.get.mockImplementation(async (u: string) => (u === url ? { data: payload } : { data: {} }));
    const w = await mountPage('marketing');
    expect(w.text()).toContain(expected);
    expect(h2.get.mock.calls.some(c => c[0] === url)).toBe(true);
    expect(mutations()).toBe(0);
  });

  it('Marketing: chức năng tắt mà vẫn vào đường dẫn -> báo đã tắt, không gọi API dữ liệu', async () => {
    gate.value.targets = false;
    h2.path.value = '/marketing/targets';
    const w = await mountPage('marketing');
    expect(w.text()).toContain('đang tắt');
    expect(h2.get).not.toHaveBeenCalled();
  });

  it('lối tắt Hội thoại/Khách hàng theo quyền', async () => {
    h2.get.mockImplementation(async (url: string) => (url === '/zalo-accounts' ? { data: nicks } : { data: { friends: [], total: 0, counts: {} } }));
    const w = await mountPage('friends', ['friend', 'conversation']);
    expect(w.findAll('.m-tool__alt-link').map(a => a.text())).toEqual(['Mở Hội thoại']);
  });
});

describe('mobileToolRoute: desktop không đổi, mobile có trang riêng', () => {
  const Desktop = defineComponent({ setup: () => () => h('div', { class: 'desktop-view' }, 'desktop') });
  beforeEach(() => { installMemoryStorage(); setActivePinia(createPinia()); h2.get.mockResolvedValue({ data: [] }); });

  it('không phải mobile -> render nguyên view desktop', async () => {
    isMobile.value = false;
    const R = mobileToolRoute('friends', async () => ({ __esModule: true, default: Desktop }));
    const w = mount(R);
    await flushPromises();
    await flushPromises();
    expect(w.html()).toBe('<div class="desktop-view">desktop</div>');
  });
  it('mobile -> không mount view desktop', async () => {
    isMobile.value = true;
    const store = useAuthStore();
    store.$patch({ user: { id: 'u1', role: 'member' } as never });
    vi.spyOn(store, 'canAccess').mockReturnValue(true);
    const R = mobileToolRoute('groups', async () => ({ __esModule: true, default: Desktop }));
    const w = mount(R, { global: { stubs: { VBottomSheet: StubBottomSheet } } });
    await flushPromises();
    await flushPromises();
    expect(w.find('.desktop-view').exists()).toBe(false);
    expect(w.find('.m-tool').exists()).toBe(true);
  });
});
