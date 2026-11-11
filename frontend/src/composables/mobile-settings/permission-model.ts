// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Mô hình ĐỌC nhóm quyền cho mobile. Nhãn chức năng/hành động SAO từ PermissionGroupEditPanel (desktop) — đổi bên đó thì đổi cả đây.
 * Chỉ đọc store.permissionGroups (GET /permission-groups + /meta); không có hàm ghi nào.
 */
import type { DepartmentNode, PermissionGroupNode } from '@/stores/rbac';

export const ACTION_LABELS: Record<string, string> = { access: 'Truy cập', create: 'Thêm', edit: 'Sửa', delete: 'Xóa', view_all: 'Xem tất cả' };
export const RESOURCE_LABELS: Record<string, string> = {
  department: 'Quản lý phòng ban', user: 'Quản lý người dùng', permission_group: 'Quản lý quyền', conversation: 'Hội thoại', contact: 'Khách hàng',
  friend: 'Friends Zalo', customer_list: 'Tệp khách hàng', broadcast: 'Chiến dịch', sequence: 'Sequence', trigger: 'Trigger', block: 'Message Block',
  zalo_account: 'Nick Zalo', webhook: 'Webhook', engagement_score: 'Engagement / Score', audit_log: 'Audit Log', settings: 'Cài đặt',
  care_session: 'Phiên chăm sóc', media: 'Kho phương tiện',
};
export const actionLabel = (a: string): string => ACTION_LABELS[a] ?? a;
export const resourceLabel = (r: string): string => RESOURCE_LABELS[r] ?? r;

export interface FlatNode<T> { node: T; depth: number }
export function flattenTree<T extends { children: T[] }>(nodes: T[], depth = 0): Array<FlatNode<T>> {
  const out: Array<FlatNode<T>> = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

export interface GrantRow { resource: string; label: string; allowed: string[]; available: number }
/** Mỗi chức năng: các hành động ĐƯỢC cấp (nhãn tiếng Việt) và tổng số hành động áp dụng cho chức năng đó. */
export function grantRows(group: PermissionGroupNode, meta: { resources: string[]; resourceActions: Record<string, string[]> } | null): GrantRow[] {
  if (!meta) return [];
  return meta.resources.map((r) => {
    const avail = meta.resourceActions[r] ?? [];
    return { resource: r, label: resourceLabel(r), allowed: avail.filter((a) => !!group.grants?.[r]?.[a]).map(actionLabel), available: avail.length };
  });
}
export function grantSummary(rows: GrantRow[]): { granted: number; total: number } {
  return rows.reduce((acc, r) => ({ granted: acc.granted + r.allowed.length, total: acc.total + r.available }), { granted: 0, total: 0 });
}
export function departmentLine(d: DepartmentNode): string {
  return `${d.memberCount} thành viên`;
}
