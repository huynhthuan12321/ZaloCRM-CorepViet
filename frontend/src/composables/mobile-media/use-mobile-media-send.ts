// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';
import { sendAlbumToConversation, sendMediaToConversation, type MediaAssetItem } from '@/api/media';
import { useMobile } from '@/composables/use-mobile';
import {
  describeMediaSendError, isAmbiguousSendError, mediaSendLockReason, planMediaSend, type MediaTarget,
} from '@/components/mobile/media/media-model';

export interface MediaSendResult {
  /** true = MỌI mục đã được xác nhận gửi xong, không còn gì mơ hồ. */
  ok: boolean;
  /** Số mục đã gửi (album: số ảnh server báo, có thể < số chọn). */
  sent: number;
  /** id các mục CHẮC CHẮN đã gửi (từng mục xác nhận riêng). Album chỉ vào đây khi server báo đủ số ảnh. */
  sentIds: string[];
  /**
   * id cần bỏ khỏi vùng chọn để không gửi trùng: sentIds + toàn bộ ảnh của album mà server chỉ báo "một phần/không rõ số".
   * Backend lọc bớt ảnh không hợp lệ và chỉ trả số lượng, không nói ảnh nào đã gửi.
   */
  resolvedIds: string[];
  /** Album đã được máy chủ nhận nhưng không biết chính xác ảnh nào đã đi (sent < số chọn, hoặc không có số). */
  unresolvedIds: string[];
  total: number;
  /**
   * true = lỗi không rõ kết quả (không phản hồi/5xx): mục đang bay CÓ THỂ đã tới khách. Không khuyến khích gửi lại ngay;
   * mục đó vẫn nằm trong vùng chọn nhưng thông báo bảo kiểm tra hội thoại trước.
   */
  ambiguous: boolean;
  /** Chữ tiếng Việt khi lỗi hoặc kết quả chưa đầy đủ. */
  error: string | null;
}

const OFFLINE_MID_TEXT = 'Mất kết nối giữa chừng nên đã dừng gửi các mục còn lại (không xếp hàng, không tự gửi lại).';

function fail(partial: Partial<MediaSendResult> & { error: string; total: number }): MediaSendResult {
  return { ok: false, sent: 0, sentIds: [], resolvedIds: [], unresolvedIds: [], ambiguous: false, ...partial };
}

export function albumPartialText(sent: number | null, total: number): string {
  return sent === null
    ? `Máy chủ đã nhận album ${total} ảnh nhưng không báo số ảnh đã gửi; không biết ảnh nào đã tới khách. Kiểm tra hội thoại và tải lại kho trước khi chọn lại.`
    : `Đã gửi ${sent}/${total} ảnh; máy chủ không cho biết ảnh nào, kiểm tra hội thoại và tải lại kho trước khi chọn lại.`;
}

/**
 * Gửi từ Kho media vào MỘT hội thoại, theo đúng luồng MediaTabPanel:
 *  - 1 mục: sendMediaToConversation; nhiều ảnh: sendAlbumToConversation; hỗn hợp: gửi tuần tự, dừng ở lỗi đầu tiên.
 * `target` và `items` là snapshot do người gọi truyền vào: đổi hội thoại đang xem khi request bay KHÔNG làm đổi đích.
 * Offline bị chặn Ở ĐÂY và kiểm lại TRƯỚC MỖI request ở gửi tuần tự. Không xếp hàng offline, không tự gửi lại.
 * Album: backend lọc bớt ảnh và chỉ trả `sent` (số lượng). sent < số chọn hoặc không có số => không biết ảnh nào đã đi:
 * bỏ cả album khỏi vùng chọn (unresolvedIds), KHÔNG đưa vào sentIds, không thử lại.
 */
export function useMobileMediaSend() {
  const { isOnline } = useMobile();
  const sending = ref(false);

  async function send(items: readonly MediaAssetItem[], target: MediaTarget): Promise<MediaSendResult> {
    const plan = planMediaSend(items);
    if (!plan) return fail({ total: 0, error: 'Chưa chọn mục nào để gửi.' });
    if (sending.value) return fail({ total: items.length, error: 'Đang gửi, vui lòng đợi xong rồi thử lại.' });
    const blocked = mediaSendLockReason({ online: isOnline.value, target, busy: false });
    if (blocked) return fail({ total: items.length, error: blocked });
    const convId = target.convId; // snapshot
    sending.value = true;
    const sentIds: string[] = [];
    try {
      if (plan.mode === 'single') {
        await sendMediaToConversation(plan.items[0].id, convId);
        sentIds.push(plan.items[0].id);
      } else if (plan.mode === 'album') {
        const ids = plan.items.map(i => i.id);
        const res = await sendAlbumToConversation(ids, convId);
        const n = (res as { sent?: unknown } | null | undefined)?.sent;
        const count = typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= ids.length ? n : null;
        if (count === ids.length) {
          return { ok: true, sent: count, sentIds: ids, resolvedIds: ids, unresolvedIds: [], total: items.length, ambiguous: false, error: null };
        }
        if (count === 0) {
          // Server xác nhận 0 ảnh đi: không có gì bị gửi, giữ nguyên vùng chọn (không đoán, không tự thử lại).
          return fail({ total: items.length, error: `Máy chủ báo đã gửi 0/${ids.length} ảnh (không ảnh nào hợp lệ để gửi). Chưa có ảnh nào tới khách; kiểm tra lại kho rồi chọn lại.` });
        }
        return {
          ok: false, sent: count ?? 0, sentIds: [], resolvedIds: ids, unresolvedIds: ids, total: items.length, ambiguous: false,
          error: albumPartialText(count, ids.length),
        };
      } else {
        for (const item of plan.items) {
          // Kiểm tra mạng trước MỖI request (mock/máy thật có thể chuyển offline giữa chừng).
          if (!isOnline.value) {
            return fail({
              sent: sentIds.length, sentIds, resolvedIds: [...sentIds], total: items.length,
              error: `${OFFLINE_MID_TEXT}${sentIds.length ? ` Đã gửi xong ${sentIds.length}/${items.length} mục (đã bỏ khỏi vùng chọn).` : ' Chưa gửi mục nào.'}`,
            });
          }
          await sendMediaToConversation(item.id, convId);
          sentIds.push(item.id);
        }
      }
      return { ok: true, sent: sentIds.length, sentIds, resolvedIds: [...sentIds], unresolvedIds: [], total: items.length, ambiguous: false, error: null };
    } catch (err) {
      const ambiguous = isAmbiguousSendError(err);
      const base = describeMediaSendError(err);
      const partial = sentIds.length > 0
        ? ` Đã gửi xong ${sentIds.length}/${items.length} mục (đã bỏ khỏi vùng chọn); các mục sau mục đang lỗi chưa gửi.`
        : '';
      return fail({ sent: sentIds.length, sentIds, resolvedIds: [...sentIds], total: items.length, ambiguous, error: base + partial });
    } finally {
      sending.value = false;
    }
  }

  return { sending, send };
}
