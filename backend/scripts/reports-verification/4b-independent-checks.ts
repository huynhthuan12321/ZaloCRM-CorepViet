// Independent verification additions. Only synthetic rows in a verified local
// disposable DB are temporarily changed; every mutation is restored in finally.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify' }) });
const identity = (await db.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`)[0];
assert.deepEqual(identity, { db: 'reports_1b_verify', role: 'postgres' });
const root = resolve('../artifacts/reports-ai-4b-2026-11-02');
const fixture = JSON.parse(await readFile(resolve(root, 'fixture.json'), 'utf8'));
const org = 'verify-ai-org-a';
const mainConversation = 'verify-ai-main';
const results: Array<{ name: string; status: 'PASS' | 'FAIL'; evidence?: unknown; error?: string }> = [];
const check = async (name: string, fn: () => Promise<unknown>) => {
  try { results.push({ name, status: 'PASS', evidence: await fn() }); }
  catch (e) { results.push({ name, status: 'FAIL', error: e instanceof Error ? e.message : String(e) }); }
};
const login = async (id: string) => {
  const r = await fetch('http://127.0.0.1:30571/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${id}@example.test`, password: 'VerifyLocalOnly-2026!' }) });
  assert.equal(r.status, 200); return (await r.json()).token as string;
};
const token = await login('verify-ai-leader');
const get = async (query = `from=${fixture.day}&to=${fixture.day}`) => {
  const r = await fetch(`http://127.0.0.1:30571/api/v1/reports/ai?${query}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
};

try {
  await check('row ID oracle independently proves canonical main set and no duplicate count', async () => {
    // Explicit known positives/negatives, not a copy of the aggregate SQL predicate.
    const ids = ['verify-ai-reply', 'verify-ai-follow', 'verify-ai-legacy', 'verify-ai-metadata', 'verify-ai-audit-follow'];
    const rows = await db.message.findMany({ where: { orgId: org, id: { in: ids } }, select: { id: true, sentVia: true, isLocal: true, isDeleted: true, metadata: true, conversationId: true } });
    assert.equal(rows.length, 5);
    for (const row of rows) { assert.equal(row.isLocal, false); assert.equal(row.isDeleted, false); assert.equal(row.conversationId, mainConversation); }
    assert.equal(rows.find(row => row.id === 'verify-ai-metadata')?.sentVia, 'user');
    const r = await get(); assert.equal(r.status, 200);
    assert.deepEqual(r.body.main.kpis, { sentMessages: 5, conversations: 1, autoReplies: 1, followups: 2, unclassified: 2, reviewDraftsCreated: 2 });
    return { ids: rows.map(row => row.id).sort(), kpis: r.body.main.kpis };
  });

  await check('missing all audits preserves messages and metadata followup', async () => {
    const audits = await db.activityLog.findMany({ where: { orgId: org, id: { startsWith: 'verify-ai-log-' } }, select: { id: true, action: true } });
    try {
      await db.activityLog.updateMany({ where: { id: { in: audits.map(row => row.id) }, orgId: org }, data: { action: 'verify_4b_inactive' } });
      const r = await get(); assert.equal(r.status, 200);
      assert.deepEqual(r.body.main.kpis, { sentMessages: 5, conversations: 1, autoReplies: 0, followups: 1, unclassified: 4, reviewDraftsCreated: 2 });
      return r.body.main.kpis;
    } finally { for (const audit of audits) await db.activityLog.update({ where: { id: audit.id }, data: { action: audit.action } }); }
  });

  await check('duplicate and conflicting audit enrich only; human/wrong entity logs ignored', async () => {
    const ids: string[] = [];
    const log = async (suffix: string, messageId: string, action: string, extra: Record<string, unknown> = {}) => {
      const id = `verify-4b-log-${suffix}`; ids.push(id);
      await db.activityLog.create({ data: { id, orgId: org, actorType: 'bot', action, entityType: 'conversation', entityId: mainConversation, details: { messageId }, ...extra } });
    };
    try {
      await log('duplicate', 'verify-ai-reply', 'ai_auto_reply_sent');
      await log('conflict-reply', 'verify-ai-legacy', 'ai_auto_reply_sent');
      await log('conflict-follow', 'verify-ai-legacy', 'ai_followup_sent');
      await log('human', 'verify-ai-metadata', 'ai_auto_reply_sent', { actorType: 'user' });
      await log('wrong-entity', 'verify-ai-metadata', 'ai_auto_reply_sent', { entityId: 'verify-ai-outside' });
      await log('dry', 'verify-ai-metadata', 'ai_auto_reply_sent', { details: { messageId: 'verify-ai-metadata', dryRun: true } });
      const r = await get(); assert.equal(r.status, 200);
      assert.deepEqual(r.body.main.kpis, fixture.expectedDay.main);
      return { unclassified: r.body.main.kpis.unclassified, total: r.body.main.kpis.sentMessages };
    } finally { await db.activityLog.deleteMany({ where: { orgId: org, id: { in: ids } } }); }
  });

  await check('audit without an eligible Message cannot recover local/dry-run send', async () => {
    const message = await db.message.findUniqueOrThrow({ where: { id: 'verify-ai-reply' } });
    try {
      await db.message.update({ where: { id: message.id }, data: { isLocal: true } });
      const r = await get(); assert.equal(r.status, 200); assert.equal(r.body.main.kpis.sentMessages, 4); assert.equal(r.body.main.kpis.autoReplies, 0);
    } finally { await db.message.update({ where: { id: message.id }, data: { isLocal: message.isLocal } }); }
  });

  await check('accepted drafts and CRM applies never become pending/send approvals', async () => {
    const drafts = await db.aiSuggestion.findMany({ where: { orgId: org, conversationId: mainConversation, type: 'auto_reply_needs_review' }, select: { id: true, accepted: true } });
    const applied = await db.aiSuggestionApplied.count({ where: { orgId: org } }); assert.equal(applied, 1);
    try {
      await db.aiSuggestion.updateMany({ where: { orgId: org, id: { in: drafts.map(row => row.id) } }, data: { accepted: true } });
      const r = await get(); assert.equal(r.status, 200); assert.equal(r.body.main.kpis.reviewDraftsCreated, 2); assert.equal(r.body.main.kpis.sentMessages, 5); assert.equal(r.body.unavailable.pendingReviews, null);
      return { createdDrafts: 2, crmApplies: applied, pending: null };
    } finally { for (const draft of drafts) await db.aiSuggestion.update({ where: { id: draft.id }, data: { accepted: draft.accepted } }); }
  });

  await check('same conversation across Vietnam dates remains distinct once', async () => {
    const startDay = new Date(new Date(fixture.start).getTime() - 86400000 + 7 * 3600000).toISOString().slice(0, 10);
    const endDay = new Date(new Date(fixture.end).getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const r = await get(`from=${startDay}&to=${endDay}`); assert.equal(r.status, 200);
    assert.equal(r.body.main.kpis.sentMessages, 7); assert.equal(r.body.main.kpis.conversations, 1);
    assert.deepEqual(r.body.main.series.map((row: any) => row.sentMessages), [1, 5, 1]);
    return r.body.main.series;
  });

  await check('future date containing a stored AI row is zero before asOf', async () => {
    assert.equal(await db.message.count({ where: { id: 'verify-ai-future' } }), 1);
    const r = await get('from=2099-01-01&to=2099-01-01'); assert.equal(r.status, 200); assert.equal(r.body.main.kpis.sentMessages, 0);
  });

  await check('AI/settings-only grant cannot grant report access with existing leader JWT', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: 'verify-ai-leader' }, select: { permissionGroupId: true } });
    await db.permissionGroup.upsert({ where: { id: 'verify-4b-ai-only' }, update: {}, create: { id: 'verify-4b-ai-only', orgId: org, name: 'VERIFY AI config only', grants: { ai: { access: true }, settings: { access: true } } } });
    try {
      await db.user.update({ where: { id: 'verify-ai-leader' }, data: { permissionGroupId: 'verify-4b-ai-only' } });
      assert.equal((await get()).status, 403);
    } finally { await db.user.update({ where: { id: 'verify-ai-leader' }, data: { permissionGroupId: user.permissionGroupId } }); }
  });

  await check('current deputy membership authorizes; downgraded member denies same JWT', async () => {
    const membership = await db.departmentMember.findUniqueOrThrow({ where: { userId: 'verify-ai-leader' } });
    try {
      await db.departmentMember.update({ where: { userId: 'verify-ai-leader' }, data: { deptRole: 'deputy' } }); assert.equal((await get()).status, 200);
      await db.departmentMember.update({ where: { userId: 'verify-ai-leader' }, data: { deptRole: 'member' } }); assert.equal((await get()).status, 403);
    } finally { await db.departmentMember.update({ where: { userId: 'verify-ai-leader' }, data: { deptRole: membership.deptRole } }); }
  });

  await check('revoked explicit shared grant removes shared without expanding main', async () => {
    const key = { zaloAccountId: 'verify-ai-nick-shared', userId: 'verify-ai-leader' };
    const grant = await db.zaloAccountAccess.findUniqueOrThrow({ where: { zaloAccountId_userId: key } });
    try {
      await db.zaloAccountAccess.delete({ where: { zaloAccountId_userId: key } });
      const r = await get(); assert.equal(r.status, 200); assert.equal(r.body.shared, null); assert.equal(r.body.scope.sharedAccounts, 0); assert.deepEqual(r.body.main.kpis, fixture.expectedDay.main);
    } finally { await db.zaloAccountAccess.create({ data: grant }); }
  });

  await check('deleted conversation excluded from both messages and draft history', async () => {
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: mainConversation }, select: { deletedAt: true } });
    try {
      await db.conversation.update({ where: { id: mainConversation }, data: { deletedAt: new Date() } });
      const r = await get(); assert.equal(r.status, 200); assert.equal(r.body.main.kpis.sentMessages, 0); assert.equal(r.body.main.kpis.reviewDraftsCreated, 0); assert.equal(r.body.shared.kpis.sentMessages, 1);
    } finally { await db.conversation.update({ where: { id: mainConversation }, data: { deletedAt: conversation.deletedAt } }); }
  });

  await check('query arrays/unknown filters rejected; restored fixture still equals oracle', async () => {
    for (const query of ['from=2026-11-01&from=2026-11-02', 'scope=org', 'includeShared=false', 'from=2026-01-01&to=2027-01-02']) assert.equal((await get(query)).status, 400);
    const r = await get(); assert.equal(r.status, 200); assert.deepEqual(r.body.main.kpis, fixture.expectedDay.main); assert.deepEqual(r.body.shared.kpis, fixture.expectedDay.shared);
  });
} finally {
  await db.$disconnect();
  const failed = results.filter(row => row.status === 'FAIL').length;
  await writeFile(resolve(root, 'independent-db-results.json'), JSON.stringify({ time: new Date().toISOString(), identity, fixtureDay: fixture.day, passed: results.length - failed, failed, results, limitation: 'Disposable DB + real JWT/HTTP. Verification-only temporary fixture changes restored; no real provider.' }, null, 2));
  console.log(`INDEPENDENT_4B_DB ${results.length - failed}/${results.length} PASS; ${failed} FAIL`);
  if (failed) { console.log(JSON.stringify(results.filter(row => row.status === 'FAIL'))); process.exitCode = 1; }
}
