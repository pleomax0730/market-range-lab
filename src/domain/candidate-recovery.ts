import { differenceInCalendarDays, isValid, parseISO } from 'date-fns'
import {
  previousOrSameRegularSession,
  regularSessionsAfter,
} from './market-calendar'
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

export type RecoveryFrontierSettings = {
  target: 'strike' | 'break-even'
  deadlineIndex: number
  minimumRecoveryRate: number
  minimumLower95: number
  minimumEffectiveAssignments: number
  minimumMoneyness: number
  maximumMoneyness: number
  stepMoneyness: number
}

export const DEFAULT_RECOVERY_FRONTIER_SETTINGS: RecoveryFrontierSettings = {
  target: 'strike',
  deadlineIndex: 2,
  minimumRecoveryRate: 0.75,
  minimumLower95: 0.6,
  minimumEffectiveAssignments: 20,
  minimumMoneyness: 0.7,
  maximumMoneyness: 1,
  stepMoneyness: 0.005,
}

export type RecoveryFrontierPoint = {
  price: number
  targetPrice: number
  moneyness: number
  assignmentEvents: number
  effectiveAssignmentEvents: number
  historicalAssignmentRate: number
  evidence: RecoveryEvidenceLevel
  recovery: AssignmentRecoverySummary['windows'][number]
  qualifies: boolean
}

export type RecoveryFrontierInterval = {
  minimumPrice: number
  maximumPrice: number
  minimumMoneyness: number
  maximumMoneyness: number
  pointCount: number
}

export type RecoveryFrontierAnalysis = {
  method: string
  periodUnit: AssignmentRecoverySummary['periodUnit']
  deadlinePeriods: number
  settings: RecoveryFrontierSettings
  points: RecoveryFrontierPoint[]
  intervals: RecoveryFrontierInterval[]
}

type CandidatePutRecoveryInput = {
  bars: PriceBar[]
  paths: HistoricalPath[]
  anchorPrice: number
  strike: number
  effectiveSampleSize: number
  interval: 'daily' | 'weekly'
  netPremiumPerShare?: number
  recoveryWindowPeriods?: number
}

export type RecoveryWindowSelection = {
  requestedDate: string
  throughSessionDate: string
  periods: number
  periodUnit: 'trading-session' | 'week'
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

function recoveryWindowWithGreenwood(
  observations: RecoveryObservation[],
  periods: number,
  effectiveAssignmentEvents: number,
) {
  const rows = observations
    .map((observation) => ({
      time: observation.recoveredAfterPeriods ?? observation.availableFollowUpPeriods,
      recovered: observation.recoveredAfterPeriods !== undefined,
    }))
    .filter((row) => Number.isFinite(row.time) && row.time >= 0)
    .sort((left, right) => left.time - right.time)
  const effectiveAssignments = boundedEffectiveSize(
    effectiveAssignmentEvents,
    observations.length,
  )
  const scale = observations.length ? effectiveAssignments / observations.length : 0
  let atRisk = rows.length
  let survival = 1
  let greenwood = 0
  let index = 0
  while (index < rows.length && rows[index].time <= periods) {
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
      const effectiveAtRisk = atRisk * scale
      const effectiveRecovered = recovered * scale
      if (effectiveAtRisk > effectiveRecovered && effectiveRecovered > 0) {
        greenwood += effectiveRecovered / (
          effectiveAtRisk * (effectiveAtRisk - effectiveRecovered)
        )
      }
    }
    atRisk -= recovered + censored
  }
  const recoveryRate = 1 - survival
  const eligible = observations.filter((observation) =>
    (observation.recoveredAfterPeriods !== undefined &&
      observation.recoveredAfterPeriods <= periods) ||
    observation.availableFollowUpPeriods >= periods,
  )
  const recoveredAssignments = observations.filter(
    (observation) => observation.recoveredAfterPeriods !== undefined &&
      observation.recoveredAfterPeriods <= periods,
  ).length
  const effectiveEligibleAssignments = observations.length
    ? effectiveAssignments * eligible.length / observations.length
    : 0
  let lower95: number
  let upper95: number
  if (survival > 0 && survival < 1 && greenwood > 0) {
    const logSurvival = Math.log(survival)
    const standardError = Math.sqrt(greenwood) / Math.abs(logSurvival)
    const logNegativeLog = Math.log(-logSurvival)
    const survivalLower = Math.exp(-Math.exp(logNegativeLog + Z_95 * standardError))
    const survivalUpper = Math.exp(-Math.exp(logNegativeLog - Z_95 * standardError))
    lower95 = Math.max(0, 1 - survivalUpper)
    upper95 = Math.min(1, 1 - survivalLower)
  } else {
    ;[lower95, upper95] = wilsonInterval(
      recoveryRate,
      effectiveEligibleAssignments,
    )
  }
  return {
    periods,
    eligibleAssignments: eligible.length,
    effectiveEligibleAssignments,
    recoveredAssignments,
    recoveryRate,
    lower95,
    upper95,
  }
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
  customWindowPeriods?: number,
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

  const windowResult = (window: number) => {
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
  }
  const validCustomWindow = Number.isInteger(customWindowPeriods) &&
    customWindowPeriods !== undefined && customWindowPeriods > 0
      ? customWindowPeriods
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
    windows: windowPeriods.map(windowResult),
    ...(validCustomWindow === undefined
      ? {}
      : { customWindow: windowResult(validCustomWindow) }),
  }
}

