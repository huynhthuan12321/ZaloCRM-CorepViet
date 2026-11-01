import { reportModelWhere, type ReportScope } from '../../dashboard/report-scope.js';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * conversion-funnel.ts — Pipeline conversion rates: count per stage + conversion %.
 */
import { prisma } from '../../../shared/database/prisma-client.js';
import { resolveReportPeriod } from '../../dashboard/report-period.js';

export interface FunnelStage {
  status: string;
  count: number;
  rate: number; // % of total contacts that reached this stage
}

export interface ConversionFunnelResult {
  from: string;
  to: string;
  asOf: string;
  stagesMeaning: 'created_in_period_current_status';
  stages: FunnelStage[];
  totalContacts: number;
  avgConversionDays: null;
  avgConversionDaysAvailability: 'unavailable';
  avgConversionDaysReason: 'conversion_event_history_unavailable';
}

const STAGE_ORDER = ['new', 'contacted', 'interested', 'converted', 'lost'];

export async function getConversionFunnel(
  orgId: string,
  from: string,
  to: string,
  scope: ReportScope,
): Promise<ConversionFunnelResult> {
  const period = resolveReportPeriod({ from, to }, { defaultDays: 1 });
  const { start: gte, end: lt } = period;
  const asOf = new Date().toISOString();

  const groups = await prisma.contact.groupBy({
    by: ['status'],
    where: { AND: [{ orgId, createdAt: { gte, lt }, status: { not: null } }, reportModelWhere(scope, 'contact')] },
    _count: true,
  });

  const countMap: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    const s = g.status ?? 'unknown';
    countMap[s] = g._count;
    total += g._count;
  }

  const stages: FunnelStage[] = STAGE_ORDER.map((status) => ({
    status,
    count: countMap[status] ?? 0,
    rate: total > 0 ? Math.round(((countMap[status] ?? 0) / total) * 1000) / 10 : 0,
  }));

  return {
    from: period.from,
    to: period.to,
    asOf,
    stagesMeaning: 'created_in_period_current_status',
    stages,
    totalContacts: total,
    avgConversionDays: null,
    avgConversionDaysAvailability: 'unavailable',
    avgConversionDaysReason: 'conversion_event_history_unavailable',
  };
}
