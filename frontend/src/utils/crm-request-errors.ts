// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/** Presentation only: do not infer permissions or scheduling conflicts from a generic failure. */
export function requestStatus(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

export function contactReadError(status: number | null): string {
  if (status === 403) return 'Bạn không có quyền xem khách này';
  if (status === 404) return 'Khách không tồn tại hoặc đã xóa';
  return 'Không tải được hồ sơ khách. Vui lòng thử lại.';
}

export const APPOINTMENT_SAVE_ERROR = 'Không lưu được lịch hẹn. Vui lòng kiểm tra kết nối rồi thử lại.';
export function appointmentSaveError(error: unknown): string {
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } } | null)?.response?.data;
  // A server-provided user message is explicit information, not a client guess.
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  // Without a message, only this specific code warrants a conflict explanation.
  if (data?.error === 'appointment_conflict') {
    return 'Khách đã có lịch hẹn trùng giờ. Chọn giờ khác hoặc xử lý lịch cũ trước.';
  }
  return APPOINTMENT_SAVE_ERROR;
}
