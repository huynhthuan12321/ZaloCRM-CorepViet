import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { hash } from 'bcryptjs';

const databaseUrl = process.env.REPORTS_6A_OWNER_DATABASE_URL;
const artifactDir = process.env.REPORTS_6A_ARTIFACT_DIR;
if (!databaseUrl || !artifactDir) throw new Error('Explicit 6A owner database URL and artifact directory are required.');

const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== '127.0.0.1' ||
  parsedUrl.port !== '55489' ||
  parsedUrl.pathname !== '/reports_6a_verify' ||
  parsedUrl.username !== 'postgres'
) {
  throw new Error('Refusing to seed: database URL is not the verified disposable 6A target.');
}

const pool = new Pool({ connectionString: databaseUrl, application_name: 'reports-6a-fixture' });
const id = (name: string) => `6a-${name}`;
const addDays = (date: string, days: number) => {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);
const beforeYesterday = addDays(yesterday, -1);
const atVn = (date: string, time: string) => new Date(`${date}T${time}+07:00`);
const password = '6A-local-fixture-only-20261102';

const ids = {
  orgA: id('org-a'),
  orgB: id('org-b'),
  adminA: id('user-admin-a'),
  leaderA: id('user-leader-a'),
  deputyA: id('user-deputy-a'),
  memberA: id('user-member-a'),
  memberB: id('user-member-b'),
  adminB: id('user-admin-b'),
  groupLeader: id('group-report-grant'),
  groupMember: id('group-no-report-grant'),
  deptA: id('dept-a'),
  deptSub: id('dept-a-sub'),
  deptB: id('dept-b'),
  deptOrgB: id('dept-org-b'),
  nickMain: id('nick-main'),
  nickSub: id('nick-sub'),
  nickShared: id('nick-shared'),
  nickPrivate: id('nick-private'),
  nickOrgB: id('nick-org-b'),
  contactMain: id('contact-main'),
  contactSub: id('contact-sub'),
  contactShared: id('contact-shared'),
  contactPrivate: id('contact-private'),
  contactBefore: id('contact-before-boundary'),
  contactOrgB: id('contact-org-b'),
  statusNewA: id('status-a-new'),
  statusWonA: id('status-a-won'),
  statusNewB: id('status-b-new'),
  conversationMain: id('conversation-main'),
  conversationSub: id('conversation-sub'),
  conversationShared: id('conversation-shared'),
  conversationPrivate: id('conversation-private'),
  conversationOrgB: id('conversation-org-b'),
  savedReportA: id('saved-report-leader'),
  savedReportB: id('saved-report-org-b'),
};

const userRows = [
  [ids.adminA, ids.orgA, 'admin', 'Fixture Admin A', '6a-admin-a@example.invalid', null, null],
  [ids.leaderA, ids.orgA, 'member', 'Fixture Leader A', '6a-leader-a@example.invalid', ids.groupLeader, ids.deptA],
  [ids.deputyA, ids.orgA, 'member', 'Fixture Deputy A', '6a-deputy-a@example.invalid', ids.groupLeader, ids.deptA],
  [ids.memberA, ids.orgA, 'member', 'Fixture Member A', '6a-member-a@example.invalid', ids.groupMember, ids.deptSub],
  [ids.memberB, ids.orgA, 'member', 'Fixture Member B', '6a-member-b@example.invalid', ids.groupMember, ids.deptB],
  [ids.adminB, ids.orgB, 'admin', 'Fixture Admin B', '6a-admin-b@example.invalid', null, ids.deptOrgB],
] as const;

