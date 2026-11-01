import { gateReportAccess, reportScope } from '../dashboard/report-scope.js';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * analytics-routes.ts — Conversion funnel, team performance, response time, custom report.
 * All routes require JWT auth, scoped to user's orgId.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  getConversionFunnel,
  getTeamPerformance,
  getResponseTimeAnalysis,
  executeCustomReport,
} from './analytics-service.js';
import type { ReportConfig } from './analytics-service.js';
import { isInvalidReportPeriodError, resolveReportPeriod } from '../dashboard/report-period.js';

type QueryParams = Record<string, string>;

function invalidPeriod(reply: FastifyReply, err: unknown) {
  if (!isInvalidReportPeriodError(err)) return null;
  return reply.status(400).send({
    error: 'Invalid report date range',
    code: 'invalid_report_date_range',
    message: err.message,
  });
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.addHook('preHandler', async (request, reply) => { await gateReportAccess(request, reply); });

  // GET /api/v1/analytics/conversion-funnel?from=&to=
  app.get('/api/v1/analytics/conversion-funnel', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to } = resolveReportPeriod(query);
      const result = await getConversionFunnel(orgId, from, to, reportScope(request));
      return result;
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[analytics] Conversion funnel error:', err);
      return reply.status(500).send({ error: 'Failed to fetch conversion funnel' });
    }
  });

  // GET /api/v1/analytics/team-performance?from=&to=
  app.get('/api/v1/analytics/team-performance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to } = resolveReportPeriod(query);
      const result = await getTeamPerformance(orgId, from, to, reportScope(request));
      return result;
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[analytics] Team performance error:', err);
      return reply.status(500).send({ error: 'Failed to fetch team performance' });
    }
  });

  // GET /api/v1/analytics/response-time?from=&to=
  app.get('/api/v1/analytics/response-time', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const query = request.query as QueryParams;
      const { from, to } = resolveReportPeriod(query);
      const result = await getResponseTimeAnalysis(orgId, from, to, reportScope(request));
      return result;
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[analytics] Response time error:', err);
      return reply.status(500).send({ error: 'Failed to fetch response time' });
    }
  });

  // POST /api/v1/analytics/custom — body: ReportConfig
  app.post('/api/v1/analytics/custom', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const config = request.body as ReportConfig;
      if (!config.metrics?.length || !config.groupBy || !config.dateRange?.from || !config.dateRange?.to) {
        return reply.status(400).send({ error: 'metrics, groupBy, and a complete dateRange are required' });
      }
      const period = resolveReportPeriod(config.dateRange, { defaultDays: 1 });
      const result = await executeCustomReport(orgId, { ...config, dateRange: { from: period.from, to: period.to } }, reportScope(request));
      return result;
    } catch (err) {
      const invalid = invalidPeriod(reply, err);
      if (invalid) return invalid;
      logger.error('[analytics] Custom report error:', err);
      return reply.status(500).send({ error: 'Failed to execute custom report' });
    }
  });
}
