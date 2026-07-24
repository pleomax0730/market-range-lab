import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HISTORY_SOURCE_URL,
  defaultHistoryImportOptions,
  formatHistoryImportMessages,
  prepareHistoryImport,
  resolveImportSymbol,
} from './history-intake'
import type { HistoryDataset, ImportResult } from './types'

function fileStub(name: string, text: string) {
  return {
    name,
    text: async () => text,
  }
}

describe('prepareHistoryImport', () => {
  it('returns ready for a clear ticker filename', async () => {
    const prepared = await prepareHistoryImport(
      fileStub('SOXL ETF History Daily.csv', 'Date,Price\n'),
      'daily',
    )
    expect(prepared).toEqual({
      status: 'ready',
      filename: 'SOXL ETF History Daily.csv',
      csv: 'Date,Price\n',
      interval: 'daily',
      symbol: 'SOXL',
    })
  })

  it('asks for confirmation on company-name aliases', async () => {
    const prepared = await prepareHistoryImport(
      fileStub('PALANTIR History.csv', 'csv'),
      'daily',
    )
    expect(prepared.status).toBe('needs-confirmation')
    if (prepared.status !== 'needs-confirmation') return
    expect(prepared.pending.symbol).toBe('PLTR')
    expect(prepared.pending.detectedSymbol).toBe('PALANTIR')
  })

  it('errors when no symbol token exists', async () => {
    const prepared = await prepareHistoryImport(
      fileStub('ETF Stock Price History Daily.csv', 'csv'),
      'weekly',
    )
    expect(prepared.status).toBe('error')
    if (prepared.status !== 'error') return
    expect(prepared.messages[0]).toContain('無法從檔名辨識')
  })
})

describe('defaultHistoryImportOptions', () => {
  it('fills Investing provenance and OHLC attestations', () => {
    const options = defaultHistoryImportOptions({
      symbol: 'soxl',
      filename: 'soxl.csv',
      interval: 'daily',
      importedAt: '2026-07-21T00:00:00.000Z',
    })
    expect(options).toEqual({
      symbol: 'SOXL',
      filename: 'soxl.csv',
      sourceUrl: DEFAULT_HISTORY_SOURCE_URL,
      importedAt: '2026-07-21T00:00:00.000Z',
      splitAdjustedConfirmed: true,
      discontinuitiesConfirmed: true,
      interval: 'daily',
    })
  })
})

describe('formatHistoryImportMessages', () => {
  const weekly: HistoryDataset = {
    id: 'TQQQ-weekly',
    symbol: 'TQQQ',
    filename: 'w.csv',
    sourceUrl: DEFAULT_HISTORY_SOURCE_URL,
    importedAt: '2026-07-21T00:00:00.000Z',
    sha256: 'w',
    splitAdjustedConfirmed: true,
    discontinuitiesConfirmed: true,
    interval: 'weekly',
    bars: [{ date: '2026-07-17', open: 100, high: 110, low: 90, close: 105 }],
  }
  const daily: HistoryDataset = {
    ...weekly,
    id: 'TQQQ-daily',
    interval: 'daily',
    sha256: 'd',
    bars: [{ date: '2026-07-17', open: 100, high: 110, low: 90, close: 105 }],
  }

  it('labels weekly-only activation', () => {
    const result: ImportResult = { dataset: weekly, errors: [], warnings: [] }
    expect(formatHistoryImportMessages(result, 'weekly', [weekly])[0]).toContain(
      'Weekly-only',
    )
  })

  it('reports weekly reconciliation against matching daily', () => {
    const result: ImportResult = { dataset: weekly, errors: [], warnings: [] }
    const messages = formatHistoryImportMessages(result, 'weekly', [daily, weekly])
    expect(messages[0]).toContain('Weekly 對帳')
    expect(messages[0]).toContain('Daily 維持 Active')
  })
})

describe('resolveImportSymbol', () => {
  it('accepts Yahoo tickers only', () => {
    expect(resolveImportSymbol(' pltr ')).toEqual({ ok: true, symbol: 'PLTR' })
    expect(resolveImportSymbol('PALANTIR TECHNOLOGIES').ok).toBe(false)
  })
})
