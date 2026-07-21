import { describe, expect, it } from 'vitest'
import { importHistoryCsv } from './import-history'

const base = {
  symbol: 'SOXL',
  filename: 'soxl.csv',
  sourceUrl: 'https://www.investing.com/etfs/direxion-dly-semiconductor-bull-3x-historical-data',
  importedAt: '2026-07-21T00:00:00.000Z',
  splitAdjustedConfirmed: true,
  discontinuitiesConfirmed: false,
  interval: 'daily' as const,
}

describe('importHistoryCsv', () => {
  it('maps Investing.com columns, suffix volumes, and sorts ascending', async () => {
    const csv = `Date,Price,Open,High,Low,Vol.,Change %\n07/17/2026,135.00,130.00,137.00,128.00,12.5M,3.00%\n07/16/2026,131.07,132.00,134.00,129.00,900K,-1.00%`
    const result = await importHistoryCsv(csv, base)
    expect(result.errors).toEqual([])
    expect(result.dataset?.bars.map((bar) => bar.date)).toEqual(['2026-07-16', '2026-07-17'])
    expect(result.dataset?.bars[1].close).toBe(135)
    expect(result.dataset?.bars[1].volume).toBe(12_500_000)
    expect(result.dataset?.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects duplicate dates and invalid OHLC invariants', async () => {
    const csv = `Date,Price,Open,High,Low\n07/17/2026,135,130,129,128\n07/17/2026,134,132,136,130`
    const result = await importHistoryCsv(csv, base)
    expect(result.dataset).toBeUndefined()
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['INVALID_OHLC', 'DUPLICATE_DATE']),
    )
  })

  it('blocks a suspected split jump until that discontinuity is explicitly confirmed', async () => {
    const csv = `Date,Price,Open,High,Low\n07/16/2026,100,100,102,98\n07/17/2026,20,20,21,19`
    const result = await importHistoryCsv(csv, base)
    expect(result.warnings.some((warning) => warning.code === 'SUSPECTED_SPLIT')).toBe(true)
    expect(result.errors.some((error) => error.code === 'SUSPECTED_SPLIT_CONFIRMATION_REQUIRED')).toBe(true)
    expect(result.dataset).toBeUndefined()
    const confirmed = await importHistoryCsv(csv, { ...base, discontinuitiesConfirmed: true })
    expect(confirmed.dataset?.bars).toHaveLength(2)
  })

  it('excludes Investing.com non-session corporate-action markers', async () => {
    const csv = `Date,Price,Open,High,Low,Vol.,Change %\n07/02/2020,12.47,12.53,12.80,12.33,24.29M,3.74%\n07/04/2020,187.05,187.05,187.05,187.05,,1400%\n07/06/2020,12.70,12.60,12.90,12.40,20M,1.84%`
    const result = await importHistoryCsv(csv, base)
    expect(result.dataset?.bars).toHaveLength(2)
    expect(result.warnings.some((warning) => warning.code === 'CORPORATE_ACTION_MARKERS')).toBe(true)
  })

  it('excludes a volume-bearing weekend corporate-action marker with an extreme reported change', async () => {
    const csv = `Date,Price,Open,High,Low,Vol.,Change %
02/26/2016,1.81,1.86,1.86,1.80,248.58M,0.00%
02/27/2016,86.98,86.96,86.98,86.96,5.07M,"4,701.66%"
02/29/2016,1.76,1.81,1.85,1.76,229.97M,-97.97%`
    const result = await importHistoryCsv(csv, base)
    expect(result.errors).toEqual([])
    expect(result.dataset?.bars.map((bar) => bar.date)).toEqual(['2016-02-26', '2016-02-29'])
    expect(result.warnings.some((warning) => warning.code === 'CORPORATE_ACTION_MARKERS')).toBe(true)
  })

  it('excludes a holiday row that duplicates a regular session open, close, and volume', async () => {
    const csv = `Date,Price,Open,High,Low,Vol.,Change %
12/24/2025,55.36,54.87,55.45,54.78,25.86M,0.64%
12/25/2025,55.36,54.87,55.36,55.36,25.86M,0.00%
12/26/2025,55.31,55.52,55.74,55.11,37.24M,-0.09%`
    const result = await importHistoryCsv(csv, base)
    expect(result.errors).toEqual([])
    expect(result.dataset?.bars.map((bar) => bar.date)).toEqual(['2025-12-24', '2025-12-26'])
    expect(result.warnings.some((warning) => warning.code === 'CORPORATE_ACTION_MARKERS')).toBe(true)
  })

  it('aggregates repeated reported-change discrepancies into one quality warning', async () => {
    const csv = `Date,Price,Open,High,Low,Change %
07/15/2026,100,99,101,98,50%
07/16/2026,101,100,102,99,50%
07/17/2026,102,101,103,100,50%`
    const result = await importHistoryCsv(csv, base)
    const discrepancies = result.warnings.filter((warning) => warning.code === 'CHANGE_DISCREPANCY')
    expect(discrepancies).toHaveLength(1)
    expect(discrepancies[0].message).toContain('2 sessions')
    expect(discrepancies[0].message).toContain('2026-07-16 to 2026-07-17')
  })

  it('requires an explicit split-adjusted basis confirmation', async () => {
    const csv = `Date,Price,Open,High,Low\n07/17/2026,135,130,137,128`
    const result = await importHistoryCsv(csv, { ...base, splitAdjustedConfirmed: false })
    expect(result.errors[0].code).toBe('SPLIT_CONFIRMATION_REQUIRED')
  })

  it('rejects a header-only daily file', async () => {
    const result = await importHistoryCsv('Date,Price,Open,High,Low', base)
    expect(result.errors[0].code).toBe('NO_DATA')
    expect(result.dataset).toBeUndefined()
  })

  it('rejects a non-session row that is not a corporate-action marker', async () => {
    const csv = `Date,Price,Open,High,Low,Vol.\n07/04/2026,100,99,101,98,1M`
    const result = await importHistoryCsv(csv, base)
    expect(result.errors.some((error) => error.code === 'NON_SESSION_ROW')).toBe(true)
  })
})
