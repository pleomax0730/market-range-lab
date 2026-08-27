import type { HorizonAnalysis, RiskSide } from '../domain/types'
import { RiskGradeBadge } from './risk-grade-badge'
import { AnimatedNumber } from './ui/animated-number'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const percent = new Intl.NumberFormat('zh-TW', {
  style: 'percent',
  maximumFractionDigits: 2,
})

function DecisionStatus({ row, stale }: { row: RiskSide; stale: boolean }) {
  if (stale) {
    return <span className="risk-insufficient inline-flex rounded px-2 py-1 text-xs font-bold">分級暫停</span>
  }
  if (row.basis === 'model-estimate') {
    const label = row.grade === 'safe'
      ? '保守模型 · 安全認證'
      : row.grade === 'dangerous'
        ? '保守模型 · 超出安全'
        : '保守模型 · 未認證'
    return <span className="risk-insufficient inline-flex rounded px-2 py-1 text-xs font-bold">{label}</span>
  }
  if (row.meetsTarget === false) {
    return <span className="risk-insufficient inline-flex rounded px-2 py-1 text-xs font-bold">門檻不可達</span>
  }
  return <RiskGradeBadge grade={row.grade} />
}

export function PutDecisionSummary({
  analysis,
  stale,
}: {
  analysis: Pick<HorizonAnalysis, 'tradingSessions' | 'targetDate' | 'lower'>
  stale: boolean
}) {
  const entries = [
    { label: '保守', row: analysis.lower[0] },
    { label: '安全', row: analysis.lower[1] },
    { label: '激進', row: analysis.lower[2] },
  ].filter((entry): entry is { label: string; row: RiskSide } => Boolean(entry.row))

  if (!entries.length) return null

  return (
    <section aria-labelledby="put-decision-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="put-decision-heading" className="text-sm font-bold">Put 決策價格</h3>
        <span className="num text-xs text-[#6B7280]">{analysis.tradingSessions} 交易日 · 到期 {analysis.targetDate}</span>
      </div>
      <div className="grid divide-y divide-[#E5E5E5] border-y border-[#E5E5E5] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {entries.map(({ label, row }) => {
          const unavailable = row.meetsTarget === false && row.basis !== 'model-estimate'
          return (
            <article key={label} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold">Put · {label}</h4>
                <DecisionStatus row={row} stale={stale} />
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <AnimatedNumber as="strong" className="text-2xl font-bold" value={unavailable ? '—' : money.format(row.price)} />
                {!unavailable && <AnimatedNumber className="text-xs text-[#565656]" value={percent.format(row.returnPct)} />}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-[#6B7280]">到期穿越</dt>
                  <dd className="num mt-0.5 font-semibold">{percent.format(row.expirationBreach)}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">期間觸及</dt>
                  <dd className="num mt-0.5 font-semibold">{percent.format(row.pathTouch)}</dd>
                </div>
              </dl>
            </article>
          )
        })}
      </div>
    </section>
  )
}
