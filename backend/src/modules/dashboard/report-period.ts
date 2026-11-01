export const REPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const MAX_REPORT_PERIOD_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportPeriod {
  from: string;
  to: string;
  start: Date;
  end: Date;
  dateStart: Date;
  dateEnd: Date;
  dayCount: number;
  previousFrom: string;
  previousTo: string;
  previousStart: Date;
  previousEnd: Date;
}

export class InvalidReportPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReportPeriodError';
  }
}

export function getVietnamDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function timestampAtVietnamMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000+07:00`);
}

function dateOnlyUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function resolveReportPeriod(
  query: { from?: unknown; to?: unknown },
  options: { defaultDays?: number; now?: Date; maxDays?: number } = {},
): ReportPeriod {
  const defaultDays = options.defaultDays ?? 30;
  const maxDays = options.maxDays ?? MAX_REPORT_PERIOD_DAYS;
  if (!Number.isInteger(defaultDays) || defaultDays < 1 || defaultDays > maxDays) {
    throw new Error('Invalid default report period configuration');
  }

  const today = getVietnamDate(options.now);
  const defaultFrom = addCalendarDays(today, -(defaultDays - 1));
  const from = query.from === undefined ? defaultFrom : query.from;
  const to = query.to === undefined ? today : query.to;
  if (!isValidDate(from) || !isValidDate(to)) {
    throw new InvalidReportPeriodError('from and to must be valid YYYY-MM-DD dates');
  }
  if (from > to) {
    throw new InvalidReportPeriodError('from must be on or before to');
  }

  const dayCount = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS + 1;
  if (dayCount > maxDays) {
    throw new InvalidReportPeriodError(`date range must not exceed ${maxDays} days`);
  }

  const previousFrom = addCalendarDays(from, -dayCount);
  const previousTo = addCalendarDays(from, -1);
  const nextDate = addCalendarDays(to, 1);
  return {
    from,
    to,
    start: timestampAtVietnamMidnight(from),
    end: timestampAtVietnamMidnight(nextDate),
    dateStart: dateOnlyUtcMidnight(from),
    dateEnd: dateOnlyUtcMidnight(nextDate),
    dayCount,
    previousFrom,
    previousTo,
    previousStart: timestampAtVietnamMidnight(previousFrom),
    previousEnd: timestampAtVietnamMidnight(from),
  };
}

export function listReportDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) dates.push(date);
  return dates;
}

export function isInvalidReportPeriodError(error: unknown): error is InvalidReportPeriodError {
  return error instanceof InvalidReportPeriodError;
}
