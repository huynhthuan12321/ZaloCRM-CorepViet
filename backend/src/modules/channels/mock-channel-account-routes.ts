// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { emitAuthorizedChannelEvent } from './channel-socket.js';
import { hasChannelAccess } from './channel-scope.js';
import { clearPilotRuntimeState } from './pilot-observability.js';
import { resolveWorkerCapacityConfig } from './worker-capacity.js';

const createSchema = z.object({ displayName: z.string().trim().min(1).max(120) }).strict();
const confirmSchema = z.object({
  externalAccountId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(120).optional(),
  epoch: z.string().regex(/^[1-9]\d*$/).max(30),
}).strict();
const outboundSchema = z.object({ enabled: z.boolean() }).strict();

export async function mockChannelAccountRoutes(app: FastifyInstance) {
  const io = (app as FastifyInstance & { io?: Server }).io;
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireGrant('conversation', 'access'));

  const available = () => resolveTikTokPersonalConfig().effective.mock;
  const actor = (request: { user?: { id: string; orgId: string } }) => ({
    userId: request.user!.id,
    orgId: request.user!.orgId,
  });

  app.post('/api/v1/channel-accounts/mock', async (request, reply) => {
    if (!available()) return reply.code(404).send({ error: 'Not found' });
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid account' });
    const currentUser = await prisma.user.findFirst({
      where: { id: request.user!.id, orgId: request.user!.orgId, isActive: true },
      select: { role: true },
    });
    if (!currentUser || !['owner', 'admin'].includes(currentUser.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const createAccount = () => prisma.$transaction(async tx => {
      const existingCount = await tx.channelAccount.count({
        where: { orgId: request.user!.orgId, provider: 'MOCK_BROWSER' },
      });
      if (existingCount >= resolveWorkerCapacityConfig().effectiveLimit) return null;
      return tx.channelAccount.create({
        data: {
          orgId: request.user!.orgId,
          ownerUserId: request.user!.id,
          provider: 'MOCK_BROWSER',
          displayName: parsed.data.displayName,
          status: 'DISCONNECTED',
          enabled: true,
          inboundEnabled: true,
          outboundEnabled: false,
        },
        select: { id: true, displayName: true, provider: true, status: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let account = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        account = await createAccount();
        break;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 1) throw error;
      }
    }
    if (!account) {
      return reply.code(409).send({
        error: 'Mock worker capacity is reached',
        code: 'TT09_WORKER_CAPACITY_REACHED',
      });
    }
    return reply.code(201).send(account);
  });

  app.post('/api/v1/channel-accounts/mock/:id/connect', async (request, reply) => {
    if (!available()) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const capacity = resolveWorkerCapacityConfig();
    const connectAccount = () => prisma.$transaction(async tx => {
        const activeOthers = await tx.channelAccount.count({
          where: {
            orgId: request.user!.orgId,
            provider: 'MOCK_BROWSER',
            enabled: true,
            id: { not: id },
            status: { in: ['CONNECTED', 'QR_PENDING'] },
          },
        });
        if (activeOthers >= capacity.effectiveLimit) return null;
        const current = await tx.browserSessionRef.findUnique({
          where: { channelAccountId: id },
          select: { epoch: true },
        });
        const epoch = (current?.epoch ?? 0n) + 1n;
        await tx.browserSessionRef.upsert({
          where: { channelAccountId: id },
          create: {
            orgId: request.user!.orgId,
            channelAccountId: id,
            profileRef: `mock-profile:${randomUUID()}`,
            epoch,
          },
          update: { profileRef: `mock-profile:${randomUUID()}`, epoch, verifiedAt: null, expiresAt: null },
        });
        await tx.channelAccount.update({
          where: { id },
          data: { status: 'QR_PENDING', externalAccountId: null },
        });
        return epoch;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let outcome: bigint | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        outcome = await connectAccount();
        break;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 1) throw error;
      }
    }
    if (outcome === null) {
      return reply.code(409).send({ error: 'Mock worker capacity is reached', code: 'TT09_WORKER_CAPACITY_REACHED' });
    }
    const epoch = outcome;
    const payload = { status: 'QR_PENDING', qr: `mock-qr:${id}:${epoch.toString()}`, epoch: epoch.toString() };
    if (io) await emitAuthorizedChannelEvent({
      io, orgId: request.user!.orgId, accountId: id, purpose: 'control',
      event: 'channel:connection', payload,
    });
    return payload;
  });

  app.post('/api/v1/channel-accounts/mock/:id/confirm', async (request, reply) => {
    if (!available()) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid identity' });
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const epoch = BigInt(parsed.data.epoch);
    const confirmAccount = () => prisma.$transaction(async tx => {
      const current = await tx.channelAccount.findFirst({
        where: {
          id,
          orgId: request.user!.orgId,
          provider: 'MOCK_BROWSER',
          enabled: true,
          status: 'QR_PENDING',
          session: { is: { epoch, verifiedAt: null, expiresAt: null } },
        },
        select: { id: true },
      });
      if (!current) return null;
      return tx.channelAccount.update({
        where: { id },
        data: {
          externalAccountId: parsed.data.externalAccountId,
          displayName: parsed.data.displayName,
          status: 'CONNECTED',
          enabled: true,
          inboundEnabled: true,
          outboundEnabled: false,
          session: { update: { verifiedAt: new Date() } },
        },
        select: { id: true, displayName: true, provider: true, status: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let account = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        account = await confirmAccount();
        break;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 1) throw error;
      }
    }
    if (!account) {
      return reply.code(409).send({
        error: 'QR session is stale or no longer pending',
        code: 'QR_SESSION_STALE',
      });
    }
    if (io) await emitAuthorizedChannelEvent({
      io, orgId: request.user!.orgId, accountId: id, purpose: 'control',
      event: 'channel:connection', payload: { status: 'CONNECTED', epoch: epoch.toString() },
    });
    return account;
  });

  app.patch('/api/v1/channel-accounts/mock/:id/outbound', async (request, reply) => {
    if (!available()) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    const parsed = outboundSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid outbound setting' });
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const account = await prisma.channelAccount.findFirst({
      where: { id, orgId: request.user!.orgId, provider: 'MOCK_BROWSER', enabled: true },
      include: { session: { select: { verifiedAt: true } } },
    });
    if (!account) return reply.code(404).send({ error: 'Not found' });
    if (parsed.data.enabled && (account.status !== 'CONNECTED' || !account.session?.verifiedAt)) {
      return reply.code(409).send({ error: 'Confirm the mock session first', code: 'SESSION_NOT_CONFIRMED' });
    }
    const updated = await prisma.channelAccount.update({
      where: { id },
      data: { outboundEnabled: parsed.data.enabled },
      select: { id: true, outboundEnabled: true },
    });
    return updated;
  });

  app.post('/api/v1/channel-accounts/mock/:id/rollback', async (request, reply) => {
    if (!available()) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const account = await prisma.channelAccount.findFirst({
      where: { id, orgId: request.user!.orgId, provider: 'MOCK_BROWSER' },
      include: { session: { select: { epoch: true } } },
    });
    if (!account) return reply.code(404).send({ error: 'Not found' });
    const nextEpoch = (account.session?.epoch ?? 0n) + 1n;
    await prisma.$transaction([
      prisma.channelAccount.update({
        where: { id },
        data: { status: 'DISCONNECTED', inboundEnabled: false, outboundEnabled: false },
      }),
      ...(account.session ? [prisma.browserSessionRef.update({
        where: { channelAccountId: id },
        data: { epoch: nextEpoch, verifiedAt: null, expiresAt: new Date() },
      })] : []),
    ]);
    clearPilotRuntimeState(id);
    if (io) await emitAuthorizedChannelEvent({
      io,
      orgId: request.user!.orgId,
      accountId: id,
      purpose: 'control',
      event: 'channel:connection',
      payload: { status: 'DISCONNECTED', epoch: nextEpoch.toString(), reason: 'PILOT_ROLLBACK' },
    });
    return {
      ok: true,
      status: 'DISCONNECTED',
      epoch: nextEpoch.toString(),
      pendingCommandsPreserved: true,
    };
  });
}
