import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: { conversation: { findFirst: vi.fn() } },
}));

vi.mock('../../src/modules/privacy/redact.js', () => ({
  canSeeConversationContent: vi.fn(),
}));

import { config } from '../../src/config/index.js';
import { AiPrivacyDeniedError, assertAiDataGrant, authorizeAiData } from '../../src/modules/ai/ai-privacy-guard.js';

const originalConfig = {
  nodeEnv: config.nodeEnv,
  isProduction: config.isProduction,
  promptfooEvalEnabled: config.promptfooEvalEnabled,
  promptfooEvalOrgId: config.promptfooEvalOrgId,
};

function enableEval() {
  config.nodeEnv = 'test';
  config.isProduction = false;
  config.promptfooEvalEnabled = true;
  config.promptfooEvalOrgId = 'eval-org';
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('promptfoo eval authorization', () => {
  beforeEach(() => {
    enableEval();
  });

  afterEach(() => {
    config.nodeEnv = originalConfig.nodeEnv;
    config.isProduction = originalConfig.isProduction;
    config.promptfooEvalEnabled = originalConfig.promptfooEvalEnabled;
    config.promptfooEvalOrgId = originalConfig.promptfooEvalOrgId;
  });

  it('PF-A01 eval purpose + production denies before provider call', async () => {
    config.nodeEnv = 'production';
    config.isProduction = true;
    await expect(authorizeAiData({
      orgId: 'eval-org',
      scope: 'operator_text',
      purpose: 'eval',
      actor: { mode: 'background' },
      evalDataSource: 'technical',
    })).rejects.toThrow(AiPrivacyDeniedError);
  });

  it('PF-A02 eval purpose + flag disabled denies', async () => {
    config.promptfooEvalEnabled = false;
    await expect(authorizeAiData({
      orgId: 'eval-org',
      scope: 'operator_text',
      purpose: 'eval',
      actor: { mode: 'background' },
      evalDataSource: 'technical',
    })).rejects.toThrow(/disabled/i);
  });

  it('PF-A03 eval purpose + missing eval org denies', async () => {
    config.promptfooEvalOrgId = '';
    await expect(authorizeAiData({
      orgId: 'eval-org',
      scope: 'operator_text',
      purpose: 'eval',
      actor: { mode: 'background' },
      evalDataSource: 'technical',
    })).rejects.toThrow(/organization/i);
  });

  it('PF-A04/PF-A09 eval purpose + wrong org denies arbitrary tenant access', async () => {
    await expect(authorizeAiData({
      orgId: 'prod-org',
      scope: 'operator_text',
      purpose: 'eval',
      actor: { mode: 'background' },
      evalDataSource: 'technical',
    })).rejects.toThrow(/mismatch/i);
  });

  it('PF-A05 eval purpose + valid non-prod flag and org returns branded grant', async () => {
    const grant = await authorizeAiData({
      orgId: 'eval-org',
      scope: 'operator_text',
      purpose: 'eval',
      actor: { mode: 'background' },
      evalDataSource: 'technical',
    });
    expect(grant.purpose).toBe('eval');
    expect(grant.evalDataSource).toBe('technical');
    expect(() => assertAiDataGrant(grant, 'eval-org')).not.toThrow();
  });

  it('PF-A06 raw/fake AiDataGrant is rejected', () => {
    const fake = Object.freeze({ orgId: 'eval-org', scope: 'operator_text', purpose: 'eval', actorMode: 'background' });
    expect(() => assertAiDataGrant(fake as any, 'eval-org')).toThrow(AiPrivacyDeniedError);
  });

  it('PF-A07 eval attempts production conversation access and is denied', async () => {
    await expect(authorizeAiData({
      orgId: 'eval-org',
      scope: 'conversation',
      purpose: 'eval',
      actor: { mode: 'background' },
      conversationId: 'prod-conversation',
      evalDataSource: 'technical',
    })).rejects.toThrow(/conversation/i);
  });

  it('PF-A08 eval adapter cannot call Zalo send', () => {
    const provider = readFileSync(join(process.cwd(), 'promptfoo', 'providers', 'zalocrmProvider.ts'), 'utf8');
    expect(provider).not.toMatch(/zaloOps|sendMessage|send_zalo/);
  });

  it('PF-A10 promptfoo adapter cannot import low-level provider wrappers directly', () => {
    const files = walk(join(process.cwd(), 'promptfoo')).filter((file) => file.endsWith('.ts'));
    const offenders = files.filter((file) => /providers\/(anthropic|gemini|openai-compat)\.js/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
