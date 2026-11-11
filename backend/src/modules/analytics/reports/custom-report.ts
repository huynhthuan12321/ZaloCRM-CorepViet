import { getResponseTimeAnalysis } from './response-time.js';
import { contactReportSql, messageReportSql, appointmentReportSql, type ReportScope } from '../../dashboard/report-scope.js';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * custom-report.ts — Execute user-defined report from predefined metrics.
 * Supports 6 metrics, 5 groupBy options, optional filters. Conversion-event
 * counts remain unavailable until the database has conversion history.
 *
 * SECURITY: All user-supplied values (filters.userId, filters.source, etc.)
 * MUST be passed as bound params via Prisma.sql/$queryRaw. Static SQL fragments
 * (dateExpr, dateCol, statusFilter) are derived from server-side enums and
 * validated against an allow-list before being wrapped in Prisma.raw.
 * Never feed user input through Prisma.raw.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/database/prisma-client.js';
import { resolveReportPeriod, type ReportPeriod } from '../../dashboard/report-period.js';

export interface ReportConfig {
  metrics: string[]; // messages_sent | messages_received | contacts_new | contacts_converted | appointments | avg_response_time
  groupBy: 'day' | 'week' | 'month' | 'user' | 'source';
  dateRange: { from: string; to: string };
  filters?: { userId?: string; source?: string; status?: string };
}

export interface CustomReportResult {
  labels: string[];
  datasets: {
    metric: string;
    data: (number | null)[];
    availability?: 'available' | 'unavailable';
    reason?: string;
  }[];
}

// Allow-list for groupBy values that map to a TO_CHAR/DATE_TRUNC fragment.
const GROUP_BY_DATE = new Set(['day', 'week', 'month']);
// Allow-list for date columns used in dynamic fragments.
const DATE_COLUMN = new Set(['created_at', 'sent_at', 'appointment_date', 'stat_date']);
const DATE_ONLY_COLUMN = new Set(['appointment_date', 'stat_date']);

export async function executeCustomReport(
  orgId: string,
  config: ReportConfig,
  scope: ReportScope,
): Promise<CustomReportResult> {
  if (!config.dateRange?.from || !config.dateRange?.to) {
    throw new Error('Custom report dateRange.from and dateRange.to are required');
  }
  const period = resolveReportPeriod(config.dateRange, { defaultDays: 1 });

  const results: {
    metric: string;
    labels: string[];
    data: (number | null)[];
    availability?: 'available' | 'unavailable';
    reason?: string;
  }[] = [];
  let labels: string[] = [];

  for (const metric of config.metrics) {
    if (metric === 'contacts_converted') {
      results.push({
        metric,
        labels: [],
        data: [],
        availability: 'unavailable',
        reason: 'conversion_event_history_unavailable',
      });
      continue;
    }
    const result = await queryMetric(orgId, metric, config.groupBy, period, config.filters, scope);
    if (config.groupBy === 'user') labels = [...new Set([...labels, ...result.labels])];
    else if (!labels.length) labels = result.labels;
    results.push({ metric, ...result });
  }

  // A customer-inbound bucket must not be plotted under a named employee when
  // multiple metrics are selected. Missing counts are measured zero; a mean
  // without observations remains null.
  const datasets = results.map(result => {
    if (result.availability === 'unavailable') {
      return {
        metric: result.metric,
        data: labels.map(() => null),
        availability: result.availability,
        reason: result.reason,
      };
    }
    if (config.groupBy !== 'user') return { metric: result.metric, data: result.data };
    const values = new Map(result.labels.map((label, i) => [label, result.data[i]]));
    return { metric: result.metric, data: labels.map(label => values.get(label) ?? (result.metric === 'avg_response_time' ? null : 0)) };
  });
  return { labels, datasets };
}

async function queryMetric(
  orgId: string,
  metric: string,
  groupBy: string,
  period: ReportPeriod,
  filters: ReportConfig['filters'],
  scope: ReportScope,
): Promise<{ labels: string[]; data: number[] }> {
  const { start: gte, end: lt, dateStart, dateEnd } = period;
  switch (metric) {
    case 'messages_sent':
    case 'messages_received':
      return queryMessageMetric(orgId, metric, groupBy, gte, lt, scope);
    case 'contacts_new':
      return queryContactMetric(orgId, 'new', groupBy, gte, lt, filters, scope);
    case 'appointments':
      return queryAppointmentMetric(orgId, groupBy, dateStart, dateEnd, scope);
    case 'avg_response_time':
      return queryResponseTimeMetric(orgId, groupBy, period.from, period.to, scope);
    default:
      return { labels: [], data: [] };
  }
}

