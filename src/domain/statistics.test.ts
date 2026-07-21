import { describe, expect, it } from 'vitest'
import { candidateForThreshold, classifyRisk, evaluateCandidate, quantile, wilsonUpper } from './statistics'

describe('statistics primitives', () => {
  it('interpolates quantiles', () => expect(quantile([0, 10, 20, 30], 0.25)).toBe(7.5))
  it('makes zero observed events non-zero at finite sample size', () => expect(wilsonUpper(0, 100)).toBeGreaterThan(0))
  it('uses both expiration and touch confidence limits', () => {
    expect(classifyRisk(0.004, 0.009, 120, 2)).toBe('conservative')
    expect(classifyRisk(0.015, 0.04, 120, 2)).toBe('safe')
    expect(classifyRisk(0.03, 0.04, 120, 2)).toBe('dangerous')
    expect(classifyRisk(0, 0, 80, 2)).toBe('insufficient')
    expect(classifyRisk(0, 0, 500, 6)).toBe('scenario')
  })
  it('evaluates continuous candidate prices without strike rounding', () => {
    const result = evaluateCandidate(100, 87.35, 'lower', [{ closeReturn: -0.1, lowReturn: -0.2, highReturn: 0.1 }], 200, 1)
    expect(result.price).toBe(87.35)
    expect(result.expirationBreach).toBe(0)
    expect(result.pathTouch).toBe(1)
  })

  it('finds the closest passing boundary rather than the most extreme observation', () => {
    const paths = Array.from({ length: 500 }, (_, index) => ({ closeReturn: index < 5 ? -0.2 : -0.02, lowReturn: index < 10 ? -0.25 : -0.04, highReturn: index < 10 ? 0.3 : 0.05 }))
    const lower = candidateForThreshold(100, 'lower', paths, 500, 1, 'safe')
    const upper = candidateForThreshold(100, 'upper', paths, 500, 1, 'safe')
    expect(lower.returnPct).toBeGreaterThan(-0.3)
    expect(upper.returnPct).toBeLessThan(0.31)
  })
})
