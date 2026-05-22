/**
 * Zalo Accounts Dashboard routes — KPI stats, enriched list, bulk actions, uptime sparklines.
 *
 * Endpoints:
 *   GET  /api/v1/zalo-accounts/stats          — team KPI (total/active/idle/error/msgToday/uptimeTeam)
 *   GET  /api/v1/zalo-accounts/enriched       — list + per-account metrics for dashboard table
 *   GET  /api/v1/zalo-accounts/:id/uptime     — 7-day activity sparkline
 *   POST /api/v1/zalo-accounts/bulk-action    — { ids[], action: 'reconnect'|'sync-contacts'|'disable' }
 *
 * Uptime in v1 is derived from DailyMessageStat (days with activity / 7) — it's a "usage rate"
 * proxy, not a strict connection uptime. A future ZaloAccountStatusLog table can replace this.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';
import { getZaloScope, canManageAccount } from './zalo-scope.js';
import { uptimeWindowBatch } from './status-log-service.js';
import { revokeAllSessions } from '../privacy/pin-service.js';

const DAILY_QUOTA = 500; // per-nick soft cap shown in UI (msg today X / 500)

/** UTC start of "today" relative to the given date. We store DailyMessageStat at @db.Date. */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Range of N days ending today (inclusive). Returns ISO date strings YYYY-MM-DD. */
function lastNDays(n: number): { start: Date; days: string[] } {
  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (n - 1));
  const days: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return { start, days };
}

