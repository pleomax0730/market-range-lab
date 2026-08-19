import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CandidateAnalysis } from '../domain/analysis-report'
import { CandidateRecoveryPanel } from './candidate-recovery-panel'
import { TooltipProvider } from './ui/tooltip'

const windows = [5, 20, 60].map((periods) => ({
  periods,
  eligibleAssignments: 20,
  effectiveEligibleAssignments: 8,
  recoveredAssignments: periods === 5 ? 5 : 15,
  recoveryRate: periods === 5 ? 0.25 : 0.75,
  lower95: 0.1,
  upper95: 0.9,
}))

const candidate: CandidateAnalysis = {
  targetDate: '2026-07-24',
  weeks: 1,
  tradingSessions: 4,
  price: 67,
  side: 'lower',
  netPremiumPerShare: 1.25,
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
  recovery: {
    method: 'full-history replay',
    sampleSize: 850,
    effectiveSampleSize: 310,
    moneyness: 0.94,
    assignmentEvents: 120,
    effectiveAssignmentEvents: 43.76,
    historicalAssignmentRate: 120 / 850,
    historicalAssignmentLower95: 0.1,
    historicalAssignmentUpper95: 0.19,
    evidence: 'sufficient',
    strikeRecovery: {
      estimator: 'kaplan-meier',
      periodUnit: 'trading-session',
      assignmentEvents: 120,
      effectiveAssignmentEvents: 43.76,
      recoveredEvents: 90,
      unrecoveredEvents: 30,
      medianPeriods: 20,
      maximumPeriods: 240,
      medianCalendarDays: 28,
      maximumCalendarDays: 340,
      windows,
    },
    breakEven: {
      netPremiumPerShare: 1.25,
      premiumRate: 1.25 / 67,
      currentBreakEvenPrice: 65.75,
      recovery: {
        estimator: 'kaplan-meier',
        periodUnit: 'trading-session',
        assignmentEvents: 120,
        effectiveAssignmentEvents: 43.76,
        recoveredEvents: 100,
        unrecoveredEvents: 20,
        medianPeriods: 5,
        p75Periods: 20,
        maximumPeriods: 180,
        medianCalendarDays: 7,
        p75CalendarDays: 28,
        maximumCalendarDays: 250,
        windows,
      },
    },
  },
  recoveryFrontier: {
    method: 'frontier test',
    periodUnit: 'trading-session',
    deadlinePeriods: 30,
    settings: {
      target: 'break-even',
      deadlineIndex: 3,
      minimumRecoveryRate: 0.75,
      minimumLower95: 0.6,
      minimumEffectiveAssignments: 20,
      minimumMoneyness: 0.7,
      maximumMoneyness: 1,
      stepMoneyness: 0.005,
    },
    points: [
      {
        price: 55,
        targetPrice: 54,
        moneyness: 0.77,
        assignmentEvents: 40,
        effectiveAssignmentEvents: 22,
        historicalAssignmentRate: 0.05,
        evidence: 'sufficient',
        recovery: { ...windows[1], periods: 30, recoveryRate: 0.82, lower95: 0.65 },
        qualifies: true,
      },
      {
        price: 62,
        targetPrice: 60.84,
        moneyness: 0.87,
        assignmentEvents: 58,
        effectiveAssignmentEvents: 31,
        historicalAssignmentRate: 0.07,
        evidence: 'sufficient',
        recovery: { ...windows[1], periods: 30, recoveryRate: 0.79, lower95: 0.62 },
        qualifies: true,
      },
      {
        price: 67,
        targetPrice: 65.75,
        moneyness: 0.94,
        assignmentEvents: 120,
        effectiveAssignmentEvents: 43.76,
        historicalAssignmentRate: 120 / 850,
        evidence: 'sufficient',
        recovery: { ...windows[1], periods: 30, recoveryRate: 0.68, lower95: 0.54 },
        qualifies: false,
      },
    ],
    intervals: [{
      minimumPrice: 55,
      maximumPrice: 62,
      minimumMoneyness: 0.77,
      maximumMoneyness: 0.87,
      pointCount: 2,
    }],
  },
}

afterEach(cleanup)

describe('CandidateRecoveryPanel', () => {
  it('shows transparent assignment evidence and both recovery targets', () => {
    render(
      <TooltipProvider>
        <CandidateRecoveryPanel
          candidate={candidate}
          netPremiumPerShare="1.25"
          onNetPremiumPerShareChange={() => undefined}
          dataLastDate="2026-07-22"
          historyStale
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('歷史履約後價格回復')).toBeInTheDocument()
    expect(screen.getByText(/120\/850/)).toBeInTheDocument()
    expect(screen.getByText(/有效約 43.8 次/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '回到履約價' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '回到損益兩平價' })).toBeInTheDocument()
    expect(screen.getAllByText('$65.75')).not.toHaveLength(0)
    expect(screen.getByRole('heading', { name: '歷史回復支持區間' })).toBeInTheDocument()
    expect(screen.getByText('$55.00–$62.00')).toBeInTheDocument()
    expect(screen.getByText(/30 個交易日內/)).toBeInTheDocument()
    expect(screen.getByLabelText('回復期限')).toHaveValue('3')
    expect(screen.getByLabelText('最低歷史回復率')).toHaveValue(75)
    expect(screen.getByText('符合')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('歷史資料未更新')
  })

  it('validates that net premium is below the strike', async () => {
    const user = userEvent.setup()
    function ControlledPanel() {
      const [premium, setPremium] = useState('')
      return (
        <CandidateRecoveryPanel
          candidate={{ ...candidate, netPremiumPerShare: undefined }}
          netPremiumPerShare={premium}
          onNetPremiumPerShareChange={setPremium}
          dataLastDate="2026-07-22"
          historyStale={false}
        />
      )
    }
    render(<TooltipProvider><ControlledPanel /></TooltipProvider>)

    await user.type(screen.getByLabelText('每股淨 Premium（選填）'), '67')
    expect(screen.getByText('Premium 必須低於履約價。')).toBeInTheDocument()
  })

  it('explains missing Put evidence instead of hiding the section', () => {
    render(
      <TooltipProvider>
        <CandidateRecoveryPanel
          candidate={{ ...candidate, recovery: undefined }}
          netPremiumPerShare=""
          onNetPremiumPerShareChange={() => undefined}
          dataLastDate="2026-07-22"
          historyStale={false}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('歷史履約後價格回復')).toBeInTheDocument()
    expect(screen.getByText(/目前無法估計履約後的價格回復/)).toBeInTheDocument()
  })
})
