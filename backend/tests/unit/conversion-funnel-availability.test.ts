import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    contact: { groupBy: h.groupBy },
    $queryRaw: h.queryRaw,
  },
}));

import { getConversionFunnel } from '../../src/modules/analytics/reports/conversion-funnel.js';
import { orgReportScope } from '../../src/modules/dashboard/report-scope.js';

describe('conversion funnel source availability', () => {
  beforeEach(() => {
    h.groupBy.mockReset().mockResolvedValue([{ status: 'converted', _count: 1 }]);
    h.queryRaw.mockReset();
  });

  it('keeps cohort stages but does not infer conversion duration from updatedAt', async () => {
    const result = await getConversionFunnel(
      'org-a',
      '2026-10-01',
      '2026-10-01',
      orgReportScope('org-a'),
    );

    expect(result.stages.find((stage) => stage.status === 'converted')?.count).toBe(1);
    expect(result).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-01',
      stagesMeaning: 'created_in_period_current_status',
      avgConversionDays: null,
      avgConversionDaysAvailability: 'unavailable',
      avgConversionDaysReason: 'conversion_event_history_unavailable',
    });
    expect(h.groupBy.mock.calls[0][0].where.AND[0].createdAt.gte.toISOString()).toBe(
      '2026-09-30T17:00:00.000Z',
    );
    expect(h.queryRaw).not.toHaveBeenCalled();
  });
});
