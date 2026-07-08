// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
/**
 * public-api-routes.ts - External REST API authenticated via API key.
 * All public routes require X-Api-Key and receive orgId from that API key.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashApiKey } from '../../shared/crypto/api-key-hash.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { downloadMediaToTemp } from '../chat/chat-media-helpers.js';

async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string;
  if (!apiKey) return reply.status(401).send({ error: 'API key required' });

  const setting = await prisma.appSetting.findFirst({
    where: { settingKey: 'public_api_key', valueHash: hashApiKey(apiKey) },
  });
  if (!setting) return reply.status(401).send({ error: 'Invalid API key' });

  (request as any).orgId = setting.orgId;
}

export async function publicApiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', apiKeyAuth);

  app.get('/api/public/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const { search = '', status = '', limit = '20' } = request.query as Record<string, string>;

      const where: any = { orgId };
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const contacts = await prisma.contact.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          source: true,
          status: true,
          notes: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(parseInt(limit) || 20, 100),
      });

      return { contacts };
    } catch (err) {
      logger.error('[public-api] GET /contacts error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  app.get('/api/public/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const { id } = request.params as { id: string };

      const contact = await prisma.contact.findFirst({
        where: { id, orgId },
        include: {
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 5 },
          _count: { select: { conversations: true } },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      return contact;
    } catch (err) {
      logger.error('[public-api] GET /contacts/:id error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  app.post('/api/public/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const body = request.body as Record<string, any>;

      if (!body?.fullName && !body?.phone) {
        return reply.status(400).send({ error: 'fullName or phone is required' });
      }

      const contact = await prisma.contact.create({
        data: {
          orgId,
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          source: body.source,
          status: body.status ?? 'new',
          notes: body.notes,
          tags: body.tags ?? [],
        },
      });

      return reply.status(201).send(contact);
    } catch (err) {
      logger.error('[public-api] POST /contacts error:', err);
      return reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  app.put('/api/public/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const existing = await prisma.contact.findFirst({ where: { id, orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      const updated = await prisma.contact.update({
        where: { id },
        data: {
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          source: body.source,
          status: body.status,
          notes: body.notes,
          tags: body.tags,
        },
      });

      return updated;
    } catch (err) {
      logger.error('[public-api] PUT /contacts/:id error:', err);
      return reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  app.get('/api/public/contacts/by-phone/:phone', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const { phone } = request.params as { phone: string };

      const phoneNorm = normalizePhone(phone);
      if (!phoneNorm) return reply.status(400).send({ error: 'invalid_phone' });

      const contact = await prisma.contact.findFirst({
        where: { orgId, phoneNormalized: phoneNorm },
        select: { id: true, fullName: true, phone: true, status: true },
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const friends = await prisma.friend.findMany({
        where: { orgId, contactId: contact.id, friendshipStatus: 'accepted' },
        select: {
          zaloAccountId: true,
          zaloUidInNick: true,
          zaloAccount: { select: { displayName: true } },
        },
      });

      return {
        contact,
        friends: friends.map((f) => ({
          zaloAccountId: f.zaloAccountId,
          accountName: f.zaloAccount?.displayName ?? null,
          zaloUid: f.zaloUidInNick,
        })),
      };
    } catch (err) {
      logger.error('[public-api] GET /contacts/by-phone error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact by phone' });
    }
  });

  app.get('/api/public/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const { limit = '20' } = request.query as Record<string, string>;

      const conversations = await prisma.conversation.findMany({
        where: { orgId, deletedAt: null },
        select: {
          id: true,
          threadType: true,
          externalThreadId: true,
          lastMessageAt: true,
          unreadCount: true,
          isReplied: true,
          contact: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: Math.min(parseInt(limit) || 20, 100),
      });

      return { conversations };
    } catch (err) {
      logger.error('[public-api] GET /conversations error:', err);
      return reply.status(500).send({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/public/conversations/:id/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const { id } = request.params as { id: string };
      const { limit = '50' } = request.query as Record<string, string>;

      const conv = await prisma.conversation.findFirst({ where: { id, orgId }, select: { id: true } });
      if (!conv) return reply.status(404).send({ error: 'Conversation not found' });

      const messages = await prisma.message.findMany({
        where: { conversationId: id, isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: Math.min(parseInt(limit) || 50, 200),
        select: {
          id: true,
          senderType: true,
          senderName: true,
          content: true,
          contentType: true,
          sentAt: true,
          attachments: true,
        },
      });

      return { messages };
    } catch (err) {
      logger.error('[public-api] GET /conversations/:id/messages error:', err);
      return reply.status(500).send({ error: 'Failed to fetch messages' });
    }
  });

  app.get('/api/public/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const { from, to } = request.query as Record<string, string>;

      const where: any = { orgId };
      if (from || to) {
        where.appointmentDate = {};
        if (from) where.appointmentDate.gte = new Date(from);
        if (to) where.appointmentDate.lte = new Date(to);
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: { contact: { select: { id: true, fullName: true, phone: true } } },
        orderBy: { appointmentDate: 'asc' },
        take: 100,
      });

      return { appointments };
    } catch (err) {
      logger.error('[public-api] GET /appointments error:', err);
      return reply.status(500).send({ error: 'Failed to fetch appointments' });
    }
  });

  app.post('/api/public/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const body = request.body as Record<string, any>;

      if (!body?.contactId || !body?.appointmentDate) {
        return reply.status(400).send({ error: 'contactId and appointmentDate are required' });
      }

      const contact = await prisma.contact.findFirst({ where: { id: body.contactId, orgId }, select: { id: true } });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const appointment = await prisma.appointment.create({
        data: {
          orgId,
          contactId: body.contactId,
          appointmentDate: new Date(body.appointmentDate),
          appointmentTime: body.appointmentTime,
          type: body.type,
          notes: body.notes,
        },
      });

      return reply.status(201).send(appointment);
    } catch (err) {
      logger.error('[public-api] POST /appointments error:', err);
      return reply.status(500).send({ error: 'Failed to create appointment' });
    }
  });

  app.post('/api/public/messages/send', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const body = request.body as Record<string, any>;

      if (!body?.zaloAccountId || !body?.threadId || !body?.content) {
        return reply.status(400).send({ error: 'zaloAccountId, threadId, and content are required' });
      }

      const account = await prisma.zaloAccount.findFirst({
        where: { id: body.zaloAccountId, orgId },
        select: { id: true, status: true, archivedAt: true },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
      if (account.archivedAt) {
        return reply.status(409).send({
          error: 'Nick nay da bi xoa - khong gui duoc. Ket noi lai nick de tiep tuc.',
          code: 'NICK_ARCHIVED',
        });
      }
      if (account.status !== 'connected') {
        return reply.status(422).send({ error: 'Zalo account is not connected' });
      }

      const { zaloPool } = await import('../zalo/zalo-pool.js');
      const api = zaloPool.getApi(body.zaloAccountId);
      if (!api) return reply.status(422).send({ error: 'Zalo account not active in pool' });

      const threadType = body.threadType === 'group' ? 1 : 0;
      await api.sendMessage(body.content, body.threadId, threadType);

      return { success: true };
    } catch (err) {
      logger.error('[public-api] POST /messages/send error:', err);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });

  app.post('/api/public/messages/send-image', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).orgId as string;
      const body = request.body as Record<string, any>;

      if (!body?.zaloAccountId) {
        return reply.status(400).send({ error: 'zaloAccountId is required' });
      }

      const imageUrls: string[] = Array.isArray(body.imageUrls)
        ? body.imageUrls.filter((u: unknown): u is string => typeof u === 'string' && u.trim().length > 0)
        : typeof body.imageUrl === 'string' && body.imageUrl.trim()
          ? [body.imageUrl.trim()]
          : [];
      if (imageUrls.length === 0) {
        return reply.status(400).send({ error: 'imageUrl or imageUrls is required' });
      }

      const account = await prisma.zaloAccount.findFirst({
        where: { id: body.zaloAccountId, orgId },
        select: { id: true, status: true, archivedAt: true },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
      if (account.archivedAt) {
        return reply.status(409).send({
          error: 'Nick nay da bi xoa - khong gui duoc. Ket noi lai nick de tiep tuc.',
          code: 'NICK_ARCHIVED',
        });
      }
      if (account.status !== 'connected') {
        return reply.status(422).send({ error: 'Zalo account is not connected' });
      }

      let threadId = typeof body.threadId === 'string' ? body.threadId.trim() : '';
      if (!threadId) {
        const phoneNorm = normalizePhone(body.phone);
        if (!phoneNorm) return reply.status(400).send({ error: 'threadId or valid phone is required' });

        const friend = await prisma.friend.findFirst({
          where: {
            orgId,
            zaloAccountId: account.id,
            friendshipStatus: 'accepted',
            contact: { phoneNormalized: phoneNorm },
          },
          select: { zaloUidInNick: true },
        });
        if (!friend) {
          return reply.status(404).send({ error: 'friend_not_found', hint: 'Khach chua ket ban voi nick nay' });
        }
        threadId = friend.zaloUidInNick;
      }

      const failed: Array<{ index: number; error: string }> = [];
      let sent = 0;

      for (let i = 0; i < imageUrls.length; i++) {
        const caption = i === 0 && typeof body.caption === 'string' ? body.caption : '';
        let media: { path: string; cleanup: () => Promise<void> } | null = null;

        try {
          media = await downloadMediaToTemp({ url: imageUrls[i] }, 'image');
          await zaloOps.sendImage(account.id, threadId, 0, [media.path], null, caption);
          sent++;
        } catch (err) {
          if (err instanceof ZaloOpError && err.code === 'RATE_LIMITED') {
            return reply.status(429).send({ error: 'rate_limited', sent, threadId });
          }
          if (err instanceof ZaloOpError && err.code === 'NOT_CONNECTED') {
            return reply.status(422).send({ error: 'Zalo account is not connected', sent, threadId });
          }

          failed.push({ index: i, error: String((err as Error)?.message ?? err).slice(0, 300) });
          logger.warn(`[public-api] send-image image #${i} error: ${(err as Error)?.message ?? err}`);
        } finally {
          if (media) await media.cleanup().catch(() => {});
        }
      }

      if (sent === 0) {
        return reply.status(500).send({ error: 'send_image_failed', sent: 0, threadId, failed });
      }
      if (failed.length > 0) {
        return reply.status(207).send({ success: false, sent, threadId, failed });
      }
      return { success: true, sent, threadId };
    } catch (err) {
      logger.error('[public-api] POST /messages/send-image error:', err);
      return reply.status(500).send({ error: 'Failed to send image' });
    }
  });
}
