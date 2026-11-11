// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * contact-conversation-resolver.ts — Logic THUẦN chọn "mở hội thoại nào" khi deep-link
 * từ hồ sơ KH sang trang Chat (`POST /api/v1/conversations/resolve`).
 *
 * Tách khỏi route để unit test độc lập (repo ưu tiên test logic thuần, KHÔNG đụng prisma).
 * Route lo phần I/O: load Conversation + Friend rows (đã org-scope + nick-scope) rồi đưa vào
 * đây; hàm này CHỈ quyết định ưu tiên.
 *
 * Luật ưu tiên (anh chốt 2026-07-14):
 *   1. Có Conversation → chọn conv MỚI NHẤT (lastMessageAt desc, null coi là cũ nhất).
 *   2. Không conv nào nhưng có Friend (đã KB, chưa nhắn — ca "Hà Phạm") → chọn Friend
 *      tương tác gần nhất (lastInteractionAt desc) để route ensure-conversation tạo conv rỗng.
 *   3. Không cả hai → none (frontend toast, KHÔNG im lặng).
 */

export interface ConversationCandidate {
  id: string;
  /** null = conv rỗng chưa có tin → coi là cũ nhất khi so sánh. */
  lastMessageAt: Date | string | null;
}

export interface FriendCandidate {
  id: string;
  zaloAccountId: string;
  zaloUidInNick: string;
  contactId: string;
  zaloGlobalId: string | null;
  /** null = chưa từng tương tác → coi là cũ nhất khi so sánh. */
  lastInteractionAt: Date | string | null;
}

export type ContactConversationPlan =
  | { kind: 'conversation'; convId: string }
  | { kind: 'friend'; friendId: string; nickId: string; externalThreadId: string; contactId: string; globalId: string | null }
  | { kind: 'none' };

/** Epoch ms của 1 timestamp có thể null/string/Date. null → -Infinity (cũ nhất). */
function toMs(v: Date | string | null | undefined): number {
  if (!v) return -Infinity;
  const t = typeof v === 'string' ? Date.parse(v) : v.getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Chọn plan mở hội thoại. Input đã được route lọc org + nick-scope (chỉ truyền vào
 * conv/friend mà user ĐƯỢC PHÉP xem/gửi). Hàm KHÔNG tự lọc quyền.
 */
export function resolveContactConversationPlan(input: {
  conversations: ConversationCandidate[];
  friends: FriendCandidate[];
}): ContactConversationPlan {
  const { conversations, friends } = input;

  // 1. Ưu tiên Conversation đã có → mới nhất.
  if (conversations.length > 0) {
    let best = conversations[0];
    for (const c of conversations) {
      if (toMs(c.lastMessageAt) > toMs(best.lastMessageAt)) best = c;
    }
    return { kind: 'conversation', convId: best.id };
  }

  // 2. Chưa có conv nào nhưng đã KB → Friend tương tác gần nhất.
  if (friends.length > 0) {
    let best = friends[0];
    for (const f of friends) {
      if (toMs(f.lastInteractionAt) > toMs(best.lastInteractionAt)) best = f;
    }
    return {
      kind: 'friend',
      friendId: best.id,
      nickId: best.zaloAccountId,
      externalThreadId: best.zaloUidInNick,
      contactId: best.contactId,
      globalId: best.zaloGlobalId,
    };
  }

  // 3. Không có gì.
  return { kind: 'none' };
}
