import { analyzeHistory, extractModeledPaths, type AnalysisInput } from './analyze'
import { GRADE_THRESHOLDS, MODEL_VERSION } from './model'
import {
  calculatePutPremiumAnalysis,
  repricePutPremiumAnalysis,
  type PremiumAssumptions,
  type PutPremiumAnalysis,
} from './premium-analysis'
import { evaluateCandidate } from './statistics'
import {
  calculateCandidatePutRecovery,
  type CandidatePutRecoveryAnalysis,
} from './candidate-recovery'
import type {
  AssignmentRecoverySummary,
  DatasetMetadata,
  HistoryDataset,
  HorizonAnalysis,
  RiskSide,
  RiskThresholds,
} from './types'
import { rowsToCsv } from '../lib/export'

export type CandidateRequest = {
  targetDate: string
  price: number
  side: 'lower' | 'upper'
  netPremiumPerShare?: number
}

export type StatisticalReportInput = {
  analysis: AnalysisInput
  candidate?: CandidateRequest
  gradePaused: boolean
}

export type CandidateAnalysis = CandidateRequest & {
  weeks: number
  tradingSessions: number
  sampleSize: number
  result: RiskSide
  recovery?: CandidatePutRecoveryAnalysis
  premium?: PutPremiumAnalysis
  premiumUnavailableReason?: string
}

export type StatisticalAnalysisReport = {
  gradePaused: boolean
  analyses: HorizonAnalysis[]
  candidate?: CandidateAnalysis
}

export type ReportQuote = {
  symbol: string
  price: number
  quoteTime: string
  exchangeTimezone: string
  marketOpen: boolean
  stale: boolean
  source: string
}

export type AnalysisReportContext = {
  dataset: HistoryDataset
  reference: {
    quote?: ReportQuote
    price: number
    anchorDate: string
    intraday: boolean
    mode: 'automatic' | 'manual'
    paused: boolean
    manualUpdatedAt?: string
    manualDate?: string
    manualSession?: 'intraday' | 'closed'
  }
  pauseReasons: string[]
  selectedExpiryDate: string
  selectedTradingSessions: number
  aggressiveThresholds: RiskThresholds
  premiumAssumptions: PremiumAssumptions
}

export type AnalysisReport = {
  modelVersion: string
  thresholds: typeof GRADE_THRESHOLDS
  dataset: DatasetMetadata & {
    firstDate: string
    lastDate: string
    observationCount: number
  }
  quote?: ReportQuote
  quotePaused: boolean
  manualOverride: boolean
  manualUpdatedAt?: string
  manualDate?: string
  manualSession?: 'intraday' | 'closed'
  anchorPrice: number
  anchorDate: string
  intraday: boolean
  gradePaused: boolean
  pauseReasons: string[]
  selectedExpiryDate: string
  selectedTradingSessions: number
  aggressiveThresholds: RiskThresholds
  candidate?: CandidateAnalysis
  analyses: HorizonAnalysis[]
}

function pauseCandidate(result: RiskSide, weeks: number, paused: boolean): RiskSide {
  return paused && weeks <= 4 ? { ...result, grade: 'insufficient' } : result
}

export function applyGradePause(analyses: HorizonAnalysis[], paused: boolean) {
  return analyses.map((analysis) => ({
    ...analysis,
    lower: analysis.lower.map((risk) => ({
      ...risk,
      grade: paused && analysis.weeks <= 4 ? 'insufficient' as const : risk.grade,
    })),
    upper: analysis.upper.map((risk) => ({
      ...risk,
      grade: paused && analysis.weeks <= 4 ? 'insufficient' as const : risk.grade,
    })),
    conservativeCertification: {
      lower: {
        ...analysis.conservativeCertification.lower,
        grade: paused && analysis.weeks <= 4
          ? 'insufficient' as const
          : analysis.conservativeCertification.lower.grade,
      },
      upper: {
        ...analysis.conservativeCertification.upper,
        grade: paused && analysis.weeks <= 4
          ? 'insufficient' as const
          : analysis.conservativeCertification.upper.grade,
      },
    },
  }))
}

