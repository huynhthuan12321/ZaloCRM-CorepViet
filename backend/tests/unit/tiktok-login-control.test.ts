// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { afterEach, describe, expect, it } from 'vitest';
import {
  claimTikTokLoginAction,
  queueTikTokLoginAction,
  resetTikTokLoginActionsForTests,
} from '../../src/modules/channels/tiktok-login-control.js';

const accountId = '11111111-1111-4111-8111-111111111111';

afterEach(resetTikTokLoginActionsForTests);

describe('TikTok one-time login control', () => {
  it('delivers a password once and never returns it again', () => {
    queueTikTokLoginAction(accountId, '10', {
      method: 'password',
      identifier: 'shop@example.com',
      password: 'one-time-secret',
    }, 1_000, 5_000);

    expect(claimTikTokLoginAction(accountId, '10', 2_000)).toMatchObject({
      method: 'password',
      identifier: 'shop@example.com',
      password: 'one-time-secret',
    });
    expect(claimTikTokLoginAction(accountId, '10', 2_001)).toBeNull();
  });

  it('drops expired and stale-epoch actions', () => {
    queueTikTokLoginAction(accountId, '10', { method: 'qr' }, 1_000, 100);
    expect(claimTikTokLoginAction(accountId, '10', 1_101)).toBeNull();

    queueTikTokLoginAction(accountId, '11', { method: 'qr' }, 2_000, 5_000);
    expect(claimTikTokLoginAction(accountId, '12', 2_001)).toBeNull();
  });
});
