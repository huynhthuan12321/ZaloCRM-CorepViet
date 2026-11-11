// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * token-encryption.util.ts — AES-256-GCM cho secrets tích hợp lưu DB
 * (API key AI, token Page Facebook / TokenCredential, App secret...).
 *
 * Eng review Issue 4: token encrypt at rest. Master key trong env `TOKEN_ENCRYPTION_KEY`
 * (32 bytes hex = 64 chars). Random per-message IV. GCM auth tag chống tampering.
 *
 * Format encrypted blob: base64(IV[12] + AUTH_TAG[16] + CIPHERTEXT[N])
 * ⚠️ Format này KHÔNG được đổi — app_settings.value_encrypted (API key AI) trên
 * production đang lưu theo đúng format này (test golden vector khoá lại).
 *
 * PR-00 Messenger (2026-09-16) — đây là CƠ CHẾ DUY NHẤT cho token mới.
 *   - `shared/crypto/aes-gcm.ts` + FB_TOKEN_ENC_KEY: deprecated, không dữ liệu nào dùng.
 *   - Key versioning: blob KHÔNG tự mang version (giữ tương thích dữ liệu cũ). Bảng lưu
 *     blob tự giữ cột `key_version` và truyền vào encrypt/decrypt.
 *       version 1 → TOKEN_ENCRYPTION_KEY        (mặc định, dữ liệu hiện có)
 *       version N → TOKEN_ENCRYPTION_KEY_V<N>   (chỉ khi rotate; N ≥ 2)
 *     Rotate = thêm env V<N>, ghi mới bằng version N, re-encrypt dần bản ghi cũ.
 *     KHÔNG bao giờ thay giá trị TOKEN_ENCRYPTION_KEY đang có.
 *
 * Generate key 1 lần khi setup:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   → add vào .env: TOKEN_ENCRYPTION_KEY=<64 chars hex>
 */
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LEN = 16;
const HEX64 = /^[0-9a-fA-F]{64}$/;

export const DEFAULT_TOKEN_KEY_VERSION = 1;

/** Tên biến env chứa khoá cho một key version. */
export function tokenKeyEnvName(keyVersion: number = DEFAULT_TOKEN_KEY_VERSION): string {
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error(`token key version must be a positive integer, got ${String(keyVersion)}`);
  }
  return keyVersion === 1 ? 'TOKEN_ENCRYPTION_KEY' : `TOKEN_ENCRYPTION_KEY_V${keyVersion}`;
}

/**
 * Kiểm tra giá trị khoá. Trả null nếu hợp lệ, ngược lại trả thông báo lỗi
 * (KHÔNG chứa giá trị khoá — an toàn để log).
 */
export function describeTokenKeyProblem(name: string, value: string | undefined): string | null {
  if (value == null || value.length === 0) return `${name} is not set`;
  if (value.length !== 64) return `${name} must be 64 hex chars (32 bytes), got length ${value.length}`;
  if (!HEX64.test(value)) return `${name} must contain only hex characters [0-9a-f]`;
  return null;
}

function getKey(keyVersion: number): Buffer {
  const name = tokenKeyEnvName(keyVersion);
  const hex = process.env[name];
  const problem = describeTokenKeyProblem(name, hex);
  if (problem) {
    throw new Error(
      `${problem}. Generate via: node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"hex\\"))"`,
    );
  }
  return Buffer.from(hex as string, 'hex');
}

/** Encrypt plaintext → base64 blob bằng khoá của `keyVersion` (mặc định 1). */
export function encryptToken(plaintext: string, keyVersion: number = DEFAULT_TOKEN_KEY_VERSION): string {
  if (typeof plaintext !== 'string') throw new Error('encryptToken: plaintext must be string');
  const key = getKey(keyVersion);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: IV + AUTH_TAG + CIPHERTEXT
  return Buffer.concat([iv, authTag, ct]).toString('base64');
}

/**
 * Decrypt base64 blob → plaintext bằng khoá của `keyVersion` (mặc định 1).
 * Throw nếu auth tag mismatch (tampered or wrong key). Không tự thử khoá khác:
 * version phải lấy từ cột key_version của bản ghi.
 */
export function decryptToken(blob: string, keyVersion: number = DEFAULT_TOKEN_KEY_VERSION): string {
  if (typeof blob !== 'string' || !blob) throw new Error('decryptToken: blob must be non-empty string');
  const key = getKey(keyVersion);
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) throw new Error('decryptToken: blob too short / corrupted');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ct = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(authTag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Generate random webhook verify token (Meta yêu cầu khi subscribe).
 * Anh dán string này vào FB App config khi setup webhook.
 */
export function generateWebhookVerifyToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}
