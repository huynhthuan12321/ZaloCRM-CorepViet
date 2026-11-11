import type { Conversation, Message } from '@/composables/use-chat';

/** Dữ liệu giả hoàn toàn (không có token/SĐT/tin nhắn khách thật). */
export function makeConversation(id: string, name: string, extra: Record<string, unknown> = {}): Conversation {
  return {
    id,
    threadType: 'user',
    contact: {
      id: `contact-${id}`,
      fullName: name,
      phone: null,
      avatarUrl: null,
      assignedUserId: 'u-owner',
      assignedUser: { id: 'u-owner', fullName: 'Lan Phụ Trách' },
      contactAccess: [
        { role: 'primary', source: 'x', createdAt: '2026-01-01', user: { id: 'u-owner', fullName: 'Lan Phụ Trách', email: null } },
        { role: 'collaborator', source: 'x', createdAt: '2026-01-02', user: { id: 'u-2', fullName: 'Minh', email: null } },
        { role: 'collaborator', source: 'x', createdAt: '2026-01-03', user: { id: 'u-3', fullName: 'Hoa', email: null } },
      ],
    },
    zaloAccount: { id: `nick-${id}`, displayName: 'Nick Bán Hàng 1', avatarUrl: null },
    externalThreadId: `thread-${id}`,
    lastMessageAt: '2026-11-08T01:00:00.000Z',
    unreadCount: 0,
    isReplied: true,
    messages: [],
    ...extra,
  } as unknown as Conversation;
}

export function makeMessage(id: string, content: string, senderType: 'self' | 'contact' = 'contact', extra: Record<string, unknown> = {}): Message {
  return {
    id,
    content,
    contentType: 'text',
    senderType,
    senderName: senderType === 'self' ? 'Tôi' : 'Khách',
    sentAt: '2026-11-08T01:00:00.000Z',
    isDeleted: false,
    zaloMsgId: null,
    albumKey: null,
    albumIndex: null,
    albumTotal: null,
    ...extra,
  } as Message;
}
