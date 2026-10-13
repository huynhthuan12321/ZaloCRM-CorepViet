// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { signedHeaders } from './auth.mjs';

async function postSigned(config, path, nonce, payload, contentType, fetchImpl = fetch) {
  const body = JSON.stringify(payload);
  const response = await fetchImpl(new URL(path, config.crmOrigin), {
    method: 'POST',
    headers: signedHeaders(body, nonce, config, contentType),
    body,
  });
  if (!response.ok) {
    const error = new Error(`CRM_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export function sessionPayload(config, observation) {
  return {
    accountId: config.accountId,
    epoch: config.epoch,
    state: observation.state,
    observedAt: observation.observedAt ?? new Date().toISOString(),
    ...(observation.qrDataUrl ? { qrDataUrl: observation.qrDataUrl } : {}),
    ...(observation.identityUsername ? { identityUsername: observation.identityUsername } : {}),
    ...(observation.errorCode ? { errorCode: observation.errorCode } : {}),
  };
}

export async function publishSession(config, observation, fetchImpl = fetch) {
  const payload = sessionPayload(config, observation);
  return postSigned(
    config,
    '/internal/channel-workers/tiktok/session',
    `session:${config.accountId}:${config.epoch}`,
    payload,
    'application/vnd.zalocrm.tiktok-session+json',
    fetchImpl,
  );
}

export async function claimSessionControl(config, fetchImpl = fetch) {
  return postSigned(
    config,
    '/internal/channel-workers/tiktok/control/claim',
    `control:${config.accountId}`,
    { accountId: config.accountId },
    'application/vnd.zalocrm.tiktok-control+json',
    fetchImpl,
  );
}

export function eventEnvelope(config, thread, message, observedAt = new Date().toISOString()) {
  return {
    version: 1,
    eventKey: `tiktok:${thread.id}:${message.externalMessageId}`,
    accountId: config.accountId,
    epoch: config.epoch,
    kind: 'message.observed',
    observedAt,
    thread: {
      id: thread.id,
      ...(thread.displayName ? { displayName: thread.displayName } : {}),
    },
    sender: {
      externalUserId: thread.peerUsername ?? `thread:${thread.id}`,
      ...(thread.displayName ? { displayName: thread.displayName } : {}),
    },
    message: {
      id: message.externalMessageId,
      direction: message.direction,
      text: message.text,
    },
  };
}

export async function publishEvent(config, thread, message, fetchImpl = fetch) {
  const payload = eventEnvelope(config, thread, message);
  return postSigned(
    config,
    '/internal/channel-workers/events',
    payload.eventKey,
    payload,
    'application/vnd.zalocrm.channel-event+json',
    fetchImpl,
  );
}

export async function claimCommand(config, fetchImpl = fetch) {
  const payload = { accountId: config.accountId, epoch: config.epoch };
  return (await postSigned(
    config,
    '/internal/channel-workers/commands/claim',
    `claim:${config.accountId}:${config.epoch}`,
    payload,
    'application/vnd.zalocrm.channel-command+json',
    fetchImpl,
  ))?.command ?? null;
}

export async function reportCommand(config, commandId, result, fetchImpl = fetch) {
  return postSigned(
    config,
    `/internal/channel-workers/commands/${commandId}/result`,
    `result:${commandId}`,
    { accountId: config.accountId, epoch: config.epoch, result },
    'application/vnd.zalocrm.channel-command+json',
    fetchImpl,
  );
}
