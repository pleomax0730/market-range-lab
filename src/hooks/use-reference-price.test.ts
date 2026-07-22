import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useReferencePrice, type Quote } from './use-reference-price'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function quote(symbol: string, price: number): Quote {
  return {
    symbol,
    price,
    quoteTime: '2026-07-20T20:00:00.000Z',
    exchangeTimezone: 'America/New_York',
    marketOpen: false,
    stale: false,
    source: 'Yahoo Finance',
  }
}

describe('useReferencePrice', () => {
  it('keeps a late quote for the previous Active Symbol out of the new snapshot', async () => {
    const soxl = deferred<Quote>()
    const tqqq = deferred<Quote>()
    const quoteAdapter = (symbol: string) => symbol === 'SOXL' ? soxl.promise : tqqq.promise
    const { result, rerender } = renderHook(
      ({ symbol, fallbackPrice }) => useReferencePrice({ symbol, fallbackPrice, fallbackDate: '2026-07-20', quoteAdapter }),
      { initialProps: { symbol: 'SOXL', fallbackPrice: 135 } },
    )

    rerender({ symbol: 'TQQQ', fallbackPrice: 67.65 })
    await act(async () => { tqqq.resolve(quote('TQQQ', 67.65)) })
    await waitFor(() => expect(result.current.snapshot.quote?.symbol).toBe('TQQQ'))

    await act(async () => { soxl.resolve(quote('SOXL', 135)) })
    expect(result.current.snapshot.symbol).toBe('TQQQ')
    expect(result.current.snapshot.price).toBe(67.65)
    expect(result.current.snapshot.quote?.symbol).toBe('TQQQ')
  })

  it('leaves manual mode behind when the Active Symbol changes', async () => {
    const soxl = deferred<Quote>()
    const tqqq = deferred<Quote>()
    const quoteAdapter = vi.fn((symbol: string) => symbol === 'SOXL' ? soxl.promise : tqqq.promise)
    const { result, rerender } = renderHook(
      ({ symbol, fallbackPrice }) => useReferencePrice({ symbol, fallbackPrice, fallbackDate: '2026-07-20', quoteAdapter }),
      { initialProps: { symbol: 'SOXL', fallbackPrice: 135 } },
    )

    act(() => result.current.setManualPrice('120'))
    expect(result.current.snapshot.mode).toBe('manual')

    rerender({ symbol: 'TQQQ', fallbackPrice: 67.65 })
    await waitFor(() => expect(quoteAdapter).toHaveBeenCalledWith('TQQQ'))
    expect(result.current.snapshot.symbol).toBe('TQQQ')
    expect(result.current.snapshot.mode).toBe('automatic')
    expect(result.current.snapshot.price).toBe(67.65)

    await act(async () => { tqqq.resolve(quote('TQQQ', 68)) })
    await waitFor(() => expect(result.current.snapshot.price).toBe(68))
  })

  it('rejects a quote whose symbol differs from the Active Symbol', async () => {
    const quoteAdapter = async () => quote('SOXL', 135)
    const { result } = renderHook(() => useReferencePrice({
      symbol: 'TQQQ',
      fallbackPrice: 67.65,
      fallbackDate: '2026-07-20',
      quoteAdapter,
    }))

    await waitFor(() => expect(result.current.snapshot.loading).toBe(false))
    expect(result.current.snapshot.quote).toBeUndefined()
    expect(result.current.snapshot.price).toBe(67.65)
    expect(result.current.snapshot.stale).toBe(true)
    expect(result.current.snapshot.error).toMatch(/does not match/i)
  })

  it('keeps a manual reference price until an explicit forced refresh', async () => {
    let nextPrice = 135
    const quoteAdapter = vi.fn(async () => quote('SOXL', nextPrice++))
    const { result } = renderHook(() => useReferencePrice({
      symbol: 'SOXL',
      fallbackPrice: 130,
      fallbackDate: '2026-07-20',
      quoteAdapter,
    }))

    await waitFor(() => expect(result.current.snapshot.quote?.price).toBe(135))
    act(() => result.current.setManualPrice('120'))
    act(() => result.current.refresh())
    expect(quoteAdapter).toHaveBeenCalledTimes(1)
    expect(result.current.snapshot).toMatchObject({ mode: 'manual', price: 120 })

    act(() => result.current.refresh(true))
    await waitFor(() => expect(result.current.snapshot.quote?.price).toBe(136))
    expect(result.current.snapshot).toMatchObject({ mode: 'automatic', price: 136 })
  })
})
