/// <reference lib="webworker" />

import { analyzeHistory, type AnalysisInput } from '../domain/analyze'

type AnalysisRequest = { requestId: number; input: AnalysisInput }

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  try {
    self.postMessage({ requestId: event.data.requestId, analyses: analyzeHistory(event.data.input) })
  } catch (error) {
    self.postMessage({ requestId: event.data.requestId, error: error instanceof Error ? error.message : 'Analysis failed.' })
  }
}

