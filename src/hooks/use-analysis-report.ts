import { useEffect, useMemo, useRef, useState } from 'react'
import {
  composeAnalysisReport,
  type AnalysisReportContext,
  type StatisticalAnalysisReport,
  type StatisticalReportInput,
} from '../domain/analysis-report'

type WorkerResponse = {
  requestId: number
  analysisKey: string
  scopeKey: string
  reportKey: string
  report?: StatisticalAnalysisReport
  error?: string
}

type UseAnalysisReportOptions = {
  input?: StatisticalReportInput
  analysisKey?: string
  context?: AnalysisReportContext
  debounceMs?: number
}

function keysFor(input: StatisticalReportInput | undefined, analysisKey: string | undefined) {
  if (!input || !analysisKey) return { scopeKey: '', reportKey: '' }
  const scopeKey = `${analysisKey}|paused=${input.gradePaused}`
  const candidate = input.candidate
    ? `${input.candidate.weeks}:${input.candidate.side}:${input.candidate.price}`
    : 'none'
  return { scopeKey, reportKey: `${scopeKey}|candidate=${candidate}` }
}

export function useAnalysisReport({
  input,
  analysisKey,
  context,
  debounceMs = 250,
}: UseAnalysisReportOptions) {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [response, setResponse] = useState<WorkerResponse>()
  const [workerLoading, setWorkerLoading] = useState(false)
  const [error, setError] = useState('')
  const { scopeKey, reportKey } = keysFor(input, analysisKey)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestIdRef.current) return
      setWorkerLoading(false)
      if (event.data.error) {
        setResponse(event.data)
        setError(event.data.error)
        return
      }
      setError('')
      setResponse(event.data)
    }
    worker.onerror = () => {
      setWorkerLoading(false)
      setResponse(undefined)
      setError('背景分析程序發生錯誤。')
    }
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      requestIdRef.current += 1
      if (!input || !analysisKey || !Number.isFinite(input.analysis.anchorPrice) || input.analysis.anchorPrice <= 0) {
        setWorkerLoading(false)
        return
      }
      setWorkerLoading(true)
      setError('')
      workerRef.current?.postMessage({
        requestId: requestIdRef.current,
        analysisKey,
        scopeKey,
        reportKey,
        input,
      })
    }, input ? debounceMs : 0)
    return () => window.clearTimeout(timer)
  }, [analysisKey, debounceMs, input, reportKey, scopeKey])

  const statistical = useMemo(() => {
    if (!response?.report || response.scopeKey !== scopeKey) return undefined
    if (response.reportKey === reportKey) return response.report
    return { ...response.report, candidate: undefined }
  }, [reportKey, response, scopeKey])

  const staleCandidate = useMemo(() => {
    if (!response?.report || response.scopeKey !== scopeKey || response.reportKey === reportKey) return undefined
    return response.report.candidate
  }, [reportKey, response, scopeKey])

  const report = useMemo(
    () => statistical && context
      ? composeAnalysisReport(statistical, context)
      : undefined,
    [context, statistical],
  )

  return {
    report,
    staleCandidate,
    loading: Boolean(input && reportKey && response?.reportKey !== reportKey) || workerLoading,
    error,
  }
}
