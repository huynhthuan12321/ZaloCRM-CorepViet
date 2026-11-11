// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * report-routes.ts — Detailed reports for messages, contacts, appointments, and Excel export.
 * All routes require JWT auth, scoped to user's orgId.
 * Sheet builders are in excel-sheet-builders.ts.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import ExcelJS from 'exceljs';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  buildMessagesSheet,
  buildContactsSheet,
  buildAppointmentsSheet,
} from './excel-sheet-builders.js';
import { isInvalidReportPeriodError, listReportDates, resolveReportPeriod } from './report-period.js';

import { gateReportAccess, reportScope, reportModelWhere, messageReportSql, contactReportSql } from './report-scope.js';

type QueryParams = Record<string, string>;

// Authorization is shared with analytics; export receives the same viewer scope.

function invalidPeriod(reply: FastifyReply, err: unknown) {
  if (!isInvalidReportPeriodError(err)) return null;
  return reply.status(400).send({
    error: 'Invalid report date range',
    code: 'invalid_report_date_range',
    message: err.message,
  });
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/reports/messages?from=&to=
  app.get('/api/v1/reports/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const period = resolveReportPeriod(query);
      const { from, to, start, end } = period;

      const rows = await prisma.$queryRaw<
        Array<{ date: Date; sent: bigint; received: bigint; total: bigint }>
      >`
        SELECT
          DATE(m.sent_at + INTERVAL '7 hours') AS date,
          COUNT(*) FILTER (WHERE m.sender_type = 'self') AS sent,
          COUNT(*) FILTER (WHERE m.sender_type = 'contact') AS received,
          COUNT(*) AS total
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE ${messageReportSql(scope)}
          AND c.zalo_account_id IS NOT NULL
          AND m.sent_at >= ${start}
          AND m.sent_at < ${end}
        GROUP BY DATE(m.sent_at + INTERVAL '7 hours')
        ORDER BY date ASC
      `;

      const byDate = new Map(rows.map((row) => {
        const date = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
        return [date, row] as const;
      }));
      const data = listReportDates(from, to).map((date) => {
        const row = byDate.get(date);
        const sent = Number(row?.sent ?? 0);
        const received = Number(row?.received ?? 0);
        return { date, sent, received, total: Number(row?.total ?? sent + received) };
      });

      return { from, to, data };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Messages error:', err);
      return reply.status(500).send({ error: 'Failed to fetch message report' });
    }
  });

  // GET /api/v1/reports/contacts?from=&to= — contacts by status distribution
  app.get('/api/v1/reports/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const period = resolveReportPeriod(query);
      const { from, to, start, end } = period;

      const [newPerDay, statusDist] = await Promise.all([
        prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT DATE(created_at + INTERVAL '7 hours') AS date, COUNT(*) AS count
          FROM contacts
          WHERE ${contactReportSql(scope)}
            AND created_at >= ${start}
            AND created_at < ${end}
          GROUP BY DATE(created_at + INTERVAL '7 hours')
          ORDER BY date ASC
        `,
        prisma.contact.groupBy({
          by: ['status'],
          where: { AND: [{ orgId, status: { not: null } }, reportModelWhere(scope, 'contact')] },
          _count: true,
        }),
      ]);

      const byDate = new Map(newPerDay.map((row) => {
        const date = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
        return [date, Number(row.count)] as const;
      }));
      return {
        from,
        to,
        newPerDay: listReportDates(from, to).map((date) => ({ date, count: byDate.get(date) ?? 0 })),
        byStatus: statusDist.map((s) => ({
          status: s.status,
          count: s._count,
        })),
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Contacts error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact report' });
    }
  });

  // GET /api/v1/reports/appointments?from=&to=
  app.get('/api/v1/reports/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const period = resolveReportPeriod(query);
      const { from, to, dateStart, dateEnd } = period;

      const dateFilter = { gte: dateStart, lt: dateEnd };
      const [byStatus, byType] = await Promise.all([
        prisma.appointment.groupBy({
          by: ['status'],
          where: { AND: [{ orgId, appointmentDate: dateFilter }, reportModelWhere(scope, 'appointment')] },
          _count: true,
        }),
        prisma.appointment.groupBy({
          by: ['type'],
          where: { AND: [{ orgId, appointmentDate: dateFilter }, reportModelWhere(scope, 'appointment')] },
          _count: true,
        }),
      ]);

      return {
        from,
        to,
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
        byType: byType.map((t) => ({ type: t.type, count: t._count })),
      };
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Appointments error:', err);
      return reply.status(500).send({ error: 'Failed to fetch appointment report' });
    }
  });

  // GET /api/v1/reports/export?type=messages&from=&to=
  app.get('/api/v1/reports/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const type = query.type || 'messages';
      const period = resolveReportPeriod(query);
      const { from, to } = period;

      const workbook = new ExcelJS.Workbook();

      if (type === 'messages') {
        await buildMessagesSheet(workbook, orgId, period, scope);
      } else if (type === 'contacts') {
        await buildContactsSheet(workbook, orgId, period, scope);
      } else if (type === 'appointments') {
        await buildAppointmentsSheet(workbook, orgId, period, scope);
      } else {
        return reply.status(400).send({ error: 'Invalid export type. Use: messages, contacts, appointments' });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
      return reply.send(Buffer.from(buffer as ArrayBuffer));
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[reports] Export error:', err);
      return reply.status(500).send({ error: 'Failed to export report' });
    }
  });
}
