// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { channelEnvelope, crmBridgeConfig, publishLedgerToCrm } from '../src/crm-bridge.mjs';
import { workerAccountSecret } from '../src/worker-auth.mjs';

const secret = 'a'.repeat(32);
const accountId = '00000000-0000-4000-8000-000000000001';

test('bridge remains disabled unless explicitly configured', () => {
  assert.equal(crmBridgeConfig({}), null);
  assert.throws(() => crmBridgeConfig({
    CRM_BRIDGE_URL: 'https://example.com',
    CRM_CHANNEL_ACCOUNT_ID: accountId,
    CRM_CHANNEL_EPOCH: '1',
    MOCK_CHANNEL_WORKER_SECRET: secret,
  }), /LOOPBACK_ONLY/);
});

test('publishes a signed read-only observation with stable IDs', async () => {
  const cfg = crmBridgeConfig({
    CRM_BRIDGE_URL: 'http://127.0.0.1:9000',
    CRM_CHANNEL_ACCOUNT_ID: accountId,
    CRM_CHANNEL_EPOCH: '2',
    MOCK_CHANNEL_WORKER_SECRET: secret,
  });
  const message = {
    id: 'message-1', threadId: 'thread-1', direction: 'inbound',
    text: 'TT05 inbound', sentAt: '2026-10-13T01:00:00.000Z',
  };
  const expected = channelEnvelope(message, cfg, '2026-10-13T01:01:00.000Z');
  assert.equal(expected.eventKey, 'mock:thread-1:message-1');
  let request;
  await publishLedgerToCrm([message], cfg, async (url, init) => {
    request = { url, ...init };
    return { ok: true, status: 202 };
  });
  const timestamp = request.headers['x-channel-timestamp'];
  const nonce = request.headers['x-channel-nonce'];
  const expectedSignature = createHmac('sha256', workerAccountSecret(secret, accountId))
    .update(`${timestamp}.${nonce}.${request.body}`)
    .digest('hex');
  assert.equal(request.headers['x-channel-signature'], expectedSignature);
  assert.equal(JSON.parse(request.body).message.text, 'TT05 inbound');
  assert.equal(request.url, 'http://127.0.0.1:9000/internal/channel-workers/events');
});
