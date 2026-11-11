// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { CHAT_ATTACHMENT_LIMITS, validateAttachment } from '@/composables/use-chat-attachments';
import type { AttachmentKind } from './types';

/** Cấu hình 5 lựa chọn của nút + (CONTRACT-A §3.3). Bảng accept/capture/multiple khớp contract. */
export interface AttachmentOption {
  kind: AttachmentKind;
  label: string;
  hint: string;
  icon: string;
  /** Không có với 'library' (không dùng input file). */
  accept?: string;
  capture?: 'environment';
  multiple?: boolean;
}

export const ATTACHMENT_OPTIONS: readonly AttachmentOption[] = [
  { kind: 'image', label: 'Ảnh', hint: 'Chọn từ thư viện (JPEG, PNG, WebP, GIF)', icon: 'mdi-image-multiple-outline', accept: 'image/*', multiple: true },
  { kind: 'camera', label: 'Chụp ảnh', hint: 'Mở camera sau để chụp', icon: 'mdi-camera-outline', accept: 'image/*', capture: 'environment', multiple: false },
  { kind: 'video', label: 'Video', hint: 'Một video mỗi lần (MP4, MOV, WebM, tối đa 500MB)', icon: 'mdi-video-outline', accept: 'video/mp4,video/quicktime,video/webm', multiple: false },
  {
    kind: 'document', label: 'Tài liệu', hint: 'PDF, Word, Excel, PowerPoint, CSV, nén (tối đa 500MB)', icon: 'mdi-file-document-outline',
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.zip,.gz,.rar,.tar', multiple: true,
  },
  { kind: 'library', label: 'Kho media', hint: 'Chọn ảnh, video, tệp đã lưu trong kho', icon: 'mdi-folder-multiple-image' },
] as const;

const KIND_OF_OPTION: Record<Exclude<AttachmentKind, 'library'>, 'image' | 'video' | 'file'> = {
  image: 'image', camera: 'image', video: 'video', document: 'file',
};

/**
 * Lọc tệp người dùng vừa chọn trước khi gọi API: sai loại/quá cỡ/HEIC bị từ chối KHÔNG gọi API (reasons = tiếng Việt).
 * Video chỉ nhận 1 tệp (D-9); tối đa CHAT_ATTACHMENT_LIMITS.maxFiles tệp mỗi lần.
 */
export function filterPickedFiles(
  kind: Exclude<AttachmentKind, 'library'>,
  files: File[],
): { accepted: File[]; reasons: string[] } {
  const accepted: File[] = [];
  const reasons: string[] = [];
  const expected = KIND_OF_OPTION[kind];
  const maxCount = kind === 'video' || kind === 'camera' ? 1 : CHAT_ATTACHMENT_LIMITS.maxFiles;

  for (const file of files) {
    const result = validateAttachment(file);
    if (!result.ok) {
      reasons.push(result.reason);
      continue;
    }
    if (result.kind !== expected) {
      const want = expected === 'image' ? 'ảnh' : expected === 'video' ? 'video' : 'tài liệu';
      reasons.push(`${file.name || 'Tệp'}: không phải ${want}. Hãy chọn đúng mục trong nút +.`);
      continue;
    }
    if (accepted.length >= maxCount) {
      reasons.push(`${file.name || 'Tệp'}: mỗi lần chỉ gửi tối đa ${maxCount} ${kind === 'video' ? 'video' : 'tệp'}.`);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, reasons };
}

interface HttpErrorLike {
  response?: { status?: number; data?: { error?: string; code?: string } };
  code?: string;
}

/** Thông báo tiếng Việt cho lỗi upload (403/409/413/415/429...). */
export function describeUploadError(err: unknown): string {
  const e = (err ?? {}) as HttpErrorLike;
  const status = e.response?.status;
  const code = e.response?.data?.code;
  const detail = e.response?.data?.error;
  if (!e.response) return 'Mất kết nối hoặc quá thời gian chờ nên chưa gửi được. Hãy kiểm tra mạng rồi gửi lại.';
  switch (status) {
    case 403:
      return code === 'PRIVACY_LOCKED'
        ? 'Nick này đang bật Riêng tư, chỉ chính chủ nick mới gửi được ảnh hoặc tệp.'
        : 'Bạn không có quyền gửi tệp trong hội thoại này.';
    case 409:
      return 'Nick Zalo này đã bị xóa khỏi CRM, không thể gửi tệp.';
    case 413:
      return 'Tệp quá lớn nên máy chủ từ chối. Ảnh tối đa 100MB, video và tài liệu tối đa 500MB.';
    case 415:
      return 'Định dạng tệp chưa được hỗ trợ. Hãy chọn ảnh JPEG/PNG, video MP4/MOV hoặc tài liệu phổ biến.';
    case 429:
      return 'Gửi quá nhanh nên bị giới hạn tạm thời. Vui lòng đợi một lát rồi thử lại.';
    case 404:
      return 'Không tìm thấy hội thoại này nữa. Hãy tải lại danh sách.';
    case 400:
      return detail && /not connected/i.test(detail)
        ? 'Nick Zalo đang không kết nối nên chưa gửi được. Hãy kết nối lại nick rồi thử lại.'
        : (detail || 'Yêu cầu gửi tệp không hợp lệ.');
    default:
      return detail || 'Gửi tệp thất bại. Vui lòng thử lại.';
  }
}
