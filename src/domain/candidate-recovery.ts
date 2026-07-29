import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { HistoricalPath } from './statistics'
import type {
  AssignmentRecoverySummary,
  PriceBar,
} from './types'

export type RecoveryEvidenceLevel =
  | 'none'
  | 'low'
  | 'limited'
  | 'sufficient'

export type RecoveryObservation = {
  recoveredAfterPeriods?: number
  recoveryCalendarDays?: number
  availableFollowUpPeriods: number
  availableFollowUpCalendarDays: number
}

export type CandidatePutRecoveryAnalysis = {
  method: string
  sampleSize: number
  effectiveSampleSize: number
  moneyness: number
  assignmentEvents: number
  effectiveAssignmentEvents: number
  historicalAssignmentRate: number
  historicalAssignmentLower95: number
  historicalAssignmentUpper95: number
  evidence: RecoveryEvidenceLevel
  strikeRecovery: AssignmentRecoverySummary
  breakEven?: {
    netPremiumPerShare: number
    premiumRate: number
    currentBreakEvenPrice: number
    recovery: AssignmentRecoverySummary
  }
}

type CandidatePutRecoveryInput = {
  bars: PriceBar[]
  paths: HistoricalPath[]
  anchorPrice: number
  strike: number
  effectiveSampleSize: number
  interval: 'daily' | 'weekly'
  netPremiumPerShare?: number
}

const Z_95 = 1.959963984540054

function boundedEffectiveSize(value: number, sampleSize: number) {
  return Math.min(sampleSize, Math.max(0, value))
}

function wilsonInterval(rate: number, sampleSize: number): [number, number] {
  if (!(sampleSize > 0)) return [0, 1]
  const boundedRate = Math.min(1, Math.max(0, rate))
  const denominator = 1 + Z_95 ** 2 / sampleSize
  const center = (
    boundedRate + Z_95 ** 2 / (2 * sampleSize)
  ) / denominator
  const spread = Z_95 * Math.sqrt(
    boundedRate * (1 - boundedRate) / sampleSize +
      Z_95 ** 2 / (4 * sampleSize ** 2),
  ) / denominator
  return [Math.max(0, center - spread), Math.min(1, center + spread)]
}

function kaplanMeierQuantile(
  observations: RecoveryObservation[],
  eventTime: (observation: RecoveryObservation) => number | undefined,
  censorTime: (observation: RecoveryObservation) => number,
  probability: number,
) {
  const rows = observations
    .map((observation) => {
      const recoveredAt = eventTime(observation)
      return recoveredAt === undefined
        ? { time: censorTime(observation), recovered: false }
        : { time: recoveredAt, recovered: true }
    })
    .filter((row) => Number.isFinite(row.time) && row.time >= 0)

  if (!rows.length) return undefined
  rows.sort((left, right) => left.time - right.time)
  let atRisk = rows.length
  let survival = 1
  let index = 0
  while (index < rows.length) {
    const time = rows[index].time
    let recovered = 0
    let censored = 0
    while (index < rows.length && rows[index].time === time) {
      if (rows[index].recovered) recovered += 1
      else censored += 1
      index += 1
    }
    if (recovered > 0 && atRisk > 0) {
      survival *= 1 - recovered / atRisk
      if (1 - survival + Number.EPSILON >= probability) return time
    }
    atRisk -= recovered + censored
  }
  return undefined
}

export function recoveryEvidenceLevel(
  assignmentEvents: number,
  effectiveAssignmentEvents: number,
): RecoveryEvidenceLevel {
  if (assignmentEvents === 0) return 'none'
  if (effectiveAssignmentEvents < 5) return 'low'
  if (effectiveAssignmentEvents < 20) return 'limited'
  return 'sufficient'
}

