// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Chính sách nhóm "Khác" của Tài khoản mobile (F3): Marketing / Nhóm / Bạn bè. Chỉ HIỆN khi có QUYỀN và TÍNH NĂNG đang bật.
 *  - Bạn bè   : route /friends có meta.resource='friend'; tab desktop `canAccess('friend')`.
 *  - Marketing: DefaultLayout. Bản mở rộng (isExtension): chức năng đầu tiên có quyền (lists -> group-scan, canAccess customer_list/friend)
 *               VÀ đường dẫn đó còn bật (isMarketingPathEnabled, cùng nguồn cờ với router guard). Bản Community: route chỉ requiresAuth
 *               (không có resource) nên quyền = đã đăng nhập; điểm vào = group-scan, nếu cờ tắt thì getMarketingFallbackPath() (cùng ưu tiên
 *               với guard); mọi chức năng đều tắt -> ẨN (desktop vẫn hiện tab nhưng bị guard đẩy về fallback, mobile không hứa đích không có).
 *  - Nhóm     : route /groups chỉ requiresAuth (không meta.resource): desktop không có tab riêng, mobile hiện cho mọi user đã đăng nhập.
 *               Không tự đặt resource mới. Dữ liệu do server lọc theo quyền nick.
 * Danh sách chỉ ẩn/hiện UI; router guard và server vẫn là chốt chặn thật.
 */
import {
  getMarketingFallbackPath, isMarketingPathEnabled, marketingFeatureGate, type MarketingFeatureKey,
} from '@/utils/marketingFeatureFlags';

export type MobileToolId = 'marketing' | 'groups' | 'friends';

export interface ToolAuthLike {
  user: unknown | null;
  canAccess(resource: string, action?: string): boolean;
}

/** Cùng thứ tự/ưu tiên MARKETING_FUNCTIONS của DefaultLayout. */
const EXTENSION_MARKETING_FUNCTIONS: ReadonlyArray<{ path: string; resource: string }> = [
  { path: '/marketing/lists', resource: 'customer_list' },
  { path: '/marketing/group-scan', resource: 'friend' },
];

export function marketingEntryPath(auth: ToolAuthLike, extension: boolean): string | null {
  if (!auth.user) return null;
  if (extension) {
    return EXTENSION_MARKETING_FUNCTIONS.find(f => auth.canAccess(f.resource) && isMarketingPathEnabled(f.path))?.path ?? null;
  }
  return ['/marketing/group-scan', getMarketingFallbackPath()].find(p => isMarketingPathEnabled(p)) ?? null;
}

export interface ToolMenuEntry {
  id: MobileToolId;
  label: string;
  icon: string;
  to: string;
  visible: boolean;
}

export function resolveToolEntries(auth: ToolAuthLike, extension: boolean): ToolMenuEntry[] {
  const signedIn = !!auth.user;
  const marketing = marketingEntryPath(auth, extension);
  return [
    { id: 'marketing', label: 'Marketing', icon: 'mdi-bullhorn-outline', to: marketing ?? '/marketing/group-scan', visible: marketing !== null },
    { id: 'groups', label: 'Nhóm', icon: 'mdi-account-group-outline', to: '/groups', visible: signedIn },
    { id: 'friends', label: 'Bạn bè', icon: 'mdi-account-multiple-outline', to: '/friends', visible: signedIn && auth.canAccess('friend') },
  ];
}

/** Trang đích (route) -> công cụ mobile. */
export function toolForPath(path: string): MobileToolId | null {
  if (path === '/marketing' || path.startsWith('/marketing/')) return 'marketing';
  if (path === '/groups' || path.startsWith('/groups/')) return 'groups';
  if (path === '/friends' || path.startsWith('/friends/')) return 'friends';
  return null;
}

export interface ToolFeature {
  key: MarketingFeatureKey;
  to: string;
  label: string;
  hint: string;
  icon: string;
}

