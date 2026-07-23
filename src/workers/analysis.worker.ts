/// <reference lib="webworker" />

import { analyzeHistory, repriceAnalyses } from '../domain/analyze'
import {
  calculateStatisticalReport,
  type StatisticalReportInput,
} from '../domain/analysis-report'
import type { HorizonAnalysis } from '../domain/types'

type AnalysisRequest = {
  requestId: number
  analysisKey: string
  modelKey: string
  scopeKey: string
  reportKey: string
  input: StatisticalReportInput
}

let cachedModelKey = ''
let cachedAnalyses: HorizonAnalysis[] | undefined

const NORMALIZED_ANCHOR_PRICE = 10_000

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  try {
    if (cachedModelKey !== event.data.modelKey) {
      cachedAnalyses = analyzeHistory({
        ...event.data.input.analysis,
        anchorPrice: NORMALIZED_ANCHOR_PRICE,
      })
      cachedModelKey = event.data.modelKey
    }
    const pricedAnalyses = repriceAnalyses(cachedAnalyses ?? [], event.data.input.analysis.anchorPrice)
    self.postMessage({
      requestId: event.data.requestId,
      analysisKey: event.data.analysisKey,
      scopeKey: event.data.scopeKey,
      reportKey: event.data.reportKey,
      report: calculateStatisticalReport(event.data.input, pricedAnalyses),
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
