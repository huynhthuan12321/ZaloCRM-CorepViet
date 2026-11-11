import { getResponseTimeAnalysis } from './response-time.js';
import { reportModelWhere, messageReportSql, type ReportScope } from '../../dashboard/report-scope.js';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * team-performance.ts — Per-user metrics: messages sent, contacts converted,
 * appointments completed, avg response time.
 */
import { prisma } from '../../../shared/database/prisma-client.js';
import { resolveReportPeriod } from '../../dashboard/report-period.js';

export interface TeamMember {
  userId: string;
  fullName: string;
  messagesSent: number;
  contactsConverted: number;
  appointmentsCompleted: number;
  avgResponseTime: number | null; // seconds
}

export interface TeamPerformanceResult {
  users: TeamMember[];
}

export async function getTeamPerformance(
  orgId: string,
  from: string,
  to: string,
  scope: ReportScope,
): Promise<TeamPerformanceResult> {
  const { start: gte, end: lt, dateStart, dateEnd } = resolveReportPeriod({ from, to }, { defaultDays: 1 });

  // Get all active users in org
  const orgUsers = await prisma.user.findMany({
    where: { AND: [{ orgId, isActive: true }, reportModelWhere(scope, 'user')] },
    select: { id: true, fullName: true },
  });

  if (!orgUsers.length) return { users: [] };

  const userIds = orgUsers.map((u) => u.id);

  // Parallel queries
  const [msgRows, convertedRows, aptRows, rtRows] = await Promise.all([
    // Messages sent per user (replied_by_user_id)
    prisma.$queryRaw<Array<{ user_id: string; cnt: bigint }>>`
      SELECT m.replied_by_user_id AS user_id, COUNT(*)::bigint AS cnt
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE ${messageReportSql(scope, 'people')}
        AND m.sender_type = 'self'
        AND m.replied_by_user_id = ANY(${userIds})
        AND m.sent_at >= ${gte} AND m.sent_at < ${lt}
      GROUP BY m.replied_by_user_id
    `,
    // Contacts converted per user
    prisma.contact.groupBy({
      by: ['assignedUserId'],
      where: { AND: [{
        orgId,
        status: 'converted',
        assignedUserId: { in: userIds },
        updatedAt: { gte, lt },
      }, reportModelWhere(scope, 'contact')] },
      _count: true,
    }),
    // Appointments completed per user
    prisma.appointment.groupBy({
      by: ['assignedUserId'],
      where: { AND: [{
        orgId,
        status: 'completed',
        assignedUserId: { in: userIds },
        appointmentDate: { gte: dateStart, lt: dateEnd },
      }, reportModelWhere(scope, 'appointment')] },
      _count: true,
    }),
    // Shared last-customer-message pairing, weighted by actual response turns.
    getResponseTimeAnalysis(orgId, from, to, scope),
  ]);

  // Build lookup maps
  const msgMap = new Map(msgRows.map((r) => [r.user_id, Number(r.cnt)]));
  const convMap = new Map(
    convertedRows.map((r) => [r.assignedUserId, r._count]),
  );
  const aptMap = new Map(aptRows.map((r) => [r.assignedUserId, r._count]));
  const rtMap = new Map(rtRows.byUser.map((r) => [r.userId, r.avgSeconds]));

  const users: TeamMember[] = orgUsers.map((u) => ({
    userId: u.id,
    fullName: u.fullName,
    messagesSent: msgMap.get(u.id) ?? 0,
    contactsConverted: convMap.get(u.id) ?? 0,
    appointmentsCompleted: aptMap.get(u.id) ?? 0,
    avgResponseTime: rtMap.get(u.id) ?? null,
  }));

  // Sort by contactsConverted desc
  users.sort((a, b) => b.contactsConverted - a.contactsConverted);

  return { users };
}
