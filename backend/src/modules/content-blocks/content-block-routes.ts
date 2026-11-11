// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * content-block-routes.ts — Khối nội dung: kho nội dung tái dùng cho Broadcast /
 * Luồng kịch bản. Phase 3 (2026-07-13): thêm loại khối (send_message / request_friend /
 * status_change), biến thể (variants), tag, folder, bật/tắt, tìm/lọc.
 *
 * Endpoints (org-scoped, mọi user đăng nhập — khối nội dung KHÔNG tự gửi gì):
 *   GET    /api/v1/content-blocks            — list + filter (?q, ?type, ?enabled, ?tag)
 *   POST   /api/v1/content-blocks            — tạo
 *   PATCH  /api/v1/content-blocks/:id        — sửa (gồm bật/tắt bằng { enabled })
 *   DELETE /api/v1/content-blocks/:id        — xoá
 *
 * AN TOÀN: đây là CRUD dữ liệu thuần — KHÔNG gọi Zalo API, KHÔNG enqueue job. variants[0]
 * được đồng bộ vào messageText/imageUrl để worker gửi (broadcast-cron) đọc như cũ.
 */
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  BLOCK_TYPES,
  normalizeBlockType,
  buildBlockContent,
  unknownVars,
} from './content-block-helpers.js';

interface BlockBody {
  name?: string;
  messageText?: string;
  imageUrl?: string | null;
  blockType?: string;
  variants?: unknown;
  tags?: unknown;
  folder?: string | null;
  enabled?: boolean;
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((t) => String(t ?? '').trim()).filter(Boolean))].slice(0, 20);
}

export async function contentBlockRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get<{ Querystring: { q?: string; type?: string; enabled?: string; tag?: string } }>(
    '/api/v1/content-blocks',
    async (request) => {
      const user = request.user!;
      const { q, type, enabled, tag } = request.query;

      const where: Prisma.ContentBlockWhereInput = { orgId: user.orgId };
      if (type && (BLOCK_TYPES as readonly string[]).includes(type)) where.blockType = type;
      if (enabled === 'true') where.enabled = true;
      else if (enabled === 'false') where.enabled = false;
      if (tag?.trim()) where.tags = { has: tag.trim() };
      if (q?.trim()) {
        const term = q.trim();
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { messageText: { contains: term, mode: 'insensitive' } },
        ];
      }

      const blocks = await prisma.contentBlock.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      return { blocks };
    },
  );

  app.post<{ Body: BlockBody }>('/api/v1/content-blocks', async (request, reply) => {
    const user = request.user!;
    const b = request.body ?? {};
    if (!b.name?.trim()) return reply.status(400).send({ error: 'name_required' });

    const content = buildBlockContent(b.variants, b.messageText ?? '', b.imageUrl ?? null);
    if (!content) return reply.status(400).send({ error: 'content_required' });

    // Chặn biến {{lạ}} ở MỌI variant — tránh gửi nguyên {{...}} cho khách thật.
    const bad = [...new Set(content.variants.flatMap((v) => unknownVars(v.text)))];
    if (bad.length) return reply.status(400).send({ error: 'unknown_vars', vars: bad });

    const block = await prisma.contentBlock.create({
      data: {
        orgId: user.orgId,
        createdById: user.id,
        name: b.name.trim(),
        blockType: normalizeBlockType(b.blockType),
        messageText: content.messageText,
        imageUrl: content.imageUrl,
        variants: content.variants as unknown as Prisma.InputJsonValue,
        tags: cleanTags(b.tags),
        folder: b.folder?.trim() || null,
        enabled: b.enabled !== false,
      },
    });
    return reply.status(201).send({ block });
  });

  app.patch<{ Params: { id: string }; Body: BlockBody }>('/api/v1/content-blocks/:id', async (request, reply) => {
    const user = request.user!;
    const existing = await prisma.contentBlock.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    const b = request.body ?? {};
    const data: Prisma.ContentBlockUpdateInput = {};
    if (b.name !== undefined) {
      if (!b.name.trim()) return reply.status(400).send({ error: 'name_required' });
      data.name = b.name.trim();
    }
    if (b.blockType !== undefined) data.blockType = normalizeBlockType(b.blockType);
    if (b.tags !== undefined) data.tags = cleanTags(b.tags);
    if (b.folder !== undefined) data.folder = b.folder?.trim() || null;
    if (b.enabled !== undefined) data.enabled = b.enabled;

    // Nếu đụng tới nội dung (variants / messageText / imageUrl) thì rebuild + đồng bộ.
    if (b.variants !== undefined || b.messageText !== undefined || b.imageUrl !== undefined) {
      const content = buildBlockContent(
        b.variants !== undefined ? b.variants : existing.variants,
        b.messageText !== undefined ? b.messageText : existing.messageText,
        b.imageUrl !== undefined ? b.imageUrl : existing.imageUrl,
      );
      if (!content) return reply.status(400).send({ error: 'content_required' });
      const bad = [...new Set(content.variants.flatMap((v) => unknownVars(v.text)))];
      if (bad.length) return reply.status(400).send({ error: 'unknown_vars', vars: bad });
      data.variants = content.variants as unknown as Prisma.InputJsonValue;
      data.messageText = content.messageText;
      data.imageUrl = content.imageUrl;
    }

    const block = await prisma.contentBlock.update({ where: { id: existing.id }, data });
    return { block };
  });

  app.delete<{ Params: { id: string } }>('/api/v1/content-blocks/:id', async (request, reply) => {
    const user = request.user!;
    const existing = await prisma.contentBlock.findFirst({ where: { id: request.params.id, orgId: user.orgId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.contentBlock.delete({ where: { id: existing.id } });
    return { ok: true };
  });
}
