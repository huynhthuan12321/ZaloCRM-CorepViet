// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ledger } from '../src/ledger.mjs';
import { ReadCheckpoint } from '../src/read-checkpoint.mjs';
import { root } from '../src/config.mjs';
test('read-only checkpoint: IDs persist, history adds observations, gaps stay explicit and content excluded', async () => {
  await mkdir(path.join(root, 'runtime'), { recursive: true });
  const dir = await mkdtemp(path.join(root, 'runtime', 'read-checkpoint-'));
  try {
    const file = path.join(dir, 'ledger.json');
    let ledger = await new Ledger(file, 'fixture_account').load();
    const make = () => new ReadCheckpoint({ ledger, expectedUsername: 'fixture_owner', expectedPeerUsername: 'fixture_peer', threadKey: 'fixture_thread' });
    let reader = make();
    const snapshot = { status: 'partial', scope: 'rendered_dom_only', accountUsername: 'fixture_owner', peerUsername: 'fixture_peer', issues: ['TEXT_UNSUPPORTED_OR_AMBIGUOUS'], messages: [
      { externalMessageId: '90071992547409931', direction: 'inbound', contentType: 'text', text: 'private-text-marker' },
      { externalMessageId: '90071992547409932', direction: 'self', contentType: 'unsupported', text: null },
    ] };
    assert.equal((await reader.observe(snapshot)).newlyObserved, 2);
    assert.equal((await reader.observe(snapshot)).newlyObserved, 0);
    await reader.markUnavailable('WORKER_RESTART');
    ledger = await new Ledger(file, 'fixture_account').load(); reader = make();
    const restored = await reader.observe(snapshot);
    assert.equal(restored.newlyObserved, 0); assert.equal(restored.totalObserved, 2); assert.equal(restored.coverageGapPossible, true);
    const expanded = { ...snapshot, messages: [...snapshot.messages, { externalMessageId: '90071992547409930', direction: 'inbound', contentType: 'text' }] };
    const history = await reader.observe(expanded); assert.equal(history.newlyObserved, 1); assert.equal(history.historyComplete, false);
    await assert.rejects(() => reader.observe({ ...snapshot, peerUsername: 'wrong_peer' }), /SCOPE/);
    await assert.rejects(() => reader.observe({ ...snapshot, status: 'no_selected_thread' }), /NOT_READY/);
    await assert.rejects(() => reader.observe({ ...snapshot, messages: [snapshot.messages[0], snapshot.messages[0]] }), /DUPLICATE/);
    assert.equal(Object.keys(ledger.data.readCheckpoints.fixture_thread.ids).length, 3);
    const saved = await readFile(file, 'utf8'); assert.equal(saved.includes('private-text-marker'), false);
    assert.equal(Object.values(ledger.data.readCheckpoints.fixture_thread.ids).some(record => Object.hasOwn(record, 'text')), false);
    assert.deepEqual(ledger.data.commands, {}); // No outbound command created.
  } finally {
    if (!path.resolve(dir).startsWith(path.resolve(root, 'runtime') + path.sep)) throw Error('UNSAFE_CLEANUP');
    await rm(dir, { recursive: true, force: true });
  }
});
