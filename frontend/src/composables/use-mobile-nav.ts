// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, type ComputedRef } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useMobileWaitingCount } from '@/composables/use-mobile-waiting-count';
import type { MobileTabItem, MobileTabKey } from '@/components/mobile/shell/types';

/** Điều hướng mobile (CONTRACT-A §4.3). resolveMobileTab là hàm thuần để test không cần router. */
interface RouteLike {
  name?: string | symbol | null;
  path: string;
  params?: Record<string, unknown>;
}

const TAB_BY_NAME: Record<string, MobileTabKey> = {
  Dashboard: 'overview',
  Contacts: 'contacts',
  ContactProfile: 'contacts',
  CustomerActivityLog: 'contacts',
  StuckLeads: 'contacts',
  Friends: 'account',
  Chat: 'chat',
  Appointments: 'agenda',
  Account: 'account',
  Media: 'account',
  Profile: 'account',
  Reports: 'account',
  Groups: 'account',
  Analytics: 'account',
};

const ACCOUNT_NAME_PREFIXES = ['Settings', 'Reports.', 'Marketing.'];

// Route không có name (hoặc name lạ) -> khớp theo path.
const TAB_BY_PATH_PREFIX: Array<[string, MobileTabKey]> = [
  ['/chat', 'chat'],
  ['/contacts', 'contacts'],
  ['/customers', 'contacts'],
  ['/friends', 'account'],
  ['/appointments', 'agenda'],
  ['/account', 'account'],
  ['/settings', 'account'],
  ['/media', 'account'],
  ['/profile', 'account'],
  ['/reports', 'account'],
  ['/marketing', 'account'],
  ['/groups', 'account'],
  ['/analytics', 'account'],
];

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}-`);
}

export function resolveMobileTab(route: RouteLike): MobileTabKey | null {
  const name = typeof route.name === 'string' ? route.name : '';
  if (name === 'NotFound') return null;
  if (name && TAB_BY_NAME[name]) return TAB_BY_NAME[name];
  if (name && ACCOUNT_NAME_PREFIXES.some(p => name === p || name.startsWith(p))) return 'account';
  if (route.path === '/') return 'overview';
  for (const [prefix, tab] of TAB_BY_PATH_PREFIX) {
    if (underPrefix(route.path, prefix)) return tab;
  }
  return null;
}

function hasConvId(route: RouteLike): boolean {
  return typeof route.params?.convId === 'string' && route.params.convId !== '';
}

/** /chat/:convId, hồ sơ khách, nhật ký KH: màn chi tiết -> ẩn tabbar (§4.1). */
export function isMobileDetailRoute(route: RouteLike): boolean {
  const name = typeof route.name === 'string' ? route.name : '';
  if (name === 'Chat') return hasConvId(route);
  if (name === 'ContactProfile' || name === 'CustomerActivityLog') return true;
  return /^\/chat\/[^/]+/.test(route.path) || /^\/contacts\/[^/]+\/profile/.test(route.path) || /^\/customers\/[^/]+\/activity/.test(route.path);
}

/** Màn có header riêng hoàn toàn (thread chat): shell không dựng header thứ hai. */
export function hasOwnMobileHeader(route: RouteLike): boolean {
  const name = typeof route.name === 'string' ? route.name : '';
  if (name === 'Chat') return hasConvId(route);
  return /^\/chat\/[^/]+/.test(route.path);
}

const ROOT_TITLES: Record<MobileTabKey, string> = {
  overview: 'Tổng quan',
  contacts: 'Khách hàng',
  chat: 'Hội thoại',
  agenda: 'Lịch hẹn',
  account: 'Tài khoản',
};

const TITLE_BY_NAME: Record<string, string> = {
  Dashboard: 'Tổng quan',
  Chat: 'Hội thoại',
  Contacts: 'Khách hàng',
  ContactProfile: 'Hồ sơ khách hàng',
  CustomerActivityLog: 'Nhật ký hoạt động',
  StuckLeads: 'Khách bị kẹt',
  Friends: 'Bạn bè',
  Appointments: 'Lịch hẹn',
  Account: 'Tài khoản',
  Media: 'Kho media',
  Profile: 'Nick Zalo',
  Reports: 'Báo cáo',
  Analytics: 'Phân tích',
  Groups: 'Nhóm Zalo',
  Settings: 'Cài đặt',
  'Settings.Profile': 'Thông tin cá nhân',
  'Settings.Notifications': 'Thông báo',
  'Settings.OrgProfile': 'Cài đặt tổ chức',
  'Settings.ZaloAccounts': 'Nick Zalo',
};

export function mobileRouteTitle(route: RouteLike): string {
  if (route.path === '/marketing' || route.path.startsWith('/marketing/')) return 'Marketing';
  const name = typeof route.name === 'string' ? route.name : '';
  if (name && TITLE_BY_NAME[name]) return TITLE_BY_NAME[name];
  if (name.startsWith('Reports.')) return 'Báo cáo';
  if (name.startsWith('Settings')) return 'Cài đặt';
  if (name.startsWith('Marketing')) return 'Marketing';
  const tab = resolveMobileTab(route);
  return tab ? ROOT_TITLES[tab] : 'CRM';
}

/** Root tab = không cần nút quay lại. */
export function isMobileRootRoute(route: RouteLike): boolean {
  const name = typeof route.name === 'string' ? route.name : '';
  if (['Dashboard', 'Contacts', 'Appointments', 'Account'].includes(name)) return true;
  if (name === 'Chat') return !hasConvId(route);
  return route.path === '/' || route.path === '/chat' || route.path === '/contacts' || route.path === '/appointments' || route.path === '/account';
}

/**
 * 5 mục tabbar cố định (không còn tab Báo cáo — chuyển vào Tài khoản). Ẩn theo quyền chỉ ở UI;
 * server và router guard vẫn chặn. Badge: null khi lỗi/0 (không hiện).
 */
export function useMobileNavItems(): ComputedRef<MobileTabItem[]> {
  const auth = useAuthStore();
  const waiting = useMobileWaitingCount();

  return computed<MobileTabItem[]>(() => {
    const items: MobileTabItem[] = [{ key: 'overview', label: 'Tổng quan', icon: 'mdi-view-dashboard-outline', to: '/' }];
    if (auth.canAccess('contact')) items.push({ key: 'contacts', label: 'Khách hàng', icon: 'mdi-account-group-outline', to: '/contacts' });
    if (auth.canAccess('conversation')) {
      const n = waiting.count.value;
      const shown = typeof n === 'number' && n > 0 ? n : null;
      items.push({
        key: 'chat',
        label: 'Hội thoại',
        icon: 'mdi-message-text',
        to: '/chat',
        prominent: true,
        badge: shown,
        badgeLabel: shown ? `${shown} khách đang chờ trả lời` : undefined,
      });
    }
    items.push({ key: 'agenda', label: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', to: '/appointments' });
    items.push({ key: 'account', label: 'Tài khoản', icon: 'mdi-account-circle-outline', to: '/account' });
    return items;
  });
}
