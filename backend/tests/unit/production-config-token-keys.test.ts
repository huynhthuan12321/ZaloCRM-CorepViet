import { describe, expect, it, vi } from 'vitest';
import { validateProductionConfig } from '../../src/config/validate-production-config.js';

// Env production hợp lệ tối thiểu (giá trị giả). ENCRYPTION_KEY cố ý 63 ký tự KHÔNG hex —
// giống hình dạng khoá Zalo session production hiện tại, phải tiếp tục được chấp nhận.
const BASE = {
  NODE_ENV: 'production',
  JWT_SECRET: 'b'.repeat(32),
  ENCRYPTION_KEY: 'k'.repeat(63),
  DATABASE_URL: 'postgresql://example',
};

function run(env: Record<string, string | undefined>) {
  const exit = vi.fn((code: number) => { throw new Error(`exit:${code}`); });
  const log = { warn: vi.fn(), error: vi.fn() };
  let exited = false;
  try {
    validateProductionConfig(env, exit as never, log);
  } catch (error) {
    if (!String(error).includes('exit:1')) throw error;
    exited = true;
  }
  const logged = [...log.warn.mock.calls, ...log.error.mock.calls].flat().join('\n');
  return { exited, log, logged };
}

describe('production config — token keys & Messenger (PR-00)', () => {
  it('PC-01 non-hex 63-char ENCRYPTION_KEY (current prod shape) is still accepted', () => {
    expect(run({ ...BASE, TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) }).exited).toBe(false);
  });

  it('PC-02 missing TOKEN_ENCRYPTION_KEY is a warning, not fatal', () => {
    const result = run(BASE);
    expect(result.exited).toBe(false);
    expect(result.logged).toMatch(/TOKEN_ENCRYPTION_KEY is not set/);
  });

  it('PC-03 set-but-malformed TOKEN_ENCRYPTION_KEY is fatal and never logs the value', () => {
    const bad = 'x'.repeat(64);
    const result = run({ ...BASE, TOKEN_ENCRYPTION_KEY: bad });
    expect(result.exited).toBe(true);
    expect(result.logged).toMatch(/TOKEN_ENCRYPTION_KEY must contain only hex/);
    expect(result.logged).not.toContain(bad);
    expect(run({ ...BASE, TOKEN_ENCRYPTION_KEY: 'abcd' }).exited).toBe(true);
  });

  it('PC-04 malformed rotation key TOKEN_ENCRYPTION_KEY_V2 is fatal', () => {
    const result = run({ ...BASE, TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), TOKEN_ENCRYPTION_KEY_V2: 'nope' });
    expect(result.exited).toBe(true);
    expect(result.logged).toMatch(/TOKEN_ENCRYPTION_KEY_V2/);
  });

  it('PC-05 Messenger enabled but misconfigured does NOT stop the app (Zalo keeps running)', () => {
    const result = run({ ...BASE, TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), MESSENGER_ENABLED: 'true', FB_APP_SECRET: 'secret-value-not-real' });
    expect(result.exited).toBe(false);
    expect(result.logged).toMatch(/Messenger is DISABLED \(misconfigured\)/);
    expect(result.logged).not.toContain('secret-value-not-real');
  });

  it('PC-06 FB_TOKEN_ENC_KEY (deprecated) is not required', () => {
    const result = run({ ...BASE, TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) });
    expect(result.exited).toBe(false);
    expect(result.logged).not.toMatch(/FB_TOKEN_ENC_KEY/);
  });
});
