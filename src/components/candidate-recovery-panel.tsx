import type { CandidateAnalysis } from '../domain/analysis-report'
import type {
  RecoveryFrontierAnalysis,
  RecoveryFrontierSettings,
} from '../domain/candidate-recovery'
import type { AssignmentRecoverySummary } from '../domain/types'
import { Input } from './ui/input'
import { TermHelp } from './term-help'
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

function RecoveryFrontierChart({ frontier }: { frontier: RecoveryFrontierAnalysis }) {
  const width = 640
  const height = 176
  const inset = { left: 38, right: 12, top: 12, bottom: 24 }
  const plotWidth = width - inset.left - inset.right
  const plotHeight = height - inset.top - inset.bottom
  const x = (index: number) => inset.left + (
    frontier.points.length <= 1 ? 0 : index / (frontier.points.length - 1)
  ) * plotWidth
  const y = (value: number) => inset.top + (1 - Math.min(1, Math.max(0, value))) * plotHeight
  const rateLine = frontier.points.map((point, index) =>
    `${x(index).toFixed(1)},${y(point.recovery.recoveryRate).toFixed(1)}`,
  ).join(' ')
  const lowerLine = frontier.points.map((point, index) =>
    `${x(index).toFixed(1)},${y(point.recovery.lower95 ?? 0).toFixed(1)}`,
  ).join(' ')
  const first = frontier.points[0]
  const last = frontier.points.at(-1)

  return (
    <figure className="min-w-0" aria-label="候選價與歷史回復率圖">
      <svg
        className="h-auto w-full overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="黑線為期限內歷史回復率，虛線為百分之九十五信賴下限，綠點為符合門檻的候選價"
      >
        <rect
          x={inset.left}
          y={y(1)}
          width={plotWidth}
          height={Math.max(0, y(frontier.settings.minimumRecoveryRate) - y(1))}
          fill="#F0F9E8"
        />
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={inset.left}
              x2={width - inset.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#E5E5E5"
            />
            <text x={0} y={y(tick) + 4} className="fill-[#6B7280] text-[10px]">
              {percent.format(tick)}
            </text>
          </g>
        ))}
        <line
          x1={inset.left}
          x2={width - inset.right}
          y1={y(frontier.settings.minimumLower95)}
          y2={y(frontier.settings.minimumLower95)}
          stroke="#137A3D"
          strokeDasharray="4 4"
          opacity="0.55"
        />
        <polyline fill="none" stroke="#8A8A8A" strokeWidth="1.5" strokeDasharray="5 4" points={lowerLine} />
        <polyline fill="none" stroke="#0D0D0D" strokeWidth="2.5" points={rateLine} />
        {frontier.points.map((point, index) => point.qualifies && (
          <circle key={point.moneyness} cx={x(index)} cy={y(point.recovery.recoveryRate)} r="3.5" fill="#137A3D" />
        ))}
        {first && <text x={inset.left} y={height - 4} className="fill-[#6B7280] text-[10px]">{money.format(first.price)}</text>}
        {last && <text x={width - inset.right} y={height - 4} textAnchor="end" className="fill-[#6B7280] text-[10px]">{money.format(last.price)}</text>}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6B7280]">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-[#0D0D0D] align-middle" />歷史回復率</span>
        <span><span className="mr-1 inline-block w-4 border-t border-dashed border-[#8A8A8A] align-middle" />95% 下限</span>
        <span><span className="mr-1 inline-block size-2 rounded-full bg-[#137A3D] align-middle" />符合全部門檻</span>
      </figcaption>
    </figure>
  )
}

