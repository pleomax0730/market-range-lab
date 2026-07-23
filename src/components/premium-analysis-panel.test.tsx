import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { CandidateAnalysis } from '../domain/analysis-report'
import { PremiumAnalysisPanel } from './premium-analysis-panel'
import { TooltipProvider } from './ui/tooltip'

const candidate: CandidateAnalysis = {
  weeks: 1,
  price: 67,
  side: 'lower',
  sampleSize: 850,
  result: {
    price: 67,
    returnPct: -0.0612,
    expirationBreach: 0.1412,
  expirationLower95: 0.1129,
  expirationUpper95: 0.1812,
  expirationRiskUpper95: 0.17,
    pathTouch: 0.2471,
  pathTouchLower95: 0.2104,
  pathTouchUpper95: 0.299,
  pathTouchRiskUpper95: 0.28,
    grade: 'dangerous',
  },
  premium: {
    strike: 67,
    sampleSize: 850,
    effectiveSampleSize: 850,
    lossEventCount: 120,
    effectiveLossEventCount: 120,
    daysToExpiry: 3,
    expectedLossPerShare: 0.45,
    conditionalLossPerShare: 3.19,
    expectedLossInterval95: [0.32, 0.60],
    cvar95PerShare: 6.07,
    maximumHistoricalLossPerShare: 16.96,
    transactionCostPerShare: 0.03,
    capitalHurdlePerShare: 0.05,
    lightTailChargePerShare: 0.56,
    conservativeTailChargePerShare: 1.41,
    annualCapitalReturnRate: 0.10,
    lightTailWeight: 0.10,
    conservativeTailWeight: 0.25,
    statisticalFloorPerShare: 0.63,
    capitalReturnFloorPerShare: 0.68,
    lightTailFloorPerShare: 1.25,
    conservativeTailFloorPerShare: 2.09,
  },
}

describe('PremiumAnalysisPanel', () => {
  it('shows all four auditable premium floors and compares an entered premium', async () => {
    const user = userEvent.setup()
    function ControlledPanel() {
      const [value, setValue] = useState('')
      const [annualRate, setAnnualRate] = useState('10')
      return <PremiumAnalysisPanel candidate={candidate} marketPremium={value} onMarketPremiumChange={setValue} annualCapitalReturnRatePct={annualRate} onAnnualCapitalReturnRatePctChange={setAnnualRate} />
    }
    render(<TooltipProvider><ControlledPanel /></TooltipProvider>)

    expect(screen.getByText('歷史統計賠付參考')).toBeInTheDocument()
    expect(screen.getByText('加資金報酬參考')).toBeInTheDocument()
    expect(screen.getByText('輕度壓力參考')).toBeInTheDocument()
    expect(screen.getByText('保守壓力參考')).toBeInTheDocument()
    expect(screen.getByText('$2.09')).toBeInTheDocument()
    expect(screen.getByText(/尾端加價 = 權重/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('預估可成交淨權利金 / 股（選填）'), '1.25')
    expect(screen.getByText(/高於輕度壓力參考/)).toBeInTheDocument()
    expect(screen.getByText(/不是 Sell Put 訊號/)).toBeInTheDocument()
    expect(screen.getByLabelText('年化資金門檻')).toHaveValue(10)
  })

  it('warns when history contains no positive expiration payoff', () => {
    const noLossCandidate = {
      ...candidate,
      premium: { ...candidate.premium!, lossEventCount: 0, effectiveLossEventCount: 0 },
    }
    render(<TooltipProvider><PremiumAnalysisPanel candidate={noLossCandidate} marketPremium="" onMarketPremiumChange={() => undefined} annualCapitalReturnRatePct="10" onAnnualCapitalReturnRatePctChange={() => undefined} /></TooltipProvider>)

    expect(screen.getByRole('alert')).toHaveTextContent('少於證據閘門 20 個')
  })
})
