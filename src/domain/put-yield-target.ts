import { differenceInCalendarDays, parseISO } from 'date-fns'

export type PutYieldTargetInput = {
  strike: number
  targetAnnualizedRatePct: number
  daysToExpiry: number
  transactionCostPerShare?: number
}

export type PutYieldTargetResult = {
  targetAnnualizedRatePct: number
  requiredPremiumPerShare: number
  requiredPremiumPerContract: number
  breakEvenPrice: number
}

export type PutYieldTargetScenario = {
  strike: number
  referencePrice: number
  referenceDate: string
  expirationDate: string
  daysToExpiry: number
  transactionCostPerShare: number
  targets: PutYieldTargetResult[]
}

/**
 * Calculates the minimum gross premium needed to reach a simple annualized
 * return on cash secured by the Put strike.
 */
export function calculateRequiredPutPremium({
  strike,
  targetAnnualizedRatePct,
  daysToExpiry,
  transactionCostPerShare = 0,
}: PutYieldTargetInput): number {
  if (
    !Number.isFinite(strike) ||
    strike <= 0 ||
    !Number.isFinite(targetAnnualizedRatePct) ||
    targetAnnualizedRatePct < 0 ||
    !Number.isFinite(daysToExpiry) ||
    daysToExpiry <= 0 ||
    !Number.isFinite(transactionCostPerShare) ||
    transactionCostPerShare < 0
  ) {
    return 0
  }

  return strike * (targetAnnualizedRatePct / 100) * (daysToExpiry / 365) + transactionCostPerShare
}

/**
 * Calculates simple annualized return for a received Put premium.
 */
export function calculatePutSimpleAnnualizedRatePct({
  strike,
  premiumPerShare,
  daysToExpiry,
  transactionCostPerShare = 0,
}: {
  strike: number
  premiumPerShare: number
  daysToExpiry: number
  transactionCostPerShare?: number
}): number {
  if (
    !Number.isFinite(strike) ||
    strike <= 0 ||
    !Number.isFinite(premiumPerShare) ||
    premiumPerShare < 0 ||
    !Number.isFinite(daysToExpiry) ||
    daysToExpiry <= 0 ||
    !Number.isFinite(transactionCostPerShare) ||
    transactionCostPerShare < 0
  ) {
    return 0
  }

  return ((premiumPerShare - transactionCostPerShare) / strike) * (365 / daysToExpiry) * 100
}

export function calculatePutYieldTargets({
  strike,
  targetAnnualizedRatesPct,
  daysToExpiry,
  transactionCostPerShare = 0,
}: {
  strike: number
  targetAnnualizedRatesPct: number[]
  daysToExpiry: number
  transactionCostPerShare?: number
}): PutYieldTargetResult[] {
  return [...new Set(targetAnnualizedRatesPct)]
    .filter((rate) => Number.isFinite(rate) && rate >= 0)
    .sort((left, right) => left - right)
    .map((targetAnnualizedRatePct) => {
      const requiredPremiumPerShare = calculateRequiredPutPremium({
        strike,
        targetAnnualizedRatePct,
        daysToExpiry,
        transactionCostPerShare,
      })

      return {
        targetAnnualizedRatePct,
        requiredPremiumPerShare,
        requiredPremiumPerContract: requiredPremiumPerShare * 100,
        breakEvenPrice: strike - requiredPremiumPerShare,
      }
    })
}

export function calculatePutYieldScenario({
  strike,
  referencePrice,
  referenceDate,
  expirationDate,
  targetAnnualizedRatesPct,
  transactionCostPerShare = 0,
}: {
  strike: number
  referencePrice: number
  referenceDate: string
  expirationDate: string
  targetAnnualizedRatesPct: number[]
  transactionCostPerShare?: number
}): PutYieldTargetScenario | undefined {
  if (
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)
  ) {
    return undefined
  }

  const daysToExpiry = differenceInCalendarDays(parseISO(expirationDate), parseISO(referenceDate))
  if (daysToExpiry <= 0) return undefined

  const targets = calculatePutYieldTargets({
    strike,
    targetAnnualizedRatesPct,
    daysToExpiry,
    transactionCostPerShare,
  })
  if (!targets.length) return undefined

  return {
    strike,
    referencePrice,
    referenceDate,
    expirationDate,
    daysToExpiry,
    transactionCostPerShare,
    targets,
  }
}
