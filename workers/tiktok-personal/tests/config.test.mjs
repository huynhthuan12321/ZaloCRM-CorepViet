// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/config.mjs';

const base = {
  CRM_CHANNEL_ACCOUNT_ID: '11111111-1111-4111-8111-111111111111',
  CRM_CHANNEL_EPOCH: '1',
  TIKTOK_EXPECTED_USERNAME: '@shop_demo',
  TIKTOK_PERSONAL_WORKER_SECRET: 'x'.repeat(32),
  CRM_BRIDGE_URL: 'http://app:3000',
  TIKTOK_WORKER_DATA_DIR: './runtime',
};

test('resolves a one-account live worker without exposing credentials in paths', () => {
  const cfg = resolveConfig(base);
  assert.equal(cfg.expectedUsername, 'shop_demo');
  assert.match(cfg.profileDir, /11111111-1111-4111-8111-111111111111$/);
});

test('rejects missing identity and weak worker secret', () => {
  assert.throws(() => resolveConfig({ ...base, TIKTOK_EXPECTED_USERNAME: '' }));
  assert.throws(() => resolveConfig({ ...base, TIKTOK_PERSONAL_WORKER_SECRET: 'short' }));
});
