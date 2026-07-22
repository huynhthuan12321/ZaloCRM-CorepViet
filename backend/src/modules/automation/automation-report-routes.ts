// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * automation-report-routes.ts — Báo cáo Automation theo Sale / theo nick Zalo.
 *
 * GET /api/v1/reports/automation?from=&to=
 *   - kpis:   tổng phễu kết bạn + bám đuổi + nick online trong range
 *   - bySale: gom theo sale (chủ nick) — kbGui/dongY/tuChoi/noZalo/bdGui/phanHoi + tỉ lệ
 *   - byNick: gom theo nick Zalo — như trên + số lần reconnect
 *
 * Nguồn dữ liệu (KHÔNG schema mới):
 *   - FriendshipAttempt (queuedAt)          → phễu kết bạn (state: sent/accepted/rejected/no_zalo/error)
 *   - CareSessionEvent   (createdAt)         → bám đuổi (step_sent) + phản hồi (reply), org-scope qua session
 *   - ZaloAccountStatusLog (startedAt)       → reconnect (reason='reconnect_ok')
 *   - ZaloAccount (ownerUserId, status)      → nick → sale + nick online
 *
 * Org-scoped tuyệt đối: MỌI query có orgId (CareSessionEvent qua relation session.orgId).
 * Chỉ owner/admin xem (khớp các report khác trong Module Báo cáo).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

function defaultDateRange() {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
  return { from, to };
}

