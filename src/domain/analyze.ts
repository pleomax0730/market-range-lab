import { differenceInCalendarDays, getDay, parseISO } from 'date-fns'
import { isFinalRegularSessionOfWeek, targetWeekClose } from './market-calendar'
import { GRADE_THRESHOLDS } from './model'
import {
  buildDownsideDistribution,
  candidateForThreshold,
  evaluateCandidate,
  quantile,
  type HistoricalPath,
} from './statistics'
import type {
  BacktestResult,
  HorizonAnalysis,
  HorizonBacktest,
  ModelBoundaryEstimate,
  PriceBar,
  VolatilityAdjustment,
} from './types'

export type AnalysisInput = {
  bars: PriceBar[]
  anchorPrice: number
  anchorDate: string
  intraday: boolean
  interval?: 'daily' | 'weekly'
}

type VolatilityProfile = Array<number | undefined>
type ModeledPathSet = {
  raw: HistoricalPath[]
  lower: HistoricalPath[]
  upper: HistoricalPath[]
  volatility: VolatilityAdjustment
}

const DAILY_VOLATILITY_WINDOW = 20
const WEEKLY_VOLATILITY_WINDOW = 12
const MINIMUM_VOLATILITY_SCALE = 0.5
const MAXIMUM_VOLATILITY_SCALE = 2
const MINIMUM_BACKTEST_TRAINING_PATHS = 500

function standardDeviation(values: number[]) {
  if (values.length < 2) return undefined
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return variance > 0 && Number.isFinite(variance) ? Math.sqrt(variance) : undefined
}

function buildVolatilityProfile(bars: PriceBar[], interval: 'daily' | 'weekly'): VolatilityProfile {
  const window = interval === 'daily' ? DAILY_VOLATILITY_WINDOW : WEEKLY_VOLATILITY_WINDOW
  const returns = bars.map((bar, index) => index === 0 || bars[index - 1].close <= 0 || bar.close <= 0
    ? undefined
    : Math.log(bar.close / bars[index - 1].close))
  return bars.map((_, index) => {
    if (index < window) return undefined
    const sample = returns.slice(index - window + 1, index + 1).filter((value): value is number => value !== undefined)
    return sample.length === window ? standardDeviation(sample) : undefined
  })
}

function referenceVolatility(
  bars: PriceBar[],
  profile: VolatilityProfile,
  anchorDate: string,
  intraday: boolean,
) {
  let referenceIndex = -1
  for (let index = 0; index < bars.length; index += 1) {
    if (bars[index].date > anchorDate) break
    referenceIndex = index
  }
  if (intraday && bars[referenceIndex]?.date === anchorDate) referenceIndex -= 1
  return referenceIndex >= 0 ? profile[referenceIndex] : undefined
}

function extractWeeklyMatchedPaths(
  bars: PriceBar[],
  weeks: number,
  intraday: boolean,
  volatilityProfile: VolatilityProfile,
): HistoricalPath[] {
  const paths: HistoricalPath[] = []
  bars.forEach((start, startIndex) => {
    const targetIndex = startIndex + weeks - (intraday ? 1 : 0)
    const target = bars[targetIndex]
    if (!target) return
    const sequence = bars.slice(startIndex, targetIndex + 1)
    const hasMissingWeek = sequence.slice(1).some((bar, index) => {
      const days = differenceInCalendarDays(parseISO(bar.date), parseISO(sequence[index].date))
      return days < 5 || days > 9
    })
    if (hasMissingWeek) return
    const base = intraday ? start.open : start.close
    const window = bars.slice(intraday ? startIndex : startIndex + 1, targetIndex + 1)
    if (!window.length || base <= 0) return
    paths.push({
      closeReturn: target.close / base - 1,
      lowReturn: Math.min(...window.map((bar) => bar.low)) / base - 1,
      highReturn: Math.max(...window.map((bar) => bar.high)) / base - 1,
      startVolatility: volatilityProfile[intraday ? startIndex - 1 : startIndex],
    })
  })
  return paths
}

