export const MODEL_VERSION = '1.2.0'

export const GRADE_THRESHOLDS = {
  conservative: { expirationUpper95: 0.005, pathTouchUpper95: 0.01 },
  safe: { expirationUpper95: 0.02, pathTouchUpper95: 0.05 },
} as const
