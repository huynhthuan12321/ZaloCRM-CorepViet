// Additional evidence for the inherited UTC-day fixture assumption. No writes.
import { Client } from 'pg';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const db = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify' });
await db.connect();
assert.equal((await db.query('SELECT current_database() AS db')).rows[0].db, 'reports_1b_verify');
const root = '../artifacts/reports-mobile-5a-2026-11-02';
const fixture = JSON.parse(await readFile(`${root}/db-setup.json`, 'utf8'));
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const start = new Date(`${today}T00:00:00+07:00`);
const now = new Date();
const results = [];
try {
  for (const [id, orgId, historical] of [['verify-admin','verify-org-a',8], ['verify-admin-b','verify-org-b',2]] as const) {
    const login = await fetch('http://127.0.0.1:30571/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${id}@example.test`, password: 'VerifyLocalOnly-2026!' }) });
    assert.equal(login.status, 200); const token = (await login.json()).token;
    const measured = (await db.query('SELECT count(*)::int AS n FROM messages WHERE org_id=$1 AND sent_at >= $2 AND sent_at <= $3', [orgId, start, now])).rows[0].n;
    const stored = (await db.query('SELECT count(*)::int AS n FROM messages WHERE org_id=$1 AND (sent_at + INTERVAL \'7 hours\')::date=$2::date', [orgId, fixture.day])).rows[0].n;
    assert.equal(stored, historical);
    for (const day of [today, fixture.day]) {
      const response = await fetch(`http://127.0.0.1:30571/api/v1/reports/overview?from=${day}&to=${day}`, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200); const body = await response.json();
      assert.equal(body.kpis.msgToday, measured);
      results.push({ name: `${orgId}: selected ${day}; today KPI follows VN today, not historical fixture`, status: 'PASS', measuredToday: measured, storedOnFixtureDay: stored });
    }
  }
  await writeFile(`${root}/overview-oracle-results.json`, JSON.stringify({ time: new Date().toISOString(), today, fixtureDay: fixture.day, passed: results.length, failed: 0, results, explanation: 'Inherited metrics check expected 8/2 today, but base fixture day is yesterday in VN. Keep original 11/12 result; this read-only DB oracle explains the mismatch without changing runtime or old evidence.' }, null, 2));
  console.log(`OVERVIEW_ORACLE_PASS ${results.length}/${results.length}`);
} finally { await db.end(); }
