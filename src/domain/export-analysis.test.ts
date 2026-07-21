import { describe, expect, it } from 'vitest'
import { applyGradePause } from './export-analysis'
import type { HorizonAnalysis, RiskSide } from './types'

const risk: RiskSide = { price: 100, returnPct: -0.2, expirationBreach: 0, expirationLower95: 0, expirationUpper95: 0.01, pathTouch: 0, pathTouchLower95: 0, pathTouchUpper95: 0.02, grade: 'safe' }
const analysis = (weeks: number): HorizonAnalysis => ({ weeks, targetDate: '2026-07-24', sampleSize: 500, effectiveSampleSize: 500, lower: [risk], upper: [risk], downsideDistribution: [], empirical: { closeLowPct: -0.2, closeHighPct: 0.2, pathLowPct: -0.3, pathHighPct: 0.3, closeMinPct: -0.5, closeMaxPct: 0.5, pathMinPct: -0.6, pathMaxPct: 0.6 }, bootstrap: { closeLowPct: [-0.25, -0.15], closeHighPct: [0.15, 0.25], pathLowPct: [-0.35, -0.25], pathHighPct: [0.25, 0.35] }, evt: { note: 'stress', lowerDiagnostics: 'unavailable', upperDiagnostics: 'unavailable' } })

describe('applyGradePause', () => {
  it('suppresses decision grades in exported analyses while preserving scenario horizons', () => {
    const exported = applyGradePause([analysis(1), analysis(5)], true)
    expect(exported[0].lower[0].grade).toBe('insufficient')
    expect(exported[1].lower[0].grade).toBe('safe')
  })
})
