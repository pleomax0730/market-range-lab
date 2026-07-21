import { describe, expect, it } from 'vitest'
import { importHistoryCsv } from './import-history'

const base = {
  symbol: 'SOXL',
  filename: 'soxl.csv',
  sourceUrl: 'https://www.investing.com/etfs/direxion-dly-semiconductor-bull-3x-historical-data',
  importedAt: '2026-07-21T00:00:00.000Z',
  splitAdjustedConfirmed: true,
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

  it('warns on a suspected split jump', async () => {
    const csv = `Date,Price,Open,High,Low\n07/16/2026,100,100,102,98\n07/17/2026,20,20,21,19`
    const result = await importHistoryCsv(csv, base)
    expect(result.warnings.some((warning) => warning.code === 'SUSPECTED_SPLIT')).toBe(true)
  })

  it('excludes Investing.com non-session corporate-action markers', async () => {
    const csv = `Date,Price,Open,High,Low,Vol.,Change %\n07/02/2020,12.47,12.53,12.80,12.33,24.29M,3.74%\n07/04/2020,187.05,187.05,187.05,187.05,,1400%\n07/06/2020,12.70,12.60,12.90,12.40,20M,1.84%`
    const result = await importHistoryCsv(csv, base)
    expect(result.dataset?.bars).toHaveLength(2)
    expect(result.warnings.some((warning) => warning.code === 'CORPORATE_ACTION_MARKERS')).toBe(true)
  })

  it('requires an explicit split-adjusted basis confirmation', async () => {
    const csv = `Date,Price,Open,High,Low\n07/17/2026,135,130,137,128`
    const result = await importHistoryCsv(csv, { ...base, splitAdjustedConfirmed: false })
    expect(result.errors[0].code).toBe('SPLIT_CONFIRMATION_REQUIRED')
  })
})
