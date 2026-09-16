import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    conversation: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/modules/privacy/redact.js', () => ({
  canSeeConversationContent: vi.fn(),
}));

import { authorizeAiData, assertAiDataGrant, AiPrivacyDeniedError } from '../../src/modules/ai/ai-privacy-guard.js';
import { prisma } from '../../src/shared/database/prisma-client.js';
import { canSeeConversationContent } from '../../src/modules/privacy/redact.js';

const mockFindFirst = vi.mocked(prisma.conversation.findFirst);
const mockCanSee = vi.mocked(canSeeConversationContent);

describe('ai-privacy-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P01 - returns a frozen branded grant for valid non-conversation scope', async () => {
    const grant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
    });
    expect(grant.orgId).toBe('org-1');
    expect(grant.scope).toBe('knowledge');
    expect(Object.isFrozen(grant)).toBe(true);
    expect(() => assertAiDataGrant(grant, 'org-1')).not.toThrow();
  });

  it('P02 - assertAiDataGrant rejects a plain-object fake', () => {
    const fake = Object.freeze({ orgId: 'org-1', scope: 'knowledge', purpose: 'rag_answer', actorMode: 'background' });
    expect(() => assertAiDataGrant(fake as any, 'org-1')).toThrow(AiPrivacyDeniedError);
  });

  it('P03 - assertAiDataGrant rejects org mismatch', async () => {
    const grant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
    });
    expect(() => assertAiDataGrant(grant, 'org-OTHER')).toThrow(AiPrivacyDeniedError);
  });

  it('P04 - background actor denied for privacyMode=main', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      zaloAccount: { privacyMode: 'main', ownerUserId: 'owner-1' },
    } as any);

    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'auto_reply',
      actor: { mode: 'background' },
      conversationId: 'conv-1',
    })).rejects.toThrow(/private main-nick/i);
  });

  it('P05 - background actor allowed for privacyMode=sub', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      zaloAccount: { privacyMode: 'sub', ownerUserId: null },
    } as any);

    const grant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'auto_reply',
      actor: { mode: 'background' },
      conversationId: 'conv-1',
    });
    expect(grant.scope).toBe('conversation');
    expect(grant.conversationId).toBe('conv-1');
  });

  it('P06 - user actor denied when privacy locked', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      zaloAccount: { privacyMode: 'main', ownerUserId: 'owner-1' },
    } as any);
    mockCanSee.mockReturnValue(false);

    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'virtual_chat',
      actor: { mode: 'user', privacyContext: { viewerUserId: 'user-2', orgId: 'org-1', privacyUnlocked: false } },
      conversationId: 'conv-1',
    })).rejects.toThrow(/locked/i);
  });

  it('P07 - conversation scope without conversationId throws', async () => {
    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'reply',
      actor: { mode: 'background' },
    })).rejects.toThrow(/conversationId/i);
  });

  it('P08 - non-conversation scope with conversationId throws', async () => {
    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
      conversationId: 'conv-1',
    })).rejects.toThrow(/only valid for conversation/i);
  });
});
