import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { authRoutes } from '../../src/modules/auth/auth-routes.js';
import { reportAnalyticsRoutes } from '../../src/modules/dashboard/report-analytics-routes.js';
import { aiReportRoutes } from '../../src/modules/dashboard/ai-report-routes.js';
import { automationReportRoutes } from '../../src/modules/automation/automation-report-routes.js';
import { broadcastReportRoutes } from '../../src/modules/broadcast/broadcast-report-routes.js';
import { analyticsRoutes } from '../../src/modules/analytics/analytics-routes.js';
import { savedReportRoutes } from '../../src/modules/analytics/saved-report-routes.js';
import { prisma } from '../../src/shared/database/prisma-client.js';

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const port = Number(process.env.REPORTS_6A_HTTP_PORT ?? 55490);
const frontendDist = resolve(process.cwd(), '..', 'frontend', 'dist');

if (!databaseUrl || !jwtSecret || jwtSecret.length < 32) {
  throw new Error('6A server requires explicit disposable DATABASE_URL and test-only JWT_SECRET.');
}
const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== '127.0.0.1' ||
  parsedUrl.port !== '55489' ||
  parsedUrl.pathname !== '/reports_6a_verify' ||
  parsedUrl.username !== 'reports_6a_app' ||
  process.env.RLS_SET_CONFIG !== 'true'
) {
  throw new Error('Refusing to start: 6A server must use the verified app role and tenant RLS context.');
}

const app = Fastify({ logger: { level: 'warn' } });
await app.register(jwt, { secret: jwtSecret });
await app.register(authRoutes);
await app.register(reportAnalyticsRoutes);
await app.register(aiReportRoutes);
await app.register(automationReportRoutes);
await app.register(broadcastReportRoutes);
await app.register(analyticsRoutes);
await app.register(savedReportRoutes);
await app.register(fastifyStatic, {
  root: frontendDist,
  prefix: '/',
  wildcard: false,
});

app.get('/__6a/health', async () => ({ status: 'ok', harness: 'reports-6a' }));
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
  return reply.sendFile('index.html');
});
app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

await app.listen({ host: '127.0.0.1', port });
process.stdout.write(`6A local harness ready at http://127.0.0.1:${port}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0), (error) => {
      process.stderr.write(`6A server shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
  });
}
