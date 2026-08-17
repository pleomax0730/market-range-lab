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

function durationLabel(
  value: number | undefined,
  recovery: AssignmentRecoverySummary,
) {
  if (value === undefined) return '截至資料末未達'
  const unit = recovery.periodUnit === 'trading-session' ? '交易日' : '週'
  return `${formatPeriods(value)} ${unit}`
}

function RecoveryTarget({
  title,
  targetPrice,
  recovery,
}: {
  title: string
  targetPrice: number
  recovery: AssignmentRecoverySummary
}) {
  const hasAssignments = recovery.assignmentEvents > 0
  return (
    <section className="min-w-0 py-4 lg:px-4 lg:first:pl-0 lg:last:pr-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold">{title}</h4>
        <span className="num text-sm font-semibold">{money.format(targetPrice)}</span>
      </div>
      {!hasAssignments ? (
        <p className="mt-3 text-xs leading-5 text-[#6B7280]">
          沒有原始歷史履約事件，因此無法估計回復時間；未觀察到不代表未來不會發生。
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[#6B7280]">
                <TermHelp explanation="Kaplan–Meier 中位回復時間：把截至資料末仍未回復的右設限案例保留在估計中；約 50% 歷史履約案例回到目標價格所需時間。">
                  中位回復時間
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
                <TermHelp explanation="Kaplan–Meier 第 75 百分位：約 75% 歷史履約案例已回到目標價格所需時間。若資料期間尚未達 75%，就顯示未達。">
                  P75 回復時間
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
              <dt className="text-[#6B7280]">已回復最長</dt>
              <dd className="num mt-1 font-semibold">
                {recovery.maximumPeriods === undefined
                  ? '—'
                  : durationLabel(recovery.maximumPeriods, recovery)}
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">截至資料末尚未回復</dt>
              <dd className="num mt-1 font-semibold">
                {recovery.unrecoveredEvents}/{recovery.assignmentEvents}
              </dd>
            </div>
          </dl>
          <dl className="mt-4 grid grid-cols-3 border-y border-[#E5E5E5] text-xs">
            {recovery.windows.map((window, index) => (
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
  return ''
}

export function CandidateRecoveryPanel({
  candidate,
  netPremiumPerShare,
  onNetPremiumPerShareChange,
  dataLastDate,
  historyStale,
  intraday = false,
}: {
  candidate: CandidateAnalysis
  netPremiumPerShare: string
  onNetPremiumPerShareChange: (value: string) => void
  dataLastDate: string
  historyStale: boolean
  intraday?: boolean
}) {
  if (candidate.side !== 'lower') return null
  if (!candidate.recovery) {
    return (
      <section className="col-span-2 mt-1 border-t border-[#E5E5E5] pt-4 lg:col-span-4">
        <h3 className="text-sm font-bold">歷史履約後價格回復</h3>
        <p className="mt-2 text-xs leading-5 text-[#6B7280]">
          沒有足夠的同星期幾、同交易日跨度原始歷史路徑，目前無法估計履約後的價格回復。
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
  const evidencePrefix = evidenceLabel(candidate)

  return (
    <section className="col-span-2 mt-1 border-t border-[#E5E5E5] pt-4 lg:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">
            <TermHelp explanation="用目前候選 Put 的履約價／當前價比例，映射到同星期幾、同交易日跨度的完整原始歷史。只把到期收盤低於歷史等值履約價視為履約，再追蹤後續收盤首次回到目標價格。">
              歷史履約後價格回復
            </TermHelp>
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#6B7280]">
            原始歷史重播{intraday ? ' · 盤中保守預覽' : ''}，未套用上方風險分級的當前波動放大。
          </p>
        </div>
        <div className="text-right text-xs text-[#565656]">
          <div className="num">
            <TermHelp explanation={`原始歷史履約率使用未做當前波動放大的實際價格路徑；上方到期估計則使用較不利的波動調整路徑。有效樣本修正後的近似雙側 95% 區間為 ${percent.format(recovery.historicalAssignmentLower95)}–${percent.format(recovery.historicalAssignmentUpper95)}。`}>
              原始歷史履約 {recovery.assignmentEvents}/{recovery.sampleSize} · {percent.format(recovery.historicalAssignmentRate)}
            </TermHelp>
          </div>
          <div className={`mt-1 font-semibold ${evidenceTone}`}>
            {recovery.assignmentEvents === 0
              ? '無可估計事件'
              : `${evidencePrefix ? `${evidencePrefix} · ` : ''}有效約 ${recovery.effectiveAssignmentEvents.toFixed(1)} 次`}
          </div>
        </div>
      </div>

      {(historyStale || candidate.result.grade === 'insufficient') && (
        <p role="alert" className="mt-3 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-[#6B4F00]">
          {historyStale ? '歷史資料未更新。' : '風險分級目前暫停。'} 歷史資料截至 {dataLastDate}；可查看價格回復統計，但不是最新市場預測。
        </p>
      )}

      <div className="mt-3 grid gap-x-6 divide-y divide-[#E5E5E5] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <RecoveryTarget
          title="回到履約價"
          targetPrice={candidate.price}
          recovery={recovery.strikeRecovery}
        />
        {breakEvenMatchesInput && recovery.breakEven && (
          <RecoveryTarget
            title="回到損益兩平價"
            targetPrice={recovery.breakEven.currentBreakEvenPrice}
            recovery={recovery.breakEven.recovery}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-[#EFEFEF] pt-3">
        <p className="max-w-xl text-xs leading-5 text-[#6B7280]">
          <TermHelp explanation="一般口語所說的解套。此處只表示價格回到履約價；不包含權利金、費用、稅、提前指派或其他部位。">
            回到履約價
          </TermHelp>
          {' '}與 Premium 無關；輸入每股淨 Premium 後，才會另算回到損益兩平價的時間。這不會產生「值得賣」的結論。
        </p>
        <label className="w-full sm:w-56">
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
      </div>
    </section>
  )
}
