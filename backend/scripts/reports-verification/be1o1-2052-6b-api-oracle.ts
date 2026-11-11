// 6B lần 3 — independent SQL oracle (owner, read-only queries) vs real HTTP/JWT API (app role harness).
// Expected values are computed here from raw tables; nothing is imported from report implementation
// or copied from 6A helpers. A small hand-count table cross-checks the oracle itself.
import pg from 'pg';
import ExcelJS from 'exceljs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

pg.defaults.parseInputDatesAsUTC = true;
if (new Date(0).getTimezoneOffset() !== 0) throw new Error('Run with TZ=UTC.');
const OUT = process.env.REPORTS_6B_ARTIFACT_DIR!;
const BASE = 'http://127.0.0.1:55572';
const PASSWORD = process.env.REPORTS_FIXTURE_PASSWORD!;
const X = '6b-org-x', Y = '6b-org-y';
const owner = new pg.Client({ connectionString: 'postgresql://postgres@127.0.0.1:55571/reports_be1o1_verify', application_name: '6b-oracle' });
await owner.connect();
const sql = async (text: string, params: unknown[] = []) => (await owner.query(text, params)).rows;
const one = async (text: string, params: unknown[] = []) => (await sql(text, params))[0];
const num = (v: unknown) => Number(v ?? 0);

const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const T = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const D = addDays(T, -1), DM1 = addDays(T, -2), T1 = addDays(T, 1);

type Check = { group: string; name: string; expected: unknown; actual: unknown; pass: boolean; note?: string };
const checks: Check[] = [];
// Deep equality that ignores object key order (attempt 1 compared JSON strings and failed on key order only).
const canon = (x: unknown): unknown => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' && !(x instanceof Date) ? Object.fromEntries(Object.keys(x as object).sort().map(k => [k, canon((x as any)[k])])) : x;
const eq = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const check = (group: string, name: string, expected: unknown, actual: unknown, note?: string) => { checks.push({ group, name, expected, actual, pass: eq(expected, actual), note }); };

