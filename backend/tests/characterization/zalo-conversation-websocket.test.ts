/**
 * PR-01 — Zalo characterization: CONVERSATION resolver + WEBSOCKET emit.
 *
 * Chốt hành vi hiện tại của:
 *   - conversation-resolver.ts (chống xé hội thoại 1-1 theo UID / globalId / contactId)
 *   - shared/realtime/emit-chat.ts (room scoping org:/user:, redact nick Riêng tư)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: {
    conversation: { findFirst: vi.fn(), create: vi.fn() },
    friend: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  hasActivePrivacySession: vi.fn(),
  redactMessage: vi.fn((m: any) => ({ ...m, content: '•••', redacted: true })),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: h.prisma }));
vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/modules/privacy/session-service.js', () => ({ hasActivePrivacySession: h.hasActivePrivacySession }));
vi.mock('../../src/modules/privacy/redact.js', () => ({ redactMessage: h.redactMessage }));

const resolver = await import('../../src/modules/chat/conversation-resolver.js');
const { emitChatMessage } = await import('../../src/shared/realtime/emit-chat.js');

const base = { orgId: 'org-1', nickId: 'za-1', externalThreadId: 'uid-1', contactId: 'c-1' };

beforeEach(() => {
  vi.clearAllMocks();
  h.prisma.conversation.findFirst.mockResolvedValue(null);
  h.prisma.friend.findFirst.mockResolvedValue(null);
  h.prisma.friend.findMany.mockResolvedValue([]);
  h.prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });
});

describe('conversation-resolver — findExistingUserConversation', () => {
  it('bước 1: khớp (nick, externalThreadId, threadType=user)', async () => {
    h.prisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-uid' });
    expect(await resolver.findExistingUserConversation(base)).toBe('conv-uid');
    expect(h.prisma.conversation.findFirst.mock.calls[0][0].where).toEqual({
      zaloAccountId: 'za-1', externalThreadId: 'uid-1', threadType: 'user',
    });
  });

  it('bước 2: globalId (tra từ Friend) → hội thoại của UID anh-em trên CÙNG nick', async () => {
    h.prisma.friend.findFirst.mockResolvedValueOnce({ zaloGlobalId: 'g-1' });
    h.prisma.friend.findMany.mockResolvedValueOnce([{ zaloUidInNick: 'uid-drift' }]);
    h.prisma.conversation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'conv-drift' });
    expect(await resolver.findExistingUserConversation(base)).toBe('conv-drift');
    expect(h.prisma.friend.findMany.mock.calls[0][0].where).toEqual({
      zaloAccountId: 'za-1', zaloGlobalId: 'g-1', zaloUidInNick: { not: 'uid-1' },
    });
    expect(h.prisma.conversation.findFirst.mock.calls[1][0].where).toEqual({
      zaloAccountId: 'za-1', externalThreadId: { in: ['uid-drift'] }, threadType: 'user',
    });
  });

  it('globalId do caller truyền → không tra Friend.findFirst', async () => {
    await resolver.findExistingUserConversation({ ...base, globalId: 'g-x' });
    expect(h.prisma.friend.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.friend.findMany).toHaveBeenCalled();
  });

  it('bước 3: fallback theo contactId trên nick', async () => {
    h.prisma.conversation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'conv-contact' });
    expect(await resolver.findExistingUserConversation(base)).toBe('conv-contact');
    expect(h.prisma.conversation.findFirst.mock.calls[1][0].where).toEqual({
      zaloAccountId: 'za-1', contactId: 'c-1', threadType: 'user',
    });
  });

  it('không có gì → null', async () => {
    expect(await resolver.findExistingUserConversation({ ...base, contactId: null })).toBeNull();
  });
});

describe('conversation-resolver — create', () => {
  it('ensureUserConversation tạo conv rỗng lastMessageAt=null, unread=0, isReplied=false', async () => {
    const r = await resolver.ensureUserConversation(base);
    expect(r).toEqual({ convId: 'conv-new', created: true });
    expect(h.prisma.conversation.create.mock.calls[0][0].data).toEqual({
      orgId: 'org-1', zaloAccountId: 'za-1', contactId: 'c-1', threadType: 'user',
      externalThreadId: 'uid-1', lastMessageAt: null, unreadCount: 0, isReplied: false,
    });
  });

  it('ensureUserConversation có sẵn → created=false', async () => {
    h.prisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-uid' });
    expect(await resolver.ensureUserConversation(base)).toEqual({ convId: 'conv-uid', created: false });
    expect(h.prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('resolveOrCreateUserConversation tạo với orgId + nick + threadType=user', async () => {
    expect(await resolver.resolveOrCreateUserConversation(base)).toBe('conv-new');
    expect(h.prisma.conversation.create.mock.calls[0][0].data).toMatchObject({
      orgId: 'org-1', zaloAccountId: 'za-1', externalThreadId: 'uid-1', threadType: 'user', contactId: 'c-1',
    });
  });
});

function io() {
  const emits: Array<{ room: string; event: string; payload: any }> = [];
  const server: any = {
    emit: vi.fn(),
    to: vi.fn((room: string) => ({ emit: (event: string, payload: any) => emits.push({ room, event, payload }) })),
  };
  return { server, emits };
}

describe('websocket — emitChatMessage', () => {
  const msg = { id: 'm-1', content: 'nội dung thật' };

  it('io null → no-op', async () => {
    await expect(emitChatMessage({
      io: null, orgId: 'org-1', accountId: 'za-1', conversationId: 'conv-1', message: msg, privacyMode: 'sub', ownerUserId: null,
    })).resolves.toBeUndefined();
  });

  it('nick Thường (sub): emit nguyên bản chỉ tới room org:<orgId>, không io.emit bare', async () => {
    const { server, emits } = io();
    await emitChatMessage({
      io: server, orgId: 'org-1', accountId: 'za-1', conversationId: 'conv-1', message: msg,
      privacyMode: 'sub', ownerUserId: 'u-owner', extra: { mentions: [] },
    });
    expect(server.emit).not.toHaveBeenCalled();
    expect(emits).toEqual([{
      room: 'org:org-1', event: 'chat:message',
      payload: {
        accountId: 'za-1', conversationId: 'conv-1', mentions: [], message: msg,
        _privacyMeta: { privacyMode: 'sub', ownerUserId: 'u-owner' },
      },
    }]);
    expect(h.redactMessage).not.toHaveBeenCalled();
  });

  it('nick Riêng tư (main), owner chưa unlock: room org nhận bản redact, không có room user', async () => {
    h.hasActivePrivacySession.mockResolvedValueOnce(false);
    const { server, emits } = io();
    await emitChatMessage({
      io: server, orgId: 'org-1', accountId: 'za-1', conversationId: 'conv-1', message: msg,
      privacyMode: 'main', ownerUserId: 'u-owner',
    });
    expect(emits).toHaveLength(1);
    expect(emits[0].room).toBe('org:org-1');
    expect(emits[0].payload.message).toMatchObject({ redacted: true, content: '•••' });
    expect(h.hasActivePrivacySession).toHaveBeenCalledWith('u-owner');
  });

  it('nick Riêng tư, owner đã unlock: thêm bản thật ở room user:<ownerId>', async () => {
    h.hasActivePrivacySession.mockResolvedValueOnce(true);
    const { server, emits } = io();
    await emitChatMessage({
      io: server, orgId: 'org-1', accountId: 'za-1', conversationId: 'conv-1', message: msg,
      privacyMode: 'main', ownerUserId: 'u-owner',
    });
    expect(emits.map((e) => e.room)).toEqual(['org:org-1', 'user:u-owner']);
    expect(emits[1].payload.message).toEqual(msg);
  });

  it('check session lỗi → vẫn giữ bản redact ở room org, không throw', async () => {
    h.hasActivePrivacySession.mockRejectedValueOnce(new Error('redis down'));
    const { server, emits } = io();
    await emitChatMessage({
      io: server, orgId: 'org-1', accountId: 'za-1', conversationId: 'conv-1', message: msg,
      privacyMode: 'main', ownerUserId: 'u-owner',
    });
    expect(emits.map((e) => e.room)).toEqual(['org:org-1']);
  });
});
