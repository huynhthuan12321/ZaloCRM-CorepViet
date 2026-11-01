import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  InvalidReportPeriodError,
  listReportDates,
  resolveReportPeriod,
} from '../../src/modules/dashboard/report-period.js';

describe('report period (Asia/Ho_Chi_Minh)', () => {
  it('converts an inclusive Vietnam calendar day to a half-open UTC timestamp range', () => {
    const period = resolveReportPeriod(
      { from: '2026-10-01', to: '2026-10-01' },
      { now: new Date('2026-10-01T04:00:00.000Z') },
    );
    expect(period.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-01T17:00:00.000Z');
    expect(period.dayCount).toBe(1);
    expect(new Date('2026-10-01T23:59:59.999+07:00').getTime()).toBeLessThan(period.end.getTime());
    expect(new Date('2026-10-02T00:00:00.000+07:00').getTime()).toBe(period.end.getTime());
  });

  it('keeps date-only column boundaries at UTC midnight without a second timezone shift', () => {
    const period = resolveReportPeriod(
      { from: '2026-10-01', to: '2026-10-01' },
      { now: new Date('2026-10-01T04:00:00.000Z') },
    );
    expect(period.dateStart.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(period.dateEnd.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('uses the Vietnam date for defaults regardless of the host UTC day', () => {
    const period = resolveReportPeriod({}, { now: new Date('2026-10-01T17:30:00.000Z'), defaultDays: 7 });
    expect(period).toMatchObject({ from: '2026-09-26', to: '2026-10-02', dayCount: 7 });
    expect(period.start.toISOString()).toBe('2026-09-25T17:00:00.000Z');
  });

  it('generates exact inclusive periods and an equal-length non-overlapping previous period', () => {
    const period = resolveReportPeriod(
      { from: '2026-10-23', to: '2026-10-29' },
      { now: new Date('2026-10-29T05:00:00.000Z') },
    );
    expect(period.dayCount).toBe(7);
    expect(period.previousFrom).toBe('2026-10-16');
    expect(period.previousTo).toBe('2026-10-22');
    expect(period.previousEnd.toISOString()).toBe(period.start.toISOString());
    expect(listReportDates(period.from, period.to)).toHaveLength(7);
  });

  it('handles month/year transitions and leap days without local timezone arithmetic', () => {
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addCalendarDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(listReportDates('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28', '2024-02-29', '2024-03-01',
    ]);
  });

  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-1-01', '2026-01-01'],
    ['2026-10-02', '2026-10-01'],
  ])('rejects invalid or reversed range %s..%s', (from, to) => {
    expect(() => resolveReportPeriod({ from, to })).toThrow(InvalidReportPeriodError);
  });

  it('rejects ranges longer than 366 days', () => {
    expect(() => resolveReportPeriod({ from: '2025-10-31', to: '2026-11-01' })).toThrow(
      InvalidReportPeriodError,
    );
  });
});
