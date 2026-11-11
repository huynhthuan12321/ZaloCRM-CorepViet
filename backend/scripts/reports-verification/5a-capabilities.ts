// Read-only report capability checks against the isolated 5A HTTP harness.
// Login tokens stay in memory; no app bootstrap or outbound integrations.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:30571';
const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const endpoints = ['overview', 'nick-fleet', 'sales-performance', 'crm-usage', 'pipeline', 'lead-pool', 'automation-summary', 'broadcast', 'engagement', 'audit', 'ai'];
const adminOnly = new Set(['automation-summary', 'broadcast', 'audit']);
const checks: Array<{ user: string; endpoint: string; expected: number; actual: number; status: string }> = [];
for (const [user, access] of [['verify-ai-admin', 'admin'], ['verify-ai-leader', 'leader'], ['verify-ai-member', 'member']] as const) {
  const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${user}@example.test`, password: 'VerifyLocalOnly-2026!' }) });
  assert.equal(login.status, 200);
  const token = (await login.json()).token;
  assert.ok(token);
  for (const endpoint of endpoints) {
    const expected = access === 'admin' || (access === 'leader' && !adminOnly.has(endpoint)) ? 200 : 403;
    const response = await fetch(`${base}/api/v1/reports/${endpoint}?from=${day}&to=${day}`, { headers: { authorization: `Bearer ${token}` } });
    checks.push({ user, endpoint, expected, actual: response.status, status: response.status === expected ? 'PASS' : 'FAIL' });
    await response.arrayBuffer();
  }
}
const failed = checks.filter(c => c.status === 'FAIL').length;
await writeFile('../artifacts/reports-mobile-5a-2026-11-02/capabilities-results.json', JSON.stringify({ time: new Date().toISOString(), target: base, categoryCount: 9, endpointCount: endpoints.length, passed: checks.length - failed, failed, checks }, null, 2));
console.log(`CAPABILITIES ${checks.length - failed}/${checks.length} PASS`);
assert.equal(failed, 0);
