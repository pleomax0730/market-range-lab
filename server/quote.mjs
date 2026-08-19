const cache = new Map()
const NASDAQ_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36',
}

function normalizeSymbol(symbol) {
  const normalized = symbol.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized)) throw new Error('Invalid US-listed symbol.')
  return normalized
}

function parseEasternTimestamp(value) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM) ET$/.exec(value)
  if (!match) return Number.NaN
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, monthName, day, year, hourText, minute, meridiem] = match
  let hour = Number(hourText) % 12
  if (meridiem === 'PM') hour += 12
  const wallClock = Date.UTC(Number(year), months.indexOf(monthName), Number(day), hour, Number(minute))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(wallClock))
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]))
  const easternAtWallClock = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second))
  return wallClock - (easternAtWallClock - wallClock)
}

function normalizeNasdaqQuote(symbol, payload) {
  const data = payload?.data
  const primary = data?.primaryData
  if (payload?.status?.rCode !== 200 || data?.symbol !== symbol || !['STOCKS', 'ETF'].includes(data?.assetClass)) return null
  const price = Number(String(primary?.lastSalePrice ?? '').replace(/[$,]/g, ''))
  const quoteTimeMs = parseEasternTimestamp(primary?.lastTradeTimestamp ?? '')
  if (!primary?.isRealTime || !Number.isFinite(price) || !Number.isFinite(quoteTimeMs)) return null
  const marketOpen = data.marketStatus === 'Open'
  return {
    symbol,
    price,
    quoteTime: new Date(quoteTimeMs).toISOString(),
    exchangeTimezone: 'America/New_York',
    exchange: data.exchange ?? 'US',
    marketOpen,
    stale: marketOpen && Date.now() - quoteTimeMs > 120_000,
    source: 'Nasdaq Real-Time',
  }
}

async function fetchNasdaqQuote(symbol, fetchImpl) {
  const responses = await Promise.all(['stocks', 'etf'].map(async (assetClass) => {
    const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetClass}`
    const response = await fetchImpl(url, { headers: NASDAQ_HEADERS })
    if (!response.ok) return null
    return normalizeNasdaqQuote(symbol, await response.json())
  }))
  return responses.find(Boolean) ?? null
}

export async function fetchYahooQuote(symbol, fetchImpl = fetch) {
  const normalized = normalizeSymbol(symbol)
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

export async function fetchRegularSessionQuote(symbol, fetchImpl = fetch) {
  const normalized = normalizeSymbol(symbol)
  try {
    const quote = await fetchNasdaqQuote(normalized, fetchImpl)
    if (quote) return quote
  } catch {
    // Yahoo remains a usable delayed fallback when Nasdaq is temporarily unavailable.
  }
  const fallback = await fetchYahooQuote(normalized, fetchImpl)
  return { ...fallback, source: 'Yahoo Finance (fallback)' }
}

export async function handleQuoteRequest(req, res, next) {
  if (!req.url?.startsWith('/api/quote')) return next()
  try {
    const url = new URL(req.url, 'http://localhost')
    const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase()
    const cached = cache.get(symbol)
    if (cached && Date.now() - cached.cachedAt < 15_000) return res.end(JSON.stringify(cached.value))
    const value = await fetchRegularSessionQuote(symbol)
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
