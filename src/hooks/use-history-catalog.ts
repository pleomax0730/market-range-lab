import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearDatasets,
  deleteDatasetAndSetActive,
  getActiveDatasetId,
  listDatasets,
  saveDatasetAndSelect,
  setActiveDataset,
} from '../data/datasets'
import {
  defaultHistoryImportOptions,
  formatHistoryImportMessages,
  prepareHistoryImports,
  resolveImportSymbol,
  type HistoryInterval,
  type PendingHistoryFilesImport,
} from '../domain/history-intake'
import {
  importHistoryCsvFiles,
  type HistoryCsvSource,
  type HistoryImportOptions,
} from '../domain/import-history'
import type { HistoryDataset, ImportResult } from '../domain/types'

export type HistoryCatalogRepository = {
  list: () => Promise<HistoryDataset[]>
  saveAndSelect: (dataset: HistoryDataset, activeId: string) => Promise<unknown>
  removeAndSelect: (id: string, activeId: string) => Promise<unknown>
  clear: () => Promise<unknown>
  getActiveId: () => Promise<string | undefined>
  setActiveId: (id: string) => Promise<unknown>
}

const indexedDbRepository: HistoryCatalogRepository = {
  list: listDatasets,
  saveAndSelect: saveDatasetAndSelect,
  removeAndSelect: deleteDatasetAndSetActive,
  clear: clearDatasets,
  getActiveId: getActiveDatasetId,
  setActiveId: setActiveDataset,
}

type CatalogSnapshot = {
  datasets: HistoryDataset[]
  activeId: string
  ready: boolean
  error: string
}

type UseHistoryCatalogOptions = {
  repository?: HistoryCatalogRepository
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Local history storage failed.'
}

