import { useMemo } from 'react'
import {
  buildAnalysisSession,
  type AnalysisSessionKnobs,
} from '../domain/analysis-session'
import type { HistoryDataset } from '../domain/types'
import { useAnalysisReport } from './use-analysis-report'
import type { ReferencePriceSnapshot } from './use-reference-price'

type UseAnalysisSessionOptions = {
  dataset?: HistoryDataset
  reference: ReferencePriceSnapshot
  knobs: AnalysisSessionKnobs
  debounceMs?: number
}

export function useAnalysisSession({
  dataset,
  reference,
  knobs,
  debounceMs,
}: UseAnalysisSessionOptions) {
  const plan = useMemo(
    () => buildAnalysisSession(dataset, reference, knobs),
    [dataset, knobs, reference],
  )
  const reportState = useAnalysisReport({
    input: plan.reportInput,
    analysisKey: plan.analysisKey,
    modelKey: plan.modelKey,
    context: plan.context,
    debounceMs,
  })

  return {
    ...plan,
    report: reportState.report,
    staleCandidate: reportState.staleCandidate,
    loading: reportState.loading,
    error: reportState.error,
  }
}
