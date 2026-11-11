// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * use-open-contact-chat.ts — Điều hướng "mở chat 1-1 với 1 KH" từ mọi nơi (hồ sơ KH,
 * Tệp KH, Lead panel, lịch hẹn...). MỘT nguồn logic duy nhất — call-site chỉ gọi
 * openContactChat(router, contactId).
 *
 * BUG fix 2026-07-14 (fix/chat-contact-deeplink): trước đây các nút "Mở chat Zalo" push
 * /chat?contactId=xxx rồi ChatView tự find() trong list đã nạp → KH đã KB nhưng chưa nhắn
 * (không có Conversation row) HOẶC conv ngoài trang/scope → panel trống, KHÔNG toast.
 *
 * Giờ hỏi BE resolve tường minh (POST /conversations/resolve, org + nick-scope):
 *   { convId }     → push /chat/:convId (watcher params.convId trong ChatView tự adopt nick
 *                    ngoài scope + reload nếu cần — nhánh conv-ngoài-scope tự thông).
 *   { none }       → toast rõ lý do (KHÔNG im lặng).
 *   lỗi mạng       → fallback push /chat?contactId= cũ (giữ tương thích bookmark/link cũ).
 */
import type { Router } from 'vue-router';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';

interface ResolveResponse {
  convId?: string;
  created?: boolean;
  none?: boolean;
  reason?: string;
}

/**
 * Mở hội thoại 1-1 với KH. Trả true nếu đã điều hướng tới 1 hội thoại, false nếu không có
 * hội thoại nào (đã toast lý do).
 */
export async function openContactChat(router: Router, contactId: string): Promise<boolean> {
  const toast = useToast();
  if (!contactId) return false;
  try {
    const res = await api.post<ResolveResponse>('/conversations/resolve', { contactId });
    const data = res.data;
    if (data?.convId) {
      await router.push({ name: 'Chat', params: { convId: data.convId } });
      return true;
    }
    // none — KH chưa có Zalo / chưa KB với nick nào trong phạm vi xem.
    toast.warning(data?.reason || 'Khách chưa có Zalo hoặc chưa kết bạn với nick nào trong phạm vi xem', 4000);
    return false;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 404) {
      toast.error('Không tìm thấy khách hàng này');
      return false;
    }
    // Lỗi mạng/khác → fallback luồng cũ. Nếu ĐÃ ở /chat?contactId=<này> (vd gọi từ chính
    // watcher ChatView) thì KHÔNG push lại (tránh duplicate-navigation no-op).
    const cur = router.currentRoute.value;
    if (cur.path === '/chat' && cur.query.contactId === contactId) return false;
    await router.push({ path: '/chat', query: { contactId } });
    return true;
  }
}