export function useHistoryCatalog({ repository = indexedDbRepository }: UseHistoryCatalogOptions = {}) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>({
    datasets: [],
    activeId: '',
    ready: false,
    error: '',
  })
  const [pendingImport, setPendingImport] = useState<PendingHistoryFilesImport>()
  const [messages, setMessages] = useState<string[]>([])
  const snapshotRef = useRef(snapshot)
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve())

  const commit = useCallback((next: CatalogSnapshot) => {
    snapshotRef.current = next
    setSnapshot(next)
  }, [])

  const enqueue = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueueRef.current.then(operation, operation)
    operationQueueRef.current = result.then(() => undefined, () => undefined)
    return result
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [datasets, storedActiveId] = await Promise.all([
          repository.list(),
          repository.getActiveId(),
        ])
        const activeId = datasets.some((dataset) => dataset.id === storedActiveId)
          ? storedActiveId!
          : (datasets[0]?.id ?? '')
        if (activeId !== (storedActiveId ?? '')) await repository.setActiveId(activeId)
        if (!cancelled) commit({ datasets, activeId, ready: true, error: '' })
      } catch (cause) {
        if (!cancelled) commit({
          datasets: [],
          activeId: '',
          ready: true,
          error: cause instanceof Error ? cause.message : 'Unable to load local history datasets.',
        })
      }
    })()
    return () => { cancelled = true }
  }, [commit, repository])

  const importFilesAndActivate = useCallback((
    sources: HistoryCsvSource[],
    options: HistoryImportOptions,
  ): Promise<ImportResult> => enqueue(async () => {
    const result = await importHistoryCsvFiles(sources, options)
    if (!result.dataset) return result
    const preferredDaily = options.interval === 'weekly'
      ? snapshotRef.current.datasets.find(
          (dataset) => dataset.symbol === result.dataset!.symbol && dataset.interval === 'daily',
        )
      : undefined
    const activeId = preferredDaily?.id ?? result.dataset.id
    try {
      await repository.saveAndSelect(result.dataset, activeId)
    } catch (cause) {
      const message = errorMessage(cause)
      commit({ ...snapshotRef.current, error: message })
      return {
        errors: [...result.errors, { code: 'STORAGE_ERROR', message }],
        warnings: result.warnings,
      }
    }
    const datasets = [
      ...snapshotRef.current.datasets.filter((dataset) => dataset.id !== result.dataset!.id),
      result.dataset,
    ]
    commit({ datasets, activeId, ready: true, error: '' })
    return result
  }), [commit, enqueue, repository])

  const importAndActivate = useCallback((
    csv: string,
    options: HistoryImportOptions,
  ) => importFilesAndActivate(
    [{ filename: options.filename, csv }],
    options,
  ), [importFilesAndActivate])

  const commitImport = useCallback(async (
    sources: HistoryCsvSource[],
    filename: string,
    interval: HistoryInterval,
    symbolInput: string,
  ) => {
    const resolved = resolveImportSymbol(symbolInput)
    if (!resolved.ok) {
      setPendingImport(undefined)
      setMessages(resolved.messages)
      return
    }
    setPendingImport(undefined)
    const result = await importFilesAndActivate(
      sources,
      defaultHistoryImportOptions({
        symbol: resolved.symbol,
        filename,
        interval,
      }),
    )
    const nextMessages = formatHistoryImportMessages(
      result,
      interval,
      snapshotRef.current.datasets,
    )
    if (sources.length > 1 && result.dataset) {
      nextMessages.unshift(
        `已合併 ${sources.length} 個 ${interval === 'daily' ? 'Daily' : 'Weekly'} CSV，共 ${result.dataset.bars.length.toLocaleString()} 筆不重複價格資料。`,
      )
    }
    setMessages(nextMessages)
  }, [importFilesAndActivate])

  const importFiles = useCallback(async (
    files: File[],
    interval: HistoryInterval,
  ) => {
    const prepared = await prepareHistoryImports(files, interval)
    if (prepared.status === 'error') {
      setPendingImport(undefined)
      setMessages(prepared.messages)
      return
    }
    if (prepared.status === 'needs-confirmation') {
      setMessages([])
      setPendingImport(prepared.pending)
      return
    }
    await commitImport(
      prepared.sources,
      prepared.filename,
      prepared.interval,
      prepared.symbol,
    )
  }, [commitImport])

  const importFile = useCallback(async (
    file: File,
    interval: HistoryInterval,
  ) => {
    await importFiles([file], interval)
  }, [importFiles])

  const confirmImport = useCallback(async (symbolInput: string) => {
    if (!pendingImport) return
    await commitImport(
      pendingImport.sources,
      pendingImport.filename,
      pendingImport.interval,
      symbolInput,
    )
  }, [commitImport, pendingImport])

  const cancelImport = useCallback(() => {
    setPendingImport(undefined)
  }, [])

  const updatePendingSymbol = useCallback((symbol: string) => {
    setPendingImport((current) =>
      current ? { ...current, symbol: symbol.toUpperCase() } : current,
    )
  }, [])

  const activate = useCallback((id: string) => enqueue(async () => {
    if (!snapshotRef.current.datasets.some((dataset) => dataset.id === id)) return
    try {
      await repository.setActiveId(id)
      commit({ ...snapshotRef.current, activeId: id, error: '' })
    } catch (cause) {
      commit({ ...snapshotRef.current, error: errorMessage(cause) })
    }
  }), [commit, enqueue, repository])

  const remove = useCallback((id: string) => enqueue(async () => {
    const current = snapshotRef.current
    const datasets = current.datasets.filter((dataset) => dataset.id !== id)
    if (datasets.length === current.datasets.length) return
    try {
      const activeId = current.activeId === id
        ? (datasets[0]?.id ?? '')
        : current.activeId
      await repository.removeAndSelect(id, activeId)
      commit({ datasets, activeId, ready: true, error: '' })
    } catch (cause) {
      commit({ ...snapshotRef.current, error: errorMessage(cause) })
    }
  }), [commit, enqueue, repository])

  const clear = useCallback(() => enqueue(async () => {
    try {
      await repository.clear()
      commit({ datasets: [], activeId: '', ready: true, error: '' })
    } catch (cause) {
      commit({ ...snapshotRef.current, error: errorMessage(cause) })
    }
  }), [commit, enqueue, repository])

  const active = useMemo(
    () => snapshot.datasets.find((dataset) => dataset.id === snapshot.activeId),
    [snapshot.activeId, snapshot.datasets],
  )

  return {
    ...snapshot,
    active,
    pendingImport,
    messages,
    importAndActivate,
    importFile,
    importFiles,
    confirmImport,
    cancelImport,
    updatePendingSymbol,
    activate,
    remove,
    clear,
  }
}
