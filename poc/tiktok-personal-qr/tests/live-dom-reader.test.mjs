// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readSelectedThread } from '../src/live-dom-reader.mjs';
const row = (id, sender, text) => `<div data-e2e="dm-new-chat-item"><a href="/@${sender}">Avatar</a><div data-e2e="dm-new-message-text">${text}</div><div id="more-action-icon-msg-${id}"></div></div>`;
test('selected-thread DOM: real-shaped fixture IDs, direction, text opt-in and explicit unknowns', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<a href="/@test_owner">Profile</a><div id="main-content-messages"><div data-e2e="dm-new-message-list">${row('90071992547409930', 'test_owner', 'same')}${row('90071992547409931', 'test_peer', 'same')}</div></div>`);
    const read = (options = {}) => page.evaluate(({ source, options }) => (0, eval)(`(${source})`)(document, options), { source: readSelectedThread.toString(), options: { expectedUsername: 'test_owner', ...options } });
    const metadata = await read();
    assert.equal(metadata.status, 'observed'); assert.equal(metadata.messages.length, 2);
    assert.equal(metadata.messages[0].externalMessageId, '90071992547409930');
    assert.deepEqual(metadata.messages.map(m => m.direction), ['self', 'inbound']);
    assert.deepEqual(metadata.messages.map(m => m.text), [null, null]);
    const content = await read({ includeText: true }); assert.deepEqual(content.messages.map(m => m.text), ['same', 'same']);
    await page.setContent('<a href="/@test_owner">Profile</a><div id="main-content-messages"><a href="/@test_peer">Peer</a><div data-e2e="dm-new-message-list">'+row('12','test_peer','[This message type isn’t supported. Download TikTok app to view this message.]')+'</div></div>');
    const unsupported = await read({ includeText: true, expectedPeerUsername: 'test_peer' });
    assert.equal(unsupported.status, 'partial'); assert.equal(unsupported.messages[0].contentType, 'unsupported'); assert.equal(unsupported.messages[0].text, null);
    await assert.rejects(() => read({ expectedPeerUsername: 'wrong_peer' }), /THREAD_MISMATCH/);
    await page.setContent('<a href="/@test_owner">Profile</a><div id="main-content-messages"><div data-e2e="dm-new-message-list">'+row('11','test_peer','text')+row('11','test_peer','text')+row('invalid','test_peer','text')+'</div></div>');
    const partial = await read(); assert.equal(partial.status, 'partial'); assert.equal(partial.messages.length, 1);
    assert.ok(partial.issues.includes('DUPLICATE_MESSAGE_ID')); assert.ok(partial.issues.includes('MESSAGE_ID_MISSING_OR_AMBIGUOUS'));
    await page.setContent('<a href="/@test_owner">Profile</a>'); assert.equal((await read()).status, 'no_selected_thread');
    await assert.rejects(() => read({ expectedUsername: 'another_account' }), /ACCOUNT_NOT_OBSERVED/);
  } finally { await browser.close(); }
});