// ---------- HTTP ----------
const tokens: Record<string, string> = {};
const http = async (path: string, who?: string, method = 'GET', body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: { ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await r.json() : ct.includes('spreadsheet') ? Buffer.from(await r.arrayBuffer()) : await r.text();
  return { status: r.status, data: data as any, ct, disposition: r.headers.get('content-disposition') };
};
const viewers = { admX: '6b-u-adm-x', leadS: '6b-u-lead-s', depS1: '6b-u-dep-s1', leadM: '6b-u-lead-m', saleS1a: '6b-u-sale-s1a', depMnoGrant: '6b-u-dep-m-nogrant', admY: '6b-u-adm-y', saleY: '6b-u-sale-y' } as const;
type Viewer = keyof typeof viewers;
for (const [k, id] of Object.entries(viewers)) {
  const r = await http('/api/v1/auth/login', undefined, 'POST', { email: `${id}@example.invalid`, password: PASSWORD });
  check('auth', `login ${k}`, 200, r.status);
  tokens[k] = r.data?.token;
}

// ---------- Scope oracle (SQL over departments/paths; independent of report-scope.ts) ----------
type Scope = { org: string; users: string[] | null; accounts: string[] | null; readable: string[] | null };
async function scopeOf(v: Viewer): Promise<Scope> {
  const uid = viewers[v];
  const u = await one(`SELECT org_id, role FROM users WHERE id=$1`, [uid]);
  if (u.role === 'admin' || u.role === 'owner') return { org: u.org_id, users: null, accounts: null, readable: null };
  const users = (await sql(`WITH me AS (SELECT d.path FROM department_members dm JOIN departments d ON d.id=dm.department_id WHERE dm.user_id=$1)
    SELECT DISTINCT u.id FROM users u JOIN department_members dm ON dm.user_id=u.id JOIN departments d ON d.id=dm.department_id, me
    WHERE u.org_id=$2 AND d.org_id=$2 AND left(d.path, length(me.path)) = me.path UNION SELECT $1 ORDER BY 1`, [uid, u.org_id])).map(r => r.id);
  const accounts = (await sql(`SELECT id FROM zalo_accounts WHERE org_id=$1 AND owner_user_id = ANY($2) AND (archived_at IS NULL OR zalo_uid IS NOT NULL) ORDER BY id`, [u.org_id, users])).map(r => r.id);
  const granted = (await sql(`SELECT a.zalo_account_id id FROM zalo_account_access a JOIN zalo_accounts z ON z.id=a.zalo_account_id WHERE a.user_id=$1 AND z.org_id=$2 AND (z.archived_at IS NULL OR z.zalo_uid IS NOT NULL)`, [uid, u.org_id])).map(r => r.id);
  return { org: u.org_id, users, accounts, readable: [...new Set([...accounts, ...granted])].sort() };
}
const scopes: Record<string, Scope> = {};
for (const v of ['admX', 'leadS', 'depS1', 'leadM', 'admY'] as Viewer[]) scopes[v] = await scopeOf(v);
const vnStart = (date: string) => `${date}T00:00:00.000+07:00`;
const S = vnStart(D), E = vnStart(T);           // timestamp bounds for D, converted to UTC by ::timestamptz AT TIME ZONE 'UTC'
const B = (iso: string) => `(${'$'}${iso}::timestamptz AT TIME ZONE 'UTC')`;
void B;
const ts = (iso: string) => new Date(iso);       // pg sends as UTC text (parseInputDatesAsUTC)

// ---------- Oracle per scope ----------
async function overviewOracle(s: Scope) {
  const p = [s.org, s.users];
  const total = num((await one(`SELECT count(*) n FROM contacts WHERE org_id=$1 AND merged_into IS NULL AND ($2::text[] IS NULL OR assigned_user_id=ANY($2))`, p)).n);
  const newC = num((await one(`SELECT count(*) n FROM contacts WHERE org_id=$1 AND merged_into IS NULL AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) AND created_at >= $3 AND created_at < $4`, [...p, ts(S), ts(E)])).n);
  const prevC = num((await one(`SELECT count(*) n FROM contacts WHERE org_id=$1 AND merged_into IS NULL AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) AND created_at >= $3 AND created_at < $4`, [...p, ts(vnStart(DM1)), ts(S)])).n);
  const nick = await one(`SELECT count(*) total, count(*) FILTER (WHERE status='connected') online FROM zalo_accounts WHERE org_id=$1 AND archived_at IS NULL AND ($2::text[] IS NULL OR id=ANY($2))`, [s.org, s.accounts]);
  const apptToday = num((await one(`SELECT count(*) n FROM appointments WHERE org_id=$1 AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) AND appointment_date >= $3::date AND appointment_date < $4::date`, [...p, T, T1])).n);
  const apptDone = num((await one(`SELECT count(*) n FROM appointments WHERE org_id=$1 AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) AND status='completed' AND appointment_date >= $3::date AND appointment_date < $4::date`, [...p, D, T])).n);
  const lpw = num((await one(`SELECT count(*) n FROM lead_requests WHERE org_id=$1 AND release_reason IS NULL AND ($2::text[] IS NULL OR requested_by_user_id=ANY($2))`, p)).n);
  const today = await one(`SELECT count(*) FILTER (WHERE m.sender_type IN ('self','contact')) n, count(*) FILTER (WHERE m.sender_type='self' AND m.sent_via='automation') bot
    FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND c.zalo_account_id IS NOT NULL AND ($2::text[] IS NULL OR c.zalo_account_id=ANY($2))
    AND NOT c.is_virtual AND c."threadType"='user' AND NOT m.is_local AND NOT m.is_deleted AND coalesce(m.metadata->>'dryRun','false')<>'true' AND coalesce(m.metadata->>'test','false')<>'true'
    AND m.sent_at >= $3 AND m.sent_at < $4`, [s.org, s.accounts, ts(vnStart(T)), ts(vnStart(T1))]);
  const funnel = (await sql(`SELECT st.name status, count(c.id)::int count FROM statuses st LEFT JOIN contacts c ON c.status_id=st.id AND c.merged_into IS NULL AND ($2::text[] IS NULL OR c.assigned_user_id=ANY($2)) WHERE st.org_id=$1 GROUP BY st.name, st."order" ORDER BY st."order"`, p));
  return { totalContacts: total, newContacts: newC, newContactsDelta: newC - prevC, nicksTotal: num(nick.total), nicksOnline: num(nick.online), nicksNeedRelogin: num(nick.total) - num(nick.online), apptToday, apptDone, leadPoolWaiting: lpw, msgToday: num(today.n), msgByBot: num(today.bot), funnel };
}
async function salesOracle(s: Scope) {
  const users = (await sql(`SELECT id FROM users WHERE org_id=$1 AND is_active AND ($2::text[] IS NULL OR id=ANY($2)) ORDER BY id`, [s.org, s.users])).map(r => r.id);
  const per: Record<string, { contacts: number; sent: number; apptDone: number; apptNoShow: number; leadPoolUsed: number }> = {};
  for (const id of users) {
    const contacts = num((await one(`SELECT count(*) n FROM contacts WHERE org_id=$1 AND merged_into IS NULL AND assigned_user_id=$2`, [s.org, id])).n);
    const sent = num((await one(`SELECT count(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND ($2::text[] IS NULL OR c.zalo_account_id=ANY($2)) AND c.zalo_account_id IS NOT NULL
      AND NOT c.is_virtual AND c."threadType"='user' AND m.sender_type='self' AND m.sent_via IN ('user','user_native') AND NOT m.is_local AND NOT m.is_deleted
      AND coalesce(m.metadata->>'dryRun','false')<>'true' AND coalesce(m.metadata->>'test','false')<>'true' AND m.replied_by_user_id=$3 AND m.sent_at >= $4 AND m.sent_at < $5`, [s.org, s.accounts, id, ts(S), ts(E)])).n);
    const ap = await one(`SELECT count(*) FILTER (WHERE status='completed') done, count(*) FILTER (WHERE status='no_show') ns FROM appointments WHERE org_id=$1 AND assigned_user_id=$2 AND appointment_date >= $3::date AND appointment_date < $4::date`, [s.org, id, D, T]);
    const lp = num((await one(`SELECT count(*) n FROM lead_requests WHERE org_id=$1 AND requested_by_user_id=$2 AND requested_at >= $3 AND requested_at < $4`, [s.org, id, ts(S), ts(E)])).n);
    per[id] = { contacts, sent, apptDone: num(ap.done), apptNoShow: num(ap.ns), leadPoolUsed: lp };
  }
  const allSent = num((await one(`SELECT count(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND ($2::text[] IS NULL OR c.zalo_account_id=ANY($2)) AND c.zalo_account_id IS NOT NULL
      AND NOT c.is_virtual AND c."threadType"='user' AND m.sender_type='self' AND m.sent_via IN ('user','user_native') AND NOT m.is_local AND NOT m.is_deleted
      AND coalesce(m.metadata->>'dryRun','false')<>'true' AND coalesce(m.metadata->>'test','false')<>'true' AND m.sent_at >= $3 AND m.sent_at < $4`, [s.org, s.accounts, ts(S), ts(E)])).n);
  const attributed = Object.values(per).reduce((a, b) => a + b.sent, 0);
  return { totalSales: users.length, activeSales: Object.values(per).filter(x => x.contacts > 0).length, avgSentPerSale: users.length ? Math.round(attributed / users.length * 10) / 10 : null, sentUnattributed: allSent - attributed, per };
}
async function pipelineOracle(s: Scope) {
  const bySource = (await sql(`SELECT coalesce(source,'Không rõ') source, count(*)::int leads FROM contacts WHERE org_id=$1 AND merged_into IS NULL AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) AND created_at >= $3 AND created_at < $4 GROUP BY 1 ORDER BY 1`, [s.org, s.users, ts(S), ts(E)]));
  return { bySource };
}
async function aiOracle(s: Scope) {
  const acc = s.readable ?? s.accounts;
  const rows = await sql(`WITH e AS (
      SELECT m.id, m.conversation_id, m.metadata, CASE WHEN $2::text[] IS NULL OR c.zalo_account_id = ANY($3) THEN 'main' ELSE 'shared' END section
      FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND m.org_id=$1 AND ($2::text[] IS NULL OR c.zalo_account_id=ANY($2))
        AND NOT c.is_virtual AND c."threadType"='user' AND c.deleted_at IS NULL AND m.sender_type='self' AND NOT m.is_local AND NOT m.is_deleted AND m.deleted_at IS NULL
        AND (m.sent_via='ai_auto' OR (m.metadata->>'aiAuto')='true') AND coalesce(m.metadata->>'dryRun','false')<>'true' AND coalesce(m.metadata->>'test','false')<>'true'
        AND coalesce(m.metadata->>'isTest','false')<>'true' AND m.sent_at >= $4 AND m.sent_at < $5 AND m.sent_at <= now() AT TIME ZONE 'UTC'),
    au AS (SELECT DISTINCT e.id, a.action FROM e JOIN activity_logs a ON a.org_id=$1 AND a.entity_type='conversation' AND a.entity_id=e.conversation_id AND a.details->>'messageId'=e.id
        AND a.actor_type='bot' AND a.action IN ('ai_auto_reply_sent','ai_followup_sent') AND coalesce(a.details->>'dryRun','false')<>'true' AND coalesce(a.details->>'test','false')<>'true'),
    k AS (SELECT e.*, CASE WHEN (e.metadata->>'aiFollowup')='true' THEN 'followup'
        WHEN EXISTS (SELECT 1 FROM au WHERE au.id=e.id AND action='ai_auto_reply_sent') AND NOT EXISTS (SELECT 1 FROM au WHERE au.id=e.id AND action='ai_followup_sent') THEN 'reply'
        WHEN EXISTS (SELECT 1 FROM au WHERE au.id=e.id AND action='ai_followup_sent') AND NOT EXISTS (SELECT 1 FROM au WHERE au.id=e.id AND action='ai_auto_reply_sent') THEN 'followup' ELSE 'unknown' END kind FROM e)
    SELECT section, count(*)::int "sentMessages", count(DISTINCT conversation_id)::int conversations, count(*) FILTER (WHERE kind='reply')::int "autoReplies",
      count(*) FILTER (WHERE kind='followup')::int followups, count(*) FILTER (WHERE kind='unknown')::int unclassified FROM k GROUP BY section`, [s.org, acc, s.accounts, ts(S), ts(E)]);
  const drafts = await sql(`SELECT CASE WHEN $2::text[] IS NULL OR c.zalo_account_id = ANY($3) THEN 'main' ELSE 'shared' END section, count(*)::int n FROM ai_suggestions g JOIN conversations c ON c.id=g.conversation_id
      WHERE g.org_id=$1 AND c.org_id=$1 AND ($2::text[] IS NULL OR c.zalo_account_id=ANY($2)) AND NOT c.is_virtual AND c."threadType"='user' AND c.deleted_at IS NULL AND g.type='auto_reply_needs_review'
      AND g.created_at >= $4 AND g.created_at < $5 GROUP BY 1`, [s.org, acc, s.accounts, ts(S), ts(E)]);
  const sec = (name: string) => { const r = rows.find(x => x.section === name) ?? { sentMessages: 0, conversations: 0, autoReplies: 0, followups: 0, unclassified: 0 }; return { sentMessages: r.sentMessages, conversations: r.conversations, autoReplies: r.autoReplies, followups: r.followups, unclassified: r.unclassified, reviewDraftsCreated: drafts.find(x => x.section === name)?.n ?? 0 }; };
  const sharedCount = s.readable ? s.readable.filter(a => !(s.accounts ?? []).includes(a)).length : 0;
  return { main: sec('main'), shared: sharedCount > 0 ? sec('shared') : null };
}
async function automationOracle(org: string) {
  const fa = await one(`SELECT count(*) FILTER (WHERE state IN ('accepted','rejected','sent')) kb, count(*) FILTER (WHERE state='accepted') dy, count(*) FILTER (WHERE state='rejected') tc, count(*) FILTER (WHERE state='no_zalo') nz FROM friendship_attempts WHERE org_id=$1 AND queued_at >= $2 AND queued_at < $3`, [org, ts(S), ts(E)]);
  const ev = await one(`SELECT count(*) FILTER (WHERE e.event_type='step_sent') bd, count(*) FILTER (WHERE e.event_type='reply') ph FROM care_session_events e JOIN care_sessions s ON s.id=e.session_id WHERE s.org_id=$1 AND e.created_at >= $2 AND e.created_at < $3`, [org, ts(S), ts(E)]);
  const nk = await one(`SELECT count(*) t, count(*) FILTER (WHERE status='connected') o FROM zalo_accounts WHERE org_id=$1`, [org]);
  const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 1000) / 10 : null;
  return { kbGui: num(fa.kb), dongY: num(fa.dy), tuChoi: num(fa.tc), noZalo: num(fa.nz), bdGui: num(ev.bd), phanHoi: num(ev.ph), tiLeDongYPct: pct(num(fa.dy), num(fa.kb)), tiLePhanHoiPct: pct(num(ev.ph), num(ev.bd)), tongNick: num(nk.t), nickOnline: num(nk.o) };
}
async function broadcastOracle(org: string) {
  const j = await one(`SELECT count(*) t, count(*) FILTER (WHERE status='active') a FROM broadcast_jobs WHERE org_id=$1`, [org]);
  const r = await one(`SELECT count(*) n, coalesce(sum(sent_count),0) s, coalesce(sum(failed_count),0) f, coalesce(sum(skipped_count),0) k FROM broadcast_runs r JOIN broadcast_jobs j ON j.id=r.job_id AND j.org_id=$1 WHERE r.org_id=$1 AND r.started_at >= $2 AND r.started_at < $3`, [org, ts(S), ts(E)]);
  const s = num(r.s), f = num(r.f);
  return { totalJobs: num(j.t), activeJobs: num(j.a), totalRuns: num(r.n), totalSent: s, totalFailed: f, totalSkipped: num(r.k), successRatePct: s + f > 0 ? Math.round(s / (s + f) * 1000) / 10 : null };
}
// Basic reports. "legacy" = the route's documented semantics (all messages in scope; staff restriction on dept outbound);
// "contract" = 00-contract.md:118 (exclude local/deleted/dry-run/test/virtual messages and merged contacts).
async function basicMessagesOracle(s: Scope, from: string, to: string, mode: 'legacy' | 'contract') {
  const extra = mode === 'contract' ? `AND NOT m.is_local AND NOT m.is_deleted AND coalesce(m.metadata->>'dryRun','false')<>'true' AND coalesce(m.metadata->>'test','false')<>'true' AND NOT c.is_virtual` : '';
  const rows = await sql(`SELECT to_char((m.sent_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') date, count(*) FILTER (WHERE m.sender_type='self')::int sent, count(*) FILTER (WHERE m.sender_type='contact')::int received, count(*)::int total
    FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND c.zalo_account_id IS NOT NULL
    AND ($2::text[] IS NULL OR (c.zalo_account_id=ANY($3) AND (m.sender_type='contact' OR m.replied_by_user_id=ANY($2)))) ${extra}
    AND m.sent_at >= $4 AND m.sent_at < $5 GROUP BY 1 ORDER BY 1`, [s.org, s.users, s.accounts, ts(vnStart(from)), ts(vnStart(addDays(to, 1)))]);
  const out: { date: string; sent: number; received: number; total: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const r = rows.find(x => x.date === d); out.push({ date: d, sent: r?.sent ?? 0, received: r?.received ?? 0, total: r?.total ?? 0 }); }
  return out;
}
async function basicContactsOracle(s: Scope, from: string, to: string, mode: 'legacy' | 'contract') {
  const merged = mode === 'contract' || s.users ? 'AND merged_into IS NULL' : '';
  const rows = await sql(`SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') date, count(*)::int count FROM contacts WHERE org_id=$1 AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) ${merged}
    AND created_at >= $3 AND created_at < $4 GROUP BY 1`, [s.org, s.users, ts(vnStart(from)), ts(vnStart(addDays(to, 1)))]);
  const newPerDay: { date: string; count: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) newPerDay.push({ date: d, count: rows.find(x => x.date === d)?.count ?? 0 });
  const byStatus = (await sql(`SELECT status, count(*)::int count FROM contacts WHERE org_id=$1 AND status IS NOT NULL AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) ${merged} GROUP BY status ORDER BY status`, [s.org, s.users]));
  return { newPerDay, byStatus };
}
async function basicApptOracle(s: Scope, from: string, to: string) {
  const p = [s.org, s.users, from, addDays(to, 1)];
  const byStatus = await sql(`SELECT status, count(*)::int count FROM appointments WHERE org_id=$1 AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) AND appointment_date >= $3::date AND appointment_date < $4::date GROUP BY status ORDER BY status`, p);
  const byType = await sql(`SELECT type, count(*)::int count FROM appointments WHERE org_id=$1 AND ($2::text[] IS NULL OR assigned_user_id=ANY($2)) AND appointment_date >= $3::date AND appointment_date < $4::date GROUP BY type ORDER BY type`, p);
  return { byStatus, byType };
}
const sortBy = <Tx>(arr: Tx[], key: keyof Tx) => [...arr].sort((a, b) => String(a[key]).localeCompare(String(b[key])));