export function calculateStatisticalReport(
  input: StatisticalReportInput,
  precomputedAnalyses?: HorizonAnalysis[],
): StatisticalAnalysisReport {
  const rawAnalyses = precomputedAnalyses ?? analyzeHistory(input.analysis)
  const candidateAnalysis = input.candidate
    ? rawAnalyses.find((analysis) => analysis.targetDate === input.candidate!.targetDate)
    : undefined
  let candidate: CandidateAnalysis | undefined
  if (input.candidate && candidateAnalysis) {
    const modeledPaths = extractModeledPaths(input.analysis, input.candidate.targetDate)
    const paths = modeledPaths.raw
    const riskPaths = input.candidate.side === 'lower'
      ? modeledPaths.lower
      : modeledPaths.upper
    const result = evaluateCandidate(
      input.analysis.anchorPrice,
      input.candidate.price,
      input.candidate.side,
      riskPaths,
      candidateAnalysis.effectiveSampleSize,
      candidateAnalysis.weeks,
      input.analysis.aggressiveThresholds,
    )
    const premium = input.candidate.side === 'lower'
      ? calculatePutPremiumAnalysis({
          anchorPrice: input.analysis.anchorPrice,
          strike: input.candidate.price,
          anchorDate: input.analysis.anchorDate,
          targetDate: candidateAnalysis.targetDate,
          paths,
          effectiveSampleSize: candidateAnalysis.effectiveSampleSize,
        })
      : undefined
    const recovery = input.candidate.side === 'lower'
      ? calculateCandidatePutRecovery({
          bars: input.analysis.bars,
          paths,
          anchorPrice: input.analysis.anchorPrice,
          strike: input.candidate.price,
          effectiveSampleSize: candidateAnalysis.effectiveSampleSize,
          interval: input.analysis.interval ?? 'daily',
          netPremiumPerShare: input.candidate.netPremiumPerShare,
        })
      : undefined
    candidate = {
      ...input.candidate,
      weeks: candidateAnalysis.weeks,
      tradingSessions: candidateAnalysis.tradingSessions,
      sampleSize: paths.length,
      result: pauseCandidate(result, candidateAnalysis.weeks, input.gradePaused),
      recovery,
      premium,
      ...(input.candidate.side === 'upper'
        ? { premiumUnavailableReason: 'Naked Call 損失沒有上限；歷史最大漲幅無法形成可靠的最低 Premium。' }
        : premium
          ? {}
          : { premiumUnavailableReason: '沒有足夠的有效歷史路徑計算最低 Premium。' }),
    }
  }
  return {
    gradePaused: input.gradePaused,
    analyses: applyGradePause(rawAnalyses, input.gradePaused),
    candidate,
  }
}

function metadataOf(dataset: HistoryDataset): AnalysisReport['dataset'] {
  return {
    id: dataset.id,
    symbol: dataset.symbol,
    filename: dataset.filename,
    sourceUrl: dataset.sourceUrl,
    importedAt: dataset.importedAt,
    sha256: dataset.sha256,
    splitAdjustedConfirmed: dataset.splitAdjustedConfirmed,
    discontinuitiesConfirmed: dataset.discontinuitiesConfirmed,
    interval: dataset.interval,
    modelVersion: dataset.modelVersion,
    quality: dataset.quality,
    firstDate: dataset.bars[0]?.date ?? '',
    lastDate: dataset.bars.at(-1)?.date ?? '',
    observationCount: dataset.bars.length,
  }
}

