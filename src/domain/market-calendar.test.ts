import { describe, expect, it } from 'vitest'
import { previousOrSameRegularSession, targetWeekClose } from './market-calendar'

describe('targetWeekClose', () => {
  it('uses Thursday when Good Friday closes the market', () => {
    expect(targetWeekClose('2026-03-30', 1)).toBe('2026-04-02')
  })

  it('uses the following Friday for the second target week', () => {
    expect(targetWeekClose('2026-03-30', 2)).toBe('2026-04-10')
  })

  it('rolls a closed Friday horizon to the following week', () => {
    expect(targetWeekClose('2026-07-17', 1, true)).toBe('2026-07-24')
  })

  it('normalizes a weekend manual reference date to the prior session', () => {
    expect(previousOrSameRegularSession('2026-07-19')).toBe('2026-07-17')
  })

})
