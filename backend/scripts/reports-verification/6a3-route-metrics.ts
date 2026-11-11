// 6A rerun: per-route timing windows after fixture/setup. Each route is called alone with idle
// gaps so PostgreSQL statement logs (app role: log_min_duration_statement=0) can be attributed
// to one request. Local test data only; not an SLA.
import { writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:55499';
const artifactDir = process.env.REPORTS_6A_ARTIFACT_DIR;
if (!artifactDir) throw new Error('REPORTS_6A_ARTIFACT_DIR required');
const password = '6A-local-fixture-only-20261102';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function login(email: string) {
  const r = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (r.status !== 200) throw new Error(`login ${email} ${r.status}`);
  return (await r.json()).token as string;
}

const period = '?from=2026-11-01&to=2026-11-01';
const routes = ['overview', 'nick-fleet', 'sales-performance', 'crm-usage', 'pipeline', 'lead-pool', 'automation-summary', 'broadcast', 'engagement', 'audit', 'ai'];
const windows: { role: string; route: string; run: number; start: string; end: string; status: number; httpMs: number }[] = [];
for (const [role, email] of [['admin', '6a-admin-a@example.invalid'], ['leader', '6a-leader-a@example.invalid']] as const) {
  const token = await login(email);
  await sleep(800);
  for (const route of routes) {
    for (let run = 1; run <= 3; run++) {
      const start = new Date().toISOString();
      const t0 = performance.now();
      const r = await fetch(`${base}/api/v1/reports/${route}${period}`, { headers: { authorization: `Bearer ${token}` } });
      await r.arrayBuffer();
      const httpMs = Math.round((performance.now() - t0) * 100) / 100;
      const end = new Date().toISOString();
      windows.push({ role, route, run, start, end, status: r.status, httpMs });
      await sleep(400);
    }
  }
}
await writeFile(`${artifactDir}\\route-metric-windows.json`, JSON.stringify({ period, windows }, null, 1));
console.log(`WINDOWS ${windows.length}`);
