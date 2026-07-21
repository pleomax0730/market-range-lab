import type { RiskGrade, RiskSide } from './types'
import { GRADE_THRESHOLDS } from './model'

export type HistoricalPath = { closeReturn: number; lowReturn: number; highReturn: number }

export function quantile(values: number[], probability: number) {
  if (!values.length) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, probability))
  const lower = Math.floor(position)
  const fraction = position - lower
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower])
}

export function wilsonUpper(rate: number, sampleSize: number, z = 1.959963984540054) {
  if (sampleSize <= 0) return 1
  const successes = Math.max(0, Math.min(sampleSize, rate * sampleSize))
  const p = successes / sampleSize
  const denominator = 1 + (z * z) / sampleSize
  const center = p + (z * z) / (2 * sampleSize)
  const radius = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * sampleSize)) / sampleSize)
  return Math.min(1, (center + radius) / denominator)
}

function bootstrapEventUpper(events: boolean[], iterations = 160) {
  if (!events.length) return 1
  const random = (() => { let state = events.length * 7919 + events.filter(Boolean).length * 104729; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000 } })()
  const blockLength = Math.max(2, Math.round(Math.sqrt(events.length)))
  const rates: number[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let count = 0
    let sampled = 0
    while (sampled < events.length) {
      const start = Math.floor(random() * events.length)
      for (let offset = 0; offset < blockLength && sampled < events.length; offset += 1) {
        if (events[(start + offset) % events.length]) count += 1
        sampled += 1
      }
    }
    rates.push(count / events.length)
  }
  return quantile(rates, 0.975)
}

export function classifyRisk(expirationUpper: number, touchUpper: number, effectiveSampleSize: number, weeks: number): RiskGrade {
  if (weeks > 4) return 'scenario'
  if (effectiveSampleSize < 100) return 'insufficient'
  if (expirationUpper <= GRADE_THRESHOLDS.conservative.expirationUpper95 && touchUpper <= GRADE_THRESHOLDS.conservative.pathTouchUpper95) return 'conservative'
  if (expirationUpper <= GRADE_THRESHOLDS.safe.expirationUpper95 && touchUpper <= GRADE_THRESHOLDS.safe.pathTouchUpper95) return 'safe'
  return 'dangerous'
}

export function evaluateCandidate(anchorPrice: number, price: number, side: 'lower' | 'upper', paths: HistoricalPath[], effectiveSampleSize: number, weeks: number): RiskSide {
  const returnPct = price / anchorPrice - 1
  if (!paths.length) return { price, returnPct, expirationBreach: 1, expirationUpper95: 1, pathTouch: 1, pathTouchUpper95: 1, grade: weeks > 4 ? 'scenario' : 'insufficient' }
  const expirationEvents = paths.map((path) => side === 'lower' ? path.closeReturn <= returnPct : path.closeReturn >= returnPct)
  const touchEvents = paths.map((path) => side === 'lower' ? path.lowReturn <= returnPct : path.highReturn >= returnPct)
  const expirationBreach = expirationEvents.filter(Boolean).length / paths.length
  const pathTouch = touchEvents.filter(Boolean).length / paths.length
  const expirationUpper95 = bootstrapEventUpper(expirationEvents)
  const pathTouchUpper95 = bootstrapEventUpper(touchEvents)
  return { price, returnPct, expirationBreach, expirationUpper95, pathTouch, pathTouchUpper95, grade: classifyRisk(expirationUpper95, pathTouchUpper95, effectiveSampleSize, weeks) }
}

export function candidateForThreshold(anchorPrice: number, side: 'lower' | 'upper', paths: HistoricalPath[], effectiveSampleSize: number, weeks: number, grade: 'conservative' | 'safe') {
  const expirationLimit = GRADE_THRESHOLDS[grade].expirationUpper95
  const touchLimit = GRADE_THRESHOLDS[grade].pathTouchUpper95
  if (!paths.length) return evaluateCandidate(anchorPrice, anchorPrice, side, paths, effectiveSampleSize, weeks)
  const observed = Array.from(new Set(paths.flatMap((path) => side === 'lower' ? [path.closeReturn, path.lowReturn] : [path.closeReturn, path.highReturn]))).sort((a, b) => a - b)
  const values = side === 'lower' ? [observed[0] - 0.01, ...observed] : [...observed, observed.at(-1)! + 0.01]
  const passes = (value: number) => { const result = evaluateCandidate(anchorPrice, anchorPrice * (1 + value), side, paths, effectiveSampleSize, weeks); return { result, pass: result.expirationUpper95 <= expirationLimit && result.pathTouchUpper95 <= touchLimit } }
  let low = 0
  let high = values.length - 1
  let answer = side === 'lower' ? 0 : high
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const evaluation = passes(values[middle])
    if (side === 'lower') {
      if (evaluation.pass) { answer = middle; low = middle + 1 } else high = middle - 1
    } else if (evaluation.pass) { answer = middle; high = middle - 1 } else low = middle + 1
  }
  return passes(values[answer]).result
}
