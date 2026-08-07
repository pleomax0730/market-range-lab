import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryDataset } from '../domain/types'
import { useHistoryCatalog, type HistoryCatalogRepository } from './use-history-catalog'

function dataset(symbol: string, interval: 'daily' | 'weekly' = 'daily'): HistoryDataset {
  return {
    id: `${symbol}-${interval}`,
    symbol,
    filename: `${symbol}.csv`,
    sourceUrl: 'https://example.com/history',
    importedAt: '2026-07-21T00:00:00.000Z',
    sha256: `${symbol}-${interval}-hash`,
    splitAdjustedConfirmed: true,
    discontinuitiesConfirmed: true,
    interval,
    bars: [{ date: '2026-07-17', open: 100, high: 110, low: 90, close: 105 }],
  }
}

function repository(initial: HistoryDataset[], activeId?: string): HistoryCatalogRepository {
  return {
    list: vi.fn(async () => initial),
    saveAndSelect: vi.fn(async () => undefined),
    removeAndSelect: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    getActiveId: vi.fn(async () => activeId),
    setActiveId: vi.fn(async () => undefined),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

describe('useHistoryCatalog', () => {
  it('repairs an invalid stored Active Symbol selection during hydration', async () => {
    const soxl = dataset('SOXL')
    const tqqq = dataset('TQQQ')
    const storage = repository([soxl, tqqq], 'missing-id')
    const { result } = renderHook(() => useHistoryCatalog({ repository: storage }))

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.active).toEqual(soxl)
    expect(result.current.activeId).toBe(soxl.id)
    expect(storage.setActiveId).toHaveBeenCalledWith(soxl.id)
  })

  it('persists and activates a weekly-only history dataset', async () => {
    const storage = repository([])
    const { result } = renderHook(() => useHistoryCatalog({ repository: storage }))
    await waitFor(() => expect(result.current.ready).toBe(true))

    const csv = [
      'Date,Price,Open,High,Low',
      '07/17/2026,105,100,110,90',
      '07/10/2026,100,98,106,95',
    ].join('\n')
    let imported: Awaited<ReturnType<typeof result.current.importAndActivate>>
    await act(async () => {
      imported = await result.current.importAndActivate(csv, {
        symbol: 'TQQQ',
        filename: 'TQQQ weekly.csv',
        sourceUrl: 'https://example.com/history',
        importedAt: '2026-07-21T00:00:00.000Z',
        splitAdjustedConfirmed: true,
        discontinuitiesConfirmed: true,
        interval: 'weekly',
      })
    })

    expect(imported!.dataset?.interval).toBe('weekly')
    expect(result.current.active).toEqual(imported!.dataset)
    expect(storage.saveAndSelect).toHaveBeenCalledWith(imported!.dataset, imported!.dataset!.id)
  })

  it('keeps matching Daily History active when importing Weekly reconciliation data', async () => {
    const daily = dataset('TQQQ')
    const storage = repository([daily], daily.id)
    const { result } = renderHook(() => useHistoryCatalog({ repository: storage }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    const csv = [
      'Date,Price,Open,High,Low',
      '07/17/2026,105,100,110,90',
      '07/10/2026,100,98,106,95',
    ].join('\n')

    await act(async () => {
      await result.current.importAndActivate(csv, {
        symbol: 'TQQQ',
        filename: 'TQQQ weekly.csv',
        sourceUrl: 'https://example.com/history',
        importedAt: '2026-07-21T00:00:00.000Z',
        splitAdjustedConfirmed: true,
        discontinuitiesConfirmed: true,
        interval: 'weekly',
      })
    })

    expect(result.current.activeId).toBe(daily.id)
    expect(result.current.datasets).toHaveLength(2)
    expect(storage.saveAndSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ interval: 'weekly' }),
      daily.id,
    )
  })

  it('merges a multi-file Daily selection after one symbol confirmation', async () => {
    const storage = repository([])
    const { result } = renderHook(() => useHistoryCatalog({ repository: storage }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    const files = [
      new File([
        'Date,Price,Open,High,Low\n07/15/2026,100,99,101,98\n07/16/2026,101,100,102,99',
      ], 'Marvell Stock Price History.csv', { type: 'text/csv' }),
      new File([
        'Date,Price,Open,High,Low\n07/17/2026,102,101,103,100\n07/20/2026,104,102,105,101',
      ], 'Marvell Stock Price History2.csv', { type: 'text/csv' }),
    ]

    await act(async () => result.current.importFiles(files, 'daily'))
    expect(result.current.pendingImport?.detectedSymbol).toBe('MARVELL')

    await act(async () => result.current.confirmImport('MRVL'))

    expect(result.current.active?.symbol).toBe('MRVL')
    expect(result.current.active?.bars).toHaveLength(4)
    expect(storage.saveAndSelect).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'MRVL', interval: 'daily' }),
      expect.any(String),
    )
    expect(result.current.messages[0]).toContain('已合併 2 個 Daily CSV')
  })

  it('selects a deterministic fallback after deleting the active dataset', async () => {
    const soxl = dataset('SOXL')
    const tqqq = dataset('TQQQ')
    const storage = repository([soxl, tqqq], soxl.id)
    const { result } = renderHook(() => useHistoryCatalog({ repository: storage }))
    await waitFor(() => expect(result.current.activeId).toBe(soxl.id))

    await act(async () => result.current.remove(soxl.id))

    expect(result.current.datasets).toEqual([tqqq])
    expect(result.current.active).toEqual(tqqq)
    expect(storage.removeAndSelect).toHaveBeenCalledWith(soxl.id, tqqq.id)
  })

  it('serializes rapid Active Symbol changes in click order', async () => {
    const soxl = dataset('SOXL')
    const tqqq = dataset('TQQQ')
    const firstWrite = deferred<void>()
    const storage = repository([soxl, tqqq], soxl.id)
    storage.setActiveId = vi.fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => useHistoryCatalog({ repository: storage }))
    await waitFor(() => expect(result.current.ready).toBe(true))

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.activate(tqqq.id)
      second = result.current.activate(soxl.id)
    })
    await waitFor(() => expect(storage.setActiveId).toHaveBeenCalledTimes(1))
    expect(storage.setActiveId).toHaveBeenNthCalledWith(1, tqqq.id)

    await act(async () => {
      firstWrite.resolve()
      await Promise.all([first, second])
    })
    expect(storage.setActiveId).toHaveBeenNthCalledWith(2, soxl.id)
    expect(result.current.activeId).toBe(soxl.id)
  })
})