export function composeAnalysisReport(
  statistical: StatisticalAnalysisReport,
  context: AnalysisReportContext,
): AnalysisReport {
  const adjustedPremium = statistical.candidate?.premium
    ? repricePutPremiumAnalysis(
        statistical.candidate.premium,
        context.premiumAssumptions,
      )
    : undefined
  const candidate = statistical.candidate
    ? { ...statistical.candidate, premium: adjustedPremium }
    : undefined
  return {
    modelVersion: MODEL_VERSION,
    thresholds: GRADE_THRESHOLDS,
    dataset: metadataOf(context.dataset),
    quote: context.reference.quote,
    quotePaused: context.reference.paused,
    manualOverride: context.reference.mode === 'manual',
    manualUpdatedAt: context.reference.manualUpdatedAt,
    manualDate: context.reference.mode === 'manual' ? context.reference.manualDate : undefined,
    manualSession: context.reference.mode === 'manual' ? context.reference.manualSession : undefined,
    anchorPrice: context.reference.price,
    anchorDate: context.reference.anchorDate,
    intraday: context.reference.intraday,
    gradePaused: statistical.gradePaused,
    pauseReasons: context.pauseReasons,
    selectedExpiryDate: context.selectedExpiryDate,
    selectedTradingSessions: context.selectedTradingSessions,
    aggressiveThresholds: context.aggressiveThresholds,
    candidate,
    analyses: statistical.analyses,
  }
}

function recoveryCsvFields(
  prefix: string,
  recovery: AssignmentRecoverySummary | undefined,
) {
  return {
    [`${prefix}Estimator`]: recovery?.estimator ?? '',
    [`${prefix}PeriodUnit`]: recovery?.periodUnit ?? '',
    [`${prefix}AssignmentEvents`]: recovery?.assignmentEvents ?? '',
    [`${prefix}EffectiveAssignmentEvents`]: recovery?.effectiveAssignmentEvents ?? '',
    [`${prefix}RecoveredEvents`]: recovery?.recoveredEvents ?? '',
    [`${prefix}UnrecoveredEvents`]: recovery?.unrecoveredEvents ?? '',
    [`${prefix}MedianPeriods`]: recovery?.medianPeriods ?? '',
    [`${prefix}P75Periods`]: recovery?.p75Periods ?? '',
    [`${prefix}MaximumRecoveredPeriods`]: recovery?.maximumPeriods ?? '',
    [`${prefix}MedianCalendarDays`]: recovery?.medianCalendarDays ?? '',
    [`${prefix}P75CalendarDays`]: recovery?.p75CalendarDays ?? '',
    [`${prefix}MaximumRecoveredCalendarDays`]: recovery?.maximumCalendarDays ?? '',
    [`${prefix}Windows`]: JSON.stringify(recovery?.windows ?? []),
  }
}

