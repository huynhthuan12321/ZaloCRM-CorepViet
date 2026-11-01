// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * report-analytics-routes.ts — Analytics report endpoints for the Reports module.
 * 9 GET endpoints: overview, nick-fleet, sales-performance, pipeline, lead-pool,
 * automation, engagement, audit, crm-usage. All JWT-auth + gated by gateReportAccess, scoped
 * to request.user!.orgId, accept ?from=&to= (Vietnam report-period defaults).
 * Follows _API_CONTRACT.md response shapes. Numbers always JS numbers (bigint→Number).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

import { gateReportAccess, reportScope, reportModelWhere, messageAccountSql } from './report-scope.js';
import { isInvalidReportPeriodError, listReportDates, resolveReportPeriod } from './report-period.js';
import { getResponseTimeAnalysis } from '../analytics/reports/response-time.js';

type QueryParams = Record<string, string>;

// Main KPI scope is separate from shared customer/account access.

const N = (v: unknown): number => Number(v ?? 0);
const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason });

async function humanSentByUser(scope: ReturnType<typeof reportScope>, start: Date, end: Date) {
  return prisma.$queryRaw<Array<{ userId: string | null; sent: bigint }>>`
    SELECT m.replied_by_user_id AS "userId", COUNT(*) AS sent
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE ${messageAccountSql(scope)}
      AND c.zalo_account_id IS NOT NULL AND c.is_virtual = false AND c.thread_type = 'user'
      AND m.sender_type = 'self' AND m.sent_via IN ('user', 'user_native')
      AND m.is_local = false AND m.is_deleted = false
      AND COALESCE(m.metadata->>'dryRun', 'false') <> 'true'
      AND COALESCE(m.metadata->>'test', 'false') <> 'true'
      AND m.sent_at >= ${start} AND m.sent_at < ${end}
    GROUP BY m.replied_by_user_id`;
}

function invalidPeriod(reply: FastifyReply, err: unknown) {
  if (!isInvalidReportPeriodError(err)) return null;
  return reply.status(400).send({
    error: 'Invalid report date range',
    code: 'invalid_report_date_range',
    message: err.message,
  });
}

