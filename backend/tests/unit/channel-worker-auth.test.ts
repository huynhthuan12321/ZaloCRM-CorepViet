// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  deriveChannelWorkerSecret,
  deriveMockWorkerSecret,
  mockWorkerSecret,
  verifyChannelWorkerRequest,
  verifyMockWorkerRequest,
} from '../../src/modules/channels/worker-auth.js';

const secret = 's'.repeat(32);
const accountId = '00000000-0000-4000-8000-000000000001';
const otherAccountId = '00000000-0000-4000-8000-000000000002';
const body = `{"accountId":"${accountId}","eventKey":"event-1"}`;
const timestamp = '1791853200000';
const nonce = 'event-1';
const accountSecret = deriveMockWorkerSecret(accountId, { NODE_ENV: 'test', MOCK_CHANNEL_WORKER_SECRET: secret })!;
const signature = createHmac('sha256', accountSecret).update(`${timestamp}.${nonce}.${body}`).digest('hex');

describe('mock channel worker authentication', () => {
  it('is unavailable in production and rejects short or missing secrets', () => {
    expect(mockWorkerSecret({ NODE_ENV: 'production', MOCK_CHANNEL_WORKER_SECRET: secret })).toBeNull();
    expect(mockWorkerSecret({ NODE_ENV: 'test', MOCK_CHANNEL_WORKER_SECRET: 'short' })).toBeNull();
  });

  it('accepts a current signed request and rejects body, nonce and time changes', () => {
    const env = { NODE_ENV: 'test', MOCK_CHANNEL_WORKER_SECRET: secret };
    expect(verifyMockWorkerRequest(body, { signature, timestamp, nonce }, accountId, env, Number(timestamp))).toEqual({
      valid: true,
      nonce,
    });
    expect(verifyMockWorkerRequest(body + ' ', { signature, timestamp, nonce }, accountId, env, Number(timestamp))).toMatchObject({
      valid: false,
      reason: 'bad_signature',
    });
    expect(verifyMockWorkerRequest(body, { signature, timestamp, nonce: 'other' }, accountId, env, Number(timestamp))).toMatchObject({
      valid: false,
      reason: 'bad_signature',
    });
    expect(verifyMockWorkerRequest(body, { signature, timestamp, nonce }, accountId, env, Number(timestamp) + 300_001)).toMatchObject({
      valid: false,
      reason: 'timestamp_out_of_window',
    });
    expect(verifyMockWorkerRequest(body, { signature, timestamp, nonce }, otherAccountId, env, Number(timestamp))).toMatchObject({
      valid: false,
      reason: 'bad_signature',
    });
  });

  it('derives and verifies a production TikTok worker secret per account', () => {
    const env = { NODE_ENV: 'production', TIKTOK_PERSONAL_WORKER_SECRET: secret };
    const derived = deriveChannelWorkerSecret(accountId, 'TIKTOK_WEB_SESSION', env)!;
    const liveSignature = createHmac('sha256', derived)
      .update(`${timestamp}.${nonce}.${body}`)
      .digest('hex');
    expect(derived).not.toBe(secret);
    expect(verifyChannelWorkerRequest(
      body,
      { signature: liveSignature, timestamp, nonce },
      accountId,
      'TIKTOK_WEB_SESSION',
      env,
      Number(timestamp),
    )).toEqual({ valid: true, nonce });
    expect(verifyChannelWorkerRequest(
      body,
      { signature: liveSignature, timestamp, nonce },
      otherAccountId,
      'TIKTOK_WEB_SESSION',
      env,
      Number(timestamp),
    )).toMatchObject({ valid: false, reason: 'bad_signature' });
  });
});
