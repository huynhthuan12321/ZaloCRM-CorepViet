// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { Ledger } from '../src/ledger.mjs';
import { Session } from '../src/session.mjs';
import { SendController } from '../src/send-controller.mjs';
import { ACCOUNT, root } from '../src/config.mjs';
async function fixture(run) {
  await mkdir(path.join(root, 'runtime'), { recursive: true });
  const dir = await mkdtemp(path.join(root, 'runtime', 'ledger-test-'));
  try { await run(path.join(dir, 'ledger.json')); }
  finally { if (!path.resolve(dir).startsWith(path.resolve(root, 'runtime') + path.sep)) throw Error('UNSAFE_CLEANUP'); await rm(dir, { recursive: true, force: true }); }
}
test('durable dedup preserves identical texts and recovers submitted to unknown', () => fixture(async file => {
  const ledger = await new Ledger(file, ACCOUNT).load();
  const m = { id: '1', accountId: ACCOUNT, threadId: 't', text: 'same', direction: 'inbound' };
  assert.equal(await ledger.ingest([m, { ...m, id: '2' }]), 2);
  assert.equal(await ledger.ingest([m]), 0);
  const id = await ledger.intent('send'); await ledger.transition(id, 'submitted');
  const restored = await new Ledger(file, ACCOUNT).load();
  assert.equal(Object.keys(restored.data.messages).length, 2);
  assert.equal(restored.data.commands[id].state, 'unknown');
  await assert.rejects(() => restored.transition(id, 'pending'));
  await assert.rejects(() => new Ledger(file, 'other').load());
  await assert.rejects(() => restored.ingest([{ ...m, accountId: 'other' }]));
}));
test('CRM command IDs survive worker restart for reconciliation', () => fixture(async file => {
  const ledger = await new Ledger(file, ACCOUNT).load();
  await ledger.recordCrmCommand('00000000-0000-4000-8000-000000000099');
  const restored = await new Ledger(file, ACCOUNT).load();
  assert.deepEqual(
    Object.keys(restored.data.crmCommands),
    ['00000000-0000-4000-8000-000000000099'],
  );
}));
test('timeout produces unknown without retry; echo reconciles only exact command', () => fixture(async file => {
  const ledger = await new Ledger(file, ACCOUNT).load(), session = new Session(ACCOUNT);
  let calls = 0, echo;
  const adapter = {
    snapshot: async () => ({ authenticated: true, accountId: ACCOUNT }),
    send: async cmd => { calls++; echo = { id: 'accepted', threadId: 'mock-thread-01', accountId: ACCOUNT, commandId: cmd.commandId, text: cmd.text, direction: 'self' }; throw Error('ACK_LOST'); },
    messages: async () => [echo],
  };
  const sender = new SendController({ ledger, session, adapter });
  const id = await sender.send('hello'); assert.equal(ledger.data.commands[id].state, 'unknown'); assert.equal(calls, 1);
  await sender.sync(); assert.equal(ledger.data.commands[id].state, 'confirmed'); assert.equal(calls, 1);
  await sender.sync(); assert.equal(Object.keys(ledger.data.messages).length, 1);
}));
test('wrong identity blocks before intent and double submit is rejected', () => fixture(async file => {
  const ledger = await new Ledger(file, ACCOUNT).load(), session = new Session(ACCOUNT);
  const adapter = { snapshot: async () => ({ authenticated: true, accountId: 'wrong' }), send: async () => { throw Error('MUST_NOT_CALL'); } };
  const sender = new SendController({ ledger, session, adapter });
  await assert.rejects(() => sender.send('text'), /IDENTITY/); assert.equal(Object.keys(ledger.data.commands).length, 0);
  let finish; adapter.snapshot = async () => ({ authenticated: true, accountId: ACCOUNT });
  adapter.send = cmd => new Promise(resolve => { finish = () => resolve({ commandId: cmd.commandId, messageId: 'm' }); });
  const first = sender.send('one'); await assert.rejects(() => sender.send('two'), /BUSY/);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 5)); finish(); await first;
  assert.equal(Object.keys(ledger.data.commands).length, 1);
}));
