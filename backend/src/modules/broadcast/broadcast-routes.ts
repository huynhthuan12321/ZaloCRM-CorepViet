// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * broadcast-routes.ts — Broadcast tự động: CRUD job + theo dõi run.
 *
 * Endpoints:
 *   GET    /api/v1/broadcast-jobs             — danh sách job (org scope)
 *   POST   /api/v1/broadcast-jobs             — tạo job
 *   GET    /api/v1/broadcast-jobs/:id         — chi tiết + 10 run gần nhất
 *   PATCH  /api/v1/broadcast-jobs/:id         — sửa / pause / resume
 *   POST   /api/v1/broadcast-jobs/:id/run-now — chạy ngay (nextRunAt = now)
 *   DELETE /api/v1/broadcast-jobs/:id         — xoá (cascade runs/items)
 *   GET    /api/v1/broadcast-jobs/:id/runs/:runId/items — log từng người nhận
 *   POST   /api/v1/broadcast-jobs/audience-count — dry-run đếm người nhận + quota (Phase 2)
 *   POST   /api/v1/broadcast-jobs/:id/runs/:runId/retry-failed — gửi lại tin lỗi (Phase 2)
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { computeNextRunAt, parseTimeOfDay, type ScheduleType } from './broadcast-service.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { getEffectiveLimit } from '../zalo/sdk-limit-service.js';

interface JobBody {
  name?: string;
  // 'customer_list' (mặc định) = gửi tệp SĐT (có thể là người lạ);
  // 'friends' = gửi bạn bè đã kết bạn của nick (an toàn hơn).
  sourceType?: 'customer_list' | 'friends';
  customerListId?: string;
  zaloAccountId?: string;
  messageText?: string;
  imageUrl?: string | null;
  // Khối nội dung (spin content) — khi có, cron xoay vòng nội dung từ đây thay vì
  // messageText/imageUrl phía trên. Rỗng = dùng messageText/imageUrl gõ tay như cũ.
  contentBlockIds?: string[];
  scheduleType?: ScheduleType;
  scheduledAt?: string | null;
  timeOfDay?: string | null;
  daysOfWeek?: number[];
  maxPerRun?: number;
  delaySecMin?: number;
  delaySecMax?: number;
  status?: 'active' | 'paused';
}

// Chỉ owner/admin được tạo/sửa/xoá/chạy broadcast — tránh nhân viên spam khách bằng nick chung.
function requireBroadcastAdmin(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply): boolean {
  const user = request.user!;
  if (user.role !== 'admin' && user.role !== 'owner') {
    reply.status(403).send({ error: 'forbidden', code: 'broadcast_admin_only' });
    return false;
  }
  return true;
}

