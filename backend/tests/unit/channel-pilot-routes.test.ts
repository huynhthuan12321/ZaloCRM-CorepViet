// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  account: vi.fn(),
  access: vi.fn(),
  messages: vi.fn(),
  commands: vi.fn(),
  grouped: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    channelAccount: { findFirst: h.account },
    message: { findMany: h.messages },
    outboundCommand: { findMany: h.commands, groupBy: h.grouped },
    channelEvent: { findFirst: h.event },
  },
}));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { id: '00000000-0000-4000-8000-000000000011', orgId: 'org-a' };
  },
}));
vi.mock('../../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => {} }));
vi.mock('../../src/modules/channels/channel-scope.js', () => ({ hasChannelAccess: h.access }));

import { channelPilotRoutes } from '../../src/modules/channels/pilot-routes.js';
import { resetPilotRuntimeForTests } from '../../src/modules/channels/pilot-observability.js';
import { deriveMockWorkerSecret } from '../../src/modules/channels/worker-auth.js';

const secret = 'p'.repeat(32);
const accountId = '00000000-0000-4000-8000-000000000081';
const account = {
  id: accountId,
  orgId: 'org-a',
  status: 'CONNECTED',
  enabled: true,
  inboundEnabled: true,
  outboundEnabled: true,
  session: { epoch: 3n, verifiedAt: new Date() },
};
let app: FastifyInstance;

function signed(path: string, nonce: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  return app.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/vnd.zalocrm.channel-pilot+json',
      'x-channel-timestamp': timestamp,
      'x-channel-nonce': nonce,
      'x-channel-signature': createHmac('sha256', deriveMockWorkerSecret(accountId, {
        NODE_ENV: 'test',
        MOCK_CHANNEL_WORKER_SECRET: secret,
      })!).update(`${timestamp}.${nonce}.${body}`).digest('hex'),
    },
    payload: body,
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  resetPilotRuntimeForTests();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CHANNELS_ENABLED', 'true');
  vi.stubEnv('MOCK_CHANNEL_ENABLED', 'true');
  vi.stubEnv('MOCK_CHANNEL_WORKER_SECRET', secret);
  h.account.mockResolvedValue(account);
  h.access.mockResolvedValue(true);
  h.messages.mockResolvedValue([{ externalMessageId: 'message-1' }]);
  h.commands.mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000401' }]);
  h.grouped.mockResolvedValue([{ status: 'CONFIRMED', _count: { _all: 1 } }]);
  h.event.mockResolvedValue({ observedAt: new Date('2026-10-13T00:00:00Z') });
  app = Fastify();
  await app.register(channelPilotRoutes);
});
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });

describe('TT07 mock pilot observability', () => {
  it('accepts a signed heartbeat and exposes a sanitized admin status', async () => {
    const heartbeat = {
      accountId,
      epoch: '3',
      sessionState: 'authenticated',
      rssBytes: 100,
      heapUsedBytes: 50,
      cpuPercent: 12.5,
      eventLoopP95Ms: 4,
      profileBytes: 1_000,
      ledgerBytes: 100,
      ledgerMessages: 1,
      ledgerCommands: 1,
      observedAt: new Date().toISOString(),
    };
    expect((await signed('/internal/channel-workers/pilot/heartbeat', `heartbeat:${accountId}`, heartbeat)).statusCode).toBe(200);
    const status = await app.inject(`/api/v1/channel-accounts/mock/${accountId}/pilot`);
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      scope: 'mock_local_per_account',
      readyForRealPilot: false,
      status: 'HEALTHY',
      worker: { sessionState: 'authenticated', rssBytes: 100 },
      outbound: { confirmed: 1 },
    });
    expect(JSON.stringify(status.json())).not.toContain('secret');
  });

  it('reconciles IDs without writing application rows and reports mismatches', async () => {
    const payload = {
      accountId,
      epoch: '3',
      messageIds: ['message-1', 'worker-only'],
      commandIds: ['00000000-0000-4000-8000-000000000402'],
    };
    const response = await signed('/internal/channel-workers/pilot/reconcile', `reconcile:${accountId}`, payload);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ missingInCrm: 1, missingInWorker: 0, commandMismatch: 2 });
    expect(h.messages).toHaveBeenCalledWith(expect.objectContaining({ select: { externalMessageId: true } }));
  });

  it('rejects a stale epoch and hides status without admin permission', async () => {
    h.account.mockResolvedValueOnce(null);
    const response = await signed('/internal/channel-workers/pilot/heartbeat', `heartbeat:${accountId}`, {
      accountId,
      epoch: '2',
      sessionState: 'authenticated',
      rssBytes: 1,
      heapUsedBytes: 1,
      cpuPercent: 1,
      eventLoopP95Ms: 1,
      profileBytes: 1,
      ledgerBytes: 1,
      ledgerMessages: 0,
      ledgerCommands: 0,
      observedAt: new Date().toISOString(),
    });
    expect(response.statusCode).toBe(409);
    h.access.mockResolvedValue(false);
    expect((await app.inject(`/api/v1/channel-accounts/mock/${accountId}/pilot`)).statusCode).toBe(404);
  });
});
