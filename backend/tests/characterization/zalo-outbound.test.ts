/**
 * PR-01 — Zalo characterization: OUTBOUND (POST /api/v1/conversations/:id/messages).
 *
 * Chốt hành vi hiện tại của đường sale gửi tin Zalo từ CRM: guard (404/409/400/403/429),
 * idempotency echoId, gọi zca-js sendMessage, lưu Message self/user, cập nhật conversation,
 * aggregate, emit realtime, xử lý Zalo từ chối (lưu failed) vs lỗi hệ thống (500).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockPrisma, mockIO } from '../test-helpers.js';

const h = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getInstance: vi.fn(),
  checkLimits: vi.fn(),
  recordSend: vi.fn(),
  emitChatMessage: vi.fn(),
  applyContactAggregateFromMessage: vi.fn(),
  applyFriendAggregate: vi.fn(),
  getUserFullName: vi.fn(),
  triggerVirtualChatAiReply: vi.fn(),
  attachContactCollaboratorByUser: vi.fn(),
  user: { id: 'user-1', orgId: 'org-1', email: 'test@example.com', role: 'admin' } as Record<string, unknown>,
}));

const prismaMock = mockPrisma();

vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(h.user); },
}));
vi.mock('../../src/modules/zalo/zalo-access-middleware.js', () => ({ requireZaloAccess: () => async () => {} }));
vi.mock('../../src/modules/zalo/zalo-pool.js', () => ({ zaloPool: { getInstance: h.getInstance } }));
vi.mock('../../src/modules/zalo/zalo-rate-limiter.js', () => ({
  zaloRateLimiter: { checkLimits: h.checkLimits, recordSend: h.recordSend },
}));
vi.mock('../../src/shared/realtime/emit-chat.js', () => ({ emitChatMessage: h.emitChatMessage }));
vi.mock('../../src/modules/contacts/contact-aggregate.js', () => ({
  applyContactAggregateFromMessage: h.applyContactAggregateFromMessage,
  applyFriendAggregate: h.applyFriendAggregate,
}));
vi.mock('../../src/modules/chat/chat-helpers.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getUserFullName: h.getUserFullName,
}));
vi.mock('../../src/modules/ai/ai-virtual-chat-service.js', () => ({ triggerVirtualChatAiReply: h.triggerVirtualChatAiReply }));
vi.mock('../../src/modules/ai/ai-privacy-guard.js', () => ({ authorizeAiData: vi.fn().mockResolvedValue({}) }));
vi.mock('../../src/modules/contacts/contact-scope.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  attachContactCollaboratorByUser: h.attachContactCollaboratorByUser,
}));

const { chatRoutes } = await import('../../src/modules/chat/chat-routes.js');

const URL = '/api/v1/conversations/conv-1/messages';

function conv(overrides: Record<string, unknown> = {}, accountOverrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1', orgId: 'org-1', threadType: 'user', externalThreadId: 'uid-kh',
    zaloAccountId: 'za-1', contactId: 'c-1', isVirtual: false,
    zaloAccount: { id: 'za-1', zaloUid: 'uid-nick', privacyMode: 'sub', ownerUserId: 'owner-1', archivedAt: null, ...accountOverrides },
    ...overrides,
  };
}

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('io', mockIO());
  app.register(chatRoutes);
  return app;
}

const send = (payload: Record<string, unknown>) => buildApp().inject({ method: 'POST', url: URL, payload });

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 'user-1', orgId: 'org-1', email: 'test@example.com', role: 'admin' };
  prismaMock.conversation.findFirst.mockResolvedValue(conv());
  prismaMock.conversation.update.mockResolvedValue({});
  prismaMock.message.findUnique.mockResolvedValue(null);
  prismaMock.message.create.mockImplementation(async ({ data }: any) => ({ ...data, repliedBy: { id: 'user-1', fullName: 'Sale A', email: 'x' } }));
  h.getInstance.mockReturnValue({ api: { sendMessage: h.sendMessage } });
  h.sendMessage.mockResolvedValue({ message: { msgId: '7300000000000000099' }, attachment: [] });
  h.checkLimits.mockResolvedValue({ allowed: true });
  h.getUserFullName.mockResolvedValue('Sale A');
});

describe('Zalo outbound — guards', () => {
  it('400 khi content rỗng/chỉ khoảng trắng', async () => {
    const res = await send({ content: '   ' });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.conversation.findFirst).not.toHaveBeenCalled();
  });

  it('404 khi conversation không thuộc org của user (query có orgId)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValueOnce(null);
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.conversation.findFirst.mock.calls[0][0]).toEqual({
      where: { id: 'conv-1', orgId: 'org-1' }, include: { zaloAccount: true },
    });
  });

  it('409 NICK_ARCHIVED khi nick đã xóa — không gọi SDK', async () => {
    prismaMock.conversation.findFirst.mockResolvedValueOnce(conv({}, { archivedAt: new Date() }));
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('NICK_ARCHIVED');
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('400 khi nick chưa kết nối (không có instance.api)', async () => {
    h.getInstance.mockReturnValueOnce(undefined);
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Zalo account not connected' });
  });

  it('403 PRIVACY_LOCKED khi nick Riêng tư và người gửi không phải chủ nick', async () => {
    prismaMock.conversation.findFirst.mockResolvedValueOnce(conv({}, { privacyMode: 'main', ownerUserId: 'someone-else' }));
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('PRIVACY_LOCKED');
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('nick Riêng tư, người gửi là chủ nick → cho gửi', async () => {
    prismaMock.conversation.findFirst.mockResolvedValueOnce(conv({}, { privacyMode: 'main', ownerUserId: 'user-1' }));
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(200);
  });

  it('429 khi rate limiter chặn — trả reason, không gửi', async () => {
    h.checkLimits.mockResolvedValueOnce({ allowed: false, reason: 'Vượt giới hạn' });
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body)).toEqual({ error: 'Vượt giới hạn' });
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.recordSend).not.toHaveBeenCalled();
  });
});

describe('Zalo outbound — happy path 1-1 text', () => {
  it('gọi sendMessage({msg}, threadId, 0), ghi rate-limit, lưu Message self/user, cập nhật conv', async () => {
    const res = await send({ content: 'Chào anh' });
    expect(res.statusCode).toBe(200);

    expect(h.checkLimits).toHaveBeenCalledWith('za-1');
    expect(h.recordSend).toHaveBeenCalledWith('za-1');
    expect(h.sendMessage).toHaveBeenCalledWith({ msg: 'Chào anh' }, 'uid-kh', 0);

    const data = prismaMock.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      conversationId: 'conv-1',
      zaloMsgId: '7300000000000000099',
      senderType: 'self',
      senderUid: 'uid-nick',
      senderName: 'Staff',
      content: 'Chào anh',
      contentType: 'text',
      repliedByUserId: 'user-1',
      sentVia: 'user',
      clientEchoId: null,
      metadata: { sender: { kind: 'user_crm', name: 'Sale A' } },
    });
    expect(typeof data.zaloMsgIdNum).toBe('bigint');
    expect(data.metadata.sendStatus).toBeUndefined();

    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { lastMessageAt: expect.any(Date), isReplied: true, unreadCount: 0 },
    });

    const body = JSON.parse(res.body);
    expect(body.zaloMsgIdNum).toBe('7300000000000000099'); // BigInt → string
    expect(body.echoId).toBeNull();
  });

  it('aggregate outbound (kèm outboundUserId) + emitChatMessage theo privacy của nick', async () => {
    await send({ content: 'Chào anh' });
    expect(h.applyContactAggregateFromMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-1', outboundUserId: 'user-1', message: expect.objectContaining({ senderType: 'self' }),
    }));
    expect(h.applyFriendAggregate).toHaveBeenCalledTimes(1);
    expect(h.emitChatMessage).toHaveBeenCalledTimes(1);
    expect(h.emitChatMessage.mock.calls[0][0]).toMatchObject({
      orgId: 'org-1', accountId: 'za-1', conversationId: 'conv-1', privacyMode: 'sub', ownerUserId: 'owner-1',
    });
    expect(h.emitChatMessage.mock.calls[0][0].extra).toBeUndefined();
  });

  it('group: threadType=1 và mentions được truyền; styles → lưu contentType=rich', async () => {
    prismaMock.conversation.findFirst.mockResolvedValueOnce(conv({ threadType: 'group', externalThreadId: 'grp-1' }));
    const styles = [{ st: 'b', start: 0, len: 3 }];
    const mentions = [{ uid: 'u-9', pos: 0, len: 3 }];
    await send({ content: '@An hi', styles, mentions });
    expect(h.sendMessage).toHaveBeenCalledWith({ msg: '@An hi', styles, mentions }, 'grp-1', 1);
    const data = prismaMock.message.create.mock.calls[0][0].data;
    expect(data.contentType).toBe('rich');
    expect(JSON.parse(data.content)).toEqual({ title: '@An hi', action: 'rtf', params: JSON.stringify({ styles }) });
  });

  it('mentions bị bỏ qua với hội thoại 1-1', async () => {
    await send({ content: 'hi', mentions: [{ uid: 'u', pos: 0, len: 1 }] });
    expect(h.sendMessage).toHaveBeenCalledWith({ msg: 'hi' }, 'uid-kh', 0);
  });
});

describe('Zalo outbound — idempotency echoId', () => {
  it('echoId đã tồn tại → trả tin cũ, KHÔNG gửi Zalo lại', async () => {
    prismaMock.message.findUnique.mockResolvedValueOnce({ id: 'm-old', zaloMsgIdNum: 123n, content: 'hi' });
    const res = await send({ content: 'hi', echoId: 'echo-1' });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.message.findUnique.mock.calls[0][0].where).toEqual({
      conversationId_clientEchoId: { conversationId: 'conv-1', clientEchoId: 'echo-1' },
    });
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
    expect(JSON.parse(res.body)).toMatchObject({ id: 'm-old', zaloMsgIdNum: '123', echoId: 'echo-1' });
  });

  it('clientMessageId (app cũ) được dùng làm echoId và truyền vào emit extra', async () => {
    const res = await send({ content: 'hi', clientMessageId: 'cm-1' });
    expect(prismaMock.message.create.mock.calls[0][0].data.clientEchoId).toBe('cm-1');
    expect(h.emitChatMessage.mock.calls[0][0].extra).toEqual({ echoId: 'cm-1' });
    expect(JSON.parse(res.body).echoId).toBe('cm-1');
  });

  it('race P2002 khi create với echoId → trả tin của request thắng', async () => {
    prismaMock.message.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'm-winner', zaloMsgIdNum: null });
    prismaMock.message.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await send({ content: 'hi', echoId: 'echo-2' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ id: 'm-winner', echoId: 'echo-2' });
  });
});

describe('Zalo outbound — lỗi gửi', () => {
  it('Zalo từ chối (ZaloApiError) → 200, lưu tin metadata.sendStatus=failed + failCode, không aggregate', async () => {
    h.sendMessage.mockRejectedValueOnce(Object.assign(new Error('sendMessage failed: Người này chặn không nhận tin từ người lạ [zalo:119]'), { name: 'ZaloApiError' }));
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(200);
    const data = prismaMock.message.create.mock.calls[0][0].data;
    expect(data.zaloMsgId).toBeNull();
    expect(data.metadata).toMatchObject({
      sendStatus: 'failed', failReason: 'Người này chặn không nhận tin từ người lạ', failCode: '119',
    });
    expect(h.applyContactAggregateFromMessage).not.toHaveBeenCalled();
    expect(h.applyFriendAggregate).not.toHaveBeenCalled();
    expect(h.emitChatMessage).toHaveBeenCalledTimes(1);
  });

  it('lỗi hệ thống (không phải Zalo) → 500, không lưu message', async () => {
    h.sendMessage.mockRejectedValueOnce(new Error('ECONNRESET'));
    const res = await send({ content: 'hi' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'Không gửi được tin nhắn, vui lòng thử lại' });
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it('reply quote: tin gốc không có → 404, không gửi', async () => {
    prismaMock.message.findFirst.mockResolvedValueOnce(null);
    const res = await send({ content: 'hi', replyMessageId: 'nope' });
    expect(res.statusCode).toBe(404);
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});

describe('Zalo outbound — hội thoại ảo (KH không có Zalo)', () => {
  it('lưu local:<uuid>, isLocal=true, KHÔNG gọi SDK/rate limiter, emit extra._virtual', async () => {
    prismaMock.conversation.findFirst.mockResolvedValueOnce(conv({ isVirtual: true }));
    h.getInstance.mockReturnValue(undefined);
    const res = await send({ content: 'ghi chú' });
    expect(res.statusCode).toBe(200);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.checkLimits).not.toHaveBeenCalled();
    const data = prismaMock.message.create.mock.calls[0][0].data;
    expect(data.zaloMsgId).toMatch(/^local:[0-9a-f-]{36}$/);
    expect(data).toMatchObject({ isLocal: true, senderType: 'self', sentVia: 'user', content: 'ghi chú' });
    expect(h.emitChatMessage.mock.calls[0][0].extra).toEqual({ _virtual: true });
  });
});