export function summarizeRecoveryObservations(
  observations: RecoveryObservation[],
  interval: 'daily' | 'weekly',
  effectiveAssignmentEvents = observations.length,
): AssignmentRecoverySummary {
  const boundedEffectiveAssignments = boundedEffectiveSize(
    effectiveAssignmentEvents,
    observations.length,
  )
  const recovered = observations.filter(
    (observation): observation is RecoveryObservation & {
      recoveredAfterPeriods: number
      recoveryCalendarDays: number
    } => observation.recoveredAfterPeriods !== undefined &&
      observation.recoveryCalendarDays !== undefined,
  )
  const windowPeriods = interval === 'daily' ? [5, 20, 60] : [1, 4, 12]
  const medianPeriods = kaplanMeierQuantile(
    observations,
    (observation) => observation.recoveredAfterPeriods,
    (observation) => observation.availableFollowUpPeriods,
    0.5,
  )
  const p75Periods = kaplanMeierQuantile(
    observations,
    (observation) => observation.recoveredAfterPeriods,
    (observation) => observation.availableFollowUpPeriods,
    0.75,
  )
  const medianCalendarDays = interval === 'daily'
    ? kaplanMeierQuantile(
        observations,
        (observation) => observation.recoveryCalendarDays,
        (observation) => observation.availableFollowUpCalendarDays,
        0.5,
      )
    : undefined
  const p75CalendarDays = interval === 'daily'
    ? kaplanMeierQuantile(
        observations,
        (observation) => observation.recoveryCalendarDays,
        (observation) => observation.availableFollowUpCalendarDays,
        0.75,
      )
    : undefined

  return {
    estimator: 'kaplan-meier',
    periodUnit: interval === 'daily' ? 'trading-session' : 'week',
    assignmentEvents: observations.length,
    effectiveAssignmentEvents: boundedEffectiveAssignments,
    recoveredEvents: recovered.length,
    unrecoveredEvents: observations.length - recovered.length,
    ...(medianPeriods === undefined ? {} : { medianPeriods }),
    ...(p75Periods === undefined ? {} : { p75Periods }),
    ...(recovered.length
      ? {
          maximumPeriods: Math.max(...recovered.map((item) => item.recoveredAfterPeriods)),
          maximumCalendarDays: Math.max(...recovered.map((item) => item.recoveryCalendarDays)),
        }
      : {}),
    ...(medianCalendarDays === undefined ? {} : { medianCalendarDays }),
    ...(p75CalendarDays === undefined ? {} : { p75CalendarDays }),
    windows: windowPeriods.map((window) => {
      const eligible = observations.filter((observation) =>
        (observation.recoveredAfterPeriods !== undefined &&
          observation.recoveredAfterPeriods <= window) ||
        observation.availableFollowUpPeriods >= window,
      )
      const recoveredWithinWindow = eligible.filter(
        (observation) => observation.recoveredAfterPeriods !== undefined &&
          observation.recoveredAfterPeriods <= window,
      ).length
      const recoveryRate = eligible.length
        ? recoveredWithinWindow / eligible.length
        : 0
      const effectiveEligibleAssignments = observations.length
        ? boundedEffectiveAssignments * eligible.length / observations.length
        : 0
      const [lower95, upper95] = wilsonInterval(
        recoveryRate,
        effectiveEligibleAssignments,
      )
      return {
        periods: window,
        eligibleAssignments: eligible.length,
        effectiveEligibleAssignments,
        recoveredAssignments: recoveredWithinWindow,
        recoveryRate,
        ...(eligible.length ? { lower95, upper95 } : {}),
      }
    }),
  }
}

function elapsedPeriods(
  interval: 'daily' | 'weekly',
  targetIndex: number,
  recoveryIndex: number,
  calendarDays: number,
) {
  return interval === 'daily'
    ? recoveryIndex - targetIndex
    : Math.max(1, Math.round(calendarDays / 7))
}

function availablePeriods(
  interval: 'daily' | 'weekly',
  targetIndex: number,
  bars: PriceBar[],
  availableCalendarDays: number,
) {
  return interval === 'daily'
    ? Math.max(0, bars.length - targetIndex - 1)
    : Math.max(0, Math.floor(availableCalendarDays / 7))
}

