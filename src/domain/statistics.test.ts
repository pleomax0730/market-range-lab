import { describe, expect, it } from 'vitest'
import { buildDownsideDistribution, candidateForThreshold, classifyRisk, evaluateCandidate, quantile, wilsonUpper } from './statistics'
import { ONE_SIDED_Z95 } from './model'

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

  it('builds a monotonic downside ECDF without repeating bootstrap work', () => {
    const paths = [
      { closeReturn: -0.3, lowReturn: -0.4, highReturn: 0.1 },
      { closeReturn: -0.2, lowReturn: -0.3, highReturn: 0.1 },
      { closeReturn: 0.1, lowReturn: -0.1, highReturn: 0.2 },
      { closeReturn: 0.2, lowReturn: 0, highReturn: 0.3 },
    ]
    const curve = buildDownsideDistribution(paths, -0.1)
    expect(curve[0]).toMatchObject({ expirationBreach: 0, pathTouch: 0 })
    expect(curve.at(-1)).toMatchObject({ expirationBreach: 0.5, pathTouch: 0.75 })
    expect(curve.every((point, index) => index === 0 || point.expirationBreach >= curve[index - 1].expirationBreach)).toBe(true)
    expect(curve.every((point, index) => index === 0 || point.pathTouch >= curve[index - 1].pathTouch)).toBe(true)
  })

  it('keeps a positive finite-sample upper bound when no events were observed', () => {
    const paths = Array.from({ length: 500 }, () => ({ closeReturn: 0.05, lowReturn: -0.05, highReturn: 0.1 }))
    const result = evaluateCandidate(100, 50, 'lower', paths, 500, 1)
    expect(result.expirationBreach).toBe(0)
    expect(result.expirationUpper95).toBeCloseTo(wilsonUpper(0, 500))
    expect(result.expirationLower95).toBe(0)
    expect(result.expirationUpper95).toBeGreaterThan(0.005)
    expect(result.grade).not.toBe('conservative')
  })

  it('uses a one-sided 95% risk bound for directional grade decisions', () => {
    const paths = Array.from({ length: 763 }, () => ({ closeReturn: 0.05, lowReturn: -0.05, highReturn: 0.1 }))
    const result = evaluateCandidate(100, 50, 'lower', paths, 763, 1)
    expect(result.expirationUpper95).toBeGreaterThan(0.005)
    expect(result.expirationRiskUpper95).toBeCloseTo(wilsonUpper(0, 763, ONE_SIDED_Z95))
    expect(result.expirationRiskUpper95).toBeLessThan(0.005)
    expect(result.pathTouchRiskUpper95).toBeLessThan(0.01)
    expect(result.grade).toBe('conservative')
  })

  it('finds the closest passing boundary rather than the most extreme observation', () => {
    const paths = Array.from({ length: 500 }, (_, index) => ({ closeReturn: index < 5 ? -0.2 : -0.02, lowReturn: index < 10 ? -0.25 : -0.04, highReturn: index < 10 ? 0.3 : 0.05 }))
    const lower = candidateForThreshold(100, 'lower', paths, 500, 1, 'safe')
    const upper = candidateForThreshold(100, 'upper', paths, 500, 1, 'safe')
    expect(lower.returnPct).toBeGreaterThan(-0.3)
    expect(upper.returnPct).toBeLessThan(0.31)
  })


  it('searches the nearest passing price at cent precision across large event gaps', () => {
    const paths = Array.from({ length: 1_000 }, (_, index) => ({
      closeReturn: index < 5 ? -0.25 : -0.04,
      lowReturn: index < 10 ? -0.25 : -0.04,
      highReturn: index < 10 ? 0.25 : 0.04,
    }))
    const lower = candidateForThreshold(100, 'lower', paths, 1_000, 1, 'safe')
    const upper = candidateForThreshold(100, 'upper', paths, 1_000, 1, 'safe')
    expect(lower.price).toBe(95.99)
    expect(upper.price).toBe(104.01)
  })

  it('reports when finite evidence cannot support the requested grade at any price', () => {
    const paths = Array.from({ length: 500 }, () => ({ closeReturn: 0.05, lowReturn: -0.05, highReturn: 0.1 }))
    const result = candidateForThreshold(100, 'lower', paths, 500, 1, 'conservative')
    expect(result.meetsTarget).toBe(false)
    expect(result.requestedGrade).toBe('conservative')
  })
})
