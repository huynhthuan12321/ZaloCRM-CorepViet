import { describe, expect, it, vi } from 'vitest';
import { AiPrivacyDeniedError } from '../../src/modules/ai/ai-privacy-guard.js';
import { AiProviderUrlPolicyError } from '../../src/modules/ai/ai-provider-url-policy.js';
import { AiCircuitOpenError } from '../../src/modules/ai/ai-circuit-breaker.js';
import { AiRateLimitedError } from '../../src/modules/ai/ai-rate-limiter.js';
import { validateProductionConfig } from '../../src/config/validate-production-config.js';
import { sanitizeRequestId } from '../../src/shared/http/request-id.js';
import { classifyError } from '../../src/shared/http/error-classifier.js';

describe('production hardening helpers', () => {
  it('PH-CFG01 exits in production when JWT_SECRET is missing', () => {
    const exit = vi.fn((code: number) => { throw new Error(`exit:${code}`); });
    const log = { warn: vi.fn(), error: vi.fn() };
    expect(() => validateProductionConfig({
      NODE_ENV: 'production',
      ENCRYPTION_KEY: 'a'.repeat(32),
      DATABASE_URL: 'postgresql://example',
    }, exit as never, log)).toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('PH-CFG02 exits in production when ENCRYPTION_KEY is too short', () => {
    const exit = vi.fn((code: number) => { throw new Error(`exit:${code}`); });
    const log = { warn: vi.fn(), error: vi.fn() };
    expect(() => validateProductionConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'b'.repeat(32),
      ENCRYPTION_KEY: 'short',
      DATABASE_URL: 'postgresql://example',
    }, exit as never, log)).toThrow('exit:1');
  });

  it('PH-CFG03 accepts valid production secrets', () => {
    const exit = vi.fn();
    const log = { warn: vi.fn(), error: vi.fn() };
    validateProductionConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'b'.repeat(32),
      ENCRYPTION_KEY: 'a'.repeat(32),
      DATABASE_URL: 'postgresql://example',
    }, exit as never, log);
    expect(exit).not.toHaveBeenCalled();
  });

  it('PH-CFG04 warns only outside production', () => {
    const exit = vi.fn();
    const log = { warn: vi.fn(), error: vi.fn() };
    validateProductionConfig({ NODE_ENV: 'development' }, exit as never, log);
    expect(exit).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('PH-RID01/02 preserves valid request ids', () => {
    expect(sanitizeRequestId('abc-123_ok.v1')).toBe('abc-123_ok.v1');
  });

  it('PH-RID03 generates a UUID when request id is missing', () => {
    expect(sanitizeRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('PH-RID04 rejects malicious request ids', () => {
    const generated = sanitizeRequestId(`bad\n${'x'.repeat(200)}`);
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('PH-ERR01 hides unknown 5xx messages', () => {
    const result = classifyError(Object.assign(new Error('db password leaked'), { statusCode: 500 }));
    expect(result.statusCode).toBe(500);
    expect(result.clientMessage).toBe('Internal Server Error');
    expect(result.includeStack).toBe(true);
  });

  it('PH-ERR02 maps known AI errors to safe status codes', () => {
    expect(classifyError(new AiPrivacyDeniedError()).statusCode).toBe(403);
    expect(classifyError(new AiProviderUrlPolicyError('blocked')).statusCode).toBe(403);
    expect(classifyError(new AiRateLimitedError('org-a')).statusCode).toBe(429);
    expect(classifyError(new AiCircuitOpenError('anthropic')).statusCode).toBe(503);
  });

  it('PH-ERR03 maps validation errors to 400', () => {
    const result = classifyError(Object.assign(new Error('body invalid'), { validation: [] }));
    expect(result.statusCode).toBe(400);
    expect(result.includeStack).toBe(false);
  });
});
