import { useEffect, useRef, useState } from 'react'
import type { AnalysisInput } from '../domain/analyze'
import type { HorizonAnalysis } from '../domain/types'

type WorkerResponse = { requestId: number; analyses?: HorizonAnalysis[]; error?: string }

export function useHistoricalAnalysis(input?: AnalysisInput, debounceMs = 250) {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [analyses, setAnalyses] = useState<HorizonAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestIdRef.current) return
      setLoading(false)
      if (event.data.error) { setError(event.data.error); return }
      setError('')
      setAnalyses(event.data.analyses ?? [])
    }
    worker.onerror = () => { setLoading(false); setError('背景分析程序發生錯誤。') }
    return () => { worker.terminate(); workerRef.current = null }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      requestIdRef.current += 1
      if (!input || !Number.isFinite(input.anchorPrice) || input.anchorPrice <= 0) { setAnalyses([]); setLoading(false); return }
      setLoading(true)
      workerRef.current?.postMessage({ requestId: requestIdRef.current, input })
    }, input ? debounceMs : 0)
    return () => window.clearTimeout(timer)
  }, [input, debounceMs])

  return { analyses, loading, error }
}
