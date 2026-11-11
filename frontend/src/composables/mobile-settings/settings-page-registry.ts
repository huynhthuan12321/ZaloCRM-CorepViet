// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Chính sách hiển thị từng trang Cài đặt cấp 2 trên mobile (F1). Hàm thuần, tra theo TÊN ROUTE (+ query.tab cho Zalo). Router/menu desktop không đổi.
 *  - native : trang mobile dựng riêng (thẻ + sheet, theo token --m-* nên có Sáng/Tối). Trang desktop KHÔNG được mount.
 *  - shared : component desktop DÙNG LẠI (controller/handler/RBAC gốc) nhưng có nhánh mobile riêng; hiển thị trong khung token (Sáng/Tối), không "đảo sáng".
 *  - island : component desktop giữ nguyên, bọc VThemeProvider. `followTheme` = chạy theo Sáng/Tối (chỉ dùng cho trang thuần Vuetify đã kiểm).
 * Mọi trang NGOÀI danh sách này = island Sáng (như F0) — KHÔNG tuyên bố đã tối ưu mobile/dark.
 */
export type NativePageKey =
  | 'account' | 'notifications' | 'internalContact' | 'statuses' | 'tags'
  | 'permissionGroups' | 'departments' | 'scoring' | 'integrations' | 'audit';
export type SettingsPagePolicy =
  | { kind: 'native'; page: NativePageKey; title: string }
  | { kind: 'shared' }
  | { kind: 'island'; followTheme: boolean };

const POLICY: Record<string, SettingsPagePolicy> = {
  'Settings.Profile': { kind: 'native', page: 'account', title: 'Tài khoản của tôi' },
  'Settings.Notifications': { kind: 'native', page: 'notifications', title: 'Thông báo cần xử lý' },
  'Settings.Statuses': { kind: 'native', page: 'statuses', title: 'Trạng thái KH' },
  'Settings.TagsV2': { kind: 'native', page: 'tags', title: 'Nhãn KH' },
  'Settings.RbacPermissionGroups': { kind: 'native', page: 'permissionGroups', title: 'Nhóm quyền' },
  'Settings.RbacDepartments': { kind: 'native', page: 'departments', title: 'Phòng ban' },
  'Settings.Scoring': { kind: 'native', page: 'scoring', title: 'Chấm điểm tương tác' },
  'Settings.Integrations': { kind: 'native', page: 'integrations', title: 'Tích hợp' },
  'Settings.Audit': { kind: 'native', page: 'audit', title: 'Nhật ký quản trị' },
  'Settings.RbacUsers': { kind: 'shared' },
  'Settings.OrgProfile': { kind: 'island', followTheme: true },
};

/** Mục menu "Thông báo của tôi" = tab Zalo nội bộ của trang Tài khoản Zalo. Trên mobile chỉ đọc cấu hình hiện có, giữ khóa wizard thủ công của base; không mount cả trang Zalo desktop. */
export const INTERNAL_CONTACT_POLICY: SettingsPagePolicy = { kind: 'native', page: 'internalContact', title: 'Thông báo của tôi' };

const DEFAULT_POLICY: SettingsPagePolicy = { kind: 'island', followTheme: false };

export function settingsPagePolicy(routeName: unknown, query?: Record<string, unknown> | null): SettingsPagePolicy {
  if (routeName === 'Settings.ZaloAccounts' && query?.tab === 'internal-contact') return INTERNAL_CONTACT_POLICY;
  return (typeof routeName === 'string' && POLICY[routeName]) || DEFAULT_POLICY;
}
