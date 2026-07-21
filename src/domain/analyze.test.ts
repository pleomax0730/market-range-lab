import { describe, expect, it } from 'vitest'
import { estimateEffectiveSampleSize, extractMatchedPaths } from './analyze'

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

  it('uses the anchor holiday-week rollover rule for every matched historical start', () => {
    const bars = [
      { date: '2025-04-10', open: 100, high: 101, low: 99, close: 100 },
      { date: '2025-04-11', open: 100, high: 102, low: 98, close: 101 },
      { date: '2025-04-17', open: 101, high: 103, low: 100, close: 102 },
      { date: '2026-04-02', open: 100, high: 101, low: 99, close: 100 },
    ]
    const paths = extractMatchedPaths(bars, '2026-04-02', 1, false)
    expect(paths).toHaveLength(1)
    expect(paths[0].closeReturn).toBeCloseTo(0.02)
  })

  it('excludes a path when the exact target-week close is missing', () => {
    const bars = [
      { date: '2026-07-20', open: 100, high: 101, low: 99, close: 100 },
      { date: '2026-07-23', open: 101, high: 103, low: 100, close: 102 },
    ]
    expect(extractMatchedPaths(bars, '2026-07-20', 1, false)).toEqual([])
  })

  it('does not treat perfectly dependent paths as independent evidence', () => {
    const paths = Array.from({ length: 200 }, () => ({ closeReturn: 0.1, lowReturn: -0.1, highReturn: 0.2 }))
    expect(estimateEffectiveSampleSize(paths, 1)).toBe(1)
  })
})