function validateSchedule(b: JobBody): string | null {
  if (b.scheduleType === 'once') {
    if (!b.scheduledAt || isNaN(Date.parse(b.scheduledAt))) return 'scheduledAt_invalid';
  } else if (b.scheduleType === 'daily' || b.scheduleType === 'weekly') {
    if (!parseTimeOfDay(b.timeOfDay)) return 'timeOfDay_invalid';
    if (b.scheduleType === 'weekly') {
      const dows = b.daysOfWeek ?? [];
      if (!dows.length || dows.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'daysOfWeek_invalid';
    }
  } else {
    return 'scheduleType_invalid';
  }
  return null;
}

export async function broadcastRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /broadcast-jobs ────────────────────────────────────────────────
  app.get('/api/v1/broadcast-jobs', async (request) => {
    const user = request.user!;
    const jobs = await prisma.broadcastJob.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' }, take: 1,
          select: { id: true, status: true, startedAt: true, endedAt: true, sentCount: true, failedCount: true, skippedCount: true, queuedCount: true },
        },
      },
    });
    // Đính kèm tên tệp + tên nick + tên khối nội dung cho UI (không có FK relation → join tay)
    const allBlockIds = [...new Set(jobs.flatMap((j) => j.contentBlockIds))];
    const [lists, nicks, blocks] = await Promise.all([
      prisma.customerList.findMany({
        where: { id: { in: [...new Set(jobs.map((j) => j.customerListId).filter((x): x is string => !!x))] } },
        select: { id: true, name: true, hasZaloEntries: true },
      }),
      prisma.zaloAccount.findMany({
        where: { id: { in: [...new Set(jobs.map((j) => j.zaloAccountId))] } },
        select: { id: true, displayName: true, phone: true, status: true },
      }),
      allBlockIds.length
        ? prisma.contentBlock.findMany({ where: { id: { in: allBlockIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const listMap = new Map(lists.map((l) => [l.id, l]));
    const nickMap = new Map(nicks.map((n) => [n.id, n]));
    const blockMap = new Map(blocks.map((b) => [b.id, b]));
    return {
      jobs: jobs.map((j) => ({
        ...j,
        list: j.customerListId ? listMap.get(j.customerListId) ?? null : null,
        nick: nickMap.get(j.zaloAccountId) ?? null,
        contentBlocks: j.contentBlockIds.map((id) => blockMap.get(id) ?? { id, name: 'Khối đã xoá' }),
        latestRun: j.runs[0] ?? null,
        runs: undefined,
      })),
    };
  });

  // ── GET /broadcast-jobs/friend-count/:accountId — số bạn bè đã kết bạn của nick ──
  app.get<{ Params: { accountId: string } }>('/api/v1/broadcast-jobs/friend-count/:accountId', async (request, reply) => {
    const user = request.user!;
    const nick = await prisma.zaloAccount.findFirst({ where: { id: request.params.accountId, orgId: user.orgId }, select: { id: true } });
    if (!nick) return reply.status(400).send({ error: 'zaloAccount_not_found' });
    const count = await prisma.friend.count({ where: { zaloAccountId: nick.id, friendshipStatus: 'accepted' } });
    return { count };
  });

  // ── POST /broadcast-jobs ───────────────────────────────────────────────
  app.post<{ Body: JobBody }>('/api/v1/broadcast-jobs', async (request, reply) => {
    if (!requireBroadcastAdmin(request, reply)) return;
    const user = request.user!;
    const b = request.body ?? {};

    if (!b.name?.trim()) return reply.status(400).send({ error: 'name_required' });
    const sourceType = b.sourceType === 'friends' ? 'friends' : 'customer_list';
    const blockIds = (b.contentBlockIds ?? []).filter(Boolean);
    if (blockIds.length === 0 && !b.messageText?.trim()) return reply.status(400).send({ error: 'messageText_required' });
    const schedErr = validateSchedule(b);
    if (schedErr) return reply.status(400).send({ error: schedErr });

    const [nick, blockCount] = await Promise.all([
      prisma.zaloAccount.findFirst({ where: { id: b.zaloAccountId ?? '', orgId: user.orgId }, select: { id: true } }),
      blockIds.length ? prisma.contentBlock.count({ where: { id: { in: blockIds }, orgId: user.orgId } }) : Promise.resolve(0),
    ]);
    if (!nick) return reply.status(400).send({ error: 'zaloAccount_not_found' });
    if (blockIds.length && blockCount !== blockIds.length) return reply.status(400).send({ error: 'contentBlock_not_found' });

    // Nguồn tệp KH cần customerListId hợp lệ; nguồn friends không cần (lấy bạn bè của nick).
    let customerListId: string | null = null;
    if (sourceType === 'customer_list') {
      const list = await prisma.customerList.findFirst({ where: { id: b.customerListId ?? '', orgId: user.orgId }, select: { id: true } });
      if (!list) return reply.status(400).send({ error: 'customerList_not_found' });
      customerListId = list.id;
    } else {
      const friendCount = await prisma.friend.count({ where: { zaloAccountId: nick.id, friendshipStatus: 'accepted' } });
      if (friendCount === 0) return reply.status(400).send({ error: 'no_friends', hint: 'Nick này chưa có bạn bè đã kết bạn' });
    }

    const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
    const nextRunAt = computeNextRunAt({
      scheduleType: b.scheduleType!, scheduledAt,
      timeOfDay: b.timeOfDay, daysOfWeek: b.daysOfWeek ?? [],
    });
    if (!nextRunAt) return reply.status(400).send({ error: 'schedule_in_past' });

    const job = await prisma.broadcastJob.create({
      data: {
        orgId: user.orgId,
        createdById: user.id,
        name: b.name.trim(),
        sourceType,
        customerListId,
        zaloAccountId: nick.id,
        messageText: blockIds.length ? '' : b.messageText!,
        imageUrl: blockIds.length ? null : b.imageUrl?.trim() || null,
        contentBlockIds: blockIds,
        scheduleType: b.scheduleType!,
        scheduledAt,
        timeOfDay: b.timeOfDay ?? null,
        daysOfWeek: b.daysOfWeek ?? [],
        maxPerRun: Math.min(500, Math.max(1, b.maxPerRun ?? 50)),
        delaySecMin: Math.max(5, b.delaySecMin ?? 30),
        delaySecMax: Math.max(5, b.delaySecMax ?? 90),
        nextRunAt,
        // Draft/dry-run an toàn: FE (VITE_MARKETING_DRY_RUN) tạo job dạng 'paused' →
        // cron chỉ quét job 'active' nên KHÔNG bao giờ gửi thật. Mặc định 'active'
        // (schema default) khi FE không truyền status. Chỉ nhận 'paused' để tạo nháp.
        ...(b.status === 'paused' ? { status: 'paused' } : {}),
      },
    });
    logger.info(`[broadcast] job created id=${job.id} by=${user.id} status=${job.status} next=${nextRunAt.toISOString()}`);
    return reply.status(201).send({ job });
  });

  // ── GET /broadcast-jobs/:id ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/v1/broadcast-jobs/:id', async (request, reply) => {
    const user = request.user!;
    const job = await prisma.broadcastJob.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 10 } },
    });
    if (!job) return reply.status(404).send({ error: 'not_found' });
    // Join tay tên tệp + nick (không FK relation) cho trang chi tiết — vẫn org-scoped.
    const [list, nick] = await Promise.all([
      job.customerListId
        ? prisma.customerList.findFirst({ where: { id: job.customerListId, orgId: user.orgId }, select: { id: true, name: true, hasZaloEntries: true } })
        : Promise.resolve(null),
      prisma.zaloAccount.findFirst({ where: { id: job.zaloAccountId, orgId: user.orgId }, select: { id: true, displayName: true, phone: true, status: true } }),
    ]);
    return { job: { ...job, list, nick } };
  });

  // ── PATCH /broadcast-jobs/:id — sửa / pause / resume ───────────────────
  app.patch<{ Params: { id: string }; Body: JobBody }>('/api/v1/broadcast-jobs/:id', async (request, reply) => {
    if (!requireBroadcastAdmin(request, reply)) return;
    const user = request.user!;
    const existing = await prisma.broadcastJob.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
    });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    const b = request.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.messageText !== undefined) data.messageText = b.messageText;
    if (b.imageUrl !== undefined) data.imageUrl = b.imageUrl?.trim() || null;
    if (b.contentBlockIds !== undefined) {
      // Validate ownership y như POST — chặn PATCH gán id khối nội dung của org khác
      // (rò rỉ chéo org: cron sẽ đọc & gửi nội dung ngoài org nếu không chặn ở đây).
      const blockIds = b.contentBlockIds.filter(Boolean);
      if (blockIds.length) {
        const n = await prisma.contentBlock.count({ where: { id: { in: blockIds }, orgId: user.orgId } });
        if (n !== blockIds.length) return reply.status(400).send({ error: 'contentBlock_not_found' });
      }
      data.contentBlockIds = blockIds;
    }
    if (b.maxPerRun !== undefined) data.maxPerRun = Math.min(500, Math.max(1, b.maxPerRun));
    if (b.delaySecMin !== undefined) data.delaySecMin = Math.max(5, b.delaySecMin);
    if (b.delaySecMax !== undefined) data.delaySecMax = Math.max(5, b.delaySecMax);
    if (b.status === 'paused' || b.status === 'active') data.status = b.status;

    // Đổi lịch → validate + tính lại nextRunAt
    if (b.scheduleType !== undefined) {
      const schedErr = validateSchedule(b);
      if (schedErr) return reply.status(400).send({ error: schedErr });
      const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
      const nextRunAt = computeNextRunAt({
        scheduleType: b.scheduleType, scheduledAt,
        timeOfDay: b.timeOfDay, daysOfWeek: b.daysOfWeek ?? [],
      });
      if (!nextRunAt) return reply.status(400).send({ error: 'schedule_in_past' });
      Object.assign(data, {
        scheduleType: b.scheduleType, scheduledAt,
        timeOfDay: b.timeOfDay ?? null, daysOfWeek: b.daysOfWeek ?? [], nextRunAt,
      });
      if (existing.status === 'done') data.status = 'active'; // đặt lịch mới cho job đã xong
    } else if (b.status === 'active' && existing.status === 'done') {
      return reply.status(400).send({ error: 'job_done_need_new_schedule' });
    }

    const job = await prisma.broadcastJob.update({ where: { id: existing.id }, data });
    return { job };
  });

  // ── POST /broadcast-jobs/:id/run-now ───────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/v1/broadcast-jobs/:id/run-now', async (request, reply) => {
    if (!requireBroadcastAdmin(request, reply)) return;
    const user = request.user!;
    const existing = await prisma.broadcastJob.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true, status: true },
    });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    const job = await prisma.broadcastJob.update({
      where: { id: existing.id },
      data: { status: 'active', nextRunAt: new Date() },
    });
    return { job };
  });

  // ── DELETE /broadcast-jobs/:id ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/v1/broadcast-jobs/:id', async (request, reply) => {
    if (!requireBroadcastAdmin(request, reply)) return;
    const user = request.user!;
    const existing = await prisma.broadcastJob.findFirst({
      where: { id: request.params.id, orgId: user.orgId }, select: { id: true },
    });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.broadcastJob.delete({ where: { id: existing.id } });
    return { ok: true };
  });

  // ── GET /broadcast-jobs/:id/runs/:runId/items ──────────────────────────
  app.get<{ Params: { id: string; runId: string }; Querystring: { status?: string } }>(
    '/api/v1/broadcast-jobs/:id/runs/:runId/items',
    async (request, reply) => {
      const user = request.user!;
      const run = await prisma.broadcastRun.findFirst({
        where: { id: request.params.runId, jobId: request.params.id, orgId: user.orgId },
        select: { id: true },
      });
      if (!run) return reply.status(404).send({ error: 'not_found' });
      const { status } = request.query;
      const items = await prisma.broadcastRunItem.findMany({
        where: { runId: run.id, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'asc' },
        take: 1000,
      });
      return { items };
    },
  );

  // ── POST /broadcast-jobs/audience-count — dry-run đếm người nhận (Phase 2) ──
  // Đếm TRƯỚC khi tạo/gửi: tổng, sẽ gửi, breakdown skip + quota tin còn lại của nick.
  // Không tạo record nào — thuần read-only.
  app.post<{ Body: { sourceType?: 'customer_list' | 'friends'; customerListId?: string; zaloAccountId?: string; maxPerRun?: number } }>(
    '/api/v1/broadcast-jobs/audience-count',
    async (request, reply) => {
      const user = request.user!;
      const b = request.body ?? {};
      const sourceType = b.sourceType === 'friends' ? 'friends' : 'customer_list';
      const maxPerRun = Math.min(500, Math.max(1, b.maxPerRun ?? 50));

      const nick = await prisma.zaloAccount.findFirst({
        where: { id: b.zaloAccountId ?? '', orgId: user.orgId },
        select: { id: true, status: true },
      });
      if (!nick) return reply.status(400).send({ error: 'zaloAccount_not_found' });

      // Quota tin/ngày của nick (đã dùng / trần hiệu lực) — dự báo đủ hay thiếu.
      const [usedToday, limits] = await Promise.all([
        zaloRateLimiter.getDailyCount(nick.id, 'message'),
        getEffectiveLimit(nick.id, 'message'),
      ]);
      const quotaRemaining = Math.max(0, limits.daily - usedToday);

      if (sourceType === 'friends') {
        const total = await prisma.friend.count({ where: { zaloAccountId: nick.id, friendshipStatus: 'accepted' } });
        const willSend = Math.min(total, maxPerRun);
        return {
          sourceType, total, willSend,
          breakdown: { friendsAccepted: total },
          quota: { usedToday, dailyLimit: limits.daily, remaining: quotaRemaining, enough: quotaRemaining >= willSend },
          nickOnline: nick.status === 'connected',
        };
      }

      const list = await prisma.customerList.findFirst({
        where: { id: b.customerListId ?? '', orgId: user.orgId },
        select: { id: true },
      });
      if (!list) return reply.status(400).send({ error: 'customerList_not_found' });

      const [total, hasZalo, noZalo, uidReady] = await Promise.all([
        prisma.customerListEntry.count({ where: { customerListId: list.id } }),
        prisma.customerListEntry.count({ where: { customerListId: list.id, hasZalo: true } }),
        prisma.customerListEntry.count({ where: { customerListId: list.id, hasZalo: false } }),
        prisma.customerListEntry.count({ where: { customerListId: list.id, hasZalo: true, resolvedByNickId: nick.id } }),
      ]);
      const unknown = total - hasZalo - noZalo; // chưa quét Zalo (hasZalo=null)
      const willSend = Math.min(hasZalo, maxPerRun);
      return {
        sourceType, total, willSend,
        breakdown: {
          hasZalo,
          skipNoZalo: noZalo,
          skipUnknown: unknown, // chưa quét — nên "Quét lại Zalo" tệp trước khi gửi
          uidReady, // UID sẵn theo nick này — gửi thẳng
          needLookup: Math.max(0, hasZalo - uidReady), // cần findUser (tốn quota friend_lookup)
        },
        quota: { usedToday, dailyLimit: limits.daily, remaining: quotaRemaining, enough: quotaRemaining >= willSend },
        nickOnline: nick.status === 'connected',
      };
    },
  );

  // ── POST /broadcast-jobs/:id/runs/:runId/retry-failed — gửi lại tin lỗi (Phase 2) ──
  // Tạo run MỚI với snapshot = các item 'failed' của run cũ (trạng thái 'queued').
  // Worker tick sau sẽ gửi lại — vẫn qua đủ khung giờ + giãn cách + rate limit.
  app.post<{ Params: { id: string; runId: string } }>(
    '/api/v1/broadcast-jobs/:id/runs/:runId/retry-failed',
    async (request, reply) => {
      if (!requireBroadcastAdmin(request, reply)) return;
      const user = request.user!;
      const job = await prisma.broadcastJob.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
        select: { id: true, status: true },
      });
      if (!job) return reply.status(404).send({ error: 'not_found' });

      const run = await prisma.broadcastRun.findFirst({
        where: { id: request.params.runId, jobId: job.id, orgId: user.orgId },
        select: { id: true, status: true },
      });
      if (!run) return reply.status(404).send({ error: 'not_found' });
      if (run.status === 'running') return reply.status(400).send({ error: 'run_still_running' });

      const hasRunning = await prisma.broadcastRun.findFirst({
        where: { jobId: job.id, status: 'running' }, select: { id: true },
      });
      if (hasRunning) return reply.status(400).send({ error: 'job_has_running_run' });

      const failedItems = await prisma.broadcastRunItem.findMany({
        where: { runId: run.id, status: 'failed' },
        select: { entryId: true, phone: true, name: true, zaloUid: true },
      });
      if (failedItems.length === 0) return reply.status(400).send({ error: 'no_failed_items' });

      const retryRun = await prisma.broadcastRun.create({
        data: {
          jobId: job.id, orgId: user.orgId,
          audienceSnapshotAt: new Date(), queuedCount: failedItems.length,
          items: {
            create: failedItems.map((it) => ({
              orgId: user.orgId, entryId: it.entryId,
              phone: it.phone ?? '', name: it.name, zaloUid: it.zaloUid, status: 'queued',
            })),
          },
        },
        select: { id: true, queuedCount: true },
      });
      logger.info(`[broadcast] retry-failed run=${run.id} → new run=${retryRun.id} (${failedItems.length} người)`);
      return reply.status(201).send({ run: retryRun });
    },
  );
}
