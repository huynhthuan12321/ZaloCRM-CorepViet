import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../auth/auth-middleware.js';
import { gateReportAccess, reportScope } from './report-scope.js';
import { isInvalidReportPeriodError, resolveReportPeriod } from './report-period.js';
import { getAiReport } from './ai-report-service.js';

const querySchema = z.object({ from: z.string().optional(), to: z.string().optional() }).strict();

export async function aiReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.get('/api/v1/reports/ai', async (request, reply) => {
    if (!(await gateReportAccess(request, reply))) return;
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ code: 'invalid_ai_report_query', error: 'Chỉ hỗ trợ bộ lọc from/to theo YYYY-MM-DD.' });
    try {
      const asOf = new Date();
      const period = resolveReportPeriod(query.data, { now: asOf });
      return await getAiReport(reportScope(request), period, asOf);
    } catch (error) {
      if (isInvalidReportPeriodError(error)) return reply.code(400).send({ code: 'invalid_report_date_range', error: error.message });
      request.log.error({ err: error }, 'AI report query failed');
      return reply.code(500).send({ error: 'Không tải được báo cáo AI.' });
    }
  });
}
