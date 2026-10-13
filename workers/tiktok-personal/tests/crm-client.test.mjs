// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventEnvelope, sessionPayload } from '../src/crm-client.mjs';

const cfg = {
  accountId: '11111111-1111-4111-8111-111111111111',
  epoch: '2',
};

test('creates stable TikTok event keys and no session credentials', () => {
  const event = eventEnvelope(cfg, {
    id: 'thread-1',
    peerUsername: 'customer',
    displayName: 'Customer',
  }, {
    externalMessageId: '90071992547409930001',
    direction: 'inbound',
    text: 'hello',
  }, '2026-10-13T00:00:00.000Z');
  assert.equal(event.eventKey, 'tiktok:thread-1:90071992547409930001');
  assert.equal(event.sender.externalUserId, 'customer');
  assert.equal(JSON.stringify(event).includes('cookie'), false);
});

test('session payload contains only QR image and observed identity', () => {
  const value = sessionPayload(cfg, {
    state: 'authenticated',
    identityUsername: 'shop_demo',
    observedAt: '2026-10-13T00:00:00.000Z',
  });
  assert.deepEqual(value, {
    accountId: cfg.accountId,
    epoch: '2',
    state: 'authenticated',
    observedAt: '2026-10-13T00:00:00.000Z',
    identityUsername: 'shop_demo',
  });
});