function RecoveryFrontierPanel({
  frontier,
  settings,
  onSettingsChange,
  premiumAvailable,
}: {
  frontier: RecoveryFrontierAnalysis
  settings: RecoveryFrontierSettings
  onSettingsChange?: (settings: RecoveryFrontierSettings) => void
  premiumAvailable: boolean
}) {
  const periodLabel = frontier.periodUnit === 'trading-session' ? '交易日' : '週'
  const deadlines = frontier.periodUnit === 'trading-session' ? [7, 14, 21, 30] : [1, 2, 3, 4]
  const closest = [...frontier.points].sort((left, right) => {
    const deficit = (point: typeof left) =>
      Math.max(0, settings.minimumRecoveryRate - point.recovery.recoveryRate) +
      Math.max(0, settings.minimumLower95 - (point.recovery.lower95 ?? 0)) +
      Math.max(0, settings.minimumEffectiveAssignments - point.effectiveAssignmentEvents) /
        Math.max(1, settings.minimumEffectiveAssignments)
    return deficit(left) - deficit(right)
  })[0]
  const update = (patch: Partial<RecoveryFrontierSettings>) => {
    onSettingsChange?.({ ...settings, ...patch })
  }
  const selectClassName = 'h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0D0D0D] outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'

  return (
    <section className="mt-5 border-y border-[#DADADA] bg-[#FCFCFC] py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h4 className="text-base font-bold">歷史回復支持區間</h4>
          <p className="mt-1 text-xs leading-5 text-[#565656]">
            掃描候選 Put 價位，只有回復率、95% 下限與有效履約事件同時達標才列入區間；這是歷史條件統計，不是安全履約價建議。
          </p>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-bold ${frontier.intervals.length ? 'bg-[#E7F6D9] text-[#245C0A]' : 'bg-[#EFEFEF] text-[#565656]'}`}>
          {frontier.intervals.length ? '符合' : '目前無合格區間'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className="field-label">回復目標</span>
          <select
            aria-label="回復目標"
            className={selectClassName}
            value={settings.target}
            onChange={(event) => update({ target: event.target.value as RecoveryFrontierSettings['target'] })}
          >
            <option value="strike">回到履約價</option>
            <option value="break-even" disabled={!premiumAvailable}>回到損益兩平價</option>
          </select>
        </label>
        <label>
          <span className="field-label">回復期限</span>
          <select
            aria-label="回復期限"
            className={selectClassName}
            value={String(settings.deadlineIndex)}
            onChange={(event) => update({ deadlineIndex: Number(event.target.value) })}
          >
            {deadlines.map((deadline, index) => (
              <option key={deadline} value={index}>{deadline} 個{periodLabel}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">最低歷史回復率</span>
          <Input
            className="num"
            type="number"
            min="0"
            max="100"
            step="1"
            aria-label="最低歷史回復率"
            value={Number((settings.minimumRecoveryRate * 100).toFixed(2))}
            onChange={(event) => update({ minimumRecoveryRate: Number(event.target.value) / 100 })}
          />
        </label>
        <label>
          <span className="field-label">95% 下限門檻</span>
          <Input
            className="num"
            type="number"
            min="0"
            max="100"
            step="1"
            aria-label="95% 下限門檻"
            value={Number((settings.minimumLower95 * 100).toFixed(2))}
            onChange={(event) => update({ minimumLower95: Number(event.target.value) / 100 })}
          />
        </label>
      </div>

      <details className="mt-3 border-t border-[#E5E5E5] pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#565656] outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          掃描與證據條件
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="field-label">最低有效履約事件</span>
            <Input className="num" type="number" min="0" step="1" value={settings.minimumEffectiveAssignments} onChange={(event) => update({ minimumEffectiveAssignments: Number(event.target.value) })} />
          </label>
          <label>
            <span className="field-label">掃描最低價（現價 %）</span>
            <Input className="num" type="number" min="10" max="100" step="1" value={Number((settings.minimumMoneyness * 100).toFixed(2))} onChange={(event) => update({ minimumMoneyness: Number(event.target.value) / 100 })} />
          </label>
          <label>
            <span className="field-label">掃描最高價（現價 %）</span>
            <Input className="num" type="number" min="10" max="100" step="1" value={Number((settings.maximumMoneyness * 100).toFixed(2))} onChange={(event) => update({ maximumMoneyness: Number(event.target.value) / 100 })} />
          </label>
          <label>
            <span className="field-label">價位間距（現價 %）</span>
            <Input className="num" type="number" min="0.1" max="10" step="0.1" value={Number((settings.stepMoneyness * 100).toFixed(2))} onChange={(event) => update({ stepMoneyness: Number(event.target.value) / 100 })} />
          </label>
        </div>
      </details>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div>
          <div className="border-b border-[#E5E5E5] pb-4">
            <div className="text-xs text-[#6B7280]">
              {frontier.deadlinePeriods} 個{periodLabel}內 · 回復率至少 {percent.format(settings.minimumRecoveryRate)} · 95% 下限至少 {percent.format(settings.minimumLower95)}
            </div>
            {frontier.intervals.length ? (
              <div className="mt-2 space-y-1">
                {frontier.intervals.map((interval) => (
                  <AnimatedNumber
                    key={`${interval.minimumPrice}-${interval.maximumPrice}`}
                    as="div"
                    className="text-xl font-bold tracking-[-0.02em]"
                    value={`${money.format(interval.minimumPrice)}–${money.format(interval.maximumPrice)}`}
                  />
                ))}
                <p className="text-xs text-[#565656]">
                  相對現價 {percent.format(frontier.intervals[0].minimumMoneyness - 1)} 至 {percent.format(frontier.intervals.at(-1)!.maximumMoneyness - 1)}
                </p>
              </div>
            ) : (
              <div className="mt-2">
                <div className="text-base font-bold">目前沒有歷史支持區間</div>
                {closest && (
                  <p className="mt-1 text-xs leading-5 text-[#565656]">
                    最接近門檻：{money.format(closest.price)}，回復率 {percent.format(closest.recovery.recoveryRate)}、95% 下限 {percent.format(closest.recovery.lower95 ?? 0)}、有效履約約 {closest.effectiveAssignmentEvents.toFixed(1)} 次。
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-4">
            <RecoveryFrontierChart frontier={frontier} />
          </div>
        </div>

        <div className="max-h-[330px] overflow-auto border-y border-[#E5E5E5]">
          <table className="w-full min-w-[620px] border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#FCFCFC] text-[#565656]">
              <tr>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">候選價</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">回復目標</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">期限內回復</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">95% 下限</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">有效事件</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">結果</th>
              </tr>
            </thead>
            <tbody>
              {frontier.points.map((point) => (
                <tr key={point.moneyness} className="border-t border-[#EAEAEA]">
                  <td className="num whitespace-nowrap px-2 py-2 font-semibold">{money.format(point.price)}</td>
                  <td className="num whitespace-nowrap px-2 py-2 text-[#565656]">{money.format(point.targetPrice)}</td>
                  <td className="num whitespace-nowrap px-2 py-2">{percent.format(point.recovery.recoveryRate)}</td>
                  <td className="num whitespace-nowrap px-2 py-2">{percent.format(point.recovery.lower95 ?? 0)}</td>
                  <td className="num whitespace-nowrap px-2 py-2">{point.effectiveAssignmentEvents.toFixed(1)}</td>
                  <td className={`whitespace-nowrap px-2 py-2 font-semibold ${point.qualifies ? 'text-[#137A3D]' : 'text-[#6B7280]'}`}>
                    {point.qualifies ? '通過' : point.effectiveAssignmentEvents < settings.minimumEffectiveAssignments ? '證據不足' : '未達門檻'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export function CandidateRecoveryPanel({
  candidate,
  netPremiumPerShare,
  onNetPremiumPerShareChange,
  dataLastDate,
  historyStale,
  intraday = false,
  recoveryFrontierSettings,
  onRecoveryFrontierSettingsChange,
}: {
  candidate: CandidateAnalysis
  netPremiumPerShare: string
  onNetPremiumPerShareChange: (value: string) => void
  dataLastDate: string
  historyStale: boolean
  intraday?: boolean
  recoveryFrontierSettings?: RecoveryFrontierSettings
  onRecoveryFrontierSettingsChange?: (settings: RecoveryFrontierSettings) => void
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
  const frontierSettings = recoveryFrontierSettings ?? candidate.recoveryFrontier?.settings

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

      {candidate.recoveryFrontier && frontierSettings && (
        <RecoveryFrontierPanel
          frontier={candidate.recoveryFrontier}
          settings={frontierSettings}
          onSettingsChange={onRecoveryFrontierSettingsChange}
          premiumAvailable={breakEvenMatchesInput}
        />
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
