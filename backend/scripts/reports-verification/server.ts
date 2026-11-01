// Real HTTP/JWT/Prisma verification harness. No app.ts import, queues, cron,
// socket server, Zalo/Telegram/AI provider or production configuration.
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { appendFile } from 'node:fs/promises';
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
const { reportRoutes } = await import('../../src/modules/dashboard/report-routes.js');
const { prisma } = await import('../../src/shared/database/prisma-client.js');
const app = Fastify({ logger: false });
await app.register(jwt, { secret: process.env.JWT_SECRET });
app.addHook('onResponse', async (req, reply) => {
  await appendFile(resolve('../artifacts/reports-real-verification-2026-11-01/http-access.jsonl'), JSON.stringify({ time: new Date().toISOString(), method: req.method, path: req.url.split('?')[0], status: reply.statusCode }) + '\n');
});
await app.register(authRoutes);
await app.register(analyticsRoutes);
await app.register(savedReportRoutes);
await app.register(reportAnalyticsRoutes);
await app.register(reportRoutes);
app.get('/api/v1/public/org-branding', async () => ({ orgName: 'VERIFY LOCAL TEST', slogan: 'Synthetic fixture only' }));
await app.register(fastifyStatic, { root: resolve('../frontend/dist'), wildcard: false });
app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') || req.url.startsWith('/socket.io') ? reply.code(404).send({ error: 'Not enabled in verification harness' }) : reply.sendFile('index.html'));
await app.listen({ host: '127.0.0.1', port: 30571 });
console.log('VERIFY_SERVER_READY http://127.0.0.1:30571 RLS_SET_CONFIG=true TENANT_GUARD_MODE=enforce');
// In-memory test tokens never enter logs or files.
const { runChecks } = await import('./verify.js');
await runChecks(app);
process.on('SIGINT', async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