function extractMatchedPathsWithProfile(
  bars: PriceBar[],
  anchorDate: string,
  weeks: number,
  intraday: boolean,
  interval: 'daily' | 'weekly',
  volatilityProfile: VolatilityProfile,
): HistoricalPath[] {
  if (interval === 'weekly') return extractWeeklyMatchedPaths(bars, weeks, intraday, volatilityProfile)
  const anchorWeekday = getDay(parseISO(anchorDate))
  const rollsPastCurrentWeek = !intraday && isFinalRegularSessionOfWeek(anchorDate)
  const indexByDate = new Map(bars.map((bar, index) => [bar.date, index]))
  const paths: HistoricalPath[] = []
  bars.forEach((start, startIndex) => {
    if (getDay(parseISO(start.date)) !== anchorWeekday) return
    const targetDate = targetWeekClose(start.date, weeks, rollsPastCurrentWeek)
    const targetIndex = indexByDate.get(targetDate)
    if (targetIndex === undefined) return
    const target = bars[targetIndex]
    if (targetIndex < startIndex || differenceInCalendarDays(parseISO(target.date), parseISO(start.date)) > weeks * 7 + 4) return
    const base = intraday ? start.open : start.close
    const windowStart = intraday ? startIndex : startIndex + 1
    const window = bars.slice(windowStart, targetIndex + 1)
    if (!window.length || base <= 0) return
    paths.push({
      closeReturn: target.close / base - 1,
      lowReturn: Math.min(...window.map((bar) => bar.low)) / base - 1,
      highReturn: Math.max(...window.map((bar) => bar.high)) / base - 1,
      startVolatility: volatilityProfile[intraday ? startIndex - 1 : startIndex],
    })
  })
  return paths
}

export function extractMatchedPaths(
  bars: PriceBar[],
  anchorDate: string,
  weeks: number,
  intraday: boolean,
  interval: 'daily' | 'weekly' = 'daily',
): HistoricalPath[] {
  return extractMatchedPathsWithProfile(
    bars,
    anchorDate,
    weeks,
    intraday,
    interval,
    buildVolatilityProfile(bars, interval),
  )
}

function scaleReturn(returnPct: number, scale: number) {
  const bounded = Math.max(-0.9999, returnPct)
  return Math.exp(Math.log1p(bounded) * scale) - 1
}

function buildAdversePathSets(
  raw: HistoricalPath[],
  targetVolatility: number | undefined,
  interval: 'daily' | 'weekly',
): ModeledPathSet {
  if (!targetVolatility || targetVolatility <= 0) {
    return {
      raw,
      lower: raw,
      upper: raw,
      volatility: {
        available: false,
        method: interval === 'daily' ? '20-session realized volatility' : '12-week realized volatility',
        cappedPathCount: 0,
      },
    }
  }
  const scales: number[] = []
  let cappedPathCount = 0
  const adjusted = raw.map((path) => {
    const rawScale = path.startVolatility && path.startVolatility > 0
      ? targetVolatility / path.startVolatility
      : 1
    const scale = Math.min(MAXIMUM_VOLATILITY_SCALE, Math.max(MINIMUM_VOLATILITY_SCALE, rawScale))
    if (scale !== rawScale) cappedPathCount += 1
    scales.push(scale)
    return {
      closeReturn: scaleReturn(path.closeReturn, scale),
      lowReturn: scaleReturn(path.lowReturn, scale),
      highReturn: scaleReturn(path.highReturn, scale),
      startVolatility: path.startVolatility,
    }
  })
  const lower = raw.map((path, index) => ({
    ...path,
    closeReturn: Math.min(path.closeReturn, adjusted[index].closeReturn),
    lowReturn: Math.min(path.lowReturn, adjusted[index].lowReturn),
  }))
  const upper = raw.map((path, index) => ({
    ...path,
    closeReturn: Math.max(path.closeReturn, adjusted[index].closeReturn),
    highReturn: Math.max(path.highReturn, adjusted[index].highReturn),
  }))
  const annualization = Math.sqrt(interval === 'daily' ? 252 : 52)
  return {
    raw,
    lower,
    upper,
    volatility: {
      available: scales.length > 0,
      method: interval === 'daily'
        ? 'Full-history adverse envelope with 20-session volatility scaling'
        : 'Full-history adverse envelope with 12-week volatility scaling',
      targetAnnualized: targetVolatility * annualization,
      medianScale: quantile(scales, 0.5),
      minimumScale: scales.length ? Math.min(...scales) : undefined,
      maximumScale: scales.length ? Math.max(...scales) : undefined,
      cappedPathCount,
    },
  }
}

