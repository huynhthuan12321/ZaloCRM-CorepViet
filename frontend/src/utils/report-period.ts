export const REPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export interface DateRange {
  from: string
  to: string
}

export function vietnamDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function vietnamDateRange(days: number, now = new Date()): DateRange {
  if (!Number.isInteger(days) || days < 1) throw new RangeError('days must be a positive integer')
  const to = vietnamDate(now)
  return { from: shiftDate(to, -(days - 1)), to }
}

export function vietnamWeekRange(now = new Date()): DateRange {
  const to = vietnamDate(now)
  const weekday = new Date(`${to}T00:00:00.000Z`).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  return { from: shiftDate(to, -daysSinceMonday), to }
}

export function vietnamMonthStart(now = new Date()): string {
  return `${vietnamDate(now).slice(0, 7)}-01`
}
