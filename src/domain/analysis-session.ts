import {
  type AnalysisReportContext,
  type ReportQuote,
  type StatisticalReportInput,
} from './analysis-report'
import { previousRegularSession } from './market-calendar'
import {
  DEFAULT_PREMIUM_ASSUMPTIONS,
  type PremiumAssumptions,
} from './premium-analysis'
import type { HistoryDataset } from './types'

export type GradePauseReason =
  | 'stale-history'
  | 'stale-or-missing-quote'
  | 'weekly-intraday-resolution'

export type AnalysisSessionReference = {
  price: number
  anchorDate: string
  intraday: boolean
  mode: 'automatic' | 'manual'
  paused: boolean
  stale: boolean
  quote?: ReportQuote
  manualUpdatedAt?: string
  manualDate?: string
  manualSession?: 'intraday' | 'closed'
}

export type AnalysisSessionKnobs = {
  horizon: number
  candidate: string
  candidateSide: 'lower' | 'upper'
  annualCapitalReturnRatePct: string
}

export type AnalysisSessionPlan = {
  historyStale: boolean
  weeklyIntraday: boolean
  gradePaused: boolean
  pauseReasons: GradePauseReason[]
  reportInput?: StatisticalReportInput
  analysisKey?: string
  modelKey?: string
  context?: AnalysisReportContext
}

export function isHistoryStale(
  dataset: Pick<HistoryDataset, 'interval' | 'bars'>,
  anchorDate: string,
): boolean {
  const lastDate = dataset.bars.at(-1)?.date ?? ''
  if (dataset.interval === 'daily') {
    return lastDate < previousRegularSession(anchorDate)
  }
  return (
    Date.parse(`${anchorDate}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`) >
    14 * 86_400_000
  )
}

export function resolvePremiumAssumptions(
  annualCapitalReturnRatePct: string,
): PremiumAssumptions {
  const parsed = Number(annualCapitalReturnRatePct)
  return {
    ...DEFAULT_PREMIUM_ASSUMPTIONS,
    annualCapitalReturnRate:
      annualCapitalReturnRatePct.trim() &&
      Number.isFinite(parsed) &&
      parsed >= 0
        ? parsed / 100
        : DEFAULT_PREMIUM_ASSUMPTIONS.annualCapitalReturnRate,
  }
}

function toReportReference(
  reference: AnalysisSessionReference,
): AnalysisReportContext['reference'] {
  return {
    quote: reference.quote,
    price: reference.price,
    anchorDate: reference.anchorDate,
    intraday: reference.intraday,
    mode: reference.mode,
    paused: reference.paused,
    manualUpdatedAt: reference.manualUpdatedAt,
    manualDate: reference.manualDate,
    manualSession: reference.manualSession,
  }
}

export function buildAnalysisSession(
  dataset: HistoryDataset | undefined,
  reference: AnalysisSessionReference,
  knobs: AnalysisSessionKnobs,
): AnalysisSessionPlan {
  if (!dataset) {
    return {
      historyStale: false,
      weeklyIntraday: false,
      gradePaused: false,
      pauseReasons: [],
    }
  }

  const historyStale = isHistoryStale(dataset, reference.anchorDate)
  const weeklyIntraday = dataset.interval === 'weekly' && reference.intraday
  const gradePaused = reference.stale || historyStale || weeklyIntraday
  const pauseReasons: GradePauseReason[] = [
    ...(historyStale ? (['stale-history'] as const) : []),
    ...(reference.stale ? (['stale-or-missing-quote'] as const) : []),
    ...(weeklyIntraday ? (['weekly-intraday-resolution'] as const) : []),
  ]
  const context: AnalysisReportContext = {
    dataset,
    reference: toReportReference(reference),
    pauseReasons,
    selectedWeeks: knobs.horizon,
    premiumAssumptions: resolvePremiumAssumptions(
      knobs.annualCapitalReturnRatePct,
    ),
  }

  if (!(reference.price > 0)) {
    return {
      historyStale,
      weeklyIntraday,
      gradePaused,
      pauseReasons,
      context,
    }
  }

  const candidatePrice = Number(knobs.candidate)
  const reportInput: StatisticalReportInput = {
    analysis: {
      bars: dataset.bars,
      anchorPrice: reference.price,
      anchorDate: reference.anchorDate,
      intraday: reference.intraday,
      interval: dataset.interval,
    },
    candidate: candidatePrice > 0
      ? {
          weeks: knobs.horizon,
          price: candidatePrice,
          side: knobs.candidateSide,
        }
      : undefined,
    gradePaused,
  }
  const modelKey = [
    dataset.id,
    dataset.sha256,
    reference.anchorDate,
    reference.intraday,
    dataset.interval,
  ].join('|')

  return {
    historyStale,
    weeklyIntraday,
    gradePaused,
    pauseReasons,
    reportInput,
    analysisKey: `${modelKey}|price=${reference.price}`,
    modelKey,
    context,
  }
}