// ---------- Hand counts (đếm tay từ fixture, cross-check of the oracle) ----------
const hand = {
  admX: { totalContacts: 8, newContacts: 6, apptToday: 2, apptDone: 2, leadPoolWaiting: 2, msgToday: 5, msgByBot: 1, nicksTotal: 5, nicksOnline: 4, ai: { sentMessages: 5, autoReplies: 2, followups: 1, unclassified: 2, conversations: 2, reviewDraftsCreated: 3 } },
  leadS: { totalContacts: 6, newContacts: 4, apptToday: 1, apptDone: 2, leadPoolWaiting: 1, nicksTotal: 4, ai: { sentMessages: 4, autoReplies: 1, followups: 1, unclassified: 2, conversations: 1, reviewDraftsCreated: 2 } },
  depS1: { totalContacts: 4, newContacts: 2, apptToday: 1, apptDone: 1, leadPoolWaiting: 1, nicksTotal: 2, ai: { sentMessages: 4, autoReplies: 1, followups: 1, unclassified: 2, conversations: 1, reviewDraftsCreated: 2 }, aiShared: { sentMessages: 1, autoReplies: 1, followups: 0, unclassified: 0, conversations: 1, reviewDraftsCreated: 1 } },
  admY: { totalContacts: 4, newContacts: 3 },
  automationX: { kbGui: 3, dongY: 1, tuChoi: 1, noZalo: 1, bdGui: 2, phanHoi: 1, tongNick: 6, nickOnline: 4 },
  broadcastX: { totalJobs: 2, activeJobs: 1, totalRuns: 2, totalSent: 7, totalFailed: 1, totalSkipped: 3, successRatePct: 87.5 },
  basicMessagesX_D_legacy: { sent: 18, received: 6 }, basicMessagesX_D_contract: { sent: 13, received: 6 }, basicMessagesLeadS_D: { sent: 5, received: 5 },
};

