import { ChevronDown } from 'lucide-react'
import type { CandidateAnalysis } from '../domain/analysis-report'
import type { AssignmentRecoverySummary } from '../domain/types'
import { Input } from './ui/input'
import { TermHelp } from './term-help'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const percent = new Intl.NumberFormat('zh-TW', {
  style: 'percent',
  maximumFractionDigits: 2,
})

function formatPeriods(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function periodUnit(recovery: AssignmentRecoverySummary) {
  return recovery.periodUnit === 'trading-session' ? '個交易日' : '週'
}

function durationLabel(
  value: number | undefined,
  recovery: AssignmentRecoverySummary,
) {
  if (value === undefined) return '截至資料末未達'
  return `${formatPeriods(value)} ${periodUnit(recovery)}`
}

function RecoveryTargetDetails({
  title,
  targetPrice,
  recovery,
  customThroughDate,
  customThroughSessionDate,
}: {
  title: string
  targetPrice: number
  recovery: AssignmentRecoverySummary
  customThroughDate?: string
  customThroughSessionDate?: string
}) {
  const hasAssignments = recovery.assignmentEvents > 0
  const customWindow = recovery.customWindow
  const otherWindows = recovery.windows.filter(
    (window) => !customWindow || window.periods !== customWindow.periods,
  )

  return (
    <section className="min-w-0 py-4 lg:px-4 lg:first:pl-0 lg:last:pr-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold">{title}</h4>
        <span className="num text-sm font-semibold">{money.format(targetPrice)}</span>
      </div>
      {!hasAssignments ? (
        <p className="mt-3 text-xs leading-5 text-[#6B7280]">
          沒有歷史接股代理事件，無法估計回復時間；未觀察到不代表未來不會發生。
        </p>
      ) : (
        <>
          {customWindow && customThroughDate && (
            <dl className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y border-[#E5E5E5] py-3 text-xs">
              <div className="min-w-0">
                <dt className="font-semibold text-[#565656]">選定期限</dt>
                <dd className="mt-0.5 text-[#6B7280]">
                  截至 {customThroughDate}
                  {customThroughSessionDate && customThroughSessionDate !== customThroughDate
                    ? `（以 ${customThroughSessionDate} 收盤為準）`
                    : ''}
                </dd>
              </div>
              <div className="text-right">
                <dd className="num text-base font-bold text-[#0D0D0D]">
                  {customWindow.eligibleAssignments
                    ? percent.format(customWindow.recoveryRate)
                    : '—'}
                </dd>
                <dd className="num text-[#6B7280]">
                  {customWindow.eligibleAssignments
                    ? `${customWindow.recoveredAssignments}/${customWindow.eligibleAssignments} 次`
                    : '歷史案例沒有足夠追蹤期'}
                </dd>
              </div>
            </dl>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[#6B7280]">
                <TermHelp explanation="Kaplan–Meier 中位回復時間：保留截至資料末仍未回復的案例；約一半歷史接股案例回到目標價所需時間。">
                  典型回復時間
                </TermHelp>
              </dt>
              <dd className="num mt-1 font-semibold">
                {durationLabel(recovery.medianPeriods, recovery)}
              </dd>
              {recovery.medianCalendarDays !== undefined && (
                <dd className="num text-[#6B7280]">約 {formatPeriods(recovery.medianCalendarDays)} 日</dd>
              )}
            </div>
            <div>
              <dt className="text-[#6B7280]">
                <TermHelp explanation="Kaplan–Meier 第 75 百分位：約 75% 歷史接股案例已回到目標價所需時間。若資料期間尚未達 75%，就顯示未達。">
                  75% 案例回復
                </TermHelp>
              </dt>
              <dd className="num mt-1 font-semibold">
                {durationLabel(recovery.p75Periods, recovery)}
              </dd>
              {recovery.p75CalendarDays !== undefined && (
                <dd className="num text-[#6B7280]">約 {formatPeriods(recovery.p75CalendarDays)} 日</dd>
              )}
            </div>
            <div>
              <dt className="text-[#6B7280]">已回復案例中最久</dt>
              <dd className="num mt-1 font-semibold">
                {recovery.maximumPeriods === undefined
                  ? '—'
                  : durationLabel(recovery.maximumPeriods, recovery)}
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">截至資料末未回復</dt>
              <dd className="num mt-1 font-semibold">
                {recovery.unrecoveredEvents}/{recovery.assignmentEvents} 次
              </dd>
            </div>
          </dl>

          {otherWindows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-[#565656]">其他觀察期間</p>
              <dl className="mt-2 grid grid-cols-3 border-y border-[#E5E5E5] text-xs">
                {otherWindows.map((window, index) => (
                  <div
                    key={window.periods}
                    className={`${index > 0 ? 'border-l border-[#E5E5E5]' : ''} min-w-0 px-2 py-3 sm:px-3`}
                  >
                    <dt className="text-[#6B7280]">
                      {window.periods}{recovery.periodUnit === 'trading-session' ? '日' : '週'}內回復
                    </dt>
                    <dd className="num mt-1 font-semibold">
                      {window.eligibleAssignments
                        ? (
                            <TermHelp explanation={`原始 ${window.recoveredAssignments}/${window.eligibleAssignments}；重疊路徑修正後有效分母約 ${window.effectiveEligibleAssignments?.toFixed(1) ?? '—'}。近似雙側 95% 區間 ${window.lower95 === undefined ? '—' : percent.format(window.lower95)}–${window.upper95 === undefined ? '—' : percent.format(window.upper95)}。`}>
                              {percent.format(window.recoveryRate)}
                            </TermHelp>
                          )
                        : '—'}
                    </dd>
                    <dd className="num truncate text-[#6B7280]">
                      {window.eligibleAssignments
                        ? `${window.recoveredAssignments}/${window.eligibleAssignments}`
                        : '無足夠追蹤期'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function evidenceLabel(candidate: CandidateAnalysis) {
  const recovery = candidate.recovery
  if (!recovery) return ''
  if (recovery.evidence === 'none') return '無可估計事件'
  if (recovery.evidence === 'low') return '低證據'
  if (recovery.evidence === 'limited') return '有限證據'
  return '證據充足'
}

export function CandidateRecoveryPanel({
  candidate,
  netPremiumPerShare,
  onNetPremiumPerShareChange,
  recoveryThroughDate,
  onRecoveryThroughDateChange,
  recoveryDateError,
  dataLastDate,
  historyStale,
  intraday = false,
}: {
  candidate: CandidateAnalysis
  netPremiumPerShare: string
  onNetPremiumPerShareChange: (value: string) => void
  recoveryThroughDate: string
  onRecoveryThroughDateChange: (value: string) => void
  recoveryDateError?: string
  dataLastDate: string
  historyStale: boolean
  intraday?: boolean
}) {
  if (candidate.side !== 'lower') return null
  if (!candidate.recovery) {
    return (
      <section className="col-span-2 mt-1 border-t border-[#E5E5E5] pt-4 lg:col-span-4">
        <h3 className="text-sm font-bold">接股後回本分析</h3>
        <p className="mt-2 text-xs leading-5 text-[#6B7280]">
          沒有足夠的同星期幾、同交易日跨度歷史路徑，目前無法估計接股後的回本時間。
        </p>
      </section>
    )
  }

  const recovery = candidate.recovery
  const premiumTrimmed = netPremiumPerShare.trim()
  const parsedPremium = Number(netPremiumPerShare)
  const premiumValid = !premiumTrimmed || (
    Number.isFinite(parsedPremium) &&
    parsedPremium >= 0 &&
    parsedPremium < candidate.price
  )
  const breakEvenMatchesInput = Boolean(
    premiumTrimmed &&
    premiumValid &&
    recovery.breakEven &&
    recovery.breakEven.netPremiumPerShare === parsedPremium,
  )
  const evidenceTone = recovery.evidence === 'none'
    ? 'text-[#6B7280]'
    : recovery.evidence === 'low' || recovery.evidence === 'limited'
      ? 'text-[#92400E]'
      : 'text-[#137A3D]'
  const customWindowMatchesInput = Boolean(
    recoveryThroughDate &&
    candidate.recoveryThroughDate === recoveryThroughDate &&
    candidate.recoveryWindowPeriods,
  )
  const primaryRecovery = breakEvenMatchesInput && recovery.breakEven
    ? recovery.breakEven.recovery
    : recovery.strikeRecovery
  const primaryTargetPrice = breakEvenMatchesInput && recovery.breakEven
    ? recovery.breakEven.currentBreakEvenPrice
    : candidate.price
  const primaryTargetLabel = breakEvenMatchesInput
    ? '損益兩平價'
    : '履約價'
  const primaryWindow = customWindowMatchesInput
    ? primaryRecovery.customWindow
    : undefined
  const observedAssignments = primaryWindow?.eligibleAssignments ?? 0
  const recoveredAssignments = primaryWindow?.recoveredAssignments ?? 0
  const insufficientFollowUp = primaryWindow
    ? Math.max(0, recovery.assignmentEvents - primaryWindow.eligibleAssignments)
    : 0
  const notRecoveredInWindow = primaryWindow
    ? Math.max(0, primaryWindow.eligibleAssignments - primaryWindow.recoveredAssignments)
    : 0

  return (
    <section className="col-span-2 mt-1 border-t border-[#E5E5E5] pt-4 lg:col-span-4">
      <div>
        <h3 className="text-sm font-bold">
          <TermHelp explanation="先用目前候選 Put 的履約價／當前價比例，找出歷史上到期收盤低於等值履約價的接股代理案例，再追蹤後續收盤首次回到目標價的時間。">
            接股後回本分析
          </TermHelp>
        </h3>
        <p className="mt-1 text-xs leading-5 text-[#6B7280]">
          先看歷史接股比例，再看接股後在指定期限內回到目標價的機率。
        </p>
      </div>

      <div className="mt-4 grid items-start gap-4 border-y border-[#EFEFEF] py-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <p className="max-w-xl text-xs leading-5 text-[#6B7280]">
          輸入 Premium 後使用真正的損益兩平價；選擇觀察日期後，估計已接股案例在期限內回本的比例。
        </p>
        <label className="w-full">
          <span className="field-label">
            <TermHelp explanation="輸入券商顯示、扣除預估費用後的每股淨權利金。歷史回放會按 Premium／履約價比例縮放，不把今天的絕對美元直接套到過去。">
              每股淨 Premium（選填）
            </TermHelp>
          </span>
          <Input
            className="num"
            type="number"
            min="0"
            step="0.01"
            aria-label="每股淨 Premium（選填）"
            placeholder="例如 1.25"
            value={netPremiumPerShare}
            onChange={(event) => onNetPremiumPerShareChange(event.target.value)}
          />
          {!premiumValid && (
            <small className="mt-1 block text-xs text-red-700">
              {!Number.isFinite(parsedPremium) || parsedPremium < 0
                ? 'Premium 必須是非負數。'
                : 'Premium 必須低於履約價。'}
            </small>
          )}
        </label>
        <label className="w-full">
          <span className="field-label">
            <TermHelp explanation="選擇到期日之後的日期。系統會換算成到期後第幾個交易日，再估計已接股案例在該期限內收盤回到履約價或損益兩平價的比例。休市日以前一個正常交易日為準。">
              回本觀察截止日（ET）
            </TermHelp>
          </span>
          <Input
            className="num"
            type="date"
            min={nextCalendarDate(candidate.targetDate)}
            aria-label="回本觀察截止日（ET）"
            aria-invalid={Boolean(recoveryDateError)}
            value={recoveryThroughDate}
            onChange={(event) => onRecoveryThroughDateChange(event.target.value)}
          />
          {recoveryDateError ? (
            <small className="mt-1 block text-xs text-red-700">{recoveryDateError}</small>
          ) : customWindowMatchesInput ? (
            <small className="mt-1 block text-xs text-[#6B7280]">
              到期後 {candidate.recoveryWindowPeriods} {periodUnit(recovery.strikeRecovery)}
            </small>
          ) : (
            <small className="mt-1 block text-xs text-[#6B7280]">選擇日期後顯示期限內回本機率。</small>
          )}
        </label>
      </div>

      {(historyStale || candidate.result.grade === 'insufficient') && (
        <p role="alert" className="mt-3 border-l border-amber-500 pl-3 text-xs leading-5 text-[#6B4F00]">
          {historyStale ? '歷史資料未更新。' : '風險分級目前暫停。'} 歷史資料截至 {dataLastDate}；可查看價格回復統計，但不是最新市場預測。
        </p>
      )}

      {primaryWindow ? (
        <div className="mt-4 border-y border-[#D8E6F8] bg-[#F6FAFF] px-4 py-5 sm:px-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,1.1fr)] lg:items-center">
            <div>
              <h4 className="text-sm font-semibold text-[#1859A9]">
                接股後 {candidate.recoveryWindowPeriods} {periodUnit(primaryRecovery)}內回本
              </h4>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="num text-4xl font-bold tracking-[-0.03em] text-[#0D0D0D]">
                  <TermHelp explanation={`這是條件機率：只看歷史上到期收盤低於等值履約價、且有足夠後續資料的接股代理案例。近似雙側 95% 區間為 ${primaryWindow.lower95 === undefined ? '—' : percent.format(primaryWindow.lower95)}–${primaryWindow.upper95 === undefined ? '—' : percent.format(primaryWindow.upper95)}。`}>
                    {percent.format(primaryWindow.recoveryRate)}
                  </TermHelp>
                </span>
                <span className="text-sm text-[#565656]">回到{primaryTargetLabel} {money.format(primaryTargetPrice)}</span>
              </div>
            </div>
            <div className="text-sm leading-6 text-[#374151] lg:border-l lg:border-[#D8E6F8] lg:pl-6">
              <p>
                歷史上 {observedAssignments} 次有足夠後續資料的接股案例中，
                <strong className="num text-[#0D0D0D]">{recoveredAssignments} 次</strong>
                在期限內收盤回到目標價。
              </p>
              {!breakEvenMatchesInput && (
                <p className="mt-1 text-xs text-[#6B4F00]">
                  尚未輸入有效 Premium；目前顯示的是回到履約價，不是真正損益兩平。
                </p>
              )}
            </div>
          </div>

          <ol className="mt-5 grid border-t border-[#D8E6F8] pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <li className="min-w-0 py-2 sm:pr-4">
              <p className="text-[#6B7280]">相似歷史路徑</p>
              <p className="num mt-1 text-lg font-bold">{recovery.sampleSize} 次</p>
            </li>
            <li className="min-w-0 border-t border-[#D8E6F8] py-2 sm:border-l sm:border-t-0 sm:px-4">
              <p className="text-[#6B7280]">
                <TermHelp explanation="只把到期收盤低於歷史等值履約價視為接股代理事件；不包含提前指派。">
                  到期接股代理
                </TermHelp>
              </p>
              <p className="num mt-1 text-lg font-bold">{recovery.assignmentEvents} 次</p>
              <p className="num text-[#6B7280]">{percent.format(recovery.historicalAssignmentRate)}</p>
            </li>
            <li className="min-w-0 border-t border-[#D8E6F8] py-2 sm:border-t-0 sm:pr-4 lg:border-l lg:px-4">
              <p className="text-[#6B7280]">有足夠追蹤資料</p>
              <p className="num mt-1 text-lg font-bold">{observedAssignments} 次</p>
              {insufficientFollowUp > 0 && (
                <p className="num text-[#6B7280]">{insufficientFollowUp} 次追蹤期不足</p>
              )}
            </li>
            <li className="min-w-0 border-t border-[#D8E6F8] py-2 sm:border-l sm:border-t-0 sm:pl-4">
              <p className="text-[#6B7280]">期限內回本</p>
              <p className="num mt-1 text-lg font-bold">{recoveredAssignments} 次</p>
              <p className="num text-[#6B7280]">{notRecoveredInWindow} 次未回本</p>
            </li>
          </ol>
        </div>
      ) : (
        <div className="mt-4 border-y border-[#E5E5E5] py-5">
          <p className="text-sm font-semibold">選擇回本觀察截止日，即可查看指定期限的結果。</p>
          <p className="mt-1 text-xs leading-5 text-[#6B7280]">
            歷史 {recovery.sampleSize} 次相似路徑中，有 {recovery.assignmentEvents} 次到期接股代理事件（{percent.format(recovery.historicalAssignmentRate)}）。
          </p>
        </div>
      )}

      <details className="group mt-4 border-t border-[#E5E5E5]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-semibold">查看完整回本統計</span>
            <span className="mt-0.5 block text-xs font-normal text-[#6B7280]">典型等待時間、95% 區間與其他觀察期間</span>
          </span>
          <ChevronDown className="shrink-0 text-[#6B7280] transition-transform duration-150 group-open:rotate-180" size={16} />
        </summary>
        <div className="grid gap-x-6 divide-y divide-[#E5E5E5] border-t border-[#EFEFEF] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {breakEvenMatchesInput && recovery.breakEven && (
            <RecoveryTargetDetails
              title="損益兩平價（實際回本）"
              targetPrice={recovery.breakEven.currentBreakEvenPrice}
              recovery={recovery.breakEven.recovery}
              customThroughDate={customWindowMatchesInput ? candidate.recoveryThroughDate : undefined}
              customThroughSessionDate={customWindowMatchesInput ? candidate.recoveryThroughSessionDate : undefined}
            />
          )}
          <RecoveryTargetDetails
            title="履約價（未計 Premium）"
            targetPrice={candidate.price}
            recovery={recovery.strikeRecovery}
            customThroughDate={customWindowMatchesInput ? candidate.recoveryThroughDate : undefined}
            customThroughSessionDate={customWindowMatchesInput ? candidate.recoveryThroughSessionDate : undefined}
          />
        </div>
        <div className="border-t border-[#EFEFEF] py-3 text-xs leading-5 text-[#6B7280]">
          <p className="num">
            <TermHelp explanation={`原始歷史接股率使用未做當前波動放大的實際價格路徑。有效樣本修正後的近似雙側 95% 區間為 ${percent.format(recovery.historicalAssignmentLower95)}–${percent.format(recovery.historicalAssignmentUpper95)}。`}>
              原始歷史接股 {recovery.assignmentEvents}/{recovery.sampleSize} 次 · {percent.format(recovery.historicalAssignmentRate)}
            </TermHelp>
          </p>
          <p className={`mt-1 font-semibold ${evidenceTone}`}>
            {evidenceLabel(candidate)} · 重疊路徑修正後有效約 {recovery.effectiveAssignmentEvents.toFixed(1)} 次
          </p>
          <p className="mt-2">
            這是原始歷史重播{intraday ? '、盤中保守預覽' : ''}，未套用上方風險分級的當前波動放大，也不會產生「值得賣」的結論。
          </p>
        </div>
      </details>
    </section>
  )
}

function nextCalendarDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}
