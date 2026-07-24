import { differenceInCalendarDays, parseISO } from 'date-fns'
import { quantile, type HistoricalPath } from './statistics'

export const DEFAULT_PREMIUM_ASSUMPTIONS = {
  transactionCostPerShare: 0.03,
  annualCapitalReturnRate: 0.10,
  lightTailWeight: 0.10,
  conservativeTailWeight: 0.25,
} as const

export const MIN_EFFECTIVE_PREMIUM_LOSS_EVENTS = 20

export type PremiumAssumptions = {
  transactionCostPerShare: number
  annualCapitalReturnRate: number
  lightTailWeight: number
  conservativeTailWeight: number
}

export type PutPremiumAnalysis = {
  strike: number
  sampleSize: number
  effectiveSampleSize: number
  lossEventCount: number
  effectiveLossEventCount: number
  daysToExpiry: number
  expectedLossPerShare: number
  conditionalLossPerShare: number
  expectedLossInterval95: [number, number]
  cvar95PerShare: number
  maximumHistoricalLossPerShare: number
  transactionCostPerShare: number
  capitalHurdlePerShare: number
  lightTailChargePerShare: number
  conservativeTailChargePerShare: number
  annualCapitalReturnRate: number
  lightTailWeight: number
  conservativeTailWeight: number
  statisticalFloorPerShare: number
  capitalReturnFloorPerShare: number
  lightTailFloorPerShare: number
  conservativeTailFloorPerShare: number
}