const q = `from=${D}&to=${D}`;
const result: Record<string, unknown> = { dates: { DM1, D, T, T1 }, scopes };
// ---------- Overview / Sales / Pipeline / AI per scope ----------
for (const v of ['admX', 'leadS', 'depS1', 'leadM', 'admY'] as Viewer[]) {
  const s = scopes[v];
  const o = await overviewOracle(s);
  const ov = await http(`/api/v1/reports/overview?${q}`, v);
  check('overview', `${v} status`, 200, ov.status);
  for (const k of ['totalContacts', 'newContacts', 'newContactsDelta', 'nicksTotal', 'nicksOnline', 'nicksNeedRelogin', 'apptToday', 'apptDone', 'leadPoolWaiting', 'msgToday', 'msgByBot'] as const) check('overview', `${v} ${k}`, (o as any)[k], ov.data?.kpis?.[k]);
  check('overview', `${v} funnel`, o.funnel, ov.data?.funnel);
  check('overview', `${v} period label`, { from: D, to: D, timeZone: 'Asia/Ho_Chi_Minh' }, ov.data?.timeWindows?.period);
  check('overview', `${v} unavailable stays null`, [null, null, null], [ov.data?.kpis?.closeRate, ov.data?.kpis?.friendAcceptRate, ov.data?.kpis?.leadPoolAutoReturnSoon]);
  const h = (hand as any)[v];
  if (h) for (const k of Object.keys(h).filter(k => !k.startsWith('ai'))) check('hand-count', `${v} ${k} oracle==hand`, h[k], (o as any)[k]);
  const sa = await salesOracle(s);
  const sp = await http(`/api/v1/reports/sales-performance?${q}`, v);
  check('sales', `${v} status`, 200, sp.status);
  for (const k of ['totalSales', 'activeSales', 'avgSentPerSale'] as const) check('sales', `${v} ${k}`, sa[k], sp.data?.kpis?.[k]);
  check('sales', `${v} sentUnattributed`, sa.sentUnattributed, sp.data?.sentUnattributed);
  const apiPer = Object.fromEntries((sp.data?.sales ?? []).map((r: any) => [r.userId, { contacts: r.contacts, sent: r.sent, apptDone: r.apptDone, apptNoShow: r.apptNoShow, leadPoolUsed: r.leadPoolUsed }]));
  check('sales', `${v} per-user rows`, sa.per, Object.fromEntries(Object.keys(sa.per).map(id => [id, apiPer[id]])));
  check('sales', `${v} no out-of-scope users`, Object.keys(sa.per).sort(), Object.keys(apiPer).sort());
  const pl = await pipelineOracle(s);
  const pp = await http(`/api/v1/reports/pipeline?${q}`, v);
  check('pipeline', `${v} status`, 200, pp.status);
  check('pipeline', `${v} funnel`, o.funnel.map((f: any) => ({ status: f.status, count: f.count })), (pp.data?.funnel ?? []).map((f: any) => ({ status: f.status, count: f.count })));
  check('pipeline', `${v} bySource`, pl.bySource, sortBy((pp.data?.bySource ?? []).map((r: any) => ({ source: r.source, leads: r.leads })), 'source'));
  check('pipeline', `${v} leadPoolWaiting`, o.leadPoolWaiting, pp.data?.kpis?.leadPoolWaiting);
  check('pipeline', `${v} returnRate unavailable`, [null, 'unavailable'], [pp.data?.kpis?.returnRate, pp.data?.availability?.returnRate?.status]);
  const ai = await aiOracle(s);
  const ar = await http(`/api/v1/reports/ai?${q}`, v);
  check('ai', `${v} status`, 200, ar.status);
  check('ai', `${v} main kpis`, ai.main, ar.data?.main?.kpis);
  check('ai', `${v} shared kpis`, ai.shared, ar.data?.shared ? ar.data.shared.kpis : null);
  check('ai', `${v} cost/tokens null`, [null, null], [ar.data?.unavailable?.cost, ar.data?.unavailable?.tokens]);
  if (h?.ai) check('hand-count', `${v} ai main oracle==hand`, h.ai, { sentMessages: ai.main.sentMessages, autoReplies: ai.main.autoReplies, followups: ai.main.followups, unclassified: ai.main.unclassified, conversations: ai.main.conversations, reviewDraftsCreated: ai.main.reviewDraftsCreated });
  if (h?.aiShared) check('hand-count', `${v} ai shared oracle==hand`, h.aiShared, ai.shared);
  result[`oracle_${v}`] = { overview: o, sales: sa, pipeline: pl, ai };
}
// Leader S must never see room M data: explicit record-level probe.
{
  const sp = await http(`/api/v1/reports/sales-performance?${q}`, 'leadS');
  check('scope', 'leadS sales has no room-M user', false, (sp.data?.sales ?? []).some((r: any) => ['6b-u-lead-m', '6b-u-sale-m', '6b-u-dep-m-nogrant'].includes(r.userId)));
  const ai = await http(`/api/v1/reports/ai?${q}`, 'leadS');
  check('scope', 'leadS AI has no shared section (no grant)', null, ai.data?.shared);
  const dep = await http(`/api/v1/reports/sales-performance?${q}`, 'depS1');
  check('scope', 'depS1 sees only S1 subtree users', ['6b-u-dep-s1', '6b-u-sale-s1a'], (dep.data?.sales ?? []).map((r: any) => r.userId).sort());
  const depAi = await http(`/api/v1/reports/ai?${q}`, 'depS1');
  check('scope', 'depS1 AI shared section from nick M grant only', 1, depAi.data?.scope?.sharedAccounts);
}
// AI as-of: future message on T is excluded when period = today.
{
  const ar = await http(`/api/v1/reports/ai?from=${T}&to=${T}`, 'admX');
  const exp = num((await one(`SELECT count(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND NOT c.is_virtual AND c."threadType"='user' AND m.sender_type='self' AND NOT m.is_local AND NOT m.is_deleted AND (m.sent_via='ai_auto' OR (m.metadata->>'aiAuto')='true') AND coalesce(m.metadata->>'dryRun','false')<>'true' AND coalesce(m.metadata->>'test','false')<>'true' AND m.sent_at >= $2 AND m.sent_at < $3 AND m.sent_at <= now() AT TIME ZONE 'UTC'`, [X, ts(vnStart(T)), ts(vnStart(T1))])).n);
  check('ai', 'admX today excludes future-dated AI message (asOf)', exp, ar.data?.main?.kpis?.sentMessages, 'm30 is dated T 23:00 VN');
}
// Tomorrow's appointment must not be counted as today.
{
  const ov = await http(`/api/v1/reports/overview?from=${T}&to=${T}`, 'depS1');
  const tomorrow = num((await one(`SELECT count(*) n FROM appointments WHERE org_id=$1 AND assigned_user_id=$2 AND appointment_date >= $3::date AND appointment_date < $4::date`, [X, '6b-u-dep-s1', T1, addDays(T1, 1)])).n);
  check('boundary', 'depS1 has 1 appointment tomorrow (oracle)', 1, tomorrow);
  check('boundary', 'depS1 apptToday excludes tomorrow', 1, ov.data?.kpis?.apptToday);
  const ap = await http(`/api/v1/reports/appointments?from=${T}&to=${T}`, 'depS1');
  check('boundary', 'depS1 /reports/appointments today only scheduled 1', [{ status: 'scheduled', count: 1 }], ap.data?.byStatus);
  const ap1 = await http(`/api/v1/reports/appointments?from=${T1}&to=${T1}`, 'depS1');
  check('boundary', 'depS1 /reports/appointments tomorrow has the tomorrow row', [{ status: 'scheduled', count: 1 }], ap1.data?.byStatus);
}
// VN day boundary at record level via the basic contacts report (dept scope: merged excluded by both definitions).
{
  const r = await http(`/api/v1/reports/contacts?from=${DM1}&to=${T}`, 'depS1');
  check('boundary', 'depS1 contacts newPerDay DM1/D/T (00:00 & 23:59:59.999 VN)', [{ date: DM1, count: 1 }, { date: D, count: 2 }, { date: T, count: 1 }], r.data?.newPerDay);
  const y = await http(`/api/v1/reports/contacts?from=${DM1}&to=${D}`, 'admY');
  const yo = await basicContactsOracle(scopes.admY, DM1, D, 'contract');
  check('boundary', 'admY contacts per day incl. Prisma-inserted boundary rows', yo.newPerDay, y.data?.newPerDay);
  check('boundary', 'admY Prisma rows: yp-before on DM1, yp-start on D', [{ date: DM1, count: 1 }, { date: D, count: 3 }], yo.newPerDay);
}
// Automation / Broadcast (admin only)
for (const [v, org] of [['admX', X], ['admY', Y]] as const) {
  const ao = await automationOracle(org);
  const a = await http(`/api/v1/reports/automation-summary?${q}`, v);
  check('automation', `${v} status`, 200, a.status);
  for (const k of Object.keys(ao)) check('automation', `${v} ${k}`, (ao as any)[k], a.data?.kpis?.[k]);
  const bo = await broadcastOracle(org);
  const b = await http(`/api/v1/reports/broadcast?${q}`, v);
  check('broadcast', `${v} status`, 200, b.status);
  for (const k of Object.keys(bo)) check('broadcast', `${v} ${k}`, (bo as any)[k], b.data?.kpis?.[k]);
  if (v === 'admX') {
    for (const k of Object.keys(hand.automationX)) check('hand-count', `automationX ${k}`, (hand.automationX as any)[k], (ao as any)[k]);
    for (const k of Object.keys(hand.broadcastX)) check('hand-count', `broadcastX ${k}`, (hand.broadcastX as any)[k], (bo as any)[k]);
  }
}
// ---------- Basic reports + export ----------
const basic: Record<string, unknown> = {};
for (const v of ['admX', 'leadS', 'depS1', 'leadM', 'admY'] as Viewer[]) {
  const s = scopes[v];
  for (const [from, to] of [[D, D], [DM1, T]] as const) {
    const legacy = await basicMessagesOracle(s, from, to, 'legacy');
    const contract = await basicMessagesOracle(s, from, to, 'contract');
    const m = await http(`/api/v1/reports/messages?from=${from}&to=${to}`, v);
    check('basic', `${v} messages ${from}..${to} status`, 200, m.status);
    check('basic', `${v} messages ${from}..${to} = legacy SQL`, legacy, m.data?.data);
    check('basic-contract', `${v} messages ${from}..${to} = contract SQL (00-contract:118)`, contract, m.data?.data);
    const lc = await basicContactsOracle(s, from, to, 'legacy');
    const cc = await basicContactsOracle(s, from, to, 'contract');
    const c = await http(`/api/v1/reports/contacts?from=${from}&to=${to}`, v);
    check('basic', `${v} contacts ${from}..${to} status`, 200, c.status);
    check('basic', `${v} contacts ${from}..${to} newPerDay = legacy SQL`, lc.newPerDay, c.data?.newPerDay);
    check('basic', `${v} contacts byStatus = legacy SQL`, lc.byStatus, sortBy(c.data?.byStatus ?? [], 'status'));
    check('basic-contract', `${v} contacts ${from}..${to} newPerDay = contract SQL (merged excluded)`, cc.newPerDay, c.data?.newPerDay);
    check('basic-contract', `${v} contacts byStatus = contract SQL (merged excluded)`, cc.byStatus, sortBy(c.data?.byStatus ?? [], 'status'));
    const ao = await basicApptOracle(s, from, to);
    const a = await http(`/api/v1/reports/appointments?from=${from}&to=${to}`, v);
    check('basic', `${v} appointments ${from}..${to} status`, 200, a.status);
    check('basic', `${v} appointments byStatus`, ao.byStatus, sortBy(a.data?.byStatus ?? [], 'status'));
    check('basic', `${v} appointments byType`, ao.byType, sortBy(a.data?.byType ?? [], 'type'));
    // Export: open the workbook with the repo's exceljs and compare every row.
    for (const type of ['messages', 'contacts', 'appointments'] as const) {
      const r = await http(`/api/v1/reports/export?type=${type}&from=${from}&to=${to}`, v);
      check('export', `${v} export ${type} ${from}..${to} status`, 200, r.status);
      check('export', `${v} export ${type} content-type`, true, r.ct.includes('spreadsheetml'));
      if (r.status !== 200) continue;
      const file = resolve(OUT, '..', 'excel', `${v}-${type}-${from}-${to}.xlsx`);
      await writeFile(file, r.data);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(r.data);
      const ws = wb.worksheets[0];
      const rows: unknown[][] = [];
      ws.eachRow((row, i) => { if (i > 1) rows.push((row.values as unknown[]).slice(1)); });
      let expected: unknown[][];
      if (type === 'messages') expected = legacy.filter(x => x.total > 0).map(x => [x.date, x.sent, x.received, x.total]);
      else if (type === 'contacts') expected = lc.newPerDay.filter(x => x.count > 0).map(x => [x.date, x.count]);
      else expected = ao.byStatus.map((x: any) => [x.status, x.count]);
      const sortRows = (a: unknown[][]) => [...a].sort((p, q2) => String(p[0]).localeCompare(String(q2[0])));
      check('export', `${v} export ${type} ${from}..${to} rows = SQL`, sortRows(expected), sortRows(rows));
      if (type === 'messages') check('export-contract', `${v} export messages ${from}..${to} rows = contract SQL`, sortRows(contract.filter(x => x.total > 0).map(x => [x.date, x.sent, x.received, x.total])), sortRows(rows));
      if (type === 'contacts') check('export-contract', `${v} export contacts ${from}..${to} rows = contract SQL`, sortRows(cc.newPerDay.filter(x => x.count > 0).map(x => [x.date, x.count])), sortRows(rows));
      basic[`${v}-${type}-${from}-${to}`] = { file: file.split(/[\\/]/).slice(-2).join('/'), sheet: ws.name, header: (ws.getRow(1).values as unknown[]).slice(1), rows };
    }
    if (v === 'admX' && from === D) {
      const sum = (arr: any[]) => arr.reduce((acc, x) => ({ sent: acc.sent + x.sent, received: acc.received + x.received }), { sent: 0, received: 0 });
      check('hand-count', 'basic messages X D legacy', hand.basicMessagesX_D_legacy, sum(legacy));
      check('hand-count', 'basic messages X D contract', hand.basicMessagesX_D_contract, sum(contract));
    }
    if (v === 'leadS' && from === D) check('hand-count', 'basic messages leadS D', hand.basicMessagesLeadS_D, { sent: legacy[0].sent, received: legacy[0].received });
  }
}
// Export out-of-scope rows: dept exports never include rows from room M / org Y (re-derived from scope SQL above).
{
  const r = await http(`/api/v1/reports/export?type=contacts&from=${DM1}&to=${T}`, 'leadM');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data);
  const total = (() => { let t = 0; wb.worksheets[0].eachRow((row, i) => { if (i > 1) t += Number(row.getCell(2).value); }); return t; })();
  check('export', 'leadM contacts export total = room M only (1)', 1, total);
  const bad = await http(`/api/v1/reports/export?type=passwords&${q}`, 'admX');
  check('export', 'invalid export type → 400', 400, bad.status);
  const inv = await http(`/api/v1/reports/export?type=messages&from=${T}&to=${D}`, 'admX');
  check('export', 'reversed period → 400 invalid_report_date_range', [400, 'invalid_report_date_range'], [inv.status, inv.data?.code]);
}
// ---------- Custom + saved reports ----------
async function customContactsByUser(s: Scope, mode: 'legacy' | 'contract') {
  const merged = mode === 'contract' || s.users ? 'AND c.merged_into IS NULL' : '';
  return (await sql(`SELECT coalesce(u.full_name,'Chưa gán') label, count(*)::int cnt FROM contacts c LEFT JOIN users u ON u.id=c.assigned_user_id WHERE c.org_id=$1 AND ($2::text[] IS NULL OR c.assigned_user_id=ANY($2)) ${merged} AND c.created_at >= $3 AND c.created_at < $4 GROUP BY 1 ORDER BY 1`, [s.org, s.users, ts(S), ts(E)]));
}
for (const v of ['admX', 'leadS', 'depS1'] as Viewer[]) {
  const s = scopes[v];
  const r = await http('/api/v1/analytics/custom', v, 'POST', { metrics: ['contacts_new'], groupBy: 'user', dateRange: { from: D, to: D }, orgId: Y, filters: { userId: '6b-u-sale-m' } });
  check('custom', `${v} custom status`, 200, r.status);
  const got = (r.data?.labels ?? []).map((l: string, i: number) => ({ label: l, cnt: r.data.datasets[0].data[i] })).sort((a: any, b: any) => a.label.localeCompare(b.label));
  check('custom', `${v} contacts_new by user = legacy SQL (body orgId/userId ignored)`, await customContactsByUser(s, 'legacy'), got);
  check('custom-contract', `${v} contacts_new by user = contract SQL (merged excluded)`, await customContactsByUser(s, 'contract'), got);
}
const savedExp: [Viewer, string, number][] = [
  ['admX', '6b-sr-sub', 200], ['admX', '6b-sr-adm', 200], ['admX', '6b-sr-sale-s', 200], ['admX', '6b-sr-y', 404],
  ['leadS', '6b-sr-sub', 200], ['leadS', '6b-sr-sale-s', 200], ['leadS', '6b-sr-adm', 404], ['leadS', '6b-sr-y', 404],
  ['depS1', '6b-sr-sub', 200], ['depS1', '6b-sr-sale-s', 404], ['depS1', '6b-sr-adm', 404],
  ['leadM', '6b-sr-sub', 404], ['saleS1a', '6b-sr-sub', 403], ['depMnoGrant', '6b-sr-sub', 403], ['admY', '6b-sr-y', 200], ['admY', '6b-sr-sub', 404], ['saleY', '6b-sr-y', 403],
];
for (const [v, id, status] of savedExp) {
  const r = await http(`/api/v1/saved-reports/${id}/run`, v, 'POST');
  check('saved', `${v} run ${id}`, status, r.status);
  if (status === 200) {
    const s = scopes[v];
    const exp = (await basicContactsOracle(s, D, D, 'legacy')).newPerDay.filter(x => x.count > 0);
    const got = (r.data?.labels ?? []).map((l: string, i: number) => ({ date: l, count: r.data.datasets[0].data[i] }));
    check('saved', `${v} run ${id} values = viewer-scope SQL (legacy)`, exp, got);
    const expC = (await basicContactsOracle(s, D, D, 'contract')).newPerDay.filter(x => x.count > 0);
    check('saved-contract', `${v} run ${id} values = viewer-scope SQL (contract, merged excluded)`, expC, got);
  }
}
{
  const r = await http('/api/v1/saved-reports/6b-sr-y', 'admX');
  check('saved', 'admX GET org-Y saved report → 404', 404, r.status);
  const l = await http('/api/v1/saved-reports', 'admX');
  check('saved', 'admX list has no org-Y saved report', false, (l.data?.data ?? []).some((x: any) => x.orgId === Y));
}
// ---------- Permission matrix ----------
const getRoutes = ['overview', 'nick-fleet', 'sales-performance', 'pipeline', 'lead-pool', 'automation', 'engagement', 'audit', 'crm-usage', 'ai', 'automation-summary', 'broadcast', 'messages', 'contacts', 'appointments', 'export?type=messages', 'export?type=contacts', 'export?type=appointments'];
const adminOnly = new Set(['automation', 'audit', 'automation-summary', 'broadcast']);
const matrix: Record<string, Record<string, number>> = {};
for (const v of Object.keys(viewers) as Viewer[]) {
  matrix[v] = {};
  const isAdmin = v === 'admX' || v === 'admY';
  const isManager = v === 'leadS' || v === 'depS1' || v === 'leadM';
  for (const r of getRoutes) {
    const path = `/api/v1/reports/${r}${r.includes('?') ? '&' : '?'}${q}`;
    const res = await http(path, v);
    matrix[v][r] = res.status;
    const exp = isAdmin ? 200 : isManager ? (adminOnly.has(r.split('?')[0]) ? 403 : 200) : 403;
    check('permission', `${v} GET ${r}`, exp, res.status);
  }
  for (const r of ['conversion-funnel', 'team-performance', 'response-time']) {
    const res = await http(`/api/v1/analytics/${r}?${q}`, v);
    matrix[v][`analytics/${r}`] = res.status;
    check('permission', `${v} GET analytics/${r}`, isAdmin || isManager ? 200 : 403, res.status);
  }
  const cr = await http('/api/v1/analytics/custom', v, 'POST', { metrics: ['contacts_new'], groupBy: 'day', dateRange: { from: D, to: D } });
  matrix[v]['analytics/custom'] = cr.status;
  check('permission', `${v} POST analytics/custom`, isAdmin || isManager ? 200 : 403, cr.status);
}
for (const r of ['overview', 'export?type=contacts', 'messages']) {
  const res = await http(`/api/v1/reports/${r}${r.includes('?') ? '&' : '?'}${q}`);
  check('permission', `anonymous GET ${r} → 401`, 401, res.status);
}
// ---------- Cross-org ----------
{
  const ox = await overviewOracle(scopes.admX);
  const r = await http(`/api/v1/reports/overview?${q}&orgId=${Y}`, 'admX');
  check('cross-org', 'admX overview ?orgId=Y still org X totals', ox.totalContacts, r.data?.kpis?.totalContacts);
  const e = await http(`/api/v1/reports/export?type=contacts&${q}&orgId=${Y}`, 'admX');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(e.data);
  let t = 0; wb.worksheets[0].eachRow((row, i) => { if (i > 1) t += Number(row.getCell(2).value); });
  const lc = await basicContactsOracle(scopes.admX, D, D, 'legacy');
  check('cross-org', 'admX export contacts ?orgId=Y = org X rows', lc.newPerDay.reduce((a, x) => a + x.count, 0), t);
  const m = await http(`/api/v1/reports/messages?${q}&orgId=${Y}`, 'admX');
  check('cross-org', 'admX messages ?orgId=Y = org X legacy SQL', await basicMessagesOracle(scopes.admX, D, D, 'legacy'), m.data?.data);
  const ai = await http(`/api/v1/reports/ai?${q}&orgId=${Y}`, 'admX');
  check('cross-org', 'admX AI ?orgId=Y rejected by strict schema', 400, ai.status);
  const oy = await http(`/api/v1/reports/overview?${q}`, 'admY');
  check('cross-org', 'admY overview = org Y only', (await overviewOracle(scopes.admY)).totalContacts, oy.data?.kpis?.totalContacts);
  const sy = await http(`/api/v1/reports/sales-performance?${q}`, 'admY');
  check('cross-org', 'admY sales users all org Y', true, (sy.data?.sales ?? []).every((x: any) => x.userId.startsWith('6b-u-') && ['6b-u-adm-y', '6b-u-sale-y'].includes(x.userId)));
  const by = await http(`/api/v1/reports/broadcast?${q}&orgId=${X}`, 'admY');
  check('cross-org', 'admY broadcast ?orgId=X still org Y sent', (await broadcastOracle(Y)).totalSent, by.data?.kpis?.totalSent);
  const ly = await http(`/api/v1/reports/sales-performance?${q}&orgId=${Y}&userId=6b-u-sale-y`, 'leadS');
  check('cross-org', 'leadS sales ?orgId=Y&userId=sale-y ignored', false, (ly.data?.sales ?? []).some((x: any) => x.userId === '6b-u-sale-y'));
}

const passed = checks.filter(c => c.pass).length;
const byGroup: Record<string, { pass: number; fail: number }> = {};
for (const c of checks) { byGroup[c.group] ??= { pass: 0, fail: 0 }; byGroup[c.group][c.pass ? 'pass' : 'fail']++; }
await writeFile(resolve(OUT, 'api-oracle.json'), JSON.stringify({ time: new Date().toISOString(), passed, failed: checks.length - passed, byGroup, checks, matrix, oracle: result, export: basic }, null, 1));
console.log(`CHECKS ${passed}/${checks.length}`);
console.log(JSON.stringify(byGroup));
for (const c of checks.filter(c => !c.pass)) console.log('FAIL', c.group, '|', c.name, '| expected', JSON.stringify(c.expected), '| actual', JSON.stringify(c.actual));
await owner.end();
