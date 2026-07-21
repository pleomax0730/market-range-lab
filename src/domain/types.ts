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
  pathTouch: number
  pathTouchLower95: number
  pathTouchUpper95: number
  grade: RiskGrade
  requestedGrade?: 'conservative' | 'safe'
  meetsTarget?: boolean
}

export type HorizonAnalysis = {
  weeks: number
  targetDate: string
  sampleSize: number
  effectiveSampleSize: number
  lower: RiskSide[]
  upper: RiskSide[]
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
