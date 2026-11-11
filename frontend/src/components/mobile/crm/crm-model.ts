// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/** Hàm thuần cho màn CRM mobile (không Vue, không API) để test không cần mount. */
import { STATUS_OPTIONS, SOURCE_OPTIONS, type Contact, type ContactFilters } from '@/composables/use-contacts';
import type { PrivacySplit } from '@/composables/use-dashboard-action-hub';
import { getOrgParts } from '@/composables/use-org-timezone';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

/** TikTok đã bỏ khỏi sản phẩm (D-1): không đưa vào bộ lọc nguồn trên mobile. */
export const MOBILE_SOURCE_OPTIONS = SOURCE_OPTIONS.filter(o => o.value !== 'TT');

export function contactName(c: Pick<Contact, 'crmName' | 'fullName'>): string {
  return c.crmName?.trim() || c.fullName?.trim() || 'Khách chưa đặt tên';
}

export function contactStatusLabel(c: Contact): string {
  if (c.displayStatus?.name) return c.displayStatus.name;
  if (c.statusRef?.name) return c.statusRef.name;
  if (c.status) return STATUS_OPTIONS.find(o => o.value === c.status)?.text ?? c.status;
  return '';
}

export function contactStatusTone(c: Contact): Tone {
  if (c.displayStatus?.isTerminal || c.statusRef?.isTerminal) return 'success';
  switch (c.status) {
    case 'contacted': return 'info';
    case 'interested': return 'warning';
    case 'converted': return 'success';
    case 'lost': return 'danger';
    default: return 'neutral';
  }
}

/** Người phụ trách chính + số người cùng chăm (D-4), loại trừ người chính khỏi "+N". */
export function contactOwner(c: Contact): { name: string | null; extra: number } {
  const mainId = c.assignedUserId ?? c.assignedUser?.id ?? null;
  const name = c.assignedUser?.fullName?.trim() || null;
  const extra = (c.contactAccess ?? []).filter(a => a.role === 'collaborator' && a.user?.id && a.user.id !== mainId).length;
  return { name, extra };
}

/** Tổng nick Zalo đang gắn với khách (từ aggregate server trả về, không suy đoán tên). */
export function contactNickCount(c: Contact): number {
  const m = c.nicksByKind;
  if (!m) return 0;
  return Object.values(m).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}

/** Server đánh dấu `redacted` khi nick riêng tư mà người xem chưa được xem nội dung -> ẩn trích đoạn tin. */
export function contactRedacted(c: Contact): boolean {
  return (c as Contact & { redacted?: boolean }).redacted === true;
}

/** Số bộ lọc đang bật trong sheet (hai pha): trạng thái + nguồn + người phụ trách. Tìm kiếm tính riêng. */
export function countActiveFilters(f: Pick<ContactFilters, 'status' | 'source' | 'assignedUserId'>): number {
  return [f.status, f.source, f.assignedUserId].filter(v => !!v).length;
}

/** "Hoãn" (PARITY §6): mọi bộ lọc nâng cao khác không có trong sheet mobile nên luôn về mặc định khi reset. */
export function emptyFilterPatch(): Pick<ContactFilters, 'status' | 'source' | 'assignedUserId'> {
  return { status: '', source: '', assignedUserId: '' };
}

/**
 * Quyền thao tác khách: admin/owner luôn được; có grant `contact.<action>` thì theo grant; grant không định nghĩa action đó
 * -> giữ hành vi cũ (hiện), vì desktop không ẩn nút theo action này. Server vẫn là nơi enforce.
 */
export function resolveContactAction(
  user: { role?: string; grants?: Record<string, Record<string, boolean>> } | null,
  action: 'create' | 'update' | 'delete',
): boolean {
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  const g = user.grants?.contact;
  if (g && Object.prototype.hasOwnProperty.call(g, action)) return g[action] === true;
  return true;
}

export function resolveCanCreateContact(user: Parameters<typeof resolveContactAction>[0]): boolean {
  return resolveContactAction(user, 'create');
}