type PutPremiumAnalysisInput = {
  anchorPrice: number
  strike: number
  anchorDate: string
  targetDate: string
  paths: HistoricalPath[]
  effectiveSampleSize?: number
  assumptions?: PremiumAssumptions
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function bootstrapMeanInterval(
  values: number[],
  seed: number,
  iterations = 2_000,
): [number, number] {
  let state = seed >>> 0
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
  const blockLength = Math.max(2, Math.round(Math.sqrt(values.length)))
  const estimates: number[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0
    let sampled = 0
    while (sampled < values.length) {
      const start = Math.floor(random() * values.length)
      for (
        let offset = 0;
        offset < blockLength && sampled < values.length;
        offset += 1
      ) {
        total += values[(start + offset) % values.length]
        sampled += 1
      }
    }
    estimates.push(total / values.length)
  }
  const observedMean = mean(values)
  return [
    Math.min(observedMean, quantile(estimates, 0.025)),
    Math.max(observedMean, quantile(estimates, 0.975)),
  ]
}

function validAssumptions(assumptions: PremiumAssumptions) {
  return Object.values(assumptions).every(
    (value) => Number.isFinite(value) && value >= 0,
  )
}

export function calculatePutPremiumAnalysis({
  anchorPrice,
  strike,
  anchorDate,
  targetDate,
  paths,
  effectiveSampleSize,
  assumptions = DEFAULT_PREMIUM_ASSUMPTIONS,
}: PutPremiumAnalysisInput): PutPremiumAnalysis | undefined {
  if (
    !Number.isFinite(anchorPrice) ||
    anchorPrice <= 0 ||
    !Number.isFinite(strike) ||
    strike <= 0 ||
    !paths.length ||
    (effectiveSampleSize !== undefined &&
      (!Number.isFinite(effectiveSampleSize) || effectiveSampleSize <= 0)) ||
    !validAssumptions(assumptions)
  ) {
    return undefined
  }

  const losses = paths.map((path) =>
    Math.max(strike - anchorPrice * (1 + path.closeReturn), 0),
  )
  const lossEvents = losses.filter((loss) => loss > 0)
  const boundedEffectiveSampleSize = Math.min(
    paths.length,
    effectiveSampleSize ?? paths.length,
  )
  const effectiveLossEventCount =
    boundedEffectiveSampleSize * lossEvents.length / losses.length
  const expectedLossPerShare = mean(losses)
  const conditionalLossPerShare = lossEvents.length ? mean(lossEvents) : 0
  const expectedLossInterval95 = bootstrapMeanInterval(
    losses,
    Math.max(1, Math.round(strike)) * 7_919 + losses.length,
  )
  const orderedLosses = [...losses].sort((left, right) => right - left)
  const tailCount = Math.max(1, Math.ceil(orderedLosses.length * 0.05))
  const cvar95PerShare = mean(orderedLosses.slice(0, tailCount))
  const maximumHistoricalLossPerShare = orderedLosses[0]
  const daysToExpiry = Math.max(
    0,
    differenceInCalendarDays(parseISO(targetDate), parseISO(anchorDate)),
  )
  const capitalHurdlePerShare =
    strike * assumptions.annualCapitalReturnRate * daysToExpiry / 365
  const tailExcess = Math.max(0, cvar95PerShare - expectedLossPerShare)
  const lightTailChargePerShare = assumptions.lightTailWeight * tailExcess
  const conservativeTailChargePerShare =
    assumptions.conservativeTailWeight * tailExcess
  const statisticalFloorPerShare =
    expectedLossInterval95[1] + assumptions.transactionCostPerShare
  const capitalReturnFloorPerShare =
    statisticalFloorPerShare + capitalHurdlePerShare

  return {
    strike,
    sampleSize: losses.length,
    effectiveSampleSize: boundedEffectiveSampleSize,
    lossEventCount: lossEvents.length,
    effectiveLossEventCount,
    daysToExpiry,
    expectedLossPerShare,
    conditionalLossPerShare,
    expectedLossInterval95,
    cvar95PerShare,
    maximumHistoricalLossPerShare,
    transactionCostPerShare: assumptions.transactionCostPerShare,
    capitalHurdlePerShare,
    lightTailChargePerShare,
    conservativeTailChargePerShare,
    annualCapitalReturnRate: assumptions.annualCapitalReturnRate,
    lightTailWeight: assumptions.lightTailWeight,
    conservativeTailWeight: assumptions.conservativeTailWeight,
    statisticalFloorPerShare,
    capitalReturnFloorPerShare,
    lightTailFloorPerShare:
      capitalReturnFloorPerShare + lightTailChargePerShare,
    conservativeTailFloorPerShare:
      capitalReturnFloorPerShare + conservativeTailChargePerShare,
  }
}

export function hasSufficientPremiumEvidence(analysis: PutPremiumAnalysis) {
  return analysis.effectiveLossEventCount >= MIN_EFFECTIVE_PREMIUM_LOSS_EVENTS
}

export function repricePutPremiumAnalysis(
  analysis: PutPremiumAnalysis,
  assumptions: PremiumAssumptions,
): PutPremiumAnalysis | undefined {
  if (!validAssumptions(assumptions)) return undefined
  const capitalHurdlePerShare =
    analysis.strike * assumptions.annualCapitalReturnRate * analysis.daysToExpiry / 365
  const tailExcess = Math.max(0, analysis.cvar95PerShare - analysis.expectedLossPerShare)
  const lightTailChargePerShare = assumptions.lightTailWeight * tailExcess
  const conservativeTailChargePerShare = assumptions.conservativeTailWeight * tailExcess
  const statisticalFloorPerShare =
    analysis.expectedLossInterval95[1] + assumptions.transactionCostPerShare
  const capitalReturnFloorPerShare =
    statisticalFloorPerShare + capitalHurdlePerShare

  return {
    ...analysis,
    transactionCostPerShare: assumptions.transactionCostPerShare,
    capitalHurdlePerShare,
    lightTailChargePerShare,
    conservativeTailChargePerShare,
    annualCapitalReturnRate: assumptions.annualCapitalReturnRate,
    lightTailWeight: assumptions.lightTailWeight,
    conservativeTailWeight: assumptions.conservativeTailWeight,
    statisticalFloorPerShare,
    capitalReturnFloorPerShare,
    lightTailFloorPerShare:
      capitalReturnFloorPerShare + lightTailChargePerShare,
    conservativeTailFloorPerShare:
      capitalReturnFloorPerShare + conservativeTailChargePerShare,
  }
}


