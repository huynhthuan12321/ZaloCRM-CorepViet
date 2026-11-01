import { describe, expect, it } from 'vitest'
import { shiftDate, vietnamDate, vietnamDateRange, vietnamMonthStart, vietnamWeekRange } from './report-period'

describe('Vietnam report date helpers', () => {
  it('uses Asia/Ho_Chi_Minh rather than the browser timezone', () => {
    const instant = new Date('2026-10-01T17:30:00.000Z')
    expect(vietnamDate(instant)).toBe('2026-10-02')
    expect(vietnamDateRange(7, instant)).toEqual({ from: '2026-09-26', to: '2026-10-02' })
  })

  it('creates inclusive ranges and handles week/month boundaries', () => {
    const instant = new Date('2026-11-01T12:00:00.000Z')
    expect(vietnamDateRange(30, instant)).toEqual({ from: '2026-10-03', to: '2026-11-01' })
    expect(vietnamWeekRange(instant)).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(vietnamMonthStart(instant)).toBe('2026-11-01')
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29')
  })
})