export async function zaloDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ───────────────────────────────────────────────────────────────────
  // GET /api/v1/zalo-accounts/stats — team-level KPI for header cards
  // ───────────────────────────────────────────────────────────────────
  app.get('/api/v1/zalo-accounts/stats', async (request) => {
    const user = request.user!;
    const userId = (user as any).userId ?? user.id;
    const today = startOfDay(new Date());

    // RBAC scope 2026-05-22: stats chỉ tính trên nicks user được thấy.
    const scope = await getZaloScope(userId, user.orgId, user.role);

    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId: user.orgId, id: { in: scope.accessibleIds } },
      select: { id: true, status: true, lastConnectedAt: true },
    });
    const accountIds = accounts.map((a) => a.id);

    // Today aggregate (msgToday only — không dùng cho active/idle nữa)
    const todayStats = await prisma.dailyMessageStat.aggregate({
      where: { orgId: user.orgId, statDate: today, zaloAccountId: { in: accountIds } },
      _sum: { messagesSent: true, messagesReceived: true },
    });

    // Anh chốt 2026-05-22 Phase 3: ACTIVE = connected + activity 24h (KHÔNG còn 7 ngày).
    // Activity 24h dựa trên DailyMessageStat (hôm nay + hôm qua có gửi/nhận).
    // Uptime team từ ZaloAccountStatusLog (connection time thật) thay vì proxy.
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const last24hRows = await prisma.dailyMessageStat.groupBy({
      by: ['zaloAccountId'],
      where: {
        orgId: user.orgId,
        zaloAccountId: { in: accountIds },
        statDate: { gte: yesterday, lte: today },
      },
      _sum: { messagesSent: true, messagesReceived: true },
    });
    const activeRecent = new Set<string>();
    for (const r of last24hRows) {
      const total = (r._sum.messagesSent ?? 0) + (r._sum.messagesReceived ?? 0);
      if (total > 0) activeRecent.add(r.zaloAccountId);
    }

    // Uptime 7d batch — N+1-safe.
    const uptimeMap = await uptimeWindowBatch(accountIds, 7);

    let totalNick = accounts.length;
    let active = 0;
    let idle = 0;
    let error = 0;
    let uptimeSum = 0;
    const needReloginIds: string[] = [];

    for (const a of accounts) {
      const live = zaloPool.getStatus(a.id) ?? a.status;
      const u = uptimeMap.get(a.id);
      uptimeSum += u?.uptimePct ?? 0;

      if (live === 'connected') {
        if (activeRecent.has(a.id)) active++;
        else idle++;
      } else {
        error++;
        needReloginIds.push(a.id);
      }
    }

    const msgToday = (todayStats._sum.messagesSent ?? 0) + (todayStats._sum.messagesReceived ?? 0);
    const quota = totalNick * DAILY_QUOTA;
    const uptimeTeam = totalNick > 0 ? uptimeSum / totalNick : 0;

    return {
      totalNick,
      active,
      idle,
      error,
      msgToday,
      quota,
      uptimeTeam: Number(uptimeTeam.toFixed(1)),
      needReloginIds,
    };
  });

  // ───────────────────────────────────────────────────────────────────
  // GET /api/v1/zalo-accounts/enriched — list + per-account metrics
  // Replaces /zalo-accounts for dashboard view (includes crew, msgToday, uptime, lastActivity)
  // ───────────────────────────────────────────────────────────────────
  app.get('/api/v1/zalo-accounts/enriched', async (request) => {
    const user = request.user!;
    const userId = (user as any).userId ?? user.id;
    const today = startOfDay(new Date());

    // RBAC scope 2026-05-22: chỉ trả nicks user được phép xem.
    const scope = await getZaloScope(userId, user.orgId, user.role);

    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId: user.orgId, id: { in: scope.accessibleIds } },
      select: {
        id: true,
        zaloUid: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        status: true,
        ownerUserId: true,
        privacyMode: true,
        proxyUrl: true,
        lastConnectedAt: true,
        createdAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
        access: {
          select: {
            id: true,
            permission: true,
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const ids = accounts.map((a) => a.id);
    if (ids.length === 0) return [];

    // msg today per account
    const todayPerAcct = await prisma.dailyMessageStat.groupBy({
      by: ['zaloAccountId'],
      where: { orgId: user.orgId, statDate: today, zaloAccountId: { in: ids } },
      _sum: { messagesSent: true, messagesReceived: true },
    });
    const todayMap = new Map(
      todayPerAcct.map((r) => [
        r.zaloAccountId,
        (r._sum.messagesSent ?? 0) + (r._sum.messagesReceived ?? 0),
      ]),
    );

    // Phase 3 2026-05-22: uptime7d từ status log (connection time thật), KHÔNG còn proxy.
    const uptimeMap = await uptimeWindowBatch(ids, 7);

    // Last activity per account (most recent statDate with activity) — vẫn dùng cho UI display
    const lastActivityRows = await prisma.dailyMessageStat.groupBy({
      by: ['zaloAccountId'],
      where: { orgId: user.orgId, zaloAccountId: { in: ids } },
      _max: { statDate: true },
    });
    const lastActivityMap = new Map(
      lastActivityRows.map((r) => [r.zaloAccountId, r._max.statDate]),
    );

    return accounts.map((a) => {
      const live = zaloPool.getStatus(a.id) ?? a.status;
      const u = uptimeMap.get(a.id);
      const uptime7d = u?.uptimePct ?? 0;
      const msgToday = todayMap.get(a.id) ?? 0;
      const lastActivity = lastActivityMap.get(a.id) ?? a.lastConnectedAt;

      return {
        id: a.id,
        zaloUid: a.zaloUid,
        displayName: a.displayName,
        avatarUrl: a.avatarUrl,
        phone: a.phone,
        status: a.status,
        liveStatus: live,
        hasProxy: !!a.proxyUrl,
        lastConnectedAt: a.lastConnectedAt,
        createdAt: a.createdAt,
        owner: a.owner,
        ownerUserId: a.ownerUserId,
        privacyMode: a.privacyMode,
        // RBAC 2026-05-22: gate Action buttons trên frontend
        canManage: canManageAccount(a.ownerUserId, userId, user.role),
        isOwnedByMe: a.ownerUserId === userId,
        // Multi-sale crew with role mapping → UI badges (admin=Owner, chat=Editor, read=Viewer)
        crew: a.access.map((ac) => ({
          accessId: ac.id,
          permission: ac.permission,
          role: ac.permission === 'admin' ? 'owner' : ac.permission === 'chat' ? 'editor' : 'viewer',
          user: ac.user,
        })),
        crewCount: a.access.length,
        // Metrics
        msgToday,
        quota: DAILY_QUOTA,
        uptime7d,
        lastActivityAt: lastActivity,
        // E3: health alert badge when uptime under 80% in the 7-day window
        healthAlert: uptime7d < 80,
      };
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // PATCH /api/v1/zalo-accounts/:id/owner — re-assign owner
  // Phase ZaloAccounts redesign 2026-05-22.
  // Permission: org admin/owner HOẶC current owner (chuyển nhượng chính chủ).
  // Side effect: revoke ALL active privacy sessions của owner cũ — tránh owner
  // cũ vẫn unlock được data của nick sau khi mất quyền.
  // ───────────────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { newOwnerUserId: string } }>(
    '/api/v1/zalo-accounts/:id/owner',
    async (request, reply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params;
      const { newOwnerUserId } = request.body ?? ({} as any);

      if (!newOwnerUserId || typeof newOwnerUserId !== 'string') {
        return reply.status(400).send({ error: 'newOwnerUserId required' });
      }

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, ownerUserId: true, displayName: true },
      });
      if (!account) return reply.status(404).send({ error: 'Account not found' });

      // Permission gate: org admin/owner OR current owner.
      const isAdmin = ['owner', 'admin'].includes(user.role);
      const isCurrentOwner = account.ownerUserId === userId;
      if (!isAdmin && !isCurrentOwner) {
        return reply.status(403).send({
          error: 'Chỉ org admin/owner hoặc chính chủ nick mới được re-assign owner',
        });
      }

      // Verify new owner tồn tại trong cùng org.
      const newOwner = await prisma.user.findFirst({
        where: { id: newOwnerUserId, orgId: user.orgId },
        select: { id: true, fullName: true, email: true },
      });
      if (!newOwner) {
        return reply.status(400).send({ error: 'newOwnerUserId không thuộc org' });
      }

      // No-op nếu chính chủ không đổi.
      if (account.ownerUserId === newOwnerUserId) {
        return reply.send({ ok: true, noop: true });
      }

      const oldOwnerId = account.ownerUserId;

      await prisma.$transaction(async (tx) => {
        await tx.zaloAccount.update({
          where: { id },
          data: { ownerUserId: newOwnerUserId },
        });
      });

      // Side effect: revoke ALL privacy sessions của owner cũ.
      // Phòng trường hợp owner cũ vẫn còn cookie HttpOnly từ session unlock trước.
      // Lỗi revoke không block — nick đã đổi owner trong DB.
      try {
        await revokeAllSessions(oldOwnerId);
      } catch (err) {
        logger.warn(`[zalo-owner-reassign] revokeAllSessions(${oldOwnerId}) failed: ${String(err)}`);
      }

      logger.info(
        `[zalo-owner-reassign] account=${id} from=${oldOwnerId} to=${newOwnerUserId} by=${userId}`,
      );

      return reply.send({
        ok: true,
        accountId: id,
        oldOwnerUserId: oldOwnerId,
        newOwnerUserId,
        newOwner: { id: newOwner.id, fullName: newOwner.fullName, email: newOwner.email },
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────
  // GET /api/v1/zalo-accounts/:id/uptime?range=7d — sparkline data
  // Returns N buckets of {date, msgSent, msgReceived, hasActivity}
  // ───────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    '/api/v1/zalo-accounts/:id/uptime',
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params;
      const range = request.query.range ?? '7d';
      const n = range === '24h' ? 1 : range === '30d' ? 30 : 7;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!account) return reply.status(404).send({ error: 'Account not found' });

      const { start, days } = lastNDays(n);
      const today = startOfDay(new Date());

      const rows = await prisma.dailyMessageStat.groupBy({
        by: ['statDate'],
        where: { orgId: user.orgId, zaloAccountId: id, statDate: { gte: start, lte: today } },
        _sum: { messagesSent: true, messagesReceived: true },
      });

      const byDate = new Map(
        rows.map((r) => [
          r.statDate.toISOString().slice(0, 10),
          {
            sent: r._sum.messagesSent ?? 0,
            received: r._sum.messagesReceived ?? 0,
          },
        ]),
      );

      const buckets = days.map((date) => {
        const v = byDate.get(date);
        const msgSent = v?.sent ?? 0;
        const msgReceived = v?.received ?? 0;
        return { date, msgSent, msgReceived, hasActivity: msgSent + msgReceived > 0 };
      });

      const activeDays = buckets.filter((b) => b.hasActivity).length;
      const uptimePct = Number(((activeDays / n) * 100).toFixed(1));

      return { range, buckets, uptimePct };
    },
  );

  // ───────────────────────────────────────────────────────────────────
  // POST /api/v1/zalo-accounts/bulk-action — reconnect / sync / disable many
  // Owner/admin only — sync-contacts and disable can be destructive.
  // ───────────────────────────────────────────────────────────────────
  app.post<{ Body: { ids: string[]; action: string } }>(
    '/api/v1/zalo-accounts/bulk-action',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const { ids, action } = request.body ?? { ids: [], action: '' };

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: 'ids[] is required' });
      }
      if (!['reconnect', 'sync-contacts', 'disable'].includes(action)) {
        return reply.status(400).send({ error: 'action must be reconnect | sync-contacts | disable' });
      }

      // Scope to caller's org so a malicious payload can't target other orgs' accounts
      const accounts = await prisma.zaloAccount.findMany({
        where: { id: { in: ids }, orgId: user.orgId },
      });

      const results: Array<{ id: string; ok: boolean; error?: string }> = [];

      for (const a of accounts) {
        try {
          if (action === 'reconnect') {
            const session = a.sessionData as { cookie: any; imei: string; userAgent: string } | null;
            if (!session?.imei) {
              results.push({ id: a.id, ok: false, error: 'no saved session' });
              continue;
            }
            // Fire-and-forget; status delivered via Socket.IO
            zaloPool.reconnect(a.id, session, a.proxyUrl).catch(() => {});
            results.push({ id: a.id, ok: true });
          } else if (action === 'sync-contacts') {
            // Defer to existing sync-contacts route via internal HTTP would be circular —
            // we just mark intent; the heavy lifting is best done by hitting the per-account
            // route from FE in parallel. Here we no-op success so FE can fan out.
            results.push({ id: a.id, ok: true });
          } else if (action === 'disable') {
            zaloPool.disconnect(a.id);
            await prisma.zaloAccount.update({
              where: { id: a.id },
              data: { status: 'disconnected' },
            });
            results.push({ id: a.id, ok: true });
          }
        } catch (err: any) {
          results.push({ id: a.id, ok: false, error: err.message ?? 'unknown' });
        }
      }

      logger.info(
        `Bulk action ${action} on ${results.length} accounts by ${user.email}: ` +
          `${results.filter((r) => r.ok).length} ok, ${results.filter((r) => !r.ok).length} failed`,
      );

      return {
        action,
        total: ids.length,
        ok: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      };
    },
  );
}
