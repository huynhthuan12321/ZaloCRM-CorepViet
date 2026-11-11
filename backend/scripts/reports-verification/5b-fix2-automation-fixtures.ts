// Synthetic, paused/closed records only; no worker, scheduler or provider imports.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify' }) });
assert.equal((await db.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0].db, 'reports_1b_verify');
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const day = new Date(new Date(`${today}T00:00:00+07:00`).getTime() - 86400000 + 7 * 3600000).toISOString().slice(0, 10);
const time = new Date(`${day}T09:00:00+07:00`);
for (const suffix of ['a', 'b']) {
  const orgId = `verify-org-${suffix}`, nick = suffix === 'a' ? 'verify-nick-a' : 'verify-nick-x';
  const user = suffix === 'a' ? 'verify-sale-a' : 'verify-admin-b';
  for (const [index, state] of ['accepted', 'sent', 'sent', 'rejected', 'no_zalo', 'error'].entries()) {
    const id = `verify-auto-${suffix}-${index}`;
    await db.contact.upsert({ where: { id }, update: {}, create: { id, orgId, assignedUserId: user } });
    await db.friendshipAttempt.upsert({ where: { id }, update: { queuedAt: time }, create: { id, orgId, zaloAccountId: nick, contactId: id, state, queuedAt: time } });
  }
  const sessionId = `verify-auto-session-${suffix}`;
  await db.careSession.upsert({ where: { id: sessionId }, update: {}, create: {
    id: sessionId, orgId, contactId: `verify-auto-${suffix}-0`, nickId: nick, ownerUserId: user,
    sourceType: 'sequence_manual', interestWindowUntil: time, state: 'closed',
  } });
  for (const [index, eventType] of ['step_sent', 'step_sent', 'step_sent', 'reply'].entries()) {
    const id = `verify-auto-event-${suffix}-${index}`;
    await db.careSessionEvent.upsert({ where: { id }, update: { createdAt: time }, create: { id, sessionId, eventId: id, eventType, createdAt: time } });
  }
  const jobId = `verify-broadcast-job-${suffix}`;
  await db.broadcastJob.upsert({ where: { id: jobId }, update: {}, create: {
    id: jobId, orgId, createdById: user, name: 'VERIFY paused fixture', sourceType: 'friends', zaloAccountId: nick,
    messageText: 'FAKE NEVER SENT', scheduleType: 'once', status: 'paused',
  } });
  const runId = `verify-broadcast-run-${suffix}`;
  await db.broadcastRun.upsert({ where: { id: runId }, update: { startedAt: time }, create: {
    id: runId, jobId, orgId, status: 'done', startedAt: time, endedAt: time, sentCount: 3, failedCount: 1, skippedCount: 2,
  } });
}
const base = 'http://127.0.0.1:30571';
const login = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'verify-admin@example.test', password: 'VerifyLocalOnly-2026!' }) });
assert.equal(login.status, 200); const token = (await login.json()).token;
const checks: unknown[] = [];
for (const endpoint of ['automation-summary', 'broadcast']) {
  const r = await fetch(`${base}/api/v1/reports/${endpoint}?from=${day}&to=${day}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200); const b = await r.json();
  if (endpoint === 'automation-summary') {
    assert.equal(b.kpis.kbGui, 4); assert.equal(b.kpis.dongY, 1); assert.equal(b.kpis.noZalo, 1);
    assert.equal(b.kpis.tiLeDongYPct, 25); assert.equal(b.kpis.bdGui, 3); assert.equal(b.kpis.phanHoi, 1);
    assert.equal(b.kpis.tiLePhanHoiPct, 33.3);
    assert.deepEqual(b.bySale.map((s: any) => s.userId), ['verify-sale-a']);
    assert.deepEqual(b.byNick.map((s: any) => s.zaloAccountId), ['verify-nick-a']);
  } else {
    assert.equal(b.kpis.totalRuns, 1); assert.equal(b.kpis.totalSent, 3); assert.equal(b.kpis.totalFailed, 1);
    assert.equal(b.kpis.totalSkipped, 2); assert.equal(b.kpis.successRatePct, 75);
    assert.deepEqual(b.byNick.map((s: any) => s.zaloAccountId), ['verify-nick-a']);
    assert.equal(b.recentRuns[0].runId, 'verify-broadcast-run-a');
  }
  checks.push({ endpoint, status: 'PASS', kpis: b.kpis });
}
await writeFile(resolve('../artifacts/reports-mobile-5b-fix2-2026-11-02/automation-broadcast-db-results.json'), JSON.stringify({ day, checks }, null, 2));
console.log(JSON.stringify({ day, checks }));
await db.$disconnect();
