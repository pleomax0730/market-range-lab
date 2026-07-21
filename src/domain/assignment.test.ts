import { describe, expect, it } from 'vitest'
import { assignmentOverlay } from './assignment'

describe('assignmentOverlay', () => {
  it('preserves a signed over-commitment for valid nonnegative inputs', () => {
    const result = assignmentOverlay(60_000, 1.2, 75_000, 71)
    expect(result.valid).toBe(true)
    expect(result.available).toBe(-3_000)
  })

  it('rejects negative and non-finite account inputs instead of turning them into capacity', () => {
    const result = assignmentOverlay(-60_000, -1.2, -75_000, Number.NaN)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(4)
    expect(result.available).toBe(0)
    expect(result.wholeContractsFeasible).toBe(0)
  })
})
