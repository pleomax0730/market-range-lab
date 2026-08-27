import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { fetchRegularSessionQuote, fetchYahooQuote } from './quote.mjs'

const nasdaqPayload = {
  status: { rCode: 200 },
  data: {
    symbol: 'SOXL',
    exchange: 'PSE',
    marketStatus: 'Open',
    assetClass: 'ETF',
    primaryData: {
      lastSalePrice: '$141.77',
      lastTradeTimestamp: 'Jul 24, 2026 10:27 AM ET',
      isRealTime: true,
    },
  },
}

describe('fetchRegularSessionQuote', () => {
  it('uses the current Nasdaq ETF quote instead of a delayed Yahoo chart quote', async () => {
    const fetchMock = async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('assetclass=etf')) return { ok: true, json: async () => nasdaqPayload }
      if (url.includes('assetclass=stocks')) return { ok: true, json: async () => ({ status: { rCode: 400 }, data: null }) }
      throw new Error(`Unexpected request: ${url}`)
    }

    const quote = await fetchRegularSessionQuote('soxl', fetchMock as typeof fetch)

    expect(quote).toMatchObject({
      symbol: 'SOXL',
      price: 141.77,
      quoteTime: '2026-07-24T14:27:00.000Z',
      marketOpen: true,
      source: 'Nasdaq Real-Time',
    })
  })

  it('falls back to Yahoo when Nasdaq has no usable quote', async () => {
    const fetchMock = async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('api.nasdaq.com')) return { ok: true, json: async () => ({ status: { rCode: 400 }, data: null }) }
      return {
        ok: true,
        json: async () => ({ chart: { result: [{ meta: { instrumentType: 'EQUITY', currency: 'USD', regularMarketPrice: 135, regularMarketTime: 1_700_000_000, exchangeTimezoneName: 'America/New_York' }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }),
      }
    }

    const quote = await fetchRegularSessionQuote('SOXL', fetchMock as typeof fetch)

    expect(quote.source).toBe('Yahoo Finance (fallback)')
  })
})

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

describe('quote API Vite middleware', () => {
  it('returns JSON instead of the SPA shell', async () => {
    const yahooPayload = {
      chart: {
        result: [{
          meta: {
            instrumentType: 'EQUITY',
            currency: 'USD',
            regularMarketPrice: 341.91,
            regularMarketTime: 1_700_000_000,
            exchangeTimezoneName: 'America/New_York',
          },
          timestamp: [],
          indicators: { quote: [{ close: [] }] },
        }],
      },
    }
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => yahooPayload,
    })) as typeof fetch
    const vite = await createServer({
      configFile: resolve(process.cwd(), 'vite.config.ts'),
      server: { host: '127.0.0.1', port: 0 },
      clearScreen: false,
    })

    try {
      await vite.listen()
      const address = vite.httpServer?.address()
      if (!address || typeof address === 'string') throw new Error('Vite server did not expose a TCP address.')
      const response = await realFetch(`http://127.0.0.1:${address.port}/api/quote?symbol=GOOG`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      await expect(response.json()).resolves.toMatchObject({ symbol: 'GOOG', price: 341.91 })
    } finally {
      globalThis.fetch = realFetch
      await vite.close()
    }
  })
})
