import { describe, expect, it } from 'vitest'
import { reconcileWeekly } from './reconcile-weekly'

describe('reconcileWeekly', () => {
  it('maps an Investing.com Sunday weekly label to the following trading week', () => {
    const daily = [{ date: '2026-07-17', open: 130, high: 137, low: 128, close: 135 }]
    const weekly = [{ date: '2026-07-12', open: 120, high: 140, low: 115, close: 135 }]
    const result = reconcileWeekly(daily, weekly)
    expect(result.comparisons).toHaveLength(1)
    expect(result.mismatchCount).toBe(0)
  })
})

