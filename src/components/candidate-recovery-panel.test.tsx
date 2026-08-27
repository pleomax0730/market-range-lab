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
      customWindow: {
        periods: 25,
        eligibleAssignments: 100,
        effectiveEligibleAssignments: 36.47,
        recoveredAssignments: 78,
        recoveryRate: 0.78,
        lower95: 0.62,
        upper95: 0.88,
      },
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
        customWindow: {
          periods: 25,
          eligibleAssignments: 100,
          effectiveEligibleAssignments: 36.47,
          recoveredAssignments: 85,
          recoveryRate: 0.85,
          lower95: 0.7,
          upper95: 0.93,
        },
      },
    },
  },
  recoveryThroughDate: '2026-08-30',
  recoveryThroughSessionDate: '2026-08-28',
  recoveryWindowPeriods: 25,
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
          recoveryThroughDate="2026-08-30"
          onRecoveryThroughDateChange={() => undefined}
          dataLastDate="2026-07-22"
          historyStale
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('接股後回本分析')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '接股後 25 個交易日內回本' })).toBeInTheDocument()
    expect(screen.getByText((_, element) => (
      element?.tagName === 'P' &&
      element.textContent?.includes('85 次在期限內收盤回到目標價') === true
    ))).toBeInTheDocument()
    expect(screen.getByText('回到損益兩平價 $65.75')).toBeInTheDocument()
    expect(screen.getByText(/120\/850/)).toBeInTheDocument()
    expect(screen.getByText(/有效約 43.8 次/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '履約價（未計 Premium）' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '損益兩平價（實際回本）' })).toBeInTheDocument()
    expect(screen.getByText('$65.75')).toBeInTheDocument()
    expect(screen.getAllByText(/以 2026-08-28 收盤為準/)).toHaveLength(2)
    expect(screen.getByText('查看完整回本統計')).toBeInTheDocument()
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
          recoveryThroughDate=""
          onRecoveryThroughDateChange={() => undefined}
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
          recoveryThroughDate=""
          onRecoveryThroughDateChange={() => undefined}
          dataLastDate="2026-07-22"
          historyStale={false}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('接股後回本分析')).toBeInTheDocument()
    expect(screen.getByText(/目前無法估計接股後的回本時間/)).toBeInTheDocument()
  })
})
