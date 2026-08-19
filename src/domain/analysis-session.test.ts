import { describe, expect, it } from 'vitest'
import {
  buildAnalysisSession,
  isHistoryStale,
  resolvePremiumAssumptions,
} from './analysis-session'
import type { HistoryDataset } from './types'
import { DEFAULT_RECOVERY_FRONTIER_SETTINGS } from './candidate-recovery'

function dataset(
  overrides: Partial<HistoryDataset> & Pick<HistoryDataset, 'interval' | 'bars'>,
): HistoryDataset {
  return {
    id: 'SOXL-test',
    symbol: 'SOXL',
    filename: 'soxl.csv',
    sourceUrl: 'https://example.com/history',
    importedAt: '2026-07-21T00:00:00.000Z',
    sha256: 'abc',
    splitAdjustedConfirmed: true,
    discontinuitiesConfirmed: true,
    ...overrides,
  }
}

describe('isHistoryStale', () => {
  it('flags daily history before the prior regular session', () => {
    const daily = dataset({
      interval: 'daily',
      bars: [{ date: '2026-07-20', open: 1, high: 1, low: 1, close: 1 }],
    })
    expect(isHistoryStale(daily, '2026-07-22')).toBe(true)
    expect(isHistoryStale(daily, '2026-07-21')).toBe(false)
  })

  it('flags weekly history more than two weeks behind the anchor', () => {
    const weekly = dataset({
      interval: 'weekly',
      bars: [{ date: '2026-06-30', open: 1, high: 1, low: 1, close: 1 }],
    })
    expect(isHistoryStale(weekly, '2026-07-21')).toBe(true)
    expect(isHistoryStale({
      ...weekly,
      bars: [{ date: '2026-07-14', open: 1, high: 1, low: 1, close: 1 }],
    }, '2026-07-21')).toBe(false)
  })
})

describe('buildAnalysisSession', () => {
  it('pauses grades for stale quote, stale history, and weekly intraday', () => {
    const active = dataset({
      interval: 'daily',
      bars: [{ date: '2026-07-17', open: 100, high: 105, low: 95, close: 102 }],
    })
    const plan = buildAnalysisSession(
      active,
      {
        price: 104,
        anchorDate: '2026-07-22',
        intraday: false,
        mode: 'automatic',
        paused: false,
        stale: true,
      },
      {
        expiryDate: '2026-07-24',
        candidate: '90',
        candidateSide: 'lower',
        netPremiumPerShare: '1.25',
        recoveryFrontierSettings: {
          ...DEFAULT_RECOVERY_FRONTIER_SETTINGS,
          target: 'break-even',
          deadlineIndex: 3,
        },
        annualCapitalReturnRatePct: '12',
      },
    )
    expect(plan.historyStale).toBe(true)
    expect(plan.gradePaused).toBe(true)
    expect(plan.pauseReasons).toEqual(
      expect.arrayContaining(['stale-history', 'stale-or-missing-quote']),
    )
    expect(plan.reportInput?.gradePaused).toBe(true)
    expect(plan.reportInput?.candidate).toEqual({
      targetDate: '2026-07-24',
      price: 90,
      side: 'lower',
      netPremiumPerShare: 1.25,
      recoveryFrontierSettings: {
        ...DEFAULT_RECOVERY_FRONTIER_SETTINGS,
        target: 'break-even',
        deadlineIndex: 3,
      },
    })
    expect(plan.context?.premiumAssumptions.annualCapitalReturnRate).toBe(0.12)
    expect(plan.modelKey).toContain(active.id)
    expect(plan.analysisKey).toContain('price=104')
  })

  it('marks weekly open-session previews as ungraded', () => {
    const active = dataset({
      interval: 'weekly',
      bars: [{ date: '2026-07-18', open: 1, high: 1, low: 1, close: 1 }],
    })
    const plan = buildAnalysisSession(
      active,
      {
        price: 10,
        anchorDate: '2026-07-21',
        intraday: true,
        mode: 'automatic',
        paused: false,
        stale: false,
      },
      {
        expiryDate: '2026-07-24',
        candidate: '',
        candidateSide: 'lower',
        netPremiumPerShare: '',
        annualCapitalReturnRatePct: '10',
      },
    )
    expect(plan.weeklyIntraday).toBe(true)
    expect(plan.gradePaused).toBe(true)
    expect(plan.pauseReasons).toContain('weekly-intraday-resolution')
    expect(plan.reportInput?.candidate).toBeUndefined()
  })

  it('requires daily history for a weekly-data midweek expiry', () => {
    const active = dataset({
      interval: 'weekly',
      bars: [{ date: '2026-08-14', open: 100, high: 105, low: 95, close: 102 }],
    })
    const plan = buildAnalysisSession(
      active,
      {
        price: 104,
        anchorDate: '2026-08-17',
        intraday: false,
        mode: 'automatic',
        paused: false,
        stale: false,
      },
      {
        expiryDate: '2026-08-19',
        candidate: '',
        candidateSide: 'lower',
        annualCapitalReturnRatePct: '10',
      },
    )

    expect(plan.expiryUnsupported).toBe(true)
    expect(plan.pauseReasons).toContain('weekly-expiry-resolution')
    expect(plan.reportInput).toBeUndefined()
  })

  it('keeps a short-dated daily intraday result as an ungraded preview', () => {
    const active = dataset({
      interval: 'daily',
      bars: [{ date: '2026-08-14', open: 100, high: 105, low: 95, close: 102 }],
    })
    const plan = buildAnalysisSession(
      active,
      {
        price: 104,
        anchorDate: '2026-08-17',
        intraday: true,
        mode: 'automatic',
        paused: false,
        stale: false,
      },
      {
        expiryDate: '2026-08-19',
        candidate: '90',
        candidateSide: 'lower',
        annualCapitalReturnRatePct: '10',
      },
    )

    expect(plan.shortDatedIntraday).toBe(true)
    expect(plan.gradePaused).toBe(true)
    expect(plan.pauseReasons).toContain('short-dated-intraday-resolution')
    expect(plan.reportInput?.analysis.targetDates).toEqual(['2026-08-19'])
  })
})

describe('premium knobs', () => {
  it('parses capital-return overrides', () => {
    expect(resolvePremiumAssumptions('20').annualCapitalReturnRate).toBe(0.2)
    expect(resolvePremiumAssumptions('').annualCapitalReturnRate).toBe(0.1)
  })
})
