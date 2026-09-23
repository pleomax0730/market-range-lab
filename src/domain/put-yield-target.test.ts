import { describe, expect, it } from 'vitest'
import {
  calculatePutSimpleAnnualizedRatePct,
  calculatePutYieldScenario,
  calculatePutYieldTargets,
  calculateRequiredPutPremium,
} from './put-yield-target'

describe('calculateRequiredPutPremium', () => {
  it('以現金擔保履約價反推達標所需最低權利金', () => {
    expect(calculateRequiredPutPremium({
      strike: 40,
      targetAnnualizedRatePct: 20,
      daysToExpiry: 45,
    })).toBeCloseTo(0.9863, 4)
  })

  it('將每股交易成本加到最低權利金', () => {
    expect(calculateRequiredPutPremium({
      strike: 40,
      targetAnnualizedRatePct: 20,
      daysToExpiry: 45,
      transactionCostPerShare: 0.03,
    })).toBeCloseTo(1.0163, 4)
  })

  it('拒絕無效的履約價、報酬率與到期天數', () => {
    expect(calculateRequiredPutPremium({ strike: 0, targetAnnualizedRatePct: 20, daysToExpiry: 45 })).toBe(0)
    expect(calculateRequiredPutPremium({ strike: 40, targetAnnualizedRatePct: -1, daysToExpiry: 45 })).toBe(0)
    expect(calculateRequiredPutPremium({ strike: 40, targetAnnualizedRatePct: 20, daysToExpiry: 0 })).toBe(0)
  })
})

describe('calculatePutSimpleAnnualizedRatePct', () => {
  it('用權利金反算簡單年化報酬率', () => {
    expect(calculatePutSimpleAnnualizedRatePct({
      strike: 40,
      premiumPerShare: 1,
      daysToExpiry: 45,
    })).toBeCloseTo(20.2778, 4)
  })

  it('扣除成本後再計算年化報酬率', () => {
    expect(calculatePutSimpleAnnualizedRatePct({
      strike: 40,
      premiumPerShare: 1,
      daysToExpiry: 45,
      transactionCostPerShare: 0.03,
    })).toBeCloseTo(19.6694, 4)
  })
})

describe('calculatePutYieldTargets', () => {
  it('依目標年化數值排序並產生每股、每口與損益平衡價', () => {
    const results = calculatePutYieldTargets({
      strike: 40,
      targetAnnualizedRatesPct: [25, 15, 20, 20],
      daysToExpiry: 45,
    })

    expect(results.map((result) => result.targetAnnualizedRatePct)).toEqual([15, 20, 25])
    expect(results[1].requiredPremiumPerContract).toBeCloseTo(98.63, 2)
    expect(results[1].breakEvenPrice).toBeCloseTo(39.0137, 4)
  })
})

describe('calculatePutYieldScenario', () => {
  it('以參考日與指定到期日計算日曆天數', () => {
    const result = calculatePutYieldScenario({
      strike: 40,
      referencePrice: 42.6,
      referenceDate: '2026-09-23',
      expirationDate: '2026-10-16',
      targetAnnualizedRatesPct: [20],
    })

    expect(result?.daysToExpiry).toBe(23)
    expect(result?.targets[0].requiredPremiumPerShare).toBeCloseTo(0.5041, 4)
  })

  it('拒絕今天或過去的到期日', () => {
    expect(calculatePutYieldScenario({
      strike: 40,
      referencePrice: 42.6,
      referenceDate: '2026-09-23',
      expirationDate: '2026-09-23',
      targetAnnualizedRatesPct: [20],
    })).toBeUndefined()
  })
})
