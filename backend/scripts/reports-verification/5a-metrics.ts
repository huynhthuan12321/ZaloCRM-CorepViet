// Disposable database only. Fake fixtures; real JWT login, HTTP and PostgreSQL.
import { Client } from 'pg';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const db = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify' });
await db.connect();
assert.equal((await db.query('SELECT current_database() AS db')).rows[0].db, 'reports_1b_verify');
const now = new Date();
const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const yesterday = new Date(new Date(`${today}T00:00:00+07:00`).getTime() - 86400000 + 7 * 3600000).toISOString().slice(0, 10);
const previous = new Date(new Date(`${yesterday}T00:00:00+07:00`).getTime() - 86400000 + 7 * 3600000).toISOString().slice(0, 10);
const checks: { name: string; status: string; details?: unknown }[] = [];
async function check(name: string, fn: () => Promise<unknown>) {
  try { checks.push({ name, status: 'PASS', details: await fn() }); }
  catch (error: any) { checks.push({ name, status: 'FAIL', details: error.message }); }
}
// Idempotent upserts touch only the explicitly named synthetic fixture rows.
for (const [id, org, user, time] of [
  ['a1', 'verify-org-a', 'verify-sale-a', `${yesterday}T09:00:00+07:00`],
  ['a2', 'verify-org-a', 'verify-sale-a', `${yesterday}T09:10:00+07:00`],
  ['a3', 'verify-org-a', 'verify-sale-a', `${yesterday}T10:00:00+07:00`],
  ['prev1', 'verify-org-a', 'verify-sale-a', `${previous}T09:00:00+07:00`],
  ['prev2', 'verify-org-a', 'verify-sale-a', `${previous}T09:20:00+07:00`],
  ['outside-dept', 'verify-org-a', 'verify-sale-b', `${yesterday}T09:00:00+07:00`],
  ['outside-org', 'verify-org-b', 'verify-admin-b', `${yesterday}T09:00:00+07:00`],
  ['today', 'verify-org-a', 'verify-sale-a', `${today}T09:00:00+07:00`],
  ['future', 'verify-org-a', 'verify-sale-b', new Date(now.getTime() + 2 * 86400000).toISOString()],
]) {
  await db.query(`INSERT INTO activity_logs (id,org_id,user_id,actor_type,category,action,created_at)
    VALUES ($1,$2,$3,'user','customer_info','VERIFY_METRIC',$4)
    ON CONFLICT (id) DO UPDATE SET created_at=EXCLUDED.created_at`, [`verify-metric-${id}`, org, user, new Date(time).toISOString()]);
}
for (const [id, org, event, time] of [
  ['ok1', 'verify-org-a', 'step_sent', new Date(now.getTime() - 100000)],
  ['ok2', 'verify-org-a', 'step_sent', new Date(now.getTime() - 90000)],
  ['bad', 'verify-org-a', 'send_failed', new Date(now.getTime() - 80000)],
  ['foreign', 'verify-org-b', 'send_failed', new Date(now.getTime() - 80000)],
  ['future', 'verify-org-a', 'send_failed', new Date(now.getTime() + 2 * 86400000)],
] as const) {
  await db.query(`INSERT INTO automation_event_log (id,org_id,event_type,created_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (id) DO UPDATE SET created_at=EXCLUDED.created_at`, [`verify-metric-${id}`, org, event, time.toISOString()]);
}
const base = 'http://127.0.0.1:30571';
const login = async (id: string) => {
  const r = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${id}@example.test`, password: 'VerifyLocalOnly-2026!' }) });
  assert.equal(r.status, 200); return (await r.json()).token as string;
};
const leader = await login('verify-leader'), admin = await login('verify-admin');
const get = async (path: string, token = leader) => {
  const r = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200, path); return r.json();
};
await check('Concurrent org A/B overview raw aggregates remain isolated with real login JWTs', async () => {
  const foreign = await login('verify-admin-b');
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => get(`/api/v1/reports/overview?from=${today}&to=${today}`, i % 2 ? foreign : admin)));
  responses.forEach((b, i) => assert.equal(b.kpis.msgToday, i % 2 ? 2 : 8));
  return { requests: 8, orgAMessages: 8, orgBMessages: 2 };
});
await check('CRM yesterday session estimate, module totals, comparison and department/org isolation', async () => {
  const b = await get(`/api/v1/reports/crm-usage?from=${yesterday}&to=${yesterday}`);
  assert.equal(b.kpis.totalActions, 3);
  assert.deepEqual(b.bySale.map((s: any) => s.userId), ['verify-sale-a']);
  assert.equal(b.bySale[0].avgActiveMinPerDay, 15); // 10 minutes + a separate 5-minute floor session
  assert.equal(b.moduleUsage[0].actions, 3); assert.equal(b.moduleUsage[0].pct, 100);
  assert.equal(b.dailySeries[0].points[0].min, 15);
  assert.equal(b.compare[0].prevActions, 2); assert.equal(b.compare[0].prevAvgMin, 20);
  assert.equal(b.availability.outcomes.status, 'unavailable');
  return { actions: b.kpis.totalActions, minutes: b.bySale[0].avgActiveMinPerDay, previousMinutes: b.compare[0].prevAvgMin };
});
await check('CRM activeSalesToday is a current snapshot even when a historical period is selected', async () => {
  const b = await get(`/api/v1/reports/crm-usage?from=${yesterday}&to=${yesterday}`);
  const expected = (await db.query(`SELECT count(DISTINCT user_id)::int AS n FROM activity_logs
    WHERE org_id='verify-org-a' AND actor_type='user' AND user_id IN ('verify-leader','verify-sale-a','verify-member')
    AND created_at >= $1 AND created_at < $2`, [new Date(`${today}T00:00:00+07:00`).toISOString(), new Date().toISOString()])).rows[0].n;
  assert.ok(expected >= 1); assert.equal(b.kpis.activeSalesToday, expected);
  return { expected, actual: b.kpis.activeSalesToday };
});
await check('Audit counts exclude future events and other org; 24h error rate matches SQL oracle', async () => {
  const b = await get(`/api/v1/reports/audit?from=${today}&to=${today}`, admin);
  const end = new Date(b.timeWindows.rolling24h.end), start = new Date(b.timeWindows.rolling24h.start);
  const expected = (await db.query(`SELECT count(*)::int AS n FROM activity_logs
    WHERE org_id='verify-org-a' AND created_at >= $1 AND created_at < $2`, [new Date(`${today}T00:00:00+07:00`).toISOString(), end.toISOString()])).rows[0].n;
  assert.equal(b.kpis.changesToday, expected);
  const events = (await db.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE event_type ILIKE '%failed%')::int AS failed
    FROM automation_event_log WHERE org_id='verify-org-a' AND created_at >= $1 AND created_at < $2`, [start.toISOString(), end.toISOString()])).rows[0];
  assert.equal(b.systemHealth.errorRate24h, Math.round(events.failed / events.n * 1000) / 10);
  assert.ok(!b.activity.some((a: any) => a.id === 'verify-metric-future' || a.id === 'verify-metric-outside-org'));
  assert.equal(b.kpis.queueWaiting, null); assert.equal(b.availability.queueDepth.status, 'unavailable');
  return { changesToday: expected, events: events.n, errorRate24h: b.systemHealth.errorRate24h };
});
await check('Audit is forbidden to department leader', async () => {
  const r = await fetch(base + '/api/v1/reports/audit', { headers: { authorization: `Bearer ${leader}` } });
  assert.equal(r.status, 403); return r.status;
});
await check('Automation summary works on PostgreSQL/RLS and empty denominator is unavailable', async () => {
  const b = await get(`/api/v1/reports/automation-summary?from=${today}&to=${today}`, admin);
  assert.equal(b.kpis.tiLeDongYPct, null); assert.equal(b.kpis.tiLePhanHoiPct, null);
  assert.equal(b.availability.tiLeDongYPct.status, 'unavailable'); return b.kpis;
});
await check('Broadcast works on PostgreSQL/RLS and empty denominator is unavailable', async () => {
  const b = await get(`/api/v1/reports/broadcast?from=${today}&to=${today}`, admin);
  assert.equal(b.kpis.successRatePct, null); return b.kpis;
});
const appDb = new Client({ connectionString: 'postgresql://reports_verify_app@127.0.0.1:55471/reports_1b_verify' });
await appDb.connect();
await check('Messages RLS enabled and forced under non-bypass app role', async () => {
  const rows = (await appDb.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='messages'::regclass`)).rows;
  assert.deepEqual(rows, [{ relrowsecurity: true, relforcerowsecurity: true }]); return rows;
});
await check('Messages RLS rejects cross-org write; same-org write is rolled back', async () => {
  await appDb.query('BEGIN');
  try {
    await appDb.query("SELECT set_config('app.current_org','verify-org-a',true)");
    assert.equal((await appDb.query("UPDATE messages SET content=content WHERE id='verify-main-in'")).rowCount, 1);
    await appDb.query('SAVEPOINT negative');
    try {
      await appDb.query("UPDATE messages SET org_id='verify-org-b' WHERE id='verify-main-in'");
      assert.fail('cross-org update accepted');
    } catch (e: any) { assert.equal(e.code, '42501'); }
    return { sameOrgRows: 1, crossOrgSqlState: '42501', rolledBack: true };
  } finally { await appDb.query('ROLLBACK'); }
});
await check('Messages RLS denies insert when no tenant context exists', async () => {
  await appDb.query('BEGIN');
  try {
    try {
      await appDb.query(`INSERT INTO messages (id,org_id,conversation_id,sender_type,content,sent_at)
        VALUES ('verify-denied-write','verify-org-a','verify-main','contact','FAKE',CURRENT_TIMESTAMP)`);
      assert.fail('no-tenant insert accepted');
    } catch (e: any) { assert.equal(e.code, '42501'); }
    return { sqlState: '42501', rolledBack: true };
  } finally { await appDb.query('ROLLBACK'); }
});
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://reports_verify_app@127.0.0.1:55471/reports_1b_verify';
process.env.RLS_SET_CONFIG = 'true';
process.env.TENANT_GUARD_MODE = 'enforce';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
const { prisma, tenantTransaction } = await import('../../src/shared/database/prisma-client.js');
const { withTenant } = await import('../../src/shared/tenant/tenant-context.js');
await check('Interactive tenantTransaction keeps raw and model queries on the tenant connection', async () => {
  const result = await withTenant('verify-org-b', () => tenantTransaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM messages`;
    const models = await tx.message.count();
    return { raw: Number(rows[0].n), models };
  }));
  assert.deepEqual(result, { raw: 2, models: 2 }); return result;
});
await check('Raw Prisma aggregates without tenant remain fail-closed after scoped queries', async () => {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM messages`;
  assert.equal(Number(rows[0].n), 0); return { rows: 0 };
});
await prisma.$disconnect();
await appDb.end(); await db.end();
await writeFile(resolve('../artifacts/reports-mobile-5a-2026-11-02/metrics-results.json'), JSON.stringify({ today, yesterday, previous, checks }, null, 2));
console.log(JSON.stringify({ checks, passed: checks.filter(c => c.status === 'PASS').length, failed: checks.filter(c => c.status === 'FAIL').length }));