export function observePriceRecovery(
  bars: PriceBar[],
  path: HistoricalPath,
  targetPrice: number,
  interval: 'daily' | 'weekly',
): RecoveryObservation | undefined {
  if (path.targetIndex === undefined || !path.targetDate) return undefined
  const expiration = bars[path.targetIndex]
  const last = bars.at(-1)
  if (!expiration || !last) return undefined
  const availableFollowUpCalendarDays = Math.max(
    0,
    differenceInCalendarDays(parseISO(last.date), parseISO(path.targetDate)),
  )
  const followUpPeriods = availablePeriods(
    interval,
    path.targetIndex,
    bars,
    availableFollowUpCalendarDays,
  )
  if (expiration.close >= targetPrice) {
    return {
      recoveredAfterPeriods: 0,
      recoveryCalendarDays: 0,
      availableFollowUpPeriods: followUpPeriods,
      availableFollowUpCalendarDays,
    }
  }
  for (let index = path.targetIndex + 1; index < bars.length; index += 1) {
    if (bars[index].close < targetPrice) continue
    const recoveryCalendarDays = differenceInCalendarDays(
      parseISO(bars[index].date),
      parseISO(path.targetDate),
    )
    return {
      recoveredAfterPeriods: elapsedPeriods(
        interval,
        path.targetIndex,
        index,
        recoveryCalendarDays,
      ),
      recoveryCalendarDays,
      availableFollowUpPeriods: followUpPeriods,
      availableFollowUpCalendarDays,
    }
  }
  return {
    availableFollowUpPeriods: followUpPeriods,
    availableFollowUpCalendarDays,
  }
}

export function calculateCandidatePutRecovery({
  bars,
  paths,
  anchorPrice,
  strike,
  effectiveSampleSize,
  interval,
  netPremiumPerShare,
}: CandidatePutRecoveryInput): CandidatePutRecoveryAnalysis | undefined {
  if (!(anchorPrice > 0) || !(strike > 0) || !bars.length || !paths.length) {
    return undefined
  }
  const usablePaths = paths.filter((path) =>
    path.basePrice !== undefined && path.basePrice > 0 &&
    path.targetIndex !== undefined && path.targetIndex >= 0 &&
    path.targetIndex < bars.length && Boolean(path.targetDate),
  )
  if (!usablePaths.length) return undefined

  const moneyness = strike / anchorPrice
  const assignments = usablePaths.flatMap((path) => {
    const historicalStrike = path.basePrice! * moneyness
    const expirationClose = bars[path.targetIndex!].close
    return expirationClose < historicalStrike
      ? [{ path, historicalStrike }]
      : []
  })
  const boundedEffectiveSample = boundedEffectiveSize(
    effectiveSampleSize,
    usablePaths.length,
  )
  const historicalAssignmentRate = assignments.length / usablePaths.length
  const effectiveAssignmentEvents = boundedEffectiveSample * historicalAssignmentRate
  const [historicalAssignmentLower95, historicalAssignmentUpper95] = wilsonInterval(
    historicalAssignmentRate,
    boundedEffectiveSample,
  )
  const strikeObservations = assignments.flatMap(({ path, historicalStrike }) => {
    const observation = observePriceRecovery(bars, path, historicalStrike, interval)
    return observation ? [observation] : []
  })
  const strikeRecovery = summarizeRecoveryObservations(
    strikeObservations,
    interval,
    effectiveAssignmentEvents,
  )
  const validPremiumValue = netPremiumPerShare !== undefined &&
    Number.isFinite(netPremiumPerShare) &&
    netPremiumPerShare >= 0 &&
    netPremiumPerShare < strike
      ? netPremiumPerShare
      : undefined
  const premiumRate = validPremiumValue === undefined
    ? undefined
    : validPremiumValue / strike
  const breakEvenObservations = premiumRate === undefined
    ? undefined
    : assignments.flatMap(({ path, historicalStrike }) => {
        const observation = observePriceRecovery(
          bars,
          path,
          historicalStrike * (1 - premiumRate),
          interval,
        )
        return observation ? [observation] : []
      })
  const breakEven = premiumRate !== undefined &&
    validPremiumValue !== undefined &&
    breakEvenObservations !== undefined
      ? {
          netPremiumPerShare: validPremiumValue,
          premiumRate,
          currentBreakEvenPrice: strike - validPremiumValue,
          recovery: summarizeRecoveryObservations(
            breakEvenObservations,
            interval,
            effectiveAssignmentEvents,
          ),
        }
      : undefined

  return {
    method: 'Same-session full-history moneyness replay with close-based Kaplan-Meier recovery',
    sampleSize: usablePaths.length,
    effectiveSampleSize: boundedEffectiveSample,
    moneyness,
    assignmentEvents: assignments.length,
    effectiveAssignmentEvents,
    historicalAssignmentRate,
    historicalAssignmentLower95,
    historicalAssignmentUpper95,
    evidence: recoveryEvidenceLevel(assignments.length, effectiveAssignmentEvents),
    strikeRecovery,
    ...(breakEven ? { breakEven } : {}),
  }
}
