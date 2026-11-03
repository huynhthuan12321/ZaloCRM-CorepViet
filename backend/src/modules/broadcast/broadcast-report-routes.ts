// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * broadcast-report-routes.ts — Thống kê Broadcast tự động cho trang Báo cáo.
 *
 * GET /api/v1/reports/broadcast?from=&to=
 *   - kpis: tổng job/run, tỉ lệ gửi thành công
 *   - byNick: tỉ lệ gửi thành công theo nick Zalo gửi
 *   - byList: tỉ lệ gửi thành công theo tệp khách hàng
 *   - recentRuns: 20 lần chạy gần nhất
 * Chỉ owner/admin xem (khớp quyền tạo/sửa broadcast).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { isInvalidReportPeriodError, resolveReportPeriod } from '../dashboard/report-period.js';
import { resolveReportScope } from '../dashboard/report-scope.js';

function invalidPeriod(reply: FastifyReply, err: unknown) {
  if (!isInvalidReportPeriodError(err)) return null;
  return reply.status(400).send({
    error: 'Invalid report date range',
    code: 'invalid_report_date_range',
    message: err.message,
  });
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function rateAvailability(denominator: number) {
  return denominator > 0
    ? { status: 'available' as const }
    : { status: 'unavailable' as const, reason: 'no_broadcast_delivery_attempts_in_period' };
}

export async function broadcastReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/reports/broadcast', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    try {
      if (!await resolveReportScope(user, true)) {
        return reply.status(403).send({ error: 'forbidden', code: 'broadcast_admin_only' });
      }
      const query = request.query as Record<string, string>;
      const { from, to, start, end } = resolveReportPeriod(query);

      const jobs = await prisma.broadcastJob.findMany({
        where: { orgId: user.orgId },
        select: { id: true, name: true, status: true, customerListId: true, zaloAccountId: true },
      });
      const jobMap = new Map(jobs.map((j) => [j.id, j]));

      const runs = jobs.length
        ? await prisma.broadcastRun.findMany({
            where: { orgId: user.orgId, jobId: { in: jobs.map((j) => j.id) }, startedAt: { gte: start, lt: end } },
            orderBy: { startedAt: 'desc' },
            select: { id: true, jobId: true, status: true, startedAt: true, endedAt: true, sentCount: true, failedCount: true, skippedCount: true },
          })
        : [];

      const [lists, nicks] = await Promise.all([
        prisma.customerList.findMany({
          where: { id: { in: [...new Set(jobs.map((j) => j.customerListId).filter((x): x is string => !!x))] } },
          select: { id: true, name: true },
        }),
        prisma.zaloAccount.findMany({
          where: { id: { in: [...new Set(jobs.map((j) => j.zaloAccountId))] } },
          select: { id: true, displayName: true, phone: true },
        }),
      ]);
      const listMap = new Map(lists.map((l) => [l.id, l]));
      const nickMap = new Map(nicks.map((n) => [n.id, n]));

      const totalSent = runs.reduce((a, r) => a + r.sentCount, 0);
      const totalFailed = runs.reduce((a, r) => a + r.failedCount, 0);
      const totalSkipped = runs.reduce((a, r) => a + r.skippedCount, 0);

      // ─── Nhóm theo nick gửi ────────────────────────────────────────────
      const nickAgg = new Map<string, { sent: number; failed: number; skipped: number }>();
      for (const r of runs) {
        const job = jobMap.get(r.jobId);
        if (!job) continue;
        const acc = nickAgg.get(job.zaloAccountId) ?? { sent: 0, failed: 0, skipped: 0 };
        acc.sent += r.sentCount; acc.failed += r.failedCount; acc.skipped += r.skippedCount;
        nickAgg.set(job.zaloAccountId, acc);
      }
      const byNick = [...nickAgg.entries()].map(([zaloAccountId, agg]) => {
        const nick = nickMap.get(zaloAccountId);
        return {
          zaloAccountId, nickName: nick?.displayName ?? nick?.phone ?? 'Nick đã xoá',
          sent: agg.sent, failed: agg.failed, skipped: agg.skipped,
          successRatePct: pct(agg.sent, agg.sent + agg.failed),
          availability: { successRatePct: rateAvailability(agg.sent + agg.failed) },
        };
      }).sort((a, b) => b.sent - a.sent);

      // ─── Nhóm theo tệp khách hàng ──────────────────────────────────────
      const listAgg = new Map<string, { sent: number; failed: number; skipped: number }>();
      for (const r of runs) {
        const job = jobMap.get(r.jobId);
        if (!job || !job.customerListId) continue; // job nguồn Bạn bè không có tệp → bỏ khỏi nhóm theo tệp
        const acc = listAgg.get(job.customerListId) ?? { sent: 0, failed: 0, skipped: 0 };
        acc.sent += r.sentCount; acc.failed += r.failedCount; acc.skipped += r.skippedCount;
        listAgg.set(job.customerListId, acc);
      }
      const byList = [...listAgg.entries()].map(([customerListId, agg]) => {
        const list = listMap.get(customerListId);
        return {
          customerListId, listName: list?.name ?? 'Tệp đã xoá',
          sent: agg.sent, failed: agg.failed, skipped: agg.skipped,
          successRatePct: pct(agg.sent, agg.sent + agg.failed),
          availability: { successRatePct: rateAvailability(agg.sent + agg.failed) },
        };
      }).sort((a, b) => b.sent - a.sent);

      // ─── 20 lần chạy gần nhất ──────────────────────────────────────────
      const recentRuns = runs.slice(0, 20).map((r) => {
        const job = jobMap.get(r.jobId);
        return {
          runId: r.id, jobId: r.jobId, jobName: job?.name ?? '—',
          listName: job ? (job.customerListId ? (listMap.get(job.customerListId)?.name ?? '—') : 'Bạn bè') : '—',
          nickName: job ? (nickMap.get(job.zaloAccountId)?.displayName ?? nickMap.get(job.zaloAccountId)?.phone ?? '—') : '—',
          status: r.status, startedAt: r.startedAt, endedAt: r.endedAt,
          sent: r.sentCount, failed: r.failedCount, skipped: r.skippedCount,
        };
      });

      return {
        from, to,
        timeWindows: {
          period: { from, to, timeZone: 'Asia/Ho_Chi_Minh' },
          runs: 'startedAt events',
          jobsSnapshotAsOf: new Date().toISOString(),
        },
        kpis: {
          totalJobs: jobs.length,
          activeJobs: jobs.filter((j) => j.status === 'active').length,
          totalRuns: runs.length,
          totalSent, totalFailed, totalSkipped,
          successRatePct: pct(totalSent, totalSent + totalFailed),
        },
        availability: {
          successRatePct: rateAvailability(totalSent + totalFailed),
        },
        byNick, byList, recentRuns,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Broadcast error:', err);
      return reply.status(500).send({ error: 'Failed to fetch broadcast report' });
    }
  });
}
