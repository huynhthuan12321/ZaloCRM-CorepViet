import { gateReportAccess, reportScope } from '../dashboard/report-scope.js';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * saved-report-routes.ts — CRUD for SavedReport + run saved config.
 * All routes require JWT auth, scoped to user's orgId.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  getConversionFunnel,
  getTeamPerformance,
  getResponseTimeAnalysis,
  executeCustomReport,
} from './analytics-service.js';
import type { ReportConfig } from './analytics-service.js';
import { getOwnerScope, applyOwnerScope } from '../rbac/owner-scope.js';
import { isInvalidReportPeriodError, resolveReportPeriod } from '../dashboard/report-period.js';

function invalidPeriod(reply: FastifyReply, err: unknown) {
  if (!isInvalidReportPeriodError(err)) return null;
  return reply.status(400).send({
    error: 'Invalid report date range',
    code: 'invalid_report_date_range',
    message: err.message,
  });
}

export async function savedReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/saved-reports — list all for org
  app.get('/api/v1/saved-reports', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId, id: userId, role } = request.user!;
      // Phase Marketing Scope 2026-05-27: sale chỉ thấy report mình save
      const ownerScope = await getOwnerScope({ userId, orgId, legacyRole: role });
      const where: any = { orgId, ...applyOwnerScope(ownerScope, 'createdBy') };
      const reports = await prisma.savedReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      return { data: reports };
    } catch (err) {
      logger.error('[saved-reports] List error:', err);
      return reply.status(500).send({ error: 'Failed to list saved reports' });
    }
  });

  // POST /api/v1/saved-reports — create
  app.post('/api/v1/saved-reports', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId, id: userId } = request.user!;
      const body = request.body as { name: string; type: string; config: any };
      if (!body.name || !body.type) {
        return reply.status(400).send({ error: 'name and type are required' });
      }
      const report = await prisma.savedReport.create({
        data: {
          orgId,
          name: body.name,
          type: body.type,
          config: body.config ?? {},
          createdBy: userId,
        },
      });
      return reply.status(201).send(report);
    } catch (err) {
      logger.error('[saved-reports] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create saved report' });
    }
  });

  // GET /api/v1/saved-reports/:id
  app.get('/api/v1/saved-reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId, id: userId, role } = request.user!;
      const { id } = request.params as { id: string };
      const ownerScope = await getOwnerScope({ userId, orgId, legacyRole: role });
      const where: any = { id, orgId, ...applyOwnerScope(ownerScope, 'createdBy') };
      const report = await prisma.savedReport.findFirst({ where });
      if (!report) return reply.status(404).send({ error: 'Report not found' });
      return report;
    } catch (err) {
      logger.error('[saved-reports] Get error:', err);
      return reply.status(500).send({ error: 'Failed to fetch saved report' });
    }
  });

  // PUT /api/v1/saved-reports/:id
  app.put('/api/v1/saved-reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; config?: any };
      const _ownerScope = await getOwnerScope({ userId: request.user!.id, orgId, legacyRole: request.user!.role });
      const _existingWhere: any = { id, orgId, ...applyOwnerScope(_ownerScope, 'createdBy') };
      const existing = await prisma.savedReport.findFirst({ where: _existingWhere });
      if (!existing) return reply.status(404).send({ error: 'Report not found' });
      const updated = await prisma.savedReport.update({
        where: { id },
        data: { name: body.name ?? existing.name, config: body.config ?? existing.config },
      });
      return updated;
    } catch (err) {
      logger.error('[saved-reports] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update saved report' });
    }
  });

  // DELETE /api/v1/saved-reports/:id
  app.delete('/api/v1/saved-reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      const _ownerScope = await getOwnerScope({ userId: request.user!.id, orgId, legacyRole: request.user!.role });
      const _existingWhere: any = { id, orgId, ...applyOwnerScope(_ownerScope, 'createdBy') };
      const existing = await prisma.savedReport.findFirst({ where: _existingWhere });
      if (!existing) return reply.status(404).send({ error: 'Report not found' });
      await prisma.savedReport.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[saved-reports] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete saved report' });
    }
  });

  // POST /api/v1/saved-reports/:id/run — execute saved report
  app.post('/api/v1/saved-reports/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await gateReportAccess(request, reply))) return;
      const scope = reportScope(request);
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      const report = await prisma.savedReport.findFirst({ where: { id, orgId, ...(scope.kind === 'org' ? {} : { createdBy: { in: scope.userIds ?? [] } }) } });
      if (!report) return reply.status(404).send({ error: 'Report not found' });

      const config = report.config as any;
      const period = resolveReportPeriod(config?.dateRange ?? {});
      const normalizedConfig = { ...config, dateRange: { from: period.from, to: period.to } };

      switch (report.type) {
        case 'conversion_funnel':
          return await getConversionFunnel(orgId, period.from, period.to, scope);
        case 'team_performance':
          return await getTeamPerformance(orgId, period.from, period.to, scope);
        case 'response_time':
          return await getResponseTimeAnalysis(orgId, period.from, period.to, scope);
        case 'custom':
          return await executeCustomReport(orgId, normalizedConfig as ReportConfig, scope);
        default:
          return reply.status(400).send({ error: `Unknown report type: ${report.type}` });
      }
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[saved-reports] Run error:', err);
      return reply.status(500).send({ error: 'Failed to run saved report' });
    }
  });
}
