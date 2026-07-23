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

export type RiskGrade = 'conservative' | 'safe' | 'dangerous' | 'insufficient' | 'scenario'

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
  requestedGrade?: 'conservative' | 'safe'
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
}

export type HorizonBacktest = {
  method: string
  minimumTrainingPaths: number
  lower: {
    conservative: BacktestResult
    safe: BacktestResult
  }
  upper: {
    conservative: BacktestResult
    safe: BacktestResult
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
  sampleSize: number
  effectiveSampleSize: number
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
