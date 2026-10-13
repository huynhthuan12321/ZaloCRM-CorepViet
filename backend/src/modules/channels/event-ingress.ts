// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { parseChannelObservation, processChannelEvent } from './channel-event-processor.js';
import { verifyMockWorkerRequest } from './worker-auth.js';

const CONTENT_TYPE = 'application/vnd.zalocrm.channel-event+json';

export async function channelEventIngressRoutes(app: FastifyInstance) {
  const io = (app as FastifyInstance & { io?: Server }).io;
  app.addContentTypeParser(CONTENT_TYPE, { parseAs: 'string', bodyLimit: 64 * 1024 }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/internal/channel-workers/events', async (request, reply) => {
    if (!resolveTikTokPersonalConfig().effective.mock) return reply.code(404).send({ error: 'Not found' });
    const rawBody = typeof request.body === 'string' ? request.body : '';
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody);
    } catch {
      return reply.code(400).send({ error: 'Invalid channel event' });
    }
    const accountId = decoded && typeof decoded === 'object' && 'accountId' in decoded
      ? String(decoded.accountId)
      : '';
    const verified = verifyMockWorkerRequest(rawBody, {
      signature: request.headers['x-channel-signature'] as string | undefined,
      timestamp: request.headers['x-channel-timestamp'] as string | undefined,
      nonce: request.headers['x-channel-nonce'] as string | undefined,
    }, accountId);
    if (!verified.valid) return reply.code(401).send({ error: 'Unauthorized', code: verified.reason });

    let observation;
    try {
      observation = parseChannelObservation(decoded);
    } catch {
      return reply.code(400).send({ error: 'Invalid channel event' });
    }
    if (verified.nonce !== observation.eventKey) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'nonce_mismatch' });
    }

    const account = await runSystemQuery(() => prisma.channelAccount.findFirst({
      where: { id: observation.accountId, provider: 'MOCK_BROWSER' },
      select: { id: true, orgId: true },
    }));
    if (!account) return reply.code(404).send({ error: 'Unknown account' });

    const event = await runSystemQuery(() => prisma.channelEvent.upsert({
      where: {
        channelAccountId_eventKey: {
          channelAccountId: account.id,
          eventKey: observation.eventKey,
        },
      },
      create: {
        orgId: account.orgId,
        channelAccountId: account.id,
        eventKey: observation.eventKey,
        kind: observation.kind,
        epoch: BigInt(observation.epoch),
        payload: observation,
        observedAt: new Date(observation.observedAt),
      },
      update: {},
      select: { id: true, status: true },
    }));
    const processed = await processChannelEvent(event.id, io);
    return reply.code(event.status === 'PENDING' ? 202 : 200).send({
      accepted: true,
      duplicate: event.status !== 'PENDING' || processed.state === 'duplicate',
      state: processed.state,
    });
  });
}
