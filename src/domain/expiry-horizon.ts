import { regularSessionsAfter, targetWeekClose } from './market-calendar'

export type ExpiryHorizon = {
  targetDate: string
  tradingSessions: number
  weeks: number
}

export function resolveExpiryHorizon(
  anchorDate: string,
  targetDate: string,
): ExpiryHorizon | undefined {
  const tradingSessions = regularSessionsAfter(anchorDate, targetDate)
  if (tradingSessions === undefined) return undefined
  return {
    targetDate,
    tradingSessions,
    weeks: Math.max(1, Math.ceil(tradingSessions / 5)),
  }
}

export function defaultExpiryHorizons(
  anchorDate: string,
  intraday: boolean,
  count = 8,
): ExpiryHorizon[] {
  const rollPastCurrentWeek = !intraday && targetWeekClose(anchorDate, 1) <= anchorDate
  return Array.from({ length: count }, (_, index) => {
    const targetDate = targetWeekClose(anchorDate, index + 1, rollPastCurrentWeek)
    const horizon = resolveExpiryHorizon(anchorDate, targetDate)
    if (!horizon) throw new Error(`Unable to resolve expiry ${targetDate}.`)
    return horizon
  })
}

export function isWeeklyExpirySupported(
  anchorDate: string,
  targetDate: string,
  intraday: boolean,
) {
  const horizon = resolveExpiryHorizon(anchorDate, targetDate)
  if (!horizon) return false
  const rollPastCurrentWeek = !intraday && targetWeekClose(anchorDate, 1) <= anchorDate
  return targetWeekClose(anchorDate, horizon.weeks, rollPastCurrentWeek) === targetDate
}