function modeledPathsWithProfile(
  input: AnalysisInput,
  weeks: number,
  profile: VolatilityProfile,
): ModeledPathSet {
  const interval = input.interval ?? 'daily'
  const raw = extractMatchedPathsWithProfile(
    input.bars,
    input.anchorDate,
    weeks,
    input.intraday,
    interval,
    profile,
  )
  return buildAdversePathSets(
    raw,
    referenceVolatility(input.bars, profile, input.anchorDate, input.intraday),
    interval,
  )
}

export function extractModeledPaths(input: AnalysisInput, weeks: number): ModeledPathSet {
  const interval = input.interval ?? 'daily'
  return modeledPathsWithProfile(input, weeks, buildVolatilityProfile(input.bars, interval))
}

export function estimateEffectiveSampleSize(paths: HistoricalPath[], weeks: number) {
  const values = paths.map((path) => path.closeReturn)
  if (!values.length) return 0
  const overlapCap = Math.max(1, Math.floor(values.length / Math.max(1, weeks)))
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const denominator = values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
  if (denominator <= Number.EPSILON) return 1
  let positiveAutocorrelation = 0
  const maxLag = Math.min(52, Math.floor(values.length / 4))
  for (let lag = 1; lag <= maxLag; lag += 1) {
    let numerator = 0
    for (let index = lag; index < values.length; index += 1) numerator += (values[index] - mean) * (values[index - lag] - mean)
    const correlation = numerator / denominator
    if (correlation <= 0) break
    positiveAutocorrelation += correlation
  }
  const serialEss = Math.max(1, Math.floor(values.length / (1 + 2 * positiveAutocorrelation)))
  return Math.min(overlapCap, serialEss)
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const rangeBootstrapWeightCache = new Map<string, Uint16Array[]>()

function rangeBootstrapWeights(sampleSize: number, iterations: number) {
  const cacheKey = `${sampleSize}:${iterations}`
  const cached = rangeBootstrapWeightCache.get(cacheKey)
  if (cached) return cached
  const random = seededRandom(sampleSize * 97)
  const block = Math.max(2, Math.round(Math.sqrt(sampleSize)))
  const plans: Uint16Array[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const weights = new Uint16Array(sampleSize)
    let sampled = 0
    while (sampled < sampleSize) {
      const start = Math.floor(random() * sampleSize)
      for (let offset = 0; offset < block && sampled < sampleSize; offset += 1) {
        weights[(start + offset) % sampleSize] += 1
        sampled += 1
      }
    }
    plans.push(weights)
  }
  rangeBootstrapWeightCache.set(cacheKey, plans)
  return plans
}

function sortedIndices(values: number[]) {
  return values.map((_, index) => index).sort((left, right) => values[left] - values[right])
}

function weightedQuantile(values: number[], order: number[], weights: Uint16Array, probability: number) {
  const position = (values.length - 1) * Math.min(1, Math.max(0, probability))
  const lowerRank = Math.floor(position)
  const upperRank = Math.ceil(position)
  let cumulative = 0
  let lowerValue = values[order[0]]
  let upperValue = lowerValue
  let lowerFound = false
  for (const index of order) {
    cumulative += weights[index]
    if (!lowerFound && cumulative > lowerRank) {
      lowerValue = values[index]
      lowerFound = true
    }
    if (cumulative > upperRank) {
      upperValue = values[index]
      break
    }
  }
  return lowerValue + (position - lowerRank) * (upperValue - lowerValue)
}

function bootstrapRangeIntervals(
  closeLows: number[],
  closeHighs: number[],
  pathLows: number[],
  pathHighs: number[],
  iterations = 300,
) {
  if (!closeLows.length) {
    const empty: [number, number] = [Number.NaN, Number.NaN]
    return { closeLowPct: empty, closeHighPct: empty, pathLowPct: empty, pathHighPct: empty }
  }
  const estimates = { closeLowPct: [] as number[], closeHighPct: [] as number[], pathLowPct: [] as number[], pathHighPct: [] as number[] }
  const closeLowOrder = sortedIndices(closeLows)
  const closeHighOrder = sortedIndices(closeHighs)
  const pathLowOrder = sortedIndices(pathLows)
  const pathHighOrder = sortedIndices(pathHighs)
  for (const weights of rangeBootstrapWeights(closeLows.length, iterations)) {
    estimates.closeLowPct.push(weightedQuantile(closeLows, closeLowOrder, weights, 0.005))
    estimates.closeHighPct.push(weightedQuantile(closeHighs, closeHighOrder, weights, 0.995))
    estimates.pathLowPct.push(weightedQuantile(pathLows, pathLowOrder, weights, 0.01))
    estimates.pathHighPct.push(weightedQuantile(pathHighs, pathHighOrder, weights, 0.99))
  }
  const interval = (values: number[]): [number, number] => [quantile(values, 0.025), quantile(values, 0.975)]
  return { closeLowPct: interval(estimates.closeLowPct), closeHighPct: interval(estimates.closeHighPct), pathLowPct: interval(estimates.pathLowPct), pathHighPct: interval(estimates.pathHighPct) }
}

type EvtResult = { stressPct?: number; diagnostics: string }

function fitGpd(exceedances: number[]) {
  if (exceedances.length < 30) return undefined
  const mean = exceedances.reduce((sum, value) => sum + value, 0) / exceedances.length
  const variance = exceedances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / exceedances.length
  if (!Number.isFinite(variance) || variance <= 0) return undefined
  const shape = 0.5 * (1 - (mean * mean) / variance)
  const scale = mean * (1 - shape)
  if (!Number.isFinite(shape) || !Number.isFinite(scale) || shape <= -0.45 || shape >= 0.45 || scale <= 0) return undefined
  return { shape, scale }
}

export function estimateEvtStress(values: number[], side: 'lower' | 'upper', targetProbability = 0.01): EvtResult {
  if (values.length < 300) return { diagnostics: 'Unavailable: fewer than 300 paths.' }
  const losses = values.map((value) => side === 'lower' ? -value : value).filter((value) => value > 0).sort((a, b) => a - b)
  if (losses.length < 100) return { diagnostics: 'Unavailable: fewer than 100 adverse observations.' }
  const threshold = quantile(losses, 0.9)
  const exceedances = losses.filter((value) => value > threshold).map((value) => value - threshold)
  const fit = fitGpd(exceedances)
  if (!fit) return { diagnostics: 'Unavailable: GPD moment fit failed.' }
  const stabilityThreshold = quantile(losses, 0.85)
  const stabilityFit = fitGpd(losses.filter((value) => value > stabilityThreshold).map((value) => value - stabilityThreshold))
  if (!stabilityFit || Math.abs(stabilityFit.shape - fit.shape) > 0.2) return { diagnostics: 'Unavailable: threshold-stability diagnostic failed.' }
  const ordered = [...exceedances].sort((a, b) => a - b)
  const ksDistance = ordered.reduce((maximum, value, index) => {
    const modeled = Math.abs(fit.shape) < 1e-8 ? 1 - Math.exp(-value / fit.scale) : 1 - Math.max(0, 1 + fit.shape * value / fit.scale) ** (-1 / fit.shape)
    return Math.max(maximum, Math.abs((index + 1) / ordered.length - modeled))
  }, 0)
  if (ksDistance > 1.36 / Math.sqrt(ordered.length)) return { diagnostics: 'Unavailable: goodness-of-fit diagnostic failed.' }
  const exceedanceRate = exceedances.length / values.length
  const tailProbability = targetProbability / exceedanceRate
  if (tailProbability <= 0 || tailProbability >= 1) return { diagnostics: 'Unavailable: the fitted tail does not reach the requested level.' }
  const { shape, scale } = fit
  const extreme = Math.abs(shape) < 1e-6 ? threshold - scale * Math.log(tailProbability) : threshold + (scale / shape) * (tailProbability ** -shape - 1)
  return { stressPct: side === 'lower' ? -extreme : extreme, diagnostics: `Valid GPD fit: probability=${targetProbability.toFixed(3)}, threshold=${threshold.toFixed(4)}, exceedances=${exceedances.length}, shape=${shape.toFixed(3)}, KS=${ksDistance.toFixed(3)}.` }
}

function combineEvtResults(primary: EvtResult, secondary: EvtResult, side: 'lower' | 'upper') {
  const available = [primary.stressPct, secondary.stressPct].filter((value): value is number => value !== undefined)
  return {
    stressPct: available.length
      ? (side === 'lower' ? Math.min(...available) : Math.max(...available))
      : undefined,
    diagnostics: `Close: ${primary.diagnostics} Path: ${secondary.diagnostics}`,
  }
}

function conservativeEstimate(
  anchorPrice: number,
  side: 'lower' | 'upper',
  bootstrap: ReturnType<typeof bootstrapRangeIntervals>,
  evtStressPct: number | undefined,
): ModelBoundaryEstimate {
  const base = side === 'lower'
    ? Math.min(bootstrap.closeLowPct[0], bootstrap.pathLowPct[0])
    : Math.max(bootstrap.closeHighPct[1], bootstrap.pathHighPct[1])
  const combined = evtStressPct === undefined || !Number.isFinite(evtStressPct)
    ? base
    : side === 'lower' ? Math.min(base, evtStressPct) : Math.max(base, evtStressPct)
  const returnPct = Number.isFinite(combined) ? Math.max(-0.9999, combined) : 0
  return {
    price: Math.max(0.01, anchorPrice * (1 + returnPct)),
    returnPct,
    evtUsed: evtStressPct !== undefined && Number.isFinite(evtStressPct) && evtStressPct === combined,
  }
}

function createBacktestResult(): BacktestResult {
  return { predictions: 0, expirationBreaches: 0, expirationRate: 0, pathTouchBreaches: 0, pathTouchRate: 0 }
}

function finalizeBacktestResult(result: BacktestResult): BacktestResult {
  return {
    ...result,
    expirationRate: result.predictions ? result.expirationBreaches / result.predictions : 0,
    pathTouchRate: result.predictions ? result.pathTouchBreaches / result.predictions : 0,
  }
}

function sortedQuantile(values: Float64Array, probability: number) {
  if (!values.length) return Number.NaN
  const position = (values.length - 1) * Math.min(1, Math.max(0, probability))
  const lower = Math.floor(position)
  const fraction = position - lower
  const upper = values[lower + 1]
  return upper === undefined ? values[lower] : values[lower] + fraction * (upper - values[lower])
}

function backtestBoundaries(rawPaths: HistoricalPath[], trainingLength: number, targetVolatility: number | undefined) {
  const lowerCloses = new Float64Array(trainingLength)
  const lowerLows = new Float64Array(trainingLength)
  const upperCloses = new Float64Array(trainingLength)
  const upperHighs = new Float64Array(trainingLength)
  for (let index = 0; index < trainingLength; index += 1) {
    const path = rawPaths[index]
    const rawScale = targetVolatility && path.startVolatility && path.startVolatility > 0
      ? targetVolatility / path.startVolatility
      : 1
    const scale = Math.min(MAXIMUM_VOLATILITY_SCALE, Math.max(MINIMUM_VOLATILITY_SCALE, rawScale))
    const adjustedClose = scaleReturn(path.closeReturn, scale)
    lowerCloses[index] = Math.min(path.closeReturn, adjustedClose)
    upperCloses[index] = Math.max(path.closeReturn, adjustedClose)
    lowerLows[index] = Math.min(path.lowReturn, scaleReturn(path.lowReturn, scale))
    upperHighs[index] = Math.max(path.highReturn, scaleReturn(path.highReturn, scale))
  }
  lowerCloses.sort()
  lowerLows.sort()
  upperCloses.sort()
  upperHighs.sort()
  const boundary = (side: 'lower' | 'upper', grade: 'conservative' | 'safe') => {
    const limits = GRADE_THRESHOLDS[grade]
    return side === 'lower'
      ? Math.min(
          sortedQuantile(lowerCloses, limits.expirationUpper95),
          sortedQuantile(lowerLows, limits.pathTouchUpper95),
        )
      : Math.max(
          sortedQuantile(upperCloses, 1 - limits.expirationUpper95),
          sortedQuantile(upperHighs, 1 - limits.pathTouchUpper95),
        )
  }
  return {
    lower: {
      conservative: boundary('lower', 'conservative'),
      safe: boundary('lower', 'safe'),
    },
    upper: {
      conservative: boundary('upper', 'conservative'),
      safe: boundary('upper', 'safe'),
    },
  }
}

function updateBacktestResult(result: BacktestResult, actual: HistoricalPath, side: 'lower' | 'upper', boundary: number) {
  result.predictions += 1
  if (side === 'lower') {
    if (actual.closeReturn <= boundary) result.expirationBreaches += 1
    if (actual.lowReturn <= boundary) result.pathTouchBreaches += 1
  } else {
    if (actual.closeReturn >= boundary) result.expirationBreaches += 1
    if (actual.highReturn >= boundary) result.pathTouchBreaches += 1
  }
}

export function backtestHistoricalPaths(rawPaths: HistoricalPath[], weeks: number, interval: 'daily' | 'weekly'): HorizonBacktest | undefined {
  if (weeks > 4 || rawPaths.length <= MINIMUM_BACKTEST_TRAINING_PATHS) return undefined
  const result = {
    lower: { conservative: createBacktestResult(), safe: createBacktestResult() },
    upper: { conservative: createBacktestResult(), safe: createBacktestResult() },
  }
  for (let index = MINIMUM_BACKTEST_TRAINING_PATHS; index < rawPaths.length; index += 1) {
    const actual = rawPaths[index]
    const boundaries = backtestBoundaries(rawPaths, index, actual.startVolatility)
    for (const grade of ['conservative', 'safe'] as const) {
      updateBacktestResult(result.lower[grade], actual, 'lower', boundaries.lower[grade])
      updateBacktestResult(result.upper[grade], actual, 'upper', boundaries.upper[grade])
    }
  }
  return {
    method: `Expanding-window out-of-sample quantile backtest with ${interval} volatility scaling`,
    minimumTrainingPaths: MINIMUM_BACKTEST_TRAINING_PATHS,
    lower: {
      conservative: finalizeBacktestResult(result.lower.conservative),
      safe: finalizeBacktestResult(result.lower.safe),
    },
    upper: {
      conservative: finalizeBacktestResult(result.upper.conservative),
      safe: finalizeBacktestResult(result.upper.safe),
    },
  }
}

function evaluateConservativeEstimate(
  estimate: ModelBoundaryEstimate,
  anchorPrice: number,
  side: 'lower' | 'upper',
  paths: HistoricalPath[],
  effectiveSampleSize: number,
  weeks: number,
) {
  const result = evaluateCandidate(anchorPrice, estimate.price, side, paths, effectiveSampleSize, weeks)
  const threshold = GRADE_THRESHOLDS.conservative
  const certified = weeks <= 4 &&
    effectiveSampleSize >= 100 &&
    result.expirationRiskUpper95 <= threshold.expirationUpper95 &&
    result.pathTouchRiskUpper95 <= threshold.pathTouchUpper95
  return {
    ...result,
    requestedGrade: 'conservative' as const,
    meetsTarget: certified,
    basis: certified ? 'certified' as const : 'model-estimate' as const,
  }
}

export function analyzeHistory(input: AnalysisInput): HorizonAnalysis[] {
  const interval = input.interval ?? 'daily'
  const profile = buildVolatilityProfile(input.bars, interval)
  return Array.from({ length: 8 }, (_, index) => {
    const weeks = index + 1
    const modeled = modeledPathsWithProfile(input, weeks, profile)
    const effectiveSampleSize = estimateEffectiveSampleSize(modeled.raw, weeks)
    const rawCloses = modeled.raw.map((path) => path.closeReturn)
    const rawLows = modeled.raw.map((path) => path.lowReturn)
    const rawHighs = modeled.raw.map((path) => path.highReturn)
    const lowerCloses = modeled.lower.map((path) => path.closeReturn)
    const lowerLows = modeled.lower.map((path) => path.lowReturn)
    const upperCloses = modeled.upper.map((path) => path.closeReturn)
    const upperHighs = modeled.upper.map((path) => path.highReturn)
    const lowerEvt = combineEvtResults(
      estimateEvtStress(lowerCloses, 'lower', 0.005),
      estimateEvtStress(lowerLows, 'lower', 0.01),
      'lower',
    )
    const upperEvt = combineEvtResults(
      estimateEvtStress(upperCloses, 'upper', 0.005),
      estimateEvtStress(upperHighs, 'upper', 0.01),
      'upper',
    )
    const rawBootstrap = bootstrapRangeIntervals(rawCloses, rawCloses, rawLows, rawHighs)
    const modeledBootstrap = bootstrapRangeIntervals(lowerCloses, upperCloses, lowerLows, upperHighs)
    const lowerEstimate = conservativeEstimate(input.anchorPrice, 'lower', modeledBootstrap, lowerEvt.stressPct)
    const upperEstimate = conservativeEstimate(input.anchorPrice, 'upper', modeledBootstrap, upperEvt.stressPct)
    const rawLowerConservative = candidateForThreshold(input.anchorPrice, 'lower', modeled.lower, effectiveSampleSize, weeks, 'conservative')
    const rawUpperConservative = candidateForThreshold(input.anchorPrice, 'upper', modeled.upper, effectiveSampleSize, weeks, 'conservative')
    const lowerConservative = evaluateConservativeEstimate(lowerEstimate, input.anchorPrice, 'lower', modeled.lower, effectiveSampleSize, weeks)
    const upperConservative = evaluateConservativeEstimate(upperEstimate, input.anchorPrice, 'upper', modeled.upper, effectiveSampleSize, weeks)
    const lowerSafe = candidateForThreshold(input.anchorPrice, 'lower', modeled.lower, effectiveSampleSize, weeks, 'safe')
    const distributionMaximum = lowerSafe.meetsTarget === false
      ? quantile(lowerLows, 0.05)
      : lowerSafe.returnPct
    return {
      weeks,
      targetDate: targetWeekClose(input.anchorDate, weeks, !input.intraday && isFinalRegularSessionOfWeek(input.anchorDate)),
      sampleSize: modeled.raw.length,
      effectiveSampleSize,
      lower: [lowerConservative, lowerSafe],
      upper: [
        upperConservative,
        candidateForThreshold(input.anchorPrice, 'upper', modeled.upper, effectiveSampleSize, weeks, 'safe'),
      ],
      downsideDistribution: buildDownsideDistribution(modeled.lower, distributionMaximum, 180, lowerEstimate.returnPct),
      conservativeEstimate: { lower: lowerEstimate, upper: upperEstimate },
      conservativeCertification: {
        lower: rawLowerConservative,
        upper: rawUpperConservative,
      },
      volatilityAdjustment: modeled.volatility,
      backtest: backtestHistoricalPaths(modeled.raw, weeks, interval),
      empirical: {
        closeLowPct: quantile(rawCloses, 0.005),
        closeHighPct: quantile(rawCloses, 0.995),
        pathLowPct: quantile(rawLows, 0.01),
        pathHighPct: quantile(rawHighs, 0.99),
        closeMinPct: rawCloses.length ? Math.min(...rawCloses) : Number.NaN,
        closeMaxPct: rawCloses.length ? Math.max(...rawCloses) : Number.NaN,
        pathMinPct: rawLows.length ? Math.min(...rawLows) : Number.NaN,
        pathMaxPct: rawHighs.length ? Math.max(...rawHighs) : Number.NaN,
      },
      bootstrap: rawBootstrap,
      evt: {
        lowerStressPct: lowerEvt.stressPct,
        upperStressPct: upperEvt.stressPct,
        lowerDiagnostics: lowerEvt.diagnostics,
        upperDiagnostics: upperEvt.diagnostics,
        note: 'EVT is a diagnostic-gated tail stress estimate aligned to 0.5% close and 1% path probabilities; it does not certify a grade.',
      },
    }
  })
}

export function repriceAnalyses(analyses: HorizonAnalysis[], anchorPrice: number): HorizonAnalysis[] {
  const repriceRisk = (risk: HorizonAnalysis['lower'][number]) => ({
    ...risk,
    price: anchorPrice * (1 + risk.returnPct),
  })
  const repriceEstimate = (estimate: ModelBoundaryEstimate): ModelBoundaryEstimate => ({
    ...estimate,
    price: anchorPrice * (1 + estimate.returnPct),
  })
  return analyses.map((analysis) => ({
    ...analysis,
    lower: analysis.lower.map(repriceRisk),
    upper: analysis.upper.map(repriceRisk),
    conservativeEstimate: {
      lower: repriceEstimate(analysis.conservativeEstimate.lower),
      upper: repriceEstimate(analysis.conservativeEstimate.upper),
    },
    conservativeCertification: {
      lower: repriceRisk(analysis.conservativeCertification.lower),
      upper: repriceRisk(analysis.conservativeCertification.upper),
    },
  }))
}
