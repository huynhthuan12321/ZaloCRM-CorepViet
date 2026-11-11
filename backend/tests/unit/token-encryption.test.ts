import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptToken,
  describeTokenKeyProblem,
  encryptToken,
  tokenKeyEnvName,
} from '../../src/modules/integrations/_shared/token-encryption.util.js';

// Khoá + blob TEST cố định (không phải secret thật). Blob sinh độc lập bằng node:crypto
// theo format base64(IV12 ‖ TAG16 ‖ CT) — khoá lại tương thích dữ liệu app_settings đang có.
const KEY_V1 = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const KEY_V2 = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
const GOLDEN_PLAINTEXT = 'sk-golden-vector-ảnh-🔑';
const GOLDEN_BLOB = 'oaKjpKWmp6ipqqusF+nS2Me7aPBELKEyYTpsVVWEqgibOVoK4FPEFTe2owFPdpCMGS15d30Lpg==';

const ENV_NAMES = ['TOKEN_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEY_V2'];
let saved: Record<string, string | undefined> = {};

describe('token-encryption.util', () => {
  beforeEach(() => {
    saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
    process.env.TOKEN_ENCRYPTION_KEY = KEY_V1;
    delete process.env.TOKEN_ENCRYPTION_KEY_V2;
  });

  afterEach(() => {
    for (const name of ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('TE-01 decrypts the golden vector (existing stored format unchanged)', () => {
    expect(decryptToken(GOLDEN_BLOB)).toBe(GOLDEN_PLAINTEXT);
  });

  it('TE-02 round-trips unicode with random IV', () => {
    const a = encryptToken('EAAB-page-token-ví-dụ');
    const b = encryptToken('EAAB-page-token-ví-dụ');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('EAAB-page-token-ví-dụ');
  });

  it('TE-02b empty plaintext is not decryptable (pre-existing behaviour, kept unchanged)', () => {
    // Hành vi có từ trước PR-00: blob rỗng CT bị coi là corrupted. Caller không được lưu secret rỗng.
    expect(() => decryptToken(encryptToken(''))).toThrow(/too short/);
  });

  it('TE-03 output layout is IV(12)+TAG(16)+CT and never contains plaintext', () => {
    const blob = encryptToken('abc');
    expect(Buffer.from(blob, 'base64').length).toBe(12 + 16 + 3);
    expect(blob).not.toContain('abc');
  });

  it('TE-04 rejects tampered ciphertext and auth tag', () => {
    const buf = Buffer.from(encryptToken('secret-value'), 'base64');
    const ct = Buffer.from(buf); ct[ct.length - 1] ^= 0x01;
    const tag = Buffer.from(buf); tag[12] ^= 0x01;
    expect(() => decryptToken(ct.toString('base64'))).toThrow();
    expect(() => decryptToken(tag.toString('base64'))).toThrow();
  });

  it('TE-05 rejects decrypt with the wrong key', () => {
    const blob = encryptToken('secret-value');
    process.env.TOKEN_ENCRYPTION_KEY = KEY_V2;
    expect(() => decryptToken(blob)).toThrow();
  });

  it('TE-06 rejects empty / short blobs', () => {
    expect(() => decryptToken('')).toThrow(/non-empty/);
    expect(() => decryptToken(Buffer.alloc(28).toString('base64'))).toThrow(/too short/);
  });

  it('TE-07 key version 2 uses TOKEN_ENCRYPTION_KEY_V2 and does not fall back to v1', () => {
    expect(() => encryptToken('x', 2)).toThrow(/TOKEN_ENCRYPTION_KEY_V2 is not set/);
    process.env.TOKEN_ENCRYPTION_KEY_V2 = KEY_V2;
    const v2 = encryptToken('rotated', 2);
    expect(decryptToken(v2, 2)).toBe('rotated');
    expect(() => decryptToken(v2, 1)).toThrow();
    expect(decryptToken(GOLDEN_BLOB, 1)).toBe(GOLDEN_PLAINTEXT);
  });

  it('TE-08 rejects invalid key versions', () => {
    expect(() => tokenKeyEnvName(0)).toThrow();
    expect(() => tokenKeyEnvName(1.5)).toThrow();
    expect(tokenKeyEnvName(1)).toBe('TOKEN_ENCRYPTION_KEY');
    expect(tokenKeyEnvName(3)).toBe('TOKEN_ENCRYPTION_KEY_V3');
  });

  it('TE-09 missing, wrong-length or non-hex key fails closed without leaking the value', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken('x')).toThrow(/TOKEN_ENCRYPTION_KEY is not set/);
    process.env.TOKEN_ENCRYPTION_KEY = 'abc123';
    expect(() => encryptToken('x')).toThrow(/length 6/);
    const nonHex = 'z'.repeat(64);
    process.env.TOKEN_ENCRYPTION_KEY = nonHex;
    try {
      encryptToken('x');
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/hex characters/);
      expect((error as Error).message).not.toContain(nonHex);
    }
  });

  it('TE-10 describeTokenKeyProblem accepts upper/lower hex 64', () => {
    expect(describeTokenKeyProblem('K', KEY_V1)).toBeNull();
    expect(describeTokenKeyProblem('K', KEY_V1.toUpperCase())).toBeNull();
    expect(describeTokenKeyProblem('K', undefined)).toBe('K is not set');
  });
});
