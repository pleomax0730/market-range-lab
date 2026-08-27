import { describe, expect, it } from 'vitest'
import {
  calculateCandidatePutRecovery,
  resolveRecoveryWindowSelection,
  summarizeRecoveryObservations,
} from './candidate-recovery'
import type { HistoricalPath } from './statistics'
import type { PriceBar } from './types'

function bar(date: string, close: number): PriceBar {
  return { date, open: close, high: close, low: close, close }
}

describe('candidate Put recovery', () => {
  it('maps the strike by moneyness and treats an expiration exactly at strike as unassigned', () => {
    const bars = [
      bar('2026-01-02', 79),
      bar('2026-01-05', 80),
      bar('2026-01-09', 40),
      bar('2026-01-12', 41),
    ]
    const paths: HistoricalPath[] = [
      {
        closeReturn: -0.21,
        lowReturn: -0.22,
        highReturn: 0,
        basePrice: 100,
        targetIndex: 0,
        targetDate: '2026-01-02',
      },
      {
        closeReturn: -0.2,
        lowReturn: -0.21,
        highReturn: 0,
        basePrice: 50,
        targetIndex: 2,
        targetDate: '2026-01-09',
      },
    ]

    const result = calculateCandidatePutRecovery({
      bars,
      paths,
      anchorPrice: 200,
      strike: 160,
      effectiveSampleSize: 2,
      interval: 'daily',
    })

    expect(result?.moneyness).toBe(0.8)
    expect(result?.assignmentEvents).toBe(1)
    expect(result?.historicalAssignmentRate).toBe(0.5)
    expect(result?.strikeRecovery.medianPeriods).toBe(1)
  })

  it('uses Kaplan-Meier so censored assignments are not discarded from recovery time', () => {
    const summary = summarizeRecoveryObservations(
      [
        {
          recoveredAfterPeriods: 2,
          recoveryCalendarDays: 4,
          availableFollowUpPeriods: 2,
          availableFollowUpCalendarDays: 4,
        },
        {
          availableFollowUpPeriods: 3,
          availableFollowUpCalendarDays: 5,
        },
        {
          recoveredAfterPeriods: 4,
          recoveryCalendarDays: 6,
          availableFollowUpPeriods: 4,
          availableFollowUpCalendarDays: 6,
        },
      ],
      'daily',
      3,
    )

    expect(summary.estimator).toBe('kaplan-meier')
    expect(summary.medianPeriods).toBe(4)
    expect(summary.p75Periods).toBe(4)
    expect(summary.medianCalendarDays).toBe(6)
    expect(summary.maximumPeriods).toBe(4)
  })

  it('leaves the Kaplan-Meier median undefined when observed recovery never reaches 50%', () => {
    const summary = summarizeRecoveryObservations(
      [
        {
          recoveredAfterPeriods: 2,
          recoveryCalendarDays: 4,
          availableFollowUpPeriods: 2,
          availableFollowUpCalendarDays: 4,
        },
        {
          availableFollowUpPeriods: 3,
          availableFollowUpCalendarDays: 5,
        },
        {
          availableFollowUpPeriods: 5,
          availableFollowUpCalendarDays: 8,
        },
      ],
      'daily',
      3,
    )

    expect(summary.medianPeriods).toBeUndefined()
    expect(summary.p75Periods).toBeUndefined()
  })

  it('scales premium with historical strike and counts expiration break-even as zero days', () => {
    const bars = [
      bar('2026-01-02', 38),
      bar('2026-01-05', 39),
      bar('2026-01-09', 35),
      bar('2026-01-12', 36),
    ]
    const paths: HistoricalPath[] = [0, 2].map((targetIndex) => ({
      closeReturn: bars[targetIndex].close / 50 - 1,
      lowReturn: bars[targetIndex].close / 50 - 1,
      highReturn: 0,
      basePrice: 50,
      targetIndex,
      targetDate: bars[targetIndex].date,
    }))

    const result = calculateCandidatePutRecovery({
      bars,
      paths,
      anchorPrice: 100,
      strike: 80,
      netPremiumPerShare: 8,
      recoveryWindowPeriods: 1,
      effectiveSampleSize: 2,
      interval: 'daily',
    })

    expect(result?.breakEven?.premiumRate).toBe(0.1)
    expect(result?.breakEven?.currentBreakEvenPrice).toBe(72)
    expect(result?.breakEven?.recovery.recoveredEvents).toBe(2)
    expect(result?.breakEven?.recovery.medianPeriods).toBe(0)
    expect(result?.breakEven?.recovery.customWindow?.recoveryRate).toBe(1)
    expect(result?.strikeRecovery.recoveredEvents).toBe(0)
    expect(result?.strikeRecovery.customWindow?.recoveryRate).toBe(0)
  })

  it('uses 1, 4 and 12 week windows for weekly-only history', () => {
    const summary = summarizeRecoveryObservations([], 'weekly', 0)
    expect(summary.windows.map((window) => window.periods)).toEqual([1, 4, 12])
  })

  it('calculates a custom recovery window without treating censored cases as failures', () => {
    const summary = summarizeRecoveryObservations(
      [
        {
          recoveredAfterPeriods: 3,
          recoveryCalendarDays: 5,
          availableFollowUpPeriods: 3,
          availableFollowUpCalendarDays: 5,
        },
        {
          availableFollowUpPeriods: 10,
          availableFollowUpCalendarDays: 14,
        },
        {
          recoveredAfterPeriods: 8,
          recoveryCalendarDays: 12,
          availableFollowUpPeriods: 8,
          availableFollowUpCalendarDays: 12,
        },
        {
          availableFollowUpPeriods: 2,
          availableFollowUpCalendarDays: 4,
        },
      ],
      'daily',
      4,
      5,
    )

    expect(summary.customWindow).toMatchObject({
      periods: 5,
      eligibleAssignments: 3,
      recoveredAssignments: 1,
      recoveryRate: 1 / 3,
    })
  })

  it('maps a weekend observation date to the prior regular-session close', () => {
    expect(resolveRecoveryWindowSelection(
      '2026-08-21',
      '2026-08-30',
      'daily',
    )).toEqual({
      requestedDate: '2026-08-30',
      throughSessionDate: '2026-08-28',
      periods: 5,
      periodUnit: 'trading-session',
    })
  })
})