export function initialsOf(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstNameOf(full: string | null | undefined): string {
  if (!full) return 'bạn';
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || 'bạn';
}

/** Số nhìn thấy được = công khai; private tách riêng, KHÔNG cộng gộp (PrivacySplit). */
export function splitParts(s: PrivacySplit | null | undefined): { pub: number; priv: number } | null {
  if (!s) return null;
  return { pub: Number.isFinite(s.public) ? s.public : 0, priv: Number.isFinite(s.private) ? s.private : 0 };
}

export function splitAriaLabel(label: string, s: PrivacySplit | null | undefined): string {
  const p = splitParts(s);
  if (!p) return `${label}: chưa có số liệu`;
  return p.priv > 0 ? `${label}: ${p.pub} công khai, ${p.priv} nick riêng tư` : `${label}: ${p.pub}`;
}

/** Chào theo giờ (giờ máy: lời chào, không phải dữ liệu nghiệp vụ). */
export function greetingFor(hour: number): string {
  if (hour < 11) return 'buổi sáng';
  if (hour < 14) return 'buổi trưa';
  if (hour < 18) return 'buổi chiều';
  return 'buổi tối';
}

export function agoText(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const ms = now - t;
  if (ms < 60_000) return 'vừa xong';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} phút trước`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} giờ trước`;
  return `${Math.floor(ms / 86_400_000)} ngày trước`;
}

// ── Hồ sơ khách: cùng thứ tự/nhãn với DesktopContactProfileView (Thông tin chung) ─────────────────────────────

const RELATION_LABEL: Record<string, string> = {
  friend: 'Đã kết bạn',
  pending_friend: 'Đã gửi mời',
  chatting_stranger: 'Đang nhắn (chưa kết bạn)',
  ghost: 'Đã ngắt',
};
export function relationLabel(kind: string | null | undefined): string {
  if (!kind) return '—';
  return RELATION_LABEL[kind] ?? kind;
}

const GENDER_LABEL: Record<string, string> = { male: 'Nam', female: 'Nữ', other: 'Khác', unknown: 'Không rõ' };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Hàng "Thông tin chung" theo ĐÚNG thứ tự desktop (Tên đầy đủ, Tên CRM, Email, Điện thoại 1-3, Nghề nghiệp, Địa chỉ,
 * Khu vực, Giới tính, Ngày sinh). Trường rỗng bị bỏ (desktop cũng bỏ). Không bịa thêm trường.
 */
export function profileGeneralRows(c: Contact | null): Array<{ label: string; value: string }> {
  if (!c) return [];
  const region = [c.ward, c.district, c.province].filter(Boolean).join(', ');
  const birthday = c.birthDate ? fmtDate(c.birthDate) : c.birthYear ? String(c.birthYear) : '';
  const raw: Array<[string, string | null | undefined]> = [
    ['Tên đầy đủ', c.fullName],
    ['Tên CRM', c.crmName],
    ['Email', c.email],
    ['Điện thoại', c.phone],
    ['Điện thoại 2', c.phone2],
    ['Điện thoại 3', c.phone3],
    ['Nghề nghiệp', c.occupation],
    ['Địa chỉ', c.addressLine],
    ['Khu vực', region],
    ['Giới tính', c.gender ? (GENDER_LABEL[c.gender] ?? c.gender) : ''],
    ['Ngày sinh', birthday],
  ];
  return raw
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([label, v]) => ({ label, value: (v as string).trim() }));
}

// ── Tổng quan ────────────────────────────────────────────────────────────────────────────────────────────

const URGENT_STATUS_LABEL: Record<string, string> = {
  new: 'Mới', contacted: 'Đã liên hệ', nurturing: 'Đang chăm', caring: 'Đang chăm', negotiating: 'Đang tư vấn',
  interested: 'Quan tâm', closed_won: 'Chốt', closed: 'Chốt', chot: 'Chốt', cold: 'Nguội', lost: 'Mất', archived: 'Lưu trữ',
};
export function urgentStatusLabel(status?: string | null): string {
  if (!status) return '';
  return URGENT_STATUS_LABEL[status] ?? status;
}

/** Giờ "HH:mm" của một mục nhắc hẹn: ưu tiên appointmentTime; không có thì suy từ appointmentDate theo giờ tổ chức. */
export function reminderTime(appointmentDate: string, appointmentTime: string | null | undefined): string {
  const t = (appointmentTime ?? '').trim();
  if (/^\d{1,2}:\d{2}/.test(t)) return t.slice(0, 5).padStart(5, '0');
  const p = getOrgParts(appointmentDate);
  return p ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : '--:--';
}
