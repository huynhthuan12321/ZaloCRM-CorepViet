// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import test from 'node:test';
import assert from 'node:assert/strict';
import { openQrLogin } from '../src/qr-login.mjs';

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

  assert.equal(await openQrLogin(page), true);
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

  assert.equal(await openQrLogin(page), false);
  assert.equal(hidden.clicked, undefined);
});