async function queryMessageMetric(
  orgId: string,
  metric: string,
  groupBy: string,
  gte: Date,
  lt: Date,
  scope: ReportScope,
): Promise<{ labels: string[]; data: number[] }> {
  const senderType = metric === 'messages_sent' ? 'self' : 'contact';

  if (groupBy === 'user') {
    if (metric === 'messages_received') {
      // Inbound messages have no responding employee. Preserve the main-nick
      // count in an explicit unknown bucket, never infer an actor from ownership
      // or contact assignment and never include shared-only nicks in main KPIs.
      const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
        SELECT 'Chưa xác định nhân viên' AS label, COUNT(*)::bigint AS cnt
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE ${messageReportSql(scope)} AND m.sender_type = ${senderType}
          AND m.sent_at >= ${gte} AND m.sent_at < ${lt}
        HAVING COUNT(*) > 0`;
      return { labels: rows.map(r => r.label), data: rows.map(r => Number(r.cnt)) };
    }
    const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
      SELECT u.full_name AS label, COUNT(*)::bigint AS cnt
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN users u ON u.id = m.replied_by_user_id
      WHERE ${messageReportSql(scope, 'people')} AND m.sender_type = ${senderType}
        AND m.sent_at >= ${gte} AND m.sent_at < ${lt}
      GROUP BY u.full_name ORDER BY cnt DESC`;
    return { labels: rows.map((r) => r.label ?? 'N/A'), data: rows.map((r) => Number(r.cnt)) };
  }

  if (groupBy === 'source') {
    const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
      SELECT COALESCE(ct.source, 'N/A') AS label, COUNT(*)::bigint AS cnt
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE ${messageReportSql(scope)} AND m.sender_type = ${senderType}
        AND m.sent_at >= ${gte} AND m.sent_at < ${lt}
      GROUP BY ct.source ORDER BY cnt DESC`;
    return { labels: rows.map((r) => r.label), data: rows.map((r) => Number(r.cnt)) };
  }

  // groupBy in {day, week, month}: fragment derived from validated enum, safe to Prisma.raw.
  const dateExpr = groupByDateExpr(groupBy, 'm.sent_at');
  const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
    SELECT ${dateExpr} AS label, COUNT(*)::bigint AS cnt
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE ${messageReportSql(scope)} AND m.sender_type = ${senderType}
      AND m.sent_at >= ${gte} AND m.sent_at < ${lt}
    GROUP BY label ORDER BY label ASC`;
  return { labels: rows.map((r) => String(r.label)), data: rows.map((r) => Number(r.cnt)) };
}

async function queryContactMetric(
  orgId: string,
  type: 'new',
  groupBy: string,
  gte: Date,
  lt: Date,
  filters: ReportConfig['filters'],
  scope: ReportScope,
): Promise<{ labels: string[]; data: number[] }> {
  // Both derived from typed enum / server constant — safe after assertColumn.
  const dateColName = 'created_at';
  assertDateColumn(dateColName);
  const dateCol = Prisma.raw(dateColName);

  // sourceFilter — user input. ALWAYS bound, never interpolated.
  const sourceFilter = filters?.source
    ? Prisma.sql`AND source = ${filters.source}`
    : Prisma.empty;

  if (groupBy === 'user') {
    // Note: c.${dateCol} below — dateCol is validated above.
    const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
      SELECT COALESCE(u.full_name, 'Chưa gán') AS label, COUNT(*)::bigint AS cnt
      FROM contacts c LEFT JOIN users u ON u.id = c.assigned_user_id
      WHERE ${contactReportSql(scope, 'c')} AND c.${dateCol} >= ${gte} AND c.${dateCol} < ${lt}
        ${sourceFilter}
      GROUP BY u.full_name ORDER BY cnt DESC`;
    return { labels: rows.map((r) => r.label), data: rows.map((r) => Number(r.cnt)) };
  }

  if (groupBy === 'source') {
    const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
      SELECT COALESCE(source, 'N/A') AS label, COUNT(*)::bigint AS cnt
      FROM contacts WHERE ${contactReportSql(scope)} AND ${dateCol} >= ${gte} AND ${dateCol} < ${lt}
      GROUP BY source ORDER BY cnt DESC`;
    return { labels: rows.map((r) => r.label), data: rows.map((r) => Number(r.cnt)) };
  }

  const dateExpr = groupByDateExpr(groupBy, dateColName);
  const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
    SELECT ${dateExpr} AS label, COUNT(*)::bigint AS cnt
    FROM contacts WHERE ${contactReportSql(scope)} AND ${dateCol} >= ${gte} AND ${dateCol} < ${lt}
      ${sourceFilter}
    GROUP BY label ORDER BY label ASC`;
  return { labels: rows.map((r) => String(r.label)), data: rows.map((r) => Number(r.cnt)) };
}

async function queryAppointmentMetric(
  orgId: string,
  groupBy: string,
  dateStart: Date,
  dateEnd: Date,
  scope: ReportScope,
): Promise<{ labels: string[]; data: number[] }> {
  if (groupBy === 'user') {
    const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
      SELECT COALESCE(u.full_name, 'Chưa gán') AS label, COUNT(*)::bigint AS cnt
      FROM appointments a LEFT JOIN users u ON u.id = a.assigned_user_id
      WHERE ${appointmentReportSql(scope, 'a')} AND a.appointment_date >= ${dateStart} AND a.appointment_date < ${dateEnd}
      GROUP BY u.full_name ORDER BY cnt DESC`;
    return { labels: rows.map((r) => r.label), data: rows.map((r) => Number(r.cnt)) };
  }

  const dateExpr = groupByDateExpr(groupBy, 'appointment_date');
  const rows = await prisma.$queryRaw<Array<{ label: string; cnt: bigint }>>`
    SELECT ${dateExpr} AS label, COUNT(*)::bigint AS cnt
    FROM appointments     WHERE ${appointmentReportSql(scope)} AND appointment_date >= ${dateStart} AND appointment_date < ${dateEnd}
    GROUP BY label ORDER BY label ASC`;
  return { labels: rows.map((r) => String(r.label)), data: rows.map((r) => Number(r.cnt)) };
}

async function queryResponseTimeMetric(
  orgId: string,
  groupBy: string,
  from: string,
  to: string,
  scope: ReportScope,
): Promise<{ labels: string[]; data: number[] }> {
  if (!['day','week','month','user'].includes(groupBy)) throw new Error('Response time does not support this grouping');
  const result=await getResponseTimeAnalysis(orgId,from,to,scope);
  if(result.availability==='unavailable')throw new Error('Response time data unavailable: '+result.reason);
  if(groupBy==='user')return {labels:result.byUser.map(r=>r.fullName),data:result.byUser.map(r=>r.avgSeconds)};
  const groups=new Map<string,{sum:number;count:number}>();
  for(const row of result.daily){
    let key=row.date;
    if(groupBy==='month')key=key.slice(0,7);
    if(groupBy==='week'){
      const day=new Date(row.date+'T00:00:00Z');
      day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));
      const thursday=new Date(day);thursday.setUTCDate(day.getUTCDate()+3);
      const firstMonday=new Date(Date.UTC(thursday.getUTCFullYear(),0,4));
      firstMonday.setUTCDate(firstMonday.getUTCDate()-((firstMonday.getUTCDay()+6)%7));
      const week=1+Math.round((day.getTime()-firstMonday.getTime())/(7*86400000));
      // Match the existing SQL TO_CHAR(DATE_TRUNC('week', date), 'YYYY-"W"IW').
      key=day.getUTCFullYear()+'-W'+String(week).padStart(2,'0');
    }
    const count=row.count??0;if(!count)continue;
    const bucket=groups.get(key)??{sum:0,count:0};bucket.sum+=row.totalSeconds??row.avgSeconds*count;bucket.count+=count;groups.set(key,bucket);
  }
  const rows=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b));
  return {labels:rows.map(([key])=>key),data:rows.map(([,b])=>Math.round(b.sum/b.count))};
}

/** Fragments are derived exclusively from server-side allow-lists. */
function groupByDateExpr(groupBy: string, col: string): Prisma.Sql {
  if (!GROUP_BY_DATE.has(groupBy)) throw new Error(`Invalid groupBy for date expr: ${groupBy}`);
  const columnName = col.split('.').pop() || col;
  assertDateColumn(columnName);
  const column = Prisma.raw(col);
  const dateValue = DATE_ONLY_COLUMN.has(columnName) ? column : Prisma.sql`(${column} + INTERVAL '7 hours')`;
  switch (groupBy) {
    case 'week': return Prisma.sql`TO_CHAR(DATE_TRUNC('week', ${dateValue}), 'YYYY-"W"IW')`;
    case 'month': return Prisma.sql`TO_CHAR(${dateValue}, 'YYYY-MM')`;
    default: return Prisma.sql`TO_CHAR(${dateValue}, 'YYYY-MM-DD')`;
  }
}

function assertDateColumn(col: string): void {
  if (!DATE_COLUMN.has(col)) throw new Error(`Invalid date column: ${col}`);
}
