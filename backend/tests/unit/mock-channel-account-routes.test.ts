// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: vi.fn(),
  countAccounts: vi.fn(),
  createAccount: vi.fn(),
  findAccount: vi.fn(),
  updateAccount: vi.fn(),
  findSession: vi.fn(),
  updateSession: vi.fn(),
  access: vi.fn(),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: {
  user: { findFirst: h.user },
  channelAccount: {
    count: h.countAccounts,
    create: h.createAccount,
    findFirst: h.findAccount,
    update: h.updateAccount,
  },
  browserSessionRef: {
    findUnique: h.findSession,
    update: h.updateSession,
  },
  $transaction: async (fn: Function) => fn({
    channelAccount: {
      count: h.countAccounts,
      create: h.createAccount,
      findFirst: h.findAccount,
      update: h.updateAccount,
    },
    browserSessionRef: {
      findUnique: h.findSession,
      update: h.updateSession,
    },
  }),
} }));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({ authMiddleware: async (request: any) => {
  request.user = { id: 'user-a', orgId: 'org-a', role: 'member' };
} }));
vi.mock('../../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => {} }));
vi.mock('../../src/modules/channels/channel-scope.js', () => ({ hasChannelAccess: h.access }));

import { mockChannelAccountRoutes } from '../../src/modules/channels/mock-channel-account-routes.js';

let app: FastifyInstance;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CHANNELS_ENABLED', 'true');
  vi.stubEnv('MOCK_CHANNEL_ENABLED', 'true');
  h.user.mockResolvedValue({ role: 'owner' });
  h.countAccounts.mockResolvedValue(0);
  h.createAccount.mockResolvedValue({
    id: 'account-a', displayName: 'Mock Personal', provider: 'MOCK_BROWSER', status: 'DISCONNECTED',
  });
  h.findAccount.mockResolvedValue({
    id: 'account-a',
    orgId: 'org-a',
    provider: 'MOCK_BROWSER',
    status: 'QR_PENDING',
    enabled: true,
    session: { epoch: 3n, verifiedAt: null, expiresAt: null },
  });
  h.findSession.mockResolvedValue({ epoch: 3n });
  h.updateSession.mockResolvedValue({ epoch: 3n });
  h.updateAccount.mockResolvedValue({
    id: 'account-a', displayName: 'Mock Personal', provider: 'MOCK_BROWSER', status: 'CONNECTED',
  });
  h.access.mockResolvedValue(true);
  app = Fastify();
  await app.register(mockChannelAccountRoutes);
});
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });

describe('TT08 mock account lifecycle gate', () => {
  it('allows only current organization owner/admin to create an account', async () => {
    h.user.mockResolvedValueOnce({ role: 'member' });
    expect((await app.inject({ method: 'POST', url: '/api/v1/channel-accounts/mock', payload: { displayName: 'Mock Personal' } })).statusCode).toBe(403);
    expect(h.createAccount).not.toHaveBeenCalled();
  });

  it('allows the second account and rejects the third', async () => {
    h.countAccounts.mockResolvedValueOnce(1);
    const second = await app.inject({ method: 'POST', url: '/api/v1/channel-accounts/mock', payload: { displayName: 'Second' } });
    expect(second.statusCode).toBe(201);
    h.countAccounts.mockResolvedValueOnce(2);
    const response = await app.inject({ method: 'POST', url: '/api/v1/channel-accounts/mock', payload: { displayName: 'Third' } });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('TT09_WORKER_CAPACITY_REACHED');
  });

  it('creates read-only defaults and never enables outbound', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/channel-accounts/mock', payload: { displayName: 'Mock Personal' } });
    expect(response.statusCode).toBe(201);
    expect(h.createAccount).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orgId: 'org-a',
        ownerUserId: 'user-a',
        provider: 'MOCK_BROWSER',
        enabled: true,
        inboundEnabled: true,
        outboundEnabled: false,
      }),
    }));
  });

  it('binds confirmation to the current QR epoch and QR_PENDING state', async () => {
    h.findAccount.mockResolvedValueOnce(null);
    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/channel-accounts/mock/account-a/confirm',
      payload: { externalAccountId: 'mock-personal-01', epoch: '2' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('QR_SESSION_STALE');
    expect(h.updateAccount).not.toHaveBeenCalled();

    const current = await app.inject({
      method: 'POST',
      url: '/api/v1/channel-accounts/mock/account-a/confirm',
      payload: { externalAccountId: 'mock-personal-01', epoch: '3' },
    });
    expect(current.statusCode).toBe(200);
    expect(h.findAccount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'account-a',
        orgId: 'org-a',
        status: 'QR_PENDING',
        session: { is: expect.objectContaining({ epoch: 3n, verifiedAt: null, expiresAt: null }) },
      }),
    }));
  });
});