export async function reportAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ─────────────────────────────────────────────────────────────────────────
  // 1. GET /api/v1/reports/overview
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const period = resolveReportPeriod(query);
      const { from, to, start, end, dateStart, dateEnd } = period;

      const now = new Date();
      const today = resolveReportPeriod({}, { defaultDays: 1, now });

      const [
        totalContacts,
        newContacts,
        nicks,
        apptToday,
        apptDone,
        leadPoolWaiting,
        statuses,
      ] = await Promise.all([
        prisma.contact.count({ where: { AND: [{ orgId, mergedInto: null }, reportModelWhere(scope, 'contact')] } }),
        prisma.contact.count({ where: { AND: [{ orgId, mergedInto: null, createdAt: { gte: start, lt: end } }, reportModelWhere(scope, 'contact')] } }),
        prisma.zaloAccount.findMany({
          where: { AND: [{ orgId, archivedAt: null }, reportModelWhere(scope, 'zaloAccount')] },
          select: { status: true },
        }),
        prisma.appointment.count({ where: { AND: [{ orgId, appointmentDate: { gte: today.dateStart, lt: today.dateEnd } }, reportModelWhere(scope, 'appointment')] } }),
        prisma.appointment.count({ where: { AND: [{ orgId, status: 'completed', appointmentDate: { gte: dateStart, lt: dateEnd } }, reportModelWhere(scope, 'appointment')] } }),
        prisma.leadRequest.count({ where: { AND: [{ orgId, releaseReason: null }, reportModelWhere(scope, 'leadRequest')] } }),
        prisma.status.findMany({ where: { AND: [{ orgId }, reportModelWhere(scope, 'status')] }, orderBy: { order: 'asc' }, select: { id: true, name: true } }),
      ]);

      const nicksTotal = nicks.length;
      const nicksOnline = nicks.filter((n) => n.status === 'connected').length;
      const nicksNeedRelogin = nicks.filter((n) => n.status !== 'connected').length;

      const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
      const previousNewContacts = await prisma.contact.count({
        where: { AND: [{ orgId, mergedInto: null, createdAt: { gte: previousStart, lt: start } }, reportModelWhere(scope, 'contact')] },
      });

      // funnel by status.order
      const funnelCounts = await prisma.contact.groupBy({
        by: ['statusId'],
        where: { AND: [{ orgId, mergedInto: null, statusId: { not: null } }, reportModelWhere(scope, 'contact')] },
        _count: true,
      });
      const countByStatus = new Map(funnelCounts.map((f) => [f.statusId, f._count]));
      const funnel = statuses.map((s) => ({ status: s.name, count: N(countByStatus.get(s.id)) }));

      // Top sales by new contacts; won-status mapping is not defined by the data contract.
      const salesUsers = await prisma.user.findMany({
        where: { AND: [{ orgId, isActive: true }, reportModelWhere(scope, 'user')] },
        select: { id: true, fullName: true, departmentMember: { select: { department: { select: { name: true } } } } },
      });
      const [newContactGroups, sentGroups] = await Promise.all([
        prisma.contact.groupBy({
          by: ['assignedUserId'],
          where: { AND: [{ orgId, mergedInto: null, createdAt: { gte: start, lt: end } }, reportModelWhere(scope, 'contact')] },
          _count: true,
        }),
        humanSentByUser(scope, start, end),
      ]);
      const newByUser = new Map(newContactGroups.filter((g) => g.assignedUserId).map((g) => [g.assignedUserId!, N(g._count)]));
      const sentByUser = new Map(sentGroups.filter((g) => g.userId).map((g) => [g.userId!, N(g.sent)]));
      const topSalesRaw = salesUsers.map((u) => ({
        userId: u.id,
        name: u.fullName,
        deptName: u.departmentMember?.department?.name || 'Chưa phân phòng',
        newContacts: newByUser.get(u.id) ?? 0,
        sent: sentByUser.get(u.id) ?? 0,
        closed: null,
      }));
      const topSales = topSalesRaw
        .sort((a, b) => b.newContacts - a.newContacts || a.name.localeCompare(b.name, 'vi'))
        .slice(0, 5);

      // riskNicks — top 5
      const nickRows = await prisma.zaloAccount.findMany({
        where: { AND: [{ orgId, archivedAt: null }, reportModelWhere(scope, 'zaloAccount')] },
        select: { id: true, displayName: true, status: true, owner: { select: { fullName: true } } },
        take: 50,
      });
      const riskNicks = nickRows
        .map((n) => ({
          id: n.id,
          name: n.displayName,
          ownerName: n.owner?.fullName || '',
          status: n.status,
          quotaPct: null,
          uptime7d: null,
          risk: (n.status !== 'connected' ? 'disconnect' : 'ok') as 'disconnect' | 'quota' | 'stranger' | 'ok',
        }))
        .sort((a, b) => (a.risk === 'disconnect' ? -1 : 1) - (b.risk === 'disconnect' ? -1 : 1))
        .slice(0, 5);

      const messageRows = await prisma.$queryRaw<Array<{ date: string; sent: bigint; received: bigint; automation: bigint }>>`
        SELECT (m.sent_at + INTERVAL '7 hours')::date::text AS date,
          COUNT(*) FILTER (WHERE m.sender_type = 'self') AS sent,
          COUNT(*) FILTER (WHERE m.sender_type = 'contact') AS received,
          COUNT(*) FILTER (WHERE m.sender_type = 'self' AND m.sent_via = 'automation') AS automation
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE ${messageAccountSql(scope)} AND c.zalo_account_id IS NOT NULL
          AND c.is_virtual = false AND c.thread_type = 'user'
          AND m.is_local = false AND m.is_deleted = false
          AND COALESCE(m.metadata->>'dryRun', 'false') <> 'true'
          AND COALESCE(m.metadata->>'test', 'false') <> 'true'
          AND m.sent_at >= ${start < today.start ? start : today.start}
          AND m.sent_at < ${end > today.end ? end : today.end}
        GROUP BY (m.sent_at + INTERVAL '7 hours')::date
        ORDER BY date ASC`;
      const messagesByDate = new Map(messageRows.map((row) => [row.date, row]));
      const msgSeries = listReportDates(from, to).map((date) => {
        const row = messagesByDate.get(date);
        return { date, sent: Number(row?.sent ?? 0), received: Number(row?.received ?? 0) };
      });
      const todayMessages = messagesByDate.get(today.from);

      return {
        from,
        to,
        asOf: now.toISOString(),
        timeWindows: {
          period: { from, to, timeZone: 'Asia/Ho_Chi_Minh' },
          messageSeries: { from, to, timeZone: 'Asia/Ho_Chi_Minh' },
          snapshotsAsOf: now.toISOString(),
        },
        kpis: {
          totalContacts,
          newContacts,
          newContactsDelta: newContacts - previousNewContacts,
          nicksOnline,
          nicksTotal,
          nicksNeedRelogin,
          msgToday: todayMessages ? N(todayMessages.sent) + N(todayMessages.received) : 0,
          msgByBot: todayMessages ? N(todayMessages.automation) : 0,
          apptToday,
          apptDone,
          leadPoolWaiting,
          leadPoolAutoReturnSoon: null,
          closeRate: null,
          closeRateDelta: null,
          friendAcceptRate: null,
          friendInviteSent: null,
          friendInviteAccepted: null,
        },
        availability: {
          closeRate: unavailable('won_status_mapping_unavailable'),
          closeRateDelta: unavailable('won_status_mapping_unavailable'),
          wonStatus: unavailable('won_status_mapping_unavailable'),
          topSalesClosed: unavailable('won_status_mapping_unavailable'),
          leadPoolAutoReturnSoon: unavailable('lead_expiry_coverage_unavailable'),
          friendAcceptRate: unavailable('friend_acceptance_source_unavailable'),
          friendInviteSent: unavailable('friend_invite_source_unavailable'),
          friendInviteAccepted: unavailable('friend_acceptance_source_unavailable'),
          quotaPct: unavailable('sdk_quota_source_unavailable'),
          uptime7d: unavailable('uptime_coverage_unavailable'),
        },
        msgSeries,
        funnel,
        topSales,
        riskNicks,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Overview error:', err);
      return reply.status(500).send({ error: 'Failed to fetch overview report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. GET /api/v1/reports/nick-fleet
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/nick-fleet', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to } = resolveReportPeriod(query);

      const nickRows = await prisma.zaloAccount.findMany({
        where: { AND: [{ orgId, archivedAt: null }, reportModelWhere(scope, 'zaloAccount')] },
        select: { id: true, displayName: true, status: true, owner: { select: { fullName: true } } },
      });

      const total = nickRows.length;
      const online = nickRows.filter((n) => n.status === 'connected').length;
      const needRelogin = nickRows.filter((n) => n.status !== 'connected').length;

      const nicks = nickRows.map((n) => ({
        id: n.id,
        name: n.displayName,
        ownerName: n.owner?.fullName || '',
        status: n.status,
        uptime7d: null,
        msgUser: null,
        msgBot: null,
        friendSent: null,
        friendAcceptPct: null,
        sdkUsed: null,
        sdkCap: null,
        phoneFoundPct: null,
      }));

      // alerts derived from disconnected count
      const alerts: Array<{ level: 'danger' | 'warn'; text: string }> = [];
      if (needRelogin > 0) {
        alerts.push({ level: 'danger', text: `${needRelogin} nick mất kết nối — cần đăng nhập lại` });
      }

      const uptimeHeat = nickRows.map((n) => ({
        nickId: n.id,
        name: n.displayName,
        days: [null, null, null, null, null, null, null],
      }));

      return {
        from,
        to,
        asOf: new Date().toISOString(),
        kpis: {
          total,
          online,
          needRelogin,
          msgByBotToday: null,
          uptimeTeamAvg: null,
          friendAcceptAvg: null,
          sdkUsedAvgPct: null,
          phoneFoundPct: null,
        },
        availability: {
          msgByBotToday: unavailable('nick_message_attribution_unavailable'),
          uptime: unavailable('uptime_coverage_unavailable'),
          friendAcceptance: unavailable('friend_acceptance_source_unavailable'),
          sdkQuota: unavailable('sdk_quota_source_unavailable'),
          phoneLookup: unavailable('phone_lookup_source_unavailable'),
        },
        alerts,
        nicks,
        uptimeHeat,
        sdkByCategory: null,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Nick-fleet error:', err);
      return reply.status(500).send({ error: 'Failed to fetch nick-fleet report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GET /api/v1/reports/sales-performance
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/sales-performance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const period = resolveReportPeriod(query);
      const { from, to, start, end, dateStart, dateEnd } = period;

      const users = await prisma.user.findMany({
        where: { AND: [{ orgId, isActive: true }, reportModelWhere(scope, 'user')] },
        select: {
          id: true,
          fullName: true,
          departmentMember: { select: { department: { select: { name: true } } } },
        },
      });

      const [contactGroups, appointmentGroups, leadPoolGroups, sentGroups, responseTime] = await Promise.all([
        prisma.contact.groupBy({
          by: ['assignedUserId'],
          where: { AND: [{ orgId, mergedInto: null }, reportModelWhere(scope, 'contact')] },
          _count: true,
        }),
        prisma.appointment.groupBy({
          by: ['assignedUserId', 'status'],
          where: { AND: [{ orgId, appointmentDate: { gte: dateStart, lt: dateEnd } }, reportModelWhere(scope, 'appointment')] },
          _count: true,
        }),
        prisma.leadRequest.groupBy({
          by: ['requestedByUserId'],
          where: { AND: [{ orgId, requestedAt: { gte: start, lt: end } }, reportModelWhere(scope, 'leadRequest')] },
          _count: true,
        }),
        humanSentByUser(scope, start, end),
        getResponseTimeAnalysis(orgId, from, to, scope),
      ]);
      const contactsByUser = new Map(contactGroups.filter((g) => g.assignedUserId).map((g) => [g.assignedUserId!, N(g._count)]));
      const apptsByUser = new Map<string, { done: number; noShow: number }>();
      for (const group of appointmentGroups) {
        if (!group.assignedUserId) continue;
        const values = apptsByUser.get(group.assignedUserId) ?? { done: 0, noShow: 0 };
        if (group.status === 'completed') values.done = N(group._count);
        if (group.status === 'no_show') values.noShow = N(group._count);
        apptsByUser.set(group.assignedUserId, values);
      }
      const leadPoolByUser = new Map(leadPoolGroups.filter((g) => g.requestedByUserId).map((g) => [g.requestedByUserId!, N(g._count)]));
      const sentByUser = new Map(sentGroups.filter((g) => g.userId).map((g) => [g.userId!, N(g.sent)]));
      const permittedUserIds = new Set(users.map((u) => u.id));
      const unattributedSent = sentGroups
        .filter((g) => !g.userId || !permittedUserIds.has(g.userId))
        .reduce((sum, group) => sum + N(group.sent), 0);
      const responseByUser = new Map((responseTime.byUser ?? []).map((r) => [r.userId, r.avgSeconds]));

      const sales = users.map((u) => {
        const contacts = contactsByUser.get(u.id) ?? 0;
        const appts = apptsByUser.get(u.id) ?? { done: 0, noShow: 0 };
        return {
          userId: u.id,
          name: u.fullName,
          deptName: u.departmentMember?.department?.name || 'Chưa phân phòng',
          contacts,
          sent: sentByUser.get(u.id) ?? 0,
          avgResponseMin: responseByUser.has(u.id) ? Math.round((responseByUser.get(u.id)! / 60) * 10) / 10 : null,
          apptDone: appts.done,
          apptNoShow: appts.noShow,
          closed: null,
          leadPoolUsed: leadPoolByUser.get(u.id) ?? 0,
          score: null,
        };
      });
      sales.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

      const activeSales = sales.filter((s) => s.contacts > 0).length;
      const totalSales = sales.length;
      const attributedSentTotal = sales.reduce((sum, s) => sum + s.sent, 0);
      const avgResponseMin = responseTime.availability === 'unavailable' || responseTime.overall === null
        ? null
        : Math.round((responseTime.overall / 60) * 10) / 10;

      // byDept
      const deptMap = new Map<string, { contacts: number; sent: number }>();
      for (const s of sales) {
        const cur = deptMap.get(s.deptName) || { contacts: 0, sent: 0 };
        cur.contacts += s.contacts;
        cur.sent += s.sent;
        deptMap.set(s.deptName, cur);
      }
      const byDept = Array.from(deptMap.entries()).map(([deptName, v]) => ({
        deptName,
        contacts: v.contacts,
        sent: v.sent,
        closed: null,
        closeRate: null,
      }));
      const responseBuckets = responseTime.availability === 'unavailable' || !responseTime.responseBuckets
        ? null
        : [
            { label: '<5p', count: responseTime.responseBuckets.under5Min },
            { label: '5-15p', count: responseTime.responseBuckets.from5To15Min },
            { label: '15-30p', count: responseTime.responseBuckets.from15To30Min },
            { label: '30-60p', count: responseTime.responseBuckets.from30To60Min },
            { label: '>1h', count: responseTime.responseBuckets.over60Min },
          ];

      return {
        from,
        to,
        asOf: new Date().toISOString(),
        timeWindows: {
          contactsSnapshot: { basis: 'snapshot', asOf: new Date().toISOString() },
          sentMessages: { basis: 'period', from, to, timeZone: 'Asia/Ho_Chi_Minh' },
          appointments: { basis: 'period', from, to, timeZone: 'Asia/Ho_Chi_Minh' },
        },
        sentUnattributed: unattributedSent,
        kpis: {
          activeSales,
          totalSales,
          avgSentPerSale: totalSales ? Math.round((attributedSentTotal / totalSales) * 10) / 10 : null,
          avgResponseMin,
          avgCloseRate: null,
        },
        sales,
        byDept,
        responseBuckets,
        availability: {
          avgSentPerSale: totalSales ? { status: 'available' } : unavailable('no_sales_in_scope'),
          avgResponseMin: avgResponseMin === null
            ? unavailable(responseTime.reason ?? 'no_response_pairs_in_period')
            : { status: 'available' },
          responseBuckets: responseBuckets ? { status: 'available' } : unavailable(responseTime.reason ?? 'no_response_pairs_in_period'),
          closed: unavailable('won_status_mapping_unavailable'),
          score: unavailable('performance_score_formula_unvalidated'),
          avgCloseRate: unavailable('won_status_mapping_unavailable'),
        },
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Sales-performance error:', err);
      return reply.status(500).send({ error: 'Failed to fetch sales-performance report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. GET /api/v1/reports/pipeline
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to, start, end } = resolveReportPeriod(query);

      const statuses = await prisma.status.findMany({
        where: { AND: [{ orgId }, reportModelWhere(scope, 'status')] },
        orderBy: { order: 'asc' },
        select: { id: true, name: true },
      });

      const funnelCounts = await prisma.contact.groupBy({
        by: ['statusId'],
        where: { AND: [{ orgId, mergedInto: null, statusId: { not: null } }, reportModelWhere(scope, 'contact')] },
        _count: true,
      });
      const countByStatus = new Map(funnelCounts.map((f) => [f.statusId, f._count]));

      const funnel = statuses.map((s) => {
        const count = N(countByStatus.get(s.id));
        return { status: s.name, count, dropPct: null };
      });

      const timeInStage = statuses.map((s) => ({ status: s.name, avgDays: null }));

      const leadPoolWaiting = await prisma.leadRequest.count({
        where: { AND: [{ orgId, releaseReason: null }, reportModelWhere(scope, 'leadRequest')] },
      });

      // Won status is not mapped by the report contract, so only report cohort sizes.
      const bySourceGroups = await prisma.contact.groupBy({
        by: ['source'],
        where: { AND: [{ orgId, mergedInto: null, createdAt: { gte: start, lt: end } }, reportModelWhere(scope, 'contact')] },
        _count: true,
      });
      const bySource = bySourceGroups.map((g) => ({
        source: g.source || 'Không rõ',
        leads: g._count,
        contactedPct: null,
        closed: null,
        closeRate: null,
      }));

      return {
        from,
        to,
        asOf: new Date().toISOString(),
        kpis: {
          closeRate: null,
          avgTimeInStageDays: null,
          leadPoolWaiting,
          returnRate: null,
        },
        availability: {
          closeRate: unavailable('won_status_mapping_unavailable'),
          closedBySource: unavailable('won_status_mapping_unavailable'),
          dropPct: unavailable('status_change_history_unavailable'),
          avgTimeInStageDays: unavailable('status_history_unavailable'),
          contactedPct: unavailable('contact_event_history_unavailable'),
          returnRate: unavailable('lead_return_denominator_unavailable'),
        },
        funnel,
        timeInStage,
        bySource,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Pipeline error:', err);
      return reply.status(500).send({ error: 'Failed to fetch pipeline report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. GET /api/v1/reports/lead-pool
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/lead-pool', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to, start, end } = resolveReportPeriod(query);
      const now = new Date();

      const [waiting, distributedThisPeriod] = await Promise.all([
        prisma.leadRequest.count({ where: { AND: [{ orgId, releaseReason: null }, reportModelWhere(scope, 'leadRequest')] } }),
        prisma.leadPoolDistribution.count({ where: { AND: [{ orgId, distributedAt: { gte: start, lt: end } }, reportModelWhere(scope, 'leadPoolDistribution')] } }),
      ]);

      // byUser: distribution received + requests state
      const [distGroups, requestStateGroups, overdueGroups, users] = await Promise.all([
        prisma.leadPoolDistribution.groupBy({
          by: ['assignedToUserId'],
          where: { AND: [{ orgId }, reportModelWhere(scope, 'leadPoolDistribution')] },
          _count: true,
        }),
        prisma.leadRequest.groupBy({
          by: ['requestedByUserId', 'releaseReason'],
          where: { AND: [{ orgId }, reportModelWhere(scope, 'leadRequest')] },
          _count: true,
        }),
        prisma.leadRequest.groupBy({
          by: ['requestedByUserId'],
          where: { AND: [{ orgId, releaseReason: null, expiresAt: { lt: now } }, reportModelWhere(scope, 'leadRequest')] },
          _count: true,
        }),
        prisma.user.findMany({ where: { AND: [{ orgId }, reportModelWhere(scope, 'user')] }, select: { id: true, fullName: true } }),
      ]);
      const userName = new Map(users.map((u) => [u.id, u.fullName]));
      const receivedByUser = new Map(distGroups.map((g) => [g.assignedToUserId, g._count]));

      const requestsByUser = new Map<string, { holding: number; returned: number }>();
      for (const group of requestStateGroups) {
        if (!group.requestedByUserId) continue;
        const values = requestsByUser.get(group.requestedByUserId) ?? { holding: 0, returned: 0 };
        if (group.releaseReason === null) values.holding += N(group._count);
        if (group.releaseReason === 'auto_return' || group.releaseReason === 'manual_return') values.returned += N(group._count);
        requestsByUser.set(group.requestedByUserId, values);
      }
      const overdueByUser = new Map(overdueGroups.filter((g) => g.requestedByUserId).map((g) => [g.requestedByUserId!, N(g._count)]));

      // Build the user set from grouped distribution and request records.
      const userIds = new Set<string>();
      for (const g of distGroups) if (g.assignedToUserId) userIds.add(g.assignedToUserId);
      for (const g of requestStateGroups) if (g.requestedByUserId) userIds.add(g.requestedByUserId);
      const byUser = Array.from(userIds).map((uid) => ({
        userId: uid,
        name: userName.get(uid) || '',
        received: N(receivedByUser.get(uid)),
        holding: requestsByUser.get(uid)?.holding ?? 0,
        returned: requestsByUser.get(uid)?.returned ?? 0,
        overdue: overdueByUser.get(uid) ?? 0,
      }));

      // stuck: Contact with stuckSinceAggregate not null, top 10
      const stuckContacts = await prisma.contact.findMany({
        where: { AND: [{ orgId, mergedInto: null, stuckSinceAggregate: { not: null } }, reportModelWhere(scope, 'contact')] },
        orderBy: { stuckSinceAggregate: 'asc' },
        take: 10,
        select: {
          id: true,
          fullName: true,
          stuckSinceAggregate: true,
          statusRef: { select: { name: true } },
          assignedUser: { select: { fullName: true } },
        },
      });
      const stuck = stuckContacts.map((c) => ({
        contactId: c.id,
        contactName: c.fullName,
        stage: c.statusRef?.name || '',
        daysStuck: c.stuckSinceAggregate
          ? Math.floor((now.getTime() - new Date(c.stuckSinceAggregate).getTime()) / 86400000)
          : 0,
        saleName: c.assignedUser?.fullName || '',
      }));

      return {
        from,
        to,
        asOf: new Date().toISOString(),
        kpis: {
          waiting,
          avgHoldHours: null,
          returnRate: null,
          distributedThisPeriod,
        },
        availability: {
          avgHoldHours: unavailable('lead_release_history_unavailable'),
          returnRate: unavailable('lead_return_denominator_unavailable'),
        },
        byUser,
        stuck,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Lead-pool error:', err);
      return reply.status(500).send({ error: 'Failed to fetch lead-pool report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. GET /api/v1/reports/automation
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/automation', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply, true))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to } = resolveReportPeriod(query);
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 3600000);

      const sequences = await prisma.automationSequence.findMany({
        where: { AND: [{ orgId }, reportModelWhere(scope, 'automationSequence')] },
        select: {
          id: true,
          name: true,
          enrolledCountCached: true,
          completedCountCached: true,
          replyCountCached: true,
          failedCount: true,
          blockCountCached: true,
          enabled: true,
        },
      });

      const enrolled = sequences.reduce((a, s) => a + N(s.enrolledCountCached), 0);
      const replied = sequences.reduce((a, s) => a + N(s.replyCountCached), 0);
      const activeSequences = sequences.filter((s) => s.enabled).length;
      const replyRate = enrolled > 0 ? Math.round((replied / enrolled) * 1000) / 10 : null;

      // failedRate24h from AutomationEventLog
      const [totalEvents24h, failedEvents24h] = await Promise.all([
        prisma.automationEventLog.count({ where: { AND: [{ orgId, createdAt: { gte: last24h } }, reportModelWhere(scope, 'automationEventLog')] } }),
        prisma.automationEventLog.count({ where: { AND: [{ orgId, createdAt: { gte: last24h }, eventType: { contains: 'failed', mode: 'insensitive' } }, reportModelWhere(scope, 'automationEventLog')] } }),
      ]);
      const failedRate24h = totalEvents24h > 0 ? Math.round((failedEvents24h / totalEvents24h) * 1000) / 10 : null;

      const sequencesOut = sequences.map((s) => {
        const enr = N(s.enrolledCountCached);
        const rep = N(s.replyCountCached);
        return {
          id: s.id,
          name: s.name,
          enrolled: enr,
          sent: null,
          replied: rep,
          completed: N(s.completedCountCached),
          replyRatePct: enr > 0 ? Math.round((rep / enr) * 1000) / 10 : null,
        };
      });

      // skipReasons — AutomationEventLog where eventType contains 'skip'
      const skipGroups = await prisma.automationEventLog.groupBy({
        by: ['eventType'],
        where: { AND: [{ orgId, eventType: { contains: 'skip', mode: 'insensitive' } }, reportModelWhere(scope, 'automationEventLog')] },
        _count: true,
      });
      const skipReasons = skipGroups.map((g) => ({
        reason: g.eventType,
        count: g._count,
        category: null,
      }));

      // careOutcomes — CareSession groupBy closedReason where state closed
      const careGroups = await prisma.careSession.groupBy({
        by: ['closedReason'],
        where: { AND: [{ orgId, state: 'closed' }, reportModelWhere(scope, 'careSession')] },
        _count: true,
      });
      const careOutcomes = careGroups.map((g) => ({ reason: g.closedReason || 'Không rõ', count: g._count }));

      // broadcasts — recent 5
      const broadcastRows = await prisma.automationBroadcast.findMany({
        where: { AND: [{ orgId }, reportModelWhere(scope, 'automationBroadcast')] },
        orderBy: { id: 'desc' },
        take: 5,
        select: { id: true, name: true, totalRecipients: true, sentCount: true, deliveredCount: true, failedCount: true, state: true },
      });
      const broadcasts = broadcastRows.map((b) => {
        const tot = N(b.totalRecipients);
        const sent = N(b.sentCount);
        const delivered = N(b.deliveredCount);
        return {
          id: b.id,
          name: b.name,
          totalRecipients: tot,
          sentPct: tot > 0 ? Math.round((sent / tot) * 1000) / 10 : null,
          successPct: sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : null,
          state: b.state,
        };
      });

      return {
        from,
        to,
        timeWindows: {
          period: { from, to, timeZone: 'Asia/Ho_Chi_Minh' },
          sequenceCounters: 'current cached snapshot',
          rolling24h: { start: last24h.toISOString(), end: now.toISOString() },
        },
        asOf: now.toISOString(),
        kpis: {
          activeSequences,
          enrolled,
          replyRate,
          friendAcceptRate: null,
        },
        health: {
          workerLagSec: null,
          stuckTasks: null,
          failedRate24h,
        },
        availability: {
          replyRate: replyRate === null ? unavailable('sequence_denominator_zero') : { status: 'available' },
          friendAcceptRate: unavailable('friend_acceptance_source_unavailable'),
          sent: unavailable('sequence_sent_count_unavailable'),
          workerLagSec: unavailable('worker_queue_metrics_unavailable'),
          stuckTasks: unavailable('stuck_task_registry_unavailable'),
          failedRate24h: failedRate24h === null ? unavailable('no_automation_events_in_window') : { status: 'available' },
          skipReasonCategory: unavailable('skip_reason_classifier_unavailable'),
        },
        sequences: sequencesOut,
        skipReasons,
        careOutcomes,
        broadcasts,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Automation error:', err);
      return reply.status(500).send({ error: 'Failed to fetch automation report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. GET /api/v1/reports/engagement
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/engagement', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const period = resolveReportPeriod(query);
      const { from, to, start, end, dateStart, dateEnd } = period;

      const now = new Date();
      const days28Start = new Date(now.getTime() - 27 * 86400000);
      days28Start.setUTCHours(0, 0, 0, 0);
      const days28DateStart = new Date(`${days28Start.toISOString().slice(0, 10)}T00:00:00.000Z`);
      const days28DateEnd = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
      days28DateEnd.setUTCDate(days28DateEnd.getUTCDate() + 1);

      // pattern distribution
      const patternGroups = await prisma.contact.groupBy({
        by: ['engagementPattern'],
        where: { AND: [{ orgId, mergedInto: null, engagementPattern: { not: null } }, reportModelWhere(scope, 'contact')] },
        _count: true,
      });
      const patternDist = patternGroups.map((g) => ({ pattern: g.engagementPattern || 'unknown', count: g._count }));

      const patternCount = (names: string[]) =>
        patternGroups.filter((g) => names.includes((g.engagementPattern || '').toLowerCase())).reduce((a, g) => a + g._count, 0);
      const hotCount = patternCount(['hot', 'champion']);
      const coolingCount = patternCount(['cooling', 'cold']);

      // Zero rows mean no denominator; these event-driven rows cannot prove period coverage.
      const [ciTrue, ciTotal] = await Promise.all([
        prisma.contactEngagementDaily.count({ where: { AND: [{ orgId, date: { gte: dateStart, lt: dateEnd }, customerInitiated: true }, reportModelWhere(scope, 'contactEngagementDaily')] } }),
        prisma.contactEngagementDaily.count({ where: { AND: [{ orgId, date: { gte: dateStart, lt: dateEnd } }, reportModelWhere(scope, 'contactEngagementDaily')] } }),
      ]);
      const customerInitiatedPct = ciTotal > 0 ? Math.round((ciTrue / ciTotal) * 1000) / 10 : null;

      // heatmap: top 15 contacts by recent sum(dailyIntensity)
      const intensityGroups = await prisma.contactEngagementDaily.groupBy({
        by: ['contactId'],
        where: { AND: [{ orgId, date: { gte: days28DateStart, lt: days28DateEnd } }, reportModelWhere(scope, 'contactEngagementDaily')] },
        _sum: { dailyIntensity: true },
        orderBy: { _sum: { dailyIntensity: 'desc' } },
        take: 15,
      });
      const topContactIds = intensityGroups.map((g) => g.contactId);
      const heatContacts = await prisma.contact.findMany({
        where: { AND: [{ id: { in: topContactIds.length ? topContactIds : ['__none__'] } }, reportModelWhere(scope, 'contact')] },
        select: { id: true, fullName: true },
      });
      const heatNameMap = new Map(heatContacts.map((c) => [c.id, c.fullName]));
      const dailyRows = await prisma.contactEngagementDaily.findMany({
        where: { AND: [{ orgId, contactId: { in: topContactIds.length ? topContactIds : ['__none__'] }, date: { gte: days28DateStart, lt: days28DateEnd } }, reportModelWhere(scope, 'contactEngagementDaily')] },
        select: { contactId: true, date: true, dailyIntensity: true },
      });
      const bucket = (v: number) => {
        if (v <= 0) return 0;
        if (v <= 20) return 1;
        if (v <= 40) return 2;
        if (v <= 60) return 3;
        if (v <= 80) return 4;
        return 5;
      };
      // build day index list (28 days)
      const dayKeys: string[] = [];
      for (let i = 0; i < 28; i++) {
        dayKeys.push(new Date(days28Start.getTime() + i * 86400000).toISOString().split('T')[0]);
      }
      const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
      const cellsByContact = new Map<string, number[]>();
      for (const cid of topContactIds) cellsByContact.set(cid, new Array(28).fill(0));
      for (const r of dailyRows) {
        const key = new Date(r.date).toISOString().split('T')[0];
        const idx = dayIndex.get(key);
        if (idx === undefined) continue;
        const arr = cellsByContact.get(r.contactId);
        if (arr) arr[idx] = bucket(N(r.dailyIntensity));
      }
      const heatmap = topContactIds.map((cid) => ({
        contactId: cid,
        name: heatNameMap.get(cid) || '',
        cells: cellsByContact.get(cid) || new Array(28).fill(0),
      }));

      // interactionTypes — sum over range
      const interAgg = await prisma.contactEngagementDaily.aggregate({
        where: { AND: [{ orgId, date: { gte: dateStart, lt: dateEnd } }, reportModelWhere(scope, 'contactEngagementDaily')] },
        _sum: {
          inboundMsgCount: true,
          outboundMsgCount: true,
          reactionCount: true,
          voiceMsgCount: true,
          callCount: true,
        },
      });
      const interactionTypes = {
        inbound: N(interAgg._sum.inboundMsgCount),
        outbound: N(interAgg._sum.outboundMsgCount),
        reaction: N(interAgg._sum.reactionCount),
        voiceCall: N(interAgg._sum.voiceMsgCount) + N(interAgg._sum.callCount),
      };

      // The event-driven aggregate has no complete-coverage signal for this period.
      const avgInteractionsPerDay = null;

      // cooling: top 5 contacts pattern cooling/cold
      const coolingContacts = await prisma.contact.findMany({
        where: { AND: [{ orgId, mergedInto: null, engagementPattern: { in: ['cooling', 'cold'] } }, reportModelWhere(scope, 'contact')] },
        orderBy: { lastInboundAt: { sort: 'asc', nulls: 'last' } },
        take: 5,
        select: { id: true, fullName: true, leadScore: true, lastInboundAt: true, lastActivity: true, assignedUser: { select: { fullName: true } } },
      });
      const cooling = coolingContacts.map((c) => {
        const silentSince = c.lastInboundAt ?? c.lastActivity;
        return {
          contactId: c.id,
          name: c.fullName,
          saleName: c.assignedUser?.fullName || '',
          silentDays: silentSince
            ? Math.max(0, Math.floor((now.getTime() - new Date(silentSince).getTime()) / 86400000))
            : 0,
          score: N(c.leadScore),
        };
      });

      // hot: top 5 contacts pattern hot/champion
      const hotContacts = await prisma.contact.findMany({
        where: { AND: [{ orgId, mergedInto: null, engagementPattern: { in: ['hot', 'champion'] } }, reportModelWhere(scope, 'contact')] },
        orderBy: { leadScore: 'desc' },
        take: 5,
        select: { id: true, fullName: true, leadScore: true, engagementPattern: true, assignedUser: { select: { fullName: true } } },
      });
      const hot = hotContacts.map((c) => ({
        contactId: c.id,
        name: c.fullName,
        saleName: c.assignedUser?.fullName || '',
        signal: c.engagementPattern || '',
        score: N(c.leadScore),
      }));

      return {
        from,
        to,
        timeWindows: {
          period: { from, to, timeZone: 'Asia/Ho_Chi_Minh' },
          dailyAggregates: { from, to, timeZone: 'UTC', source: 'ContactEngagementDaily date buckets' },
          heatmap28d: {
            from: days28DateStart.toISOString().slice(0, 10),
            to: new Date(days28DateEnd.getTime() - 86400000).toISOString().slice(0, 10),
            timeZone: 'UTC',
          },
        },
        asOf: now.toISOString(),
        kpis: {
          hotCount,
          coolingCount,
          customerInitiatedPct,
          avgInteractionsPerDay,
        },
        availability: {
          customerInitiatedPct: ciTotal > 0 ? { status: 'available' } : unavailable('engagement_daily_denominator_zero'),
          avgInteractionsPerDay: unavailable('engagement_daily_coverage_unverified'),
        },
        heatmap,
        patternDist,
        cooling,
        hot,
        interactionTypes,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Engagement error:', err);
      return reply.status(500).send({ error: 'Failed to fetch engagement report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. GET /api/v1/reports/audit
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/v1/reports/audit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply, true))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to } = resolveReportPeriod(query);

      const now = new Date();
      const today = resolveReportPeriod({}, { defaultDays: 1, now });
      const todayStart = today.start;
      const last24h = new Date(now.getTime() - 24 * 3600000);

      const [changesToday, nickDisconnect24h, totalEvents24h, failedEvents24h] = await Promise.all([
        prisma.activityLog.count({ where: { AND: [{ orgId, createdAt: { gte: todayStart } }, reportModelWhere(scope, 'activityLog')] } }),
        prisma.zaloAccountStatusLog.count({ where: { AND: [{ orgId, status: 'disconnected', startedAt: { gte: last24h } }, reportModelWhere(scope, 'zaloAccountStatusLog')] } }),
        prisma.automationEventLog.count({ where: { AND: [{ orgId, createdAt: { gte: last24h } }, reportModelWhere(scope, 'automationEventLog')] } }),
        prisma.automationEventLog.count({ where: { AND: [{ orgId, createdAt: { gte: last24h }, eventType: { contains: 'failed', mode: 'insensitive' } }, reportModelWhere(scope, 'automationEventLog')] } }),
      ]);
      const errorRate24h = totalEvents24h > 0 ? Math.round((failedEvents24h / totalEvents24h) * 1000) / 10 : null;

      const cronJobs: Array<{ name: string; ok: boolean; lastRunMinAgo: number | null }> = [];

      // activity feed — latest 20
      const activityRows = await prisma.activityLog.findMany({
        where: { AND: [{ orgId }, reportModelWhere(scope, 'activityLog')] },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          actorType: true,
          botName: true,
          systemSource: true,
          category: true,
          action: true,
          entityType: true,
          entityId: true,
          user: { select: { fullName: true } },
        },
      });
      const activity = activityRows.map((a) => ({
        id: a.id,
        ts: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        actorName: a.user?.fullName || a.botName || a.systemSource || 'Hệ thống',
        actorType: a.actorType,
        isBot: a.actorType !== 'user',
        category: a.category,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
      }));

      // disconnects — ZaloAccountStatusLog disconnect events 24h
      const disconnectRows = await prisma.zaloAccountStatusLog.findMany({
        where: { AND: [{ orgId, status: 'disconnected', startedAt: { gte: last24h } }, reportModelWhere(scope, 'zaloAccountStatusLog')] },
        orderBy: { startedAt: 'desc' },
        take: 50,
        select: {
          startedAt: true,
          endedAt: true,
          reason: true,
          account: { select: { displayName: true } },
        },
      });
      const disconnects = disconnectRows.map((d) => ({
        ts: d.startedAt instanceof Date ? d.startedAt.toISOString() : String(d.startedAt),
        nickName: d.account?.displayName || '',
        reason: d.reason || '',
        downMinutes: d.endedAt
          ? Math.round((new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime()) / 60000)
          : 0,
      }));

      return {
        from,
        to,
        timeWindows: {
          period: { from, to, timeZone: 'Asia/Ho_Chi_Minh' },
          changesToday: { start: today.start.toISOString(), end: today.end.toISOString() },
          rolling24h: { start: last24h.toISOString(), end: now.toISOString() },
        },
        kpis: {
          changesToday,
          cronOk: null,
          cronTotal: null,
          queueWaiting: null,
          nickDisconnect24h,
        },
        systemHealth: {
          cronJobs,
          queues: null,
          errorRate24h,
          errorBreakdown: null,
        },
        availability: {
          cronHealth: unavailable('cron_registry_unavailable'),
          queueDepth: unavailable('queue_registry_unavailable'),
          errorRate24h: errorRate24h === null ? unavailable('no_automation_events_in_window') : { status: 'available' },
          errorBreakdown: unavailable('error_category_source_unavailable'),
        },
        activity,
        disconnects,
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Audit error:', err);
      return reply.status(500).send({ error: 'Failed to fetch audit report' });
    }
  });

  // 9. GET /api/v1/reports/crm-usage — mức độ dùng CRM của sale (anh chốt 2026-06-17):
  // thời gian dùng/ngày (ƯỚC TÍNH từ sessionize ActivityLog), module dùng nhiều, xếp hạng
  // dùng CRM HIỆU QUẢ = kết quả (chốt + lịch hẹn xong) ÷ giờ dùng. Login (security) neo phiên.
  app.get('/api/v1/reports/crm-usage', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const period = resolveReportPeriod(query);
      const { from, to, start, end, dateStart, dateEnd, previousStart } = period;
      const now = new Date();
      const today = resolveReportPeriod({}, { defaultDays: 1, now });
      const todayStart = today.start;

      // category → tên module hiển thị. security/system/admin = phụ trợ (vẫn tính giờ, không là "module chính").
      const MODULE_MAP: Record<string, string> = {
        customer_info: 'Khách hàng', tags_crm: 'Gắn thẻ', status_care: 'Trạng thái & Chăm sóc',
        appointment: 'Lịch hẹn', interaction: 'Tương tác', score: 'Chấm điểm', tags_zalo: 'Nhãn Zalo',
        automation: 'Automation', security: 'Đăng nhập', system: 'Hệ thống', admin: 'Quản trị',
      };
      const AUX = new Set(['security', 'system', 'admin']);

      // Sale list + phòng ban.
      const users = await prisma.user.findMany({
        where: { AND: [{ orgId, isActive: true }, reportModelWhere(scope, 'user')] },
        select: { id: true, fullName: true, departmentMember: { select: { department: { select: { name: true } } } } },
      });
      const userMap = new Map(users.map((u) => [u.id, {
        name: u.fullName || '—', deptName: u.departmentMember?.department?.name || 'Chưa phân phòng',
      }]));
      const saleIds = users.map((u) => u.id);

      // Sự kiện hoạt động (timeline + module count). Bao gồm cả security (login) để neo phiên.
      const ACTIVITY_LIMIT = 100000;
      const eventRows = saleIds.length === 0 ? [] : await prisma.activityLog.findMany({
        where: { AND: [{ orgId, actorType: 'user', userId: { in: saleIds }, createdAt: { gte: start, lt: end } }, reportModelWhere(scope, 'activityLog')] },
        select: { userId: true, category: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: ACTIVITY_LIMIT + 1,
      });
      const activityEventsTruncated = eventRows.length > ACTIVITY_LIMIT;
      const events = eventRows.slice(0, ACTIVITY_LIMIT);

      const apptDoneGroups = await prisma.appointment.groupBy({
        by: ['assignedUserId'],
        where: { AND: [{ orgId, status: 'completed', appointmentDate: { gte: dateStart, lt: dateEnd } }, reportModelWhere(scope, 'appointment')] },
        _count: true,
      });
      const apptDoneBySale = new Map(apptDoneGroups.filter((g) => g.assignedUserId).map((g) => [g.assignedUserId!, N(g._count)]));

      // Thêm dữ liệu cho phễu (C: tin gửi → KH phản hồi → lịch hẹn → chốt) + so sánh kỳ (D).
      const [previousEventRows, sentRows, apptGroups, repliedGroups] = await Promise.all([
        saleIds.length === 0
          ? Promise.resolve([] as Array<{ userId: string | null; createdAt: Date }>)
          : prisma.activityLog.findMany({
            where: { AND: [{ orgId, actorType: 'user', userId: { in: saleIds }, createdAt: { gte: previousStart, lt: start } }, reportModelWhere(scope, 'activityLog')] },
            select: { userId: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: ACTIVITY_LIMIT + 1,
          }),
        humanSentByUser(scope, start, end),
        prisma.appointment.groupBy({ by: ['assignedUserId'], where: { AND: [{ orgId, appointmentDate: { gte: dateStart, lt: dateEnd } }, reportModelWhere(scope, 'appointment')] }, _count: true }),
        prisma.contact.groupBy({ by: ['assignedUserId'], where: { AND: [{ orgId, mergedInto: null, lastInboundAt: { gte: start, lt: end } }, reportModelWhere(scope, 'contact')] }, _count: true }),
      ]);
      const previousActivityTruncated = previousEventRows.length > ACTIVITY_LIMIT;
      const prevEvents = previousEventRows.slice(0, ACTIVITY_LIMIT);
      const sentBySale = new Map(sentRows.filter((r) => r.userId).map((r) => [r.userId!, Number(r.sent)]));
      const apptBySale = new Map(apptGroups.map((g) => [g.assignedUserId, g._count]));
      const repliedBySale = new Map(repliedGroups.map((g) => [g.assignedUserId, g._count]));

      // Gom theo sale theo NGÀY (giờ VN); sessionize TỪNG NGÀY (phiên không vắt nửa đêm) →
      // vừa ra giờ dùng/ngày (line chart) vừa tổng. Đồng thời dựng hourHeat (thứ × giờ).
      const TZ = 7 * 3600_000, GAP = 30 * 60_000, FLOOR = 5 * 60_000;
      const dayKey = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10);
      function dayActiveMs(ts: number[]): number {
        if (!ts.length) return 0;
        let ms = 0, sStart = ts[0], prev = ts[0];
        for (let i = 1; i < ts.length; i++) {
          if (ts[i] - prev > GAP) { ms += Math.max(FLOOR, prev - sStart); sStart = ts[i]; }
          prev = ts[i];
        }
        return ms + Math.max(FLOOR, prev - sStart);
      }

      const perUser = new Map<string, { byDay: Map<string, number[]>; cats: Map<string, number> }>();
      const moduleTotals = new Map<string, number>();
      const heat = new Map<string, number>();
      let heatMax = 0;
      for (const e of events) {
        if (!e.userId) continue;
        let u = perUser.get(e.userId);
        if (!u) { u = { byDay: new Map(), cats: new Map() }; perUser.set(e.userId, u); }
        const ms = e.createdAt.getTime();
        const dk = dayKey(ms);
        const arr = u.byDay.get(dk); if (arr) arr.push(ms); else u.byDay.set(dk, [ms]);
        const cat = e.category || 'system';
        u.cats.set(cat, (u.cats.get(cat) || 0) + 1);
        if (!AUX.has(cat)) moduleTotals.set(cat, (moduleTotals.get(cat) || 0) + 1);
        const local = new Date(ms + TZ);
        const hk = `${(local.getUTCDay() + 6) % 7}-${local.getUTCHours()}`; // d: 0=T2..6=CN
        const hv = (heat.get(hk) || 0) + 1; heat.set(hk, hv); if (hv > heatMax) heatMax = hv;
      }

      // Trục ngày liên tục cho line chart.
      const dayList: string[] = [];
      for (let t = start.getTime(); t < end.getTime(); t += 86400_000) dayList.push(dayKey(t));

      let totalActions = 0;
      const bySaleRaw = saleIds.map((uid) => {
        const u = perUser.get(uid);
        const info = userMap.get(uid)!;
        let actions = 0, activeMs = 0;
        const dayMs = new Map<string, number>();
        for (const [dk, ts] of (u?.byDay ?? new Map<string, number[]>())) {
          actions += ts.length;
          const m = dayActiveMs(ts.sort((a, b) => a - b));
          dayMs.set(dk, m); activeMs += m;
        }
        totalActions += actions;
        const activeDays = dayMs.size;
        const activeHours = Math.round((activeMs / 3600_000) * 10) / 10;
        const avgActiveMinPerDay = activeDays > 0 ? Math.round(activeMs / 60_000 / activeDays) : null;
        let topModule = '—', topN = 0;
        for (const [cat, n] of (u?.cats ?? new Map<string, number>())) {
          if (AUX.has(cat)) continue;
          if (n > topN) { topN = n; topModule = MODULE_MAP[cat] || cat; }
        }
        const apptDone = apptDoneBySale.get(uid) ?? 0;
        return {
          userId: uid, name: info.name, deptName: info.deptName,
          activeDays, avgActiveMinPerDay: activeDays > 0 ? avgActiveMinPerDay : null, activeHours, actions, topModule,
          results: null, closed: null, apptDone, closesPerHour: null, effRaw: null, dayMs,
        };
      }).filter((s) => s.actions > 0);

      // effScore + bySale (bỏ field nội bộ).
      const bySale = bySaleRaw
        .map(({ effRaw, dayMs, ...s }) => ({ ...s, effScore: null }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

      // (#1) Line chart: giờ dùng/ngày, mỗi sale 1 đường. Top 8 sale (nhiều giờ nhất) cho dễ đọc.
      const PALETTE = ['#1786be', '#7a4fb0', '#b0734f', '#4fb09a', '#b04f6e', '#5b8def', '#d39237', '#157f3c'];
      const dailySeries = [...bySaleRaw].sort((a, b) => b.activeHours - a.activeHours).slice(0, 8).map((s, i) => ({
        userId: s.userId, name: s.name, color: PALETTE[i % PALETTE.length],
        points: dayList.map((d) => ({ date: d, min: Math.round((s.dayMs.get(d) || 0) / 60_000) })),
      }));

      // (A) hourHeat (thứ × giờ).
      const hourHeat = {
        max: heatMax,
        cells: Array.from(heat.entries()).map(([k, count]) => {
          const [d, h] = k.split('-').map(Number); return { d, h, count };
        }),
      };

      // (C) phễu hoạt động → chốt / sale.
      const funnel = bySaleRaw.map((s) => ({
        userId: s.userId, name: s.name,
        sent: sentBySale.get(s.userId) || 0,
        replied: repliedBySale.get(s.userId) || 0,
        appts: apptBySale.get(s.userId) || 0,
        closed: s.closed,
      })).sort((a, b) => b.sent - a.sent).slice(0, 8);

      // (D) so sánh kỳ trước: actions + giờ dùng TB.
      const prevPerUser = new Map<string, Map<string, number[]>>();
      for (const e of prevEvents) {
        if (!e.userId) continue;
        let m = prevPerUser.get(e.userId); if (!m) { m = new Map(); prevPerUser.set(e.userId, m); }
        const ms = e.createdAt.getTime(); const dk = dayKey(ms);
        const arr = m.get(dk); if (arr) arr.push(ms); else m.set(dk, [ms]);
      }
      const compare = bySaleRaw.map((s) => {
        let pAct = 0, pMs = 0, pDays = 0;
        for (const [, ts] of (prevPerUser.get(s.userId) ?? new Map<string, number[]>())) {
          pAct += ts.length; pMs += dayActiveMs(ts.sort((a, b) => a - b)); pDays++;
        }
          const prevAvgMin = pDays > 0 ? Math.round(pMs / 60_000 / pDays) : null;
        return {
          userId: s.userId, name: s.name,
          actions: s.actions, prevActions: pAct, dActions: s.actions - pAct,
            avgMin: s.avgActiveMinPerDay, prevAvgMin,
            dAvgMin: prevAvgMin === null || s.avgActiveMinPerDay === null ? null : s.avgActiveMinPerDay - prevAvgMin,
        };
      }).sort((a, b) => b.actions - a.actions).slice(0, 10);

      // Module usage org-wide.
      const moduleTotalSum = Array.from(moduleTotals.values()).reduce((a, b) => a + b, 0) || 1;
      const moduleUsage = Array.from(moduleTotals.entries())
        .map(([cat, n]) => ({ module: cat, label: MODULE_MAP[cat] || cat, actions: n, pct: Math.round((n / moduleTotalSum) * 1000) / 10 }))
        .sort((a, b) => b.actions - a.actions);

      // KPIs.
      const activeSalesToday = new Set(events.filter((e) => e.createdAt >= todayStart).map((e) => e.userId)).size;
      const withTime = bySale.filter((s) => s.activeDays > 0);
      const avgActiveMinPerDay = withTime.length > 0
        ? Math.round(withTime.reduce((a, s) => a + (s.avgActiveMinPerDay ?? 0), 0) / withTime.length) : null;
      const topModule = moduleUsage[0]?.label || '—';

      return {
        from, to,
        kpis: {
          activeSalesToday: activityEventsTruncated ? null : activeSalesToday,
          avgActiveMinPerDay: activityEventsTruncated ? null : avgActiveMinPerDay,
          totalActions: activityEventsTruncated ? null : totalActions,
          topModule: activityEventsTruncated ? null : topModule,
        },
        bySale: activityEventsTruncated ? [] : bySale,
        moduleUsage: activityEventsTruncated ? [] : moduleUsage,
        dailySeries: activityEventsTruncated ? [] : dailySeries,
        days: activityEventsTruncated ? [] : dayList,
        hourHeat: activityEventsTruncated ? null : hourHeat,
        funnel: activityEventsTruncated ? [] : funnel,
        compare: activityEventsTruncated || previousActivityTruncated ? [] : compare,
        availability: {
          activity: activityEventsTruncated ? unavailable('activity_event_limit') : { status: 'available' },
          previousActivity: previousActivityTruncated ? unavailable('previous_activity_event_limit') : { status: 'available' },
          outcomes: unavailable('won_status_mapping_unavailable'),
        },
        note: 'Thời gian dùng là ƯỚC TÍNH từ nhịp thao tác trên CRM (chưa có tracking phiên chính xác).',
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] CRM-usage error:', err);
      return reply.status(500).send({ error: 'Failed to fetch CRM usage report' });
    }
  });
}
