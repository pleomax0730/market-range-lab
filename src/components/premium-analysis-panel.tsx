import type { CandidateAnalysis } from '../domain/analysis-report'
import {
  classifyPremiumOffer,
  hasSufficientPremiumEvidence,
  MIN_EFFECTIVE_PREMIUM_LOSS_EVENTS,
  type PremiumOfferStatus,
} from '../domain/premium-analysis'
import { TermHelp } from './term-help'
import { Input } from './ui/input'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const percent = new Intl.NumberFormat('zh-TW', {
  style: 'percent',
  maximumFractionDigits: 0,
})

function PremiumThreshold({
  label,
  explanation,
  value,
  emphasis = false,
}: {
  label: string
  explanation: string
  value: number
  emphasis?: boolean
}) {
  return (
    <div className={`min-w-0 px-3 py-3 ${emphasis ? 'bg-[#F4F8FF]' : ''}`}>
      <span className="block text-[11px] font-semibold text-[#565656]">
        <TermHelp explanation={explanation}>{label}</TermHelp>
      </span>
      <strong className="num mt-1 block text-xl">{money.format(value)}</strong>
      <small className="num block text-[11px] text-[#6B7280]">
        {money.format(value * 100)} / 口
      </small>
    </div>
  )
}

const premiumStatusLabels: Record<PremiumOfferStatus, string> = {
  'insufficient-evidence': '尾端證據不足，無法判斷報價是否有吸引力',
  'below-statistical': '低於歷史統計賠付參考',
  'statistical-only': '高於歷史統計賠付參考',
  'capital-return': '高於資金報酬參考',
  'light-tail': '高於輕度壓力參考',
  'conservative-tail': '高於保守壓力參考',
}

