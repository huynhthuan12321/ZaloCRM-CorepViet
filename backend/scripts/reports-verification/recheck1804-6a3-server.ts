// Copy of 6a2-server.ts for the 6A rerun after remediation; DB/port/role names changed.
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { appendFile, readFile } from 'node:fs/promises';
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
const port = Number(process.env.REPORTS_6A_HTTP_PORT ?? 55544);
const frontendDist = resolve(process.cwd(), '..', 'frontend', 'dist');

if (!databaseUrl || !jwtSecret || jwtSecret.length < 32) {
  throw new Error('6A server requires explicit disposable DATABASE_URL and test-only JWT_SECRET.');
}
const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== '127.0.0.1' ||
  parsedUrl.port !== '55541' ||
  parsedUrl.pathname !== '/reports_5b6b_6a_verify' ||
  parsedUrl.username !== 'reports_5b6b_6a_app' ||
  process.env.RLS_SET_CONFIG !== 'true'
) {
  throw new Error('Refusing to start: 6A server must use the verified app role and tenant RLS context.');
}

const app = Fastify({ logger: { level: 'warn' } });
await app.register(jwt, { secret: jwtSecret });
// 6A rerun: opt-in, filesystem-controlled delay/fault for browser error/retry and stale-response
// checks (no network control endpoint), plus a per-request access log for route timings.
const evidenceDir = process.env.REPORTS_6A_EVIDENCE_DIR;
if (!evidenceDir) throw new Error('6A rerun server requires REPORTS_6A_EVIDENCE_DIR.');
const consumedScenarios = new Set<string>();
app.addHook('onRequest', async (req, reply) => {
  if (req.method !== 'GET' || !req.url.startsWith('/api/v1/reports/')) return;
  let plan: { id: string; path: string; delayMs?: number; fail?: boolean };
  try { plan = JSON.parse(await readFile(resolve(evidenceDir, 'scenario.json'), 'utf8')); } catch { return; }
  const path = req.url.split('?')[0];
  if (!plan?.id || !/^[a-z0-9-]{1,80}$/.test(plan.id) || plan.path !== path || consumedScenarios.has(plan.id)) return;
  consumedScenarios.add(plan.id);
  const record = (phase: string) => appendFile(resolve(evidenceDir, 'scenario-events.jsonl'), JSON.stringify({ time: new Date().toISOString(), id: plan.id, path, phase }) + '\n');
  await record('intercepted');
  if (plan.delayMs && plan.delayMs > 0 && plan.delayMs <= 15000) await new Promise((r) => setTimeout(r, plan.delayMs));
  await record(plan.fail ? 'controlled-503' : 'released-to-real-route');
  if (plan.fail) return reply.code(503).send({ error: 'Controlled local verification fault' });
});
app.addHook('onResponse', async (req, reply) => {
  await appendFile(resolve(evidenceDir, 'http-access.jsonl'), JSON.stringify({ time: new Date().toISOString(), method: req.method, url: req.url, status: reply.statusCode, ms: Math.round(reply.elapsedTime * 100) / 100 }) + '\n');
});
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
