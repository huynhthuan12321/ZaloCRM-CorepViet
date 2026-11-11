// Real HTTP/JWT/Prisma verification harness. No app.ts import, queues, cron,
// socket server, Zalo/Telegram/AI provider or production configuration.
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://reports_verify_app@127.0.0.1:55471/reports_1b_verify';
process.env.TENANT_GUARD_MODE = 'enforce';
process.env.RLS_SET_CONFIG = 'true';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.CHANNELS_ENABLED = 'false';
const { authRoutes } = await import('../../src/modules/auth/auth-routes.js');
const { analyticsRoutes } = await import('../../src/modules/analytics/analytics-routes.js');
const { savedReportRoutes } = await import('../../src/modules/analytics/saved-report-routes.js');
const { reportAnalyticsRoutes } = await import('../../src/modules/dashboard/report-analytics-routes.js');
const { aiReportRoutes } = await import('../../src/modules/dashboard/ai-report-routes.js');
const { reportRoutes } = await import('../../src/modules/dashboard/report-routes.js');
const { automationReportRoutes } = await import('../../src/modules/automation/automation-report-routes.js');
const { broadcastReportRoutes } = await import('../../src/modules/broadcast/broadcast-report-routes.js');
const { prisma } = await import('../../src/shared/database/prisma-client.js');
const app = Fastify({ logger: false });
await app.register(jwt, { secret: process.env.JWT_SECRET });
// Opt-in, filesystem-controlled faults for the real-browser test only. Successful
// responses still use the real routes/DB. No network control endpoint is exposed.
const browserEvidenceRoot = resolve('../artifacts/reports-mobile-5b-recheck4-20261102/browser');
if (process.env.REPORT_VERIFY_BROWSER_SCENARIOS === '1') await mkdir(browserEvidenceRoot, { recursive: true });
const consumedScenarios = new Set<string>();
const scenarioPaths = new Set(['/api/v1/reports/ai', '/api/v1/reports/automation-summary', '/api/v1/reports/broadcast', '/api/v1/reports/engagement', '/api/v1/reports/overview', '/api/v1/reports/sales-performance', '/api/v1/reports/crm-usage']);
app.addHook('onRequest', async (req, reply) => {
  if (process.env.REPORT_VERIFY_BROWSER_SCENARIOS !== '1' || req.method !== 'GET') return;
  const path = req.url.split('?')[0];
  if (!scenarioPaths.has(path)) return;
  let plan: { id: string; path: string; delayMs?: number; fail?: boolean };
  try { plan = JSON.parse(await readFile(resolve(browserEvidenceRoot, 'scenario.json'), 'utf8')); }
  catch { return; }
  if (!/^[a-z0-9-]{1,80}$/.test(plan.id) || plan.path !== path || consumedScenarios.has(plan.id)) return;
  consumedScenarios.add(plan.id);
  const record = (phase: string) => appendFile(resolve(browserEvidenceRoot, 'scenario-events.jsonl'), JSON.stringify({ time: new Date().toISOString(), id: plan.id, path, phase }) + '\n');
  await record('intercepted');
  if (plan.delayMs && plan.delayMs > 0 && plan.delayMs <= 15000) await new Promise(resolveDelay => setTimeout(resolveDelay, plan.delayMs));
  await record(plan.fail ? 'controlled-503' : 'released-to-real-route');
  if (plan.fail) return reply.code(503).send({ error: 'Controlled local browser verification fault' });
});
app.addHook('onResponse', async (req, reply) => {
  await appendFile(resolve('../artifacts/reports-mobile-5b-recheck4-20261102/http-access.jsonl'), JSON.stringify({ time: new Date().toISOString(), method: req.method, path: req.url.split('?')[0], status: reply.statusCode }) + '\n');
  if (process.env.REPORT_VERIFY_BROWSER_SCENARIOS === '1' && req.url.startsWith('/api/v1/reports/')) {
    const url = new URL(req.url, 'http://127.0.0.1:30574');
    await appendFile(resolve(browserEvidenceRoot, 'report-http.jsonl'), JSON.stringify({ time: new Date().toISOString(), method: req.method, path: url.pathname, from: url.searchParams.get('from'), to: url.searchParams.get('to'), status: reply.statusCode }) + '\n');
  }
});
await app.register(authRoutes);
await app.register(analyticsRoutes);
await app.register(savedReportRoutes);
await app.register(reportAnalyticsRoutes);
await app.register(aiReportRoutes);
await app.register(reportRoutes);
await app.register(automationReportRoutes);
await app.register(broadcastReportRoutes);
app.get('/api/v1/public/org-branding', async () => ({ orgName: 'VERIFY LOCAL TEST', slogan: 'Synthetic fixture only' }));
// Resolve fresh hashed assets after each UI build, rather than enumerating the
// previous dist filenames at harness startup. API misses remain JSON below.
await app.register(fastifyStatic, { root: resolve('../frontend/dist'), wildcard: true });
app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') || req.url.startsWith('/socket.io') ? reply.code(404).send({ error: 'Not enabled in verification harness' }) : reply.sendFile('index.html'));
await app.listen({ host: '127.0.0.1', port: 30574 });
console.log('VERIFY_SERVER_READY http://127.0.0.1:30574 RLS_SET_CONFIG=true TENANT_GUARD_MODE=enforce');
// In-memory test tokens never enter logs or files.
const { runChecks } = await import('./5b-recheck4-base-checks.js');
await runChecks(app);
process.on('SIGINT', async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });



