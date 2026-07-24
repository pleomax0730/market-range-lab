import { describe, expect, it } from 'vitest'
import {
  buildAnalysisSession,
  isHistoryStale,
  resolvePremiumAssumptions,
} from './analysis-session'
import type { HistoryDataset } from './types'

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
        horizon: 2,
        candidate: '90',
        candidateSide: 'lower',
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
      weeks: 2,
      price: 90,
      side: 'lower',
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
        horizon: 1,
        candidate: '',
        candidateSide: 'lower',
        annualCapitalReturnRatePct: '10',
      },
    )
    expect(plan.weeklyIntraday).toBe(true)
    expect(plan.gradePaused).toBe(true)
    expect(plan.pauseReasons).toContain('weekly-intraday-resolution')
    expect(plan.reportInput?.candidate).toBeUndefined()
  })
})

describe('premium knobs', () => {
  it('parses capital-return overrides', () => {
    expect(resolvePremiumAssumptions('20').annualCapitalReturnRate).toBe(0.2)
    expect(resolvePremiumAssumptions('').annualCapitalReturnRate).toBe(0.1)
  })
})
