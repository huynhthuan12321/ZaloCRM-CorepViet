// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import test from 'node:test';
import assert from 'node:assert/strict';
import { openQrLogin } from '../src/qr-login.mjs';
import { classifyLoginPageText, loginRejectionReason, shouldReturnToInbox } from '../src/browser.mjs';

function candidate(visible) {
  return {
    first() { return this; },
    async isVisible() { return visible; },
    async click() { this.clicked = true; },
  };
}

test('opens TikTok QR login when the visible choice has no button role', async () => {
  const roleButton = candidate(false);
  const textChoice = candidate(true);
  const linkChoice = candidate(false);
  const page = {
    getByRole() { return roleButton; },
    getByText() { return textChoice; },
    locator() { return linkChoice; },
  };

  assert.equal(await openQrLogin(page, { timeoutMs: 0 }), true);
  assert.equal(roleButton.clicked, undefined);
  assert.equal(textChoice.clicked, true);
});

test('does not click when no QR login choice is visible', async () => {
  const hidden = candidate(false);
  const page = {
    getByRole() { return hidden; },
    getByText() { return hidden; },
    locator() { return hidden; },
  };

  assert.equal(await openQrLogin(page, { timeoutMs: 0 }), false);
  assert.equal(hidden.clicked, undefined);
});

test('classifies TikTok login rejection without exposing page text', () => {
  assert.deepEqual(classifyLoginPageText('Incorrect account or password. Try again.'), {
    state: 'error',
    errorCode: 'TIKTOK_LOGIN_REJECTED',
  });
});

test('reports rate limiting separately from rejected credentials', () => {
  assert.deepEqual(classifyLoginPageText('Too many attempts. Try again later.'),
    { state: 'error', errorCode: 'TIKTOK_LOGIN_RATE_LIMITED' });
});

test('classifies QR confirmation and expired QR states', () => {
  assert.equal(classifyLoginPageText('Log in with QR code. Confirm login or sign up'), null);
  assert.deepEqual(classifyLoginPageText('Scan successful. Confirm on your device.'), {
    state: 'challenge',
  });
  assert.deepEqual(classifyLoginPageText('QR code has expired'), {
    state: 'expired',
  });
});

test('returns successful login landing pages to inbox without navigating login or foreign pages', () => {
  assert.equal(shouldReturnToInbox('https://www.tiktok.com/foryou?lang=en', true), true);
  assert.equal(shouldReturnToInbox('https://www.tiktok.com/login/qrcode', true), false);
  assert.equal(shouldReturnToInbox('https://www.tiktok.com/messages?lang=en', true), false);
  assert.equal(shouldReturnToInbox('https://www.tiktok.com/foryou', false), false);
  assert.equal(shouldReturnToInbox('https://example.com/foryou', true), false);
});

test('diagnostics distinguish rate limiting from credentials without retaining raw text', () => {
  assert.equal(loginRejectionReason('Maximum number of attempts reached. Try again later.'), 'attempt_limit');
  assert.equal(loginRejectionReason('Incorrect account or password'), 'credentials_rejected');
  assert.equal(loginRejectionReason('Account doesn\'t exist'), 'account_not_found');
  assert.equal(loginRejectionReason('Log in with QR code'), undefined);
});
