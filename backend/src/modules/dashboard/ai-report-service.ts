import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import type { ReportScope } from './report-scope.js';
import { listReportDates, REPORT_TIME_ZONE, type ReportPeriod } from './report-period.js';

export interface AiReportKpis {
  sentMessages: number;
  conversations: number;
  // Confirmed subsets only. When unclassified > 0, full subtype totals are
  // unavailable; never infer that a legacy message was an auto reply.
  autoReplies: number;
  followups: number;
  unclassified: number;
  reviewDraftsCreated: number;
}
export interface AiReportSection {
  kpis: AiReportKpis;
  series: Array<{ date: string; sentMessages: number; autoReplies: number; followups: number; unclassified: number; reviewDraftsCreated: number }>;
}
export interface AiReportData {
  from: string;
  to: string;
  asOf: string;
  timeZone: string;
  scope: { kind: ReportScope['kind']; sharedAccounts: number };
  main: AiReportSection;
  shared: AiReportSection | null;
  unavailable: { pendingReviews: null; tokens: null; cost: null; handoffRate: null; conversionRate: null };
  availability: Record<'pendingReviews' | 'tokens' | 'cost' | 'handoffRate' | 'conversionRate', { status: 'unavailable'; reason: string }>;
}
type MessageRow = { section: 'main' | 'shared'; date: string | null; sentMessages: bigint; conversations: bigint; autoReplies: bigint; followups: bigint; unclassified: bigint };
type DraftRow = { section: 'main' | 'shared'; date: string | null; reviewDraftsCreated: bigint };

// AI operations belong to accounts, not the human-author leaderboard. Contact
// collaboration never broadens this scope. Aliases are fixed server constants.
function accountScopeSql(scope: ReportScope) {
  return scope.kind === 'org'
    ? Prisma.sql`c.org_id = ${scope.orgId}`
    : Prisma.sql`c.org_id = ${scope.orgId} AND c.zalo_account_id = ANY(${scope.readableAccountIds ?? scope.accountIds ?? []}::text[])`;
}
function sectionSql(scope: ReportScope) {
  return scope.kind === 'org' ? Prisma.sql`'main'::text`
    : Prisma.sql`CASE WHEN c.zalo_account_id = ANY(${scope.accountIds ?? []}::text[]) THEN 'main' ELSE 'shared' END`;
}
const emptyKpis = (): AiReportKpis => ({ sentMessages: 0, conversations: 0, autoReplies: 0, followups: 0, unclassified: 0, reviewDraftsCreated: 0 });

