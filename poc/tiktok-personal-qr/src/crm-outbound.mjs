// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { createHmac } from 'node:crypto';
import { workerAccountSecret } from './worker-auth.mjs';

function signedHeaders(body, nonce, secret, accountId) {
  const timestamp = Date.now().toString();
  return {
    'content-type': 'application/vnd.zalocrm.channel-command+json',
    'x-channel-timestamp': timestamp,
    'x-channel-nonce': nonce,
    'x-channel-signature': createHmac('sha256', workerAccountSecret(secret, accountId))
      .update(`${timestamp}.${nonce}.${body}`)
      .digest('hex'),
  };
}

export async function claimCrmCommand(cfg, fetchImpl = fetch) {
  const body = JSON.stringify({ accountId: cfg.accountId, epoch: cfg.epoch });
  const nonce = `claim:${cfg.accountId}:${cfg.epoch}`;
  const response = await fetchImpl(cfg.claimEndpoint, {
    method: 'POST',
    headers: signedHeaders(body, nonce, cfg.secret, cfg.accountId),
    body,
  });
  if (response.status === 204) return null;
  if (!response.ok) throw Error(`CRM_CLAIM_${response.status}`);
  return (await response.json()).command;
}

export async function reportCrmCommand(cfg, commandId, result, fetchImpl = fetch) {
  const body = JSON.stringify({ accountId: cfg.accountId, epoch: cfg.epoch, result });
  const nonce = `result:${commandId}`;
  const response = await fetchImpl(`${cfg.resultEndpoint}/${commandId}/result`, {
    method: 'POST',
    headers: signedHeaders(body, nonce, cfg.secret, cfg.accountId),
    body,
  });
  if (!response.ok) throw Error(`CRM_RESULT_${response.status}`);
  return response.json();
}

export async function executeCrmCommand({ cfg, command, browser, fetchImpl = fetch, fault = '' }) {
  let result;
  try {
    const ack = await browser.send({ commandId: command.commandId, text: command.text, fault });
    result = ack.commandId === command.commandId && ack.messageId
      ? { kind: 'confirmed', externalMessageId: ack.messageId }
      : ack.rejected === true
        ? { kind: 'rejected', errorCode: ack.errorCode ?? 'MOCK_REJECTED' }
        : { kind: 'unknown', errorCode: 'MOCK_ACK_INVALID' };
  } catch {
    result = { kind: 'unknown', errorCode: 'MOCK_TRANSPORT_UNCERTAIN' };
  }
  await reportCrmCommand(cfg, command.commandId, result, fetchImpl);
  return result;
}
