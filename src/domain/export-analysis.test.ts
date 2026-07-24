import { describe, expect, it } from 'vitest'
import { applyGradePause } from './analysis-report'
import type { HorizonAnalysis, RiskSide } from './types'

const risk: RiskSide = {
  price: 100,
  returnPct: -0.2,
  expirationBreach: 0,
  expirationLower95: 0,
  expirationUpper95: 0.01,
  expirationRiskUpper95: 0.008,
  pathTouch: 0,
  pathTouchLower95: 0,
  pathTouchUpper95: 0.02,
  pathTouchRiskUpper95: 0.015,
  grade: 'safe',
}

const analysis = (weeks: number): HorizonAnalysis => ({
  weeks,
  targetDate: '2026-07-24',
  sampleSize: 500,
  effectiveSampleSize: 500,
  lower: [risk],
  upper: [risk],
  downsideDistribution: [],
  conservativeEstimate: {
    lower: { price: 60, returnPct: -0.4, evtUsed: false },
    upper: { price: 150, returnPct: 0.5, evtUsed: false },
  },
  conservativeCertification: { lower: risk, upper: risk },
  volatilityAdjustment: { available: false, method: 'test', cappedPathCount: 0 },
  empirical: {
    closeLowPct: -0.2,
    closeHighPct: 0.2,
    pathLowPct: -0.3,
    pathHighPct: 0.3,
    closeMinPct: -0.5,
    closeMaxPct: 0.5,
    pathMinPct: -0.6,
    pathMaxPct: 0.6,
  },
  bootstrap: {
    closeLowPct: [-0.25, -0.15],
    closeHighPct: [0.15, 0.25],
    pathLowPct: [-0.35, -0.25],
    pathHighPct: [0.25, 0.35],
  },
  evt: {
    note: 'stress',
    lowerDiagnostics: 'unavailable',
    upperDiagnostics: 'unavailable',
  },
})

describe('applyGradePause', () => {
  it('suppresses decision grades while preserving scenario horizons', () => {
    const exported = applyGradePause([analysis(1), analysis(5)], true)
    expect(exported[0].lower[0].grade).toBe('insufficient')
    expect(exported[0].conservativeCertification.lower.grade).toBe('insufficient')
    expect(exported[1].lower[0].grade).toBe('safe')
  })
})
