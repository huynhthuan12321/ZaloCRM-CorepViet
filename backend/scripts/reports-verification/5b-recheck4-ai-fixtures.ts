// Dedicated synthetic AI orgs in the verified disposable DB. Never imports app,
// provider, queue, cron, sockets or a send/config writer. Run seed, then check.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ownerUrl = 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify';
const url = new URL(ownerUrl);
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55471');
assert.equal(url.pathname, '/reports_1b_verify');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: ownerUrl }) });
const identity = (await db.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db, current_user AS role`)[0];
assert.deepEqual(identity, { db: 'reports_1b_verify', role: 'postgres' });
const artifacts = resolve('../artifacts/reports-mobile-5b-recheck4-20261102');
await mkdir(artifacts, { recursive: true });
const a = 'verify-ai-org-a', b = 'verify-ai-org-b';
const password = 'VerifyLocalOnly-2026!'; // fake disposable credential, not logged

async function seed() {
  const day = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+07:00`);
  const at = new Date(start.getTime() + 9 * 3600000);
  const end = new Date(start.getTime() + 86400000);
  for (const id of [a, b]) await db.organization.upsert({ where: { id }, update: {}, create: { id, name: 'VERIFY AI disposable ' + id } });
  const groupId = 'verify-ai-grant';
  await db.permissionGroup.upsert({ where: { id: groupId }, update: {}, create: { id: groupId, orgId: a, name: 'VERIFY AI report grant', grants: { engagement_score: { access: true }, ai: { access: true } } } });
  const passwordHash = await bcrypt.hash(password, 10);
  for (const [id, orgId, role, fullName] of [
    ['verify-ai-admin', a, 'admin', 'VERIFY AI Admin'], ['verify-ai-admin-b', b, 'admin', 'VERIFY AI Admin B'],
    ['verify-ai-leader', a, 'member', 'VERIFY AI Leader'], ['verify-ai-member', a, 'member', 'VERIFY AI Member'],
    ['verify-ai-sale-a', a, 'member', 'VERIFY AI Sale A'], ['verify-ai-sale-b', a, 'member', 'VERIFY AI Sale B'],
  ] as const) await db.user.upsert({ where: { id }, update: {}, create: {
    id, orgId, role, fullName, email: `${id}@example.test`, passwordHash, passwordChangedAt: new Date(), permissionGroupId: orgId === a ? groupId : undefined,
  } });
  for (const [id, path] of [['verify-ai-dept-a', '/verify-ai-dept-a/'], ['verify-ai-dept-b', '/verify-ai-dept-b/']] as const)
    await db.department.upsert({ where: { id }, update: {}, create: { id, orgId: a, name: id, path } });
  for (const [userId, departmentId, deptRole] of [['verify-ai-leader', 'verify-ai-dept-a', 'leader'], ['verify-ai-member', 'verify-ai-dept-a', 'member'], ['verify-ai-sale-a', 'verify-ai-dept-a', 'member'], ['verify-ai-sale-b', 'verify-ai-dept-b', 'leader']] as const)
    await db.departmentMember.upsert({ where: { userId }, update: {}, create: { userId, departmentId, deptRole } });
  for (const [id, orgId, ownerUserId] of [['verify-ai-nick-a', a, 'verify-ai-sale-a'], ['verify-ai-nick-shared', a, 'verify-ai-sale-b'], ['verify-ai-nick-outside', a, 'verify-ai-sale-b'], ['verify-ai-nick-foreign', b, 'verify-ai-admin-b']] as const)
    await db.zaloAccount.upsert({ where: { id }, update: {}, create: { id, orgId, ownerUserId, displayName: id, zaloUid: id, privacyMode: 'sub' } });
  await db.zaloAccountAccess.upsert({ where: { zaloAccountId_userId: { zaloAccountId: 'verify-ai-nick-shared', userId: 'verify-ai-leader' } }, update: {}, create: { zaloAccountId: 'verify-ai-nick-shared', userId: 'verify-ai-leader' } });
  for (const [id, orgId, nick, virtual, threadType] of [
    ['verify-ai-main', a, 'verify-ai-nick-a', false, 'user'], ['verify-ai-shared', a, 'verify-ai-nick-shared', false, 'user'],
    ['verify-ai-outside', a, 'verify-ai-nick-outside', false, 'user'], ['verify-ai-foreign', b, 'verify-ai-nick-foreign', false, 'user'],
    ['verify-ai-virtual', a, 'verify-ai-nick-a', true, 'user'], ['verify-ai-group', a, 'verify-ai-nick-a', false, 'group'],
  ] as const) await db.conversation.upsert({ where: { id }, update: {}, create: { id, orgId, zaloAccountId: nick, externalThreadId: id, isVirtual: virtual, threadType } });
  const message = async (id: string, extra: Record<string, unknown> = {}) => {
    const data = { orgId: a, conversationId: 'verify-ai-main', senderType: 'self', content: 'FAKE AI fixture NEVER SENT', sentVia: 'ai_auto', sentAt: at, ...extra };
    await db.message.upsert({ where: { id: `verify-ai-${id}` }, update: data, create: { id: `verify-ai-${id}`, ...data } });
  };
  await message('reply', { sentAt: start, metadata: { aiAuto: true } });
  await message('follow', { metadata: { aiAuto: true, aiFollowup: true } });
  await message('legacy', { sentAt: new Date(end.getTime() - 1) });
  await message('metadata', { sentVia: 'user', metadata: { aiAuto: true } });
  await message('audit-follow');
  await message('shared-msg', { conversationId: 'verify-ai-shared', metadata: { aiFollowup: true } });
  await message('outside-msg', { conversationId: 'verify-ai-outside' });
  await message('foreign-msg', { orgId: b, conversationId: 'verify-ai-foreign' });
  await message('before', { sentAt: new Date(start.getTime() - 1) }); await message('end', { sentAt: end });
  await message('dry', { metadata: { aiAuto: true, dryRun: true } });
  await message('dry-string', { metadata: { dryRun: 'true' } });
  await message('test', { metadata: { test: true } }); await message('is-test', { metadata: { isTest: true } });
  await message('local', { isLocal: true }); await message('deleted', { isDeleted: true });
  await message('tombstone', { deletedAt: at });
  await message('virtual-msg', { conversationId: 'verify-ai-virtual' }); await message('group-msg', { conversationId: 'verify-ai-group' });
  await message('human', { sentVia: 'user_native' }); await message('inbound', { senderType: 'contact' });
  await message('metadata-string', { sentVia: 'user', metadata: { aiAuto: 'true' } });
  await message('future', { sentAt: new Date('2099-01-01T00:00:00Z') });
  for (const [id, action, messageId, entityId, orgId] of [
    ['reply-1', 'ai_auto_reply_sent', 'verify-ai-reply', 'verify-ai-main', a], ['reply-2', 'ai_auto_reply_sent', 'verify-ai-reply', 'verify-ai-main', a],
    ['follow', 'ai_followup_sent', 'verify-ai-audit-follow', 'verify-ai-main', a], ['orphan', 'ai_auto_reply_sent', 'missing-message', 'verify-ai-main', a],
    ['foreign', 'ai_auto_reply_sent', 'verify-ai-legacy', 'verify-ai-main', b],
  ] as const) await db.activityLog.upsert({ where: { id: `verify-ai-log-${id}` }, update: { createdAt: at }, create: { id: `verify-ai-log-${id}`, orgId, actorType: 'bot', action, entityType: 'conversation', entityId, details: { messageId }, createdAt: at } });
  for (const [id, orgId, conversationId, type, accepted] of [
    ['draft-1', a, 'verify-ai-main', 'auto_reply_needs_review', false], ['draft-2', a, 'verify-ai-main', 'auto_reply_needs_review', true],
    ['draft-shared', a, 'verify-ai-shared', 'auto_reply_needs_review', false], ['draft-foreign', b, 'verify-ai-foreign', 'auto_reply_needs_review', false],
    ['draft-null', a, null, 'auto_reply_needs_review', false], ['draft-virtual', a, 'verify-ai-virtual', 'auto_reply_needs_review', false],
    ['plain', a, 'verify-ai-main', 'reply_draft', false],
  ] as const) await db.aiSuggestion.upsert({ where: { id: `verify-ai-${id}` }, update: { createdAt: at }, create: { id: `verify-ai-${id}`, orgId, conversationId, type, accepted, content: 'FAKE draft', confidence: 0.8, createdAt: at } });
  await db.contact.upsert({ where: { id: 'verify-ai-contact' }, update: {}, create: { id: 'verify-ai-contact', orgId: a } });
  await db.aiSuggestionApplied.upsert({ where: { id: 'verify-ai-crm-apply' }, update: { createdAt: at }, create: { id: 'verify-ai-crm-apply', orgId: a, contactId: 'verify-ai-contact', messageId: 'verify-ai-reply', userId: 'verify-ai-sale-a', acceptedFields: [{ field: 'name', newValue: 'FAKE' }], createdAt: at } });
  await writeFile(resolve(artifacts, 'fixture.json'), JSON.stringify({ identity, day, start: start.toISOString(), end: end.toISOString(), namespace: 'verify-ai-*', expectedDay: { main: { sentMessages: 5, conversations: 1, autoReplies: 1, followups: 2, unclassified: 2, reviewDraftsCreated: 2 }, shared: { sentMessages: 1, conversations: 1, autoReplies: 0, followups: 1, unclassified: 0, reviewDraftsCreated: 1 } } }, null, 2));
  console.log(`AI_FIXTURE_READY day=${day} disposable=${identity.db}`);
}