function dateBounds(from: string, to: string) {
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date(to + 'T00:00:00.000Z');
  end.setUTCDate(end.getUTCDate() + 1); // inclusive end-of-day
  return { start, end };
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

// Bộ đếm per nhóm (nick hoặc sale). kbGui = số lời mời đã gửi được (sent+accepted+rejected).
type Bucket = {
  kbGui: number; dongY: number; tuChoi: number; noZalo: number;
  bdGui: number; phanHoi: number; reconnect: number;
};
function emptyBucket(): Bucket {
  return { kbGui: 0, dongY: 0, tuChoi: 0, noZalo: 0, bdGui: 0, phanHoi: 0, reconnect: 0 };
}

export async function automationReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/reports/automation-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (user.role !== 'admin' && user.role !== 'owner') {
      return reply.status(403).send({ error: 'forbidden', code: 'automation_report_admin_only' });
    }
    try {
      const orgId = user.orgId;
      const query = request.query as Record<string, string>;
      const { from: dF, to: dT } = defaultDateRange();
      const from = query.from || dF;
      const to = query.to || dT;
      const { start, end } = dateBounds(from, to);

      // ─── Nick của org: nguồn nick→sale + đếm online ────────────────────────
      const nicks = await prisma.zaloAccount.findMany({
        where: { orgId },
        select: { id: true, displayName: true, phone: true, ownerUserId: true, status: true },
      });
      const nickMap = new Map(nicks.map((n) => [n.id, n]));
      const tongNick = nicks.length;
      const nickOnline = nicks.filter((n) => n.status === 'connected').length;

      // ─── Phễu kết bạn: group theo (nick, state) trong range ────────────────
      const attemptGroups = await prisma.friendshipAttempt.groupBy({
        by: ['zaloAccountId', 'state'],
        where: { orgId, queuedAt: { gte: start, lt: end } },
        _count: { _all: true },
      });

      // ─── Bám đuổi: group event theo (session, eventType) — org-scope qua relation ──
      const eventGroups = await prisma.careSessionEvent.groupBy({
        by: ['sessionId', 'eventType'],
        where: {
          session: { orgId },
          eventType: { in: ['step_sent', 'reply'] },
          createdAt: { gte: start, lt: end },
        },
        _count: { _all: true },
      });
      // Map session → nick để quy về nhóm nick (event không có nickId trực tiếp).
      const sessionIds = [...new Set(eventGroups.map((g) => g.sessionId))];
      const sessions = sessionIds.length
        ? await prisma.careSession.findMany({
            where: { id: { in: sessionIds }, orgId },
            select: { id: true, nickId: true },
          })
        : [];
      const sessionNick = new Map(sessions.map((s) => [s.id, s.nickId]));

      // ─── Reconnect: group theo nick trong range ────────────────────────────
      const reconnectGroups = await prisma.zaloAccountStatusLog.groupBy({
        by: ['accountId'],
        where: { orgId, reason: 'reconnect_ok', startedAt: { gte: start, lt: end } },
        _count: { _all: true },
      });

      // ─── Gom về từng nick ──────────────────────────────────────────────────
      const nickAgg = new Map<string, Bucket>();
      const bucketFor = (id: string): Bucket => {
        let b = nickAgg.get(id);
        if (!b) { b = emptyBucket(); nickAgg.set(id, b); }
        return b;
      };

      for (const g of attemptGroups) {
        const b = bucketFor(g.zaloAccountId);
        const c = g._count._all;
        if (g.state === 'accepted') { b.dongY += c; b.kbGui += c; }
        else if (g.state === 'rejected') { b.tuChoi += c; b.kbGui += c; }
        else if (g.state === 'sent') { b.kbGui += c; }
        else if (g.state === 'no_zalo') { b.noZalo += c; }
        // 'queued'|'looking_up'|'error' → chưa gửi được, không tính vào kbGui/noZalo.
      }

      for (const g of eventGroups) {
        const nickId = sessionNick.get(g.sessionId);
        if (!nickId) continue;
        const b = bucketFor(nickId);
        if (g.eventType === 'step_sent') b.bdGui += g._count._all;
        else if (g.eventType === 'reply') b.phanHoi += g._count._all;
      }

      for (const g of reconnectGroups) {
        bucketFor(g.accountId).reconnect += g._count._all;
      }

      // ─── byNick ────────────────────────────────────────────────────────────
      const byNick = [...nickAgg.entries()].map(([zaloAccountId, b]) => {
        const nick = nickMap.get(zaloAccountId);
        const owner = nick ? nickMap.get(zaloAccountId)?.ownerUserId ?? null : null;
        return {
          zaloAccountId,
          nickName: nick?.displayName ?? nick?.phone ?? 'Nick đã xoá',
          ownerUserId: owner,
          kbGui: b.kbGui, dongY: b.dongY, tuChoi: b.tuChoi, noZalo: b.noZalo,
          bdGui: b.bdGui, phanHoi: b.phanHoi, reconnect: b.reconnect,
          tiLeDongYPct: pct(b.dongY, b.kbGui),
          tiLePhanHoiPct: pct(b.phanHoi, b.bdGui),
        };
      }).sort((a, b) => (b.kbGui + b.bdGui) - (a.kbGui + a.bdGui));

      // ─── bySale: gom nick theo chủ nick (ownerUserId) ──────────────────────
      const saleAgg = new Map<string, Bucket>();
      for (const [zaloAccountId, b] of nickAgg.entries()) {
        const ownerId = nickMap.get(zaloAccountId)?.ownerUserId;
        if (!ownerId) continue;
        let s = saleAgg.get(ownerId);
        if (!s) { s = emptyBucket(); saleAgg.set(ownerId, s); }
        s.kbGui += b.kbGui; s.dongY += b.dongY; s.tuChoi += b.tuChoi; s.noZalo += b.noZalo;
        s.bdGui += b.bdGui; s.phanHoi += b.phanHoi; s.reconnect += b.reconnect;
      }
      const users = saleAgg.size
        ? await prisma.user.findMany({
            where: { id: { in: [...saleAgg.keys()] }, orgId },
            select: { id: true, fullName: true },
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u.fullName]));
      const bySale = [...saleAgg.entries()].map(([userId, b]) => ({
        userId,
        saleName: userMap.get(userId) ?? 'Sale đã xoá',
        kbGui: b.kbGui, dongY: b.dongY, tuChoi: b.tuChoi, noZalo: b.noZalo,
        bdGui: b.bdGui, phanHoi: b.phanHoi,
        tiLeDongYPct: pct(b.dongY, b.kbGui),
        tiLePhanHoiPct: pct(b.phanHoi, b.bdGui),
      })).sort((a, b) => (b.kbGui + b.bdGui) - (a.kbGui + a.bdGui));

      // ─── KPI tổng ──────────────────────────────────────────────────────────
      const sum = (pick: (b: Bucket) => number) => [...nickAgg.values()].reduce((a, b) => a + pick(b), 0);
      const kbGui = sum((b) => b.kbGui);
      const dongY = sum((b) => b.dongY);
      const bdGui = sum((b) => b.bdGui);
      const phanHoi = sum((b) => b.phanHoi);

      return {
        from, to,
        kpis: {
          kbGui, dongY,
          tuChoi: sum((b) => b.tuChoi),
          noZalo: sum((b) => b.noZalo),
          bdGui, phanHoi,
          tiLeDongYPct: pct(dongY, kbGui),
          tiLePhanHoiPct: pct(phanHoi, bdGui),
          tongNick, nickOnline,
        },
        bySale, byNick,
      };
    } catch (err) {
      logger.error('[reports] Automation error:', err);
      return reply.status(500).send({ error: 'Failed to fetch automation report' });
    }
  });
}
