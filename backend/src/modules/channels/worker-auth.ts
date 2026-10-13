// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { createHmac } from 'node:crypto';
import { verifyHmacRequest } from '../../shared/security/hmac.js';

const MIN_SECRET_LENGTH = 32;
type WorkerProvider = 'MOCK_BROWSER' | 'TIKTOK_WEB_SESSION';

export interface WorkerAuthHeaders {
  signature?: string;
  timestamp?: string;
  nonce?: string;
}

export function mockWorkerSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') return null;
  const secret = env.MOCK_CHANNEL_WORKER_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function deriveMockWorkerSecret(
  accountId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const master = mockWorkerSecret(env);
  if (!master || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(accountId)) return null;
  return createHmac('sha256', master)
    .update(`mock-channel-worker:${accountId}`)
    .digest('hex');
}

export function tiktokWorkerSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.TIKTOK_PERSONAL_WORKER_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function deriveChannelWorkerSecret(
  accountId: string,
  provider: WorkerProvider,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(accountId)) return null;
  if (provider === 'MOCK_BROWSER') return deriveMockWorkerSecret(accountId, env);
  const master = tiktokWorkerSecret(env);
  return master
    ? createHmac('sha256', master)
      .update(`tiktok-personal-worker:${accountId}`)
      .digest('hex')
    : null;
}

export function verifyChannelWorkerRequest(
  rawBody: string,
  headers: WorkerAuthHeaders,
  accountId: string,
  provider: WorkerProvider,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): { valid: true; nonce: string } | { valid: false; reason: string } {
  const secret = deriveChannelWorkerSecret(accountId, provider, env);
  if (!secret) return { valid: false, reason: 'worker_secret_unavailable' };
  const result = verifyHmacRequest({
    rawBody,
    signature: headers.signature,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    secret,
    now,
  });
  return result.valid
    ? { valid: true, nonce: result.nonce! }
    : { valid: false, reason: result.reason ?? 'invalid_signature' };
}

export function verifyMockWorkerRequest(
  rawBody: string,
  headers: WorkerAuthHeaders,
  accountId: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): { valid: true; nonce: string } | { valid: false; reason: string } {
  return verifyChannelWorkerRequest(rawBody, headers, accountId, 'MOCK_BROWSER', env, now);
}
