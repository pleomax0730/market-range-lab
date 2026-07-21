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

export function wilsonLower(rate: number, sampleSize: number, z = 1.959963984540054) {
  if (sampleSize <= 0) return 0
  const p = Math.max(0, Math.min(1, rate))
  const denominator = 1 + (z * z) / sampleSize
  const center = p + (z * z) / (2 * sampleSize)
  const radius = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * sampleSize)) / sampleSize)
  return Math.max(0, (center - radius) / denominator)
}

const blockWeightCache = new Map<number, Uint16Array[]>()

function blockBootstrapWeights(sampleSize: number, iterations = 160) {
  const cached = blockWeightCache.get(sampleSize)
  if (cached) return cached
  const random = (() => { let state = sampleSize * 7919; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000 } })()
  const blockLength = Math.max(2, Math.round(Math.sqrt(sampleSize)))
  const plans: Uint16Array[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const weights = new Uint16Array(sampleSize)
    let sampled = 0
    while (sampled < sampleSize) {
      const start = Math.floor(random() * sampleSize)
      for (let offset = 0; offset < blockLength && sampled < sampleSize; offset += 1) {
        weights[(start + offset) % sampleSize] += 1
        sampled += 1
      }
    }
    plans.push(weights)
  }
  blockWeightCache.set(sampleSize, plans)
  return plans
}

function bootstrapEventInterval(events: boolean[]): [number, number] {
  if (!events.length) return [0, 1]
  const eventIndices = events.flatMap((event, index) => event ? [index] : [])
  const rates = blockBootstrapWeights(events.length).map((weights) => eventIndices.reduce((count, index) => count + weights[index], 0) / events.length)
  return [quantile(rates, 0.025), quantile(rates, 0.975)]
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
  if (!paths.length) return { price, returnPct, expirationBreach: 1, expirationLower95: 0, expirationUpper95: 1, pathTouch: 1, pathTouchLower95: 0, pathTouchUpper95: 1, grade: weeks > 4 ? 'scenario' : 'insufficient' }
  const epsilon = Number.EPSILON * 16
  const expirationEvents = paths.map((path) => side === 'lower' ? path.closeReturn <= returnPct + epsilon : path.closeReturn >= returnPct - epsilon)
  const touchEvents = paths.map((path) => side === 'lower' ? path.lowReturn <= returnPct + epsilon : path.highReturn >= returnPct - epsilon)
  const expirationBreach = expirationEvents.filter(Boolean).length / paths.length
  const pathTouch = touchEvents.filter(Boolean).length / paths.length
  const expirationBootstrap = bootstrapEventInterval(expirationEvents)
  const touchBootstrap = bootstrapEventInterval(touchEvents)
  const expirationLower95 = Math.min(expirationBootstrap[0], wilsonLower(expirationBreach, effectiveSampleSize))
  const expirationUpper95 = Math.max(expirationBootstrap[1], wilsonUpper(expirationBreach, effectiveSampleSize))
  const pathTouchLower95 = Math.min(touchBootstrap[0], wilsonLower(pathTouch, effectiveSampleSize))
  const pathTouchUpper95 = Math.max(touchBootstrap[1], wilsonUpper(pathTouch, effectiveSampleSize))
  return { price, returnPct, expirationBreach, expirationLower95, expirationUpper95, pathTouch, pathTouchLower95, pathTouchUpper95, grade: classifyRisk(expirationUpper95, pathTouchUpper95, effectiveSampleSize, weeks) }
}

export function candidateForThreshold(anchorPrice: number, side: 'lower' | 'upper', paths: HistoricalPath[], effectiveSampleSize: number, weeks: number, grade: 'conservative' | 'safe') {
  const expirationLimit = GRADE_THRESHOLDS[grade].expirationUpper95
  const touchLimit = GRADE_THRESHOLDS[grade].pathTouchUpper95
  if (!paths.length) return evaluateCandidate(anchorPrice, anchorPrice, side, paths, effectiveSampleSize, weeks)
  const maxObservedReturn = Math.max(...paths.map((path) => Math.max(path.closeReturn, path.highReturn)))
  const anchorCents = Math.max(1, Math.round(anchorPrice * 100))
  let low = side === 'lower' ? 1 : anchorCents
  let high = side === 'lower' ? anchorCents : Math.max(anchorCents + 1, Math.ceil(anchorPrice * (1 + maxObservedReturn) * 100) + 1)
  let answer = side === 'lower' ? low : high
  const evaluateCents = (cents: number) => {
    const result = evaluateCandidate(anchorPrice, cents / 100, side, paths, effectiveSampleSize, weeks)
    return { result, pass: result.expirationUpper95 <= expirationLimit && result.pathTouchUpper95 <= touchLimit }
  }
  const extreme = evaluateCents(answer)
  if (!extreme.pass) return { ...extreme.result, requestedGrade: grade, meetsTarget: false }
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const evaluation = evaluateCents(middle)
    if (side === 'lower') {
      if (evaluation.pass) { answer = middle; low = middle + 1 } else high = middle - 1
    } else if (evaluation.pass) { answer = middle; high = middle - 1 } else low = middle + 1
  }
  return { ...evaluateCents(answer).result, requestedGrade: grade, meetsTarget: true }
}
