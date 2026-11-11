// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));

import { SAVE_ERROR_TEXT, useMobileAgenda } from './use-mobile-agenda';
import { confirmState, resolveConfirm } from '@/composables/use-confirm';
import { refreshOrgTimezone } from '@/composables/use-org-timezone';
import { useAuthStore } from '@/stores/auth';
import { installMemoryStorage } from './test-utils';

const zaloAppt = {
  id: 'a1', contactId: 'c1', appointmentDate: '2026-11-10T00:00:00.000Z', appointmentTime: '09:30', type: 'call', status: 'scheduled', notes: null, createdAt: '',
  source: 'zalo', externalRef: 'zalo-ref-9', zaloMessageId: 'm1', emoji: null, conversationId: 'conv-7', statusChangedAt: null, statusChangedBy: null,
  title: 'Hẹn xem nhà', durationMin: 30, assignedUserId: 'me', contact: { id: 'c1', fullName: 'Lan', phone: null },
};

function setup() {
  installMemoryStorage();
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = { id: 'me', email: null, fullName: 'Tôi', role: 'member', orgId: 'o' } as never;
  const scope = effectScope();
  const a = scope.run(() => useMobileAgenda())!;
  return { a, scope };
}

beforeEach(() => {
  api.get.mockReset(); api.put.mockReset(); api.post.mockReset(); api.patch.mockReset(); api.delete.mockReset();
  refreshOrgTimezone('+07:00');
  confirmState.value = { open: false, title: '' };
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useMobileAgenda', () => {
  it('fetchWeek: khoảng tuần theo múi giờ tổ chức, source=all không lọc, trạng thái ready', async () => {
    api.get.mockResolvedValue({ data: { appointments: [zaloAppt], total: 1, counts: {} } });
    const { a, scope } = setup();
    a.selectedDay.value = '2026-11-10';
    await a.fetchWeek();
    expect(api.get.mock.calls[0][0]).toBe('/appointments');
    expect(api.get.mock.calls[0][1].params).toMatchObject({ dateFrom: '2026-11-08T17:00:00.000Z', dateTo: '2026-11-15T17:00:00.000Z' });
    expect(api.get.mock.calls[0][1].params.source).toBeUndefined();
    expect(a.state.value).toBe('ready');
    expect(a.countsByDay.value['2026-11-10']).toBe(1);
    scope.stop();
  });

  it('lỗi tải: error / offline; giữ lại dữ liệu cũ khi tải lại thất bại', async () => {
    api.get.mockResolvedValueOnce({ data: { appointments: [zaloAppt], total: 1 } });
    const { a, scope } = setup();
    a.selectedDay.value = '2026-11-10';
    await a.fetchWeek();
    api.get.mockRejectedValueOnce(new Error('500'));
    await a.fetchWeek();
    expect(a.state.value).toBe('error');
    expect(a.appointments.value).toHaveLength(1); // không mất lịch đang xem
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    api.get.mockRejectedValueOnce(new Error('net'));
    await a.fetchWeek();
    expect(a.state.value).toBe('offline');
    scope.stop();
  });

  it('sửa lịch Zalo: PUT không chứa source/externalRef/conversationId; bản ghi giữ nguyên các trường đó kể cả khi tải lại lỗi', async () => {
    api.get.mockResolvedValueOnce({ data: { appointments: [zaloAppt], total: 1 } });
    api.put.mockResolvedValue({ data: {} });
    const { a, scope } = setup();
    a.selectedDay.value = '2026-11-10';
    await a.fetchWeek();
    api.get.mockRejectedValueOnce(new Error('net')); // làm tươi sau khi lưu bị lỗi
    const res = await a.update('a1', {
      contactId: 'c1', title: 'Hẹn xem nhà (đổi giờ)', appointmentDate: '2026-11-10T10:00', durationMin: 30, type: 'call', notes: 'x', assignedUserId: 'me', conversationId: 'conv-7',
    });
    expect(res.ok).toBe(true);
    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe('/appointments/a1');
    expect(body).toMatchObject({ appointmentDate: '2026-11-10', appointmentTime: '10:00', title: 'Hẹn xem nhà (đổi giờ)' });
    expect(body).not.toHaveProperty('source');
    expect(body).not.toHaveProperty('externalRef');
    expect(body).not.toHaveProperty('conversationId');
    const kept = a.appointments.value.find(x => x.id === 'a1')!;
    expect(kept.source).toBe('zalo');
    expect(kept.externalRef).toBe('zalo-ref-9');
    expect(kept.conversationId).toBe('conv-7');
    expect(kept.appointmentTime).toBe('10:00');
    scope.stop();
  });

  it('tạo lịch: POST đúng payload (ngày + giờ tổ chức), lỗi server -> thông báo, không đóng form', async () => {
    api.get.mockResolvedValue({ data: { appointments: [], total: 0 } });
    api.post.mockResolvedValueOnce({ data: { id: 'n1' } });
    const { a, scope } = setup();
    const draft = { contactId: 'c1', title: 'Gọi lại', appointmentDate: '2026-11-11T08:15', durationMin: 15, type: 'call', notes: '', assignedUserId: 'me' };
    expect((await a.create(draft)).ok).toBe(true);
    expect(api.post.mock.calls[0][1]).toMatchObject({ appointmentDate: '2026-11-11', appointmentTime: '08:15', contactId: 'c1', notes: null });
    api.post.mockRejectedValueOnce(new Error('409'));
    const bad = await a.create(draft);
    expect(bad).toEqual({ ok: false, error: SAVE_ERROR_TEXT });
    expect((await a.create({ ...draft, title: ' ' })).ok).toBe(false); // validate trước khi gọi API
    expect(api.post).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('hủy / xóa luôn hỏi xác nhận qua ConfirmHost; từ chối thì không gọi API', async () => {
    api.get.mockResolvedValue({ data: { appointments: [zaloAppt], total: 1 } });
    const { a, scope } = setup();
    a.selectedDay.value = '2026-11-10';
    await a.fetchWeek();
    const appt = a.appointments.value[0];

    const p1 = a.cancel(appt);
    expect(confirmState.value.open).toBe(true);
    expect(confirmState.value.tone).toBe('danger');
    resolveConfirm(false, '');
    expect(await p1).toBe(false);
    expect(api.patch).not.toHaveBeenCalled();

    const p2 = a.remove(appt);
    expect(confirmState.value.open).toBe(true);
    resolveConfirm(false, '');
    expect(await p2).toBe(false);
    expect(api.delete).not.toHaveBeenCalled();

    api.delete.mockResolvedValue({ data: { success: true } });
    const p3 = a.remove(appt);
    resolveConfirm(true, '');
    expect(await p3).toBe(true);
    expect(api.delete).toHaveBeenCalledWith('/appointments/a1');
    expect(a.appointments.value).toHaveLength(0);
    scope.stop();
  });

  it('hoàn thành không cần xác nhận (không phá hủy) và gọi PATCH status', async () => {
    api.get.mockResolvedValue({ data: { appointments: [zaloAppt], total: 1 } });
    api.patch.mockResolvedValue({ data: { status: 'completed' } });
    const { a, scope } = setup();
    a.selectedDay.value = '2026-11-10';
    await a.fetchWeek();
    expect(await a.complete(a.appointments.value[0])).toBe(true);
    expect(api.patch).toHaveBeenCalledWith('/appointments/a1/status', { status: 'completed' });
    scope.stop();
  });
});


describe('F6: server conflict through mobile save', () => {
  it('POST conflict message, PUT code-only conflict and generic failure stay distinct; success clears prior error', async () => {
    const { a, scope } = setup();
    const draft = { contactId: 'c1', title: 'Gọi lại', appointmentDate: '2026-11-11T08:15', durationMin: 15, type: 'call', notes: '', assignedUserId: 'me' };
    const message = 'Khách giả có lịch Gọi lại lúc 08:15 ngày 11/11/2026.';
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'appointment_conflict', message } } });
    expect(await a.create(draft)).toEqual({ ok: false, error: message });
    api.put.mockRejectedValueOnce({ response: { status: 409, data: { error: 'appointment_conflict' } } });
    expect(await a.update('a1', draft)).toEqual({ ok: false, error: expect.stringContaining('trùng giờ') });
    api.post.mockRejectedValueOnce({ response: { status: 500, data: { error: 'Failed to create appointment' } } });
    expect(await a.create(draft)).toEqual({ ok: false, error: SAVE_ERROR_TEXT });
    api.post.mockResolvedValueOnce({ data: { id: 'ok' } });
    expect(await a.create(draft, { refresh: false })).toEqual({ ok: true });
    scope.stop();
  });
});
