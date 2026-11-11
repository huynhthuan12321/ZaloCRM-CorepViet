// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Hàm thuần cho agenda mobile. MỌI ngày/giờ tính theo MÚI GIỜ TỔ CHỨC (use-org-timezone), không theo giờ máy,
 * để lịch hiển thị cùng một ngày với desktop dù điện thoại đặt múi giờ khác.
 */
import type { Appointment } from '@/composables/use-appointments';
import { appointmentOwnerId, appointmentStart, type AppointmentEx } from '@/composables/appointment-helpers';
import { getOrgParts, orgDayKey, orgWallClockToUtc } from '@/composables/use-org-timezone';
import type { AppointmentDraft } from './types';

export type DayKey = string; // "YYYY-MM-DD" theo giờ tổ chức

export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 0 = Thứ Hai ... 6 = Chủ nhật (cùng quy ước tuần của desktop). */
export function mondayIndex(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function weekDays(anchor: DayKey): DayKey[] {
  const monday = addDays(anchor, -mondayIndex(anchor));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Khoảng truy vấn của một tuần: [00:00 thứ Hai, 00:00 thứ Hai kế] theo giờ tổ chức, dạng ISO UTC cho API. */
export function weekRange(anchor: DayKey): { from: string; to: string } {
  const [first] = weekDays(anchor);
  const from = orgWallClockToUtc(first, '00:00');
  const to = orgWallClockToUtc(addDays(first, 7), '00:00');
  return { from: (from ?? new Date(first)).toISOString(), to: (to ?? new Date(addDays(first, 7))).toISOString() };
}

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export function weekdayShort(key: DayKey): string {
  const [y, m, d] = key.split('-').map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
export function dayNumber(key: DayKey): string { return String(Number(key.split('-')[2])); }
export function dayLabel(key: DayKey, today: DayKey): string {
  const [y, m, d] = key.split('-');
  const base = `${weekdayShort(key)}, ${d}/${m}/${y}`;
  if (key === today) return `Hôm nay · ${base}`;
  if (key === addDays(today, 1)) return `Ngày mai · ${base}`;
  return base;
}

export function appointmentDayKey(a: Appointment): DayKey {
  return orgDayKey(appointmentStart(a as AppointmentEx));
}

/** "HH:mm" theo giờ tổ chức. */
export function appointmentTimeText(a: Appointment): string {
  const t = (a.appointmentTime || '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const p = getOrgParts(appointmentStart(a as AppointmentEx));
  return p ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : '--:--';
}

export function sortByStart(list: Appointment[]): Appointment[] {
  return [...list].sort((a, b) => appointmentStart(a as AppointmentEx).getTime() - appointmentStart(b as AppointmentEx).getTime());
}

export function groupByDay(list: Appointment[]): Map<DayKey, Appointment[]> {
  const map = new Map<DayKey, Appointment[]>();
  for (const a of sortByStart(list)) {
    const k = appointmentDayKey(a);
    const arr = map.get(k);
    if (arr) arr.push(a); else map.set(k, [a]);
  }
  return map;
}

export type StatusMode = 'open' | 'completed' | 'closed' | 'all';
export const STATUS_MODES: Array<{ value: StatusMode; text: string; statuses: string[] | null }> = [
  { value: 'open', text: 'Cần làm', statuses: ['scheduled', 'overdue'] },
  { value: 'completed', text: 'Hoàn thành', statuses: ['completed'] },
  { value: 'closed', text: 'Hủy / Vắng', statuses: ['cancelled', 'no_show'] },
  { value: 'all', text: 'Tất cả', statuses: null },
];

/** assignee: 'me' = lịch của người đang đăng nhập; 'all' = mọi người server trả; hoặc id người phụ trách cụ thể. */
export function filterAppointments(
  list: Appointment[],
  opts: { mode: StatusMode; assignee: string; currentUserId: string | null },
): Appointment[] {
  const statuses = STATUS_MODES.find(m => m.value === opts.mode)?.statuses ?? null;
  const wanted = opts.assignee === 'me' ? opts.currentUserId : opts.assignee === 'all' ? null : opts.assignee;
  return list.filter((a) => {
    if (statuses && !statuses.includes(a.status)) return false;
    if (wanted && appointmentOwnerId(a as AppointmentEx) !== wanted) return false;
    return true;
  });
}

// ── Draft <-> payload ────────────────────────────────────────────────────────────────────────────────────

export function splitDraftDate(v: string): { date: string; time: string } {
  const [date = '', time = ''] = v.split('T');
  return { date, time: time.slice(0, 5) };
}

export function appointmentToDraft(a: Appointment): AppointmentDraft {
  const date = appointmentDayKey(a);
  const time = appointmentTimeText(a);
  return {
    contactId: a.contactId,
    title: a.title ?? '',
    appointmentDate: `${date}T${time === '--:--' ? '09:00' : time}`,
    durationMin: a.durationMin ?? 15,
    type: a.type || 'follow_up',
    notes: a.notes ?? '',
    assignedUserId: a.assignedUserId ?? a.assignedUser?.id ?? null,
    // conversationId chỉ mang theo để hiển thị/mở hội thoại; API PUT không nhận nên KHÔNG gửi (xem buildAppointmentPayload).
    conversationId: a.conversationId,
  };
}

/**
 * Payload gửi qua useAppointments (cùng dạng AppointmentEditor desktop: ngày "YYYY-MM-DD" + giờ "HH:mm" wall-clock tổ chức).
 * KHÔNG bao giờ gửi source / externalRef / zaloMessageId / conversationId: server không ghi các trường đó khi PUT, và việc
 * không gửi đảm bảo lịch tạo từ Zalo (source='zalo') giữ nguyên nguồn + liên kết hội thoại sau khi sửa trên điện thoại.
 */
export function buildAppointmentPayload(d: AppointmentDraft): Partial<Appointment> {
  const { date, time } = splitDraftDate(d.appointmentDate);
  return {
    title: d.title.trim(),
    contactId: d.contactId,
    assignedUserId: d.assignedUserId,
    appointmentDate: date,
    appointmentTime: time,
    durationMin: d.durationMin,
    type: d.type,
    notes: d.notes.trim() || null,
  };
}

export function validateDraft(d: AppointmentDraft): Record<string, string> {
  const e: Record<string, string> = {};
  const { date, time } = splitDraftDate(d.appointmentDate);
  if (!d.contactId) e.contactId = 'Chọn khách hàng';
  if (!d.title.trim()) e.title = 'Nhập tiêu đề';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.date = 'Chọn ngày';
  if (!/^\d{2}:\d{2}$/.test(time)) e.time = 'Chọn giờ';
  return e;
}

export const DURATION_OPTIONS: Array<{ value: number; text: string }> = [
  { value: 15, text: '15 phút' }, { value: 30, text: '30 phút' }, { value: 45, text: '45 phút' },
  { value: 60, text: '1 giờ' }, { value: 90, text: '1,5 giờ' }, { value: 120, text: '2 giờ' }, { value: 240, text: '4 giờ' }, { value: 1440, text: '1 ngày' },
];

/** Giờ gợi ý khi tạo mới: giờ tổ chức hiện tại làm tròn lên mốc 15 phút. */
export function suggestStart(day: DayKey, now: Date = new Date()): string {
  const p = getOrgParts(now);
  if (!p) return `${day}T09:00`;
  let total = p.hour * 60 + p.minute;
  total = Math.ceil((total + 1) / 15) * 15;
  if (total >= 24 * 60) total = 23 * 60 + 45;
  return `${day}T${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
