// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma-client.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { emitAuthorizedChannelEvent } from './channel-socket.js';
import { hasChannelAccess } from './channel-scope.js';
import { verifyChannelWorkerRequest } from './worker-auth.js';
import {
  clearTikTokConnectionState,
  recordTikTokConnectionState,
  tiktokConnectionState,
} from './tiktok-connection-state.js';
import {
  claimTikTokLoginAction,
  clearTikTokLoginAction,
  queueTikTokLoginAction,
} from './tiktok-login-control.js';

const SESSION_CONTENT_TYPE = 'application/vnd.zalocrm.tiktok-session+json';
const CONTROL_CONTENT_TYPE = 'application/vnd.zalocrm.tiktok-control+json';
const usernamePattern = /^[A-Za-z0-9_.]{2,64}$/;
const createSchema = z.object({
  username: z.string().trim().transform(value => value.replace(/^@/, '')).pipe(z.string().regex(usernamePattern)),
  displayName: z.string().trim().min(1).max(120).optional(),
}).strict();
const outboundSchema = z.object({ enabled: z.boolean() }).strict();
const connectSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('qr') }).strict(),
  z.object({
    method: z.literal('password'),
    identifier: z.string().trim().min(2).max(128),
    password: z.string().min(1).max(256),
  }).strict(),
]);
const controlClaimSchema = z.object({ accountId: z.string().uuid() }).strict();
const sessionSchema = z.object({
  accountId: z.string().uuid(),
  epoch: z.string().regex(/^[1-9]\d{0,19}$/),
  state: z.enum(['qr_required', 'authenticated', 'challenge', 'expired', 'error']),
  observedAt: z.string().datetime(),
  qrDataUrl: z.string().max(512_000).optional(),
  identityUsername: z.string().trim().regex(usernamePattern).optional(),
  errorCode: z.string().trim().min(1).max(100).optional(),
}).strict();

