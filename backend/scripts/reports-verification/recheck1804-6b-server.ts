// 6B lần 3 — independent loopback harness. Registers only auth + report/analytics/saved-report routes,
// including dashboard/report-routes.ts (basic reports + Excel export) that the 6A harness did not load.
// No app bootstrap: no queue, cron, socket, AI provider, Zalo/Telegram send path.
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { appendFile, readFile } from 'node:fs/promises';
import { authRoutes } from '../../src/modules/auth/auth-routes.js';
import { reportAnalyticsRoutes } from '../../src/modules/dashboard/report-analytics-routes.js';
import { reportRoutes } from '../../src/modules/dashboard/report-routes.js';
import { aiReportRoutes } from '../../src/modules/dashboard/ai-report-routes.js';
import { automationReportRoutes } from '../../src/modules/automation/automation-report-routes.js';
import { broadcastReportRoutes } from '../../src/modules/broadcast/broadcast-report-routes.js';
import { analyticsRoutes } from '../../src/modules/analytics/analytics-routes.js';
import { savedReportRoutes } from '../../src/modules/analytics/saved-report-routes.js';
import { prisma } from '../../src/shared/database/prisma-client.js';

const url = new URL(process.env.DATABASE_URL ?? '');
const evidenceDir = process.env.REPORTS_6B_EVIDENCE_DIR;
if (url.hostname !== '127.0.0.1' || url.port !== '55541' || url.pathname !== '/reports_5b6b_verify' || url.username !== 'reports_5b6b_app'
  || process.env.RLS_SET_CONFIG !== 'true' || process.env.TENANT_GUARD_MODE !== 'enforce' || !evidenceDir || (process.env.JWT_SECRET ?? '').length < 32) {
  throw new Error('Refusing to start: 6B harness needs the disposable app-role URL, RLS_SET_CONFIG, enforce guard, evidence dir and a test JWT secret.');
}

const app = Fastify({ logger: { level: 'warn' } });
await app.register(jwt, { secret: process.env.JWT_SECRET! });
// Filesystem-controlled one-shot delay/fault for browser checks; no network control endpoint.
const consumed = new Set<string>();
app.addHook('onRequest', async (req, reply) => {
  if (req.method !== 'GET' || !req.url.startsWith('/api/v1/reports/')) return;
  let plan: { id: string; path: string; delayMs?: number; fail?: boolean; matchQuery?: string };
  try { plan = JSON.parse(await readFile(resolve(evidenceDir, 'scenario.json'), 'utf8')); } catch { return; }
  const [path, qs = ''] = req.url.split('?');
  if (!plan?.id || !/^[a-z0-9-]{1,80}$/.test(plan.id) || plan.path !== path || consumed.has(plan.id)) return;
  if (plan.matchQuery && !qs.includes(plan.matchQuery)) return;
  consumed.add(plan.id);
  const log = (phase: string) => appendFile(resolve(evidenceDir, 'scenario-events.jsonl'), JSON.stringify({ time: new Date().toISOString(), id: plan.id, url: req.url, phase }) + '\n');
  await log('intercepted');
  if (plan.delayMs && plan.delayMs > 0 && plan.delayMs <= 15000) await new Promise((r) => setTimeout(r, plan.delayMs));
  await log(plan.fail ? 'controlled-503' : 'released');
  if (plan.fail) return reply.code(503).send({ error: '6B controlled local fault' });
});
app.addHook('onResponse', async (req, reply) => {
  await appendFile(resolve(evidenceDir, 'http-access.jsonl'), JSON.stringify({ time: new Date().toISOString(), method: req.method, url: req.url, status: reply.statusCode, ms: Math.round(reply.elapsedTime * 100) / 100 }) + '\n');
});
await app.register(authRoutes);
await app.register(reportAnalyticsRoutes);
await app.register(reportRoutes);
await app.register(aiReportRoutes);
await app.register(automationReportRoutes);
await app.register(broadcastReportRoutes);
await app.register(analyticsRoutes);
await app.register(savedReportRoutes);
await app.register(fastifyStatic, { root: resolve(process.cwd(), '..', 'frontend', 'dist'), prefix: '/', wildcard: false });
app.get('/__6b/health', async () => ({ status: 'ok', harness: 'reports-6b3' }));
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
  return reply.sendFile('index.html');
});
app.addHook('onClose', async () => { await prisma.$disconnect(); });
await app.listen({ host: '127.0.0.1', port: 55542 });
process.stdout.write(`6B harness ready http://127.0.0.1:55542 pid=${process.pid}\n`);
process.stdout.write(`routes:\n${app.printRoutes({ commonPrefix: false })}\n`);
for (const s of ['SIGINT', 'SIGTERM'] as const) process.once(s, () => { void app.close().then(() => process.exit(0)); });
