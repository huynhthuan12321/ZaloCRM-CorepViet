// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * target-routes.ts — Mục tiêu (auto kết bạn): CRUD job + log.
 *
 * Endpoints:
 *   GET    /api/v1/target-jobs             — danh sách job (org scope)
 *   POST   /api/v1/target-jobs             — tạo job (chạy ngay, liên tục tới khi xong)
 *   GET    /api/v1/target-jobs/:id         — chi tiết
 *   PATCH  /api/v1/target-jobs/:id         — sửa / pause / resume
 *   DELETE /api/v1/target-jobs/:id         — xoá (cascade log)
 *   GET    /api/v1/target-jobs/:id/items   — log từng đối tượng
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { DEFAULT_REQUEST_MESSAGE } from '../campaign/campaign-service.js';

interface JobBody {
  name?: string;
  customerListId?: string;
  zaloAccountId?: string;
  requestMsg?: string;
  maxTotal?: number;
  delaySecMin?: number;
  delaySecMax?: number;
  status?: 'active' | 'paused';
}

// Chỉ owner/admin được tạo/sửa/xoá Mục tiêu — gửi lời mời hàng loạt cũng là hành
// động rủi ro (spam/report) tương tự Broadcast, không nên mở cho mọi user.
function requireTargetAdmin(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply): boolean {
  const user = request.user!;
  if (user.role !== 'admin' && user.role !== 'owner') {
    reply.status(403).send({ error: 'forbidden', code: 'target_admin_only' });
    return false;
  }
  return true;
}

export async function targetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /target-jobs ────────────────────────────────────────────────────
  app.get('/api/v1/target-jobs', async (request) => {
    const user = request.user!;
    const jobs = await prisma.targetJob.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
    });
    const [lists, nicks] = await Promise.all([
      prisma.customerList.findMany({
        where: { id: { in: [...new Set(jobs.map((j) => j.customerListId))] } },
        select: { id: true, name: true, hasZaloEntries: true },
      }),
      prisma.zaloAccount.findMany({
        where: { id: { in: [...new Set(jobs.map((j) => j.zaloAccountId))] } },
        select: { id: true, displayName: true, phone: true, status: true },
      }),
    ]);
    const listMap = new Map(lists.map((l) => [l.id, l]));
    const nickMap = new Map(nicks.map((n) => [n.id, n]));
    return {
      jobs: jobs.map((j) => ({
        ...j,
        list: listMap.get(j.customerListId) ?? null,
        nick: nickMap.get(j.zaloAccountId) ?? null,
      })),
    };
  });

  // ── POST /target-jobs ───────────────────────────────────────────────────
  app.post<{ Body: JobBody }>('/api/v1/target-jobs', async (request, reply) => {
    if (!requireTargetAdmin(request, reply)) return;
    const user = request.user!;
    const b = request.body ?? {};

    if (!b.name?.trim()) return reply.status(400).send({ error: 'name_required' });

    const [list, nick] = await Promise.all([
      prisma.customerList.findFirst({ where: { id: b.customerListId ?? '', orgId: user.orgId }, select: { id: true } }),
      prisma.zaloAccount.findFirst({ where: { id: b.zaloAccountId ?? '', orgId: user.orgId }, select: { id: true } }),
    ]);
    if (!list) return reply.status(400).send({ error: 'customerList_not_found' });
    if (!nick) return reply.status(400).send({ error: 'zaloAccount_not_found' });

    const job = await prisma.targetJob.create({
      data: {
        orgId: user.orgId,
        createdById: user.id,
        name: b.name.trim(),
        customerListId: list.id,
        zaloAccountId: nick.id,
        requestMsg: b.requestMsg?.trim() || DEFAULT_REQUEST_MESSAGE,
        maxTotal: Math.min(2000, Math.max(1, b.maxTotal ?? 200)),
        delaySecMin: Math.max(10, b.delaySecMin ?? 60),
        delaySecMax: Math.max(10, b.delaySecMax ?? 180),
      },
    });
    logger.info(`[target] job created id=${job.id} by=${user.id}`);
    return reply.status(201).send({ job });
  });

  // ── GET /target-jobs/:id ────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/v1/target-jobs/:id', async (request, reply) => {
    const user = request.user!;
    const job = await prisma.targetJob.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
    if (!job) return reply.status(404).send({ error: 'not_found' });
    return { job };
  });

  // ── PATCH /target-jobs/:id — sửa / pause / resume ───────────────────────
  app.patch<{ Params: { id: string }; Body: JobBody }>('/api/v1/target-jobs/:id', async (request, reply) => {
    if (!requireTargetAdmin(request, reply)) return;
    const user = request.user!;
    const existing = await prisma.targetJob.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    const b = request.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.requestMsg !== undefined) data.requestMsg = b.requestMsg?.trim() || DEFAULT_REQUEST_MESSAGE;
    if (b.maxTotal !== undefined) data.maxTotal = Math.min(2000, Math.max(1, b.maxTotal));
    if (b.delaySecMin !== undefined) data.delaySecMin = Math.max(10, b.delaySecMin);
    if (b.delaySecMax !== undefined) data.delaySecMax = Math.max(10, b.delaySecMax);
    if (b.status === 'paused' || b.status === 'active') data.status = b.status;

    const job = await prisma.targetJob.update({ where: { id: existing.id }, data });
    return { job };
  });

  // ── DELETE /target-jobs/:id ─────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/v1/target-jobs/:id', async (request, reply) => {
    if (!requireTargetAdmin(request, reply)) return;
    const user = request.user!;
    const existing = await prisma.targetJob.findFirst({ where: { id: request.params.id, orgId: user.orgId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.targetJob.delete({ where: { id: existing.id } });
    return { ok: true };
  });

  // ── GET /target-jobs/:id/items ───────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/api/v1/target-jobs/:id/items',
    async (request, reply) => {
      const user = request.user!;
      const job = await prisma.targetJob.findFirst({ where: { id: request.params.id, orgId: user.orgId }, select: { id: true } });
      if (!job) return reply.status(404).send({ error: 'not_found' });
      const { status } = request.query;
      const items = await prisma.targetRunItem.findMany({
        where: { jobId: job.id, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      return { items };
    },
  );
}
