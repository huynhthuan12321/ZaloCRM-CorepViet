// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * message-template-routes.ts — CRUD Mẫu tin nhắn cho bản Community (Phase 3 Marketing).
 *
 * Bản Community trước đây thiếu route `/automation/templates` (chỉ EE có) → màn Mẫu
 * tin nhắn + popup chèn `//` trong Chat gọi 404. File này nối lại, map về model
 * MessageTemplate + MessageTemplateFolder (đã có sẵn trong schema).
 *
 * Contract KHỚP frontend use-message-templates.ts:
 *   GET/POST/PUT/DELETE  /api/v1/automation/templates[/:id]
 *   GET/POST/PUT/DELETE  /api/v1/automation/template-folders[/:id]
 *   POST                 /api/v1/automation/templates/:id/track-use
 *
 * Org-scope + quyền riêng tư (public / của chính mình) qua message-template-helpers.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  buildTemplateWhere,
  templateDto,
  folderDto,
  normalizeShortcut,
  type TemplateFilter,
} from './message-template-helpers.js';

type UserCtx = { id: string; orgId: string; role: string };

const TEMPLATE_SELECT = {
  id: true, name: true, shortcut: true, content: true, contentRich: true,
  category: true, folderId: true, visibility: true, tagIds: true,
  manualSendCount: true, usageCount: true, createdById: true, ownerUserId: true,
  createdAt: true, updatedAt: true,
} as const;

function textFromRich(rich: unknown, fallback: unknown): string {
  if (rich && typeof rich === 'object' && typeof (rich as { text?: unknown }).text === 'string') {
    return (rich as { text: string }).text;
  }
  return typeof fallback === 'string' ? fallback : '';
}

