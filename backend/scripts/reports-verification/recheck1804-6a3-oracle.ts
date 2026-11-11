// Copy of 6a2-oracle.ts for the 6A rerun after remediation; DB/port/role names changed.
import pg, { Pool } from 'pg';

// 6A2: Prisma stores timestamp(3) without time zone as UTC. Send JS Dates as UTC
// (pg defaults to the process-local offset, which skewed 6A by +7h) and run with TZ=UTC
// so timestamp values read back are also UTC.
pg.defaults.parseInputDatesAsUTC = true;
if (new Date(0).getTimezoneOffset() !== 0) throw new Error('6A2 helpers must run with TZ=UTC.');
import { readFile, writeFile } from 'node:fs/promises';

const databaseUrl = process.env.REPORTS_6A_OWNER_DATABASE_URL;
const artifactDir = process.env.REPORTS_6A_ARTIFACT_DIR;
if (!databaseUrl || !artifactDir) throw new Error('Explicit 6A owner database URL and artifact directory are required.');

const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== '127.0.0.1' ||
  parsedUrl.port !== '55541' ||
  parsedUrl.pathname !== '/reports_5b6b_6a_verify' ||
  parsedUrl.username !== 'postgres'
) {
  throw new Error('Refusing to query an unverified 6A oracle database.');
}

const pool = new Pool({ connectionString: databaseUrl, application_name: 'reports-6a3-sql-oracle' });
const id = (name: string) => `6a-${name}`;
const atVn = (date: string, time: string) => new Date(`${date}T${time}+07:00`);

