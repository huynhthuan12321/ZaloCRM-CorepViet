// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import { z } from 'zod';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { logger } from '../../shared/utils/logger.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { resolveChannelContact } from './contact-identity.service.js';
import { emitAuthorizedChannelEvent } from './channel-socket.js';
import { reapStaleOutboundCommands } from './outbound-command-service.js';

const observationSchema = z.object({
  version: z.literal(1),
  eventKey: z.string().min(1).max(200),
  accountId: z.string().uuid(),
  epoch: z.string().regex(/^(0|[1-9]\d{0,19})$/),
  kind: z.literal('message.observed'),
  observedAt: z.string().datetime(),
  thread: z.object({
    id: z.string().min(1).max(300),
    displayName: z.string().trim().max(200).optional(),
  }).strict(),
  sender: z.object({
    externalUserId: z.string().min(1).max(300),
    displayName: z.string().trim().max(200).optional(),
    avatarUrl: z.string().url().max(2000).optional(),
  }).strict(),
  message: z.object({
    id: z.string().min(1).max(300),
    direction: z.enum(['inbound', 'self']),
    text: z.string().max(20_000),
    sentAt: z.string().datetime().optional(),
  }).strict(),
}).strict();

export type ChannelObservationEnvelope = z.infer<typeof observationSchema>;

export function parseChannelObservation(input: unknown): ChannelObservationEnvelope {
  return observationSchema.parse(input);
}

export interface ProcessedChannelEvent {
  state: 'processed' | 'duplicate' | 'ignored' | 'busy';
  accountId?: string;
  orgId?: string;
  conversationId?: string;
  messageId?: string;
}

