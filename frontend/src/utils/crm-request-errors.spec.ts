import { describe, expect, it } from 'vitest';
import { APPOINTMENT_SAVE_ERROR, appointmentSaveError, contactReadError, requestStatus } from './crm-request-errors';

describe('F6: only explain status/code actually returned by server', () => {
  it.each([[403, 'Bạn không có quyền xem khách này'], [404, 'Khách không tồn tại hoặc đã xóa']])('contact %s', (status, message) => {
    expect(contactReadError(requestStatus({ response: { status } }))).toBe(message);
  });
  it('network/500 are not reported as deleted or forbidden', () => {
    expect(contactReadError(null)).toContain('Không tải được');
    expect(contactReadError(500)).toContain('Không tải được');
  });
  it('uses conflict message verbatim, or translates explicit code', () => {
    const message = 'Khách giả đã có lịch lúc 09:30 ngày 10/11/2026 · phụ trách Sale giả.';
    expect(appointmentSaveError({ response: { status: 409, data: { error: 'appointment_conflict', message } } })).toBe(message);
    expect(appointmentSaveError({ response: { data: { error: 'appointment_conflict' } } })).toContain('trùng giờ');
    expect(appointmentSaveError({ response: { status: 409, data: { message } } })).toBe(message);
  });
  it.each([{}, { response: { status: 409, data: { error: 'other_conflict' } } }, { response: { status: 500 } }])('never guesses duplicate from generic error', error => {
    expect(appointmentSaveError(error)).toBe(APPOINTMENT_SAVE_ERROR);
    expect(appointmentSaveError(error)).not.toContain('trùng');
  });
});
