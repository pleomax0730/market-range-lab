import { describe, expect, it } from 'vitest'
import { fetchYahooQuote } from './quote.mjs'

describe('fetchYahooQuote', () => {
  it('normalizes a regular-session equity quote', async () => {
    const fetchMock = async () => ({
      ok: true,
      json: async () => ({ chart: { result: [{ meta: { instrumentType: 'ETF', currency: 'USD', regularMarketPrice: 135, regularMarketTime: 1_700_000_000, exchangeTimezoneName: 'America/New_York' }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }),
    })
    const quote = await fetchYahooQuote('soxl', fetchMock as typeof fetch)
    expect(quote.symbol).toBe('SOXL')
    expect(quote.price).toBe(135)
    expect(quote.source).toBe('Yahoo Finance')
  })
})
