// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma-client.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { hasChannelAccess } from './channel-scope.js';
import { verifyMockWorkerRequest } from './worker-auth.js';
import {
  pilotRuntimeState,
  pilotRuntimeStates,
  recordPilotHeartbeat,
  recordPilotReconciliation,
} from './pilot-observability.js';
import { resolveWorkerCapacityConfig, workerFleetCapacity } from './worker-capacity.js';

const CONTENT_TYPE = 'application/vnd.zalocrm.channel-pilot+json';
const epoch = z.string().regex(/^(0|[1-9]\d{0,19})$/);
const heartbeatSchema = z.object({
  accountId: z.string().uuid(),
  epoch,
  sessionState: z.enum(['authenticated', 'qr_required', 'challenge', 'expired', 'error']),
  rssBytes: z.number().int().min(0).max(16 * 1024 ** 3),
  heapUsedBytes: z.number().int().min(0).max(16 * 1024 ** 3),
  cpuPercent: z.number().min(0).max(1000),
  eventLoopP95Ms: z.number().min(0).max(60_000),
  profileBytes: z.number().int().min(0).max(1024 ** 5),
  ledgerBytes: z.number().int().min(0).max(1024 ** 4),
  ledgerMessages: z.number().int().min(0).max(10_000_000),
  ledgerCommands: z.number().int().min(0).max(10_000_000),
  observedAt: z.string().datetime(),
}).strict();
const reconciliationSchema = z.object({
  accountId: z.string().uuid(),
  epoch,
  messageIds: z.array(z.string().min(1).max(300)).max(2_000),
  commandIds: z.array(z.string().uuid()).max(2_000),
}).strict();

function parseSignedBody(request: { body?: unknown; headers: Record<string, unknown> }) {
  const rawBody = typeof request.body === 'string' ? request.body : '';
  let decoded: unknown;
  try { decoded = JSON.parse(rawBody || 'null'); } catch { decoded = null; }
  const accountId = decoded && typeof decoded === 'object' && 'accountId' in decoded
    ? String(decoded.accountId)
    : '';
  const verified = verifyMockWorkerRequest(rawBody, {
    signature: request.headers['x-channel-signature'] as string | undefined,
    timestamp: request.headers['x-channel-timestamp'] as string | undefined,
    nonce: request.headers['x-channel-nonce'] as string | undefined,
  }, accountId);
  return { decoded, verified };
}

async function validPilotAccount(accountId: string, expectedEpoch: string) {
  return runSystemQuery(() => prisma.channelAccount.findFirst({
    where: {
      id: accountId,
      provider: 'MOCK_BROWSER',
      enabled: true,
      session: { epoch: BigInt(expectedEpoch) },
    },
    select: { id: true, orgId: true },
  }));
}

