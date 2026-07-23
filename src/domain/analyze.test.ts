import { describe, expect, it } from 'vitest'
import { analyzeHistory, backtestHistoricalPaths, estimateEffectiveSampleSize, extractMatchedPaths, extractModeledPaths, repriceAnalyses } from './analyze'

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

  it('builds sequential close and touch paths from weekly-only OHLC history', () => {
    const bars = [
      { date: '2026-06-28', open: 98, high: 102, low: 95, close: 100 },
      { date: '2026-07-05', open: 99, high: 105, low: 80, close: 90 },
      { date: '2026-07-12', open: 91, high: 110, low: 85, close: 108 },
    ]

    const paths = extractMatchedPaths(bars, '2026-07-20', 1, false, 'weekly')

    expect(paths).toHaveLength(2)
    expect(paths[0].closeReturn).toBeCloseTo(-0.1)
    expect(paths[0].lowReturn).toBeCloseTo(-0.2)
    expect(paths[0].highReturn).toBeCloseTo(0.05)
    expect(paths[1].closeReturn).toBeCloseTo(0.2)
    expect(paths[1].lowReturn).toBeCloseTo(85 / 90 - 1)
    expect(paths[1].highReturn).toBeCloseTo(110 / 90 - 1)
  })

  it('does not bridge a missing weekly observation', () => {
    const bars = [
      { date: '2026-06-28', open: 98, high: 102, low: 95, close: 100 },
      { date: '2026-07-12', open: 91, high: 110, low: 85, close: 108 },
    ]

    expect(extractMatchedPaths(bars, '2026-07-20', 2, true, 'weekly')).toEqual([])
  })

  it('does not treat perfectly dependent paths as independent evidence', () => {
    const paths = Array.from({ length: 200 }, () => ({ closeReturn: 0.1, lowReturn: -0.1, highReturn: 0.2 }))
    expect(estimateEffectiveSampleSize(paths, 1)).toBe(1)
  })

  it('walks forward without using future paths in the training window', () => {
    const training = Array.from({ length: 500 }, () => ({
      closeReturn: 0,
      lowReturn: -0.01,
      highReturn: 0.01,
      startVolatility: 0.02,
    }))
    const tests = Array.from({ length: 5 }, () => ({
      closeReturn: -0.1,
      lowReturn: -0.12,
      highReturn: 0.01,
      startVolatility: 0.02,
    }))
    const result = backtestHistoricalPaths([...training, ...tests], 1, 'daily')
    expect(result?.lower.conservative.predictions).toBe(5)
    expect(result?.lower.conservative.expirationBreaches).toBe(5)
    expect(result?.lower.conservative.pathTouchBreaches).toBe(5)
  })

  it('keeps full-history stress while widening paths for elevated current volatility', () => {
    const bars = Array.from({ length: 40 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 0, 5 + index * 7)).toISOString().slice(0, 10)
      const close = index < 28
        ? 100 * (index % 2 ? 1.01 : 1)
        : 100 * (index % 2 ? 1.2 : 0.8)
      return { date, open: close, high: close * 1.02, low: close * 0.98, close }
    })
    const modeled = extractModeledPaths({
      bars,
      anchorPrice: bars.at(-1)!.close,
      anchorDate: bars.at(-1)!.date,
      intraday: false,
      interval: 'weekly',
    }, 1)
    expect(modeled.volatility.available).toBe(true)
    expect(modeled.volatility.maximumScale).toBe(2)
    expect(modeled.volatility.cappedPathCount).toBeGreaterThan(0)
    expect(modeled.lower.some((path, index) => path.lowReturn < modeled.raw[index].lowReturn)).toBe(true)
    expect(modeled.upper.some((path, index) => path.highReturn > modeled.raw[index].highReturn)).toBe(true)
  })

  it('reprices cached return-based analysis without changing its statistical evidence', () => {
    const bars = [
      { date: '2026-06-28', open: 98, high: 102, low: 95, close: 100 },
      { date: '2026-07-05', open: 99, high: 105, low: 80, close: 90 },
      { date: '2026-07-12', open: 91, high: 110, low: 85, close: 108 },
    ]
    const original = analyzeHistory({ bars, anchorPrice: 100, anchorDate: '2026-07-20', intraday: false, interval: 'weekly' })
    const repriced = repriceAnalyses(original, 200)
    expect(repriced[0].lower[0].price).toBeCloseTo(200 * (1 + original[0].lower[0].returnPct))
    expect(repriced[0].conservativeCertification.lower.price).toBeCloseTo(200 * (1 + original[0].conservativeCertification.lower.returnPct))
    expect(repriced[0].sampleSize).toBe(original[0].sampleSize)
    expect(repriced[0].lower[0].expirationRiskUpper95).toBe(original[0].lower[0].expirationRiskUpper95)
    expect(original[0].lower[0].price).not.toBe(repriced[0].lower[0].price)
  })
})
