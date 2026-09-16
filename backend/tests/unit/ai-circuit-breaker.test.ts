import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config/index.js';
import { AiPrivacyDeniedError } from '../../src/modules/ai/ai-privacy-guard.js';
import { AiProviderUrlPolicyError } from '../../src/modules/ai/ai-provider-url-policy.js';
import {
  AiCircuitOpenError,
  checkAiCircuitBreaker,
  getAiCircuitState,
  isProviderTransientError,
  recordAiCircuitFailure,
  recordAiCircuitSuccess,
  resetAiCircuitBreakers,
  setAiCircuitBreakerClock,
} from '../../src/modules/ai/ai-circuit-breaker.js';

const originalThreshold = config.aiCircuitFailureThreshold;
const originalCooldown = config.aiCircuitCooldownMs;
const originalHalfOpen = config.aiCircuitHalfOpenMax;

function transient(statusCode = 503): Error & { statusCode: number } {
  return Object.assign(new Error(`provider ${statusCode}`), { statusCode });
}

describe('ai circuit breaker', () => {
  afterEach(() => {
    config.aiCircuitFailureThreshold = originalThreshold;
    config.aiCircuitCooldownMs = originalCooldown;
    config.aiCircuitHalfOpenMax = originalHalfOpen;
    resetAiCircuitBreakers();
  });

  it('PH-CB01 opens after threshold provider failures', () => {
    config.aiCircuitFailureThreshold = 2;
    recordAiCircuitFailure('anthropic', transient());
    recordAiCircuitFailure('anthropic', transient());
    expect(getAiCircuitState('anthropic').state).toBe('open');
    expect(() => checkAiCircuitBreaker('anthropic')).toThrow(AiCircuitOpenError);
  });

  it('PH-CB02 allows one half-open request after cooldown', () => {
    let current = 1_000;
    config.aiCircuitFailureThreshold = 1;
    config.aiCircuitCooldownMs = 30_000;
    setAiCircuitBreakerClock(() => current);
    recordAiCircuitFailure('gemini', transient());
    current += 30_001;
    expect(() => checkAiCircuitBreaker('gemini')).not.toThrow();
    expect(getAiCircuitState('gemini').state).toBe('half_open');
    expect(() => checkAiCircuitBreaker('gemini')).toThrow(AiCircuitOpenError);
  });

  it('PH-CB03 half-open success closes circuit', () => {
    let current = 1_000;
    config.aiCircuitFailureThreshold = 1;
    config.aiCircuitCooldownMs = 1;
    setAiCircuitBreakerClock(() => current);
    recordAiCircuitFailure('openai', transient());
    current += 2;
    checkAiCircuitBreaker('openai');
    recordAiCircuitSuccess('openai');
    expect(getAiCircuitState('openai').state).toBe('closed');
  });

  it('PH-CB04 half-open failure reopens circuit', () => {
    let current = 1_000;
    config.aiCircuitFailureThreshold = 1;
    config.aiCircuitCooldownMs = 1;
    setAiCircuitBreakerClock(() => current);
    recordAiCircuitFailure('qwen', transient());
    current += 2;
    checkAiCircuitBreaker('qwen');
    recordAiCircuitFailure('qwen', transient(429));
    expect(getAiCircuitState('qwen').state).toBe('open');
  });

  it('PH-CB05 isolates providers', () => {
    config.aiCircuitFailureThreshold = 1;
    recordAiCircuitFailure('kimi', transient());
    expect(() => checkAiCircuitBreaker('kimi')).toThrow(AiCircuitOpenError);
    expect(() => checkAiCircuitBreaker('deepseek')).not.toThrow();
  });

  it('PH-CB06 reset returns all providers to closed', () => {
    config.aiCircuitFailureThreshold = 1;
    recordAiCircuitFailure('anthropic', transient());
    resetAiCircuitBreakers();
    expect(getAiCircuitState('anthropic').state).toBe('closed');
  });

  it('PH-CB08 only treats provider/transient errors as circuit failures', () => {
    expect(isProviderTransientError(transient(500))).toBe(true);
    expect(isProviderTransientError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(isProviderTransientError(Object.assign(new Error('bad auth'), { statusCode: 401 }))).toBe(false);
    expect(isProviderTransientError(new AiPrivacyDeniedError())).toBe(false);
    expect(isProviderTransientError(new AiProviderUrlPolicyError('blocked'))).toBe(false);
  });
});