function reportRows(report: AnalysisReport) {
  return report.analyses.flatMap((analysis) =>
    (['lower', 'upper'] as const).flatMap((side) =>
      analysis[side].map((risk) => ({
        symbol: report.dataset.symbol,
        interval: report.dataset.interval,
        modelVersion: report.modelVersion,
        dataHash: report.dataset.sha256,
        sourceUrl: report.dataset.sourceUrl,
        filename: report.dataset.filename,
        importedAt: report.dataset.importedAt,
        firstDate: report.dataset.firstDate,
        lastDate: report.dataset.lastDate,
        observationCount: report.dataset.observationCount,
        qualityWarnings: JSON.stringify(report.dataset.quality?.warnings ?? []),
        conservativeExpirationUpper95: report.thresholds.conservative.expirationUpper95,
        conservativeTouchUpper95: report.thresholds.conservative.pathTouchUpper95,
        safeExpirationUpper95: report.thresholds.safe.expirationUpper95,
        safeTouchUpper95: report.thresholds.safe.pathTouchUpper95,
        quoteTime: report.manualOverride
          ? (report.manualUpdatedAt ?? '')
          : (report.quote?.quoteTime ?? ''),
        quoteSource: report.manualOverride
          ? 'Manual Reference Price'
          : (report.quote?.source ?? ''),
        quoteSymbol: report.quote?.symbol ?? '',
        quotePaused: String(report.quotePaused),
        manualOverride: String(report.manualOverride),
        manualUpdatedAt: report.manualUpdatedAt ?? '',
        manualDate: report.manualDate ?? '',
        manualSession: report.manualSession ?? '',
        intraday: String(report.intraday),
        gradePaused: String(report.gradePaused),
        pauseReasons: report.pauseReasons.join('|'),
        anchorPrice: report.anchorPrice,
        anchorDate: report.anchorDate,
        selectedExpiryDate: report.selectedExpiryDate,
        selectedTradingSessions: report.selectedTradingSessions,
        aggressiveExpirationUpper95: report.aggressiveThresholds.expirationUpper95,
        aggressivePathTouchUpper95: report.aggressiveThresholds.pathTouchUpper95,
        weeks: analysis.weeks,
        targetDate: analysis.targetDate,
        tradingSessions: analysis.tradingSessions,
        analysisAggressiveExpirationUpper95: analysis.aggressiveThresholds.expirationUpper95,
        analysisAggressivePathTouchUpper95: analysis.aggressiveThresholds.pathTouchUpper95,
        side,
        grade: risk.grade,
        price: risk.price,
        returnPct: risk.returnPct,
        expirationEstimate: risk.expirationBreach,
        expirationLower95: risk.expirationLower95,
        expirationUpper95: risk.expirationUpper95,
        expirationRiskUpper95: risk.expirationRiskUpper95,
        touchEstimate: risk.pathTouch,
        touchLower95: risk.pathTouchLower95,
        touchUpper95: risk.pathTouchUpper95,
        touchRiskUpper95: risk.pathTouchRiskUpper95,
        riskBasis: risk.basis ?? '',
        requestedGrade: risk.requestedGrade ?? '',
        gradeTargetMet: risk.meetsTarget === undefined ? '' : String(risk.meetsTarget),
        sampleSize: analysis.sampleSize,
        effectiveSampleSize: analysis.effectiveSampleSize,
        modelConservativeEstimatePrice: side === 'lower'
          ? analysis.conservativeEstimate.lower.price
          : analysis.conservativeEstimate.upper.price,
        modelConservativeEstimateReturnPct: side === 'lower'
          ? analysis.conservativeEstimate.lower.returnPct
          : analysis.conservativeEstimate.upper.returnPct,
        modelConservativeEstimateUsedEvt: String(side === 'lower'
          ? analysis.conservativeEstimate.lower.evtUsed
          : analysis.conservativeEstimate.upper.evtUsed),
        certifiedConservativePrice: side === 'lower'
          ? (analysis.conservativeCertification.lower.meetsTarget === false ? '' : analysis.conservativeCertification.lower.price)
          : (analysis.conservativeCertification.upper.meetsTarget === false ? '' : analysis.conservativeCertification.upper.price),
        certifiedConservativeReturnPct: side === 'lower'
          ? (analysis.conservativeCertification.lower.meetsTarget === false ? '' : analysis.conservativeCertification.lower.returnPct)
          : (analysis.conservativeCertification.upper.meetsTarget === false ? '' : analysis.conservativeCertification.upper.returnPct),
        volatilityAdjustmentAvailable: String(analysis.volatilityAdjustment.available),
        volatilityAdjustmentMethod: analysis.volatilityAdjustment.method,
        currentAnnualizedVolatility: analysis.volatilityAdjustment.targetAnnualized ?? '',
        medianVolatilityScale: analysis.volatilityAdjustment.medianScale ?? '',
        minimumVolatilityScale: analysis.volatilityAdjustment.minimumScale ?? '',
        maximumVolatilityScale: analysis.volatilityAdjustment.maximumScale ?? '',
        cappedVolatilityPathCount: analysis.volatilityAdjustment.cappedPathCount,
        backtestMethod: analysis.backtest?.method ?? '',
        backtestMinimumTrainingPaths: analysis.backtest?.minimumTrainingPaths ?? '',
        backtestPredictionStartDate: analysis.backtest?.predictionStartDate ?? '',
        backtestPredictionEndDate: analysis.backtest?.predictionEndDate ?? '',
        backtestPredictions: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].predictions ?? '')
          : '',
        backtestExpirationBreaches: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].expirationBreaches ?? '')
          : '',
        backtestExpirationRate: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].expirationRate ?? '')
          : '',
        backtestTouchBreaches: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].pathTouchBreaches ?? '')
          : '',
        backtestTouchRate: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].pathTouchRate ?? '')
          : '',
        backtestRecoveryPeriodUnit: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.periodUnit ?? '')
          : '',
        backtestAssignmentEvents: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.assignmentEvents ?? '')
          : '',
        backtestRecoveredEvents: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.recoveredEvents ?? '')
          : '',
        backtestUnrecoveredEvents: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.unrecoveredEvents ?? '')
          : '',
        backtestRecoveryMedianPeriods: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.medianPeriods ?? '')
          : '',
        backtestRecoveryP75Periods: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.p75Periods ?? '')
          : '',
        backtestRecoveryMaximumPeriods: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.maximumPeriods ?? '')
          : '',
        backtestRecoveryMedianCalendarDays: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.medianCalendarDays ?? '')
          : '',
        backtestRecoveryP75CalendarDays: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.p75CalendarDays ?? '')
          : '',
        backtestRecoveryMaximumCalendarDays: risk.requestedGrade
          ? (analysis.backtest?.[side][risk.requestedGrade].recovery?.maximumCalendarDays ?? '')
          : '',
        backtestRecoveryWindows: risk.requestedGrade
          ? JSON.stringify(analysis.backtest?.[side][risk.requestedGrade].recovery?.windows ?? [])
          : '',
        pathMinPct: analysis.empirical.pathMinPct,
        pathMaxPct: analysis.empirical.pathMaxPct,
        evtStressPct: side === 'lower'
          ? (analysis.evt.lowerStressPct ?? '')
          : (analysis.evt.upperStressPct ?? ''),
        evtDiagnostics: side === 'lower'
          ? analysis.evt.lowerDiagnostics
          : analysis.evt.upperDiagnostics,
        candidateSide: report.candidate?.side ?? '',
        candidateTargetDate: report.candidate?.targetDate ?? '',
        candidateWeeks: report.candidate?.weeks ?? '',
        candidateTradingSessions: report.candidate?.tradingSessions ?? '',
        candidateSampleSize: report.candidate?.sampleSize ?? '',
        candidatePrice: report.candidate?.result.price ?? '',
        candidateGrade: report.candidate?.result.grade ?? '',
        candidateReturnPct: report.candidate?.result.returnPct ?? '',
        candidateExpirationEstimate: report.candidate?.result.expirationBreach ?? '',
        candidateExpirationLower95: report.candidate?.result.expirationLower95 ?? '',
        candidateExpirationUpper95: report.candidate?.result.expirationUpper95 ?? '',
        candidateExpirationRiskUpper95: report.candidate?.result.expirationRiskUpper95 ?? '',
        candidateTouchEstimate: report.candidate?.result.pathTouch ?? '',
        candidateTouchLower95: report.candidate?.result.pathTouchLower95 ?? '',
        candidateTouchUpper95: report.candidate?.result.pathTouchUpper95 ?? '',
        candidateTouchRiskUpper95: report.candidate?.result.pathTouchRiskUpper95 ?? '',
        candidateRecoveryMethod: report.candidate?.recovery?.method ?? '',
        candidateRecoverySampleSize: report.candidate?.recovery?.sampleSize ?? '',
        candidateRecoveryEffectiveSampleSize: report.candidate?.recovery?.effectiveSampleSize ?? '',
        candidateRecoveryMoneyness: report.candidate?.recovery?.moneyness ?? '',
        candidateRecoveryAssignmentEvents: report.candidate?.recovery?.assignmentEvents ?? '',
        candidateRecoveryEffectiveAssignmentEvents: report.candidate?.recovery?.effectiveAssignmentEvents ?? '',
        candidateRecoveryHistoricalAssignmentRate: report.candidate?.recovery?.historicalAssignmentRate ?? '',
        candidateRecoveryHistoricalAssignmentLower95: report.candidate?.recovery?.historicalAssignmentLower95 ?? '',
        candidateRecoveryHistoricalAssignmentUpper95: report.candidate?.recovery?.historicalAssignmentUpper95 ?? '',
        candidateRecoveryEvidence: report.candidate?.recovery?.evidence ?? '',
        ...recoveryCsvFields(
          'candidateStrikeRecovery',
          report.candidate?.recovery?.strikeRecovery,
        ),
        candidateBreakEvenNetPremiumPerShare: report.candidate?.recovery?.breakEven?.netPremiumPerShare ?? '',
        candidateBreakEvenPremiumRate: report.candidate?.recovery?.breakEven?.premiumRate ?? '',
        candidateBreakEvenPrice: report.candidate?.recovery?.breakEven?.currentBreakEvenPrice ?? '',
        ...recoveryCsvFields(
          'candidateBreakEvenRecovery',
          report.candidate?.recovery?.breakEven?.recovery,
        ),
        candidatePremiumUnavailableReason: report.candidate?.premiumUnavailableReason ?? '',
        candidatePremiumLossEvents: report.candidate?.premium?.lossEventCount ?? '',
        candidatePremiumEffectiveLossEvents: report.candidate?.premium?.effectiveLossEventCount ?? '',
        candidatePremiumExpectedLoss: report.candidate?.premium?.expectedLossPerShare ?? '',
        candidatePremiumConditionalLoss: report.candidate?.premium?.conditionalLossPerShare ?? '',
        candidatePremiumExpectedLossLower95: report.candidate?.premium?.expectedLossInterval95[0] ?? '',
        candidatePremiumExpectedLossUpper95: report.candidate?.premium?.expectedLossInterval95[1] ?? '',
        candidatePremiumCvar95: report.candidate?.premium?.cvar95PerShare ?? '',
        candidatePremiumMaximumHistoricalLoss: report.candidate?.premium?.maximumHistoricalLossPerShare ?? '',
        candidatePremiumDaysToExpiry: report.candidate?.premium?.daysToExpiry ?? '',
        candidatePremiumTransactionCost: report.candidate?.premium?.transactionCostPerShare ?? '',
        candidatePremiumAnnualCapitalReturnRate: report.candidate?.premium?.annualCapitalReturnRate ?? '',
        candidatePremiumLightTailWeight: report.candidate?.premium?.lightTailWeight ?? '',
        candidatePremiumConservativeTailWeight: report.candidate?.premium?.conservativeTailWeight ?? '',
        candidatePremiumStatisticalFloor: report.candidate?.premium?.statisticalFloorPerShare ?? '',
        candidatePremiumCapitalReturnFloor: report.candidate?.premium?.capitalReturnFloorPerShare ?? '',
        candidatePremiumLightTailFloor: report.candidate?.premium?.lightTailFloorPerShare ?? '',
        candidatePremiumConservativeTailFloor: report.candidate?.premium?.conservativeTailFloorPerShare ?? '',
      })),
    ),
  )
}

export function serializeAnalysisReport(report: AnalysisReport, kind: 'json' | 'csv') {
  const base = `${report.dataset.symbol}-range-analysis-${report.anchorDate}`
  if (kind === 'json') {
    return {
      filename: `${base}.json`,
      text: JSON.stringify(report, null, 2),
      mimeType: 'application/json',
    }
  }
  return {
    filename: `${base}.csv`,
    text: rowsToCsv(reportRows(report)),
    mimeType: 'text/csv',
  }
}
