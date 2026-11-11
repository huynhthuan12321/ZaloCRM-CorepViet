// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Logic thuần cho cuộn thread kiểu mobile (CONTRACT-A §3.4, LOCK C-4, D-14). MessageThread chỉ dùng khi prop `mobile`;
 * desktop giữ watcher cũ. Tách ra hàm thuần để test không cần dựng cả MessageThread.
 */

/** Khoảng cách tối đa tới đáy còn được coi là "đang ở đáy" (px). */
export const NEAR_BOTTOM_PX = 120;

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function isNearBottom(el: ScrollMetrics, threshold = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/** Ảnh chụp trạng thái danh sách tin để so sánh giữa 2 lần đổi. */
export interface MessageSnapshot {
  convId: string | null;
  len: number;
  head: string | null;
  tail: string | null;
}

export type MessageChange =
  | { kind: 'reset' }            // đổi hội thoại / nạp lần đầu / danh sách rỗng
  | { kind: 'append'; added: number }
  | { kind: 'prepend' }          // tải lịch sử cũ ở đầu danh sách
  | { kind: 'none' };

export function snapshotMessages(convId: string | null, messages: ReadonlyArray<{ id: string }>): MessageSnapshot {
  return {
    convId,
    len: messages.length,
    head: messages.length ? messages[0].id : null,
    tail: messages.length ? messages[messages.length - 1].id : null,
  };
}

/** Phân loại thay đổi danh sách tin. Resize/bàn phím KHÔNG đi qua đây nên không bao giờ thành "tin mới". */
export function classifyMessageChange(
  prev: MessageSnapshot,
  next: MessageSnapshot,
  messages: ReadonlyArray<{ id: string }>,
): MessageChange {
  if (prev.convId !== next.convId) return { kind: 'reset' };
  if (next.len === 0 || prev.len === 0) return { kind: 'reset' };
  const tailChanged = prev.tail !== next.tail;
  const headChanged = prev.head !== next.head;
  if (tailChanged) {
    const idx = prev.tail ? messages.findIndex(m => m.id === prev.tail) : -1;
    if (idx < 0) return { kind: 'reset' }; // tin cuối cũ biến mất (thay cả danh sách)
    return { kind: 'append', added: Math.max(1, messages.length - 1 - idx) };
  }
  if (headChanged && next.len > prev.len) return { kind: 'prepend' };
  return { kind: 'none' };
}

export interface AutoScrollInput {
  change: MessageChange;
  /** Người dùng đang ở gần đáy (cờ cập nhật theo sự kiện scroll, không đổi khi bàn phím làm co khung). */
  stickToBottom: boolean;
  /** Tin cuối là của chính mình và vừa bấm gửi cách đây chưa lâu. */
  ownJustSent: boolean;
}

/** Quyết định cuộn: 'bottom' | 'anchor' (giữ vị trí khi prepend) | 'pill' (hiện "Tin mới") | 'none'. */
export function decideScroll(input: AutoScrollInput): 'bottom' | 'anchor' | 'pill' | 'none' {
  const { change } = input;
  if (change.kind === 'reset') return 'bottom';
  if (change.kind === 'prepend') return 'anchor';
  if (change.kind === 'append') return input.ownJustSent || input.stickToBottom ? 'bottom' : 'pill';
  return 'none';
}

/** Tin của chính mình được coi là "vừa gửi" trong khoảng này sau khi bấm gửi (ms). */
export const OWN_SEND_WINDOW_MS = 15_000;
