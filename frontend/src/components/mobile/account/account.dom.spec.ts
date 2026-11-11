// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AccountMenuList from './AccountMenuList.vue';
import ThemeModePicker from './ThemeModePicker.vue';
import { buildAccountMenuItems, type AccountMenuAuth } from './account-menu';

function auth(user: AccountMenuAuth['user'], granted: string[]): AccountMenuAuth {
  return { user, canAccess: (resource: string) => granted.includes(resource) };
}
const visibleIds = (a: AccountMenuAuth) => buildAccountMenuItems(a).filter(i => i.visible).map(i => i.id);

describe('buildAccountMenuItems (lọc RBAC)', () => {
  it('chưa đăng nhập -> không mục nào hiện', () => {
    expect(visibleIds(auth(null, ['settings', 'media', 'zalo_account']))).toEqual([]);
  });

  it('nhân viên thường: nhóm Cá nhân + nhóm Khác theo desktop Community (Marketing, Nhóm; chưa có quyền friend nên không có Bạn bè)', () => {
    expect(visibleIds(auth({ role: 'member' }, []))).toEqual(['personal', 'password', 'notifications', 'marketing', 'groups']);
  });

  it('thiếu settings -> không có Cài đặt tổ chức; có media/zalo_account thì hiện', () => {
    const ids = visibleIds(auth({ role: 'member' }, ['media', 'zalo_account']));
    expect(ids).toContain('nick');
    expect(ids).toContain('media');
    expect(ids).not.toContain('org-settings');
    expect(ids).not.toContain('reports');
  });

  it('Báo cáo theo canViewReports: trưởng/phó phòng + grant engagement_score, quản trị', () => {
    const leader = { role: 'member', deptRole: 'leader', grants: { engagement_score: { access: true } } };
    expect(visibleIds(auth(leader, []))).toContain('reports');
    expect(visibleIds(auth({ ...leader, deptRole: 'member' }, []))).not.toContain('reports');
    expect(visibleIds(auth({ role: 'member', deptRole: 'leader' }, []))).not.toContain('reports');
    expect(visibleIds(auth({ role: 'admin' }, ['settings', 'media', 'zalo_account']))).toEqual([
      'personal', 'password', 'notifications', 'nick', 'media', 'reports', 'org-settings', 'marketing', 'groups',
    ]);
  });

  it('nhãn là "Nick Zalo" (không còn TikTok); đích điều hướng đúng bảng §2.2', () => {
    const items = buildAccountMenuItems(auth({ role: 'admin' }, ['settings', 'media', 'zalo_account']));
    const nick = items.find(i => i.id === 'nick')!;
    expect(nick.label).toBe('Nick Zalo');
    expect(items.some(i => /tiktok/i.test(i.label))).toBe(false);
    expect(Object.fromEntries(items.map(i => [i.id, i.to ?? null]))).toEqual({
      personal: '/settings/personal/profile',
      password: null,
      notifications: null,
      nick: '/settings/channels/zalo',
      media: '/media',
      reports: '/reports/tong-quan',
      'org-settings': '/settings/org/profile',
      marketing: '/marketing/group-scan',
      groups: '/groups',
      friends: '/friends',
    });
  });
});

describe('AccountMenuList', () => {
  it('chỉ render mục visible, ẩn cả tiêu đề nhóm khi nhóm rỗng', () => {
    const w = mount(AccountMenuList, { props: { items: buildAccountMenuItems(auth({ role: 'member' }, [])) } });
    expect(w.findAll('.m-menu__row').map(r => r.text())).toEqual(['Thông tin cá nhân', 'Đổi mật khẩu', 'Thông báo', 'Marketing', 'Nhóm']);
    expect(w.text()).toContain('Cá nhân');
    expect(w.text()).toContain('Khác');
    expect(w.text()).not.toContain('Công việc');
  });

  it('hạ quyền lúc đang mở: mục biến mất sau khi items đổi', async () => {
    const admin = auth({ role: 'admin' }, ['settings', 'media', 'zalo_account']);
    const w = mount(AccountMenuList, { props: { items: buildAccountMenuItems(admin) } });
    expect(w.text()).toContain('Cài đặt tổ chức');
    await w.setProps({ items: buildAccountMenuItems(auth({ role: 'member' }, ['media'])) });
    expect(w.text()).not.toContain('Cài đặt tổ chức');
    expect(w.text()).not.toContain('Báo cáo');
    expect(w.text()).toContain('Kho media');
  });

  it('chọn một hàng phát select(id)', async () => {
    const w = mount(AccountMenuList, { props: { items: buildAccountMenuItems(auth({ role: 'member' }, [])) } });
    await w.get('[data-menu-id="password"]').trigger('click');
    expect(w.emitted('select')).toEqual([['password']]);
  });
});

describe('ThemeModePicker', () => {
  it('3 lựa chọn Sáng / Tối / Theo máy trong một nhóm radio có tên', () => {
    const w = mount(ThemeModePicker, { props: { modelValue: 'light' } });
    expect(w.get('legend').text()).toBe('Giao diện');
    expect(w.findAll('input[type="radio"]')).toHaveLength(3);
    expect(w.findAll('.m-theme__label').map(l => l.text())).toEqual(['Sáng', 'Tối', 'Theo máy']);
  });

  it('phản ánh lựa chọn hiện tại (checked + dấu tích, không chỉ màu)', () => {
    const w = mount(ThemeModePicker, { props: { modelValue: 'dark' } });
    const checked = w.findAll('input:checked');
    expect(checked).toHaveLength(1);
    expect((checked[0].element as HTMLInputElement).value).toBe('dark');
    expect(w.findAll('.mdi-check')).toHaveLength(1);
  });

  it('đổi lựa chọn phát update:modelValue', async () => {
    const w = mount(ThemeModePicker, { props: { modelValue: 'light' } });
    await w.findAll('input[type="radio"]')[2].setValue(true);
    expect(w.emitted('update:modelValue')).toEqual([['system']]);
  });
});

describe('Nhóm "Khác" (F3): quyền và cờ sao đúng desktop', () => {
  const ids = (a: AccountMenuAuth, ext: boolean) => buildAccountMenuItems(a, ext).filter(i => i.group === 'other' && i.visible).map(i => i.id);

  it('Bạn bè cần quyền friend (như tab desktop + meta.resource của route)', () => {
    expect(ids(auth({ role: 'member' }, []), false)).not.toContain('friends');
    expect(ids(auth({ role: 'member' }, ['friend']), false)).toEqual(['marketing', 'groups', 'friends']);
  });

  it('bản mở rộng: Marketing chỉ hiện khi có customer_list hoặc friend, trỏ chức năng đầu tiên có quyền', () => {
    const find = (a: AccountMenuAuth) => buildAccountMenuItems(a, true).find(i => i.id === 'marketing')!;
    expect(find(auth({ role: 'member' }, [])).visible).toBe(false);
    expect(find(auth({ role: 'member' }, ['friend']))).toMatchObject({ visible: true, to: '/marketing/group-scan' });
    expect(find(auth({ role: 'member' }, ['friend', 'customer_list']))).toMatchObject({ visible: true, to: '/marketing/lists' });
  });

  it('chưa đăng nhập -> cả nhóm Khác ẩn (kể cả Nhóm và Marketing Community)', () => {
    expect(ids(auth(null, ['friend', 'customer_list']), false)).toEqual([]);
    expect(ids(auth(null, ['friend', 'customer_list']), true)).toEqual([]);
  });
});
