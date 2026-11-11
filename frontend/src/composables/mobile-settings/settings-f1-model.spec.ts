// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('@/api/index', () => ({ api: {} }));
vi.mock('@/api', () => ({ api: {} }));
import { settingsPagePolicy } from './settings-page-registry';
import { flattenTree, grantRows, grantSummary } from './permission-model';
import { employeeStatusKey, filterEmployees, formatPhone, statusCounts } from './employee-model';
import { classifyLoadError, apiErrorMessage } from './load-state';
import { reorderPayload, applyReorder, isStatusFormDirty, emptyStatusForm, chipBackground } from './use-mobile-statuses';
import { filterTags, isTagFormDirty, emptyTagForm, type MobileTag } from './use-mobile-tags';
import { notificationTarget } from './use-mobile-notifications';
import { validateFullName } from './use-mobile-account-profile';
import type { RbacUser } from '@/stores/rbac';

describe('chính sách trang cấp 2', () => {
  it('trang F1 dựng riêng/đọc-chỉ, Nhân viên dùng lại controller gốc, Org là đảo theo Sáng/Tối, còn lại đảo Sáng', () => {
    expect(settingsPagePolicy('Settings.Profile')).toMatchObject({ kind: 'native', page: 'account' });
    expect(settingsPagePolicy('Settings.RbacUsers')).toEqual({ kind: 'shared' });
    expect(settingsPagePolicy('Settings.OrgProfile')).toEqual({ kind: 'island', followTheme: true });
    for (const [name, page] of [['Settings.RbacPermissionGroups', 'permissionGroups'], ['Settings.RbacDepartments', 'departments'], ['Settings.Scoring', 'scoring'], ['Settings.Integrations', 'integrations'], ['Settings.Audit', 'audit']] as const) {
      expect(settingsPagePolicy(name)).toMatchObject({ kind: 'native', page });
    }
    expect(settingsPagePolicy('Settings.Zalo')).toEqual({ kind: 'island', followTheme: false });
    expect(settingsPagePolicy(undefined)).toEqual({ kind: 'island', followTheme: false });
  });
  it('"Thông báo của tôi" = wizard gốc CHỈ khi route Settings.ZaloAccounts và query.tab = internal-contact; tab khác/không tab giữ đảo desktop', () => {
    expect(settingsPagePolicy('Settings.ZaloAccounts', { tab: 'internal-contact' })).toMatchObject({ kind: 'native', page: 'internalContact' });
    expect(settingsPagePolicy('Settings.ZaloAccounts', { tab: 'privacy' })).toEqual({ kind: 'island', followTheme: false });
    expect(settingsPagePolicy('Settings.ZaloAccounts', {})).toEqual({ kind: 'island', followTheme: false });
    expect(settingsPagePolicy('Settings.Other', { tab: 'internal-contact' })).toEqual({ kind: 'island', followTheme: false });
    expect(settingsPagePolicy('Settings.Notifications')).toMatchObject({ kind: 'native', page: 'notifications' });
  });
});

describe('nhóm quyền (đọc)', () => {
  const g = (id: string, grants: Record<string, Record<string, boolean>>, children: never[] = []) => ({ id, name: id, parentId: null, isSystem: false, displayOrder: 0, grants, memberCount: 1, children });
  const meta = { resources: ['contact', 'settings'], resourceActions: { contact: ['access', 'create', 'edit'], settings: ['access'] } };
  it('liệt kê hành động ĐƯỢC cấp theo từng chức năng và tổng số', () => {
    const rows = grantRows(g('x', { contact: { access: true, create: false, edit: true } }), meta);
    expect(rows).toEqual([{ resource: 'contact', label: 'Khách hàng', allowed: ['Truy cập', 'Sửa'], available: 3 }, { resource: 'settings', label: 'Cài đặt', allowed: [], available: 1 }]);
    expect(grantSummary(rows)).toEqual({ granted: 2, total: 4 });
    expect(grantRows(g('x', {}), null)).toEqual([]);
  });
  it('làm phẳng cây giữ độ sâu', () => {
    type N = { id: string; children: N[] };
    const tree: N[] = [{ id: 'a', children: [{ id: 'b', children: [] }] }];
    expect(flattenTree(tree).map(x => [x.node.id, x.depth])).toEqual([['a', 0], ['b', 1]]);
  });
});

const user = (o: Partial<RbacUser>): RbacUser => ({ id: 'u', fullName: 'A', isActive: true, passwordChangedAt: '2026-01-01', lastLoginAt: null, ...o } as RbacUser);
const NOW = Date.parse('2026-11-10T00:00:00Z');

describe('trạng thái nhân viên (đúng quy tắc 4 trạng thái desktop)', () => {
  it('vô hiệu > chưa kích hoạt > im lặng > hoạt động', () => {
    expect(employeeStatusKey(user({ isActive: false }), NOW)).toBe('disabled');
    expect(employeeStatusKey(user({ passwordChangedAt: null }), NOW)).toBe('pending');
    expect(employeeStatusKey(user({ lastLoginAt: null }), NOW)).toBe('silent');
    expect(employeeStatusKey(user({ lastLoginAt: '2026-11-08T00:00:00Z' }), NOW)).toBe('active');
    expect(employeeStatusKey(user({ lastLoginAt: '2026-11-01T00:00:00Z' }), NOW)).toBe('silent');
  });
  it('lọc nhiều trạng thái; tập rỗng = tất cả; đếm theo trạng thái', () => {
    const list = [user({ id: '1', lastLoginAt: '2026-11-09T00:00:00Z' }), user({ id: '2', isActive: false }), user({ id: '3', passwordChangedAt: null })];
    expect(filterEmployees(list, new Set(), NOW)).toHaveLength(3);
    expect(filterEmployees(list, new Set(['active']), NOW).map(u => u.id)).toEqual(['1']);
    expect(filterEmployees(list, new Set(['disabled', 'pending']), NOW).map(u => u.id)).toEqual(['2', '3']);
    expect(statusCounts(list, NOW)).toEqual({ active: 1, silent: 0, pending: 1, disabled: 1 });
  });
  it('định dạng SĐT 84… -> 0… ; không chắc thì giữ nguyên', () => {
    expect(formatPhone('84912345678')).toBe('0912 345 678');
    expect(formatPhone('+1 555')).toBe('+1 555');
    expect(formatPhone(null)).toBe('');
  });
});

