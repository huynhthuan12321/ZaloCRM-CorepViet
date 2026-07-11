// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * knowledge-routes.ts — API knowledge base RAG (Trợ lý AI Cờ Rếp Việt, Đợt 1).
 *   GET/PUT /api/v1/ai/knowledge/config   — provider/model embedding (admin)
 *   GET     /api/v1/ai/knowledge/docs      — danh sách tài liệu
 *   POST    /api/v1/ai/knowledge/docs      — nạp tài liệu (dán text) (admin)
 *   DELETE  /api/v1/ai/knowledge/docs/:id  — xoá tài liệu (admin)
 *   POST    /api/v1/ai/knowledge/ask       — hỏi đáp RAG (mọi user)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../../shared/database/prisma-client.js';
import { authMiddleware } from '../../auth/auth-middleware.js';
import { requireGrant } from '../../rbac/rbac-middleware.js';
import { logger } from '../../../shared/utils/logger.js';
import { getAiConfig } from '../ai-service.js';
import { ingestText, listDocs, deleteDoc, ragAnswer } from './knowledge-service.js';

const ERR_MSG: Record<string, string> = {
  EMBED_NOT_CONFIGURED: 'Chưa cấu hình model embedding — vào Cài đặt → Trợ lý AI → chọn provider/model embedding.',
  EMBED_KEY_MISSING: 'Provider embedding chưa có API key — nhập key ở Cấu hình AI.',
  CHAT_KEY_MISSING: 'Provider chat chưa có API key — nhập key ở Cấu hình AI.',
  EMPTY_TEXT: 'Nội dung tài liệu rỗng.',
  EMPTY_QUESTION: 'Chưa nhập câu hỏi.',
};
function friendly(err: unknown): string {
  const m = (err as Error)?.message || '';
  return ERR_MSG[m] || m || 'Lỗi không xác định';
}

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Config embedding ──────────────────────────────────────────────────
  app.get('/api/v1/ai/knowledge/config', async (request: FastifyRequest) => {
    const cfg = await getAiConfig(request.user!.orgId);
    return { embedProvider: cfg.embedProvider ?? null, embedModel: cfg.embedModel ?? null };
  });

  app.put('/api/v1/ai/knowledge/config', { preHandler: requireGrant('settings', 'edit') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user!.orgId;
      const body = (request.body ?? {}) as { embedProvider?: string | null; embedModel?: string | null };
      await getAiConfig(orgId); // đảm bảo row tồn tại
      await prisma.aiConfig.update({
        where: { orgId },
        data: {
          embedProvider: body.embedProvider?.trim() || null,
          embedModel: body.embedModel?.trim() || null,
        },
      });
      return { ok: true };
    } catch (err) {
      logger.error('[ai-knowledge] config PUT error:', err);
      return reply.status(400).send({ error: friendly(err) });
    }
  });

  // ── Tài liệu ──────────────────────────────────────────────────────────
  app.get('/api/v1/ai/knowledge/docs', async (request: FastifyRequest) => {
    return { docs: await listDocs(request.user!.orgId) };
  });

  app.post('/api/v1/ai/knowledge/docs', { preHandler: requireGrant('settings', 'edit') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user!.orgId;
      const body = (request.body ?? {}) as { title?: string; text?: string };
      if (!body.text?.trim()) return reply.status(400).send({ error: ERR_MSG.EMPTY_TEXT });
      const out = await ingestText({ orgId, title: body.title ?? 'Tài liệu', text: body.text, createdById: request.user!.id });
      return reply.status(201).send(out);
    } catch (err) {
      logger.error('[ai-knowledge] docs POST error:', err);
      return reply.status(400).send({ error: friendly(err) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/v1/ai/knowledge/docs/:id', { preHandler: requireGrant('settings', 'edit') }, async (request, reply) => {
    const ok = await deleteDoc(request.user!.orgId, request.params.id);
    if (!ok) return reply.status(404).send({ error: 'not_found' });
    return { ok: true };
  });

  // ── Hỏi đáp RAG ───────────────────────────────────────────────────────
  app.post('/api/v1/ai/knowledge/ask', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (request.body ?? {}) as { question?: string };
      if (!body.question?.trim()) return reply.status(400).send({ error: ERR_MSG.EMPTY_QUESTION });
      const out = await ragAnswer({ orgId: request.user!.orgId, question: body.question });
      return out;
    } catch (err) {
      logger.error('[ai-knowledge] ask error:', err);
      return reply.status(400).send({ error: friendly(err) });
    }
  });
}
