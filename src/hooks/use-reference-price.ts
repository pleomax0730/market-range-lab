import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { previousOrSameRegularSession } from '../domain/market-calendar'

const ET_ZONE = 'America/New_York'

export type Quote = {
  symbol: string
  price: number
  quoteTime: string
  exchangeTimezone: string
  marketOpen: boolean
  stale: boolean
  source: string
}

export type QuoteAdapter = (symbol: string) => Promise<Quote>
export type ManualSession = 'intraday' | 'closed'

export type ReferencePriceSnapshot = {
  symbol?: string
  priceInput: string
  price: number
  anchorDate: string
  intraday: boolean
  mode: 'automatic' | 'manual'
  quote?: Quote
  error: string
  loading: boolean
  paused: boolean
  stale: boolean
  manualDate: string
  manualSession: ManualSession
  manualUpdatedAt?: string
}

type UseReferencePriceOptions = {
  symbol?: string
  fallbackPrice?: number
  fallbackDate?: string
  quoteAdapter?: QuoteAdapter
  refreshIntervalMs?: number
  staleAfterMs?: number
}

async function fetchQuote(symbol: string): Promise<Quote> {
  const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`)
  const value = await response.json()
  if (!response.ok) throw new Error(value.error)
  return value as Quote
}

function dateInZone(value: string | Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function fallbackValue(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : ''
}

type ReferencePriceState = {
  symbol?: string
  quote?: Quote
  priceInput: string
  mode: 'automatic' | 'manual'
  error: string
  loading: boolean
  paused: boolean
  manualDate: string
  manualSession: ManualSession
  manualUpdatedAt?: string
  clock: number
}

function initialState(symbol?: string, fallbackPrice?: number, fallbackDate?: string): ReferencePriceState {
  return {
    symbol,
    priceInput: fallbackValue(fallbackPrice),
    mode: 'automatic',
    error: '',
    loading: false,
    paused: false,
    manualDate: fallbackDate ?? dateInZone(new Date(), ET_ZONE),
    manualSession: 'closed',
    clock: Date.now(),
  }
}

export function useReferencePrice({
  symbol,
  fallbackPrice,
  fallbackDate,
  quoteAdapter = fetchQuote,
  refreshIntervalMs = 30_000,
  staleAfterMs = 120_000,
}: UseReferencePriceOptions) {
  const normalizedSymbol = symbol?.trim().toUpperCase() || undefined
  const [state, setState] = useState<ReferencePriceState>(() =>
    initialState(normalizedSymbol, fallbackPrice, fallbackDate),
  )
  const symbolRef = useRef(normalizedSymbol)
  const requestIdRef = useRef(0)

  const requestQuote = useCallback(async (requestedSymbol: string) => {
    const requestId = ++requestIdRef.current
    setState((current) => ({
      ...(current.symbol === requestedSymbol
        ? current
        : initialState(requestedSymbol, fallbackPrice, fallbackDate)),
      loading: true,
      error: '',
    }))
    try {
      const value = await quoteAdapter(requestedSymbol)
      if (requestId !== requestIdRef.current || symbolRef.current !== requestedSymbol) return
      if (value.symbol.trim().toUpperCase() !== requestedSymbol) throw new Error('Quote symbol does not match the Active Symbol.')
      setState({
        symbol: requestedSymbol,
        quote: value,
        priceInput: String(value.price),
        mode: 'automatic',
        error: '',
        loading: false,
        paused: false,
        manualDate: dateInZone(value.quoteTime, value.exchangeTimezone || ET_ZONE),
        manualSession: value.marketOpen ? 'intraday' : 'closed',
        manualUpdatedAt: undefined,
        clock: Date.now(),
      })
    } catch (cause) {
      if (requestId !== requestIdRef.current || symbolRef.current !== requestedSymbol) return
      setState((current) => ({
        ...(current.symbol === requestedSymbol
          ? current
          : initialState(requestedSymbol, fallbackPrice, fallbackDate)),
        error: cause instanceof Error ? cause.message : 'Unable to fetch quote.',
        loading: false,
      }))
    }
  }, [fallbackDate, fallbackPrice, quoteAdapter])

  useEffect(() => {
    symbolRef.current = normalizedSymbol
    requestIdRef.current += 1
    if (normalizedSymbol) void requestQuote(normalizedSymbol)
  }, [normalizedSymbol, requestQuote])

  const snapshot = useMemo<ReferencePriceSnapshot>(() => {
    const scopedState = state.symbol === normalizedSymbol
      ? state
      : initialState(normalizedSymbol, fallbackPrice, fallbackDate)
    const scopedQuote = scopedState.quote?.symbol.trim().toUpperCase() === normalizedSymbol
      ? scopedState.quote
      : undefined
    const priceInput = scopedState.mode === 'automatic' && !scopedQuote
      ? fallbackValue(fallbackPrice)
      : scopedState.priceInput
    const automaticDate = scopedQuote
      ? dateInZone(scopedQuote.quoteTime, scopedQuote.exchangeTimezone || ET_ZONE)
      : (fallbackDate ?? dateInZone(new Date(), ET_ZONE))
    const quoteAgeStale = Boolean(
      scopedQuote?.marketOpen
      && scopedState.clock - new Date(scopedQuote.quoteTime).getTime() > staleAfterMs,
    )
    return {
      symbol: normalizedSymbol,
      priceInput,
      price: Number(priceInput),
      anchorDate: scopedState.mode === 'manual'
        ? previousOrSameRegularSession(scopedState.manualDate)
        : automaticDate,
      intraday: scopedState.mode === 'manual'
        ? scopedState.manualSession === 'intraday'
        : Boolean(scopedQuote?.marketOpen),
      mode: scopedState.mode,
      quote: scopedQuote,
      error: scopedState.error,
      loading: scopedState.loading,
      paused: scopedState.paused,
      stale: scopedState.mode === 'automatic'
        && Boolean(scopedState.error || !scopedQuote || scopedQuote.stale || quoteAgeStale),
      manualDate: scopedState.manualDate,
      manualSession: scopedState.manualSession,
      manualUpdatedAt: scopedState.manualUpdatedAt,
    }
  }, [fallbackDate, fallbackPrice, normalizedSymbol, staleAfterMs, state])

  const refresh = useCallback((force = false) => {
    if (!normalizedSymbol || ((snapshot.mode === 'manual' || snapshot.paused) && !force)) return
    void requestQuote(normalizedSymbol)
  }, [normalizedSymbol, requestQuote, snapshot.mode, snapshot.paused])

  useEffect(() => {
    if (!normalizedSymbol || snapshot.paused || snapshot.mode === 'manual' || !snapshot.quote?.marketOpen) return
    const timer = window.setInterval(() => void requestQuote(normalizedSymbol), refreshIntervalMs)
    return () => window.clearInterval(timer)
  }, [normalizedSymbol, refreshIntervalMs, requestQuote, snapshot.mode, snapshot.paused, snapshot.quote?.marketOpen])

  useEffect(() => {
    if (!snapshot.quote?.marketOpen) return
    const timer = window.setInterval(
      () => setState((current) => ({ ...current, clock: Date.now() })),
      Math.min(30_000, staleAfterMs),
    )
    return () => window.clearInterval(timer)
  }, [snapshot.quote?.marketOpen, staleAfterMs])

  const setManualPrice = useCallback((value: string) => {
    requestIdRef.current += 1
    setState((current) => ({
      ...(current.symbol === normalizedSymbol
        ? current
        : initialState(normalizedSymbol, fallbackPrice, fallbackDate)),
      priceInput: value,
      mode: 'manual',
      error: '',
      loading: false,
      manualUpdatedAt: new Date().toISOString(),
    }))
  }, [fallbackDate, fallbackPrice, normalizedSymbol])

  const setManualDate = useCallback((value: string) => {
    requestIdRef.current += 1
    setState((current) => ({
      ...(current.symbol === normalizedSymbol
        ? current
        : initialState(normalizedSymbol, fallbackPrice, fallbackDate)),
      priceInput: snapshot.priceInput,
      manualDate: value,
      mode: 'manual',
      loading: false,
      manualUpdatedAt: new Date().toISOString(),
    }))
  }, [fallbackDate, fallbackPrice, normalizedSymbol, snapshot.priceInput])

  const setManualSession = useCallback((value: ManualSession) => {
    requestIdRef.current += 1
    setState((current) => ({
      ...(current.symbol === normalizedSymbol
        ? current
        : initialState(normalizedSymbol, fallbackPrice, fallbackDate)),
      priceInput: snapshot.priceInput,
      manualSession: value,
      mode: 'manual',
      loading: false,
      manualUpdatedAt: new Date().toISOString(),
    }))
  }, [fallbackDate, fallbackPrice, normalizedSymbol, snapshot.priceInput])

  const setPaused = useCallback((value: boolean) => {
    if (value) requestIdRef.current += 1
    setState((current) => ({
      ...(current.symbol === normalizedSymbol
        ? current
        : initialState(normalizedSymbol, fallbackPrice, fallbackDate)),
      paused: value,
      loading: false,
    }))
  }, [fallbackDate, fallbackPrice, normalizedSymbol])

  return {
    snapshot,
    setManualPrice,
    setManualDate,
    setManualSession,
    setPaused,
    refresh,
  }
}
