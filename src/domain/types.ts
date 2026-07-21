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
  expirationUpper95: number
  pathTouch: number
  pathTouchUpper95: number
  grade: RiskGrade
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
  }
  bootstrap: {
    closeLowPct: [number, number]
    closeHighPct: [number, number]
  }
  evt: {
    lowerStressPct?: number
    upperStressPct?: number
    note: string
  }
}