export async function processChannelEvent(eventId: string, io?: Server): Promise<ProcessedChannelEvent> {
  const located = await runSystemQuery(() => prisma.channelEvent.findUnique({
    where: { id: eventId },
    select: { id: true, orgId: true },
  }));
  if (!located) return { state: 'ignored' };

  const result = await withTenant(located.orgId, () => tenantTransaction(async tx => {
    const locked = await tx.$queryRaw<Array<{
      id: string; org_id: string; channel_account_id: string; payload: unknown; status: string;
    }>>(Prisma.sql`
      SELECT id, org_id, channel_account_id, payload, status
      FROM channel_events
      WHERE id = ${eventId}
      FOR UPDATE SKIP LOCKED
    `);
    const event = locked[0];
    if (!event) return { state: 'busy' as const };
    if (event.status === 'PROCESSED') return { state: 'duplicate' as const };
    if (event.status.startsWith('IGNORED_')) return { state: 'ignored' as const };

    const parsed = observationSchema.safeParse(event.payload);
    if (!parsed.success || parsed.data.accountId !== event.channel_account_id) {
      await tx.channelEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED_INVALID_PAYLOAD', attempts: { increment: 1 }, processedAt: new Date() },
      });
      return { state: 'ignored' as const };
    }
    const data = parsed.data;
    const account = await tx.channelAccount.findFirst({
      where: {
        id: event.channel_account_id,
        orgId: event.org_id,
        provider: 'MOCK_BROWSER',
      },
      include: { session: { select: { epoch: true } } },
    });
    if (!account) {
      await tx.channelEvent.update({
        where: { id: event.id },
        data: { status: 'IGNORED_UNKNOWN_ACCOUNT', attempts: { increment: 1 }, processedAt: new Date() },
      });
      return { state: 'ignored' as const };
    }
    if (!account.enabled || !account.inboundEnabled || account.status !== 'CONNECTED') {
      await tx.channelEvent.update({
        where: { id: event.id },
        data: { status: 'IGNORED_DISABLED', attempts: { increment: 1 }, processedAt: new Date() },
      });
      return { state: 'ignored' as const };
    }
    if (!account.session || account.session.epoch !== BigInt(data.epoch)) {
      await tx.channelEvent.update({
        where: { id: event.id },
        data: { status: 'IGNORED_STALE_EPOCH', attempts: { increment: 1 }, processedAt: new Date() },
      });
      return { state: 'ignored' as const };
    }

    const contact = await resolveChannelContact(tx, {
      orgId: event.org_id,
      channelAccountId: account.id,
      externalUserId: data.sender.externalUserId,
      displayName: data.sender.displayName ?? data.thread.displayName,
      avatarUrl: data.sender.avatarUrl,
    });
    let conversation = await tx.conversation.findUnique({
      where: {
        channelAccountId_externalThreadId: {
          channelAccountId: account.id,
          externalThreadId: data.thread.id,
        },
      },
    });
    if (conversation && conversation.contactId !== contact.id) {
      await tx.channelEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED_IDENTITY_MISMATCH', attempts: { increment: 1 }, processedAt: new Date() },
      });
      return { state: 'ignored' as const };
    }
    const sentAt = data.message.sentAt ? new Date(data.message.sentAt) : new Date(data.observedAt);
    conversation ??= await tx.conversation.create({
      data: {
        orgId: event.org_id,
        channelAccountId: account.id,
        contactId: contact.id,
        threadType: 'user',
        threadKind: 'dm',
        externalThreadId: data.thread.id,
        lastMessageAt: sentAt,
        unreadCount: 0,
      },
    });
    const duplicate = await tx.message.findUnique({
      where: {
        conversationId_externalMessageId: {
          conversationId: conversation.id,
          externalMessageId: data.message.id,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      await tx.channelEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', attempts: { increment: 1 }, processedAt: new Date() },
      });
      return {
        state: 'duplicate' as const,
        orgId: event.org_id,
        accountId: account.id,
        conversationId: conversation.id,
        messageId: duplicate.id,
      };
    }

    const inbound = data.message.direction === 'inbound';
    const message = await tx.message.create({
      data: {
        orgId: event.org_id,
        conversationId: conversation.id,
        externalMessageId: data.message.id,
        observedAt: new Date(data.observedAt),
        senderType: inbound ? 'contact' : 'self',
        senderUid: data.sender.externalUserId,
        senderName: data.sender.displayName ?? null,
        content: data.message.text,
        contentType: 'text',
        sentAt,
        sentVia: 'user',
        metadata: { channel: 'mock_browser', eventKey: data.eventKey },
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: sentAt,
        ...(inbound ? { unreadCount: { increment: 1 }, isReplied: false } : {}),
      },
    });
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        lastActivity: sentAt,
        ...(inbound ? {
          lastInboundAt: sentAt,
          lastInboundMessageId: message.id,
          lastInboundPreview: data.message.text.slice(0, 500),
          totalInbound: { increment: 1 },
        } : {
          lastOutboundAt: sentAt,
          totalOutbound: { increment: 1 },
        }),
      },
    });
    await tx.channelEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', attempts: { increment: 1 }, processedAt: new Date() },
    });
    return {
      state: 'processed' as const,
      orgId: event.org_id,
      accountId: account.id,
      conversationId: conversation.id,
      messageId: message.id,
    };
  }));

  if (io && result.state === 'processed' && result.orgId && result.accountId) {
    await emitAuthorizedChannelEvent({
      io,
      orgId: result.orgId,
      accountId: result.accountId,
      purpose: 'read',
      event: 'channel:message',
      payload: { conversationId: result.conversationId, messageId: result.messageId },
    });
  }
  return result;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startChannelEventProcessor(io: Server): void {
  if (timer || !resolveTikTokPersonalConfig().effective.mock) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const pending = await runSystemQuery(() => prisma.channelEvent.findMany({
        where: { status: 'PENDING', account: { provider: 'MOCK_BROWSER' } },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { id: true },
      }));
      for (const event of pending) await processChannelEvent(event.id, io);
      await reapStaleOutboundCommands(new Date(Date.now() - 60_000), io);
    } catch (error) {
      logger.warn(`[channel-event-processor] tick failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  }, 2_000);
  timer.unref();
}

export function stopChannelEventProcessor(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
