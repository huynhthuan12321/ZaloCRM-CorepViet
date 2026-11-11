// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { RouteLocationRaw } from 'vue-router';
import { isExtension } from '@ee/edition';
import { canViewReports } from '@/utils/report-access';
import { resolveToolEntries } from '@/components/mobile/tools/tools-model';

/** Menu màn Tài khoản (CONTRACT-A §2.2). Lọc theo quyền CHỈ để ẩn UI; router guard và server vẫn chặn. */
export interface AccountMenuItem {
  id: 'personal' | 'password' | 'notifications' | 'nick' | 'media' | 'reports' | 'org-settings' | 'marketing' | 'groups' | 'friends';
  group: 'personal' | 'work' | 'other';
  label: string;
  icon: string;
  to?: RouteLocationRaw; // không có = mở sheet/hộp thoại tại chỗ
  visible: boolean;
  unavailableNote?: string;
}

export interface AccountMenuListProps {
  items: AccountMenuItem[];
}
export type AccountMenuListEmits = { select: [id: AccountMenuItem['id']] };

export interface AccountMenuAuth {
  user: { role: string; deptRole?: string | null; grants?: Record<string, Record<string, boolean>> } | null;
  canAccess(resource: string, action?: string): boolean;
}

/**
 * Nhóm "Khác" (F3: Marketing, Nhóm, Bạn bè) lấy quyền/đường dẫn từ tools-model (sao đúng DesktopLayout/router, gồm bản mở rộng và cờ
 * Marketing). `extension` chỉ để test; mặc định đọc edition thật.
 */
export function buildAccountMenuItems(auth: AccountMenuAuth, extension: boolean = isExtension): AccountMenuItem[] {
  const signedIn = !!auth.user;
  const other: AccountMenuItem[] = resolveToolEntries(auth, extension).map(e => ({
    id: e.id, group: 'other', label: e.label, icon: e.icon, to: e.to, visible: e.visible,
  }));
  return [
    { id: 'personal', group: 'personal', label: 'Thông tin cá nhân', icon: 'mdi-account-outline', to: '/settings/personal/profile', visible: signedIn },
    { id: 'password', group: 'personal', label: 'Đổi mật khẩu', icon: 'mdi-lock-reset', visible: signedIn },
    { id: 'notifications', group: 'personal', label: 'Thông báo', icon: 'mdi-bell-outline', visible: signedIn },
    { id: 'nick', group: 'work', label: 'Nick Zalo', icon: 'mdi-cellphone-link', to: '/settings/channels/zalo', visible: signedIn && auth.canAccess('zalo_account') },
    { id: 'media', group: 'work', label: 'Kho media', icon: 'mdi-image-multiple-outline', to: '/media', visible: signedIn && auth.canAccess('media') },
    { id: 'reports', group: 'work', label: 'Báo cáo', icon: 'mdi-chart-box-outline', to: '/reports/tong-quan', visible: canViewReports(auth.user) },
    { id: 'org-settings', group: 'work', label: 'Cài đặt tổ chức', icon: 'mdi-cog-outline', to: '/settings/org/profile', visible: signedIn && auth.canAccess('settings') },
    ...other,
  ];
}
