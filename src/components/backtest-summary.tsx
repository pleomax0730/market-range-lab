import { GRADE_THRESHOLDS } from '../domain/model'
import type { BacktestResult, HorizonAnalysis } from '../domain/types'
import { TermHelp } from './term-help'
import { Tooltip } from './ui/tooltip'

const percent = new Intl.NumberFormat('zh-TW', {
  style: 'percent',
  maximumFractionDigits: 2,
})

function formatDate(value?: string) {
  return value?.replaceAll('-', '/')
}

function formatPeriods(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function historicalFrequencyStatus(result: BacktestResult, grade: 'conservative' | 'safe') {
  const threshold = GRADE_THRESHOLDS[grade]
  const expirationExceeded = result.expirationRate > threshold.expirationUpper95
  const pathTouchExceeded = result.pathTouchRate > threshold.pathTouchUpper95
  const label = expirationExceeded && pathTouchExceeded
    ? '兩項皆超標'
    : expirationExceeded
      ? '到期率超標'
      : pathTouchExceeded
        ? '週內觸及率超標'
        : '回測頻率達標'

  return {
    met: !expirationExceeded && !pathTouchExceeded,
    label,
    explanation: [
      `樣本外實際到期率 ${percent.format(result.expirationRate)}（目標不高於 ${percent.format(threshold.expirationUpper95)}）。`,
      `樣本外實際週內觸及率 ${percent.format(result.pathTouchRate)}（目標不高於 ${percent.format(threshold.pathTouchUpper95)}）。`,
      '這是歷史回測頻率校準，不等於目前候選價已通過單側 95% 證據認證。',
    ].join(' '),
  }
}

function RecoveryEvidence({ result }: { result: BacktestResult }) {
  const recovery = result.recovery
  if (!recovery) {
    return <p className="mt-3 text-xs text-[#6B7280]">這份資料尚無法追蹤履約後的價格路徑。</p>
  }
  if (recovery.assignmentEvents === 0) {
    return (
      <p className="mt-3 text-xs text-[#6B7280]">
        這段樣本沒有到期履約事件；代表未觀察到，不代表未來機率為零。
      </p>
    )
  }

  const unit = recovery.periodUnit === 'trading-session' ? '交易日' : '週'
  const sparse = recovery.assignmentEvents < 5
  return (
    <div className="mt-3 border-t border-[#EFEFEF] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">
          <TermHelp explanation="只計算到期收盤低於履約價的歷史案例。解套定義為後續收盤首次重新站上模型履約價；未扣除已收權利金、費用或稅。">
            回到履約價
          </TermHelp>
        </span>
        <span className={`text-xs ${sparse ? 'text-[#92400E]' : 'text-[#137A3D]'}`}>
          {sparse
            ? (
                <TermHelp explanation="少於 5 次到期履約時，解套時間只代表少數歷史案例，不能視為穩定的時間分布。">
                  低證據 · 僅 {recovery.assignmentEvents} 次履約
                </TermHelp>
              )
            : `${recovery.assignmentEvents} 次履約事件`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <span>
          中位數{' '}
          <strong className="num text-sm">
            {recovery.medianPeriods === undefined ? '—' : `${formatPeriods(recovery.medianPeriods)} ${unit}`}
          </strong>
          {recovery.medianCalendarDays === undefined ? '' : ` · 約 ${formatPeriods(recovery.medianCalendarDays)} 日`}
        </span>
        <span>
          已回復最長{' '}
          <strong className="num">
            {recovery.maximumPeriods === undefined ? '—' : `${formatPeriods(recovery.maximumPeriods)} ${unit}`}
          </strong>
        </span>
        <span>
          截至資料末仍未回復 <strong className="num">{recovery.unrecoveredEvents}/{recovery.assignmentEvents}</strong>
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-3 text-xs">
        {recovery.windows.map((window) => (
          <div key={window.periods}>
            <dt className="text-[#6B7280]">
              {window.periods}{recovery.periodUnit === 'trading-session' ? '日' : '週'}內
            </dt>
            <dd className="num mt-0.5 font-semibold">
              {window.eligibleAssignments
                ? `${percent.format(window.recoveryRate)} · ${window.recoveredAssignments}/${window.eligibleAssignments}`
                : '—'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-[#6B7280]">期限比例的分母只包含已回復或具有足夠後續觀察期的案例。</p>
    </div>
  )
}

function PutBacktestEvidence({
  label,
  grade,
  result,
}: {
  label: string
  grade: 'conservative' | 'safe'
  result: BacktestResult
}) {
  const status = historicalFrequencyStatus(result, grade)
  return (
    <article className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <h5 className="text-sm font-bold">Put · {label}</h5>
        <Tooltip content={status.explanation}>
          <span
            tabIndex={0}
            className={`${status.met ? 'risk-conservative' : 'risk-dangerous'} inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}
          >
            {status.label}
          </span>
        </Tooltip>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-[#6B7280]">
            <TermHelp explanation="每個樣本外週期的到期收盤低於當時模型 Put 履約價。它是到期履約的歷史代理事件，不包含提前指派。">
              到期履約
            </TermHelp>
          </dt>
          <dd className="num mt-0.5 text-base font-semibold">
            {percent.format(result.expirationRate)}
          </dd>
          <dd className="num text-[#6B7280]">{result.expirationBreaches}/{result.predictions}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">
            <TermHelp explanation="該週最低價曾低於當時模型 Put 履約價。盤中觸及不等於到期履約。">
              週內曾跌破
            </TermHelp>
          </dt>
          <dd className="num mt-0.5 text-base font-semibold">
            {percent.format(result.pathTouchRate)}
          </dd>
          <dd className="num text-[#6B7280]">{result.pathTouchBreaches}/{result.predictions}</dd>
        </div>
      </dl>
      <RecoveryEvidence result={result} />
    </article>
  )
}

export function BacktestSummary({ analysis }: { analysis: Pick<HorizonAnalysis, 'weeks' | 'backtest'> }) {
  if (analysis.weeks > 4) return null
  if (!analysis.backtest) {
    return (
      <div className="mt-4 border-t border-[#EFEFEF] pt-3 text-xs text-[#6B7280]">
        <TermHelp explanation="樣本外回測每次只能使用該歷史日期以前的路徑。至少需要 500 條訓練路徑，否則 0.5% 尾部幾乎沒有可供校準的事件。">
          歷史實戰驗證
        </TermHelp>{' '}
        尚無足夠路徑（需要超過 500 條）。
      </div>
    )
  }

  const backtest = analysis.backtest
  const predictions = backtest.lower.safe.predictions
  const period = backtest.predictionStartDate && backtest.predictionEndDate
    ? `${formatDate(backtest.predictionStartDate)}–${formatDate(backtest.predictionEndDate)}`
    : undefined
  const callEntries = [
    { label: '安全', grade: 'safe' as const, result: backtest.upper.safe },
    { label: '保守', grade: 'conservative' as const, result: backtest.upper.conservative },
  ]

  return (
    <section className="mt-4 border-t border-[#EFEFEF] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold">
            <TermHelp explanation="Expanding-window 樣本外回測：每個歷史時點只使用更早的至少 500 條路徑估計界線，再檢查下一條真實路徑。這比把完整歷史反覆套回自己更接近實際使用。">
              歷史實戰驗證
            </TermHelp>
          </h4>
          <p className="mt-1 text-xs text-[#6B7280]">先看 Put 的履約、週內跌破與資金可能受困時間。</p>
        </div>
        <span className="text-right text-xs text-[#6B7280]">
          {predictions} 次樣本外預測{period ? ` · ${period}` : ''}
        </span>
      </div>

      <div className="mt-3 grid divide-y divide-[#E5E5E5] border-y border-[#E5E5E5] md:grid-cols-2 md:divide-x md:divide-y-0">
        <PutBacktestEvidence label="保守" grade="conservative" result={backtest.lower.conservative} />
        <PutBacktestEvidence label="安全" grade="safe" result={backtest.lower.safe} />
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer select-none font-semibold text-[#565656] outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          查看 Call 的樣本外結果
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {callEntries.map((entry) => {
            const status = historicalFrequencyStatus(entry.result, entry.grade)
            return (
              <div key={entry.grade} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#EFEFEF] py-2">
                <span className="font-semibold">Call · {entry.label}</span>
                <span className="num">
                  到期 {percent.format(entry.result.expirationRate)} · 觸及 {percent.format(entry.result.pathTouchRate)}
                </span>
                <Tooltip content={status.explanation}>
                  <span
                    tabIndex={0}
                    className={`${status.met ? 'text-[#137A3D]' : 'text-[#B42318]'} whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}
                  >
                    {status.label}
                  </span>
                </Tooltip>
              </div>
            )
          })}
        </div>
      </details>
    </section>
  )
}