export async function channelPilotRoutes(app: FastifyInstance) {
  app.addContentTypeParser(CONTENT_TYPE, { parseAs: 'string', bodyLimit: 512 * 1024 }, (_request, body, done) => done(null, body));

  app.post('/internal/channel-workers/pilot/heartbeat', async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const { decoded, verified } = parseSignedBody(request);
    if (!verified.valid) return reply.code(401).send({ error: 'Unauthorized', code: verified.reason });
    const parsed = heartbeatSchema.safeParse(decoded);
    if (!parsed.success || verified.nonce !== `heartbeat:${parsed.data.accountId}`) {
      return reply.code(400).send({ error: 'Invalid heartbeat' });
    }
    if (!(await validPilotAccount(parsed.data.accountId, parsed.data.epoch))) {
      return reply.code(409).send({ error: 'Stale pilot session', code: 'STALE_PILOT_SESSION' });
    }
    recordPilotHeartbeat(parsed.data);
    return { ok: true };
  });

  app.post('/internal/channel-workers/pilot/reconcile', async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const { decoded, verified } = parseSignedBody(request);
    if (!verified.valid) return reply.code(401).send({ error: 'Unauthorized', code: verified.reason });
    const parsed = reconciliationSchema.safeParse(decoded);
    if (!parsed.success || verified.nonce !== `reconcile:${parsed.data.accountId}`) {
      return reply.code(400).send({ error: 'Invalid reconciliation' });
    }
    const account = await validPilotAccount(parsed.data.accountId, parsed.data.epoch);
    if (!account) return reply.code(409).send({ error: 'Stale pilot session', code: 'STALE_PILOT_SESSION' });

    const [crmMessages, crmCommands] = await runSystemQuery(() => Promise.all([
      prisma.message.findMany({
        where: {
          orgId: account.orgId,
          conversation: { channelAccountId: account.id },
          externalMessageId: { not: null },
        },
        select: { externalMessageId: true },
        take: 2_001,
      }),
      prisma.outboundCommand.findMany({
        where: { orgId: account.orgId, channelAccountId: account.id },
        select: { id: true },
        take: 2_001,
      }),
    ]));
    if (crmMessages.length > 2_000 || crmCommands.length > 2_000) {
      return reply.code(409).send({ error: 'Pilot reconciliation window exceeded', code: 'PILOT_WINDOW_EXCEEDED' });
    }
    const workerMessageIds = new Set(parsed.data.messageIds);
    const crmMessageIds = new Set(crmMessages.flatMap(row => row.externalMessageId ? [row.externalMessageId] : []));
    const workerCommandIds = new Set(parsed.data.commandIds);
    const crmCommandIds = new Set(crmCommands.map(row => row.id));
    const result = {
      checkedAt: new Date().toISOString(),
      workerMessageCount: workerMessageIds.size,
      crmMessageCount: crmMessageIds.size,
      missingInCrm: [...workerMessageIds].filter(id => !crmMessageIds.has(id)).length,
      missingInWorker: [...crmMessageIds].filter(id => !workerMessageIds.has(id)).length,
      workerCommandCount: workerCommandIds.size,
      crmCommandCount: crmCommandIds.size,
      commandMismatch: [...workerCommandIds].filter(id => !crmCommandIds.has(id)).length
        + [...crmCommandIds].filter(id => !workerCommandIds.has(id)).length,
    };
    recordPilotReconciliation(account.id, result);
    return result;
  });

  app.get('/api/v1/channel-accounts/mock/fleet', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const actor = { userId: request.user!.id, orgId: request.user!.orgId };
    const user = await prisma.user.findFirst({
      where: { id: actor.userId, orgId: actor.orgId, isActive: true },
      select: { role: true },
    });
    if (!user || !['owner', 'admin'].includes(user.role)) return reply.code(404).send({ error: 'Not found' });
    const accounts = await prisma.channelAccount.findMany({
      where: { orgId: actor.orgId, provider: 'MOCK_BROWSER', enabled: true },
      select: { id: true, displayName: true, status: true, inboundEnabled: true, outboundEnabled: true },
      orderBy: { createdAt: 'asc' },
    });
    const runtime = pilotRuntimeStates(accounts.map(account => account.id));
    const now = Date.now();
    const rows = accounts.map(account => {
      const heartbeat = runtime.get(account.id)?.heartbeat;
      const heartbeatAgeMs = heartbeat ? Math.max(0, now - new Date(heartbeat.observedAt).getTime()) : null;
      return { ...account, heartbeat: heartbeat ? { ...heartbeat, heartbeatAgeMs } : null };
    });
    const active = rows.filter(row => ['CONNECTED', 'QR_PENDING'].includes(row.status));
    const observations = active.flatMap(row => {
      const heartbeat = row.heartbeat;
      if (!heartbeat || heartbeat.heartbeatAgeMs === null || heartbeat.heartbeatAgeMs > 15_000) return [];
      return [{
        accountId: row.id,
        rssBytes: heartbeat.rssBytes,
        cpuPercent: heartbeat.cpuPercent,
        heartbeatAgeMs: heartbeat.heartbeatAgeMs,
      }];
    });
    return {
      scope: 'mock_local_fleet',
      readyForRealPilot: false,
      capacity: workerFleetCapacity(active.length, observations),
      accounts: rows,
    };
  });

  app.get('/api/v1/channel-accounts/mock/:id/pilot', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    const actor = { userId: request.user!.id, orgId: request.user!.orgId };
    if (!(await hasChannelAccess(actor, id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const account = await prisma.channelAccount.findFirst({
      where: { id, orgId: actor.orgId, provider: 'MOCK_BROWSER' },
      include: { session: { select: { epoch: true, verifiedAt: true } } },
    });
    if (!account) return reply.code(404).send({ error: 'Not found' });
    const [commands, lastEvent] = await Promise.all([
      prisma.outboundCommand.groupBy({
        by: ['status'],
        where: { orgId: actor.orgId, channelAccountId: id },
        _count: { _all: true },
      }),
      prisma.channelEvent.findFirst({
        where: { orgId: actor.orgId, channelAccountId: id, status: 'PROCESSED' },
        orderBy: { observedAt: 'desc' },
        select: { observedAt: true },
      }),
    ]);
    const counts = Object.fromEntries(commands.map(row => [row.status, row._count._all]));
    const runtime = pilotRuntimeState(id);
    const heartbeatAgeMs = runtime.heartbeat
      ? Math.max(0, Date.now() - new Date(runtime.heartbeat.observedAt).getTime())
      : null;
    const alerts: string[] = [];
    if (account.status !== 'CONNECTED' || !account.session?.verifiedAt) alerts.push('SESSION_NOT_CONNECTED');
    if (heartbeatAgeMs === null || heartbeatAgeMs > 15_000) alerts.push('WORKER_HEARTBEAT_STALE');
    if ((counts.UNKNOWN ?? 0) > 0) alerts.push('UNKNOWN_DELIVERY_REVIEW');
    if ((runtime.reconciliation?.missingInCrm ?? 0) > 0 || (runtime.reconciliation?.missingInWorker ?? 0) > 0
      || (runtime.reconciliation?.commandMismatch ?? 0) > 0) alerts.push('RECONCILIATION_MISMATCH');
    return {
      accountId: id,
      scope: 'mock_local_per_account',
      readyForRealPilot: false,
      status: alerts.length ? 'DEGRADED' : 'HEALTHY',
      account: {
        status: account.status,
        inboundEnabled: account.inboundEnabled,
        outboundEnabled: account.outboundEnabled,
        epoch: account.session?.epoch.toString() ?? null,
      },
      worker: runtime.heartbeat ? { ...runtime.heartbeat, heartbeatAgeMs } : null,
      outbound: {
        pending: counts.PENDING ?? 0,
        processing: counts.PROCESSING ?? 0,
        confirmed: counts.CONFIRMED ?? 0,
        failed: counts.FAILED ?? 0,
        unknown: counts.UNKNOWN ?? 0,
      },
      lastInboundAt: lastEvent?.observedAt.toISOString() ?? null,
      reconciliation: runtime.reconciliation ?? null,
      alerts,
    };
  });
}
