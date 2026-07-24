import { describe, expect, it } from 'vitest'
import {
  calculatePutPremiumAnalysis,
  DEFAULT_PREMIUM_ASSUMPTIONS,
  repricePutPremiumAnalysis,
} from './premium-analysis'

describe('calculatePutPremiumAnalysis', () => {
  it('derives loss, capital, and tail-compensation floors from expiration paths', () => {
    const result = calculatePutPremiumAnalysis({
      anchorPrice: 100,
      strike: 95,
      anchorDate: '2026-07-21',
      targetDate: '2026-07-24',
      paths: [-0.2, -0.1, 0, 0.1].map((closeReturn) => ({
        closeReturn,
        lowReturn: closeReturn,
        highReturn: closeReturn,
      })),
    })!

    expect(result.lossEventCount).toBe(2)
    expect(result.effectiveLossEventCount).toBe(2)
    expect(result.expectedLossPerShare).toBe(5)
    expect(result.conditionalLossPerShare).toBe(10)
    expect(result.cvar95PerShare).toBe(15)
    expect(result.maximumHistoricalLossPerShare).toBe(15)
    expect(result.daysToExpiry).toBe(3)
    expect(result.statisticalFloorPerShare).toBeCloseTo(
      result.expectedLossInterval95[1] + 0.03,
    )
    expect(result.capitalReturnFloorPerShare).toBeCloseTo(
      result.statisticalFloorPerShare + 95 * 0.10 * 3 / 365,
    )
    expect(result.lightTailFloorPerShare).toBeCloseTo(
      result.capitalReturnFloorPerShare + 0.10 * (15 - 5),
    )
    expect(result.conservativeTailFloorPerShare).toBeCloseTo(
      result.capitalReturnFloorPerShare + 0.25 * (15 - 5),
    )
  })

  it('does not invent losses when every path expires above the put strike', () => {
    const result = calculatePutPremiumAnalysis({
      anchorPrice: 100,
      strike: 80,
      anchorDate: '2026-07-21',
      targetDate: '2026-07-24',
      paths: Array.from({ length: 100 }, () => ({
        closeReturn: 0,
        lowReturn: -0.1,
        highReturn: 0.1,
      })),
    })!

    expect(result.lossEventCount).toBe(0)
    expect(result.expectedLossPerShare).toBe(0)
    expect(result.cvar95PerShare).toBe(0)
    expect(result.lightTailChargePerShare).toBe(0)
    expect(result.conservativeTailChargePerShare).toBe(0)
    expect(result.statisticalFloorPerShare).toBe(0.03)
  })

  it('rejects empty paths and invalid prices', () => {
    expect(calculatePutPremiumAnalysis({
      anchorPrice: 0,
      strike: 80,
      anchorDate: '2026-07-21',
      targetDate: '2026-07-24',
      paths: [],
    })).toBeUndefined()
  })

  it('marks sparse historical tails as insufficient premium evidence', () => {
    const analysis = calculatePutPremiumAnalysis({
      anchorPrice: 100,
      strike: 80,
      anchorDate: '2026-07-21',
      targetDate: '2026-07-24',
      effectiveSampleSize: 100,
      paths: Array.from({ length: 850 }, () => ({
        closeReturn: 0,
        lowReturn: -0.1,
        highReturn: 0.1,
      })),
    })!

    expect(analysis.effectiveLossEventCount).toBe(0)
    expect(analysis.lossEventCount).toBe(0)
  })

  it('reprices the capital hurdle without changing historical loss statistics', () => {
    const analysis = calculatePutPremiumAnalysis({
      anchorPrice: 100,
      strike: 95,
      anchorDate: '2026-07-21',
      targetDate: '2026-07-24',
      paths: [-0.2, -0.1, 0, 0.1].map((closeReturn) => ({
        closeReturn,
        lowReturn: closeReturn,
        highReturn: closeReturn,
      })),
    })!
    const repriced = repricePutPremiumAnalysis(analysis, {
      ...DEFAULT_PREMIUM_ASSUMPTIONS,
      annualCapitalReturnRate: 0.15,
    })!

    expect(repriced.expectedLossPerShare).toBe(analysis.expectedLossPerShare)
    expect(repriced.expectedLossInterval95).toEqual(analysis.expectedLossInterval95)
    expect(repriced.cvar95PerShare).toBe(analysis.cvar95PerShare)
    expect(repriced.capitalHurdlePerShare).toBeCloseTo(95 * 0.15 * 3 / 365)
    expect(repriced.capitalReturnFloorPerShare - analysis.capitalReturnFloorPerShare).toBeCloseTo(95 * 0.05 * 3 / 365)
  })
})
