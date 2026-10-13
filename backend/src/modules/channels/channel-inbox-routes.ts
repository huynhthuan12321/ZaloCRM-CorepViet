// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Server } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { getZaloScope } from '../zalo/zalo-scope.js';
import { buildPrivacyContext, redactConversationRow, redactMessage } from '../privacy/redact.js';
import { allowedChannelProviders, channelScope, hasChannelAccess } from './channel-scope.js';
import { browserChannelCapabilities } from './channel-capabilities.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { recheckChannelSubscriptions } from './channel-socket.js';
import { unifiedInboxWhere } from './unified-inbox-query.js';
import { channelExtensionPolicy } from './channel-extension-policy.js';

const querySchema = z.object({
  channel: z.enum(['all', 'zalo', 'tiktok', 'mock']).default('all'),
  channelAccountId: z.string().uuid().optional(), search: z.string().trim().max(200).default(''),
  unread: z.enum(['true', 'false']).optional(), tab: z.enum(['main', 'other']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const accountSelect = {
  id: true, displayName: true, provider: true, status: true,
  enabled: true, outboundEnabled: true,
} as const;
const readOnlyCapabilities = {
  textRead: true,
  textSend: false,
  imageRead: false,
  imageSend: false,
  canInitiate: false as const,
  aiAutoSend: false as const,
  automation: false as const,
  broadcast: false as const,
};
const actor = (request: FastifyRequest) => ({ userId: request.user!.id, orgId: request.user!.orgId });

async function channelCapabilities(request: FastifyRequest, account: {
  id: string; provider: string; status: string; enabled: boolean; outboundEnabled: boolean;
}) {
  const cfg = resolveTikTokPersonalConfig();
  const configured = browserChannelCapabilities(account.provider as 'MOCK_BROWSER', cfg);
  const extension = channelExtensionPolicy(configured, cfg);
  const canChat = !!(account.provider === 'MOCK_BROWSER'
    && account.enabled
    && account.outboundEnabled
    && account.status === 'CONNECTED'
    && extension.manualText
    && await hasChannelAccess(actor(request), account.id, 'chat'));
  return { ...configured, textSend: canChat, aiAutoSend: false as const };
}

export async function channelInboxRoutes(app: FastifyInstance) {
  const io = (app as FastifyInstance & { io?: Server }).io;
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireGrant('conversation', 'access'));

  app.get('/api/v1/channel-accounts', async (request) => {
    const providers = allowedChannelProviders();
    // OFF: no query on tables that may not exist yet.
    if (!providers.length) return { available: false, accounts: [] };
    const accounts = await prisma.channelAccount.findMany({ where: await channelScope(actor(request)), select: accountSelect });
    return { available: true, accounts };
  });

  app.patch('/api/v1/channel-accounts/:id/access', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ userId: z.string().uuid(), permission: z.enum(['read', 'chat', 'admin']) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid grant' });
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    const target = await prisma.user.findFirst({ where: { id: parsed.data.userId, orgId: request.user!.orgId, isActive: true }, select: { id: true } });
    if (!target) return reply.code(404).send({ error: 'Not found' });
    await prisma.channelAccountAccess.upsert({
      where: { channelAccountId_userId: { channelAccountId: id, userId: target.id } },
      create: { orgId: request.user!.orgId, channelAccountId: id, userId: target.id, permission: parsed.data.permission },
      update: { permission: parsed.data.permission },
    });
    if (io) await recheckChannelSubscriptions(io, request.user!.orgId, id);
    return { ok: true };
  });
  app.delete('/api/v1/channel-accounts/:id/access/:userId', async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    if (!(await hasChannelAccess(actor(request), id, 'admin'))) return reply.code(404).send({ error: 'Not found' });
    await prisma.channelAccountAccess.deleteMany({ where: { orgId: request.user!.orgId, channelAccountId: id, userId } });
    if (io) await recheckChannelSubscriptions(io, request.user!.orgId, id);
    return { ok: true };
  });

  app.get('/api/v1/channel-inbox', async (request, reply) => {
    if (!allowedChannelProviders().length) return reply.code(503).send({ error: 'Channel inbox disabled', code: 'CHANNELS_DISABLED' });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid inbox filters' });
    const { page, limit, ...filters } = parsed.data;
    const user = request.user!;
    const currentUser = await prisma.user.findFirst({ where: { id: user.id, orgId: user.orgId, isActive: true }, select: { role: true } });
    if (!currentUser) return reply.code(403).send({ error: 'Inactive user' });
    const [zalo, channels] = await Promise.all([
      getZaloScope(user.id, user.orgId, currentUser.role), channelScope(actor(request)),
    ]);
    // Private Zalo content search may reveal matches even after redaction. Search only
    // non-private nick content in this new endpoint; old Zalo endpoint remains unchanged.
    const where = unifiedInboxWhere({ orgId: user.orgId, zaloIds: zalo.displayableIds, channelScope: channels,
      filters: { ...filters, unread: filters.unread === 'true' } });
    if (filters.search) where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : [where.AND ?? {}]),
      { OR: [{ zaloAccountId: null }, { zaloAccount: { privacyMode: { not: 'main' } } }] },
    ];
    const [rows, total, unread] = await Promise.all([
      prisma.conversation.findMany({ where,
        include: {
          contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } },
          zaloAccount: { select: { id: true, displayName: true, avatarUrl: true, zaloUid: true, privacyMode: true, ownerUserId: true, archivedAt: true } },
          channelAccount: { select: accountSelect },
          messages: { take: 1, orderBy: [{ zaloMsgIdNum: { sort: 'desc', nulls: 'last' } }, { sentAt: 'desc' }, { id: 'desc' }],
            select: { id: true, content: true, contentType: true, senderType: true, sentAt: true, isDeleted: true } },
        }, orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.conversation.count({ where }),
      prisma.conversation.count({ where: { AND: [where, { unreadCount: { gt: 0 } }] } }),
    ]);
    const privacy = await buildPrivacyContext(request);
    const conversations = await Promise.all(rows.map(async row => {
      if (row.channelAccount) return {
        ...row,
        channel: row.channelAccount.provider,
        capabilities: await channelCapabilities(request, row.channelAccount),
        friendship: null,
      };
      const redacted = redactConversationRow({ ...row, channel: 'ZALO' } as any, privacy) as any;
      redacted.messages = row.messages.map(message => redactMessage(message, row as any, privacy));
      return redacted;
    }));
    return { conversations, total, counts: { total, unread }, page, limit, hasMore: page * limit < total };
  });

  const findReadable = async (request: FastifyRequest) => {
    if (!allowedChannelProviders().length) return null;
    const { id } = request.params as { id: string };
    return prisma.conversation.findFirst({
      where: { id, orgId: request.user!.orgId, deletedAt: null, zaloAccountId: null,
        channelAccount: await channelScope(actor(request)) },
      include: { channelAccount: { select: accountSelect },
        contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } } },
    });
  };
  app.get('/api/v1/channel-inbox/:id', async (request, reply) => {
    const row = await findReadable(request);
    if (!row) return reply.code(404).send({ error: 'Not found' });
    return {
      ...row,
      zaloAccount: null,
      channel: row.channelAccount!.provider,
      capabilities: row.channelAccount
        ? await channelCapabilities(request, row.channelAccount)
        : readOnlyCapabilities,
      friendship: null,
    };
  });
  app.get('/api/v1/channel-inbox/:id/messages', async (request, reply) => {
    const row = await findReadable(request);
    if (!row) return reply.code(404).send({ error: 'Not found' });
    const parsed = querySchema.pick({ page: true, limit: true }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid pagination' });
    const { page, limit } = parsed.data;
    const where = { orgId: request.user!.orgId, conversationId: row.id };
    const [messages, total] = await Promise.all([
      prisma.message.findMany({ where, orderBy: [{ sentAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
        select: { id: true, externalMessageId: true, content: true, contentType: true, senderType: true, senderName: true,
          senderUid: true, sentAt: true, observedAt: true, isDeleted: true, channelSendState: true,
          clientEchoId: true, metadata: true, attachments: true } }),
      prisma.message.count({ where }),
    ]);
    return { messages: messages.reverse(), total, page, hasMore: page * limit < total };
  });
}
