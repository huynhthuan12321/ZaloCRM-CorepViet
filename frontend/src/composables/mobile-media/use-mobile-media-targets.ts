// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api } from '@/api';
import type { Conversation } from '@/composables/use-chat';
import { usePrivacyVisibility } from '@/composables/use-privacy-visibility';
import {
  attachmentLockReason, buildConversationContext, conversationDisplayName, ownerLabel,
} from '@/components/mobile/chat/conversation-model';
import type { MediaTarget } from '@/components/mobile/media/media-model';

export interface MediaTargetRow extends MediaTarget {
  ownerText: string;
}

/**
 * Danh sách hội thoại để chọn đích gửi từ trang /media (đọc GET /conversations, RBAC do server lọc).
 * Mỗi dòng luôn có tên khách + nick + người phụ trách; dòng không gửi được mang `lockReason` tĩnh (không phải Zalo, nick xóa,
 * chat nội bộ, nick Riêng tư của người khác) – cùng bộ quy tắc khóa với sheet đính kèm trong thread.
 */
export function useMobileMediaTargets() {
  const privacy = usePrivacyVisibility();
  const query = ref('');
  const rows = ref<MediaTargetRow[]>([]);
  const state = ref<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function toRow(conv: Conversation): MediaTargetRow {
    const ctx = buildConversationContext(conv);
    return {
      convId: conv.id,
      customerName: conversationDisplayName(conv),
      nickName: ctx.nickName?.trim() || 'chưa rõ',
      ownerName: ctx.ownerName,
      ownerText: ownerLabel(ctx),
      // online:true/sending:false vì offline và đang-gửi do thư viện khóa riêng theo thời điểm bấm Gửi.
      // Thiếu nick = không gửi (hộp xác nhận phải nêu rõ nick), thay vì điền chữ giả vào "qua nick ...".
      lockReason: attachmentLockReason({ online: true, ctx, sending: false, privacyLocked: !privacy.canSendInConv(conv) })
        ?? (ctx.nickName?.trim() ? null : 'Chưa xác định được nick gửi của hội thoại này nên chưa gửi từ kho được.'),
    };
  }

  const PAGE = 40;
  const page = ref(1);
  const total = ref(0);
  const loadingMore = ref(false);
  const moreError = ref(false);
  const hasMore = computed(() => rows.value.length < total.value && state.value === 'ready');

  function fetchPage(p: number) {
    return api.get('/conversations', { params: { limit: PAGE, page: p, search: query.value.trim() || undefined } });
  }

  async function load(): Promise<void> {
    const mine = ++seq;
    state.value = 'loading';
    loadingMore.value = false; // đổi từ khóa khi "tải thêm" còn bay: kết quả cũ bị bỏ nên phải mở khóa ở đây
    moreError.value = false;
    page.value = 1;
    try {
      const res = await fetchPage(1);
      if (mine !== seq) return;
      rows.value = ((res.data?.conversations ?? []) as Conversation[]).map(toRow);
      total.value = Number(res.data?.total ?? rows.value.length);
      state.value = rows.value.length ? 'ready' : 'empty';
    } catch {
      if (mine !== seq) return;
      rows.value = [];
      total.value = 0;
      state.value = 'error';
    }
  }

  /** Trang kế tiếp (khách ở trang sau phải chọn được). Bỏ trùng convId vì danh sách có thể xê dịch giữa hai lần gọi. */
  async function loadMore(): Promise<void> {
    if (loadingMore.value || !hasMore.value) return;
    const mine = seq;
    loadingMore.value = true;
    moreError.value = false;
    try {
      const res = await fetchPage(page.value + 1);
      if (mine !== seq) return;
      const incoming = ((res.data?.conversations ?? []) as Conversation[]).map(toRow);
      const seen = new Set(rows.value.map(r => r.convId));
      rows.value = rows.value.concat(incoming.filter(r => !seen.has(r.convId)));
      page.value += 1;
      total.value = Number(res.data?.total ?? total.value);
      if (incoming.length === 0) total.value = rows.value.length; // server hết dữ liệu: dừng, không lặp vô hạn
    } catch {
      if (mine === seq) moreError.value = true;
    } finally {
      if (mine === seq) loadingMore.value = false;
    }
  }

  watch(query, () => {
    clearTimeout(timer);
    timer = setTimeout(() => { void load(); }, 350);
  });
  onBeforeUnmount(() => { clearTimeout(timer); seq++; });

  return { query, rows, state, load, loadMore, hasMore, loadingMore, moreError, total };
}