export async function getAiReport(scope: ReportScope, period: ReportPeriod, asOf = new Date()): Promise<AiReportData> {
  const { from, to, start, end } = period;
  const [messages, drafts] = await Promise.all([
    prisma.$queryRaw<MessageRow[]>`
      WITH eligible AS (
        SELECT m.id, m.conversation_id, m.metadata, ${sectionSql(scope)} AS section,
          (m.sent_at + INTERVAL '7 hours')::date::text AS date
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id AND c.org_id = m.org_id
        JOIN zalo_accounts za ON za.id = c.zalo_account_id AND za.org_id = c.org_id
        WHERE ${accountScopeSql(scope)}
          AND c.is_virtual = false AND c."threadType" = 'user' AND c.deleted_at IS NULL
          AND m.sender_type = 'self' AND m.is_local = false AND m.is_deleted = false AND m.deleted_at IS NULL
          AND (m.sent_via = 'ai_auto' OR m.metadata->'aiAuto' = 'true'::jsonb)
          AND COALESCE(m.metadata->>'dryRun', 'false') <> 'true'
          AND COALESCE(m.metadata->>'test', 'false') <> 'true'
          AND COALESCE(m.metadata->>'isTest', 'false') <> 'true'
          AND m.sent_at >= ${start} AND m.sent_at < ${end} AND m.sent_at <= ${asOf}
      ), audit AS (
        SELECT e.id, bool_or(a.action = 'ai_auto_reply_sent') AS reply,
          bool_or(a.action = 'ai_followup_sent') AS followup
        FROM eligible e
        JOIN activity_logs a ON a.org_id = ${scope.orgId}
          AND a.entity_type = 'conversation' AND a.entity_id = e.conversation_id
          AND a.details->>'messageId' = e.id
        WHERE a.actor_type = 'bot' AND a.action IN ('ai_auto_reply_sent', 'ai_followup_sent')
          AND COALESCE(a.details->>'dryRun', 'false') <> 'true'
          AND COALESCE(a.details->>'test', 'false') <> 'true'
          AND a.created_at <= ${asOf}
        GROUP BY e.id
      ), classified AS (
        SELECT e.*, CASE
          WHEN e.metadata->'aiFollowup' = 'true'::jsonb THEN 'followup'
          WHEN a.reply AND NOT a.followup THEN 'reply'
          WHEN a.followup AND NOT a.reply THEN 'followup'
          ELSE 'unknown' END AS kind
        FROM eligible e LEFT JOIN audit a ON a.id = e.id
      )
      SELECT section, date, COUNT(*) AS "sentMessages", COUNT(DISTINCT conversation_id) AS conversations,
        COUNT(*) FILTER (WHERE kind = 'reply') AS "autoReplies",
        COUNT(*) FILTER (WHERE kind = 'followup') AS followups,
        COUNT(*) FILTER (WHERE kind = 'unknown') AS unclassified
      FROM classified GROUP BY GROUPING SETS ((section, date), (section))`,
    prisma.$queryRaw<DraftRow[]>`
      SELECT ${sectionSql(scope)} AS section, (s.created_at + INTERVAL '7 hours')::date::text AS date,
        COUNT(*) AS "reviewDraftsCreated"
      FROM ai_suggestions s
      JOIN conversations c ON c.id = s.conversation_id AND c.org_id = s.org_id
      JOIN zalo_accounts za ON za.id = c.zalo_account_id AND za.org_id = c.org_id
      WHERE ${accountScopeSql(scope)} AND s.org_id = ${scope.orgId}
        AND c.is_virtual = false AND c."threadType" = 'user' AND c.deleted_at IS NULL
        AND s.type = 'auto_reply_needs_review'
        AND s.created_at >= ${start} AND s.created_at < ${end} AND s.created_at <= ${asOf}
      GROUP BY GROUPING SETS ((section, date), (section))`,
  ]);
  function section(kind: 'main' | 'shared'): AiReportSection {
    const total = messages.find(row => row.section === kind && row.date === null);
    const draftTotal = drafts.find(row => row.section === kind && row.date === null);
    const kpis = emptyKpis();
    if (total) for (const key of ['sentMessages', 'conversations', 'autoReplies', 'followups', 'unclassified'] as const) kpis[key] = Number(total[key]);
    kpis.reviewDraftsCreated = Number(draftTotal?.reviewDraftsCreated ?? 0);
    const byDate = new Map(messages.filter(row => row.section === kind && row.date !== null).map(row => [row.date, row]));
    const draftsByDate = new Map(drafts.filter(row => row.section === kind && row.date !== null).map(row => [row.date, row]));
    return { kpis, series: listReportDates(from, to).map(date => {
      const row = byDate.get(date);
      return { date, sentMessages: Number(row?.sentMessages ?? 0), autoReplies: Number(row?.autoReplies ?? 0), followups: Number(row?.followups ?? 0), unclassified: Number(row?.unclassified ?? 0), reviewDraftsCreated: Number(draftsByDate.get(date)?.reviewDraftsCreated ?? 0) };
    }) };
  }
  const mainAccounts = new Set(scope.accountIds ?? []);
  const sharedAccounts = scope.kind === 'org' ? 0 : new Set((scope.readableAccountIds ?? []).filter(id => !mainAccounts.has(id))).size;
  const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason });
  return {
    from, to, asOf: asOf.toISOString(), timeZone: REPORT_TIME_ZONE,
    scope: { kind: scope.kind, sharedAccounts }, main: section('main'), shared: sharedAccounts > 0 ? section('shared') : null,
    unavailable: { pendingReviews: null, tokens: null, cost: null, handoffRate: null, conversionRate: null },
    availability: {
      pendingReviews: unavailable('review_lifecycle_unavailable'), tokens: unavailable('token_usage_unavailable'),
      cost: unavailable('recorded_cost_unavailable'), handoffRate: unavailable('handoff_events_unavailable'), conversionRate: unavailable('conversion_events_unavailable'),
    },
  };
}