const fixtureRows = [
  ['orgs', 'organizations', 2],
  ['users', 'users', userRows.length],
  ['accounts', 'zalo_accounts', 5],
  ['statuses', 'statuses', 3],
  ['departments', 'departments', 4],
  ['departmentMembers', 'department_members', 5],
  ['accountAccess', 'zalo_account_access', 2],
  ['accountStatusLogs', 'zalo_account_status_log', 2],
  ['contacts', 'contacts', 6],
  ['conversations', 'conversations', 5],
  ['messages', 'messages', 13],
  ['appointments', 'appointments', 4],
  ['activityLogs', 'activity_logs', 7],
  ['aiSuggestions', 'ai_suggestions', 2],
  ['friendshipAttempts', 'friendship_attempts', 4],
  ['careSessions', 'care_sessions', 2],
  ['careSessionEvents', 'care_session_events', 5],
  ['automationEventLogs', 'automation_event_log', 2],
  ['broadcastJobs', 'broadcast_jobs', 2],
  ['broadcastRuns', 'broadcast_runs', 2],
  ['leadRequests', 'lead_requests', 2],
  ['leadPoolDistributions', 'lead_pool_distributions', 2],
  ['engagementDaily', 'contact_engagement_daily', 3],
  ['savedReports', 'saved_reports', 2],
] as const;