export function PremiumAnalysisPanel({
  candidate,
  marketPremium,
  onMarketPremiumChange,
  annualCapitalReturnRatePct,
  onAnnualCapitalReturnRatePctChange,
}: {
  candidate: CandidateAnalysis
  marketPremium: string
  onMarketPremiumChange: (value: string) => void
  annualCapitalReturnRatePct: string
  onAnnualCapitalReturnRatePctChange: (value: string) => void
}) {
  const premium = candidate.premium

  if (!premium) {
    return (
      <div className="col-span-2 mt-1 border-t border-[#E5E5E5] pt-4 text-xs text-[#6B7280] lg:col-span-4">
        <strong className="block text-[#0D0D0D]">歷史 Premium 壓力參考</strong>
        <p className="mt-1">{candidate.premiumUnavailableReason ?? '目前無法計算。'}</p>
      </div>
    )
  }

  const marketPremiumNumber = Number(marketPremium)
  const status = marketPremium.trim() && Number.isFinite(marketPremiumNumber) && marketPremiumNumber >= 0
    ? classifyPremiumOffer(marketPremiumNumber, premium)
    : undefined
  const belowFloor = status === 'below-statistical'
  const insufficientEvidence = !hasSufficientPremiumEvidence(premium)
  const annualRateInputValid = annualCapitalReturnRatePct.trim() !== '' &&
    Number.isFinite(Number(annualCapitalReturnRatePct)) &&
    Number(annualCapitalReturnRatePct) >= 0

  return (
    <div className="col-span-2 mt-1 border-t border-[#E5E5E5] pt-4 lg:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">歷史 Premium 壓力參考</h3>
          <p className="mt-1 text-xs text-[#6B7280]">
            現金擔保 Put · 完整歷史重播；不是選擇權估價、合理價或賣出建議。
          </p>
        </div>
        <span className="num text-[11px] text-[#6B7280]">
          {premium.daysToExpiry} 日 · {premium.lossEventCount}/{premium.sampleSize} 個到期受損事件 · 有效約 {premium.effectiveLossEventCount.toFixed(1)} 個
        </span>
      </div>

      {insufficientEvidence && (
        <p role="alert" className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          有效受損事件約 {premium.effectiveLossEventCount.toFixed(1)} 個，少於證據閘門 {MIN_EFFECTIVE_PREMIUM_LOSS_EVENTS} 個；{premium.lossEventCount === 0 ? 'Bootstrap 與 CVaR 無法推估未觀察的跳空尾端。' : '條件賠付與尾端統計仍不穩定。'} 即使券商報價高於下列參考，也不判定為便宜或值得賣出。
        </p>
      )}

      <p className="mt-3 border-l-2 border-[#A3FF3F] pl-3 text-xs leading-5 text-[#565656]">
        券商報價反映當下 IV、波動率偏斜、流動性與供需；本區沒有使用 option chain，因此市場報價高於或低於歷史參考都屬正常，不能據此判定錯價。
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-md text-xs text-[#6B7280]">
          歷史賠付統計固定；調整年化門檻只會重算資金報酬與後續尾端補償。
        </p>
        <label className="w-36">
          <span className="field-label"><TermHelp explanation="Annual capital return hurdle：你要求現金擔保資金在持有期間達到的年化報酬率。它是使用者設定，不是模型預測。">年化資金門檻</TermHelp></span>
          <span className="relative block">
            <Input
              className="num pr-8"
              type="number"
              aria-label="年化資金門檻"
              min="0"
              step="1"
              value={annualCapitalReturnRatePct}
              onChange={(event) => onAnnualCapitalReturnRatePctChange(event.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#6B7280]">%</span>
          </span>
          {!annualRateInputValid && (
            <small className="mt-1 block text-red-700">請輸入非負數；暫用 10%。</small>
          )}
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 border-y border-[#E5E5E5] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(odd)]:border-r [&>*]:border-[#E5E5E5]">
        <PremiumThreshold
          label="歷史統計賠付參考"
          explanation="Historical loss confidence floor：歷史到期平均賠付的 95% 信賴上限，加上每股交易成本。它不是市場理論價，也不代表安全。"
          value={premium.statisticalFloorPerShare}
        />
        <PremiumThreshold
          label="加資金報酬參考"
          explanation="Capital hurdle reference：歷史統計賠付參考，再加上履約價乘以年化要求報酬與實際日數。此處以現金擔保 Put 的完整履約價作資金基礎。"
          value={premium.capitalReturnFloorPerShare}
        />
        <PremiumThreshold
          label="輕度壓力參考"
          explanation="Light tail stress reference：資金報酬參考，再加上 CVaR95 與歷史平均賠付差額的 10%。這個 10% 是風險偏好，不是統計校準或客觀常數。"
          value={premium.lightTailFloorPerShare}
        />
        <PremiumThreshold
          label="保守壓力參考"
          explanation="Conservative tail stress reference：資金報酬參考，再加上 CVaR95 與歷史平均賠付差額的 25%。這是使用者風險偏好，不是統計校準；它也不會降低觸及或到期跌破機率。"
          value={premium.conservativeTailFloorPerShare}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-[#6B7280]"><TermHelp explanation="Expected expiration loss：把每條歷史路徑的 max(履約價－到期價, 0) 平均；包含沒有損失的路徑。">歷史平均賠付</TermHelp></dt>
          <dd className="num font-semibold">{money.format(premium.expectedLossPerShare)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]"><TermHelp explanation="對歷史路徑做連續區塊 Bootstrap，保留部分序列相依性；顯示平均到期賠付的雙側 95% 信賴區間。">平均賠付 95% CI</TermHelp></dt>
          <dd className="num font-semibold">[{money.format(premium.expectedLossInterval95[0])}, {money.format(premium.expectedLossInterval95[1])}]</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]"><TermHelp explanation="Conditional loss：只在到期價低於履約價、Put 發生正賠付的歷史路徑中計算平均賠付。">受損時平均賠付</TermHelp></dt>
          <dd className="num font-semibold">{money.format(premium.conditionalLossPerShare)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]"><TermHelp explanation="CVaR95（Expected Shortfall）：所有歷史到期損失中，最差 5% 路徑的平均每股賠付；它同時考慮尾端事件有多嚴重。">CVaR95</TermHelp></dt>
          <dd className="num font-semibold">{money.format(premium.cvar95PerShare)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">歷史最大賠付</dt>
          <dd className="num font-semibold">{money.format(premium.maximumHistoricalLossPerShare)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">資金報酬假設</dt>
          <dd className="num font-semibold">年化 {percent.format(premium.annualCapitalReturnRate)}</dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-[#EFEFEF] pt-3 text-xs text-[#565656]">
        <p className="num leading-5">
          公式拆解：統計 {money.format(premium.expectedLossInterval95[1])} + 成本 {money.format(premium.transactionCostPerShare)}
          {' · '}資金 {money.format(premium.capitalHurdlePerShare)}
          {' · '}輕度尾端 {money.format(premium.lightTailChargePerShare)}
          {' · '}保守尾端 {money.format(premium.conservativeTailChargePerShare)}
        </p>
        <p className="mt-1 text-[#6B7280]">
          尾端加價 = 權重 × (CVaR95 − 歷史平均賠付)，權重分別為 {percent.format(premium.lightTailWeight)} 與 {percent.format(premium.conservativeTailWeight)}。
        </p>
      </div>

      <div className="mt-3 grid items-end gap-2 border-t border-[#EFEFEF] pt-3 sm:grid-cols-[180px_1fr]">
        <label>
          <span className="field-label"><TermHelp explanation="Sell Put 應使用你實際可能成交的 bid 或限價成交值，再扣除佣金與費用；不要直接拿 ask、last 或無法成交的 mid 比較。">預估可成交淨權利金 / 股（選填）</TermHelp></span>
          <Input
            className="num"
            type="number"
            aria-label="預估可成交淨權利金 / 股（選填）"
            min="0"
            step="0.01"
            placeholder="例如 1.25"
            value={marketPremium}
            onChange={(event) => onMarketPremiumChange(event.target.value)}
          />
        </label>
        <p
          aria-live="polite"
          className={`min-h-10 rounded border px-3 py-2 text-xs ${
            status
              ? belowFloor
                ? 'border-red-200 bg-red-50 font-semibold text-red-800'
                : status === 'insufficient-evidence'
                  ? 'border-amber-300 bg-amber-50 font-semibold text-amber-900'
                  : 'border-[#D6D6D6] bg-[#FAFAFA] font-semibold text-[#333333]'
              : 'border-[#E5E5E5] bg-[#FAFAFA] text-[#6B7280]'
          }`}
        >
          {status
            ? `${money.format(marketPremiumNumber)}：${premiumStatusLabels[status]}。${status === 'insufficient-evidence' ? '' : '這只表示相對於歷史重播參考的位置，不是 Sell Put 訊號。'}`
            : '輸入預計可成交的淨 bid／limit（扣除費用），只比較歷史參考位置。'}
        </p>
      </div>
    </div>
  )
}
