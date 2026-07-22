import { describe, expect, it } from 'vitest'
import type { HistoryDataset } from './types'
import {
  calculateStatisticalReport,
  composeAnalysisReport,
  serializeAnalysisReport,
} from './analysis-report'

function weeklyDataset(): HistoryDataset {
  const start = Date.parse('2023-01-01T00:00:00Z')
  const bars = Array.from({ length: 180 }, (_, index) => {
    const close = 100 + (index % 9) - 4
    return {
      date: new Date(start + index * 7 * 86_400_000).toISOString().slice(0, 10),
      open: close - 1,
      high: close + 6,
      low: close - 7,
      close,
    }
  })
  return {
    id: 'TQQQ-weekly',
    symbol: 'TQQQ',
    filename: 'TQQQ weekly.csv',
    sourceUrl: 'https://example.com/history',
    importedAt: '2026-07-21T00:00:00.000Z',
    sha256: 'weekly-hash',
    splitAdjustedConfirmed: true,
    discontinuitiesConfirmed: true,
    interval: 'weekly',
    bars,
  }
}

describe('Analysis Report', () => {
  it('uses the same grade-paused candidate and horizon results for view and JSON export', () => {
    const dataset = weeklyDataset()
    const statistical = calculateStatisticalReport({
      analysis: {
        bars: dataset.bars,
        anchorPrice: 100,
        anchorDate: '2026-07-20',
        intraday: false,
        interval: 'weekly',
      },
      candidate: { weeks: 1, price: 80, side: 'lower' },
      gradePaused: true,
    })
    const report = composeAnalysisReport(statistical, {
      dataset,
      reference: {
        price: 100,
        anchorDate: '2026-07-20',
        intraday: false,
        mode: 'automatic',
        paused: false,
      },
      pauseReasons: ['stale-history'],
      account: { cash: 60_000, multiple: 1.2, existingObligation: 0 },
      selectedWeeks: 1,
    })
    const exported = JSON.parse(serializeAnalysisReport(report, 'json').text)
    const exportedCsv = serializeAnalysisReport(report, 'csv').text

    expect(report.candidate?.result.grade).toBe('insufficient')
    expect(exported.candidate.result.grade).toBe(report.candidate?.result.grade)
    expect(exported.analyses[0].lower).toEqual(report.analyses[0].lower)
    expect(exported.pauseReasons).toEqual(['stale-history'])
    expect(exported.dataset.bars).toBeUndefined()
    expect(exportedCsv).toContain('"candidateGrade"')
    expect(exportedCsv).toContain('"insufficient"')
    expect(report.dataset.interval).toBe('weekly')
  })
})