describe('lỗi tải', () => {
  it('mất mạng -> offline; 403 -> forbidden; còn lại -> error', () => {
    expect(classifyLoadError(new Error('x'), false)).toBe('offline');
    expect(classifyLoadError({ response: { status: 403 } }, true)).toBe('forbidden');
    expect(classifyLoadError({ response: { status: 500 } }, true)).toBe('error');
  });
  it('lấy thông điệp server nếu có', () => {
    expect(apiErrorMessage({ response: { data: { error: 'Trùng tên' } } }, 'Lưu thất bại')).toBe('Trùng tên');
    expect(apiErrorMessage({}, 'Lưu thất bại')).toBe('Lưu thất bại');
  });
});

describe('trạng thái KH / nhãn KH / tài khoản / thông báo', () => {
  const s = (id: string, order: number) => ({ id, name: id, order, color: null, isTerminal: false, isDefault: false });
  it('đổi thứ tự hoán đổi order với hàng liền kề, không vượt biên', () => {
    const list = [s('a', 1), s('b', 2), s('c', 3)];
    expect(reorderPayload(list, 'b', -1)).toEqual({ items: [{ id: 'b', order: 1 }, { id: 'a', order: 2 }] });
    expect(reorderPayload(list, 'a', -1)).toBeNull();
    expect(reorderPayload(list, 'c', 1)).toBeNull();
  });
  it('hai hàng trùng order -> đánh số lại 1..n để lên/xuống luôn có tác dụng; áp cục bộ đúng thứ tự', () => {
    const list = [s('a', 1), s('b', 1), s('c', 2)];
    const payload = reorderPayload(list, 'b', -1)!;
    expect(payload.items).toEqual([{ id: 'b', order: 1 }, { id: 'a', order: 2 }, { id: 'c', order: 3 }]);
    expect(applyReorder(list, payload).map(x => x.id)).toEqual(['b', 'a', 'c']);
  });
  it('dirty form + màu chip', () => {
    const a = emptyStatusForm(2);
    expect(a.order).toBe(3);
    expect(isStatusFormDirty(a, { ...a })).toBe(false);
    expect(isStatusFormDirty(a, { ...a, name: 'x' })).toBe(true);
    expect(isTagFormDirty(emptyTagForm(), { ...emptyTagForm(), emoji: '🔥' })).toBe(true);
    expect(emptyTagForm('friend').source).toBe('manual_per_nick');
    expect(emptyTagForm('crm').source).toBe('manual_crm');
    expect(chipBackground('#112233')).toBe('rgba(17,34,51,0.18)');
    expect(chipBackground('oops')).toContain('rgba(');
  });
  it('lọc nhãn theo tab, ẩn nhãn lưu trữ, tìm theo tên, sắp theo ưu tiên', () => {
    const t = (o: Partial<MobileTag>): MobileTag => ({ id: 'x', name: 'n', slug: 'n', color: '#000', emoji: null, scope: 'crm', source: 'manual_crm', priority: 5, usageCount: 0, archivedAt: null, zaloAccount: null, ...o });
    const list = [t({ id: '1', name: 'VIP', priority: 2 }), t({ id: '2', name: 'Cũ', archivedAt: 'x' }), t({ id: '3', name: 'Bạn', scope: 'friend' }), t({ id: '4', name: 'Mới', priority: 1 })];
    expect(filterTags(list, 'crm', '').map(x => x.id)).toEqual(['4', '1']);
    expect(filterTags(list, 'crm', 'vi').map(x => x.id)).toEqual(['1']);
    expect(filterTags(list, 'friend', '').map(x => x.id)).toEqual(['3']);
    const withNick = [t({ id: 'n1', scope: 'friend', source: 'zalo_real', zaloAccountId: 'A' }), t({ id: 'n2', scope: 'friend', source: 'manual_per_nick', zaloAccountId: 'B' })];
    expect(filterTags(withNick, 'friend', '', 'zalo_real').map(x => x.id)).toEqual(['n1']);
    expect(filterTags(withNick, 'friend', '', null, 'B').map(x => x.id)).toEqual(['n2']);
  });
  it('họ tên 2–80 ký tự (sau trim)', () => {
    expect(validateFullName(' a ')).toContain('tối thiểu');
    expect(validateFullName('An')).toBe('');
    expect(validateFullName('x'.repeat(81))).toContain('tối đa');
  });
  it('đích thông báo giống chuông desktop', () => {
    expect(notificationTarget('unreplied')).toBe('/chat');
    expect(notificationTarget('apt-1')).toBe('/appointments');
    expect(notificationTarget('zalo-9')).toBe('/zalo-accounts');
    expect(notificationTarget('other')).toBeNull();
  });
});