async function main() {
  const manifest = JSON.parse(await readFile(`${artifactDir}\\fixture-manifest.json`, 'utf8'));
  const { ids, dates } = manifest;
  const start = atVn(dates.yesterday, '00:00:00.000');
  const end = atVn(dates.today, '00:00:00.000');
  const todayStart = atVn(dates.today, '00:00:00.000');
  const tomorrowStart = atVn(dates.tomorrow, '00:00:00.000');
  const teamUsers = [ids.leaderA, ids.memberA];
  const mainAccounts = [ids.nickMain, ids.nickSub];
  const sharedAccounts = [ids.nickShared];
  const adminEligibleMessageIds = [
    id('msg-main-ai-reply'),
    id('msg-main-ai-followup'),
    id('msg-sub-ai-unclassified'),
    id('msg-shared-ai'),
    id('msg-private-ai'),
  ];
  const leaderMainMessageIds = adminEligibleMessageIds.slice(0, 3);

  const client = await pool.connect();
  try {
    const identity = await client.query(
      `SELECT current_database() AS database, current_user AS db_user, inet_server_port() AS server_port`,
    );
    const db = identity.rows[0];
    if (db.database !== 'reports_5b6b_6a_verify' || db.db_user !== 'postgres' || Number(db.server_port) !== 5432) {
      throw new Error(`Refusing to query unexpected database identity: ${JSON.stringify(db)}`);
    }

    const contacts = await client.query(
      `SELECT
        count(*) FILTER (WHERE org_id=$1 AND merged_into IS NULL)::int AS org_total,
        count(*) FILTER (WHERE org_id=$1 AND merged_into IS NULL AND created_at >= $2 AND created_at < $3)::int AS org_new_period,
        count(*) FILTER (WHERE org_id=$1 AND assigned_user_id = ANY($4::text[]) AND merged_into IS NULL)::int AS team_total,
        count(*) FILTER (WHERE org_id=$1 AND assigned_user_id = ANY($4::text[]) AND merged_into IS NULL AND created_at >= $2 AND created_at < $3)::int AS team_new_period
       FROM contacts`,
      [ids.orgA, start, end, teamUsers],
    );
    const statuses = await client.query(
      `SELECT status_id, count(*)::int AS count
       FROM contacts
       WHERE org_id=$1 AND merged_into IS NULL
       GROUP BY status_id`,
      [ids.orgA],
    );
    const teamStatuses = await client.query(
      `SELECT status_id, count(*)::int AS count
       FROM contacts
       WHERE org_id=$1 AND assigned_user_id = ANY($2::text[]) AND merged_into IS NULL
       GROUP BY status_id`,
      [ids.orgA, teamUsers],
    );
    const appointments = await client.query(
      `SELECT
        count(*) FILTER (WHERE org_id=$1 AND appointment_date >= $2 AND appointment_date < $3)::int AS today,
        count(*) FILTER (WHERE org_id=$1 AND status='completed' AND appointment_date >= $4 AND appointment_date < $5)::int AS completed_period,
        count(*) FILTER (WHERE org_id=$1 AND appointment_date >= $6 AND appointment_date < $7)::int AS tomorrow
       FROM appointments`,
      [ids.orgA, todayStart, tomorrowStart, start, end, tomorrowStart, atVn(addDate(dates.tomorrow, 1), '00:00:00.000')],
    );
    const leadPool = await client.query(
      `SELECT
        (SELECT count(*)::int FROM lead_requests WHERE org_id=$1 AND release_reason IS NULL) AS waiting,
        (SELECT count(*)::int FROM lead_requests WHERE org_id=$1 AND requested_by_user_id = ANY($2::text[]) AND release_reason IS NULL) AS team_waiting,
        (SELECT count(*)::int FROM lead_pool_distributions WHERE org_id=$1 AND distributed_at >= $3 AND distributed_at < $4) AS distributed_period,
        (SELECT count(*)::int FROM lead_pool_distributions WHERE org_id=$1 AND assigned_to_user_id = ANY($2::text[]) AND distributed_at >= $3 AND distributed_at < $4) AS team_distributed_period`,
      [ids.orgA, teamUsers, start, end],
    );
    const engagement = await client.query(
      `SELECT
        count(*)::int AS rows,
        count(*) FILTER (WHERE customer_initiated)::int AS initiated,
        COALESCE(sum(inbound_msg_count),0)::int AS inbound,
        COALESCE(sum(outbound_msg_count),0)::int AS outbound
       FROM contact_engagement_daily
       WHERE org_id=$1 AND date >= $2::date AND date < $3::date`,
      [ids.orgA, dates.yesterday, dates.today],
    );
    const teamEngagement = await client.query(
      `SELECT
        count(*)::int AS rows,
        count(*) FILTER (WHERE customer_initiated)::int AS initiated,
        COALESCE(sum(inbound_msg_count),0)::int AS inbound,
        COALESCE(sum(outbound_msg_count),0)::int AS outbound
       FROM contact_engagement_daily
       WHERE org_id=$1 AND contact_id IN (
         SELECT id FROM contacts WHERE assigned_user_id = ANY($2::text[])
       ) AND date >= $3::date AND date < $4::date`,
      [ids.orgA, teamUsers, dates.yesterday, dates.today],
    );
    const attempts = await client.query(
      `SELECT state, count(*)::int AS count
       FROM friendship_attempts
       WHERE org_id=$1 AND queued_at >= $2 AND queued_at < $3
       GROUP BY state`,
      [ids.orgA, start, end],
    );
    const careEvents = await client.query(
      `SELECT e.event_type, count(*)::int AS count
       FROM care_session_events e
       JOIN care_sessions s ON s.id=e.session_id
       WHERE s.org_id=$1 AND e.created_at >= $2 AND e.created_at < $3
       GROUP BY e.event_type`,
      [ids.orgA, start, end],
    );
    const reconnects = await client.query(
      `SELECT count(*)::int AS count
       FROM zalo_account_status_log
       WHERE org_id=$1 AND reason='reconnect_ok' AND started_at >= $2 AND started_at < $3`,
      [ids.orgA, start, end],
    );
    const broadcast = await client.query(
      `SELECT
        (SELECT count(*)::int FROM broadcast_jobs WHERE org_id=$1) AS jobs,
        (SELECT count(*)::int FROM broadcast_jobs WHERE org_id=$1 AND status='active') AS active_jobs,
        count(*)::int AS runs,
        COALESCE(sum(sent_count),0)::int AS sent,
        COALESCE(sum(failed_count),0)::int AS failed,
        COALESCE(sum(skipped_count),0)::int AS skipped
       FROM broadcast_runs
       WHERE org_id=$1 AND started_at >= $2 AND started_at < $3`,
      [ids.orgA, start, end],
    );

    const messageSummaries = await client.query(
      `SELECT m.id, m.conversation_id, m.metadata,
        EXISTS (
          SELECT 1 FROM activity_logs a
          WHERE a.org_id=m.org_id AND a.actor_type='bot' AND a.action='ai_auto_reply_sent'
            AND a.entity_type='conversation' AND a.entity_id=m.conversation_id
            AND a.details->>'messageId'=m.id
            AND COALESCE(a.details->>'dryRun','false')<>'true'
            AND COALESCE(a.details->>'test','false')<>'true'
            AND a.created_at <= $3
        ) AS has_reply_audit,
        EXISTS (
          SELECT 1 FROM activity_logs a
          WHERE a.org_id=m.org_id AND a.actor_type='bot' AND a.action='ai_followup_sent'
            AND a.entity_type='conversation' AND a.entity_id=m.conversation_id
            AND a.details->>'messageId'=m.id
            AND COALESCE(a.details->>'dryRun','false')<>'true'
            AND COALESCE(a.details->>'test','false')<>'true'
            AND a.created_at <= $3
        ) AS has_followup_audit
       FROM messages m
       JOIN conversations c ON c.id=m.conversation_id AND c.org_id=m.org_id
       WHERE m.id=ANY($1::text[]) AND m.org_id=$2
         AND c.is_virtual=false AND c.\"threadType\"='user' AND c.deleted_at IS NULL
         AND m.sender_type='self' AND m.is_local=false AND m.is_deleted=false AND m.deleted_at IS NULL
         AND (m.sent_via='ai_auto' OR m.metadata->'aiAuto'='true'::jsonb)
         AND COALESCE(m.metadata->>'dryRun','false')<>'true'
         AND COALESCE(m.metadata->>'test','false')<>'true'
         AND COALESCE(m.metadata->>'isTest','false')<>'true'
         AND m.sent_at >= $4 AND m.sent_at < $5 AND m.sent_at <= $3`,
      [adminEligibleMessageIds, ids.orgA, new Date(), start, end],
    );
    const drafts = await client.query(
      `SELECT
        count(*) FILTER (WHERE c.zalo_account_id = ANY($2::text[]))::int AS main,
        count(*) FILTER (WHERE c.zalo_account_id = ANY($3::text[]))::int AS shared
       FROM ai_suggestions s
       JOIN conversations c ON c.id=s.conversation_id AND c.org_id=s.org_id
       WHERE s.org_id=$1 AND s.type='auto_reply_needs_review'
         AND s.created_at >= $4 AND s.created_at < $5 AND s.created_at <= $6
         AND c.is_virtual=false AND c.\"threadType\"='user' AND c.deleted_at IS NULL`,
      [ids.orgA, mainAccounts, sharedAccounts, start, end, new Date()],
    );
    const adminAi = summarizeAi(messageSummaries.rows, adminEligibleMessageIds, Number(drafts.rows[0].main) + Number(drafts.rows[0].shared));
    const leaderMainRows = messageSummaries.rows.filter((row) => leaderMainMessageIds.includes(row.id));
    const leaderSharedRows = messageSummaries.rows.filter((row) => row.id === id('msg-shared-ai'));
    const leaderAi = {
      main: summarizeAi(leaderMainRows, leaderMainMessageIds, Number(drafts.rows[0].main)),
      shared: summarizeAi(leaderSharedRows, [id('msg-shared-ai')], Number(drafts.rows[0].shared)),
    };

    const rowCounts: Record<string, number> = {};
    for (const [key, table] of manifest.tableRows as [string, string, number][]) {
      const { rows } = await client.query(`SELECT count(*)::int AS count FROM public."${table}"`);
      rowCounts[key] = rows[0].count;
    }
    const futureActivity = await client.query(
      `SELECT count(*)::int AS count FROM activity_logs WHERE id=$1 AND created_at > now()`,
      [id('activity-future-audit')],
    );
    const expected = {
      fixture: 'synthetic-reports-6a',
      period: { from: dates.yesterday, to: dates.yesterday, timeZone: 'Asia/Ho_Chi_Minh', start: start.toISOString(), exclusiveEnd: end.toISOString() },
      rowCounts,
      contacts: contacts.rows[0],
      statuses: {
        org: Object.fromEntries(statuses.rows.map((row) => [row.status_id, row.count])),
        team: Object.fromEntries(teamStatuses.rows.map((row) => [row.status_id, row.count])),
      },
      appointments: appointments.rows[0],
      leadPool: leadPool.rows[0],
      engagement: {
        org: engagement.rows[0],
        team: teamEngagement.rows[0],
        orgCustomerInitiatedPct: percent(engagement.rows[0].initiated, engagement.rows[0].rows),
        teamCustomerInitiatedPct: percent(teamEngagement.rows[0].initiated, teamEngagement.rows[0].rows),
      },
      automation: {
        attempts: Object.fromEntries(attempts.rows.map((row) => [row.state, row.count])),
        careEvents: Object.fromEntries(careEvents.rows.map((row) => [row.event_type, row.count])),
        reconnects: reconnects.rows[0].count,
      },
      broadcast: broadcast.rows[0],
      ai: { adminOrg: adminAi, leader: leaderAi, eligibleRows: messageSummaries.rows.length },
      futureAuditFixtureRows: futureActivity.rows[0].count,
    };
    const fs = await import('node:fs/promises');
    await fs.writeFile(`${artifactDir}\\sql-oracle.json`, `${JSON.stringify(expected, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify(expected, null, 2)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

function summarizeAi(rows: Array<{ id: string; conversation_id: string; metadata: Record<string, unknown>; has_reply_audit: boolean; has_followup_audit: boolean }>, allowedIds: string[], reviewDraftsCreated: number) {
  const eligible = rows.filter((row) => allowedIds.includes(row.id));
  let autoReplies = 0;
  let followups = 0;
  for (const row of eligible) {
    const metadataFollowup = row.metadata?.aiFollowup === true;
    if (metadataFollowup || (row.has_followup_audit && !row.has_reply_audit)) followups++;
    else if (row.has_reply_audit && !row.has_followup_audit) autoReplies++;
  }
  return {
    sentMessages: eligible.length,
    conversations: new Set(eligible.map((row) => row.conversation_id)).size,
    autoReplies,
    followups,
    unclassified: eligible.length - autoReplies - followups,
    reviewDraftsCreated,
  };
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function addDate(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

main().catch((error) => {
  process.stderr.write(`6A SQL oracle failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
