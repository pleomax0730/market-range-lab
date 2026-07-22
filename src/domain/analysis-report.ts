import { analyzeHistory, extractMatchedPaths, type AnalysisInput } from './analyze'
import { assignmentOverlay } from './assignment'
import { applyGradePause } from './export-analysis'
import { GRADE_THRESHOLDS, MODEL_VERSION } from './model'
import {
  calculatePutPremiumAnalysis,
  classifyPremiumOffer,
  repricePutPremiumAnalysis,
  type PremiumOfferStatus,
  type PremiumAssumptions,
  type PutPremiumAnalysis,
} from './premium-analysis'
import { evaluateCandidate } from './statistics'
import type {
  DatasetMetadata,
  HistoryDataset,
  HorizonAnalysis,
  RiskSide,
} from './types'
import { rowsToCsv } from '../lib/export'

export type CandidateRequest = {
  weeks: number
  price: number
  side: 'lower' | 'upper'
}

export type StatisticalReportInput = {
  analysis: AnalysisInput
  candidate?: CandidateRequest
  gradePaused: boolean
}

export type CandidateAnalysis = CandidateRequest & {
  sampleSize: number
  result: RiskSide
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
  account: {
    cash: number
    multiple: number
    existingObligation: number
  }
  selectedWeeks: number
  marketPremiumPerShare?: number
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
  selectedWeeks: number
  account: {
    cash: number
    assignmentBudgetMultiple: number
    existingAssignmentObligation: number
    overlay: ReturnType<typeof assignmentOverlay>
  }
  candidate?: CandidateAnalysis
  marketPremiumPerShare?: number
  premiumOfferStatus?: PremiumOfferStatus
  analyses: HorizonAnalysis[]
}

function pauseCandidate(result: RiskSide, weeks: number, paused: boolean): RiskSide {
  return paused && weeks <= 4 ? { ...result, grade: 'insufficient' } : result
}

export function calculateStatisticalReport(
  input: StatisticalReportInput,
  precomputedAnalyses?: HorizonAnalysis[],
): StatisticalAnalysisReport {
  const rawAnalyses = precomputedAnalyses ?? analyzeHistory(input.analysis)
  const candidateAnalysis = input.candidate
    ? rawAnalyses.find((analysis) => analysis.weeks === input.candidate!.weeks)
    : undefined
  let candidate: CandidateAnalysis | undefined
  if (input.candidate && candidateAnalysis) {
    const paths = extractMatchedPaths(
      input.analysis.bars,
      input.analysis.anchorDate,
      input.candidate.weeks,
      input.analysis.intraday,
      input.analysis.interval,
    )
    const result = evaluateCandidate(
      input.analysis.anchorPrice,
      input.candidate.price,
      input.candidate.side,
      paths,
      candidateAnalysis.effectiveSampleSize,
      input.candidate.weeks,
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
    candidate = {
      ...input.candidate,
      sampleSize: paths.length,
      result: pauseCandidate(result, input.candidate.weeks, input.gradePaused),
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
  const selected = statistical.analyses.find(
    (analysis) => analysis.weeks === context.selectedWeeks,
  )
  const adjustedPremium = statistical.candidate?.premium
    ? repricePutPremiumAnalysis(
        statistical.candidate.premium,
        context.premiumAssumptions,
      )
    : undefined
  const candidate = statistical.candidate
    ? { ...statistical.candidate, premium: adjustedPremium }
    : undefined
  const putPrice = candidate?.side === 'lower'
    ? candidate.result.price
    : (selected?.lower[1]?.price ?? 0)
  const overlay = assignmentOverlay(
    context.account.cash,
    context.account.multiple,
    context.account.existingObligation,
    putPrice,
  )
  const marketPremiumPerShare = context.marketPremiumPerShare !== undefined &&
    Number.isFinite(context.marketPremiumPerShare) &&
    context.marketPremiumPerShare >= 0
      ? context.marketPremiumPerShare
      : undefined
  const premiumOfferStatus = marketPremiumPerShare !== undefined && candidate?.premium
    ? classifyPremiumOffer(marketPremiumPerShare, candidate.premium)
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
    selectedWeeks: context.selectedWeeks,
    account: {
      cash: context.account.cash,
      assignmentBudgetMultiple: context.account.multiple,
      existingAssignmentObligation: context.account.existingObligation,
      overlay,
    },
    candidate,
    marketPremiumPerShare,
    premiumOfferStatus,
    analyses: statistical.analyses,
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
        selectedWeeks: report.selectedWeeks,
        cash: report.account.cash,
        assignmentBudgetMultiple: report.account.assignmentBudgetMultiple,
        existingAssignmentObligation: report.account.existingAssignmentObligation,
        assignmentBudget: report.account.overlay.budget,
        availableAssignmentBudget: report.account.overlay.available,
        assignmentContractCost: report.account.overlay.contractCost,
        assignmentOverlayValid: String(report.account.overlay.valid),
        assignmentOverlayErrors: report.account.overlay.errors.join('|'),
        weeks: analysis.weeks,
        targetDate: analysis.targetDate,
        side,
        grade: risk.grade,
        price: risk.price,
        returnPct: risk.returnPct,
        expirationEstimate: risk.expirationBreach,
        expirationLower95: risk.expirationLower95,
        expirationUpper95: risk.expirationUpper95,
        touchEstimate: risk.pathTouch,
        touchLower95: risk.pathTouchLower95,
        touchUpper95: risk.pathTouchUpper95,
        sampleSize: analysis.sampleSize,
        effectiveSampleSize: analysis.effectiveSampleSize,
        pathMinPct: analysis.empirical.pathMinPct,
        pathMaxPct: analysis.empirical.pathMaxPct,
        evtStressPct: side === 'lower'
          ? (analysis.evt.lowerStressPct ?? '')
          : (analysis.evt.upperStressPct ?? ''),
        evtDiagnostics: side === 'lower'
          ? analysis.evt.lowerDiagnostics
          : analysis.evt.upperDiagnostics,
        candidateSide: report.candidate?.side ?? '',
        candidateWeeks: report.candidate?.weeks ?? '',
        candidateSampleSize: report.candidate?.sampleSize ?? '',
        candidatePrice: report.candidate?.result.price ?? '',
        candidateGrade: report.candidate?.result.grade ?? '',
        candidateReturnPct: report.candidate?.result.returnPct ?? '',
        candidateExpirationEstimate: report.candidate?.result.expirationBreach ?? '',
        candidateExpirationLower95: report.candidate?.result.expirationLower95 ?? '',
        candidateExpirationUpper95: report.candidate?.result.expirationUpper95 ?? '',
        candidateTouchEstimate: report.candidate?.result.pathTouch ?? '',
        candidateTouchLower95: report.candidate?.result.pathTouchLower95 ?? '',
        candidateTouchUpper95: report.candidate?.result.pathTouchUpper95 ?? '',
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
        candidateMarketPremiumPerShare: report.marketPremiumPerShare ?? '',
        candidatePremiumOfferStatus: report.premiumOfferStatus ?? '',
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
