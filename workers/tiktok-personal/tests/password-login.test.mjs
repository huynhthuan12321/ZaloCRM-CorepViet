// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPasswordLogin, passwordLoginKind } from '../src/password-login.mjs';

function fakePage() {
  const operations = [];
  const clickable = label => ({
    first() { return this; },
    async isVisible() { return true; },
    async click() { operations.push(['click', label]); },
  });
  const input = selector => ({
    first() { return this; },
    async fill(value) { operations.push(['fill', selector, value]); },
    async click() { operations.push(['click', selector]); },
  });
  return {
    operations,
    async goto(url) { operations.push(['goto', url]); },
    getByText(pattern) { return clickable(String(pattern)); },
    getByRole(_role, options) { return clickable(String(options.name)); },
    locator(selector) { return input(selector); },
  };
}

test('classifies phone identifiers separately', () => {
  assert.equal(passwordLoginKind('+84 912 345 678'), 'phone');
  assert.equal(passwordLoginKind('shop@example.com'), 'email_or_username');
  assert.equal(passwordLoginKind('shop_demo'), 'email_or_username');
});

test('fills username and password through the official TikTok login form', async () => {
  const page = fakePage();
  await openPasswordLogin(page, {
    identifier: 'shop_demo',
    password: 'one-time-secret',
  });
  assert.deepEqual(page.operations.filter(item => item[0] === 'fill'), [
    ['fill', 'input[name="username"]', 'shop_demo'],
    ['fill', 'input[type="password"]', 'one-time-secret'],
  ]);
  assert.deepEqual(page.operations.at(-1), [
    'click',
    '[data-e2e="login-button"], button[type="submit"]',
  ]);
});
