import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config/index.js';
import type { AiDataGrant } from '../../src/modules/ai/ai-privacy-guard.js';
import {
  AiRateLimitedError,
  checkAiRateLimit,
  resetAiRateLimiter,
  setAiRateLimiterClock,
} from '../../src/modules/ai/ai-rate-limiter.js';

const originalLimit = config.aiRateLimitPerOrg;
const originalWindow = config.aiRateLimitWindowMs;

function grant(orgId: string, purpose: AiDataGrant['purpose'] = 'reply'): AiDataGrant {
  return { orgId, purpose } as AiDataGrant;
}

describe('ai rate limiter', () => {
  afterEach(() => {
    config.aiRateLimitPerOrg = originalLimit;
    config.aiRateLimitWindowMs = originalWindow;
    resetAiRateLimiter();
  });

  it('PH-RL01 rejects calls over the per-org window limit', () => {
    config.aiRateLimitPerOrg = 2;
    checkAiRateLimit(grant('org-a'));
    checkAiRateLimit(grant('org-a'));
    expect(() => checkAiRateLimit(grant('org-a'))).toThrow(AiRateLimitedError);
  });

  it('PH-RL02 allows calls again after window reset', () => {
    let current = 1_000;
    setAiRateLimiterClock(() => current);
    config.aiRateLimitPerOrg = 1;
    config.aiRateLimitWindowMs = 60_000;
    checkAiRateLimit(grant('org-a'));
    expect(() => checkAiRateLimit(grant('org-a'))).toThrow(AiRateLimitedError);
    current += 60_000;
    expect(() => checkAiRateLimit(grant('org-a'))).not.toThrow();
  });

  it('PH-RL03 isolates organizations', () => {
    config.aiRateLimitPerOrg = 1;
    checkAiRateLimit(grant('org-a'));
    expect(() => checkAiRateLimit(grant('org-b'))).not.toThrow();
  });

  it('PH-RL04 exempts eval purpose', () => {
    config.aiRateLimitPerOrg = 1;
    checkAiRateLimit(grant('eval-org', 'eval'));
    checkAiRateLimit(grant('eval-org', 'eval'));
    expect(() => checkAiRateLimit(grant('eval-org', 'eval'))).not.toThrow();
  });
});