export function resolveRecoveryWindowSelection(
  expiryDate: string,
  requestedDate: string,
  interval: 'daily' | 'weekly',
): RecoveryWindowSelection | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return undefined
  const parsedExpiry = parseISO(expiryDate)
  const parsedRequested = parseISO(requestedDate)
  if (!isValid(parsedExpiry) || !isValid(parsedRequested)) return undefined
  const throughSessionDate = previousOrSameRegularSession(requestedDate)
  if (throughSessionDate <= expiryDate) return undefined
  const periods = interval === 'daily'
    ? regularSessionsAfter(expiryDate, throughSessionDate)
    : Math.max(
        1,
        Math.round(differenceInCalendarDays(
          parseISO(throughSessionDate),
          parsedExpiry,
        ) / 7),
      )
  if (periods === undefined || periods <= 0) return undefined
  return {
    requestedDate,
    throughSessionDate,
    periods,
    periodUnit: interval === 'daily' ? 'trading-session' : 'week',
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
  recoveryWindowPeriods,
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
    recoveryWindowPeriods,
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
            recoveryWindowPeriods,
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

function frontierIntervals(points: RecoveryFrontierPoint[]): RecoveryFrontierInterval[] {
  const intervals: RecoveryFrontierInterval[] = []
  let start = -1
  for (let index = 0; index <= points.length; index += 1) {
    if (index < points.length && points[index].qualifies) {
      if (start === -1) start = index
      continue
    }
    if (start === -1) continue
    const first = points[start]
    const last = points[index - 1]
    intervals.push({
      minimumPrice: first.price,
      maximumPrice: last.price,
      minimumMoneyness: first.moneyness,
      maximumMoneyness: last.moneyness,
      pointCount: index - start,
    })
    start = -1
  }
  return intervals
}

export function calculateRecoveryFrontier({
  bars,
  paths,
  anchorPrice,
  effectiveSampleSize,
  interval,
  settings,
  netPremiumPerShare,
  premiumReferenceStrike,
}: {
  bars: PriceBar[]
  paths: HistoricalPath[]
  anchorPrice: number
  effectiveSampleSize: number
  interval: 'daily' | 'weekly'
  settings: RecoveryFrontierSettings
  netPremiumPerShare?: number
  premiumReferenceStrike?: number
}): RecoveryFrontierAnalysis {
  const deadlineOptions = interval === 'daily' ? [7, 14, 21, 30] : [1, 2, 3, 4]
  const deadlineIndex = Math.min(
    deadlineOptions.length - 1,
    Math.max(0, Math.round(settings.deadlineIndex)),
  )
  const normalizedSettings: RecoveryFrontierSettings = {
    target: settings.target,
    deadlineIndex,
    minimumRecoveryRate: Math.min(1, Math.max(0, settings.minimumRecoveryRate)),
    minimumLower95: Math.min(1, Math.max(0, settings.minimumLower95)),
    minimumEffectiveAssignments: Math.max(0, settings.minimumEffectiveAssignments),
    minimumMoneyness: Math.min(1, Math.max(0.1, settings.minimumMoneyness)),
    maximumMoneyness: Math.min(1, Math.max(0.1, settings.maximumMoneyness)),
    stepMoneyness: Math.min(0.1, Math.max(0.001, settings.stepMoneyness)),
  }
  if (normalizedSettings.minimumMoneyness > normalizedSettings.maximumMoneyness) {
    ;[
      normalizedSettings.minimumMoneyness,
      normalizedSettings.maximumMoneyness,
    ] = [
      normalizedSettings.maximumMoneyness,
      normalizedSettings.minimumMoneyness,
    ]
  }
  const usablePaths = paths.filter((path) =>
    path.basePrice !== undefined && path.basePrice > 0 &&
    path.targetIndex !== undefined && path.targetIndex >= 0 &&
    path.targetIndex < bars.length && Boolean(path.targetDate),
  )
  const boundedEffectiveSample = boundedEffectiveSize(
    effectiveSampleSize,
    usablePaths.length,
  )
  const premiumRate = normalizedSettings.target === 'break-even' &&
    netPremiumPerShare !== undefined &&
    premiumReferenceStrike !== undefined &&
    premiumReferenceStrike > 0 &&
    netPremiumPerShare >= 0 &&
    netPremiumPerShare < premiumReferenceStrike
      ? netPremiumPerShare / premiumReferenceStrike
      : 0
  const targetMultiplier = normalizedSettings.target === 'break-even'
    ? 1 - premiumRate
    : 1
  const steps = Math.min(
    300,
    Math.floor(
      (normalizedSettings.maximumMoneyness - normalizedSettings.minimumMoneyness) /
      normalizedSettings.stepMoneyness + 1e-9,
    ),
  )
  const deadlinePeriods = deadlineOptions[deadlineIndex]
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const moneyness = Number((
      normalizedSettings.minimumMoneyness + index * normalizedSettings.stepMoneyness
    ).toFixed(6))
    const price = Number((anchorPrice * moneyness).toFixed(2))
    const assignments = usablePaths.flatMap((path) => {
      const historicalStrike = path.basePrice! * moneyness
      return bars[path.targetIndex!].close < historicalStrike
        ? [{ path, historicalStrike }]
        : []
    })
    const historicalAssignmentRate = usablePaths.length
      ? assignments.length / usablePaths.length
      : 0
    const effectiveAssignmentEvents = boundedEffectiveSample * historicalAssignmentRate
    const observations = assignments.flatMap(({ path, historicalStrike }) => {
      const observation = observePriceRecovery(
        bars,
        path,
        historicalStrike * targetMultiplier,
        interval,
      )
      return observation ? [observation] : []
    })
    const recovery = recoveryWindowWithGreenwood(
      observations,
      deadlinePeriods,
      effectiveAssignmentEvents,
    )
    return {
      price,
      targetPrice: Number((price * targetMultiplier).toFixed(2)),
      moneyness,
      assignmentEvents: assignments.length,
      effectiveAssignmentEvents,
      historicalAssignmentRate,
      evidence: recoveryEvidenceLevel(
        assignments.length,
        effectiveAssignmentEvents,
      ),
      recovery,
      qualifies: effectiveAssignmentEvents >= normalizedSettings.minimumEffectiveAssignments &&
        recovery.recoveryRate >= normalizedSettings.minimumRecoveryRate &&
        (recovery.lower95 ?? 0) >= normalizedSettings.minimumLower95,
    } satisfies RecoveryFrontierPoint
  })

  return {
    method: 'Full-history moneyness frontier with close-based Kaplan-Meier recovery and Greenwood confidence intervals',
    periodUnit: interval === 'daily' ? 'trading-session' : 'week',
    deadlinePeriods,
    settings: normalizedSettings,
    points,
    intervals: frontierIntervals(points),
  }
}
