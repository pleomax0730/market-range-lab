import { describe, expect, it } from 'vitest'
import { extractMatchedPaths } from './analyze'

describe('extractMatchedPaths', () => {
  it('rolls a closed Friday start into the following target week', () => {
    const bars = [
      { date: '2026-07-17', open: 100, high: 101, low: 99, close: 100 },
      { date: '2026-07-20', open: 101, high: 103, low: 100, close: 102 },
      { date: '2026-07-24', open: 102, high: 106, low: 101, close: 105 },
    ]
    const paths = extractMatchedPaths(bars, '2026-07-17', 1, false)
    expect(paths).toHaveLength(1)
    expect(paths[0].closeReturn).toBeCloseTo(0.05)
    expect(paths[0].lowReturn).toBe(0)
    expect(paths[0].highReturn).toBeCloseTo(0.06)
  })
})
