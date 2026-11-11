// 6B lần 3 — independent verification fixture (synthetic data only). Not derived from 6a*-fixture.
// Owner role seeds the verified disposable DB once; refuses any other target or a non-empty DB.
// Timestamps: Prisma stores timestamp(3) without time zone as UTC, so run with TZ=UTC and
// pg.defaults.parseInputDatesAsUTC = true. A UTC self-check is written next to the manifest.
import pg from 'pg';
import { hash } from 'bcryptjs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

pg.defaults.parseInputDatesAsUTC = true;
if (new Date(0).getTimezoneOffset() !== 0) throw new Error('6B helpers must run with TZ=UTC.');

const OWNER_URL = 'postgresql://postgres@127.0.0.1:55571/reports_be1o1_verify';
const out = process.env.REPORTS_6B_ARTIFACT_DIR;
if (!out) throw new Error('REPORTS_6B_ARTIFACT_DIR is required.');
export const FIXTURE_PASSWORD = process.env.REPORTS_FIXTURE_PASSWORD!;

const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const T = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const D = addDays(T, -1), DM1 = addDays(T, -2), T1 = addDays(T, 1);
const vn = (date: string, time: string) => new Date(`${date}T${time}+07:00`);
const dateOnly = (date: string) => new Date(`${date}T00:00:00.000Z`);
const X = '6b-org-x', Y = '6b-org-y';
const u = (s: string) => `6b-u-${s}`, n = (s: string) => `6b-n-${s}`, c = (s: string) => `6b-c-${s}`, v = (s: string) => `6b-v-${s}`;

