import { addDays, differenceInCalendarDays, format, getDay, parseISO, startOfWeek } from 'date-fns'
import { isFinalRegularSessionOfWeek, targetWeekClose } from './market-calendar'
import { candidateForThreshold, quantile, type HistoricalPath } from './statistics'
import type { HorizonAnalysis, PriceBar } from './types'

export type AnalysisInput = {
  bars: PriceBar[]
  anchorPrice: number
  anchorDate: string
  intraday: boolean
}

function weekKey(date: string) {
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function extractMatchedPaths(bars: PriceBar[], anchorDate: string, weeks: number, intraday: boolean): HistoricalPath[] {
  const anchorWeekday = getDay(parseISO(anchorDate))
  const byWeek = new Map<string, PriceBar[]>()
  bars.forEach((bar) => {
    const key = weekKey(bar.date)
    byWeek.set(key, [...(byWeek.get(key) ?? []), bar])
  })
  const paths: HistoricalPath[] = []
  bars.forEach((start, startIndex) => {
    if (getDay(parseISO(start.date)) !== anchorWeekday) return
    const rollsPastCurrentWeek = !intraday && isFinalRegularSessionOfWeek(start.date)
    const targetWeekStart = addDays(parseISO(weekKey(start.date)), (weeks - 1 + (rollsPastCurrentWeek ? 1 : 0)) * 7)
    const targetBars = byWeek.get(format(targetWeekStart, 'yyyy-MM-dd'))
    if (!targetBars?.length) return
    const target = targetBars[targetBars.length - 1]
    const targetIndex = bars.findIndex((bar) => bar.date === target.date)
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

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function bootstrapQuantile(values: number[], probability: number, iterations = 400): [number, number] {
  if (!values.length) return [Number.NaN, Number.NaN]
  const random = seededRandom(values.length * 97 + Math.round(probability * 1000))
  const estimates: number[] = []
  const block = Math.max(2, Math.round(Math.sqrt(values.length)))
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample: number[] = []
    while (sample.length < values.length) {
      const start = Math.floor(random() * values.length)
      for (let offset = 0; offset < block && sample.length < values.length; offset += 1) sample.push(values[(start + offset) % values.length])
    }
    estimates.push(quantile(sample, probability))
  }
  return [quantile(estimates, 0.025), quantile(estimates, 0.975)]
}

function evtStress(values: number[], side: 'lower' | 'upper') {
  if (values.length < 300) return undefined
  const losses = values.map((value) => side === 'lower' ? -value : value).filter((value) => value > 0).sort((a, b) => a - b)
  if (losses.length < 100) return undefined
  const threshold = quantile(losses, 0.9)
  const exceedances = losses.filter((value) => value > threshold).map((value) => value - threshold)
  if (exceedances.length < 30) return undefined
  const mean = exceedances.reduce((sum, value) => sum + value, 0) / exceedances.length
  const variance = exceedances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / exceedances.length
  const shape = Math.max(-0.45, Math.min(0.45, 0.5 * (1 - (mean * mean) / variance)))
  const scale = Math.max(1e-6, mean * (1 - shape))
  const tailProbability = 0.01 / 0.1
  const extreme = Math.abs(shape) < 1e-6 ? threshold - scale * Math.log(tailProbability) : threshold + (scale / shape) * (tailProbability ** -shape - 1)
  return side === 'lower' ? -extreme : extreme
}

export function analyzeHistory(input: AnalysisInput): HorizonAnalysis[] {
  return Array.from({ length: 8 }, (_, index) => {
    const weeks = index + 1
    const paths = extractMatchedPaths(input.bars, input.anchorDate, weeks, input.intraday)
    const effectiveSampleSize = Math.floor(paths.length / weeks)
    const closes = paths.map((path) => path.closeReturn)
    const lows = paths.map((path) => path.lowReturn)
    const highs = paths.map((path) => path.highReturn)
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
      empirical: { closeLowPct: quantile(closes, 0.01), closeHighPct: quantile(closes, 0.99), pathLowPct: quantile(lows, 0.01), pathHighPct: quantile(highs, 0.99) },
      bootstrap: { closeLowPct: bootstrapQuantile(closes, 0.01), closeHighPct: bootstrapQuantile(closes, 0.99) },
      evt: { lowerStressPct: evtStress(lows, 'lower'), upperStressPct: evtStress(highs, 'upper'), note: 'EVT is a separate tail stress estimate, not a probability grade.' },
    }
  })
}
