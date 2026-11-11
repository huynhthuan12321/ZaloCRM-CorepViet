import { describe, expect, it, vi } from 'vitest';

// Hàm thuần: không cần auth/api thật. Mock để import module không kéo router + axios vào môi trường node.
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({}) }));
vi.mock('@/composables/use-mobile-waiting-count', () => ({ useMobileWaitingCount: () => ({ count: { value: null } }) }));

import { hasOwnMobileHeader, isMobileDetailRoute, isMobileRootRoute, mobileRouteTitle, resolveMobileTab } from './use-mobile-nav';

describe('resolveMobileTab', () => {
  it.each([
    [{ path: '/chat/abc' }, 'chat'],
    [{ name: 'Chat', path: '/chat' }, 'chat'],
    [{ path: '/contacts/1/profile' }, 'contacts'],
    [{ name: 'ContactProfile', path: '/contacts/1/profile' }, 'contacts'],
    [{ name: 'CustomerActivityLog', path: '/customers/1/activity' }, 'contacts'],
    [{ name: 'StuckLeads', path: '/stuck-leads' }, 'contacts'],
    [{ name: 'Friends', path: '/friends' }, 'account'],
    [{ name: 'Dashboard', path: '/' }, 'overview'],
    [{ path: '/' }, 'overview'],
    [{ name: 'Appointments', path: '/appointments' }, 'agenda'],
    [{ name: 'Account', path: '/account' }, 'account'],
    [{ path: '/reports/ai' }, 'account'],
    [{ name: 'Reports.Ai', path: '/reports/ai' }, 'account'],
    [{ name: 'Reports', path: '/reports-co-ban' }, 'account'],
    [{ path: '/settings/org/profile' }, 'account'],
    [{ name: 'Settings.OrgProfile', path: '/settings/org/profile' }, 'account'],
    [{ name: 'Media', path: '/media' }, 'account'],
    [{ name: 'Profile', path: '/profile' }, 'account'],
    [{ name: 'Marketing.Broadcasts', path: '/marketing/broadcasts' }, 'account'],
    [{ path: '/marketing/x' }, 'account'],
    [{ name: 'Groups', path: '/groups' }, 'account'],
    [{ name: 'Analytics', path: '/analytics' }, 'account'],
  ])('%j -> %s', (route, tab) => {
    expect(resolveMobileTab(route)).toBe(tab);
  });

  it('NotFound và route lạ không làm sáng tab nào', () => {
    expect(resolveMobileTab({ name: 'NotFound', path: '/khong-co' })).toBeNull();
    expect(resolveMobileTab({ name: 'NotFound', path: '/chat/abc' })).toBeNull();
    expect(resolveMobileTab({ path: '/khong-co-gi' })).toBeNull();
  });

  it('không nhầm prefix dài hơn (/chatbot không phải /chat)', () => {
    expect(resolveMobileTab({ path: '/chatbot' })).toBeNull();
  });
});

describe('route chrome helpers', () => {
  it('thread và hồ sơ khách là màn chi tiết (ẩn tabbar); inbox và tab gốc thì không', () => {
    expect(isMobileDetailRoute({ name: 'Chat', path: '/chat/abc', params: { convId: 'abc' } })).toBe(true);
    expect(isMobileDetailRoute({ name: 'Chat', path: '/chat', params: { convId: '' } })).toBe(false);
    expect(isMobileDetailRoute({ name: 'Chat', path: '/chat', params: {} })).toBe(false);
    expect(isMobileDetailRoute({ name: 'ContactProfile', path: '/contacts/1/profile' })).toBe(true);
    expect(isMobileDetailRoute({ name: 'CustomerActivityLog', path: '/customers/1/activity' })).toBe(true);
    expect(isMobileDetailRoute({ name: 'Contacts', path: '/contacts' })).toBe(false);
    expect(isMobileDetailRoute({ name: 'Account', path: '/account' })).toBe(false);
  });

  it('chỉ thread chat tự có header riêng', () => {
    expect(hasOwnMobileHeader({ name: 'Chat', path: '/chat/abc', params: { convId: 'abc' } })).toBe(true);
    expect(hasOwnMobileHeader({ name: 'Chat', path: '/chat', params: {} })).toBe(false);
    expect(hasOwnMobileHeader({ name: 'ContactProfile', path: '/contacts/1/profile' })).toBe(false);
  });

  it('root tab không có nút quay lại, màn con thì có', () => {
    expect(isMobileRootRoute({ name: 'Dashboard', path: '/' })).toBe(true);
    expect(isMobileRootRoute({ name: 'Chat', path: '/chat', params: {} })).toBe(true);
    expect(isMobileRootRoute({ name: 'Account', path: '/account' })).toBe(true);
    expect(isMobileRootRoute({ name: 'Media', path: '/media' })).toBe(false);
    expect(isMobileRootRoute({ name: 'Settings.OrgProfile', path: '/settings/org/profile' })).toBe(false);
    expect(isMobileRootRoute({ name: 'Reports.Overview', path: '/reports/tong-quan' })).toBe(false);
  });

  it('tiêu đề header', () => {
    expect(mobileRouteTitle({ name: 'Dashboard', path: '/' })).toBe('Tổng quan');
    expect(mobileRouteTitle({ name: 'Settings.OrgProfile', path: '/settings/org/profile' })).toBe('Cài đặt tổ chức');
    expect(mobileRouteTitle({ name: 'Settings.Backup', path: '/settings/dev/backup' })).toBe('Cài đặt');
    expect(mobileRouteTitle({ name: 'Reports.Ai', path: '/reports/ai' })).toBe('Báo cáo');
    expect(mobileRouteTitle({ path: '/khong-co' })).toBe('CRM');
  });
});