const pool = new pg.Pool({ connectionString: OWNER_URL, application_name: 'reports-6b3-fixture' });
const db = await pool.connect();
try {
  const id = (await db.query(`SELECT current_database() d, current_user u, inet_server_port() p, current_setting('TimeZone') tz`)).rows[0];
  if (id.d !== 'reports_be1o1_verify' || id.u !== 'postgres') throw new Error(`Unexpected target ${JSON.stringify(id)}`);
  const tables = (await db.query(`SELECT relname FROM pg_stat_user_tables WHERE schemaname='public'`)).rows;
  const nonEmpty: string[] = [];
  for (const t of tables) { const k = (await db.query(`SELECT count(*)::int n FROM "${t.relname}"`)).rows[0].n; if (k) nonEmpty.push(`${t.relname}:${k}`); }
  if (nonEmpty.length) throw new Error(`Refusing to seed non-empty DB: ${nonEmpty.join(',')}`);

  const pw = await hash(FIXTURE_PASSWORD, 10);
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p);
  await q('BEGIN');
  await q(`INSERT INTO organizations (id,name,timezone,updated_at) VALUES ($1,'6B Org X','+07:00',now()),($2,'6B Org Y','+07:00',now())`, [X, Y]);
  await q(`INSERT INTO permission_groups (id,org_id,name,grants,updated_at) VALUES
    ('6b-g-report',$1,'6B report grant','{"engagement_score":{"access":true}}'::jsonb,now()),
    ('6b-g-none',$1,'6B no grant','{}'::jsonb,now())`, [X]);
  // Departments: S (root) > S1 > S1a ; M (root, sibling room) ; Y (org Y)
  await q(`INSERT INTO departments (id,org_id,name,parent_id,path,depth,updated_at) VALUES
    ('6b-d-s',$1,'6B Phong S',NULL,'/6b-d-s/',0,now()),
    ('6b-d-s1',$1,'6B To S1','6b-d-s','/6b-d-s/6b-d-s1/',1,now()),
    ('6b-d-s1a',$1,'6B Nhom S1a','6b-d-s1','/6b-d-s/6b-d-s1/6b-d-s1a/',2,now()),
    ('6b-d-m',$1,'6B Phong M',NULL,'/6b-d-m/',0,now()),
    ('6b-d-y',$2,'6B Phong Y',NULL,'/6b-d-y/',0,now())`, [X, Y]);
  // [id, org, role, name, group, dept, deptRole]
  const users = [
    [u('adm-x'), X, 'admin', '6B Admin X', null, null, null],
    [u('lead-s'), X, 'member', '6B Leader S', '6b-g-report', '6b-d-s', 'leader'],
    [u('dep-s1'), X, 'member', '6B Deputy S1', '6b-g-report', '6b-d-s1', 'deputy'],
    [u('sale-s1a'), X, 'member', '6B Sale S1a', '6b-g-none', '6b-d-s1a', 'member'],
    [u('sale-s'), X, 'member', '6B Sale S', '6b-g-none', '6b-d-s', 'member'],
    [u('lead-m'), X, 'member', '6B Leader M', '6b-g-report', '6b-d-m', 'leader'],
    [u('sale-m'), X, 'member', '6B Sale M', '6b-g-none', '6b-d-m', 'member'],
    [u('dep-m-nogrant'), X, 'member', '6B Deputy M no grant', '6b-g-none', '6b-d-m', 'deputy'],
    [u('adm-y'), Y, 'admin', '6B Admin Y', null, '6b-d-y', 'member'],
    [u('sale-y'), Y, 'member', '6B Sale Y', null, '6b-d-y', 'member'],
  ] as const;
  for (const [uid, org, role, name, grp, dept, drole] of users) {
    await q(`INSERT INTO users (id,org_id,role,full_name,email,password_hash,permission_group_id,password_changed_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())`,
      [uid, org, role, name, `${uid}@example.invalid`, pw, grp]);
    if (dept) await q(`INSERT INTO department_members (id,department_id,user_id,dept_role) VALUES ($1,$2,$3,$4)`, [`6b-dm-${uid}`, dept, uid, drole]);
  }
  await q(`INSERT INTO statuses (id,org_id,name,"order",is_terminal,updated_at) VALUES
    ('6b-st-new',$1,'6B Moi',1,false,now()),('6b-st-care',$1,'6B Cham soc',2,false,now()),('6b-st-won',$1,'6B Chot',3,true,now()),
    ('6b-st-y',$2,'6B Y Moi',1,false,now())`, [X, Y]);
  // Nicks: archived nick without zaloUid is outside department scope by policy.
  await q(`INSERT INTO zalo_accounts (id,org_id,owner_user_id,display_name,status,privacy_mode,zalo_uid,archived_at) VALUES
    ($1,$9,$10,'6B nick S','connected','main','6b-uid-s',$8::timestamp),
    ($2,$9,$11,'6B nick S1','connected','main','6b-uid-s1',NULL),
    ($3,$9,$12,'6B nick S1a','connected','main','6b-uid-s1a',NULL),
    ($4,$9,$13,'6B nick Ss','disconnected','main','6b-uid-ss',NULL),
    ($5,$9,$14,'6B nick M','connected','main','6b-uid-m',NULL),
    ($6,$9,$12,'6B nick archived','disconnected','main',NULL,now()),
    ($7,$15,$16,'6B nick Y','connected','main','6b-uid-y',NULL)`,
    [n('s'), n('s1'), n('s1a'), n('ss'), n('m'), n('arch'), n('y'), null, X, u('lead-s'), u('dep-s1'), u('sale-s1a'), u('sale-s'), u('sale-m'), Y, u('sale-y')]);
  await q(`INSERT INTO zalo_account_access (id,zalo_account_id,user_id,permission) VALUES ('6b-za-dep-s1-m',$1,$2,'read')`, [n('m'), u('dep-s1')]);

  // Contacts [id, org, assignee, statusId, legacyStatus, source, createdAt, mergedInto]
  const contacts = [
    [c('s1a-start'), X, u('sale-s1a'), '6b-st-new', 'new', 'FB', vn(D, '00:00:00.000'), null],
    [c('s1a-end'), X, u('sale-s1a'), '6b-st-care', 'contacted', 'TT', vn(D, '23:59:59.999'), null],
    [c('s1-before'), X, u('dep-s1'), '6b-st-won', 'converted', 'FB', vn(DM1, '23:59:59.999'), null],
    [c('s1-after'), X, u('dep-s1'), '6b-st-new', 'new', 'FB', vn(T, '00:00:00.000'), null],
    [c('s-mid'), X, u('sale-s'), '6b-st-care', 'contacted', 'FB', vn(D, '12:00:00.000'), null],
    [c('s-lead'), X, u('lead-s'), '6b-st-new', 'new', null, vn(D, '08:00:00.000'), null],
    [c('m-mid'), X, u('sale-m'), '6b-st-new', 'new', 'FB', vn(D, '10:00:00.000'), null],
    [c('unassigned'), X, null, '6b-st-new', 'new', 'GT', vn(D, '14:00:00.000'), null],
    [c('m-merged'), X, u('sale-m'), '6b-st-won', 'converted', 'FB', vn(D, '11:00:00.000'), c('m-mid')],
    [c('s1a-merged'), X, u('sale-s1a'), '6b-st-won', 'converted', 'FB', vn(D, '13:00:00.000'), c('s1a-start')],
    [c('y1'), Y, u('sale-y'), '6b-st-y', 'new', 'FB', vn(D, '12:00:00.000'), null],
    [c('y2'), Y, u('sale-y'), '6b-st-y', 'new', 'FB', vn(D, '23:59:59.999'), null],
  ] as const;
  for (const [cid, org, asg, st, legacy, src, at, merged] of contacts) {
    await q(`INSERT INTO contacts (id,org_id,assigned_user_id,status_id,status,source,full_name,created_at,updated_at,merged_into) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,NULL)`,
      [cid, org, asg, st, legacy, src, `6B ${cid}`, at]);
  }
  for (const [cid, , , , , , , merged] of contacts) if (merged) await q(`UPDATE contacts SET merged_into=$2 WHERE id=$1`, [cid, merged]);

  // Conversations [id, org, nick, contact, threadType, isVirtual]
  const convs = [
    [v('s1a'), X, n('s1a'), c('s1a-start'), 'user', false], [v('s1'), X, n('s1'), c('s1-before'), 'user', false],
    [v('s'), X, n('s'), c('s-lead'), 'user', false], [v('ss'), X, n('ss'), c('s-mid'), 'user', false],
    [v('m'), X, n('m'), c('m-mid'), 'user', false], [v('virtual'), X, n('s1a'), c('s1a-end'), 'user', true],
    [v('group'), X, n('s1a'), c('s1a-end'), 'group', false], [v('y'), Y, n('y'), c('y1'), 'user', false],
  ] as const;
  for (const [vid, org, nick, ct, tt, virt] of convs) {
    await q(`INSERT INTO conversations (id,org_id,zalo_account_id,contact_id,external_thread_id,"threadType",thread_kind,is_virtual) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [vid, org, nick, ct, `6b-thread-${vid}`, tt, tt === 'group' ? 'group' : 'dm', virt]);
  }
  // Messages [id, org, conv, senderType, sentVia, at, repliedBy, isLocal, isDeleted, metadata]
  const M = (id: string, org: string, conv: string, st: string, via: string, at: Date, by: string | null, meta: object = {}, local = false, del = false) => ({ id: `6b-m-${id}`, org, conv, st, via, at, by, meta, local, del });
  const msgs = [
    M('01', X, v('s1a'), 'contact', 'user', vn(D, '00:00:00.000'), null),
    M('02', X, v('s1a'), 'self', 'user', vn(D, '09:00:00.000'), u('sale-s1a')),
    M('03', X, v('s1a'), 'self', 'ai_auto', vn(D, '09:05:00.000'), null, { aiAuto: true }),
    M('04', X, v('s1a'), 'self', 'ai_auto', vn(D, '09:10:00.000'), null, { aiAuto: true, dryRun: true }),
    M('05', X, v('s1a'), 'self', 'ai_auto', vn(D, '09:15:00.000'), null, { aiAuto: true }, true),
    M('06', X, v('s1a'), 'self', 'ai_auto', vn(D, '09:20:00.000'), null, { aiAuto: true }, false, true),
    M('07', X, v('s1a'), 'self', 'ai_auto', vn(D, '10:00:00.000'), null, { aiAuto: true, aiFollowup: true }),
    M('08', X, v('s1a'), 'contact', 'user', vn(D, '23:59:59.999'), null),
    M('09', X, v('s1a'), 'self', 'ai_auto', vn(T, '00:00:00.000'), null, { aiAuto: true }),
    M('10', X, v('s1a'), 'self', 'ai_auto', vn(DM1, '23:59:59.999'), null, { aiAuto: true }),
    M('11', X, v('s1a'), 'self', 'ai_auto', vn(D, '11:00:00.000'), null, { aiAuto: true, test: true }),
    M('12', X, v('s1a'), 'self', 'ai_auto', vn(D, '12:00:00.000'), null, { aiAuto: true }),
    M('13', X, v('s1a'), 'self', 'ai_auto', vn(D, '12:30:00.000'), null, { aiAuto: true }),
    M('14', X, v('s1a'), 'self', 'automation', vn(D, '13:00:00.000'), null),
    M('15', X, v('s1'), 'self', 'user', vn(D, '14:00:00.000'), u('dep-s1')),
    M('16', X, v('s1'), 'contact', 'user', vn(D, '14:05:00.000'), null),
    M('17', X, v('s'), 'self', 'user', vn(D, '15:00:00.000'), u('lead-s')),
    M('18', X, v('s'), 'self', 'user_native', vn(D, '15:30:00.000'), u('lead-s')),
    M('19', X, v('ss'), 'self', 'user', vn(D, '16:00:00.000'), u('sale-s')),
    M('20', X, v('ss'), 'contact', 'user', vn(D, '16:10:00.000'), null),
    M('21', X, v('m'), 'self', 'user', vn(D, '10:00:00.000'), u('sale-m')),
    M('22', X, v('m'), 'self', 'ai_auto', vn(D, '10:30:00.000'), null, { aiAuto: true }),
    M('23', X, v('m'), 'contact', 'user', vn(D, '10:20:00.000'), null),
    M('24', X, v('m'), 'self', 'user', vn(D, '10:40:00.000'), u('dep-s1')),
    M('25', X, v('virtual'), 'self', 'ai_auto', vn(D, '11:00:00.000'), null, { aiAuto: true }),
    M('26', X, v('group'), 'contact', 'user', vn(D, '11:00:00.000'), null),
    M('27', X, v('s1a'), 'contact', 'user', vn(T, '08:00:00.000'), null),
    M('28', X, v('s1a'), 'self', 'automation', vn(T, '08:05:00.000'), null),
    M('29', X, v('s1a'), 'self', 'user', vn(T, '08:10:00.000'), u('sale-s1a')),
    M('30', X, v('s1a'), 'self', 'ai_auto', vn(T, '23:00:00.000'), null, { aiAuto: true }),
    M('31', Y, v('y'), 'self', 'ai_auto', vn(D, '12:00:00.000'), null, { aiAuto: true }),
    M('32', Y, v('y'), 'contact', 'user', vn(D, '12:05:00.000'), null),
    M('33', Y, v('y'), 'self', 'user', vn(D, '12:10:00.000'), u('sale-y')),
  ];
  for (const m of msgs) {
    await q(`INSERT INTO messages (id,org_id,conversation_id,sender_type,content,sent_at,sent_via,is_local,is_deleted,metadata,replied_by_user_id) VALUES ($1,$2,$3,$4,'6B synthetic',$5,$6,$7,$8,$9::jsonb,$10)`,
      [m.id, m.org, m.conv, m.st, m.at, m.via, m.local, m.del, JSON.stringify(m.meta), m.by]);
  }
  // AI audit: duplicate reply audit for m03, followup audit for m07, dry-run-only audit for m13, reply for m22/m31.
  const audits = [
    ['a1', X, 'ai_auto_reply_sent', v('s1a'), '6b-m-03', vn(D, '09:05:01.000'), {}],
    ['a2', X, 'ai_auto_reply_sent', v('s1a'), '6b-m-03', vn(D, '09:05:02.000'), {}],
    ['a3', X, 'ai_followup_sent', v('s1a'), '6b-m-07', vn(D, '10:00:01.000'), {}],
    ['a4', X, 'ai_auto_reply_sent', v('s1a'), '6b-m-13', vn(D, '12:30:01.000'), { dryRun: true }],
    ['a5', X, 'ai_auto_reply_sent', v('s1a'), '6b-m-04', vn(D, '09:10:01.000'), { dryRun: true }],
    ['a6', X, 'ai_auto_reply_sent', v('m'), '6b-m-22', vn(D, '10:30:01.000'), {}],
    ['a7', Y, 'ai_auto_reply_sent', v('y'), '6b-m-31', vn(D, '12:00:01.000'), {}],
  ] as const;
  for (const [aid, org, action, conv, mid, at, extra] of audits) {
    await q(`INSERT INTO activity_logs (id,org_id,actor_type,action,entity_type,entity_id,details,created_at) VALUES ($1,$2,'bot',$3,'conversation',$4,$5::jsonb,$6)`,
      [`6b-al-${aid}`, org, action, conv, JSON.stringify({ messageId: mid, ...extra }), at]);
  }
  const drafts = [
    ['s1', X, v('s1a'), 'auto_reply_needs_review', vn(D, '00:00:00.000')], ['s2', X, v('s1a'), 'auto_reply_needs_review', vn(D, '23:59:59.999')],
    ['s3', X, v('s1a'), 'auto_reply_needs_review', vn(T, '00:00:00.000')], ['s4', X, v('m'), 'auto_reply_needs_review', vn(D, '12:00:00.000')],
    ['s5', X, v('s1a'), 'reply_suggestion', vn(D, '10:00:00.000')], ['s6', Y, v('y'), 'auto_reply_needs_review', vn(D, '12:00:00.000')],
  ] as const;
  for (const [sid, org, conv, type, at] of drafts) {
    await q(`INSERT INTO ai_suggestions (id,org_id,conversation_id,type,content,confidence,created_at) VALUES ($1,$2,$3,$4,'6B synthetic draft',0.7,$5)`, [`6b-ai-${sid}`, org, conv, type, at]);
  }
  // Appointments: date-only semantics (frontend sends YYYY-MM-DD → UTC midnight).
  const appts = [
    ['a1', X, c('s1a-start'), u('sale-s1a'), dateOnly(D), 'completed', 'call'], ['a2', X, c('s1a-start'), u('sale-s1a'), dateOnly(D), 'no_show', 'call'],
    ['a3', X, c('s1-before'), u('dep-s1'), dateOnly(T), 'scheduled', 'meeting'], ['a4', X, c('s1-before'), u('dep-s1'), dateOnly(T1), 'scheduled', 'meeting'],
    ['a5', X, c('m-mid'), u('sale-m'), dateOnly(T), 'scheduled', 'call'], ['a6', X, c('s-lead'), u('lead-s'), dateOnly(D), 'completed', 'meeting'],
    ['a7', X, c('s-mid'), u('sale-s'), dateOnly(DM1), 'completed', 'call'], ['a8', X, c('m-mid'), u('sale-m'), dateOnly(D), 'cancelled', 'follow_up'],
    ['ay1', Y, c('y1'), u('sale-y'), dateOnly(T), 'scheduled', 'call'], ['ay2', Y, c('y1'), u('sale-y'), dateOnly(D), 'completed', 'call'],
  ] as const;
  for (const [aid, org, ct, asg, at, st, type] of appts) {
    await q(`INSERT INTO appointments (id,org_id,contact_id,assigned_user_id,appointment_date,appointment_time,status,type,title) VALUES ($1,$2,$3,$4,$5,'09:00',$6,$7,$8)`,
      [`6b-ap-${aid}`, org, ct, asg, at, st, type, `6B ${aid}`]);
  }
  await q(`INSERT INTO lead_requests (id,org_id,requested_by_user_id,contact_id,source,priority_score,expires_at,requested_at,release_reason) VALUES
    ('6b-lr-1',$1,$3,$5,'forgotten',10,$7,$8,NULL),('6b-lr-2',$1,$4,$6,'forgotten',10,$7,$9,NULL),
    ('6b-lr-3',$1,$10,$11,'forgotten',10,$7,$9,'expired'),('6b-lr-y',$2,$12,$13,'forgotten',10,$7,$9,NULL)`,
    [X, Y, u('sale-s1a'), u('lead-m'), c('s1a-start'), c('m-mid'), vn(T1, '00:00:00.000'), vn(D, '10:00:00.000'), vn(D, '11:00:00.000'), u('sale-s'), c('s-mid'), u('sale-y'), c('y1')]);
  await q(`INSERT INTO lead_pool_distributions (id,org_id,contact_id,assigned_to_user_id,source,round,distributed_at) VALUES
    ('6b-lpd-1',$1,$3,$4,'forgotten',1,$7),('6b-lpd-2',$1,$5,$6,'forgotten',1,$7),('6b-lpd-y',$2,$8,$9,'forgotten',1,$7)`,
    [X, Y, c('s1a-start'), u('sale-s1a'), c('m-mid'), u('sale-m'), vn(D, '10:00:00.000'), c('y1'), u('sale-y')]);
  // Automation: friendship attempts (queuedAt cohort) + care session events.
  const fa = [
    [X, n('s1a'), c('s1a-start'), 'accepted', vn(D, '09:00:00.000')], [X, n('s1a'), c('s1a-end'), 'rejected', vn(D, '09:30:00.000')],
    [X, n('s1a'), c('s-mid'), 'sent', vn(D, '10:00:00.000')], [X, n('s'), c('s-lead'), 'no_zalo', vn(D, '10:30:00.000')],
    [X, n('m'), c('m-mid'), 'error', vn(D, '11:00:00.000')], [X, n('s1a'), c('unassigned'), 'accepted', vn(DM1, '23:59:59.999')],
    [X, n('s'), c('s1-after'), 'accepted', vn(T, '00:00:00.000')], [Y, n('y'), c('y1'), 'accepted', vn(D, '12:00:00.000')],
  ] as const;
  for (let i = 0; i < fa.length; i++) {
    const [org, nick, ct, st, at] = fa[i];
    await q(`INSERT INTO friendship_attempts (id,org_id,zalo_account_id,contact_id,state,source,queued_at,sent_at) VALUES ($1,$2,$3,$4,$5,'user',$6,$6)`, [`6b-fa-${i}`, org, nick, ct, st, at]);
  }
  await q(`INSERT INTO care_sessions (id,org_id,contact_id,nick_id,owner_user_id,source_type,state,interest_window_until,opened_at) VALUES
    ('6b-cs-x',$1,$3,$4,$5,'sequence_manual','active',$8,$9),('6b-cs-y',$2,$6,$7,$10,'sequence_manual','active',$8,$9)`,
    [X, Y, c('s1a-start'), n('s1a'), u('sale-s1a'), c('y1'), n('y'), vn(T1, '23:59:59.999'), vn(DM1, '08:00:00.000'), u('sale-y')]);
  const cse = [
    ['1', '6b-cs-x', 'step_sent', vn(D, '08:00:00.000')], ['2', '6b-cs-x', 'step_sent', vn(D, '23:59:59.999')], ['3', '6b-cs-x', 'reply', vn(D, '12:00:00.000')],
    ['4', '6b-cs-x', 'step_sent', vn(T, '00:00:00.000')], ['5', '6b-cs-x', 'enrolled', vn(D, '09:00:00.000')], ['6', '6b-cs-y', 'step_sent', vn(D, '12:00:00.000')],
    ['7', '6b-cs-y', 'reply', vn(D, '13:00:00.000')],
  ] as const;
  for (const [eid, sid, et, at] of cse) await q(`INSERT INTO care_session_events (id,session_id,event_id,event_type,created_at) VALUES ($1,$2,$3,$4,$5)`, [`6b-cse-${eid}`, sid, `6b-ev-${eid}`, et, at]);
  // Broadcast: paused/active jobs only as data rows; nothing is scheduled to run (no cron in harness).
  await q(`INSERT INTO customer_lists (id,org_id,created_by_id,name,source_type,status,started_at,ended_at,updated_at) VALUES ('6b-cl-x',$1,$2,'6B list X','paste','done',$3,$3,now())`, [X, u('adm-x'), vn(DM1, '08:00:00.000')]);
  await q(`INSERT INTO broadcast_jobs (id,org_id,created_by_id,name,customer_list_id,zalo_account_id,message_text,schedule_type,scheduled_at,status,updated_at) VALUES
    ('6b-bj-1',$1,$3,'6B job active','6b-cl-x',$4,'No send: fixture','once',$7,'active',now()),
    ('6b-bj-2',$1,$3,'6B job paused',NULL,$5,'No send: fixture','once',$7,'paused',now()),
    ('6b-bj-y',$2,$6,'6B job Y',NULL,$8,'No send: fixture','once',$7,'paused',now())`,
    [X, Y, u('adm-x'), n('s1a'), n('m'), u('adm-y'), vn(T1, '23:00:00.000'), n('y')]);
  const runs = [
    ['1', '6b-bj-1', X, vn(D, '08:00:00.000'), 5, 1, 2], ['2', '6b-bj-1', X, vn(D, '23:59:59.999'), 2, 0, 1],
    ['3', '6b-bj-2', X, vn(T, '00:00:00.000'), 7, 0, 0], ['4', '6b-bj-2', X, vn(DM1, '23:59:59.999'), 9, 0, 0], ['y', '6b-bj-y', Y, vn(D, '12:00:00.000'), 50, 5, 0],
  ] as const;
  for (const [rid, job, org, at, s, f, k] of runs) {
    await q(`INSERT INTO broadcast_runs (id,job_id,org_id,status,started_at,ended_at,sent_count,failed_count,skipped_count) VALUES ($1,$2,$3,'done',$4,$4,$5,$6,$7)`, [`6b-br-${rid}`, job, org, at, s, f, k]);
  }
  const cfg = (from: string, to: string) => JSON.stringify({ metrics: ['contacts_new'], groupBy: 'day', dateRange: { from, to } });
  await q(`INSERT INTO saved_reports (id,org_id,name,type,config,created_by) VALUES
    ('6b-sr-sub',$1,'6B saved by S1a sale','custom',$3::jsonb,$4),
    ('6b-sr-adm',$1,'6B saved by admin','custom',$3::jsonb,$5),
    ('6b-sr-sale-s',$1,'6B saved by sale S','custom',$3::jsonb,$6),
    ('6b-sr-y',$2,'6B saved org Y','custom',$3::jsonb,$7)`,
    [X, Y, cfg(D, D), u('sale-s1a'), u('adm-x'), u('sale-s'), u('adm-y')]);
  await q('COMMIT');

  const self = (await db.query(`SELECT id, created_at::text t FROM contacts WHERE id = ANY($1) ORDER BY id`, [[c('s1a-start'), c('s1a-end'), c('s1-before'), c('s1-after')]])).rows;
  const apptSelf = (await db.query(`SELECT id, appointment_date::text t FROM appointments WHERE id = ANY($1) ORDER BY id`, [['6b-ap-a3', '6b-ap-a4']])).rows;
  const manifest = { fixture: 'synthetic-reports-6b3', dates: { DM1, D, T, T1, timeZone: 'Asia/Ho_Chi_Minh' }, orgs: { X, Y },
    accounts: users.map(([uid, org, role, , grp, dept, drole]) => ({ id: uid, email: `${uid}@example.invalid`, org, role, grant: grp, dept, deptRole: drole })),
    counts: { contacts: contacts.length, conversations: convs.length, messages: msgs.length, audits: audits.length, drafts: drafts.length, appointments: appts.length, friendshipAttempts: fa.length, careSessionEvents: cse.length, broadcastRuns: runs.length },
    utcSelfCheck: { contacts: self, appointments: apptSelf } };
  await writeFile(resolve(out, 'fixture-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ dates: manifest.dates, counts: manifest.counts, utcSelfCheck: manifest.utcSelfCheck }, null, 1));
} catch (e) {
  await db.query('ROLLBACK').catch(() => undefined);
  throw e;
} finally {
  db.release();
  await pool.end();
}
