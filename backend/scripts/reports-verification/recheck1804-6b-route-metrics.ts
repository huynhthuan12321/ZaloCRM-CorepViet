// 6B lần 3 — group I: per-route query count/time on the disposable DB (not an SLA). Each route is called
// 3 times with idle gaps; app-role statements are attributed by the server-side log timestamps.
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const OUT = process.env.REPORTS_6B_ARTIFACT_DIR!;
const BASE = 'http://127.0.0.1:55542';
const D = process.argv[2];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const login = async (id: string) => (await (await fetch(BASE + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${id}@example.invalid`, password: process.env.REPORTS_FIXTURE_PASSWORD! }) })).json()).token as string;
const tokens = { admX: await login('6b-u-adm-x'), leadS: await login('6b-u-lead-s') };
const routes = ['overview', 'sales-performance', 'ai', 'export?type=messages', 'export?type=contacts', 'export?type=appointments', 'messages', 'contacts', 'appointments'];
const windows: { who: string; route: string; run: number; start: string; end: string; status: number; httpMs: number }[] = [];
await sleep(1500);
for (const who of ['admX', 'leadS'] as const) for (const route of routes) for (let run = 1; run <= 3; run++) {
  const start = new Date();
  const t0 = performance.now();
  const r = await fetch(`${BASE}/api/v1/reports/${route}${route.includes('?') ? '&' : '?'}from=${D}&to=${D}`, { headers: { authorization: `Bearer ${tokens[who]}` } });
  await r.arrayBuffer();
  const httpMs = Math.round((performance.now() - t0) * 10) / 10;
  windows.push({ who, route, run, start: start.toISOString(), end: new Date().toISOString(), status: r.status, httpMs });
  await sleep(400);
}
await sleep(1000);
const dl = spawnSync('docker', ['logs', '--since', windows[0].start, 'reports-6b3-verify-20261102'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const lines = (dl.stdout + dl.stderr).split(/\r?\n/);
type Stmt = { t: number; pid: string; text: string; ms: number };
const stmts: Stmt[] = [];
const pending = new Map<string, Stmt>();
for (const line of lines) {
  const m = /^(\S+ \S+) UTC \[(\d+)\] LOG:  (execute [^:]*|statement): (.*)$/.exec(line);
  if (m) { const st = { t: Date.parse(m[1].replace(' ', 'T') + 'Z'), pid: m[2], text: m[4], ms: 0 }; stmts.push(st); pending.set(m[2], st); continue; }
  const d = /^\S+ \S+ UTC \[(\d+)\] LOG:  duration: ([\d.]+) ms/.exec(line);
  if (d) { const st = pending.get(d[1]); if (st) { st.ms = Number(d[2]); pending.delete(d[1]); } }
}
const isWork = (x: Stmt) => !/set_config|^BEGIN|^COMMIT|^ROLLBACK|^SELECT 1\b/i.test(x.text);
const median = (a: number[]) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)]; };
const rows: Record<string, unknown>[] = [];
for (const who of ['admX', 'leadS']) for (const route of routes) {
  const per = windows.filter(w => w.who === who && w.route === route).map(w => {
    const a = Date.parse(w.start) - 5, b = Date.parse(w.end) + 5;
    const inW = stmts.filter(x => x.t >= a && x.t <= b);
    const work = inW.filter(isWork);
    return { q: work.length, setConfig: inW.filter(x => /set_config/.test(x.text)).length, dbMs: Math.round(work.reduce((s, x) => s + x.ms, 0) * 100) / 100, maxStmtMs: Math.max(0, ...work.map(x => x.ms)), httpMs: w.httpMs, status: w.status };
  });
  rows.push({ who, route, status: per.map(p => p.status), q: per.map(p => p.q), setConfig: median(per.map(p => p.setConfig)), medianHttpMs: median(per.map(p => p.httpMs)), medianDbMs: median(per.map(p => p.dbMs)), maxStmtMs: Math.max(...per.map(p => p.maxStmtMs)) });
}
await writeFile(resolve(OUT, 'route-metrics.json'), JSON.stringify({ time: new Date().toISOString(), note: 'local disposable DB, tiny fixture; q = app-role execute statements excluding set_config/BEGIN/COMMIT, incl. auth middleware lookups; not an SLA', statementsParsed: stmts.length, windows, rows }, null, 1));
for (const r of rows) console.log(JSON.stringify(r));
