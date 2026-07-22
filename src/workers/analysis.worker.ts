/// <reference lib="webworker" />

import { analyzeHistory } from '../domain/analyze'
import {
  calculateStatisticalReport,
  type StatisticalReportInput,
} from '../domain/analysis-report'
import type { HorizonAnalysis } from '../domain/types'

type AnalysisRequest = {
  requestId: number
  analysisKey: string
  scopeKey: string
  reportKey: string
  input: StatisticalReportInput
}

let cachedAnalysisKey = ''
let cachedAnalyses: HorizonAnalysis[] | undefined

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  try {
    if (cachedAnalysisKey !== event.data.analysisKey) {
      cachedAnalyses = analyzeHistory(event.data.input.analysis)
      cachedAnalysisKey = event.data.analysisKey
    }
    self.postMessage({
      requestId: event.data.requestId,
      analysisKey: event.data.analysisKey,
      scopeKey: event.data.scopeKey,
      reportKey: event.data.reportKey,
      report: calculateStatisticalReport(event.data.input, cachedAnalyses),
    })
  } catch (error) {
    self.postMessage({
      requestId: event.data.requestId,
      analysisKey: event.data.analysisKey,
      scopeKey: event.data.scopeKey,
      reportKey: event.data.reportKey,
      error: error instanceof Error ? error.message : 'Analysis failed.',
    })
  }
}