/** Chức năng Marketing Community (cùng danh sách và cờ với CommunityMarketingShell). */
const MARKETING_FEATURES: readonly ToolFeature[] = [
  { key: 'groupScan', to: '/marketing/group-scan', label: 'Quét nhóm', hint: 'Quét thành viên nhóm Zalo để lấy danh sách khách tiềm năng.', icon: 'mdi-account-group-outline' },
  { key: 'lists', to: '/marketing/lists', label: 'Tệp khách hàng', hint: 'Gom khách thành tệp để chăm sóc hoặc gửi hàng loạt.', icon: 'mdi-format-list-bulleted' },
  { key: 'targets', to: '/marketing/targets', label: 'Mục tiêu', hint: 'Danh sách số điện thoại cần tự động kết bạn.', icon: 'mdi-account-multiple-plus-outline' },
  { key: 'careSessions', to: '/marketing/care-sessions', label: 'Phiên chăm sóc', hint: 'Theo dõi các phiên bám đuổi đang chạy.', icon: 'mdi-account-heart-outline' },
  { key: 'sequences', to: '/marketing/sequences', label: 'Luồng kịch bản', hint: 'Kịch bản bám đuổi nhiều bước.', icon: 'mdi-target-variant' },
  { key: 'manualFollowup', to: '/marketing/manual-followup', label: 'Bám đuổi thủ công', hint: 'Xếp khách vào luồng bám đuổi bằng tay.', icon: 'mdi-account-clock-outline' },
  { key: 'broadcasts', to: '/marketing/broadcasts', label: 'Gửi tin hàng loạt', hint: 'Gửi cùng một nội dung cho nhiều khách.', icon: 'mdi-bullhorn-variant-outline' },
  { key: 'contentBlocks', to: '/marketing/content-blocks', label: 'Khối nội dung', hint: 'Soạn khối nội dung dùng lại trong tin nhắn.', icon: 'mdi-view-grid-plus-outline' },
  { key: 'messageTemplates', to: '/marketing/message-templates', label: 'Mẫu tin nhắn', hint: 'Mẫu gõ "/" nhanh trong hội thoại.', icon: 'mdi-message-flash-outline' },
];

export function enabledMarketingFeatures(gate: Record<MarketingFeatureKey, boolean> = marketingFeatureGate): ToolFeature[] {
  return MARKETING_FEATURES.filter(f => gate[f.key]);
}

/** Chức năng Marketing của đường dẫn hiện tại (kể cả /lists/:id, alias /templates, /blocks). */
export function marketingFeatureOfPath(path: string): MarketingFeatureKey | null {
  const clean = path.split('?')[0];
  const alias = clean.replace(/^\/marketing\/templates(?=\/|$)/, '/marketing/message-templates').replace(/^\/marketing\/blocks(?=\/|$)/, '/marketing/content-blocks');
  return MARKETING_FEATURES.find(f => alias === f.to || alias.startsWith(`${f.to}/`))?.key ?? null;
}

export interface ToolCopy {
  title: string;
  summary: string;
  icon: string;
  desktopAction: string;
}

export const TOOL_COPY: Record<MobileToolId, ToolCopy> = {
  marketing: {
    title: 'Marketing',
    summary: 'Xem dữ liệu Marketing (chỉ đọc): tệp khách hàng, kết quả quét nhóm, mục tiêu, kịch bản, chiến dịch gửi tin.',
    icon: 'mdi-bullhorn-outline',
    desktopAction: 'tạo hoặc sửa, quét nhóm, nhập tệp khách hàng, gắn kịch bản và gửi tin hàng loạt',
  },
  groups: {
    title: 'Nhóm Zalo',
    summary: 'Xem nhóm Zalo của từng nick và danh sách thành viên (chỉ đọc).',
    icon: 'mdi-account-group-outline',
    desktopAction: 'tạo nhóm, đổi tên, thêm hoặc xóa thành viên, lấy liên kết mời',
  },
  friends: {
    title: 'Bạn bè',
    summary: 'Xem bạn bè theo từng nick Zalo và tình trạng kết bạn (chỉ đọc). Để chăm từng khách, dùng mục Khách hàng hoặc Hội thoại.',
    icon: 'mdi-account-multiple-outline',
    desktopAction: 'đồng bộ danh sách, gửi và duyệt lời mời kết bạn, đổi tên gợi nhớ hoặc chặn',
  },
};
