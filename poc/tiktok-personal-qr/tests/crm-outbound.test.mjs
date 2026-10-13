// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimCrmCommand, executeCrmCommand } from '../src/crm-outbound.mjs';

const cfg = {
  accountId: '00000000-0000-4000-8000-000000000001',
  epoch: '2',
  secret: 'a'.repeat(32),
  claimEndpoint: 'http://127.0.0.1:9000/internal/channel-workers/commands/claim',
  resultEndpoint: 'http://127.0.0.1:9000/internal/channel-workers/commands',
};

test('claim returns null on an empty outbox', async () => {
  const result = await claimCrmCommand(cfg, async (_url, init) => {
    assert.equal(init.headers['x-channel-nonce'], `claim:${cfg.accountId}:${cfg.epoch}`);
    return { status: 204, ok: true };
  });
  assert.equal(result, null);
});

test('executes the CRM command ID and reports fixture confirmation', async () => {
  const calls = [];
  const result = await executeCrmCommand({
    cfg,
    command: { commandId: 'command-1', text: 'TT06', threadId: 'thread-1' },
    browser: {
      send: async input => {
        assert.equal(input.commandId, 'command-1');
        return { commandId: 'command-1', messageId: 'fixture-message-1' };
      },
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.deepEqual(result, { kind: 'confirmed', externalMessageId: 'fixture-message-1' });
  assert.equal(JSON.parse(calls[0].init.body).result.kind, 'confirmed');
});

test('reports unknown once when browser outcome is uncertain', async () => {
  let reports = 0;
  const result = await executeCrmCommand({
    cfg,
    command: { commandId: 'command-2', text: 'TT06 unknown' },
    browser: { send: async () => { throw Error('lost ack'); } },
    fetchImpl: async () => {
      reports++;
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.equal(result.kind, 'unknown');
  assert.equal(reports, 1);
});
