// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { createHmac } from 'node:crypto';

export function workerAccountSecret(masterSecret, accountId) {
  if (typeof masterSecret !== 'string' || masterSecret.length < 32) {
    throw Error('CRM_BRIDGE_SECRET_INVALID');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(accountId ?? '')) {
    throw Error('CRM_CHANNEL_ACCOUNT_ID_INVALID');
  }
  return createHmac('sha256', masterSecret)
    .update(`mock-channel-worker:${accountId}`)
    .digest('hex');
}
