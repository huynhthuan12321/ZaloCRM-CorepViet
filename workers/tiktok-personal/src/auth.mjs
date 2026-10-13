// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { createHmac } from 'node:crypto';

export function accountSecret(master, accountId) {
  return createHmac('sha256', master)
    .update(`tiktok-personal-worker:${accountId}`)
    .digest('hex');
}

export function signedHeaders(body, nonce, config, contentType) {
  const timestamp = Date.now().toString();
  return {
    'content-type': contentType,
    'x-channel-timestamp': timestamp,
    'x-channel-nonce': nonce,
    'x-channel-signature': createHmac('sha256', accountSecret(config.secret, config.accountId))
      .update(`${timestamp}.${nonce}.${body}`)
      .digest('hex'),
  };
}
