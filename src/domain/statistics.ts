import type { DownsideDistributionPoint, RiskGrade, RiskSide } from './types'
import { GRADE_THRESHOLDS, ONE_SIDED_Z95 } from './model'

export type HistoricalPath = {
  closeReturn: number
  lowReturn: number
  highReturn: number
  startVolatility?: number
}

export function quantile(values: number[], probability: number) {
  if (!values.length) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, probability))
  const lower = Math.floor(position)
  const fraction = position - lower
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower])
}

function countAtOrBelow(sortedValues: number[], threshold: number) {
  let low = 0
  let high = sortedValues.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (sortedValues[middle] <= threshold) low = middle + 1
    else high = middle
  }
  return low
}

export function buildDownsideDistribution(
  paths: HistoricalPath[],
  maximumReturn: number,
  maximumPoints = 180,
  minimumReturnOverride?: number,
): DownsideDistributionPoint[] {
  if (!paths.length || !Number.isFinite(maximumReturn)) return []
  const closes = paths.map((path) => path.closeReturn).sort((a, b) => a - b)
  const lows = paths.map((path) => path.lowReturn).sort((a, b) => a - b)
  const minimumReturn = Math.min(closes[0], lows[0], maximumReturn, minimumReturnOverride ?? Number.POSITIVE_INFINITY)
  const span = Math.max(0.01, maximumReturn - minimumReturn)
  const baseline = Math.max(-0.9999, minimumReturn - span * 0.03)
  const thresholds = [
    baseline,
    ...closes.filter((value) => value >= minimumReturn && value <= maximumReturn),
    ...lows.filter((value) => value >= minimumReturn && value <= maximumReturn),
    ...(minimumReturnOverride !== undefined ? [minimumReturnOverride] : []),
    maximumReturn,
  ].sort((a, b) => a - b)
  const unique = thresholds.filter(
    (value, index) => index === 0 || value !== thresholds[index - 1],
  )
  const pointLimit = Math.max(2, Math.floor(maximumPoints))
  const selected =
    unique.length <= pointLimit
      ? unique
      : Array.from({ length: pointLimit }, (_, index) =>
          unique[Math.round((index * (unique.length - 1)) / (pointLimit - 1))],
        ).filter((value, index, values) => index === 0 || value !== values[index - 1])

  return selected.map((returnPct) => ({
    returnPct,
    expirationBreach: countAtOrBelow(closes, returnPct) / paths.length,
    pathTouch: countAtOrBelow(lows, returnPct) / paths.length,
  }))
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

function bootstrapEventStatistics(events: boolean[]) {
  if (!events.length) return { interval: [0, 1] as [number, number], upper95: 1 }
  const eventIndices = events.flatMap((event, index) => event ? [index] : [])
  const rates = blockBootstrapWeights(events.length).map((weights) => eventIndices.reduce((count, index) => count + weights[index], 0) / events.length)
  return {
    interval: [quantile(rates, 0.025), quantile(rates, 0.975)] as [number, number],
    upper95: quantile(rates, 0.95),
  }
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
  if (!paths.length) return { price, returnPct, expirationBreach: 1, expirationLower95: 0, expirationUpper95: 1, expirationRiskUpper95: 1, pathTouch: 1, pathTouchLower95: 0, pathTouchUpper95: 1, pathTouchRiskUpper95: 1, grade: weeks > 4 ? 'scenario' : 'insufficient' }
  const epsilon = Number.EPSILON * 16
  const expirationEvents = paths.map((path) => side === 'lower' ? path.closeReturn <= returnPct + epsilon : path.closeReturn >= returnPct - epsilon)
  const touchEvents = paths.map((path) => side === 'lower' ? path.lowReturn <= returnPct + epsilon : path.highReturn >= returnPct - epsilon)
  const expirationBreach = expirationEvents.filter(Boolean).length / paths.length
  const pathTouch = touchEvents.filter(Boolean).length / paths.length
  const expirationBootstrap = bootstrapEventStatistics(expirationEvents)
  const touchBootstrap = bootstrapEventStatistics(touchEvents)
  const expirationLower95 = Math.min(expirationBootstrap.interval[0], wilsonLower(expirationBreach, effectiveSampleSize))
  const expirationUpper95 = Math.max(expirationBootstrap.interval[1], wilsonUpper(expirationBreach, effectiveSampleSize))
  const expirationRiskUpper95 = Math.max(expirationBootstrap.upper95, wilsonUpper(expirationBreach, effectiveSampleSize, ONE_SIDED_Z95))
  const pathTouchLower95 = Math.min(touchBootstrap.interval[0], wilsonLower(pathTouch, effectiveSampleSize))
  const pathTouchUpper95 = Math.max(touchBootstrap.interval[1], wilsonUpper(pathTouch, effectiveSampleSize))
  const pathTouchRiskUpper95 = Math.max(touchBootstrap.upper95, wilsonUpper(pathTouch, effectiveSampleSize, ONE_SIDED_Z95))
  return { price, returnPct, expirationBreach, expirationLower95, expirationUpper95, expirationRiskUpper95, pathTouch, pathTouchLower95, pathTouchUpper95, pathTouchRiskUpper95, grade: classifyRisk(expirationRiskUpper95, pathTouchRiskUpper95, effectiveSampleSize, weeks) }
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
  const passesAtCents = (cents: number) => {
    const returnPct = (cents / 100) / anchorPrice - 1
    const epsilon = Number.EPSILON * 16
    const expirationEvents = paths.map((path) => side === 'lower' ? path.closeReturn <= returnPct + epsilon : path.closeReturn >= returnPct - epsilon)
    const touchEvents = paths.map((path) => side === 'lower' ? path.lowReturn <= returnPct + epsilon : path.highReturn >= returnPct - epsilon)
    const expirationRate = expirationEvents.filter(Boolean).length / paths.length
    const touchRate = touchEvents.filter(Boolean).length / paths.length
    const expirationUpper = Math.max(
      bootstrapEventStatistics(expirationEvents).upper95,
      wilsonUpper(expirationRate, effectiveSampleSize, ONE_SIDED_Z95),
    )
    if (expirationUpper > expirationLimit) return false
    const touchUpper = Math.max(
      bootstrapEventStatistics(touchEvents).upper95,
      wilsonUpper(touchRate, effectiveSampleSize, ONE_SIDED_Z95),
    )
    return touchUpper <= touchLimit
  }
  if (!passesAtCents(answer)) return { ...evaluateCandidate(anchorPrice, answer / 100, side, paths, effectiveSampleSize, weeks), requestedGrade: grade, meetsTarget: false }
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const pass = passesAtCents(middle)
    if (side === 'lower') {
      if (pass) { answer = middle; low = middle + 1 } else high = middle - 1
    } else if (pass) { answer = middle; high = middle - 1 } else low = middle + 1
  }
  return { ...evaluateCandidate(anchorPrice, answer / 100, side, paths, effectiveSampleSize, weeks), requestedGrade: grade, meetsTarget: true, basis: 'certified' as const }
}
