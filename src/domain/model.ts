import type { RiskThresholds } from './types'

export const MODEL_VERSION = '1.6.0'

export const CONFIDENCE_LEVEL = 0.95
export const ONE_SIDED_Z95 = 1.6448536269514722

export const GRADE_THRESHOLDS = {
  conservative: { expirationUpper95: 0.005, pathTouchUpper95: 0.01 },
  safe: { expirationUpper95: 0.02, pathTouchUpper95: 0.05 },
} as const

export const DEFAULT_AGGRESSIVE_THRESHOLDS: RiskThresholds = {
  expirationUpper95: 0.05,
  pathTouchUpper95: 0.10,
}

export const DEFAULT_AGGRESSIVE_THRESHOLD_PCT = {
  expiration: '5',
  pathTouch: '10',
} as const

export function resolveAggressiveThresholds(
  expirationPct?: string,
  pathTouchPct?: string,
) {
  const resolvedExpirationPct = expirationPct ?? DEFAULT_AGGRESSIVE_THRESHOLD_PCT.expiration
  const resolvedPathTouchPct = pathTouchPct ?? DEFAULT_AGGRESSIVE_THRESHOLD_PCT.pathTouch
  const expiration = Number(resolvedExpirationPct)
  const pathTouch = Number(resolvedPathTouchPct)
  const valid =
    resolvedExpirationPct.trim() !== '' &&
    resolvedPathTouchPct.trim() !== '' &&
    Number.isFinite(expiration) &&
    Number.isFinite(pathTouch) &&
    expiration >= GRADE_THRESHOLDS.safe.expirationUpper95 * 100 &&
    expiration <= 100 &&
    pathTouch >= GRADE_THRESHOLDS.safe.pathTouchUpper95 * 100 &&
    pathTouch <= 100 &&
    pathTouch >= expiration
  return {
    valid,
    thresholds: valid
      ? { expirationUpper95: expiration / 100, pathTouchUpper95: pathTouch / 100 }
      : DEFAULT_AGGRESSIVE_THRESHOLDS,
  }
}