async function main() {
  const client = await pool.connect();
  try {
    const identity = await client.query(
      `SELECT current_database() AS database, current_user AS db_user, inet_server_port() AS server_port`,
    );
    const db = identity.rows[0];
    if (db.database !== 'reports_6a_verify' || db.db_user !== 'postgres' || Number(db.server_port) !== 5432) {
      throw new Error(`Refusing to seed unexpected database identity: ${JSON.stringify(db)}`);
    }

    const tables = await client.query(
      `SELECT schemaname, relname FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`,
    );
    if (tables.rowCount !== 122) {
      throw new Error(`Expected the verified 122-table Prisma schema; found ${tables.rowCount}.`);
    }
    const nonEmpty: string[] = [];
    for (const table of tables.rows) {
      const count = await client.query(
        `SELECT count(*)::int AS count FROM public."${String(table.relname).replaceAll('"', '""')}"`,
      );
      if (count.rows[0].count !== 0) nonEmpty.push(`${table.relname}:${count.rows[0].count}`);
    }
    if (nonEmpty.length) throw new Error(`Refusing to seed non-empty database: ${nonEmpty.join(', ')}`);

    const rls = await client.query(
      `SELECT count(*)::int AS total,
        count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity)::int AS forced
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p')`,
    );
    if (Number(rls.rows[0].total) !== 122 || Number(rls.rows[0].forced) !== 70) {
      throw new Error(`RLS baseline changed; inspect catalog before seeding: ${JSON.stringify(rls.rows[0])}`);
    }

    const passwordHash = await hash(password, 10);
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO organizations (id, name, timezone, updated_at) VALUES
        ($1, '6A Fixture Org A', '+07:00', now()), ($2, '6A Fixture Org B', '+07:00', now())`,
      [ids.orgA, ids.orgB],
    );
    await client.query(
      `INSERT INTO permission_groups (id, org_id, name, grants, updated_at)
       VALUES ($1, $2, '6A Report Grant', $3::jsonb, now()), ($4, $2, '6A No Report Grant', '{}'::jsonb, now())`,
      [ids.groupLeader, ids.orgA, JSON.stringify({ engagement_score: { access: true } }), ids.groupMember],
    );
    await client.query(
      `INSERT INTO departments (id, org_id, name, parent_id, path, depth, updated_at) VALUES
        ($1, $4, '6A A', NULL, '/' || $1 || '/', 0, now()),
        ($2, $4, '6A A Child', $1, '/' || $1 || '/' || $2 || '/', 1, now()),
        ($3, $4, '6A B', NULL, '/' || $3 || '/', 0, now()),
        ($5, $6, '6A Org B', NULL, '/' || $5 || '/', 0, now())`,
      [ids.deptA, ids.deptSub, ids.deptB, ids.orgA, ids.deptOrgB, ids.orgB],
    );
    for (const [userId, orgId, role, fullName, email, groupId] of userRows) {
      await client.query(
        `INSERT INTO users (id, org_id, role, full_name, email, password_hash, permission_group_id, password_changed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
        [userId, orgId, role, fullName, email, passwordHash, groupId],
      );
    }
    for (const [userId, _orgId, _role, _name, _email, _groupId, departmentId] of userRows) {
      if (departmentId) {
        const deptRole =
          userId === ids.leaderA ? 'leader' :
          userId === ids.deputyA ? 'deputy' : 'member';
        await client.query(
          `INSERT INTO department_members (id, department_id, user_id, dept_role)
           VALUES ($1, $2, $3, $4)`,
          [id(`department-member-${userId}`), departmentId, userId, deptRole],
        );
      }
    }
    await client.query(
      `INSERT INTO statuses (id, org_id, name, "order", is_terminal, updated_at) VALUES
        ($1, $3, '6A New', 1, false, now()), ($2, $3, '6A Won', 2, true, now()), ($4, $5, '6A B New', 1, false, now())`,
      [ids.statusNewA, ids.statusWonA, ids.orgA, ids.statusNewB, ids.orgB],
    );
    await client.query(
      `INSERT INTO zalo_accounts (id, org_id, owner_user_id, display_name, status, privacy_mode, zalo_uid)
       VALUES
        ($1, $6, $7, '6A Main Nick', 'connected', 'main', '6a-uid-main'),
        ($2, $6, $8, '6A Child Nick', 'connected', 'sub', '6a-uid-sub'),
        ($3, $6, $9, '6A Shared Nick', 'connected', 'sub', '6a-uid-shared'),
        ($4, $6, $9, '6A Private Nick', 'connected', 'main', '6a-uid-private'),
        ($5, $10, $11, '6A Org B Nick', 'connected', 'sub', '6a-uid-org-b')`,
      [
        ids.nickMain, ids.nickSub, ids.nickShared, ids.nickPrivate, ids.nickOrgB,
        ids.orgA, ids.leaderA, ids.memberA, ids.memberB, ids.orgB, ids.adminB,
      ],
    );
    await client.query(
      `INSERT INTO zalo_account_access (id, zalo_account_id, user_id, permission)
       VALUES ($1, $2, $3, 'read'), ($4, $5, $6, 'read')`,
      [id('shared-grant-leader'), ids.nickShared, ids.leaderA, id('shared-grant-deputy'), ids.nickShared, ids.deputyA],
    );
    await client.query(
      `INSERT INTO zalo_account_status_log (id, org_id, account_id, status, reason, started_at)
       VALUES
        ($1, $3, $4, 'connected', 'reconnect_ok', $5),
        ($2, $6, $7, 'connected', 'reconnect_ok', $5)`,
      [
        id('account-status-a'), id('account-status-b'), ids.orgA, ids.nickMain, atVn(yesterday, '08:00:00.000'),
        ids.orgB, ids.nickOrgB,
      ],
    );

    const contacts = [
      [ids.contactMain, ids.orgA, ids.leaderA, ids.statusNewA, '6A Main Customer', atVn(yesterday, '00:00:00.000')],
      [ids.contactSub, ids.orgA, ids.memberA, ids.statusWonA, '6A Child Customer', atVn(yesterday, '12:00:00.000')],
      [ids.contactShared, ids.orgA, ids.memberB, ids.statusNewA, '6A Shared Customer', atVn(yesterday, '23:59:59.999')],
      [ids.contactPrivate, ids.orgA, ids.memberB, ids.statusNewA, '6A Private Customer', atVn(today, '00:00:00.000')],
      [ids.contactBefore, ids.orgA, ids.leaderA, ids.statusNewA, '6A Before Boundary', atVn(beforeYesterday, '23:59:59.999')],
      [ids.contactOrgB, ids.orgB, ids.adminB, ids.statusNewB, '6A Org B Customer', atVn(yesterday, '12:00:00.000')],
    ] as const;
    for (const [contactId, orgId, assignedUserId, statusId, fullName, createdAt] of contacts) {
      await client.query(
        `INSERT INTO contacts (id, org_id, assigned_user_id, status_id, full_name, created_at, updated_at, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
        [contactId, orgId, assignedUserId, statusId, fullName, createdAt, `849${contactId.replace(/\D/g, '').slice(-8)}`],
      );
    }

    const conversations = [
      [ids.conversationMain, ids.orgA, ids.nickMain, ids.contactMain, '6a-thread-main'],
      [ids.conversationSub, ids.orgA, ids.nickSub, ids.contactSub, '6a-thread-sub'],
      [ids.conversationShared, ids.orgA, ids.nickShared, ids.contactShared, '6a-thread-shared'],
      [ids.conversationPrivate, ids.orgA, ids.nickPrivate, ids.contactPrivate, '6a-thread-private'],
      [ids.conversationOrgB, ids.orgB, ids.nickOrgB, ids.contactOrgB, '6a-thread-org-b'],
    ] as const;
    for (const [conversationId, orgId, nickId, contactId, threadId] of conversations) {
      await client.query(
        `INSERT INTO conversations (id, org_id, zalo_account_id, contact_id, external_thread_id, "threadType", thread_kind)
         VALUES ($1, $2, $3, $4, $5, 'user', 'dm')`,
        [conversationId, orgId, nickId, contactId, threadId],
      );
    }

    const messageRows = [
      [id('msg-main-start-inbound'), ids.orgA, ids.conversationMain, 'contact', atVn(yesterday, '00:00:00.000'), 'user', false, false, {}],
      [id('msg-main-ai-reply'), ids.orgA, ids.conversationMain, 'self', atVn(yesterday, '11:00:00.000'), 'ai_auto', false, false, { aiAuto: true }],
      [id('msg-main-ai-followup'), ids.orgA, ids.conversationMain, 'self', atVn(yesterday, '13:00:00.000'), 'ai_auto', false, false, { aiAuto: true, aiFollowup: true }],
      [id('msg-main-ai-dry-run'), ids.orgA, ids.conversationMain, 'self', atVn(yesterday, '14:00:00.000'), 'ai_auto', false, false, { aiAuto: true, dryRun: true }],
      [id('msg-main-human'), ids.orgA, ids.conversationMain, 'self', atVn(yesterday, '15:00:00.000'), 'user', false, false, {}],
      [id('msg-main-ai-local'), ids.orgA, ids.conversationMain, 'self', atVn(yesterday, '16:00:00.000'), 'ai_auto', true, false, { aiAuto: true }],
      [id('msg-main-deleted'), ids.orgA, ids.conversationMain, 'self', atVn(yesterday, '17:00:00.000'), 'ai_auto', false, true, { aiAuto: true }],
      [id('msg-main-end-inbound'), ids.orgA, ids.conversationMain, 'contact', atVn(yesterday, '23:59:59.999'), 'user', false, false, {}],
      [id('msg-main-after-end'), ids.orgA, ids.conversationMain, 'self', atVn(today, '00:00:00.000'), 'ai_auto', false, false, { aiAuto: true }],
      [id('msg-sub-ai-unclassified'), ids.orgA, ids.conversationSub, 'self', atVn(yesterday, '10:00:00.000'), 'ai_auto', false, false, { aiAuto: true }],
      [id('msg-shared-ai'), ids.orgA, ids.conversationShared, 'self', atVn(yesterday, '12:00:00.000'), 'ai_auto', false, false, { aiAuto: true }],
      [id('msg-private-ai'), ids.orgA, ids.conversationPrivate, 'self', atVn(yesterday, '12:30:00.000'), 'ai_auto', false, false, { aiAuto: true }],
      [id('msg-org-b-ai'), ids.orgB, ids.conversationOrgB, 'self', atVn(yesterday, '12:00:00.000'), 'ai_auto', false, false, { aiAuto: true }],
    ] as const;
    for (const [messageId, orgId, conversationId, senderType, sentAt, sentVia, isLocal, isDeleted, metadata] of messageRows) {
      await client.query(
        `INSERT INTO messages (id, org_id, conversation_id, sender_type, content, sent_at, sent_via, is_local, is_deleted, metadata, replied_by_user_id)
         VALUES ($1, $2, $3, $4, '6A synthetic message', $5, $6, $7, $8, $9::jsonb, $10)`,
        [
          messageId, orgId, conversationId, senderType, sentAt, sentVia, isLocal, isDeleted,
          JSON.stringify(metadata), senderType === 'self' && sentVia === 'user' ? ids.leaderA : null,
        ],
      );
    }

    const auditRows = [
      ['ai-reply-audit', ids.orgA, 'ai_auto_reply_sent', 'bot', ids.conversationMain, id('msg-main-ai-reply'), atVn(yesterday, '11:00:01.000'), false],
      ['ai-followup-audit-one', ids.orgA, 'ai_followup_sent', 'bot', ids.conversationMain, id('msg-main-ai-followup'), atVn(yesterday, '13:00:01.000'), false],
      ['ai-followup-audit-duplicate', ids.orgA, 'ai_followup_sent', 'bot', ids.conversationMain, id('msg-main-ai-followup'), atVn(yesterday, '13:00:02.000'), false],
      ['ai-dry-run-audit', ids.orgA, 'ai_auto_reply_sent', 'bot', ids.conversationMain, id('msg-main-ai-dry-run'), atVn(yesterday, '14:00:01.000'), true],
      ['human-action', ids.orgA, 'contact_updated', 'user', ids.conversationMain, null, atVn(yesterday, '20:00:00.000'), false],
      ['future-audit', ids.orgA, 'contact_updated', 'user', ids.conversationMain, null, new Date(Date.now() + 60 * 60 * 1000), false],
      ['cross-org-audit', ids.orgB, 'contact_updated', 'user', ids.conversationOrgB, null, atVn(yesterday, '18:00:00.000'), false],
    ] as const;
    for (const [suffix, orgId, action, actorType, entityId, messageId, createdAt, dryRun] of auditRows) {
      await client.query(
        `INSERT INTO activity_logs (id, org_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES ($1, $2, $3, $4, 'conversation', $5, $6::jsonb, $7)`,
        [
          id(`activity-${suffix}`), orgId, actorType, action, entityId,
          JSON.stringify(messageId ? { messageId, ...(dryRun ? { dryRun: true } : {}) } : {}),
          createdAt,
        ],
      );
    }
    await client.query(
      `INSERT INTO ai_suggestions (id, org_id, conversation_id, type, content, confidence, created_at)
       VALUES ($1, $2, $3, 'auto_reply_needs_review', 'Synthetic review draft', 0.75, $4),
              ($5, $6, $7, 'auto_reply_needs_review', 'Synthetic shared review draft', 0.75, $4)`,
      [id('ai-draft-main'), ids.orgA, ids.conversationMain, atVn(yesterday, '18:00:00.000'), id('ai-draft-shared'), ids.orgA, ids.conversationShared],
    );
    await client.query(
      `INSERT INTO appointments (id, org_id, contact_id, assigned_user_id, appointment_date, status, title)
       VALUES
        ($1, $5, $6, $7, $8, 'scheduled', '6A today'),
        ($2, $5, $6, $7, $9, 'scheduled', '6A tomorrow'),
        ($3, $5, $6, $7, $10, 'completed', '6A period boundary'),
        ($4, $11, $12, $13, $8, 'scheduled', '6A org B today')`,
      [
        id('appointment-today'), id('appointment-tomorrow'), id('appointment-period-complete'), id('appointment-org-b'),
        ids.orgA, ids.contactMain, ids.leaderA, atVn(today, '09:00:00.000'), atVn(tomorrow, '09:00:00.000'),
        atVn(yesterday, '23:59:59.999'), ids.orgB, ids.contactOrgB, ids.adminB,
      ],
    );

    const attemptRows = [
      [ids.orgA, ids.nickMain, ids.contactMain, 'accepted', atVn(yesterday, '09:00:00.000')],
      [ids.orgA, ids.nickMain, ids.contactSub, 'rejected', atVn(yesterday, '10:00:00.000')],
      [ids.orgA, ids.nickSub, ids.contactSub, 'no_zalo', atVn(yesterday, '11:00:00.000')],
      [ids.orgB, ids.nickOrgB, ids.contactOrgB, 'accepted', atVn(yesterday, '12:00:00.000')],
    ] as const;
    for (let i = 0; i < attemptRows.length; i++) {
      const [orgId, nickId, contactId, state, queuedAt] = attemptRows[i];
      await client.query(
        `INSERT INTO friendship_attempts (id, org_id, zalo_account_id, contact_id, state, source, queued_at, sent_at)
         VALUES ($1, $2, $3, $4, $5, 'user', $6, $6)`,
        [id(`friendship-attempt-${i}`), orgId, nickId, contactId, state, queuedAt],
      );
    }

    await client.query(
      `INSERT INTO care_sessions (id, org_id, contact_id, nick_id, owner_user_id, source_type, state, interest_window_until, opened_at)
       VALUES
        ($1, $3, $4, $5, $6, 'sequence_manual', 'active', $7, $8),
        ($2, $9, $10, $11, $12, 'sequence_manual', 'active', $7, $8)`,
      [
        id('care-session-a'), id('care-session-b'), ids.orgA, ids.contactMain, ids.nickMain, ids.leaderA,
        atVn(tomorrow, '23:59:59.999'), atVn(yesterday, '08:00:00.000'),
        ids.orgB, ids.contactOrgB, ids.nickOrgB, ids.adminB,
      ],
    );
    await client.query(
      `INSERT INTO care_session_events (id, session_id, event_id, event_type, created_at)
       VALUES
        ($1, $2, '6a-step-1', 'step_sent', $7),
        ($3, $2, '6a-step-2', 'step_sent', $8),
        ($4, $2, '6a-reply-1', 'reply', $9),
        ($5, $6, '6a-step-org-b', 'step_sent', $7),
        ($10, $6, '6a-future-step', 'step_sent', $11)`,
      [
        id('care-event-a-step-1'), id('care-session-a'), id('care-event-a-step-2'), id('care-event-a-reply'),
        id('care-event-b-step'), id('care-session-b'), atVn(yesterday, '09:00:00.000'),
        atVn(yesterday, '10:00:00.000'), atVn(yesterday, '11:00:00.000'), id('care-event-a-future'),
        new Date(Date.now() + 60 * 60 * 1000),
      ],
    );
    await client.query(
      `INSERT INTO automation_event_log (id, org_id, event_type, event_priority, detail, created_at)
       VALUES ($1, $3, '6a_fixture_completed', 'info', 'Synthetic only', $4),
              ($2, $5, '6a_fixture_completed', 'info', 'Synthetic only', $4)`,
      [id('automation-event-a'), id('automation-event-b'), ids.orgA, atVn(yesterday, '15:00:00.000'), ids.orgB],
    );

    await client.query(
      `INSERT INTO customer_lists (id, org_id, created_by_id, name, source_type, status, started_at, ended_at, updated_at)
       VALUES ($1, $2, $3, '6A paused fixture list', 'paste', 'done', $4, $4, now())`,
      [id('customer-list-a'), ids.orgA, ids.adminA, atVn(yesterday, '08:00:00.000')],
    );
    await client.query(
      `INSERT INTO broadcast_jobs (id, org_id, created_by_id, name, customer_list_id, zalo_account_id, message_text, schedule_type, scheduled_at, status, updated_at)
       VALUES
        ($1, $2, $3, '6A paused broadcast', $4, $5, 'No send: paused fixture', 'once', $6, 'paused', now()),
        ($7, $8, $9, '6A org B paused broadcast', NULL, $10, 'No send: paused fixture', 'once', $6, 'paused', now())`,
      [
        id('broadcast-job-a'), ids.orgA, ids.adminA, id('customer-list-a'), ids.nickMain,
        atVn(yesterday, '08:00:00.000'), id('broadcast-job-b'), ids.orgB, ids.adminB, ids.nickOrgB,
      ],
    );
    await client.query(
      `INSERT INTO broadcast_runs (id, job_id, org_id, status, started_at, ended_at, sent_count, failed_count, skipped_count)
       VALUES
        ($1, $3, $5, 'done', $6, $7, 3, 1, 2),
        ($2, $4, $8, 'done', $6, $7, 99, 9, 8)`,
      [
        id('broadcast-run-a'), id('broadcast-run-b'), id('broadcast-job-a'), id('broadcast-job-b'),
        ids.orgA, atVn(yesterday, '08:00:00.000'), atVn(yesterday, '08:05:00.000'), ids.orgB,
      ],
    );
    await client.query(
      `INSERT INTO lead_requests (id, org_id, requested_by_user_id, contact_id, source, priority_score, expires_at, requested_at)
       VALUES
        ($1, $3, $4, $5, 'forgotten', 20, $6, $7),
        ($2, $8, $9, $10, 'forgotten', 20, $6, $7)`,
      [
        id('lead-request-a'), id('lead-request-b'), ids.orgA, ids.leaderA, ids.contactMain,
        atVn(tomorrow, '00:00:00.000'), atVn(yesterday, '10:00:00.000'),
        ids.orgB, ids.adminB, ids.contactOrgB,
      ],
    );
    await client.query(
      `INSERT INTO lead_pool_distributions (id, org_id, contact_id, assigned_to_user_id, source, round, distributed_at)
       VALUES
        ($1, $3, $4, $5, 'forgotten', 1, $7),
        ($2, $6, $8, $9, 'forgotten', 1, $7)`,
      [
        id('lead-distribution-a'), id('lead-distribution-b'), ids.orgA, ids.contactMain, ids.leaderA,
        ids.orgB, atVn(yesterday, '10:00:00.000'), ids.contactOrgB, ids.adminB,
      ],
    );
    await client.query(
      `INSERT INTO contact_engagement_daily (id, org_id, contact_id, date, inbound_msg_count, outbound_msg_count, customer_initiated, daily_intensity, updated_at)
       VALUES
        ($1, $4, $5, $6::date, 3, 2, true, 80, now()),
        ($2, $4, $7, $6::date, 1, 4, false, 50, now()),
        ($3, $8, $9, $6::date, 9, 9, true, 90, now())`,
      [id('engagement-main'), id('engagement-sub'), id('engagement-org-b'), ids.orgA, ids.contactMain, yesterday, ids.contactSub, ids.orgB, ids.contactOrgB],
    );

    await client.query(
      `INSERT INTO saved_reports (id, org_id, name, type, config, created_by)
       VALUES
        ($1, $2, '6A leader team report', 'custom', $3::jsonb, $4),
        ($5, $6, '6A cross-org report', 'custom', $3::jsonb, $7)`,
      [
        ids.savedReportA, ids.orgA,
        JSON.stringify({ metrics: ['contacts_new'], groupBy: 'day', dateRange: { from: yesterday, to: yesterday } }),
        ids.memberA, ids.savedReportB, ids.orgB, ids.adminB,
      ],
    );
    await client.query('COMMIT');

    const manifest = {
      fixture: 'synthetic-reports-6a',
      database: { name: db.database, port: db.server_port, host: '127.0.0.1', containerPort: 5432 },
      dates: { yesterday, today, tomorrow, beforeYesterday, timezone: 'Asia/Ho_Chi_Minh' },
      accounts: {
        adminA: '6a-admin-a@example.invalid',
        leaderA: '6a-leader-a@example.invalid',
        deputyA: '6a-deputy-a@example.invalid',
        memberA: '6a-member-a@example.invalid',
        memberB: '6a-member-b@example.invalid',
        adminB: '6a-admin-b@example.invalid',
      },
      ids,
      rlsBaseline: rls.rows[0],
      tableRows: fixtureRows,
      evidenceDigest: createHash('sha256').update(JSON.stringify({ ids, yesterday, today, tomorrow })).digest('hex'),
    };
    const fs = await import('node:fs/promises');
    await fs.writeFile(`${artifactDir}\\fixture-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ fixture: manifest.fixture, dates: manifest.dates, tableRows: fixtureRows, evidenceDigest: manifest.evidenceDigest }, null, 2)}\n`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`6A fixture setup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
