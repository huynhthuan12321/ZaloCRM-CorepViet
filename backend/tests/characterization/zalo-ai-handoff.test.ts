/**
 * PR-01 — Zalo characterization: AI HANDOFF (ai-auto-reply-service.triggerAutoReply).
 *
 * Chốt ranh giới AI ↔ người thật trên kênh Zalo:
 *   - Mặc định tắt; chỉ 1-1 thật (không group/virtual/nick xóa); chỉ tin khách dạng text.
 *   - Nhạy cảm / thiếu nguồn → lưu nháp aiSuggestion + emit 'chat:ai-needs-review', KHÔNG gửi Zalo.
 *   - Đủ số tin AI liên tiếp → nhường sale (không soạn).
 *   - Sau delay: có tin người thật/khách mới hơn → HỦY gửi.
 *   - Gửi thật: zaloOps.sendMessage, Message sentVia='ai_auto' + metadata.aiAuto, emit _aiAuto.
 * Eligibility/send-policy chi tiết đã có unit test riêng (tests/unit/ai-*.test.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: {
    conversation: { findFirst: vi.fn(), update: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    aiSuggestion: { create: vi.fn() },
    activityLog: { create: vi.fn() },
  },
  config: { marketingDryRun: false },
  sendMessage: vi.fn(),
  emitChatMessage: vi.fn(),
  getAiConfig: vi.fn(),
  generateAiOutput: vi.fn(),
  eligible: vi.fn(),
  authorizeAiData: vi.fn(),
  auditAiAction: vi.fn(),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: h.prisma }));
vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/config/index.js', () => ({ config: h.config }));
vi.mock('../../src/shared/tenant/tenant-context.js', () => ({
  withTenant: (_org: string, fn: () => unknown) => fn(),
  runSystemQuery: (fn: () => unknown) => fn(),
}));
vi.mock('../../src/shared/zalo-operations.js', () => ({ zaloOps: { sendMessage: h.sendMessage } }));
vi.mock('../../src/shared/realtime/emit-chat.js', () => ({ emitChatMessage: h.emitChatMessage }));
vi.mock('../../src/modules/ai/ai-capabilities.js', () => ({ assertAiCapability: vi.fn(), auditAiAction: h.auditAiAction }));
vi.mock('../../src/modules/ai/ai-service.js', () => ({ getAiConfig: h.getAiConfig, generateAiOutput: h.generateAiOutput }));
vi.mock('../../src/modules/ai/ai-virtual-chat-service.js', () => ({ shouldTriggerAi: () => true }));
vi.mock('../../src/modules/ai/ai-auto-reply-eligibility.js', () => ({
  isConversationEligibleForAutoReply: h.eligible,
  normalizeAutoReplyScope: (s: string) => s,
}));
vi.mock('../../src/modules/ai/ai-privacy-guard.js', () => ({ authorizeAiData: h.authorizeAiData }));
vi.mock('../../src/modules/ai/customer-summary-service.js', () => ({ updateCustomerSummary: vi.fn() }));
vi.mock('../../src/modules/ai/observability/ai-tracer.js', () => ({
  startAiTrace: vi.fn(() => ({})), addSpan: vi.fn(() => ({})), endSpan: vi.fn(), endAiTrace: vi.fn(),
}));

const { triggerAutoReply } = await import('../../src/modules/ai/ai-auto-reply-service.js');

let seq = 0;
function input() {
  seq += 1; // conversationId khác nhau mỗi test → né throttle 5s trong module
  return { accountId: 'za-1', conversationId: `conv-${seq}`, incomingMessageId: 'm-in', orgId: 'org-1' };
}

function io() {
  const emits: Array<{ room: string; event: string; payload: any }> = [];
  return {
    emits,
    server: { to: (room: string) => ({ emit: (event: string, payload: any) => emits.push({ room, event, payload }) }) } as any,
  };
}

function aiCfg(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true, aiAutoReplyGlobalEnabled: true, aiAutoReplyScope: 'all',
    aiAutoReplyInboundStrangerEnabled: false, aiAssistantSkipNoisePattern: null,
    aiAutoReplyStartHour: 0, aiAutoReplyEndHour: 24, aiAutoReplyMaxConsecutive: 2,
    aiAutoReplySensitivePattern: null, provider: 'x', model: 'y',
    ...overrides,
  };
}

function convRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv', contactId: 'c-1', zaloAccountId: 'za-1', externalThreadId: 'uid-kh', threadType: 'user',
    isVirtual: false, deletedAt: null, aiAutoReplyEnabled: false,
    zaloAccount: { privacyMode: 'sub', ownerUserId: 'owner-1', zaloUid: 'uid-nick', archivedAt: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  h.config.marketingDryRun = false;
  h.prisma.conversation.findFirst.mockResolvedValue(convRow());
  h.prisma.conversation.update.mockResolvedValue({});
  h.getAiConfig.mockResolvedValue(aiCfg());
  h.eligible.mockResolvedValue(true);
  // findFirst #1: tin đến; #2 (sau delay): tin mới hơn → mặc định không có
  h.prisma.message.findFirst
    .mockResolvedValueOnce({ id: 'm-in', content: 'Cho em hỏi sản phẩm này dùng thế nào ạ', contentType: 'text', senderType: 'contact', sentAt: new Date() })
    .mockResolvedValue(null);
  h.prisma.message.findMany.mockResolvedValue([]);
  h.prisma.message.create.mockImplementation(async ({ data }: any) => data);
  h.prisma.aiSuggestion.create.mockResolvedValue({});
  h.prisma.activityLog.create.mockResolvedValue({});
  h.authorizeAiData.mockResolvedValue({ grant: true });
  h.generateAiOutput.mockResolvedValue({ content: 'Dạ sản phẩm dùng mỗi sáng ạ', confidence: 0.9, sources: ['kb-1'] });
  h.sendMessage.mockResolvedValue({ message: { msgId: '7300000000000000123' } });
});

afterEach(() => {
  vi.useRealTimers();
});

async function run(i = input(), server: any = null) {
  const p = triggerAutoReply(i, server);
  await vi.advanceTimersByTimeAsync(41_000);
  await p;
  return i;
}

describe('AI handoff — không kích hoạt', () => {
  it('org tắt auto-reply → không soạn, không gửi', async () => {
    h.getAiConfig.mockResolvedValue(aiCfg({ aiAutoReplyGlobalEnabled: false }));
    await run();
    expect(h.generateAiOutput).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['group', { threadType: 'group' }],
    ['virtual', { isVirtual: true }],
    ['đã xóa', { deletedAt: new Date() }],
  ])('hội thoại %s → bỏ qua', async (_label, overrides) => {
    h.prisma.conversation.findFirst.mockResolvedValue(convRow(overrides));
    await run();
    expect(h.getAiConfig).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('conversation lookup có orgId (tenant scope)', async () => {
    const i = await run();
    expect(h.prisma.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: i.conversationId, orgId: 'org-1' });
  });

  it('tin đến là self hoặc không phải text → bỏ qua', async () => {
    h.prisma.message.findFirst.mockReset();
    h.prisma.message.findFirst.mockResolvedValueOnce({ id: 'm-in', content: 'hello world', contentType: 'image', senderType: 'contact', sentAt: new Date() });
    await run();
    expect(h.generateAiOutput).not.toHaveBeenCalled();
  });

  it('đã đủ aiAutoReplyMaxConsecutive tin AI liên tiếp → nhường sale', async () => {
    h.prisma.message.findMany.mockResolvedValue([{ sentVia: 'ai_auto', metadata: null }, { sentVia: null, metadata: { aiAuto: true } }]);
    await run();
    expect(h.generateAiOutput).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('lỗi bất kỳ không throw ra listener', async () => {
    h.prisma.conversation.findFirst.mockRejectedValue(new Error('db down'));
    await expect(run()).resolves.toBeDefined();
  });
});

describe('AI handoff — chuyển sale duyệt (needs_review)', () => {
  it('khách hỏi giá → lưu aiSuggestion auto_reply_needs_review + emit chat:ai-needs-review, KHÔNG gửi Zalo', async () => {
    h.prisma.message.findFirst.mockReset();
    h.prisma.message.findFirst.mockResolvedValueOnce({ id: 'm-in', content: 'Sản phẩm này giá bao nhiêu vậy shop', contentType: 'text', senderType: 'contact', sentAt: new Date() });
    const { server, emits } = io();
    const i = await run(input(), server);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.prisma.message.create).not.toHaveBeenCalled();
    expect(h.prisma.aiSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: 'org-1', conversationId: i.conversationId, messageId: 'm-in', type: 'auto_reply_needs_review' }),
    });
    expect(emits).toEqual([{
      room: 'org:org-1', event: 'chat:ai-needs-review',
      payload: { conversationId: i.conversationId, messageId: 'm-in', draft: 'Dạ sản phẩm dùng mỗi sáng ạ', reason: 'giá/chốt đơn', sources: ['kb-1'] },
    }]);
  });

  it('nháp không có nguồn tài liệu → needs_review "thiếu nguồn tài liệu"', async () => {
    h.generateAiOutput.mockResolvedValue({ content: 'Dạ vâng ạ', confidence: 0.9, sources: [] });
    const { server, emits } = io();
    await run(input(), server);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(emits[0].payload.reason).toBe('thiếu nguồn tài liệu');
  });
});

describe('AI handoff — tự gửi', () => {
  it('gửi qua zaloOps.sendMessage(1-1), lưu Message sentVia=ai_auto, emit _aiAuto, audit bot', async () => {
    const i = await run();
    expect(h.sendMessage).toHaveBeenCalledWith('za-1', 'uid-kh', 0, { msg: 'Dạ sản phẩm dùng mỗi sáng ạ' });
    const data = h.prisma.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      conversationId: i.conversationId, zaloMsgId: '7300000000000000123', senderType: 'self', senderUid: 'uid-nick',
      senderName: 'AI tự tư vấn', contentType: 'text', sentVia: 'ai_auto', isLocal: false,
      metadata: { aiAuto: true, sources: ['kb-1'] },
    });
    expect(h.prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: i.conversationId }, data: { lastMessageAt: expect.any(Date), isReplied: true },
    });
    expect(h.emitChatMessage.mock.calls[0][0]).toMatchObject({ orgId: 'org-1', extra: { _aiAuto: true } });
    expect(h.prisma.activityLog.create.mock.calls[0][0].data).toMatchObject({
      orgId: 'org-1', actorType: 'bot', action: 'ai_auto_reply_sent', entityType: 'conversation',
    });
  });

  it('trong lúc chờ có tin người thật mới hơn → HỦY gửi', async () => {
    h.prisma.message.findFirst.mockReset();
    h.prisma.message.findFirst
      .mockResolvedValueOnce({ id: 'm-in', content: 'Cho em hỏi sản phẩm này dùng thế nào ạ', contentType: 'text', senderType: 'contact', sentAt: new Date() })
      .mockResolvedValueOnce({ id: 'm-sale', senderType: 'self', sentVia: 'user', metadata: {} });
    await run();
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.prisma.message.create).not.toHaveBeenCalled();
  });

  it('MARKETING_DRY_RUN → không gọi Zalo, lưu local:<uuid> isLocal=true', async () => {
    h.config.marketingDryRun = true;
    await run();
    expect(h.sendMessage).not.toHaveBeenCalled();
    const data = h.prisma.message.create.mock.calls[0][0].data;
    expect(data.zaloMsgId).toMatch(/^local:/);
    expect(data.isLocal).toBe(true);
  });

  it('Zalo từ chối gửi → không lưu Message', async () => {
    h.sendMessage.mockRejectedValue(new Error('blocked'));
    await run();
    expect(h.prisma.message.create).not.toHaveBeenCalled();
  });
});
