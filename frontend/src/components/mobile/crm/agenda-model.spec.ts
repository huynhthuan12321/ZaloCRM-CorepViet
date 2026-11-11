import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));

import type { Appointment } from '@/composables/use-appointments';
import { refreshOrgTimezone } from '@/composables/use-org-timezone';
import {
  addDays, appointmentDayKey, appointmentTimeText, appointmentToDraft, buildAppointmentPayload, filterAppointments, groupByDay,
  mondayIndex, splitDraftDate, suggestStart, validateDraft, weekDays, weekRange,
} from './agenda-model';

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1', contactId: 'c1', appointmentDate: '2026-11-10T00:00:00.000Z', appointmentTime: '09:30', type: 'call', status: 'scheduled', notes: null,
  createdAt: '', source: 'manual', externalRef: null, zaloMessageId: null, emoji: null, conversationId: null, statusChangedAt: null, statusChangedBy: null, ...over,
});

beforeEach(() => refreshOrgTimezone('+07:00'));

describe('tuần theo giờ tổ chức', () => {
  it('weekDays: thứ Hai -> Chủ nhật; 10/11/2026 là thứ Ba', () => {
    expect(mondayIndex('2026-11-10')).toBe(1);
    expect(weekDays('2026-11-10')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('weekRange: 00:00 thứ Hai theo UTC+7 = 17:00Z Chủ nhật trước', () => {
    expect(weekRange('2026-11-10')).toEqual({ from: '2026-11-08T17:00:00.000Z', to: '2026-11-15T17:00:00.000Z' });
  });
  it('đổi múi giờ tổ chức -> khoảng truy vấn đổi theo (không dùng giờ máy)', () => {
    refreshOrgTimezone('-05:00');
    expect(weekRange('2026-11-10').from).toBe('2026-11-09T05:00:00.000Z');
  });
});

describe('ngày/giờ hiển thị theo giờ tổ chức', () => {
  it('giờ lấy từ appointmentTime (wall-clock tổ chức), ngày từ appointmentDate', () => {
    const a = appt();
    expect(appointmentTimeText(a)).toBe('09:30');
    expect(appointmentDayKey(a)).toBe('2026-11-10');
  });
  it('appointmentTime rỗng -> suy từ appointmentDate theo giờ tổ chức, không theo giờ máy', () => {
    const a = appt({ appointmentDate: '2026-11-10T02:15:00.000Z', appointmentTime: '' });
    expect(appointmentTimeText(a)).toBe('09:15'); // 02:15Z = 09:15 ở UTC+7
  });
  it('groupByDay sắp theo giờ trong ngày', () => {
    const g = groupByDay([appt({ id: 'late', appointmentTime: '15:00' }), appt({ id: 'early', appointmentTime: '08:00' })]);
    expect(g.get('2026-11-10')!.map(a => a.id)).toEqual(['early', 'late']);
  });
  it('suggestStart làm tròn lên mốc 15 phút theo giờ tổ chức', () => {
    expect(suggestStart('2026-11-10', new Date('2026-11-10T02:07:00.000Z'))).toBe('2026-11-10T09:15'); // 09:07 -> 09:15
  });
});

describe('giữ conversationId / source / externalRef khi sửa', () => {
  const zalo = appt({ source: 'zalo', externalRef: 'zalo-ref-9', zaloMessageId: 'm1', conversationId: 'conv-7', title: 'Hẹn xem nhà' });

  it('draft mang conversationId để hiển thị, nhưng payload gửi lên KHÔNG chứa source/externalRef/zaloMessageId/conversationId', () => {
    const draft = appointmentToDraft(zalo);
    expect(draft.conversationId).toBe('conv-7');
    const payload = buildAppointmentPayload({ ...draft, notes: 'đổi ghi chú' });
    expect(payload).not.toHaveProperty('source');
    expect(payload).not.toHaveProperty('externalRef');
    expect(payload).not.toHaveProperty('zaloMessageId');
    expect(payload).not.toHaveProperty('conversationId');
    expect(payload).toMatchObject({ appointmentDate: '2026-11-10', appointmentTime: '09:30', notes: 'đổi ghi chú', title: 'Hẹn xem nhà' });
  });
  it('payload tách ngày YYYY-MM-DD và giờ HH:mm như AppointmentEditor desktop', () => {
    expect(splitDraftDate('2026-11-10T14:45')).toEqual({ date: '2026-11-10', time: '14:45' });
  });
});

describe('kiểm tra form + bộ lọc', () => {
  it('bắt buộc khách, tiêu đề, ngày, giờ', () => {
    const d = { contactId: '', title: ' ', appointmentDate: 'T', durationMin: 15, type: 'call', notes: '', assignedUserId: null };
    expect(Object.keys(validateDraft(d)).sort()).toEqual(['contactId', 'date', 'time', 'title']);
    expect(validateDraft({ ...d, contactId: 'c', title: 'x', appointmentDate: '2026-11-10T09:00' })).toEqual({});
  });
  it('lọc trạng thái + người phụ trách', () => {
    const list = [
      appt({ id: '1', status: 'scheduled', assignedUserId: 'me' }),
      appt({ id: '2', status: 'completed', assignedUserId: 'me' }),
      appt({ id: '3', status: 'overdue', assignedUserId: 'other' }),
    ];
    expect(filterAppointments(list, { mode: 'open', assignee: 'me', currentUserId: 'me' }).map(a => a.id)).toEqual(['1']);
    expect(filterAppointments(list, { mode: 'open', assignee: 'all', currentUserId: 'me' }).map(a => a.id)).toEqual(['1', '3']);
    expect(filterAppointments(list, { mode: 'all', assignee: 'other', currentUserId: 'me' }).map(a => a.id)).toEqual(['3']);
  });
});
