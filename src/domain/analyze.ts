import { differenceInCalendarDays, getDay, parseISO } from 'date-fns'
import { isFinalRegularSessionOfWeek, targetWeekClose } from './market-calendar'
import { candidateForThreshold, quantile, type HistoricalPath } from './statistics'
import type { HorizonAnalysis, PriceBar } from './types'

export type AnalysisInput = {
  bars: PriceBar[]
  anchorPrice: number
  anchorDate: string
  intraday: boolean
}

export function extractMatchedPaths(bars: PriceBar[], anchorDate: string, weeks: number, intraday: boolean): HistoricalPath[] {
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
    })
  })
  return paths
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

function bootstrapRangeIntervals(closes: number[], lows: number[], highs: number[], iterations = 300) {
  if (!closes.length) {
    const empty: [number, number] = [Number.NaN, Number.NaN]
    return { closeLowPct: empty, closeHighPct: empty, pathLowPct: empty, pathHighPct: empty }
  }
  const random = seededRandom(closes.length * 97)
  const estimates = { closeLowPct: [] as number[], closeHighPct: [] as number[], pathLowPct: [] as number[], pathHighPct: [] as number[] }
  const block = Math.max(2, Math.round(Math.sqrt(closes.length)))
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const indices: number[] = []
    while (indices.length < closes.length) {
      const start = Math.floor(random() * closes.length)
      for (let offset = 0; offset < block && indices.length < closes.length; offset += 1) indices.push((start + offset) % closes.length)
    }
    estimates.closeLowPct.push(quantile(indices.map((index) => closes[index]), 0.01))
    estimates.closeHighPct.push(quantile(indices.map((index) => closes[index]), 0.99))
    estimates.pathLowPct.push(quantile(indices.map((index) => lows[index]), 0.01))
    estimates.pathHighPct.push(quantile(indices.map((index) => highs[index]), 0.99))
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

export function estimateEvtStress(values: number[], side: 'lower' | 'upper'): EvtResult {
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
  const tailProbability = 0.01 / exceedanceRate
  if (tailProbability <= 0 || tailProbability >= 1) return { diagnostics: 'Unavailable: the fitted tail does not reach the unconditional 1% level.' }
  const { shape, scale } = fit
  const extreme = Math.abs(shape) < 1e-6 ? threshold - scale * Math.log(tailProbability) : threshold + (scale / shape) * (tailProbability ** -shape - 1)
  return { stressPct: side === 'lower' ? -extreme : extreme, diagnostics: `Valid GPD fit: threshold=${threshold.toFixed(4)}, exceedances=${exceedances.length}, shape=${shape.toFixed(3)}, KS=${ksDistance.toFixed(3)}.` }
}

export function analyzeHistory(input: AnalysisInput): HorizonAnalysis[] {
  return Array.from({ length: 8 }, (_, index) => {
    const weeks = index + 1
    const paths = extractMatchedPaths(input.bars, input.anchorDate, weeks, input.intraday)
    const effectiveSampleSize = estimateEffectiveSampleSize(paths, weeks)
    const closes = paths.map((path) => path.closeReturn)
    const lows = paths.map((path) => path.lowReturn)
    const highs = paths.map((path) => path.highReturn)
    const lowerEvt = estimateEvtStress(lows, 'lower')
    const upperEvt = estimateEvtStress(highs, 'upper')
    const bootstrap = bootstrapRangeIntervals(closes, lows, highs)
    return {
      weeks,
      targetDate: targetWeekClose(input.anchorDate, weeks, !input.intraday && isFinalRegularSessionOfWeek(input.anchorDate)),
      sampleSize: paths.length,
      effectiveSampleSize,
      lower: [
        candidateForThreshold(input.anchorPrice, 'lower', paths, effectiveSampleSize, weeks, 'conservative'),
        candidateForThreshold(input.anchorPrice, 'lower', paths, effectiveSampleSize, weeks, 'safe'),
      ],
      upper: [
        candidateForThreshold(input.anchorPrice, 'upper', paths, effectiveSampleSize, weeks, 'conservative'),
        candidateForThreshold(input.anchorPrice, 'upper', paths, effectiveSampleSize, weeks, 'safe'),
      ],
      empirical: { closeLowPct: quantile(closes, 0.01), closeHighPct: quantile(closes, 0.99), pathLowPct: quantile(lows, 0.01), pathHighPct: quantile(highs, 0.99), closeMinPct: closes.length ? Math.min(...closes) : Number.NaN, closeMaxPct: closes.length ? Math.max(...closes) : Number.NaN, pathMinPct: lows.length ? Math.min(...lows) : Number.NaN, pathMaxPct: highs.length ? Math.max(...highs) : Number.NaN },
      bootstrap,
      evt: { lowerStressPct: lowerEvt.stressPct, upperStressPct: upperEvt.stressPct, lowerDiagnostics: lowerEvt.diagnostics, upperDiagnostics: upperEvt.diagnostics, note: 'EVT is a separate tail stress estimate, not a probability grade.' },
    }
  })
}
