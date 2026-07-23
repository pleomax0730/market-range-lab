export const MODEL_VERSION = '1.3.0'

export const CONFIDENCE_LEVEL = 0.95
export const ONE_SIDED_Z95 = 1.6448536269514722

export const GRADE_THRESHOLDS = {
  conservative: { expirationUpper95: 0.005, pathTouchUpper95: 0.01 },
  safe: { expirationUpper95: 0.02, pathTouchUpper95: 0.05 },
} as const
