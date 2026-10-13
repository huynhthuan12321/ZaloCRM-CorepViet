// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { hasChannelAccess } from './channel-scope.js';
import { emitAuthorizedChannelEvent } from './channel-socket.js';
import { verifyMockWorkerRequest } from './worker-auth.js';
import { claimOutboundCommand, resolveOutboundCommand } from './outbound-command-service.js';

const WORKER_CONTENT_TYPE = 'application/vnd.zalocrm.channel-command+json';
const sendSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  idempotencyKey: z.string().uuid(),
}).strict();
const claimSchema = z.object({
  accountId: z.string().uuid(),
  epoch: z.string().regex(/^(0|[1-9]\d{0,19})$/),
}).strict();
const resultSchema = z.object({
  accountId: z.string().uuid(),
  epoch: z.string().regex(/^(0|[1-9]\d{0,19})$/),
  result: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('confirmed'), externalMessageId: z.string().min(1).max(300) }).strict(),
    z.object({ kind: z.literal('rejected'), errorCode: z.string().min(1).max(100) }).strict(),
    z.object({ kind: z.literal('unknown'), errorCode: z.string().min(1).max(100) }).strict(),
  ]),
}).strict();

export async function channelOutboundRoutes(app: FastifyInstance) {
  const io = (app as FastifyInstance & { io?: Server }).io;
  app.post('/api/v1/channel-inbox/:id/messages', {
    preHandler: [authMiddleware, requireGrant('conversation', 'access')],
  }, async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const { id } = request.params as { id: string };
    const actor = { userId: request.user!.id, orgId: request.user!.orgId };
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        orgId: actor.orgId,
        deletedAt: null,
        zaloAccountId: null,
        channelAccount: {
          provider: 'MOCK_BROWSER',
          enabled: true,
          outboundEnabled: true,
          status: 'CONNECTED',
        },
      },
      include: { channelAccount: { include: { session: { select: { epoch: true } } } } },
    });
    if (!conversation?.channelAccount || !(await hasChannelAccess(actor, conversation.channelAccount.id, 'chat'))) {
      return reply.code(404).send({ error: 'Not found' });
    }
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid message' });
    if (!conversation.channelAccount.session) {
      return reply.code(409).send({ error: 'Channel session unavailable', code: 'CHANNEL_SESSION_UNAVAILABLE' });
    }

    const persist = () => tenantTransaction(async tx => {
      const existing = await tx.outboundCommand.findUnique({
        where: {
          channelAccountId_idempotencyKey: {
            channelAccountId: conversation.channelAccount!.id,
            idempotencyKey: parsed.data.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.text !== parsed.data.text || existing.conversationId !== conversation.id) {
          return { conflict: true as const };
        }
        const message = await tx.message.findUnique({
          where: {
            conversationId_clientEchoId: {
              conversationId: conversation.id,
              clientEchoId: existing.id,
            },
          },
        });
        if (!message) throw new Error('OUTBOUND_MESSAGE_MISSING');
        return { conflict: false as const, duplicate: true, message };
      }
      const command = await tx.outboundCommand.create({
        data: {
          orgId: actor.orgId,
          channelAccountId: conversation.channelAccount!.id,
          conversationId: conversation.id,
          requestedByUserId: actor.userId,
          idempotencyKey: parsed.data.idempotencyKey,
          text: parsed.data.text,
          status: 'PENDING',
        },
      });
      const now = new Date();
      const message = await tx.message.create({
        data: {
          orgId: actor.orgId,
          conversationId: conversation.id,
          clientEchoId: command.id,
          channelSendState: 'PENDING',
          senderType: 'self',
          senderUid: actor.userId,
          content: parsed.data.text,
          contentType: 'text',
          sentAt: now,
          sentVia: 'user',
          repliedByUserId: actor.userId,
          metadata: { channel: 'mock_browser' },
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now, isReplied: true },
      });
      return { conflict: false as const, duplicate: false, message };
    });
    let outcome;
    try {
      outcome = await persist();
    } catch (error) {
      // Two identical HTTP retries may race on the unique idempotency key.
      // Re-read the committed winner instead of surfacing a transient 500.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      outcome = await persist();
    }
    if (outcome.conflict) {
      return reply.code(409).send({ error: 'Idempotency key already used with another payload', code: 'IDEMPOTENCY_CONFLICT' });
    }
    if (io && !outcome.duplicate) await emitAuthorizedChannelEvent({
      io,
      orgId: actor.orgId,
      accountId: conversation.channelAccount.id,
      purpose: 'read',
      event: 'channel:message',
      payload: { conversationId: conversation.id, messageId: outcome.message.id },
    });
    return reply.code(outcome.duplicate ? 200 : 202).send(outcome.message);
  });

  app.addContentTypeParser(WORKER_CONTENT_TYPE, { parseAs: 'string', bodyLimit: 64 * 1024 }, (_request, body, done) => done(null, body));
  const verifiedBody = (request: { body?: unknown; headers: Record<string, unknown> }) => {
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
  };

  app.post('/internal/channel-workers/commands/claim', async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const { decoded, verified } = verifiedBody(request);
    if (!verified.valid) return reply.code(401).send({ error: 'Unauthorized', code: verified.reason });
    const parsed = claimSchema.safeParse(decoded);
    if (!parsed.success || verified.nonce !== `claim:${parsed.data.accountId}:${parsed.data.epoch}`) {
      return reply.code(400).send({ error: 'Invalid claim' });
    }
    const command = await claimOutboundCommand(parsed.data.accountId, BigInt(parsed.data.epoch));
    return command ? { command } : reply.code(204).send();
  });

  app.post('/internal/channel-workers/commands/:id/result', async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const { decoded, verified } = verifiedBody(request);
    if (!verified.valid) return reply.code(401).send({ error: 'Unauthorized', code: verified.reason });
    const parsed = resultSchema.safeParse(decoded);
    const { id } = request.params as { id: string };
    if (!parsed.success || verified.nonce !== `result:${id}`) return reply.code(400).send({ error: 'Invalid result' });
    const outcome = await resolveOutboundCommand({
      accountId: parsed.data.accountId,
      commandId: id,
      epoch: BigInt(parsed.data.epoch),
      result: parsed.data.result,
      io,
    });
    if (outcome.state === 'not_found') return reply.code(404).send({ error: 'Not found' });
    if (outcome.state === 'stale') return reply.code(409).send({ error: 'Stale command', code: 'STALE_COMMAND' });
    if (outcome.state === 'conflict') return reply.code(409).send({ error: 'Conflicting result', code: 'RESULT_CONFLICT' });
    return { ok: true, duplicate: outcome.state === 'duplicate' };
  });
}
