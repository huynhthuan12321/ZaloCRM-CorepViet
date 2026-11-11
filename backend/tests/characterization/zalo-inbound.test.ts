/**
 * PR-01 — Zalo characterization: INBOUND (message-handler.handleIncomingMessage).
 *
 * Mục đích: CHỐT hành vi HIỆN TẠI của luồng tin Zalo vào, làm baseline trước khi thêm
 * Messenger (PR-02a+). Test mô tả "đang chạy thế nào", KHÔNG phải "nên chạy thế nào".
 * Nếu PR sau làm đỏ test này → hoặc là regression Zalo, hoặc là thay đổi có chủ đích
 * (phải cập nhật test + ghi rõ trong PR report).
 *
 * Mock toàn bộ biên I/O (prisma, bridge, webhook, automation, storage). Không cần DB/Redis.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const prisma = {
    zaloAccount: { findUnique: vi.fn(), findFirst: vi.fn() },
    contact: {
      findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(),
    },
    friend: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    conversation: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: {
      findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(),
      updateMany: vi.fn(), count: vi.fn(),
    },
    organization: { findUnique: vi.fn() },
  };
  return {
    prisma,
    publishMessagePersisted: vi.fn(),
    emitWebhook: vi.fn(),
    runAutomationRules: vi.fn(),
    busEmit: vi.fn(),
    applyContactAggregateFromMessage: vi.fn(),
    applyFriendAggregate: vi.fn(),
    applyContactInteraction: vi.fn(),
    followMergedInto: vi.fn(),
    findExistingUserConversation: vi.fn(),
    safeContactCreate: vi.fn(),
    safeContactUpdate: vi.fn(),
    captureZaloProfile: vi.fn(),
    syncReminderFromMessage: vi.fn(),
  };
});

vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: h.prisma }));
vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/shared/database/safe-contact-write.js', () => ({
  safeContactCreate: h.safeContactCreate, safeContactUpdate: h.safeContactUpdate,
}));
vi.mock('../../src/shared/bridge-bus.js', () => ({ publishMessagePersisted: h.publishMessagePersisted }));
vi.mock('../../src/modules/api/webhook-service.js', () => ({ emitWebhook: h.emitWebhook }));
vi.mock('../../src/shared/ee-registry/automation.js', () => ({ runAutomationRules: h.runAutomationRules }));
vi.mock('../../src/shared/ee-registry/event-bus.js', () => ({ automationEventBus: { emit: h.busEmit } }));
vi.mock('../../src/modules/contacts/contact-aggregate.js', () => ({
  applyContactAggregateFromMessage: h.applyContactAggregateFromMessage,
  applyFriendAggregate: h.applyFriendAggregate,
  applyContactInteraction: h.applyContactInteraction,
}));
vi.mock('../../src/modules/contacts/resolve-contact.js', () => ({ followMergedInto: h.followMergedInto }));
vi.mock('../../src/modules/chat/conversation-resolver.js', () => ({
  findExistingUserConversation: h.findExistingUserConversation,
}));
vi.mock('../../src/modules/contacts/zalo-profile-capture.js', () => ({ captureZaloProfile: h.captureZaloProfile }));
vi.mock('../../src/modules/scoring/scoring-hooks.js', () => ({ onInboundMessage: vi.fn(), onOutboundMessage: vi.fn() }));
vi.mock('../../src/modules/contacts/reminder-sync.js', () => ({ syncReminderFromMessage: h.syncReminderFromMessage }));
vi.mock('../../src/modules/engagement/engagement-service.js', () => ({
  incrementDailyAggregate: vi.fn(), messageEngagementInputs: vi.fn(() => ({})), parseCallMeta: vi.fn(),
}));
vi.mock('../../src/shared/storage/minio-client.js', () => ({ uploadBuffer: vi.fn() }));
vi.mock('../../src/modules/media/media-service.js', () => ({ compressImage: vi.fn() }));

const { handleIncomingMessage, handleMessageUndo } = await import('../../src/modules/chat/message-handler.js');

type Msg = Parameters<typeof handleIncomingMessage>[0];

function inbound(overrides: Partial<Msg> = {}): Msg {
  return {
    accountId: 'za-1',
    senderUid: 'uid-kh',
    senderName: 'KH Zalo',
    content: 'xin chào',
    contentType: 'text',
    msgId: '7300000000000000001',
    cliMsgId: '1700000000001',
    timestamp: 1_760_000_000_000,
    isSelf: false,
    threadId: 'uid-kh',
    threadType: 'user',
    ...overrides,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CONTACT_RESOLVE_FRIEND_FIRST;
  const p = h.prisma;
  p.zaloAccount.findUnique.mockResolvedValue({
    orgId: 'org-1', ownerUserId: 'owner-1', displayName: 'Nick Sale 1', owner: { fullName: 'Sale A' },
  });
  p.zaloAccount.findFirst.mockResolvedValue(null);
  p.friend.findFirst.mockResolvedValue(null);
  p.friend.findUnique.mockResolvedValue(null);
  p.contact.findFirst.mockResolvedValue(null);
  p.contact.findUnique.mockResolvedValue({ id: 'c-1', fullName: 'KH Zalo', assignedUserId: null });
  p.contact.update.mockResolvedValue({});
  p.contact.updateMany.mockResolvedValue({ count: 0 });
  h.safeContactCreate.mockResolvedValue({ id: 'c-new', fullName: 'KH Zalo', zaloGlobalId: null, zaloUid: 'uid-kh' });
  p.conversation.findFirst.mockResolvedValue(null);
  h.findExistingUserConversation.mockResolvedValue(null);
  p.conversation.create.mockResolvedValue({ id: 'conv-new' });
  p.conversation.update.mockResolvedValue({});
  p.conversation.findUnique.mockResolvedValue({
    id: 'conv-new', unreadCount: 1, externalThreadId: 'uid-kh', threadType: 'user', zaloAccountId: 'za-1', contactId: 'c-new',
  });
  p.message.create.mockImplementation(async ({ data }: any) => ({ ...data, isDeleted: false, deletedAt: null, repliedByUserId: null, createdAt: new Date() }));
  p.message.findFirst.mockResolvedValue(null);
  p.message.count.mockResolvedValue(0);
  p.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Org' });
});

describe('Zalo inbound — account guard', () => {
  it('trả null và không ghi gì khi zaloAccount không tồn tại', async () => {
    h.prisma.zaloAccount.findUnique.mockResolvedValueOnce(null);
    const res = await handleIncomingMessage(inbound());
    expect(res).toBeNull();
    expect(h.prisma.message.create).not.toHaveBeenCalled();
  });

  it('nuốt exception và trả null (không throw ra listener)', async () => {
    h.prisma.zaloAccount.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(handleIncomingMessage(inbound())).resolves.toBeNull();
  });
});

describe('Zalo inbound — tin KH 1-1 (text) lần đầu', () => {
  it('tạo contact → tạo conversation → lưu message senderType=contact, org lấy từ account', async () => {
    const res = await handleIncomingMessage(inbound());

    expect(h.safeContactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org-1', zaloUid: 'uid-kh', fullName: 'KH Zalo', zaloGlobalId: null }),
      }),
      'message-upsert',
    );
    expect(h.emitWebhook).toHaveBeenCalledWith('org-1', 'contact.created', { contactId: 'c-new', fullName: 'KH Zalo' });

    expect(h.findExistingUserConversation).toHaveBeenCalledWith({
      orgId: 'org-1', nickId: 'za-1', externalThreadId: 'uid-kh', contactId: 'c-new', globalId: undefined,
    });
    expect(h.prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: 'org-1', zaloAccountId: 'za-1', contactId: 'c-new', threadType: 'user',
        externalThreadId: 'uid-kh', unreadCount: 1, isReplied: false, groupName: null,
      }),
      select: { id: true },
    });

    const data = h.prisma.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      conversationId: 'conv-new',
      zaloMsgId: '7300000000000000001',
      zaloMsgIdNum: 7300000000000000001n,
      zaloCliMsgId: '1700000000001',
      senderType: 'contact',
      senderUid: 'uid-kh',
      senderName: 'KH Zalo',
      content: 'xin chào',
      contentType: 'text',
      attachments: [],
      sentAt: new Date(1_760_000_000_000),
    });
    // Tin KH KHÔNG gắn sentVia/metadata.sender (badge chỉ cho outbound).
    expect(data.sentVia).toBeUndefined();
    expect(data.metadata).toBeUndefined();

    expect(res).toMatchObject({ conversationId: 'conv-new', orgId: 'org-1', contactId: 'c-new' });
  });

  it('cập nhật conversation: unreadCount +1, isReplied=false, lastMessageAt=sentAt', async () => {
    await handleIncomingMessage(inbound());
    expect(h.prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-new' },
      data: { lastMessageAt: new Date(1_760_000_000_000), unreadCount: { increment: 1 }, isReplied: false },
    });
  });

  it('side effects: bridge publish, aggregate contact+friend, webhook message.received, automation', async () => {
    await handleIncomingMessage(inbound());
    await flush();
    const msgId = h.prisma.message.create.mock.calls[0][0].data.id;
    expect(h.publishMessagePersisted).toHaveBeenCalledWith({ messageId: msgId, conversationId: 'conv-new' });
    expect(h.applyContactAggregateFromMessage).toHaveBeenCalledTimes(1);
    expect(h.applyFriendAggregate).toHaveBeenCalledTimes(1);
    expect(h.applyContactAggregateFromMessage.mock.calls[0][0]).toMatchObject({
      conversationId: 'conv-new', message: { id: msgId, senderType: 'contact', contentType: 'text' },
    });
    expect(h.emitWebhook).toHaveBeenCalledWith('org-1', 'message.received', expect.objectContaining({
      messageId: msgId, conversationId: 'conv-new', senderUid: 'uid-kh', content: 'xin chào',
    }));
    expect(h.runAutomationRules).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'message_received', orgId: 'org-1' }));

    const types = h.busEmit.mock.calls.map((c) => c[0].type);
    expect(types).toContain('customer_reply');
    expect(types).toContain('message_received');
    expect(types).toContain('first_message_received');
    expect(types).toContain('keyword_match');
    for (const c of h.busEmit.mock.calls) expect(c[0].orgId).toBe('org-1');
  });

  it('gắn senderResolved (case A — người ngoài, fallback tên Zalo) vào message trả về', async () => {
    const res = await handleIncomingMessage(inbound());
    expect((res!.message as any).senderResolved).toEqual({
      senderDisplayName: 'KH Zalo',
      senderCrmName: null,
      senderZaloName: 'KH Zalo',
      senderIsInternalNick: false,
      senderInternalNickLabel: null,
      senderInternalNickOwner: null,
      senderInternalNickOwnerId: null,
      senderCase: 'A',
    });
  });
});

describe('Zalo inbound — backfill (old_messages)', () => {
  it('isBackfill=true: vẫn lưu message nhưng KHÔNG webhook message.* / automation', async () => {
    const res = await handleIncomingMessage(inbound({ isBackfill: true }));
    expect(res).not.toBeNull();
    expect(h.prisma.message.create).toHaveBeenCalledTimes(1);
    expect(h.emitWebhook).not.toHaveBeenCalledWith('org-1', 'message.received', expect.anything());
    expect(h.runAutomationRules).not.toHaveBeenCalled();
    expect(h.busEmit).not.toHaveBeenCalled();
  });
});

describe('Zalo inbound — dedup', () => {
  it('P2002 (zaloMsgId trùng) → trả null, backfill cliMsgId, không cập nhật conversation', async () => {
    h.prisma.message.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    h.prisma.message.updateMany.mockResolvedValue({ count: 1 });
    const res = await handleIncomingMessage(inbound());
    expect(res).toBeNull();
    expect(h.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { zaloMsgId: '7300000000000000001', zaloCliMsgId: null },
      data: { zaloCliMsgId: '1700000000001' },
    });
    expect(h.prisma.conversation.update).not.toHaveBeenCalled();
    // tin KH (không phải self) → không publish bridge
    expect(h.publishMessagePersisted).not.toHaveBeenCalled();
  });

  it('self echo text trùng nội dung trong 30s → không tạo message, gán zaloMsgId cho row CRM, publish bridge', async () => {
    h.prisma.message.findFirst.mockResolvedValueOnce({ id: 'm-crm', zaloMsgId: null });
    h.prisma.message.update.mockResolvedValue({});
    const res = await handleIncomingMessage(inbound({ isSelf: true, senderUid: 'uid-nick' }));
    expect(res).toBeNull();
    expect(h.prisma.message.create).not.toHaveBeenCalled();
    expect(h.prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'm-crm' },
      data: { zaloMsgId: '7300000000000000001', zaloMsgIdNum: 7300000000000000001n },
    });
    expect(h.prisma.message.update).toHaveBeenCalledWith({ where: { id: 'm-crm' }, data: { zaloCliMsgId: '1700000000001' } });
    expect(h.publishMessagePersisted).toHaveBeenCalledWith({ messageId: 'm-crm', conversationId: 'conv-new' });
  });

  it('self echo ảnh → claim placeholder nguyên tử bằng updateMany(zaloMsgId=null); claim được → null', async () => {
    h.prisma.message.updateMany.mockResolvedValueOnce({ count: 1 });
    h.prisma.message.findFirst.mockResolvedValueOnce({ id: 'm-placeholder' });
    const res = await handleIncomingMessage(inbound({ isSelf: true, contentType: 'image', content: '{}' }));
    expect(res).toBeNull();
    expect(h.prisma.message.updateMany.mock.calls[0][0].where).toMatchObject({
      conversationId: 'conv-new', senderType: 'self', contentType: 'image', zaloMsgId: null,
    });
    expect(h.prisma.message.create).not.toHaveBeenCalled();
  });
});

describe('Zalo inbound — tin self gõ trên app Zalo (native)', () => {
  it('lưu senderType=self, sentVia=user_native, metadata.sender tên chủ nick; conv isReplied=true unread=0', async () => {
    h.prisma.message.findFirst.mockResolvedValue(null); // không có row CRM trùng
    await handleIncomingMessage(inbound({ isSelf: true, senderUid: 'uid-nick', recipientName: 'KH Zalo' }));
    const data = h.prisma.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      senderType: 'self',
      sentVia: 'user_native',
      metadata: { sender: { kind: 'user_native', name: 'Sale A', syncedFromNative: true } },
    });
    expect(h.prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-new' },
      data: { lastMessageAt: new Date(1_760_000_000_000), isReplied: true, unreadCount: 0 },
    });
    await flush();
    expect(h.emitWebhook).toHaveBeenCalledWith('org-1', 'message.sent', expect.anything());
    expect(h.runAutomationRules).not.toHaveBeenCalled();
    // contact của tin self = người nhận (threadId)
    expect(h.safeContactCreate.mock.calls[0][0].data).toMatchObject({ zaloUid: 'uid-kh', fullName: 'KH Zalo' });
  });
});

describe('Zalo inbound — contact resolution', () => {
  it('Friend-first: (nick, uid) đã có Friend → dùng contact của Friend, không tạo contact mới', async () => {
    h.prisma.friend.findFirst.mockResolvedValueOnce({
      contact: { id: 'c-friend', mergedInto: null, zaloGlobalId: 'g-1', zaloUsername: null, fullName: 'Anh B', zaloUid: 'uid-kh' },
    });
    const res = await handleIncomingMessage(inbound({ contactGlobalId: 'g-1' }));
    expect(h.prisma.friend.findFirst.mock.calls[0][0].where).toEqual({ orgId: 'org-1', zaloAccountId: 'za-1', zaloUidInNick: 'uid-kh' });
    expect(h.safeContactCreate).not.toHaveBeenCalled();
    expect(res!.contactId).toBe('c-friend');
  });

  it('Friend-first: contact đã merge → theo mergedInto về contact gốc', async () => {
    h.prisma.friend.findFirst.mockResolvedValueOnce({
      contact: { id: 'c-old', mergedInto: 'c-root', zaloGlobalId: null, zaloUsername: null, fullName: 'X', zaloUid: 'uid-kh' },
    });
    h.followMergedInto.mockResolvedValueOnce({ id: 'c-root' });
    const res = await handleIncomingMessage(inbound());
    expect(h.followMergedInto).toHaveBeenCalledWith('c-old');
    expect(res!.contactId).toBe('c-root');
  });

  it('CONTACT_RESOLVE_FRIEND_FIRST=off → bỏ Friend lookup, match theo globalId (org-scoped)', async () => {
    process.env.CONTACT_RESOLVE_FRIEND_FIRST = 'off';
    h.prisma.contact.findFirst.mockResolvedValueOnce({ id: 'c-g', fullName: 'Unknown', zaloGlobalId: 'g-9', zaloUid: 'uid-kh' });
    const res = await handleIncomingMessage(inbound({ contactGlobalId: 'g-9' }));
    expect(h.prisma.friend.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ zaloAccountId: 'za-1' }) }));
    expect(h.prisma.contact.findFirst.mock.calls[0][0].where).toEqual({ orgId: 'org-1', zaloGlobalId: 'g-9' });
    // fullName 'Unknown' được backfill bằng tên thật
    expect(h.safeContactUpdate).toHaveBeenCalledWith('c-g', { fullName: 'KH Zalo' }, 'message-upsert');
    expect(res!.contactId).toBe('c-g');
  });
});

describe('Zalo inbound — conversation', () => {
  it('conversation đã có theo (nick, externalThreadId) → dùng lại, không create', async () => {
    h.prisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-old', groupName: null, groupAvatarUrl: null, groupMembersCount: null });
    const res = await handleIncomingMessage(inbound());
    expect(h.prisma.conversation.findFirst.mock.calls[0][0].where).toEqual({ zaloAccountId: 'za-1', externalThreadId: 'uid-kh' });
    expect(h.prisma.conversation.create).not.toHaveBeenCalled();
    expect(h.findExistingUserConversation).not.toHaveBeenCalled();
    expect(res!.conversationId).toBe('conv-old');
  });

  it('chống xé: resolver globalId-aware trả conv anh-em → dùng lại', async () => {
    h.findExistingUserConversation.mockResolvedValueOnce('conv-sibling');
    const res = await handleIncomingMessage(inbound({ contactGlobalId: 'g-1' }));
    expect(h.prisma.conversation.create).not.toHaveBeenCalled();
    expect(res!.conversationId).toBe('conv-sibling');
  });

  it('group: contact đại diện nhóm (metadata.isGroup), conv threadType=group, không gọi resolver 1-1', async () => {
    h.prisma.contact.create.mockResolvedValueOnce({ id: 'c-group', fullName: 'Nhóm VIP' });
    h.prisma.conversation.create.mockResolvedValueOnce({ id: 'conv-g' });
    const res = await handleIncomingMessage(inbound({
      threadType: 'group', threadId: 'grp-1', groupName: 'Nhóm VIP', groupMembersCount: 12,
    }));
    expect(h.prisma.contact.create.mock.calls[0][0].data).toMatchObject({
      orgId: 'org-1', zaloUid: 'grp-1', fullName: 'Nhóm VIP', metadata: { isGroup: true },
    });
    expect(h.findExistingUserConversation).not.toHaveBeenCalled();
    expect(h.prisma.conversation.create.mock.calls[0][0].data).toMatchObject({
      threadType: 'group', externalThreadId: 'grp-1', groupName: 'Nhóm VIP', groupMembersCount: 12, contactId: 'c-group',
    });
    expect(res!.conversationId).toBe('conv-g');
  });
});

describe('Zalo inbound — undo (thu hồi)', () => {
  it('soft-delete message khớp globalMsgId/cliMsgId và ghi interaction message_recalled', async () => {
    h.prisma.message.findMany.mockResolvedValueOnce([{ id: 'm-1', conversationId: 'conv-1', zaloMsgId: '73' }]);
    h.prisma.message.updateMany.mockResolvedValueOnce({ count: 1 });
    const ids = await handleMessageUndo('za-1', { globalMsgIdNum: 73n, cliMsgIdNum: 17n });
    expect(ids).toEqual(['m-1']);
    expect(h.prisma.message.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ zaloMsgIdNum: 73n }, { zaloCliMsgId: '17' }, { zaloMsgIdNum: 17n }, { zaloMsgId: '17' }],
      isDeleted: false,
    });
    expect(h.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m-1'] } }, data: { isDeleted: true, deletedAt: expect.any(Date) },
    });
    expect(h.applyContactInteraction).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-1', type: 'message_recalled' }));
  });

  it('không có ref nào → [] và không query', async () => {
    expect(await handleMessageUndo('za-1', { globalMsgIdNum: null, cliMsgIdNum: null })).toEqual([]);
    expect(h.prisma.message.findMany).not.toHaveBeenCalled();
  });
});
