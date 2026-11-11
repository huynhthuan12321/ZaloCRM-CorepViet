// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { api } from '@/api/index';

/**
 * Helper gửi ảnh/video/tài liệu vào hội thoại (CONTRACT-A §3.3, LOCK C-2). MessageThread (desktop) và
 * luồng mobile cùng dùng MỘT đường upload: POST /conversations/:id/attachments, multipart, field `files`.
 *
 * Giới hạn bên dưới là BẢN SAO có chú thích nguồn để chặn sớm ở client; backend vẫn là nơi chặn thật:
 *   backend/src/modules/chat/chat-attachment-routes.ts (IMAGE_MAX/VIDEO_MAX/FILE_MAX, ALLOWED_*)
 *   backend/src/app.ts (fastify-multipart: fileSize 500MB, files 10)
 */
const MB = 1024 * 1024;

export const CHAT_ATTACHMENT_LIMITS = {
  /** ALLOWED_IMAGE: jpeg/png/webp/gif, tối đa 100MB mỗi ảnh. */
  imageMax: 100 * MB,
  /** ALLOWED_VIDEO: mp4/quicktime/webm, tối đa 500MB. */
  videoMax: 500 * MB,
  /** FILE_MAX backend = 1GB nhưng multipart toàn cục chỉ cho 500MB/tệp -> giới hạn thực tế 500MB. */
  fileMax: 500 * MB,
  /** Số tệp tối đa mỗi lần gửi (fastify-multipart `files: 10`). */
  maxFiles: 10,
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  file: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/zip', 'application/x-zip-compressed',
    'application/gzip', 'application/x-gzip',
    'application/x-rar-compressed', 'application/vnd.rar',
    'application/x-tar', 'application/x-gtar',
  ],
} as const;

export type ChatAttachmentKind = 'image' | 'video' | 'file';

export type AttachmentValidation =
  | { ok: true; kind: ChatAttachmentKind }
  | { ok: false; reason: string };

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

function formatMb(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}

/** Kiểm tra 1 tệp theo đúng quy tắc backend. Lý do trả về là tiếng Việt, dùng thẳng để hiện cho người dùng. */
export function validateAttachment(file: File): AttachmentValidation {
  const name = file.name || 'Tệp';
  const type = (file.type || '').toLowerCase();
  const L = CHAT_ATTACHMENT_LIMITS;

  if (HEIC_TYPES.includes(type)) {
    return { ok: false, reason: `${name}: ảnh HEIC chưa được hỗ trợ. Hãy chọn ảnh JPEG/PNG (Cài đặt Camera > Định dạng > Tương thích nhất).` };
  }
  if (!type) {
    return { ok: false, reason: `${name}: không xác định được loại tệp nên chưa gửi được.` };
  }
  let kind: ChatAttachmentKind;
  if ((L.image as readonly string[]).includes(type)) kind = 'image';
  else if ((L.video as readonly string[]).includes(type)) kind = 'video';
  else if ((L.file as readonly string[]).includes(type)) kind = 'file';
  else return { ok: false, reason: `${name}: định dạng này chưa được hỗ trợ.` };

  const max = kind === 'image' ? L.imageMax : kind === 'video' ? L.videoMax : L.fileMax;
  if (file.size > max) {
    return { ok: false, reason: `${name}: quá lớn (tối đa ${formatMb(max)} cho ${kind === 'image' ? 'ảnh' : kind === 'video' ? 'video' : 'tài liệu'}).` };
  }
  if (file.size <= 0) {
    return { ok: false, reason: `${name}: tệp rỗng.` };
  }
  return { ok: true, kind };
}

/**
 * Gửi tệp vào hội thoại `conversationId`. Giữ nguyên request của desktop cũ (MessageThread.handleImageFiles/handleFiles):
 * FormData field `files`, header multipart. Lỗi được ném lại nguyên (axios error có response.data.error) để caller tự toast.
 */
export async function uploadChatAttachments(
  conversationId: string,
  files: File[],
  opts?: { caption?: string },
): Promise<void> {
  const fd = new FormData();
  if (opts?.caption) fd.append('caption', opts.caption);
  for (const f of files) fd.append('files', f, f.name);
  await api.post(`/conversations/${conversationId}/attachments`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
