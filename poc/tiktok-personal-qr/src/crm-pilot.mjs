// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { createHmac } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { readdir, stat } from 'node:fs/promises';
import { workerAccountSecret } from './worker-auth.mjs';

function signedHeaders(body, nonce, secret, accountId) {
  const timestamp = Date.now().toString();
  return {
    'content-type': 'application/vnd.zalocrm.channel-pilot+json',
    'x-channel-timestamp': timestamp,
    'x-channel-nonce': nonce,
    'x-channel-signature': createHmac('sha256', workerAccountSecret(secret, accountId))
      .update(`${timestamp}.${nonce}.${body}`)
      .digest('hex'),
  };
}

async function postSigned(endpoint, nonce, payload, secret, fetchImpl = fetch) {
  const body = JSON.stringify(payload);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: signedHeaders(body, nonce, secret, payload.accountId),
    body,
  });
  if (!response.ok) throw Error(`CRM_PILOT_${response.status}`);
  return response.json();
}

export function pilotSessionState(state) {
  if (state === 'connected') return 'authenticated';
  if (state === 'awaiting_qr' || state === 'disconnected') return 'qr_required';
  if (state === 'needs_verification') return 'challenge';
  if (state === 'session_expired') return 'expired';
  return 'error';
}

async function directoryBytes(directory) {
  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    const file = `${directory}/${entry.name}`;
    total += entry.isDirectory() ? await directoryBytes(file) : (await stat(file)).size;
  }
  return total;
}

export function createPilotResourceSampler({ profile, ledger }) {
  let previousCpu = process.cpuUsage();
  let previousAt = process.hrtime.bigint();
  let lastStorageAt = 0;
  let profileBytes = 0;
  let ledgerBytes = 0;
  let closed = false;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  return {
    async sample() {
      const now = process.hrtime.bigint();
      const cpu = process.cpuUsage(previousCpu);
      const elapsedMicros = Number(now - previousAt) / 1000;
      previousCpu = process.cpuUsage();
      previousAt = now;
      if (Date.now() - lastStorageAt >= 60_000 || lastStorageAt === 0) {
        [profileBytes, ledgerBytes] = await Promise.all([
          directoryBytes(profile),
          stat(ledger).then(value => value.size).catch(error => error?.code === 'ENOENT' ? 0 : Promise.reject(error)),
        ]);
        lastStorageAt = Date.now();
      }
      const eventLoopP95Ms = Number.isFinite(loop.percentile(95)) ? loop.percentile(95) / 1e6 : 0;
      loop.reset();
      return {
        cpuPercent: elapsedMicros > 0 ? ((cpu.user + cpu.system) / elapsedMicros) * 100 : 0,
        eventLoopP95Ms,
        profileBytes,
        ledgerBytes,
      };
    },
    close() {
      if (closed) return;
      loop.disable();
      closed = true;
    },
  };
}

export async function publishPilotHeartbeat(cfg, sessionState, ledger, sampler, fetchImpl = fetch) {
  if (typeof sampler === 'function') {
    fetchImpl = sampler;
    sampler = { sample: async () => ({ cpuPercent: 0, eventLoopP95Ms: 0, profileBytes: 0, ledgerBytes: 0 }) };
  }
  const memory = process.memoryUsage();
  const resources = await sampler.sample();
  const payload = {
    accountId: cfg.accountId,
    epoch: cfg.epoch,
    sessionState: pilotSessionState(sessionState),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    ...resources,
    ledgerMessages: Object.keys(ledger.data.messages).length,
    ledgerCommands: Object.keys(ledger.data.commands).length,
    observedAt: new Date().toISOString(),
  };
  return postSigned(cfg.heartbeatEndpoint, `heartbeat:${cfg.accountId}`, payload, cfg.secret, fetchImpl);
}

export async function reconcilePilot(cfg, ledger, fetchImpl = fetch) {
  const messageIds = [...new Set(Object.values(ledger.data.messages).map(message => message.id).filter(Boolean))];
  const commandIds = [...new Set(Object.keys(ledger.data.crmCommands ?? {}))];
  return postSigned(cfg.reconcileEndpoint, `reconcile:${cfg.accountId}`, {
    accountId: cfg.accountId,
    epoch: cfg.epoch,
    messageIds,
    commandIds,
  }, cfg.secret, fetchImpl);
}
