import {
  type AnalysisReportContext,
  type ReportQuote,
  type StatisticalReportInput,
} from './analysis-report'
import { isWeeklyExpirySupported, resolveExpiryHorizon } from './expiry-horizon'
import { resolveAggressiveThresholds } from './model'
import { previousRegularSession } from './market-calendar'
import {
  DEFAULT_PREMIUM_ASSUMPTIONS,
  type PremiumAssumptions,
} from './premium-analysis'
import type { HistoryDataset } from './types'
import type { RecoveryFrontierSettings } from './candidate-recovery'

export type GradePauseReason =
  | 'stale-history'
  | 'stale-or-missing-quote'
  | 'weekly-intraday-resolution'
  | 'invalid-expiry'
  | 'weekly-expiry-resolution'
  | 'short-dated-intraday-resolution'

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
  expiryDate: string
  aggressiveExpirationRiskPct?: string
  aggressiveTouchRiskPct?: string
  candidate: string
  candidateSide: 'lower' | 'upper'
  netPremiumPerShare?: string
  recoveryFrontierSettings?: RecoveryFrontierSettings
  annualCapitalReturnRatePct: string
}

export type AnalysisSessionPlan = {
  historyStale: boolean
  weeklyIntraday: boolean
  expiryUnsupported: boolean
  shortDatedIntraday: boolean
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
      expiryUnsupported: false,
      shortDatedIntraday: false,
      gradePaused: false,
      pauseReasons: [],
    }
  }

  const historyStale = isHistoryStale(dataset, reference.anchorDate)
  const weeklyIntraday = dataset.interval === 'weekly' && reference.intraday
  const horizon = resolveExpiryHorizon(reference.anchorDate, knobs.expiryDate)
  const aggressive = resolveAggressiveThresholds(
    knobs.aggressiveExpirationRiskPct,
    knobs.aggressiveTouchRiskPct,
  )
  const invalidExpiry = !horizon || horizon.weeks > 8 || (horizon.tradingSessions === 0 && !reference.intraday)
  const weeklyExpiryUnsupported = Boolean(
    horizon &&
    dataset.interval === 'weekly' &&
    !isWeeklyExpirySupported(reference.anchorDate, knobs.expiryDate, reference.intraday),
  )
  const expiryUnsupported = invalidExpiry || weeklyExpiryUnsupported
  const shortDatedIntraday = Boolean(
    horizon &&
    dataset.interval === 'daily' &&
    reference.intraday &&
    horizon.tradingSessions <= 3,
  )
  const gradePaused = reference.stale || historyStale || weeklyIntraday || expiryUnsupported || shortDatedIntraday
  const pauseReasons: GradePauseReason[] = [
    ...(historyStale ? (['stale-history'] as const) : []),
    ...(reference.stale ? (['stale-or-missing-quote'] as const) : []),
    ...(weeklyIntraday ? (['weekly-intraday-resolution'] as const) : []),
    ...(invalidExpiry ? (['invalid-expiry'] as const) : []),
    ...(weeklyExpiryUnsupported ? (['weekly-expiry-resolution'] as const) : []),
    ...(shortDatedIntraday ? (['short-dated-intraday-resolution'] as const) : []),
  ]
  const context: AnalysisReportContext | undefined = horizon ? {
    dataset,
    reference: toReportReference(reference),
    pauseReasons,
    selectedExpiryDate: horizon.targetDate,
    selectedTradingSessions: horizon.tradingSessions,
    aggressiveThresholds: aggressive.thresholds,
    premiumAssumptions: resolvePremiumAssumptions(
      knobs.annualCapitalReturnRatePct,
    ),
  } : undefined

  if (!(reference.price > 0)) {
    return {
      historyStale,
      weeklyIntraday,
      expiryUnsupported,
      shortDatedIntraday,
      gradePaused,
      pauseReasons,
      context,
    }
  }

  if (!horizon || expiryUnsupported) {
    return {
      historyStale,
      weeklyIntraday,
      expiryUnsupported,
      shortDatedIntraday,
      gradePaused,
      pauseReasons,
      context,
    }
  }

  const candidatePrice = Number(knobs.candidate)
  const netPremiumText = knobs.netPremiumPerShare?.trim() ?? ''
  const netPremiumPerShare = Number(netPremiumText)
  const validNetPremium = knobs.candidateSide === 'lower' &&
    netPremiumText !== '' &&
    Number.isFinite(netPremiumPerShare) &&
    netPremiumPerShare >= 0 &&
    netPremiumPerShare < candidatePrice
  const reportInput: StatisticalReportInput = {
    analysis: {
      bars: dataset.bars,
      anchorPrice: reference.price,
      anchorDate: reference.anchorDate,
      intraday: reference.intraday,
      interval: dataset.interval,
      targetDates: [horizon.targetDate],
      aggressiveThresholds: aggressive.thresholds,
    },
    candidate: candidatePrice > 0
      ? {
          targetDate: horizon.targetDate,
          price: candidatePrice,
          side: knobs.candidateSide,
          ...(validNetPremium ? { netPremiumPerShare } : {}),
          ...(knobs.candidateSide === 'lower' && knobs.recoveryFrontierSettings
            ? { recoveryFrontierSettings: knobs.recoveryFrontierSettings }
            : {}),
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
    horizon.targetDate,
    aggressive.thresholds.expirationUpper95,
    aggressive.thresholds.pathTouchUpper95,
  ].join('|')

  return {
    historyStale,
    weeklyIntraday,
    expiryUnsupported,
    shortDatedIntraday,
    gradePaused,
    pauseReasons,
    reportInput,
    analysisKey: `${modelKey}|price=${reference.price}`,
    modelKey,
    context,
  }
}