async function check() {
  const fixture = JSON.parse(await readFile(resolve(artifacts, 'fixture.json'), 'utf8'));
  const checks: Array<{ name: string; status: string; evidence?: unknown }> = [];
  const run = async (name: string, fn: () => Promise<unknown>) => { const evidence = await fn(); checks.push({ name, status: 'PASS', evidence }); };
  const base = 'http://127.0.0.1:30574';
  async function login(id: string) {
    const r = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${id}@example.test`, password }) });
    assert.equal(r.status, 200); return (await r.json()).token as string;
  }
  const [admin, leader, member, foreign] = await Promise.all(['verify-ai-admin', 'verify-ai-leader', 'verify-ai-member', 'verify-ai-admin-b'].map(login));
  async function request(token?: string, query = `from=${fixture.day}&to=${fixture.day}`) {
    const r = await fetch(`${base}/api/v1/reports/ai?${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: r.status, data: await r.json() };
  }
  await run('JWT missing/tampered rejected', async () => { assert.equal((await request()).status, 401); assert.equal((await request(admin.slice(0, -10) + 'tampered')).status, 401); });
  await run('member with report and AI grants denied', async () => { assert.equal((await request(member)).status, 403); });
  await run('admin org aggregate matches explicit fixture', async () => { const r = await request(admin); assert.equal(r.status, 200); assert.deepEqual(r.data.main.kpis, { ...fixture.expectedDay.main, sentMessages: 7, conversations: 3, followups: 3, unclassified: 3, reviewDraftsCreated: 3 }); assert.equal(r.data.shared, null); return r.data.main.kpis; });
  await run('leader main and explicit shared separated; outside nick denied', async () => { const r = await request(leader); assert.equal(r.status, 200); assert.deepEqual(r.data.main.kpis, fixture.expectedDay.main); assert.deepEqual(r.data.shared.kpis, fixture.expectedDay.shared); assert.equal(r.data.scope.sharedAccounts, 1); return { main: r.data.main.kpis, shared: r.data.shared.kpis }; });
  await run('second org isolated with real JWT', async () => { const r = await request(foreign); assert.equal(r.status, 200); assert.equal(r.data.main.kpis.sentMessages, 1); assert.equal(r.data.main.kpis.reviewDraftsCreated, 1); });
  await run('scope filters cannot expand server scope', async () => { for (const filter of ['orgId=verify-ai-org-b', 'accountId=verify-ai-nick-outside', 'userId=verify-ai-sale-b']) assert.equal((await request(leader, `from=${fixture.day}&to=${fixture.day}&${filter}`)).status, 400); });
  await run('invalid dates and oversized periods rejected', async () => { for (const q of ['from=2026-02-30', 'from=2026-11-02&to=2026-11-01', 'from=2024-01-01&to=2026-11-01']) assert.equal((await request(admin, q)).status, 400); });
  await run('Vietnam boundaries and daily/total classification reconcile', async () => { const r = await request(leader); assert.equal(r.data.timeZone, 'Asia/Ho_Chi_Minh'); assert.equal(r.data.main.series.length, 1); const s = r.data.main.series[0]; assert.equal(s.date, fixture.day); assert.equal(s.sentMessages, 5); assert.equal(s.autoReplies + s.followups + s.unclassified, 5); });
  await run('unknown legacy retained; duplicate/orphan/foreign audit cannot add messages', async () => { const r = await request(leader); assert.equal(r.data.main.kpis.sentMessages, 5); assert.equal(r.data.main.kpis.autoReplies, 1); assert.equal(r.data.main.kpis.unclassified, 2); });
  await run('draft creation not pending/approval; costs/tokens and rates unavailable', async () => { const r = await request(leader); assert.equal(r.data.main.kpis.reviewDraftsCreated, 2); assert.deepEqual(Object.values(r.data.unavailable), [null, null, null, null, null]); assert.equal(r.data.availability.pendingReviews.reason, 'review_lifecycle_unavailable'); });
  await run('empty period yields measured zero, unavailable remains null', async () => { const r = await request(leader, 'from=2025-01-01&to=2025-01-01'); assert.equal(r.status, 200); assert.equal(r.data.main.kpis.sentMessages, 0); assert.equal(r.data.main.kpis.reviewDraftsCreated, 0); assert.equal(r.data.unavailable.cost, null); });
  await run('aggregate response contains no chat or identifiers', async () => { const r = await request(admin); const body = JSON.stringify(r.data); for (const key of ['content', 'messageId', 'contactId', 'conversationId', 'userId', 'displayName', 'acceptedFields']) assert.ok(!body.includes(`"${key}"`)); });
  await run('PostgreSQL oracle excludes local/dry-run/test/deleted/group/virtual/human', async () => {
    const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.org_id=m.org_id WHERE m.org_id=${a} AND c.zalo_account_id='verify-ai-nick-a' AND c.is_virtual=false AND c."threadType"='user' AND c.deleted_at IS NULL AND m.sender_type='self' AND m.is_local=false AND m.is_deleted=false AND m.deleted_at IS NULL AND (m.sent_via='ai_auto' OR m.metadata->'aiAuto'='true'::jsonb) AND COALESCE(m.metadata->>'dryRun','false')<>'true' AND COALESCE(m.metadata->>'test','false')<>'true' AND COALESCE(m.metadata->>'isTest','false')<>'true' AND m.sent_at >= ${new Date(fixture.start)} AND m.sent_at < ${new Date(fixture.end)}`;
    assert.equal(Number(rows[0].count), 5); return { canonicalMessages: Number(rows[0].count) };
  });
  await run('non-owner app role RLS hides other org messages/audits/drafts without org WHERE', async () => {
    const client = new Client({ connectionString: 'postgresql://reports_verify_app@127.0.0.1:55471/reports_1b_verify' }); await client.connect();
    try {
      const role = (await client.query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
      assert.equal(role.role, 'reports_verify_app'); assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false);
      await client.query('BEGIN'); await client.query("SELECT set_config('app.current_org',$1,true)", [a]);
      for (const table of ['messages', 'activity_logs', 'ai_suggestions']) {
        const rows = (await client.query(`SELECT DISTINCT org_id FROM ${table}`)).rows;
        assert.deepEqual(rows.map(r => r.org_id), [a]);
      }
      await client.query('ROLLBACK'); return role;
    } finally { await client.end(); }
  });
  await writeFile(resolve(artifacts, 'db-jwt-http-results.json'), JSON.stringify({ time: new Date().toISOString(), database: identity.db, role: 'reports_verify_app', fixtureDay: fixture.day, passed: checks.length, checks, limitation: 'Local disposable schema from Prisma db push, not migration replay/staging or independent 4B.' }, null, 2));
  console.log(`AI_DB_JWT_HTTP_PASS ${checks.length}/${checks.length}`);
}
try { if (process.argv[2] === 'seed') await seed(); else if (process.argv[2] === 'check') await check(); else throw new Error('Use seed or check'); }
finally { await db.$disconnect(); }



