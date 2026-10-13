// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createMock } from '../mock/server.mjs';
import { launchMockBrowser } from '../src/browser-adapter.mjs';
import { Ledger } from '../src/ledger.mjs';
import { Session } from '../src/session.mjs';
import { SendController } from '../src/send-controller.mjs';
import { ACCOUNT, root } from '../src/config.mjs';
test('browser: 20 inbound, 10 outbound, native/identical messages, restart and lost ACK', async () => {
  await mkdir(path.join(root, 'runtime'), { recursive: true });
  const dir = await mkdtemp(path.join(root, 'runtime', 'messaging-test-'));
  const mock = await createMock(); let browser;
  const file = path.join(dir, 'ledger.json'), profile = path.join(dir, 'profile');
  try {
    browser = await launchMockBrowser({ origin: mock.origin, profile });
    await browser.page.waitForFunction(() => document.body.dataset.authenticated === 'false');
    await browser.page.click('#newqr'); await browser.page.waitForFunction(() => document.getElementById('qr').textContent.length > 0);
    await browser.page.click('#confirm'); await browser.page.waitForFunction(() => document.body.dataset.authenticated === 'true');
    let ledger = await new Ledger(file, ACCOUNT).load();
    let sender = new SendController({ ledger, session: new Session(ACCOUNT), adapter: browser });
    for (let i = 1; i <= 20; i++) {
      await browser.page.fill('#inject-text', `inbound-${i}`); await browser.page.click('#inject');
      await browser.page.waitForFunction(n => document.querySelectorAll('#messages article').length === n, i);
    }
    assert.equal(await sender.sync(), 20);
    assert.deepEqual(Object.values(ledger.data.messages).map(m => m.text), Array.from({ length: 20 }, (_, i) => `inbound-${i + 1}`));
    for (let i = 1; i <= 10; i++) { const id = await sender.send(`outbound-${i}`); assert.equal(ledger.data.commands[id].state, 'confirmed'); }
    await sender.sync(); assert.equal(Object.keys(ledger.data.messages).length, 30);
    await browser.page.selectOption('#inject-direction', 'self');
    for (let i = 0; i < 5; i++) { await browser.page.fill('#inject-text', 'same-native-text'); await browser.page.click('#inject'); await browser.page.waitForFunction(n => document.querySelectorAll('#messages article').length === n, 31 + i); }
    await sender.sync(); assert.equal(Object.values(ledger.data.messages).filter(m => m.source === 'native').length, 5);
    await browser.page.reload(); await browser.page.waitForFunction(() => document.body.dataset.authenticated === 'true');
    assert.equal(await sender.sync(), 0);
    const unknown = await sender.send('accepted-ack-lost', 'after_accept');
    assert.equal(ledger.data.commands[unknown].state, 'unknown');
    await browser.close();
    browser = await launchMockBrowser({ origin: mock.origin, profile }); await browser.page.waitForFunction(() => document.body.dataset.authenticated === 'true');
    ledger = await new Ledger(file, ACCOUNT).load(); sender = new SendController({ ledger, session: new Session(ACCOUNT), adapter: browser });
    await sender.sync(); assert.equal(ledger.data.commands[unknown].state, 'confirmed');
    assert.equal(Object.values(ledger.data.messages).filter(m => m.text === 'accepted-ack-lost').length, 1);
    // Lost connectivity: local reads fail; existing ledger is not cleared.
    await browser.page.route('**/api/messages', route => route.abort());
    await assert.rejects(() => sender.sync()); assert.equal(Object.keys(ledger.data.messages).length, 36);
    await browser.page.unroute('**/api/messages'); assert.equal(await sender.sync(), 0);
    await browser.page.click('#logout'); await browser.page.waitForFunction(() => document.body.dataset.authenticated === 'false');
    await assert.rejects(() => sender.send('must-not-send'), /IDENTITY/);
  } finally {
    if (browser) await browser.close(); await mock.close();
    if (!path.resolve(dir).startsWith(path.resolve(root, 'runtime') + path.sep)) throw Error('UNSAFE_CLEANUP');
    await rm(dir, { recursive: true, force: true });
  }
});
