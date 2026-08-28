import { describe, expect, it } from 'vitest'
import { addDays, chinaDateTime, minutesBetween } from './datetime'

describe('datetime', () => {
  it('跨月和跨年增加日期', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-02-28', 2)).toBe('2026-03-02')
  })

  it('统一使用中国标准时区并正确计算跨日分钟', () => {
    expect(chinaDateTime('2026-09-04', '18:00')).toBe('2026-09-04T18:00:00+08:00')
    expect(
      minutesBetween('2026-09-06T23:59:00+08:00', '2026-09-07T08:30:00+08:00'),
    ).toBe(511)
  })
})
