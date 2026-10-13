// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { createHmac } from 'node:crypto';
import { workerAccountSecret } from './worker-auth.mjs';

export function crmBridgeConfig(env = process.env) {
  const configured = [
    env.CRM_BRIDGE_URL,
    env.CRM_CHANNEL_ACCOUNT_ID,
    env.CRM_CHANNEL_EPOCH,
    env.MOCK_CHANNEL_WORKER_SECRET,
  ].some(Boolean);
  if (!configured) return null;
  const url = new URL(env.CRM_BRIDGE_URL ?? '');
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw Error('CRM_BRIDGE_LOOPBACK_ONLY');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(env.CRM_CHANNEL_ACCOUNT_ID ?? '')) throw Error('CRM_CHANNEL_ACCOUNT_ID_INVALID');
  if (!/^(0|[1-9]\d{0,19})$/.test(env.CRM_CHANNEL_EPOCH ?? '')) throw Error('CRM_CHANNEL_EPOCH_INVALID');
  if ((env.MOCK_CHANNEL_WORKER_SECRET ?? '').length < 32) throw Error('CRM_BRIDGE_SECRET_INVALID');
  return {
    endpoint: new URL('/internal/channel-workers/events', url).toString(),
    claimEndpoint: new URL('/internal/channel-workers/commands/claim', url).toString(),
    resultEndpoint: new URL('/internal/channel-workers/commands', url).toString(),
    heartbeatEndpoint: new URL('/internal/channel-workers/pilot/heartbeat', url).toString(),
    reconcileEndpoint: new URL('/internal/channel-workers/pilot/reconcile', url).toString(),
    accountId: env.CRM_CHANNEL_ACCOUNT_ID,
    epoch: env.CRM_CHANNEL_EPOCH,
    secret: env.MOCK_CHANNEL_WORKER_SECRET,
  };
}

export function channelEnvelope(message, cfg, observedAt = new Date().toISOString()) {
  return {
    version: 1,
    eventKey: `mock:${message.threadId}:${message.id}`,
    accountId: cfg.accountId,
    epoch: cfg.epoch,
    kind: 'message.observed',
    observedAt,
    thread: { id: message.threadId, displayName: 'Khách thử TT05' },
    sender: { externalUserId: 'mock-customer-01', displayName: 'Khách thử TT05' },
    message: {
      id: message.id,
      direction: message.direction,
      text: message.text,
      sentAt: message.sentAt,
    },
  };
}

export async function publishLedgerToCrm(messages, cfg, fetchImpl = fetch) {
  if (!cfg) return { accepted: 0 };
  const signingSecret = workerAccountSecret(cfg.secret, cfg.accountId);
  let accepted = 0;
  for (const message of messages) {
    const envelope = channelEnvelope(message, cfg);
    const body = JSON.stringify(envelope);
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', signingSecret)
      .update(`${timestamp}.${envelope.eventKey}.${body}`)
      .digest('hex');
    const response = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.zalocrm.channel-event+json',
        'x-channel-timestamp': timestamp,
        'x-channel-nonce': envelope.eventKey,
        'x-channel-signature': signature,
      },
      body,
    });
    if (!response.ok) throw Error(`CRM_INGRESS_${response.status}`);
    accepted++;
  }
  return { accepted };
}
