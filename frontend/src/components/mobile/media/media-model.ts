// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Hàm thuần cho Kho media mobile (F2). Không gọi API, không đụng DOM -> test được không cần router/Vuetify.
 * Luồng gửi dùng lại ĐÚNG hai hàm API hiện có của MediaTabPanel (sendMediaToConversation / sendAlbumToConversation).
 */
import type { MediaAssetItem } from '@/api/media';

export type MediaKind = 'image' | 'video' | 'file';

export const MEDIA_KIND_TABS: ReadonlyArray<{ kind: MediaKind; label: string; icon: string }> = [
  { kind: 'image', label: 'Ảnh', icon: 'mdi-image-outline' },
  { kind: 'video', label: 'Video', icon: 'mdi-video-outline' },
  { kind: 'file', label: 'Tài liệu', icon: 'mdi-file-document-outline' },
];

export const MEDIA_PAGE_SIZE = 30;
/** Giới hạn album của MediaTabPanel ("Tối đa 12 ảnh/lần"). */
export const MEDIA_MAX_ALBUM = 12;

/** Đích gửi cố định (snapshot lúc chọn). Thay đổi hội thoại đang xem KHÔNG làm đổi đích đã chốt. */
export interface MediaTarget {
  convId: string;
  customerName: string;
  nickName: string;
  ownerName?: string | null;
  /** Lý do khóa tĩnh (nick xóa, hội thoại nội bộ, Riêng tư...). null = gửi được. */
  lockReason?: string | null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return '';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Ghép trang mới vào danh sách, bỏ trùng id (skip theo số đã tải có thể lệch khi kho đổi giữa hai lần gọi). */
export function mergeMediaPage(existing: MediaAssetItem[], incoming: MediaAssetItem[]): MediaAssetItem[] {
  const seen = new Set(existing.map(i => i.id));
  const fresh = incoming.filter(i => !seen.has(i.id));
  return fresh.length ? existing.concat(fresh) : existing;
}

export function hasMoreMedia(loaded: number, total: number, lastPageSize: number): boolean {
  if (lastPageSize <= 0) return false;
  return loaded < total;
}

/** Chọn/bỏ chọn một mục. Tổng chọn tối đa 12 (cùng giới hạn album hiện có); không đặt trần riêng cho video/tài liệu. */
export function toggleMediaSelection(
  selected: readonly MediaAssetItem[],
  item: MediaAssetItem,
): { next: MediaAssetItem[]; rejected: string | null } {
  if (selected.some(s => s.id === item.id)) return { next: selected.filter(s => s.id !== item.id), rejected: null };
  const candidate = [...selected, item];
  if (candidate.length > MEDIA_MAX_ALBUM) return { next: [...selected], rejected: `Tối đa ${MEDIA_MAX_ALBUM} mục mỗi lần gửi.` };
  return { next: candidate, rejected: null };
}

export type SendPlan =
  | { mode: 'single'; items: [MediaAssetItem] }
  | { mode: 'album'; items: MediaAssetItem[] }
  | { mode: 'sequence'; items: MediaAssetItem[] };

/** 1 mục -> gửi đơn; ≥2 và toàn ảnh -> album một lần; còn lại -> gửi tuần tự từng mục (dừng ở lỗi đầu tiên). */
export function planMediaSend(items: readonly MediaAssetItem[]): SendPlan | null {
  if (items.length === 0) return null;
  if (items.length === 1) return { mode: 'single', items: [items[0]] };
  if (items.every(i => i.kind === 'image')) return { mode: 'album', items: [...items] };
  return { mode: 'sequence', items: [...items] };
}

/** Lý do không gửi được (chữ tiếng Việt) hoặc null. Offline luôn khóa: ảnh/tệp KHÔNG xếp hàng chờ. */
export function mediaSendLockReason(opts: { online: boolean; target: MediaTarget | null; busy: boolean }): string | null {
  if (!opts.online) return 'Đang mất kết nối. Ảnh và tệp không xếp hàng chờ, hãy gửi lại khi có mạng.';
  if (!opts.target) return 'Hãy chọn hội thoại nhận trước khi gửi.';
  if (opts.target.lockReason) return opts.target.lockReason;
  if (opts.busy) return 'Đang gửi, vui lòng đợi xong rồi thử lại.';
  return null;
}

interface HttpErrorLike {
  response?: { status?: number; data?: { error?: string; code?: string } };
}

export const AMBIGUOUS_SEND_TEXT =
  'Không chắc mục này đã tới khách chưa (mất kết nối, quá giờ hoặc máy chủ báo lỗi sau khi có thể đã gửi). Hãy mở hội thoại kiểm tra trước khi gửi lại để tránh gửi trùng.';

/**
 * true = KHÔNG biết chắc đã gửi hay chưa: không có phản hồi (mạng/quá giờ) hoặc 5xx (backend có thể đã gọi Zalo xong rồi mới lỗi ghi DB).
 * Khi đó không được nói "chưa gửi" và không khuyến khích gửi lại.
 */
export function isAmbiguousSendError(err: unknown): boolean {
  const status = (err as HttpErrorLike | null)?.response?.status;
  const hasResponse = !!(err as HttpErrorLike | null)?.response;
  return !hasResponse || (typeof status === 'number' && status >= 500);
}

/** Mã/chữ báo nick không kết nối: backend trả `code: NICK_NOT_CONNECTED` + `error: 'Nick Zalo chưa kết nối'` (tiếng Việt). */
function isNickNotConnected(data: { error?: string; code?: string } | undefined): boolean {
  if (!data) return false;
  if (data.code === 'NICK_NOT_CONNECTED') return true;
  return !!data.error && /(chưa|không)\s+kết\s*nối|not connected/i.test(data.error);
}

/** Thông báo lỗi gửi từ kho (403/409/413/415/429...). Không lộ chuỗi kỹ thuật của server. */
export function describeMediaSendError(err: unknown): string {
  const e = (err ?? {}) as HttpErrorLike;
  if (isAmbiguousSendError(err)) return AMBIGUOUS_SEND_TEXT;
  const { status, data } = e.response!;
  switch (status) {
    case 403:
      return data?.code === 'PRIVACY_LOCKED'
        ? 'Nick này đang bật Riêng tư, chỉ chính chủ nick mới gửi được ảnh hoặc tệp.'
        : 'Bạn không có quyền gửi mục này vào hội thoại (mục riêng tư của người khác hoặc ngoài phạm vi của bạn).';
    case 409:
      return 'Nick Zalo của hội thoại đã bị xóa khỏi CRM nên chỉ xem được lịch sử, không gửi được.';
    case 413:
      return 'Tệp quá lớn nên máy chủ từ chối. Hãy chọn tệp nhỏ hơn.';
    case 415:
      return 'Định dạng tệp chưa được hỗ trợ để gửi qua Zalo. Hãy chọn mục khác.';
    case 429:
      return 'Gửi quá nhanh nên bị giới hạn tạm thời. Vui lòng đợi một lát rồi thử lại.';
    case 404:
      return 'Không tìm thấy hội thoại hoặc mục trong kho. Hãy tải lại rồi thử lại.';
    case 400:
      return isNickNotConnected(data)
        ? 'Nick Zalo đang không kết nối nên chưa gửi được. Hãy kết nối lại nick rồi thử lại.'
        : 'Yêu cầu gửi không hợp lệ. Hãy thử chọn lại mục cần gửi.';
    default:
      return 'Gửi thất bại. Vui lòng thử lại.';
  }
}

export function describeMediaLoadError(err: unknown, online: boolean): { state: 'offline' | 'forbidden' | 'error'; message: string } {
  const e = err as HttpErrorLike | null;
  if (e?.response?.status === 403) return { state: 'forbidden', message: 'Bạn không có quyền xem Kho media.' };
  if (!e?.response && !online) return { state: 'offline', message: 'Đang mất kết nối. Nội dung đã tải vẫn xem được.' };
  return { state: 'error', message: 'Không tải được Kho media. Hãy thử lại.' };
}

export function summarizeSelection(items: readonly MediaAssetItem[]): string {
  const img = items.filter(i => i.kind === 'image').length;
  const vid = items.filter(i => i.kind === 'video').length;
  const doc = items.filter(i => i.kind === 'file').length;
  return [img && `${img} ảnh`, vid && `${vid} video`, doc && `${doc} tài liệu`].filter(Boolean).join(', ');
}

export type SwipeAction = 'next' | 'prev' | 'close' | null;
export const SWIPE_DISTANCE = 56;
export const SWIPE_CLOSE_DISTANCE = 96;

/** Cử chỉ trên viewer: vuốt ngang đổi mục, vuốt xuống đóng. Trục trội thắng; ngưỡng tránh chạm nhầm. */
export function resolveViewerSwipe(dx: number, dy: number): SwipeAction {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay > ax) return dy >= SWIPE_CLOSE_DISTANCE ? 'close' : null;
  if (ax < SWIPE_DISTANCE) return null;
  return dx < 0 ? 'next' : 'prev';
}
