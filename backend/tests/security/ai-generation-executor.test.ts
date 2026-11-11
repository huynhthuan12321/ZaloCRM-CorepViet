import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/ai/provider-registry.js', () => ({
  getProviderConfig: vi.fn(() => ({ baseUrl: 'https://api.example.com' })),
  getProviderBaseUrl: vi.fn(async () => 'https://api.example.com'),
}));

vi.mock('../../src/modules/ai/ai-provider-url-policy.js', () => ({
  validateAiProviderBaseUrl: vi.fn(async (url: string) => {
    if (url.includes('private')) throw new Error('AI provider host resolves to a private address');
    return new URL(url).origin;
  }),
}));

vi.mock('../../src/modules/ai/providers/anthropic.js', () => ({
  generateWithAnthropic: vi.fn(async () => 'mock-response'),
}));
vi.mock('../../src/modules/ai/providers/gemini.js', () => ({
  generateWithGemini: vi.fn(async () => 'mock-response'),
}));
vi.mock('../../src/modules/ai/providers/openai-compat.js', () => ({
  generateWithOpenaiCompat: vi.fn(async () => 'mock-response'),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: { conversation: { findFirst: vi.fn() } },
}));
vi.mock('../../src/modules/privacy/redact.js', () => ({
  canSeeConversationContent: vi.fn(() => true),
}));

import { executeAiGeneration } from '../../src/modules/ai/ai-generation-executor.js';
import { authorizeAiData, type AiDataGrant } from '../../src/modules/ai/ai-privacy-guard.js';
import { validateAiProviderBaseUrl } from '../../src/modules/ai/ai-provider-url-policy.js';

const mockValidateUrl = vi.mocked(validateAiProviderBaseUrl);

describe('ai-generation-executor', () => {
  let validGrant: AiDataGrant;

  beforeEach(async () => {
    vi.clearAllMocks();
    validGrant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
    });
  });

  it('P09 - rejects fake grant without branded symbol', async () => {
    const fake = { orgId: 'org-1', scope: 'knowledge', purpose: 'rag_answer', actorMode: 'background' };
    await expect(executeAiGeneration({
      grant: fake as any,
      orgId: 'org-1',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
      system: 'test',
      prompt: 'hello',
    })).rejects.toThrow(/grant/i);
  });

  it('P10 - rejects grant/org mismatch', async () => {
    await expect(executeAiGeneration({
      grant: validGrant,
      orgId: 'org-OTHER',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
      system: 'test',
      prompt: 'hello',
    })).rejects.toThrow(/grant/i);
  });

  it('P11 - validates URL before calling provider', async () => {
    mockValidateUrl.mockRejectedValueOnce(new Error('AI provider host resolves to a private address'));
    await expect(executeAiGeneration({
      grant: validGrant,
      orgId: 'org-1',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
      system: 'test',
      prompt: 'hello',
    })).rejects.toThrow(/private/i);
  });
});
