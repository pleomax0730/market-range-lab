export type PriceBar = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type DatasetMetadata = {
  id: string
  symbol: string
  filename: string
  sourceUrl: string
  importedAt: string
  sha256: string
  splitAdjustedConfirmed: boolean
  discontinuitiesConfirmed: boolean
  interval: 'daily' | 'weekly'
  modelVersion?: string
  quality?: {
    acceptedRows: number
    rejectedRows: number
    warnings: ImportIssue[]
  }
}

export type HistoryDataset = DatasetMetadata & {
  bars: PriceBar[]
}

export type ImportIssue = {
  code: string
  message: string
  row?: number
}

export type ImportResult = {
  dataset?: HistoryDataset
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

export type DecisionGrade = 'conservative' | 'safe' | 'aggressive'

export type RiskGrade = DecisionGrade | 'dangerous' | 'insufficient' | 'scenario'

export type RiskThresholds = {
  expirationUpper95: number
  pathTouchUpper95: number
}

export type RiskSide = {
  price: number
  returnPct: number
  expirationBreach: number
  expirationLower95: number
  expirationUpper95: number
  expirationRiskUpper95: number
  pathTouch: number
  pathTouchLower95: number
  pathTouchUpper95: number
  pathTouchRiskUpper95: number
  grade: RiskGrade
  requestedGrade?: DecisionGrade
  meetsTarget?: boolean
  basis?: 'certified' | 'model-estimate'
}

export type ModelBoundaryEstimate = {
  price: number
  returnPct: number
  evtUsed: boolean
}

export type VolatilityAdjustment = {
  available: boolean
  method: string
  targetAnnualized?: number
  medianScale?: number
  minimumScale?: number
  maximumScale?: number
  cappedPathCount: number
}

export type BacktestResult = {
  predictions: number
  expirationBreaches: number
  expirationRate: number
  pathTouchBreaches: number
  pathTouchRate: number
  recovery?: AssignmentRecoverySummary
}

export type RecoveryWindowResult = {
  periods: number
  eligibleAssignments: number
  effectiveEligibleAssignments?: number
  recoveredAssignments: number
  recoveryRate: number
  lower95?: number
  upper95?: number
}

export type AssignmentRecoverySummary = {
  estimator: 'kaplan-meier'
  periodUnit: 'trading-session' | 'week'
  assignmentEvents: number
  effectiveAssignmentEvents: number
  recoveredEvents: number
  unrecoveredEvents: number
  medianPeriods?: number
  p75Periods?: number
  maximumPeriods?: number
  medianCalendarDays?: number
  p75CalendarDays?: number
  maximumCalendarDays?: number
  windows: RecoveryWindowResult[]
  customWindow?: RecoveryWindowResult
}

export type HorizonBacktest = {
  method: string
  minimumTrainingPaths: number
  predictionStartDate?: string
  predictionEndDate?: string
  lower: {
    conservative: BacktestResult
    safe: BacktestResult
    aggressive: BacktestResult
  }
  upper: {
    conservative: BacktestResult
    safe: BacktestResult
    aggressive: BacktestResult
  }
}

export type DownsideDistributionPoint = {
  returnPct: number
  expirationBreach: number
  pathTouch: number
}

export type HorizonAnalysis = {
  weeks: number
  targetDate: string
  tradingSessions: number
  sampleSize: number
  effectiveSampleSize: number
  aggressiveThresholds: RiskThresholds
  lower: RiskSide[]
  upper: RiskSide[]
  downsideDistribution: DownsideDistributionPoint[]
  conservativeEstimate: {
    lower: ModelBoundaryEstimate
    upper: ModelBoundaryEstimate
  }
  conservativeCertification: {
    lower: RiskSide
    upper: RiskSide
  }
  volatilityAdjustment: VolatilityAdjustment
  backtest?: HorizonBacktest
  empirical: {
    closeLowPct: number
    closeHighPct: number
    pathLowPct: number
    pathHighPct: number
    closeMinPct: number
    closeMaxPct: number
    pathMinPct: number
    pathMaxPct: number
  }
  bootstrap: {
    closeLowPct: [number, number]
    closeHighPct: [number, number]
    pathLowPct: [number, number]
    pathHighPct: [number, number]
  }
  evt: {
    lowerStressPct?: number
    upperStressPct?: number
    note: string
    lowerDiagnostics: string
    upperDiagnostics: string
  }
}
