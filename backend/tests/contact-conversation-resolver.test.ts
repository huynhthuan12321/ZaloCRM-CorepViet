// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test cho resolveContactConversationPlan (hàm thuần, không DB).
import { describe, it, expect } from 'vitest';
import { resolveContactConversationPlan } from '../src/modules/chat/contact-conversation-resolver.js';

const friend = (over: Partial<Parameters<typeof resolveContactConversationPlan>[0]['friends'][number]> = {}) => ({
  id: 'f1', zaloAccountId: 'nick-1', zaloUidInNick: 'uid-1', contactId: 'c1',
  zaloGlobalId: null, lastInteractionAt: null, ...over,
});

describe('resolveContactConversationPlan', () => {
  it('nhánh 1: có nhiều Conversation → chọn conv mới nhất (lastMessageAt desc)', () => {
    const plan = resolveContactConversationPlan({
      conversations: [
        { id: 'conv-old', lastMessageAt: '2026-07-01T00:00:00Z' },
        { id: 'conv-new', lastMessageAt: '2026-07-10T00:00:00Z' },
        { id: 'conv-null', lastMessageAt: null },
      ],
      friends: [friend()],
    });
    expect(plan).toEqual({ kind: 'conversation', convId: 'conv-new' });
  });

  it('nhánh 1b: conv có lastMessageAt=null vẫn được chọn nếu là conv duy nhất', () => {
    const plan = resolveContactConversationPlan({
      conversations: [{ id: 'conv-x', lastMessageAt: null }],
      friends: [],
    });
    expect(plan).toEqual({ kind: 'conversation', convId: 'conv-x' });
  });

  it('nhánh 2: 0 conv nhưng có Friend (ca Hà Phạm) → chọn friend tương tác gần nhất', () => {
    const plan = resolveContactConversationPlan({
      conversations: [],
      friends: [
        friend({ id: 'f-old', zaloAccountId: 'nick-a', zaloUidInNick: 'uid-a', lastInteractionAt: '2026-06-01T00:00:00Z' }),
        friend({ id: 'f-new', zaloAccountId: 'nick-b', zaloUidInNick: 'uid-b', zaloGlobalId: 'g-b', lastInteractionAt: '2026-07-05T00:00:00Z' }),
      ],
    });
    expect(plan).toEqual({
      kind: 'friend', friendId: 'f-new', nickId: 'nick-b',
      externalThreadId: 'uid-b', contactId: 'c1', globalId: 'g-b',
    });
  });

  it('nhánh 2b: friend đều lastInteractionAt=null → chọn friend đầu tiên (ổn định)', () => {
    const plan = resolveContactConversationPlan({
      conversations: [],
      friends: [friend({ id: 'f-first' }), friend({ id: 'f-second', zaloAccountId: 'nick-2' })],
    });
    expect(plan).toMatchObject({ kind: 'friend', friendId: 'f-first' });
  });

  it('nhánh 3: rỗng cả hai → none', () => {
    const plan = resolveContactConversationPlan({ conversations: [], friends: [] });
    expect(plan).toEqual({ kind: 'none' });
  });

  it('ưu tiên Conversation hơn Friend kể cả khi Friend tương tác mới hơn', () => {
    const plan = resolveContactConversationPlan({
      conversations: [{ id: 'conv-1', lastMessageAt: '2026-01-01T00:00:00Z' }],
      friends: [friend({ lastInteractionAt: '2026-07-30T00:00:00Z' })],
    });
    expect(plan).toEqual({ kind: 'conversation', convId: 'conv-1' });
  });
});