function isAdmin(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export async function tiktokChannelAccountRoutes(app: FastifyInstance) {
  const io = (app as FastifyInstance & { io?: Server }).io;
  const cfg = () => resolveTikTokPersonalConfig();
  const actor = (request: { user?: { id: string; orgId: string } }) => ({
    userId: request.user!.id,
    orgId: request.user!.orgId,
  });

  app.post('/api/v1/channel-accounts/tiktok', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    if (!cfg().effective.enabled) return reply.code(404).send({ error: 'Not found' });
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid TikTok account' });
    const user = await prisma.user.findFirst({
      where: { id: request.user!.id, orgId: request.user!.orgId, isActive: true },
      select: { role: true },
    });
    if (!isAdmin(user?.role)) return reply.code(403).send({ error: 'Forbidden' });

    const existing = await prisma.channelAccount.findFirst({
      where: { orgId: request.user!.orgId, provider: 'TIKTOK_WEB_SESSION' },
      select: { id: true },
    });
    if (existing) {
      return reply.code(409).send({
        error: 'The one-account TikTok pilot already has an account',
        code: 'TIKTOK_SINGLE_ACCOUNT_LIMIT',
      });
    }
    const username = parsed.data.username;
    const account = await prisma.channelAccount.create({
      data: {
        orgId: request.user!.orgId,
        ownerUserId: request.user!.id,
        provider: 'TIKTOK_WEB_SESSION',
        externalAccountId: username,
        displayName: parsed.data.displayName ?? `@${username}`,
        status: 'DISCONNECTED',
        enabled: true,
        inboundEnabled: false,
        outboundEnabled: false,
      },
      select: { id: true, displayName: true, provider: true, status: true, externalAccountId: true },
    });
    return reply.code(201).send(account);
  });

  app.post('/api/v1/channel-accounts/tiktok/:id/connect', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    if (!cfg().effective.enabled) return reply.code(404).send({ error: 'Not found' });
    const parsed = connectSchema.safeParse(request.body ?? { method: 'qr' });
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid TikTok login request' });
    const { id } = request.params as { id: string };
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const connect = () => prisma.$transaction(async tx => {
      const account = await tx.channelAccount.findFirst({
        where: { id, orgId: request.user!.orgId, provider: 'TIKTOK_WEB_SESSION', enabled: true },
        select: { id: true },
      });
      if (!account) return null;
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
          profileRef: `tiktok-profile:${randomUUID()}`,
          epoch,
        },
        update: {
          profileRef: `tiktok-profile:${randomUUID()}`,
          epoch,
          verifiedAt: null,
          expiresAt: null,
        },
      });
      await tx.channelAccount.update({
        where: { id },
        data: {
          status: 'QR_PENDING',
          inboundEnabled: false,
          outboundEnabled: false,
        },
      });
      return epoch;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let epoch: bigint | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        epoch = await connect();
        break;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 1) throw error;
      }
    }
    if (epoch === null) return reply.code(404).send({ error: 'Not found' });
    clearTikTokConnectionState(id);
    clearTikTokLoginAction(id);
    queueTikTokLoginAction(id, epoch.toString(), parsed.data);
    const payload = { status: 'QR_PENDING', epoch: epoch.toString(), method: parsed.data.method };
    if (io) await emitAuthorizedChannelEvent({
      io,
      orgId: request.user!.orgId,
      accountId: id,
      purpose: 'control',
      event: 'channel:connection',
      payload,
    });
    return payload;
  });

  app.get('/api/v1/channel-accounts/tiktok/:id/connection', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    if (!cfg().effective.enabled) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const account = await prisma.channelAccount.findFirst({
      where: { id, orgId: request.user!.orgId, provider: 'TIKTOK_WEB_SESSION' },
      include: { session: { select: { epoch: true, verifiedAt: true, expiresAt: true } } },
    });
    if (!account) return reply.code(404).send({ error: 'Not found' });
    return {
      account: {
        id: account.id,
        displayName: account.displayName,
        externalAccountId: account.externalAccountId,
        status: account.status,
        inboundEnabled: account.inboundEnabled,
        outboundEnabled: account.outboundEnabled,
      },
      epoch: account.session?.epoch.toString() ?? null,
      verifiedAt: account.session?.verifiedAt?.toISOString() ?? null,
      expiresAt: account.session?.expiresAt?.toISOString() ?? null,
      runtime: tiktokConnectionState(id),
    };
  });

  app.patch('/api/v1/channel-accounts/tiktok/:id/outbound', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    const currentCfg = cfg();
    if (!currentCfg.effective.enabled) return reply.code(404).send({ error: 'Not found' });
    const parsed = outboundSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid outbound setting' });
    if (parsed.data.enabled && !currentCfg.effective.outbound) {
      return reply.code(409).send({ error: 'TikTok outbound is disabled', code: 'TIKTOK_OUTBOUND_DISABLED' });
    }
    const { id } = request.params as { id: string };
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const account = await prisma.channelAccount.findFirst({
      where: { id, orgId: request.user!.orgId, provider: 'TIKTOK_WEB_SESSION', enabled: true },
      include: { session: { select: { verifiedAt: true, expiresAt: true } } },
    });
    if (!account) return reply.code(404).send({ error: 'Not found' });
    if (parsed.data.enabled && (
      account.status !== 'CONNECTED'
      || !account.session?.verifiedAt
      || account.session.expiresAt
    )) {
      return reply.code(409).send({ error: 'TikTok session is not connected', code: 'SESSION_NOT_CONNECTED' });
    }
    return prisma.channelAccount.update({
      where: { id },
      data: { outboundEnabled: parsed.data.enabled },
      select: { id: true, outboundEnabled: true },
    });
  });

  app.post('/api/v1/channel-accounts/tiktok/:id/disconnect', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    if (!cfg().effective.enabled) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const account = await prisma.channelAccount.findFirst({
      where: { id, orgId: request.user!.orgId, provider: 'TIKTOK_WEB_SESSION' },
      include: { session: { select: { epoch: true } } },
    });
    if (!account) return reply.code(404).send({ error: 'Not found' });
    const epoch = (account.session?.epoch ?? 0n) + 1n;
    await prisma.$transaction([
      prisma.channelAccount.update({
        where: { id },
        data: { status: 'DISCONNECTED', inboundEnabled: false, outboundEnabled: false },
      }),
      ...(account.session ? [prisma.browserSessionRef.update({
        where: { channelAccountId: id },
        data: { epoch, verifiedAt: null, expiresAt: new Date() },
      })] : []),
    ]);
    clearTikTokConnectionState(id);
    clearTikTokLoginAction(id);
    if (io) await emitAuthorizedChannelEvent({
      io,
      orgId: request.user!.orgId,
      accountId: id,
      purpose: 'control',
      event: 'channel:connection',
      payload: { status: 'DISCONNECTED', epoch: epoch.toString() },
    });
    return { ok: true, status: 'DISCONNECTED', epoch: epoch.toString() };
  });

  app.addContentTypeParser(SESSION_CONTENT_TYPE, {
    parseAs: 'string',
    bodyLimit: 768 * 1024,
  }, (_request, body, done) => done(null, body));
  app.addContentTypeParser(CONTROL_CONTENT_TYPE, {
    parseAs: 'string',
    bodyLimit: 8 * 1024,
  }, (_request, body, done) => done(null, body));

  app.post('/internal/channel-workers/tiktok/control/claim', async (request, reply) => {
    if (!cfg().effective.enabled) return reply.code(404).send({ error: 'Not found' });
    const rawBody = typeof request.body === 'string' ? request.body : '';
    let decoded: unknown;
    try { decoded = JSON.parse(rawBody); } catch { decoded = null; }
    const parsed = controlClaimSchema.safeParse(decoded);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid control claim' });
    const account = await runSystemQuery(() => prisma.channelAccount.findFirst({
      where: { id: parsed.data.accountId, provider: 'TIKTOK_WEB_SESSION', enabled: true },
      include: { session: { select: { epoch: true } } },
    }));
    if (!account) return reply.code(404).send({ error: 'Unknown account' });
    const verified = verifyChannelWorkerRequest(rawBody, {
      signature: request.headers['x-channel-signature'] as string | undefined,
      timestamp: request.headers['x-channel-timestamp'] as string | undefined,
      nonce: request.headers['x-channel-nonce'] as string | undefined,
    }, account.id, 'TIKTOK_WEB_SESSION');
    if (!verified.valid) return reply.code(401).send({ error: 'Unauthorized', code: verified.reason });
    if (verified.nonce !== `control:${account.id}`) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'nonce_mismatch' });
    }
    if (!account.session || !account.externalAccountId) return reply.code(204).send();
    const epoch = account.session.epoch.toString();
    return {
      accountId: account.id,
      epoch,
      expectedUsername: account.externalAccountId,
      action: claimTikTokLoginAction(account.id, epoch),
    };
  });

  app.post('/internal/channel-workers/tiktok/session', async (request, reply) => {
    if (!cfg().effective.enabled) return reply.code(404).send({ error: 'Not found' });
    const rawBody = typeof request.body === 'string' ? request.body : '';
    let decoded: unknown;
    try { decoded = JSON.parse(rawBody); } catch { decoded = null; }
    const parsed = sessionSchema.safeParse(decoded);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid session update' });
    const account = await runSystemQuery(() => prisma.channelAccount.findFirst({
      where: { id: parsed.data.accountId, provider: 'TIKTOK_WEB_SESSION', enabled: true },
      include: { session: { select: { epoch: true } } },
    }));
    if (!account) return reply.code(404).send({ error: 'Unknown account' });
    const verified = verifyChannelWorkerRequest(rawBody, {
      signature: request.headers['x-channel-signature'] as string | undefined,
      timestamp: request.headers['x-channel-timestamp'] as string | undefined,
      nonce: request.headers['x-channel-nonce'] as string | undefined,
    }, account.id, 'TIKTOK_WEB_SESSION');
    if (!verified.valid) return reply.code(401).send({ error: 'Unauthorized', code: verified.reason });
    if (verified.nonce !== `session:${account.id}:${parsed.data.epoch}`) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'nonce_mismatch' });
    }
    if (!account.session || account.session.epoch !== BigInt(parsed.data.epoch)) {
      return reply.code(409).send({ error: 'Stale session', code: 'STALE_SESSION' });
    }
    if (parsed.data.state === 'authenticated') {
      if (
        !parsed.data.identityUsername
        || parsed.data.identityUsername.toLowerCase() !== account.externalAccountId?.toLowerCase()
      ) {
        await runSystemQuery(() => prisma.channelAccount.update({
          where: { id: account.id },
          data: { status: 'IDENTITY_MISMATCH', inboundEnabled: false, outboundEnabled: false },
        }));
        return reply.code(409).send({ error: 'TikTok identity mismatch', code: 'IDENTITY_MISMATCH' });
      }
      await runSystemQuery(() => prisma.$transaction([
        prisma.channelAccount.update({
          where: { id: account.id },
          data: {
            status: 'CONNECTED',
            inboundEnabled: cfg().effective.inbound,
          },
        }),
        prisma.browserSessionRef.update({
          where: { channelAccountId: account.id },
          data: { verifiedAt: new Date(parsed.data.observedAt), expiresAt: null },
        }),
      ]));
    } else {
      const status = {
        qr_required: 'QR_PENDING',
        challenge: 'CHALLENGE',
        expired: 'SESSION_EXPIRED',
        error: 'ERROR',
      }[parsed.data.state];
      await runSystemQuery(() => prisma.channelAccount.update({
        where: { id: account.id },
        data: {
          status,
          inboundEnabled: false,
          outboundEnabled: false,
        },
      }));
      if (parsed.data.state === 'expired') {
        await runSystemQuery(() => prisma.browserSessionRef.update({
          where: { channelAccountId: account.id },
          data: { verifiedAt: null, expiresAt: new Date(parsed.data.observedAt) },
        }));
      }
    }
    recordTikTokConnectionState(account.id, parsed.data);
    const payload = {
      status: parsed.data.state,
      epoch: parsed.data.epoch,
      observedAt: parsed.data.observedAt,
    };
    if (io) await emitAuthorizedChannelEvent({
      io,
      orgId: account.orgId,
      accountId: account.id,
      purpose: 'control',
      event: 'channel:connection',
      payload,
    });
    return { ok: true };
  });
}