export async function messageTemplateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET templates ──
  app.get('/api/v1/automation/templates', async (request: FastifyRequest<{ Querystring: TemplateFilter & { includeArchived?: string } }>) => {
    const user = request.user as UserCtx;
    const q = request.query;
    const filter: TemplateFilter = {
      folderId: q.folderId, visibility: q.visibility, tags: q.tags,
      category: q.category, search: q.search,
      includeArchived: String(q.includeArchived) === 'true',
    };
    const rows = await prisma.messageTemplate.findMany({
      where: buildTemplateWhere(user.orgId, user.id, filter),
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: TEMPLATE_SELECT,
    });
    return { templates: rows.map((t) => templateDto(t, user.id)) };
  });

  // ── GET folders ──
  app.get('/api/v1/automation/template-folders', async (request: FastifyRequest) => {
    const user = request.user as UserCtx;
    const rows = await prisma.messageTemplateFolder.findMany({
      where: { orgId: user.orgId, OR: [{ visibility: 'public' }, { ownerUserId: user.id }] },
      orderBy: { name: 'asc' },
      include: { _count: { select: { templates: true } } },
    });
    return { folders: rows.map(folderDto) };
  });

  // ── POST template ──
  app.post('/api/v1/automation/templates', async (
    request: FastifyRequest<{ Body: Record<string, unknown> }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const b = request.body ?? {};
    const name = String(b.name ?? '').trim();
    if (!name) return reply.status(400).send({ error: 'name is required' });
    const content = textFromRich(b.contentRich, b.content).trim();
    if (!content) return reply.status(400).send({ error: 'content is required' });
    const visibility = b.visibility === 'private' ? 'private' : 'public';
    const shortcut = normalizeShortcut(b.shortcut);

    if (shortcut) {
      const dup = await prisma.messageTemplate.findFirst({
        where: { orgId: user.orgId, shortcut, archivedAt: null },
        select: { id: true },
      });
      if (dup) return reply.status(409).send({ error: 'shortcut_exists' });
    }

    const created = await prisma.messageTemplate.create({
      data: {
        orgId: user.orgId,
        createdById: user.id,
        ownerUserId: visibility === 'private' ? user.id : null,
        name,
        shortcut,
        content,
        contentRich: b.contentRich && typeof b.contentRich === 'object' ? (b.contentRich as object) : undefined,
        category: b.category ? String(b.category) : null,
        folderId: b.folderId ? String(b.folderId) : null,
        visibility,
        tagIds: Array.isArray(b.tagIds) ? (b.tagIds as unknown[]).map(String) : [],
      },
      select: TEMPLATE_SELECT,
    });
    return templateDto(created, user.id);
  });

  // ── PUT template ──
  app.put('/api/v1/automation/templates/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const existing = await prisma.messageTemplate.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true, createdById: true, ownerUserId: true },
    });
    if (!existing) return reply.status(404).send({ error: 'template_not_found' });

    const b = request.body ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (typeof b.name === 'string') {
      const name = b.name.trim();
      if (!name) return reply.status(400).send({ error: 'name is required' });
      data.name = name;
    }
    if ('contentRich' in b || 'content' in b) {
      const content = textFromRich(b.contentRich, b.content).trim();
      if (!content) return reply.status(400).send({ error: 'content is required' });
      data.content = content;
      if ('contentRich' in b) data.contentRich = b.contentRich && typeof b.contentRich === 'object' ? (b.contentRich as object) : null;
    }
    if ('shortcut' in b) {
      const shortcut = normalizeShortcut(b.shortcut);
      if (shortcut) {
        const dup = await prisma.messageTemplate.findFirst({
          where: { orgId: user.orgId, shortcut, archivedAt: null, id: { not: request.params.id } },
          select: { id: true },
        });
        if (dup) return reply.status(409).send({ error: 'shortcut_exists' });
      }
      data.shortcut = shortcut;
    }
    if ('category' in b) data.category = b.category ? String(b.category) : null;
    if ('folderId' in b) data.folderId = b.folderId ? String(b.folderId) : null;
    if (b.visibility === 'public' || b.visibility === 'private') {
      data.visibility = b.visibility;
      data.ownerUserId = b.visibility === 'private' ? (existing.ownerUserId ?? user.id) : null;
    }
    if (Array.isArray(b.tagIds)) data.tagIds = (b.tagIds as unknown[]).map(String);

    const updated = await prisma.messageTemplate.update({
      where: { id: request.params.id },
      data,
      select: TEMPLATE_SELECT,
    });
    return templateDto(updated, user.id);
  });

  // ── DELETE template (soft: archivedAt) ──
  app.delete('/api/v1/automation/templates/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const existing = await prisma.messageTemplate.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true },
    });
    if (!existing) return reply.status(404).send({ error: 'template_not_found' });
    await prisma.messageTemplate.update({
      where: { id: request.params.id },
      data: { archivedAt: new Date() },
    });
    return { ok: true };
  });

  // ── POST folder ──
  app.post('/api/v1/automation/template-folders', async (
    request: FastifyRequest<{ Body: { name?: string; visibility?: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const name = String(request.body?.name ?? '').trim();
    if (!name) return reply.status(400).send({ error: 'name is required' });
    const visibility = request.body?.visibility === 'private' ? 'private' : 'public';
    const created = await prisma.messageTemplateFolder.create({
      data: {
        orgId: user.orgId,
        createdById: user.id,
        ownerUserId: visibility === 'private' ? user.id : null,
        name,
        visibility,
      },
      include: { _count: { select: { templates: true } } },
    });
    return folderDto(created);
  });

  // ── PUT folder ──
  app.put('/api/v1/automation/template-folders/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; visibility?: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const existing = await prisma.messageTemplateFolder.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true },
    });
    if (!existing) return reply.status(404).send({ error: 'folder_not_found' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (typeof request.body?.name === 'string') {
      const name = request.body.name.trim();
      if (!name) return reply.status(400).send({ error: 'name is required' });
      data.name = name;
    }
    if (request.body?.visibility === 'public' || request.body?.visibility === 'private') {
      data.visibility = request.body.visibility;
      data.ownerUserId = request.body.visibility === 'private' ? user.id : null;
    }
    const updated = await prisma.messageTemplateFolder.update({
      where: { id: request.params.id },
      data,
      include: { _count: { select: { templates: true } } },
    });
    return folderDto(updated);
  });

  // ── DELETE folder (force=true để gỡ folder khỏi templates rồi xoá) ──
  app.delete('/api/v1/automation/template-folders/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Querystring: { force?: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const existing = await prisma.messageTemplateFolder.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true },
    });
    if (!existing) return reply.status(404).send({ error: 'folder_not_found' });
    const count = await prisma.messageTemplate.count({ where: { orgId: user.orgId, folderId: request.params.id } });
    if (count > 0 && String(request.query.force) !== 'true') {
      return reply.status(409).send({ error: 'folder_not_empty', templates: count });
    }
    if (count > 0) {
      await prisma.messageTemplate.updateMany({
        where: { orgId: user.orgId, folderId: request.params.id },
        data: { folderId: null },
      });
    }
    await prisma.messageTemplateFolder.delete({ where: { id: request.params.id } });
    return { ok: true };
  });

  // ── POST track-use (đếm lượt chèn trong chat) ──
  app.post('/api/v1/automation/templates/:id/track-use', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    try {
      await prisma.messageTemplate.updateMany({
        where: { id: request.params.id, orgId: user.orgId },
        data: {
          usageCount: { increment: 1 },
          manualSendCount: { increment: 1 },
          lastUsedAt: new Date(),
          lastManualSentAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn({ err, id: request.params.id }, '[message-template] track-use failed');
    }
    return { ok: true };
  });
}
