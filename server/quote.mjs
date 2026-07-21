const cache = new Map()

export async function fetchYahooQuote(symbol, fetchImpl = fetch) {
  const normalized = symbol.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized)) throw new Error('Invalid US-listed symbol.')
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}?interval=1m&range=1d&includePrePost=false`
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 market-range-dashboard' } })
  if (!response.ok) throw new Error(`Yahoo quote request failed (${response.status}).`)
  const payload = await response.json()
  const result = payload?.chart?.result?.[0]
  const meta = result?.meta
  if (!meta || !['EQUITY', 'ETF'].includes(meta.instrumentType) || meta.currency !== 'USD' || meta.exchangeTimezoneName !== 'America/New_York') throw new Error('Only US-listed stocks and ETFs are supported.')
  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  let lastIndex = closes.length - 1
  while (lastIndex >= 0 && closes[lastIndex] == null) lastIndex -= 1
  const price = Number(meta.regularMarketPrice ?? closes[lastIndex])
  const quoteTime = Number(meta.regularMarketTime ?? timestamps[lastIndex])
  if (!Number.isFinite(price) || !Number.isFinite(quoteTime)) throw new Error('Yahoo returned no regular-session quote.')
  const now = Math.floor(Date.now() / 1000)
  const regular = meta.currentTradingPeriod?.regular
  const marketOpen = Boolean(regular && now >= regular.start && now <= regular.end)
  return {
    symbol: normalized,
    price,
    quoteTime: new Date(quoteTime * 1000).toISOString(),
    exchangeTimezone: meta.exchangeTimezoneName ?? 'America/New_York',
    exchange: meta.exchangeName ?? meta.fullExchangeName ?? 'US',
    marketOpen,
    stale: marketOpen && now - quoteTime > 120,
    source: 'Yahoo Finance',
  }
}

export async function handleQuoteRequest(req, res, next) {
  if (!req.url?.startsWith('/api/quote')) return next()
  try {
    const url = new URL(req.url, 'http://localhost')
    const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase()
    const cached = cache.get(symbol)
    if (cached && Date.now() - cached.cachedAt < 15_000) return res.end(JSON.stringify(cached.value))
    const value = await fetchYahooQuote(symbol)
    cache.set(symbol, { cachedAt: Date.now(), value })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    return res.end(JSON.stringify(value))
  } catch (error) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Quote unavailable.' }))
  }
}
