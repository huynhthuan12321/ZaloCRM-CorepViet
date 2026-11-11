// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Mô hình hiển thị Nhân viên trên mobile. Quy tắc 4 trạng thái SAO ĐÚNG như UsersRbacView (desktop) — nếu desktop đổi, đổi cả đây.
 * Dữ liệu lấy từ useRbacStore().users (server đã lọc theo phạm vi quyền); mobile không tự mở rộng phạm vi.
 */
import type { RbacUser } from '@/stores/rbac';

export type EmployeeStatusKey = 'active' | 'silent' | 'pending' | 'disabled';
export const SILENT_THRESHOLD_MS = 3 * 24 * 3600 * 1000;

export const EMPLOYEE_STATUS_CHIPS: ReadonlyArray<{ value: EmployeeStatusKey; label: string }> = [
  { value: 'active', label: 'Hoạt động' },
  { value: 'silent', label: 'Im lặng' },
  { value: 'pending', label: 'Chưa kích hoạt' },
  { value: 'disabled', label: 'Vô hiệu' },
];

export function employeeStatusKey(u: Pick<RbacUser, 'isActive' | 'passwordChangedAt' | 'lastLoginAt'>, now = Date.now()): EmployeeStatusKey {
  if (!u.isActive) return 'disabled';
  if (!u.passwordChangedAt) return 'pending';
  if (!u.lastLoginAt) return 'silent';
  return now - new Date(u.lastLoginAt).getTime() <= SILENT_THRESHOLD_MS ? 'active' : 'silent';
}

export function employeeStatusLabel(k: EmployeeStatusKey): string {
  return EMPLOYEE_STATUS_CHIPS.find(c => c.value === k)!.label;
}

export function roleLabel(role: string | null | undefined): string {
  if (role === 'owner') return 'Chủ sở hữu';
  if (role === 'admin') return 'Quản trị viên';
  return 'Nhân viên';
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let s = phone.replace(/\D/g, '');
  if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
  return s.length === 10 ? `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}` : phone;
}

export function filterEmployees(users: RbacUser[], statuses: ReadonlySet<EmployeeStatusKey>, now = Date.now()): RbacUser[] {
  if (statuses.size === 0) return users;
  return users.filter(u => statuses.has(employeeStatusKey(u, now)));
}

export function statusCounts(users: RbacUser[], now = Date.now()): Record<EmployeeStatusKey, number> {
  const out: Record<EmployeeStatusKey, number> = { active: 0, silent: 0, pending: 0, disabled: 0 };
  for (const u of users) out[employeeStatusKey(u, now)]++;
  return out;
}

export function internalContactText(u: RbacUser): string {
  if (u.internalContactMethod === 'crm_nick') return u.internalContactNick?.displayName ? `Nick CRM: ${u.internalContactNick.displayName}` : 'Nick CRM';
  if (u.internalContactMethod === 'personal_phone') return u.internalContactPhone ? `Zalo ngoài: ${formatPhone(u.internalContactPhone)}` : 'Zalo ngoài';
  return 'Chưa thiết lập';
}
