import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RiskSide } from '../domain/types'
import { TooltipProvider } from './ui/tooltip'
import { PutDecisionSummary } from './put-decision-summary'

const conservative: RiskSide = {
  price: 48.42,
  returnPct: -0.2843,
  expirationBreach: 0,
  expirationLower95: 0,
  expirationUpper95: 0.0049,
  expirationRiskUpper95: 0.003,
  pathTouch: 0.0026,
  pathTouchLower95: 0,
  pathTouchUpper95: 0.0094,
  pathTouchRiskUpper95: 0.007,
  grade: 'insufficient',
  basis: 'model-estimate',
}

const safe: RiskSide = {
  ...conservative,
  price: 55.15,
  returnPct: -0.1848,
  expirationBreach: 0.0091,
  pathTouch: 0.0272,
  grade: 'safe',
  requestedGrade: 'safe',
  meetsTarget: true,
  basis: 'certified',
}

afterEach(cleanup)

describe('PutDecisionSummary', () => {
  it('puts the two decision prices and observed frequencies in one scan', () => {
    render(
      <TooltipProvider>
        <PutDecisionSummary
          analysis={{ weeks: 1, targetDate: '2026-07-31', lower: [conservative, safe] }}
          stale={false}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Put 決策價格')).toBeInTheDocument()
    expect(screen.getByText('$48.42')).toBeInTheDocument()
    expect(screen.getByText('$55.15')).toBeInTheDocument()
    expect(screen.getByText('保守模型 · 未認證')).toBeInTheDocument()
    expect(screen.getByText('符合安全門檻')).toBeInTheDocument()
    expect(screen.getByText('0.91%')).toBeInTheDocument()
    expect(screen.getByText('2.72%')).toBeInTheDocument()
  })

  it('makes a paused grade explicit without removing the reference prices', () => {
    render(
      <TooltipProvider>
        <PutDecisionSummary
          analysis={{ weeks: 4, targetDate: '2026-08-21', lower: [conservative, safe] }}
          stale
        />
      </TooltipProvider>,
    )

    expect(screen.getAllByText('分級暫停')).toHaveLength(2)
    expect(screen.getByText('$48.42')).toBeInTheDocument()
  })
})
