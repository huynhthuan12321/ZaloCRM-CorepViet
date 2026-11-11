import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  conversation: { findFirst: vi.fn(), update: vi.fn() },
  message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  aiSuggestion: { create: vi.fn() },
  activityLog: { create: vi.fn() },
  getAiConfig: vi.fn(), generate: vi.fn(), authorize: vi.fn(),
  send: vi.fn(), emit: vi.fn(), traceEnd: vi.fn(),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: fixture }));
vi.mock('../../src/shared/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../src/config/index.js', () => ({ config: { marketingDryRun: false } }));
vi.mock('../../src/shared/tenant/tenant-context.js', () => ({
  withTenant: (_org: string, fn: () => unknown) => fn(),
  runSystemQuery: (fn: () => unknown) => fn(),
}));
vi.mock('../../src/shared/zalo-operations.js', () => ({ zaloOps: { sendMessage: fixture.send } }));
vi.mock('../../src/shared/realtime/emit-chat.js', () => ({ emitChatMessage: fixture.emit }));
vi.mock('../../src/modules/ai/ai-capabilities.js', () => ({ assertAiCapability: vi.fn(), auditAiAction: vi.fn() }));
vi.mock('../../src/modules/ai/ai-service.js', () => ({ getAiConfig: fixture.getAiConfig, generateAiOutput: fixture.generate }));
vi.mock('../../src/modules/ai/ai-virtual-chat-service.js', () => ({ shouldTriggerAi: () => true }));
vi.mock('../../src/modules/ai/ai-privacy-guard.js', () => ({ authorizeAiData: fixture.authorize }));
vi.mock('../../src/modules/ai/observability/ai-tracer.js', () => ({
  startAiTrace: () => ({}), addSpan: () => ({}), endSpan: vi.fn(), endAiTrace: fixture.traceEnd,
}));

import { triggerAutoReply } from '../../src/modules/ai/ai-auto-reply-service.js';

const config = {
  enabled: true, aiAutoReplyGlobalEnabled: true, aiAutoReplyScope: 'manual',
  aiAutoReplyInboundStrangerEnabled: false, aiAutoReplyFullAuto: true,
  aiAutoReplyStartHour: 8, aiAutoReplyEndHour: 22, aiAutoReplyMaxConsecutive: 10,
  aiAutoReplySensitivePattern: null, aiAssistantSkipNoisePattern: '',
  provider: 'fixture', model: 'fixture',
};
let sequence = 0;
const input = () => ({ accountId: 'account-fixture', conversationId: `conversation-${++sequence}`, incomingMessageId: 'incoming-fixture', orgId: 'org-fixture' });

describe('AI full-auto reply integration with the real send policy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T03:00:00Z'));
    fixture.conversation.findFirst.mockResolvedValue({
      id: 'conversation-fixture', contactId: null, zaloAccountId: 'account-fixture',
      externalThreadId: 'peer-fixture', threadType: 'user', isVirtual: false,
      deletedAt: null, aiAutoReplyEnabled: true,
      zaloAccount: { privacyMode: 'sub', ownerUserId: 'owner-fixture', zaloUid: 'own-fixture', archivedAt: null },
    });
    fixture.message.findFirst.mockResolvedValueOnce({
      id: 'incoming-fixture', content: 'Cho mình hỏi giá sản phẩm?', contentType: 'text',
      senderType: 'other', sentAt: new Date('2026-10-17T02:59:59Z'),
    }).mockResolvedValue(null);
    fixture.message.findMany.mockResolvedValue([]);
    fixture.getAiConfig.mockResolvedValue(config);
    fixture.authorize.mockResolvedValue({});
    fixture.generate.mockResolvedValue({ content: 'Theo bảng giá, sản phẩm giá 125.000 vnd.', confidence: 0.9, sources: ['price-list'] });
    fixture.send.mockResolvedValue({ message: { msgId: '12345' } });
    fixture.message.create.mockImplementation(async ({ data }) => data);
    fixture.conversation.update.mockResolvedValue({});
    fixture.aiSuggestion.create.mockResolvedValue({});
    fixture.activityLog.create.mockResolvedValue({});
  });
  afterEach(() => { vi.useRealTimers(); });

  it('sends one sourced price reply when the organization enabled full auto', async () => {
    const operation = triggerAutoReply(input(), null);
    await vi.runAllTimersAsync();
    await operation;
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(fixture.send).toHaveBeenCalledWith('account-fixture', 'peer-fixture', 0, { msg: 'Theo bảng giá, sản phẩm giá 125.000 vnd.' });
    expect(fixture.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sentVia: 'ai_auto' }) }));
    expect(fixture.aiSuggestion.create).not.toHaveBeenCalled();
  });

  it('saves the price draft for review when full auto starts disabled', async () => {
    fixture.getAiConfig.mockResolvedValue({ ...config, aiAutoReplyFullAuto: false });
    await triggerAutoReply(input(), null);
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.aiSuggestion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'auto_reply_needs_review' }) }));
  });

  it('does not send if full auto is switched off during the waiting period', async () => {
    fixture.getAiConfig.mockResolvedValueOnce(config).mockResolvedValue({ ...config, aiAutoReplyFullAuto: false });
    const operation = triggerAutoReply(input(), null);
    await vi.runAllTimersAsync();
    await operation;
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.aiSuggestion.create).toHaveBeenCalledOnce();
    expect(fixture.message.create).not.toHaveBeenCalled();
  });

  it('keeps the knowledge-source requirement when full auto is enabled', async () => {
    fixture.generate.mockResolvedValue({ content: 'Giá 125.000 vnd.', confidence: 1, sources: [] });
    await triggerAutoReply(input(), null);
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.aiSuggestion.create).toHaveBeenCalledOnce();
  });

  it('does not send if the organization kill switch is turned off while waiting', async () => {
    fixture.getAiConfig.mockResolvedValueOnce(config).mockResolvedValue({ ...config, aiAutoReplyGlobalEnabled: false });
    const operation = triggerAutoReply(input(), null);
    await vi.runAllTimersAsync();
    await operation;
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.message.create).not.toHaveBeenCalled();
  });

  it('does not send an outdated draft after a human has replied', async () => {
    fixture.message.findFirst.mockReset().mockResolvedValueOnce({
      id: 'incoming-fixture', content: 'Cho mình hỏi giá sản phẩm?', contentType: 'text',
      senderType: 'other', sentAt: new Date('2026-10-17T02:59:59Z'),
    }).mockResolvedValue({ id: 'newer-human-reply', senderType: 'self', sentVia: 'crm', metadata: null });
    const operation = triggerAutoReply(input(), null);
    await vi.runAllTimersAsync();
    await operation;
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.message.create).not.toHaveBeenCalled();
  });

  it('does not generate or send when the existing privacy guard denies access', async () => {
    fixture.authorize.mockRejectedValue(new Error('AI_PRIVACY_DENIED'));
    await triggerAutoReply(input(), null);
    expect(fixture.generate).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
  });
});
