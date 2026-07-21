import type { HorizonAnalysis } from './types'

export function applyGradePause(analyses: HorizonAnalysis[], paused: boolean) {
  return analyses.map((analysis) => ({
    ...analysis,
    lower: analysis.lower.map((risk) => ({ ...risk, grade: paused && analysis.weeks <= 4 ? 'insufficient' as const : risk.grade })),
    upper: analysis.upper.map((risk) => ({ ...risk, grade: paused && analysis.weeks <= 4 ? 'insufficient' as const : risk.grade })),
  }))
}

