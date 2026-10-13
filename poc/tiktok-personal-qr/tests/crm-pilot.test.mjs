// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotSessionState, publishPilotHeartbeat, reconcilePilot } from '../src/crm-pilot.mjs';

const cfg = {
  accountId: '00000000-0000-4000-8000-000000000001',
  epoch: '3',
  secret: 'p'.repeat(32),
  heartbeatEndpoint: 'http://127.0.0.1:9000/internal/channel-workers/pilot/heartbeat',
  reconcileEndpoint: 'http://127.0.0.1:9000/internal/channel-workers/pilot/reconcile',
};

test('maps worker session states without claiming a live session', () => {
  assert.equal(pilotSessionState('connected'), 'authenticated');
  assert.equal(pilotSessionState('session_expired'), 'expired');
  assert.equal(pilotSessionState('needs_verification'), 'challenge');
  assert.equal(pilotSessionState('identity_mismatch'), 'error');
});

test('publishes bounded resource counters and no session material', async () => {
  let payload;
  await publishPilotHeartbeat(cfg, 'connected', { data: { messages: { a: {} }, commands: {} } }, async (_url, init) => {
    payload = JSON.parse(init.body);
    assert.equal(init.headers['x-channel-nonce'], `heartbeat:${cfg.accountId}`);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  assert.equal(payload.sessionState, 'authenticated');
  assert.equal(payload.ledgerMessages, 1);
  assert.equal('cookie' in payload, false);
  assert.equal('profile' in payload, false);
});

test('reconciliation sends stable IDs only', async () => {
  let payload;
  const result = await reconcilePilot(cfg, {
    data: {
      messages: { a: { id: 'message-1' }, b: { id: 'message-1' }, c: { id: 'message-2' } },
      commands: {},
      crmCommands: { '00000000-0000-4000-8000-000000000099': { claimedAt: '2026-10-13T00:00:00.000Z' } },
    },
  }, async (_url, init) => {
    payload = JSON.parse(init.body);
    return { ok: true, json: async () => ({ missingInCrm: 0 }) };
  });
  assert.deepEqual(payload.messageIds, ['message-1', 'message-2']);
  assert.equal(payload.commandIds.length, 1);
  assert.equal(result.missingInCrm, 0);
});
