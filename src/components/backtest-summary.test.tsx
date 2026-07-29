import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HorizonBacktest } from '../domain/types'
import { BacktestSummary } from './backtest-summary'
import { TooltipProvider } from './ui/tooltip'

const backtest: HorizonBacktest = {
  method: 'Expanding-window out-of-sample quantile backtest',
  minimumTrainingPaths: 500,
  predictionStartDate: '2020-09-21',
  predictionEndDate: '2026-07-13',
  lower: {
    conservative: {
      predictions: 273,
      expirationBreaches: 0,
      expirationRate: 0,
      pathTouchBreaches: 0,
      pathTouchRate: 0,
      recovery: {
        estimator: 'kaplan-meier',
        periodUnit: 'trading-session',
        assignmentEvents: 0,
        effectiveAssignmentEvents: 0,
        recoveredEvents: 0,
        unrecoveredEvents: 0,
        windows: [5, 20, 60].map((periods) => ({
          periods,
          eligibleAssignments: 0,
          recoveredAssignments: 0,
          recoveryRate: 0,
        })),
      },
    },
    safe: {
      predictions: 273,
      expirationBreaches: 2,
      expirationRate: 2 / 273,
      pathTouchBreaches: 4,
      pathTouchRate: 4 / 273,
      recovery: {
        estimator: 'kaplan-meier',
        periodUnit: 'trading-session',
        assignmentEvents: 2,
        effectiveAssignmentEvents: 2,
        recoveredEvents: 2,
        unrecoveredEvents: 0,
        medianPeriods: 2,
        p75Periods: 2.5,
        maximumPeriods: 3,
        medianCalendarDays: 4,
        p75CalendarDays: 4.5,
        maximumCalendarDays: 5,
        windows: [5, 20, 60].map((periods) => ({
          periods,
          eligibleAssignments: 2,
          recoveredAssignments: 2,
          recoveryRate: 1,
        })),
      },
    },
  },
  upper: {
    conservative: {
      predictions: 273,
      expirationBreaches: 0,
      expirationRate: 0,
      pathTouchBreaches: 1,
      pathTouchRate: 1 / 273,
    },
    safe: {
      predictions: 273,
      expirationBreaches: 4,
      expirationRate: 4 / 273,
      pathTouchBreaches: 5,
      pathTouchRate: 5 / 273,
    },
  },
}

describe('BacktestSummary', () => {
  it('prioritizes Put assignment and recovery evidence', () => {
    render(
      <TooltipProvider>
        <BacktestSummary analysis={{ weeks: 1, backtest }} />
      </TooltipProvider>,
    )

    expect(screen.getByText('273 次樣本外預測 · 2020/09/21–2026/07/13')).toBeInTheDocument()
    expect(screen.getByText('Put · 保守')).toBeInTheDocument()
    expect(screen.getByText('Put · 安全')).toBeInTheDocument()
    expect(screen.getByText('0.73%')).toBeInTheDocument()
    expect(screen.getByText('2 交易日')).toBeInTheDocument()
    expect(screen.getAllByText((_content, element) =>
      element?.textContent === '低證據 · 原始 2 次 · 有效約 2.0 次',
    )).toHaveLength(2)
    expect(screen.getByText('截至資料末尚未回復')).toBeInTheDocument()
    expect(screen.getAllByText('回測頻率達標')).toHaveLength(4)
  })

  it.each([
    { expirationRate: 0.006, pathTouchRate: 0.005, label: '到期率超標' },
    { expirationRate: 0.004, pathTouchRate: 0.011, label: '週內觸及率超標' },
    { expirationRate: 0.006, pathTouchRate: 0.011, label: '兩項皆超標' },
  ])('states which conservative Put frequency exceeded its target: $label', ({ expirationRate, pathTouchRate, label }) => {
    const result: HorizonBacktest = {
      ...backtest,
      lower: {
        ...backtest.lower,
        conservative: {
          ...backtest.lower.conservative,
          expirationRate,
          pathTouchRate,
        },
      },
    }

    render(
      <TooltipProvider>
        <BacktestSummary analysis={{ weeks: 1, backtest: result }} />
      </TooltipProvider>,
    )

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
