import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AnalysisReportContext,
  StatisticalAnalysisReport,
  StatisticalReportInput,
} from '../domain/analysis-report'
import { DEFAULT_PREMIUM_ASSUMPTIONS } from '../domain/premium-analysis'
import type { HistoryDataset } from '../domain/types'
import { useAnalysisReport } from './use-analysis-report'

type WorkerRequest = {
  requestId: number
  analysisKey: string
  scopeKey: string
  reportKey: string
}

class ControlledWorker {
  static latest: ControlledWorker

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  requests: WorkerRequest[] = []

  constructor() {
    ControlledWorker.latest = this
  }

  postMessage(request: WorkerRequest) {
    this.requests.push(request)
  }

  emit(report: StatisticalAnalysisReport) {
    const request = this.requests.at(-1)
    if (!request) throw new Error('No analysis request to complete.')
    this.onmessage?.({ data: { ...request, report } } as MessageEvent)
  }

  terminate() {}
}

const dataset: HistoryDataset = {
  id: 'SOXL-daily',
  symbol: 'SOXL',
  filename: 'SOXL Daily.csv',
  sourceUrl: 'https://example.com/history',
  importedAt: '2026-07-29T00:00:00.000Z',
  sha256: 'history-hash',
  splitAdjustedConfirmed: true,
  discontinuitiesConfirmed: true,
  interval: 'daily',
  bars: [{ date: '2026-07-28', open: 100, high: 102, low: 98, close: 101 }],
}

const statistical: StatisticalAnalysisReport = {
  gradePaused: false,
  analyses: [],
}

function input(price: number): StatisticalReportInput {
  return {
    analysis: {
      bars: dataset.bars,
      anchorPrice: price,
      anchorDate: '2026-07-29',
      intraday: true,
      interval: 'daily',
    },
    gradePaused: false,
  }
}

function context(price: number): AnalysisReportContext {
  return {
    dataset,
    reference: {
      price,
      anchorDate: '2026-07-29',
      intraday: true,
      mode: 'automatic',
      paused: false,
    },
    pauseReasons: [],
    selectedExpiryDate: '2026-08-07',
    selectedTradingSessions: 7,
    aggressiveThresholds: {
      expirationUpper95: 0.05,
      pathTouchUpper95: 0.1,
    },
    premiumAssumptions: DEFAULT_PREMIUM_ASSUMPTIONS,
  }
}

function options(price: number) {
  return {
    input: input(price),
    analysisKey: `model|price=${price}`,
    modelKey: 'model',
    context: context(price),
    debounceMs: 0,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useAnalysisReport', () => {
  it('keeps the last complete report visible while a new quote price is analyzed', async () => {
    vi.stubGlobal('Worker', ControlledWorker as unknown as typeof Worker)

    const { result, rerender } = renderHook(
      (props) => useAnalysisReport(props),
      { initialProps: options(100) },
    )

    await waitFor(() => expect(ControlledWorker.latest.requests).toHaveLength(1))
    act(() => ControlledWorker.latest.emit(statistical))
    await waitFor(() => expect(result.current.report?.anchorPrice).toBe(100))

    rerender(options(101))

    await waitFor(() => expect(result.current.loading).toBe(true))
    expect(result.current.report?.anchorPrice).toBe(100)

    await waitFor(() => expect(ControlledWorker.latest.requests).toHaveLength(2))
    act(() => ControlledWorker.latest.emit(statistical))
    await waitFor(() => expect(result.current.report?.anchorPrice).toBe(101))
  })
})
