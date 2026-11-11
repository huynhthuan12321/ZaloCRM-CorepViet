import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

export async function runChecks(app: FastifyInstance) {
  const checks: { name: string; status: 'PASS' | 'FAIL'; details?: unknown }[] = [];
  const check = async (name: string, fn: () => Promise<unknown>) => {
    try { checks.push({ name, status: 'PASS', details: await fn() }); }
    catch (e: any) { checks.push({ name, status: 'FAIL', details: String(e.message).slice(0, 1000) }); }
  };
  const base = 'http://127.0.0.1:30571';
  const day = new Date().toISOString().slice(0, 10);
  const post = async (path: string, body: unknown, token?: string) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const get = async (path: string, token?: string) => fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  let leaderToken = '', adminToken = '';
  await check('JWT login uses real password verification and real DB', async () => {
    const r = await post('/api/v1/auth/login', { email: 'verify-leader@example.test', password: 'VerifyLocalOnly-2026!' });
    assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.user.id, 'verify-leader'); assert.ok(b.token); leaderToken = b.token;
    const claims = app.jwt.verify<any>(leaderToken); assert.equal(claims.typ, 'access'); assert.equal(claims.orgId, 'verify-org-a');
    return { status: r.status, typ: claims.typ, orgId: claims.orgId };
  });
  await check('Admin login', async () => {
    const r = await post('/api/v1/auth/login', { email: 'verify-admin@example.test', password: 'VerifyLocalOnly-2026!' });
    assert.equal(r.status, 200); adminToken = (await r.json()).token; return { status: r.status };
  });
  await check('Missing JWT is 401', async () => { const r = await get('/api/v1/analytics/response-time'); assert.equal(r.status, 401); return r.status; });
  await check('Forged JWT is 401', async () => {
    const forged = app.jwt.sign({ id: 'verify-leader', orgId: 'verify-org-a' }).split('.'); forged[2] = 'x'.repeat(forged[2].length);
    const r = await get('/api/v1/analytics/response-time', forged.join('.')); assert.equal(r.status, 401); return r.status;
  });
  await check('Expired JWT is 401', async () => {
    const token = app.jwt.sign({ id: 'verify-leader', orgId: 'verify-org-a', exp: Math.floor(Date.now()/1000)-10 });
    const r = await get('/api/v1/analytics/response-time', token); assert.equal(r.status, 401); return r.status;
  });
  // Login is independently tested above. If blocked, use an in-memory correctly
  // signed fixture token to test jwtVerify + report middleware without bypassing
  // them. This is not evidence of a successful login flow.
  const tokenSource = leaderToken ? 'actual-login' : 'test-signed-fixture-after-login-failure';
  if (!leaderToken) leaderToken = app.jwt.sign({ id: 'verify-leader', orgId: 'verify-org-a', role: 'member', typ: 'access', tv: 0 }, { expiresIn: '15m' });
  if (!adminToken) adminToken = app.jwt.sign({ id: 'verify-admin', orgId: 'verify-org-a', role: 'admin', typ: 'access', tv: 0 }, { expiresIn: '15m' });
  await check('Valid signed JWT reaches report route with real DB membership', async () => {
    const r = await get(`/api/v1/analytics/response-time?from=${day}&to=${day}`, leaderToken);
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); return { status: r.status, tokenSource };
  });
  const config = { metrics: ['messages_received'], groupBy: 'user', dateRange: { from: day, to: day } };
  await check('F1 direct custom under real RLS counts two main inbound messages', async () => {
    assert.ok(leaderToken, 'login prerequisite failed'); const r = await post('/api/v1/analytics/custom', config, leaderToken); const b = await r.json();
    assert.equal(r.status, 200); assert.deepEqual(b.datasets?.[0]?.data, [2]); return b;
  });
  await check('F1 saved custom under real RLS counts two main inbound messages', async () => {
    assert.ok(leaderToken, 'login prerequisite failed'); const r = await post('/api/v1/saved-reports/verify-saved/run', {}, leaderToken); const b = await r.json();
    assert.equal(r.status, 200); assert.deepEqual(b.datasets?.[0]?.data, [2]); return b;
  });
  await check('F2 real ORM query splits main and shared counters', async () => {
    assert.ok(leaderToken, 'login prerequisite failed'); const r = await get(`/api/v1/analytics/response-time?from=${day}&to=${day}`, leaderToken); const b = await r.json();
    assert.equal(r.status, 200); assert.equal(b.mainPending, 1); assert.equal(b.sharedPending, 1); assert.equal(b.mainUnattributed, 0); assert.equal(b.sharedUnattributed, 1); assert.equal(b.overall, 60); return b;
  });
  const db = new Client({ connectionString: 'postgresql://reports_verify_app@127.0.0.1:55471/reports_1b_verify' }); await db.connect();
  await check('RLS no tenant returns no users', async () => { const r = await db.query('SELECT id FROM users'); assert.equal(r.rowCount, 0); return { rows: r.rowCount }; });
  await check('RLS org A cannot see org B conversations', async () => {
    await db.query('BEGIN'); try { await db.query("SELECT set_config('app.current_org','verify-org-a',true)"); const r = await db.query('SELECT DISTINCT org_id FROM conversations'); assert.deepEqual(r.rows, [{ org_id: 'verify-org-a' }]); return r.rows; } finally { await db.query('ROLLBACK'); }
  });
  await check('RLS org A cannot read org B messages without application predicates', async () => {
    await db.query('BEGIN'); try { await db.query("SELECT set_config('app.current_org','verify-org-a',true)"); const r = await db.query("SELECT id, org_id FROM messages WHERE org_id='verify-org-b'"); assert.equal(r.rowCount, 0, 'foreign messages readable because messages RLS is not enabled'); return { rows: r.rowCount }; } finally { await db.query('ROLLBACK'); }
  });
  await check('RLS rejects cross-org conversation write', async () => {
    await db.query('BEGIN'); try { await db.query("SELECT set_config('app.current_org','verify-org-a',true)"); try { await db.query("UPDATE conversations SET org_id='verify-org-b' WHERE id='verify-main'"); assert.fail('cross-org update was accepted'); } catch (e: any) { assert.equal(e.code, '42501'); return { sqlState: e.code }; } } finally { await db.query('ROLLBACK'); }
  });
  await check('RLS no tenant also hides all messages', async () => {
    const r = await db.query('SELECT count(*)::int AS n FROM messages'); assert.equal(r.rows[0].n, 0, 'messages lack fail-closed RLS without a tenant'); return r.rows;
  });
  await check('Real JWT cross-org claim mismatch cannot authorize org B as leader A', async () => {
    const token = app.jwt.sign({ id: 'verify-leader', orgId: 'verify-org-b', role: 'owner', typ: 'access', tv: 0 }, { expiresIn: '15m' });
    const r = await get('/api/v1/analytics/response-time', token); assert.equal(r.status, 403); return r.status;
  });
  await db.end();
  await writeFile(resolve('../artifacts/reports-mobile-5a-2026-11-02/results.json'), JSON.stringify({ target: base, tokenSource, database: 'new loopback-only PostgreSQL container, app role NOSUPERUSER NOBYPASSRLS', checks }, null, 2));
  console.log(JSON.stringify({ checks: checks.map(c => ({ name: c.name, status: c.status })), passed: checks.filter(c => c.status === 'PASS').length, failed: checks.filter(c => c.status === 'FAIL').length }));
}

