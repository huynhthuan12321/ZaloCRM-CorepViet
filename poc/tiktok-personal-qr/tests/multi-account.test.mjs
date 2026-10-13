// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { acquireAccountLease } from '../src/account-lease.mjs';
import { createMock } from '../mock/server.mjs';
import { root } from '../src/config.mjs';

test('one lease per account while separate account leases coexist', async () => {
  await mkdir(path.join(root, 'runtime'), { recursive: true });
  const directory = await mkdtemp(path.join(root, 'runtime', 'lease-test-'));
  const firstPath = path.join(directory, 'mock-personal-01');
  const secondPath = path.join(directory, 'mock-personal-02');
  let first;
  let second;
  try {
    first = await acquireAccountLease(firstPath);
    await assert.rejects(() => acquireAccountLease(firstPath), /ACCOUNT_WORKER_ALREADY_LEASED/);
    second = await acquireAccountLease(secondPath);
    assert.notEqual(first.directory, second.directory);
  } finally {
    await first?.release();
    await second?.release();
    await rm(directory, { recursive: true, force: true });
  }
});

test('two mock servers keep account identity and messages isolated', async () => {
  const first = await createMock({ account: 'mock-personal-01' });
  const second = await createMock({ account: 'mock-personal-02' });
  const login = async (origin) => {
    const { csrf } = await (await fetch(`${origin}/api/bootstrap`)).json();
    const post = (route, body = {}, cookie = '') => fetch(`${origin}/api/${route}`, {
      method: 'POST',
      headers: { Origin: origin, 'X-Mock-CSRF': csrf, 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
    const qr = await (await post('qr')).json();
    const confirmed = await post('confirm', { ticket: qr.ticket });
    return { post, cookie: confirmed.headers.get('set-cookie').split(';')[0] };
  };
  try {
    const [a, b] = await Promise.all([login(first.origin), login(second.origin)]);
    const [sessionA, sessionB] = await Promise.all([
      fetch(`${first.origin}/api/session`, { headers: { Cookie: a.cookie } }).then(response => response.json()),
      fetch(`${second.origin}/api/session`, { headers: { Cookie: b.cookie } }).then(response => response.json()),
    ]);
    assert.equal(sessionA.accountId, 'mock-personal-01');
    assert.equal(sessionB.accountId, 'mock-personal-02');
    await Promise.all([
      a.post('inject', { text: 'account-a' }, a.cookie),
      b.post('inject', { text: 'account-b' }, b.cookie),
    ]);
    const [messagesA, messagesB] = await Promise.all([
      fetch(`${first.origin}/api/messages`, { headers: { Cookie: a.cookie } }).then(response => response.json()),
      fetch(`${second.origin}/api/messages`, { headers: { Cookie: b.cookie } }).then(response => response.json()),
    ]);
    assert.deepEqual(messagesA.messages.map(message => message.text), ['account-a']);
    assert.deepEqual(messagesB.messages.map(message => message.text), ['account-b']);
    assert(messagesA.messages.every(message => message.accountId === 'mock-personal-01'));
    assert(messagesB.messages.every(message => message.accountId === 'mock-personal-02'));
  } finally {
    await first.close();
    await second.close();
  }
});
