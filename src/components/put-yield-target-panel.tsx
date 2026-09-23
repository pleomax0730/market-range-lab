import { useEffect, useMemo, useState } from 'react'
import { DollarSign, Plus, Target, X } from 'lucide-react'
import { addDays, format, parseISO } from 'date-fns'
import {
  calculatePutYieldScenario,
  type PutYieldTargetResult,
} from '../domain/put-yield-target'
import { isValidSymbol, normalizeSymbol } from '../lib/symbol-inference'
import { Button } from './ui/button'
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

const targetColors = ['#166534', '#1D4ED8', '#B45309', '#B91C1C', '#6D28D9', '#0E7490']
const defaultTargetRates = [15, 20, 25]

type QuoteState = {
  symbol?: string
  price?: number
  time?: string
  loading: boolean
  unavailable: boolean
}

export type PutYieldTargetPanelProps = {
  activeSymbol?: string
  initialPrice?: number
  initialReferenceDate?: string
  initialExpirationDate?: string
}

function formatRate(rate: number) {
  return `${rate >= 0 ? '+' : ''}${rate}%`
}

function defaultStrike(price?: number) {
  return price && price > 0 ? (Math.round(price * 0.95 * 100) / 100).toFixed(2) : ''
}

function isFutureDate(value: string, referenceDate: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value > referenceDate
}

export function PutYieldTargetPanel({
  activeSymbol,
  initialPrice,
  initialReferenceDate,
  initialExpirationDate,
}: PutYieldTargetPanelProps) {
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const referenceDateSeed = initialReferenceDate && /^\d{4}-\d{2}-\d{2}$/.test(initialReferenceDate)
    ? initialReferenceDate
    : today
  const expirationDateSeed = initialExpirationDate && isFutureDate(initialExpirationDate, referenceDateSeed)
    ? initialExpirationDate
    : format(addDays(parseISO(referenceDateSeed), 45), 'yyyy-MM-dd')

  const [symbol, setSymbol] = useState(activeSymbol ?? '')
  const [referencePrice, setReferencePrice] = useState(initialPrice && initialPrice > 0 ? String(initialPrice) : '')
  const [referenceDate, setReferenceDate] = useState(referenceDateSeed)
  const [expirationDate, setExpirationDate] = useState(expirationDateSeed)
  const [strike, setStrike] = useState(defaultStrike(initialPrice))
  const [transactionCost, setTransactionCost] = useState('0')
  const [targetRates, setTargetRates] = useState(defaultTargetRates)
  const [newTargetRate, setNewTargetRate] = useState('')
  const [targetRateError, setTargetRateError] = useState('')
  const [quote, setQuote] = useState<QuoteState>({ loading: false, unavailable: false })

  const normalizedSymbol = normalizeSymbol(symbol)
  const hasValidSymbol = isValidSymbol(normalizedSymbol)

  useEffect(() => {
    if (!hasValidSymbol) {
      return undefined
    }

    let cancelled = false

    fetch(`/api/quote?symbol=${encodeURIComponent(normalizedSymbol)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Quote fetch failed')
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data && Number.isFinite(data.price)) {
          setQuote({
            symbol: normalizedSymbol,
            price: Number(data.price),
            time: data.quoteTime,
            loading: false,
            unavailable: false,
          })
        } else {
          setQuote({ symbol: normalizedSymbol, loading: false, unavailable: true })
        }
      })
      .catch(() => {
        if (!cancelled) setQuote({ symbol: normalizedSymbol, loading: false, unavailable: true })
      })

    return () => {
      cancelled = true
    }
  }, [hasValidSymbol, normalizedSymbol])

  const parsedReferencePrice = Number(referencePrice)
  const parsedStrike = Number(strike)
  const parsedTransactionCost = Number(transactionCost)
  const hasValidPrice = Number.isFinite(parsedReferencePrice) && parsedReferencePrice > 0
  const hasValidStrike = Number.isFinite(parsedStrike) && parsedStrike > 0
  const hasValidCost = Number.isFinite(parsedTransactionCost) && parsedTransactionCost >= 0
  const scenario = useMemo(() => {
    if (!hasValidPrice || !hasValidStrike || !hasValidCost) return undefined
    return calculatePutYieldScenario({
      strike: parsedStrike,
      referencePrice: parsedReferencePrice,
      referenceDate,
      expirationDate,
      targetAnnualizedRatesPct: targetRates,
      transactionCostPerShare: parsedTransactionCost,
    })
  }, [expirationDate, hasValidCost, hasValidPrice, hasValidStrike, parsedReferencePrice, parsedStrike, parsedTransactionCost, referenceDate, targetRates])

  const quoteMatchesSymbol = quote.symbol === normalizedSymbol
  const quotePrice = quoteMatchesSymbol ? quote.price : undefined
  const priceDistancePct = hasValidPrice ? (parsedReferencePrice - parsedStrike) / parsedReferencePrice : undefined
  const isOutOfTheMoney = priceDistancePct !== undefined && priceDistancePct > 0

  function handleUseQuotePrice() {
    if (quotePrice !== undefined) setReferencePrice(String(quotePrice))
  }

  function handleAddTargetRate(value = newTargetRate) {
    const parsed = Number(value.trim())
    if (!Number.isFinite(parsed) || parsed < 0) {
      setTargetRateError('請輸入 0 或以上的年化報酬率')
      return
    }
    if (targetRates.some((rate) => Math.abs(rate - parsed) < 0.001)) {
      setTargetRateError(`年化報酬率 ${formatRate(parsed)} 已存在`)
      return
    }
    setTargetRates((rates) => [...rates, parsed].sort((left, right) => left - right))
    setNewTargetRate('')
    setTargetRateError('')
  }

  function handleRemoveTargetRate(rate: number) {
    if (targetRates.length <= 1) {
      setTargetRateError('請至少保留一個目標年化報酬率')
      return
    }
    setTargetRates((rates) => rates.filter((item) => item !== rate))
    setTargetRateError('')
  }

  function renderResultCell(result: PutYieldTargetResult) {
    return (
      <div>
        <strong className="num text-sm text-[#0D0D0D]">{money.format(result.requiredPremiumPerShare)}</strong>
        <span className="num ml-1 text-[11px] text-[#6B7280]">/ 股</span>
      </div>
    )
  }

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="put-yield-target-heading" data-testid="put-yield-target-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E5E5] pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded bg-[#0D0D0D] text-[#B5FF4D]">
              <Target size={14} />
            </div>
            <h2 id="put-yield-target-heading" className="text-sm font-bold sm:text-base">目標年化賣 Put 試算</h2>
            <TermHelp explanation="不使用 option chain。指定 Put 履約價與到期日後，反推達成各目標年化報酬所需的最低理論權利金。">
              模式 A
            </TermHelp>
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">
            指定履約價，反推最低權利金；此為現金擔保 Put 的簡單年化試算，不是市場報價。
          </p>
        </div>
        {quote.loading && <span className="text-xs text-[#6B7280]">報價更新中</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0">
          <span className="field-label"><TermHelp explanation="可輸入任意標的；本模式不需要 option chain。">標的代號</TermHelp></span>
          <Input aria-label="Put 試算標的代號" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="例如 SOXL" />
        </label>
        <label className="min-w-0">
          <span className="field-label"><TermHelp explanation="用來顯示履約價相對於目前價格的位置；報價失敗時可手動輸入。">參考股價</TermHelp></span>
          <span className="relative block">
            <Input aria-label="Put 試算參考股價" className="num pr-8" type="number" min="0" step="0.01" value={referencePrice} onChange={(event) => setReferencePrice(event.target.value)} placeholder="例如 42.60" />
            <DollarSign size={14} className="pointer-events-none absolute right-3 top-3 text-[#6B7280]" />
          </span>
          {quotePrice !== undefined && (
            <button type="button" className="mt-1 text-[11px] font-semibold text-blue-700 underline" onClick={handleUseQuotePrice}>
              帶入目前報價 {money.format(quotePrice)}
            </button>
          )}
          {hasValidSymbol && quote.unavailable && <small className="mt-1 block text-[11px] text-amber-700">報價不可用，請保留或輸入手動參考價。</small>}
        </label>
        <label className="min-w-0">
          <span className="field-label"><TermHelp explanation="以參考日到指定到期日的日曆天數計算。">參考日</TermHelp></span>
          <Input aria-label="Put 試算參考日" type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
        </label>
        <label className="min-w-0">
          <span className="field-label"><TermHelp explanation="指定 Put 到期日；過去或等於參考日的日期無法試算。">到期日</TermHelp></span>
          <Input aria-label="Put 試算到期日" type="date" min={referenceDate} value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="min-w-0">
          <span className="field-label"><TermHelp explanation="Put 的履約價 K。系統會以 K 作為現金擔保資金基礎。">Put 履約價</TermHelp></span>
          <Input aria-label="Put 試算履約價" className="num" type="number" min="0" step="0.01" value={strike} onChange={(event) => setStrike(event.target.value)} placeholder="例如 40.00" />
          {hasValidPrice && hasValidStrike && (
            <small className={`mt-1 block text-[11px] ${isOutOfTheMoney ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isOutOfTheMoney ? `價外 ${percent.format(priceDistancePct ?? 0)}` : '目前為價內或平價 Put'}
            </small>
          )}
        </label>
        <label className="min-w-0">
          <span className="field-label"><TermHelp explanation="選填。每股交易成本會加到達標所需的最低權利金；預設為 0，因此表格預設顯示毛年化試算。">每股交易成本（選填）</TermHelp></span>
          <Input aria-label="Put 試算每股交易成本" className="num" type="number" min="0" step="0.01" value={transactionCost} onChange={(event) => setTransactionCost(event.target.value)} />
        </label>
      </div>

      <div className="mt-4 border-y border-[#E5E5E5] py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-[#0D0D0D]">目標年化報酬率</span>
            <span className="ml-1 text-xs text-[#6B7280]">（簡單年化）</span>
          </div>
          <span className="text-[11px] text-[#6B7280]">= 權利金 ÷ 履約價 × 365 ÷ 日曆天數</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {targetRates.map((rate, index) => (
            <span key={rate} className="inline-flex items-center gap-2 rounded-full border border-[#D8D8D8] bg-white px-3 py-1.5 text-xs font-semibold">
              <span className="size-2 rounded-full" style={{ backgroundColor: targetColors[index % targetColors.length] }} />
              {formatRate(rate)} 年化
              <button type="button" className="text-[#6B7280] hover:text-[#0D0D0D]" aria-label={`移除 ${formatRate(rate)} 年化目標`} onClick={() => handleRemoveTargetRate(rate)}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="w-32">
            <span className="sr-only">新增目標年化報酬率</span>
            <Input aria-label="新增 Put 目標年化報酬率" type="number" min="0" step="1" placeholder="例如 30" value={newTargetRate} onChange={(event) => setNewTargetRate(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleAddTargetRate() }} />
          </label>
          <Button type="button" size="sm" onClick={() => handleAddTargetRate()}><Plus size={14} />新增</Button>
          {[10, 15, 20, 25, 30].map((rate) => (
            <Button key={rate} type="button" size="sm" variant="outline" onClick={() => handleAddTargetRate(String(rate))}>+{rate}%</Button>
          ))}
        </div>
        {targetRateError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{targetRateError}</p>}
      </div>

      {!hasValidPrice && <p className="mt-3 text-xs font-semibold text-red-700">請輸入大於 0 的參考股價。</p>}
      {!hasValidStrike && <p className="mt-1 text-xs font-semibold text-red-700">請輸入大於 0 的 Put 履約價。</p>}
      {hasValidCost && referenceDate && expirationDate && !scenario && hasValidPrice && hasValidStrike && <p className="mt-1 text-xs font-semibold text-red-700">到期日必須晚於參考日，且日期格式需要有效。</p>}

      {scenario && (
        <div className="mt-4" aria-live="polite">
          <div className="grid gap-3 border-b border-[#E5E5E5] pb-3 sm:grid-cols-4">
            <div><span className="field-label">現金擔保基礎</span><strong className="num block text-base">{money.format(scenario.strike)} / 股</strong></div>
            <div><span className="field-label">到期日曆天數</span><strong className="num block text-base">{scenario.daysToExpiry} 天</strong></div>
            <div><span className="field-label">最高損益平衡價</span><strong className="num block text-base">{money.format(scenario.targets[0]?.breakEvenPrice ?? 0)}</strong></div>
            <div><span className="field-label">計算口徑</span><strong className="block text-base">{scenario.transactionCostPerShare > 0 ? '含成本' : '毛年化'}</strong></div>
          </div>

          <div className="mt-3 overflow-x-auto rounded-md border border-[#E5E5E5]">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-[#F8F8F8] text-[#565656]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">目標年化</th>
                  <th className="px-3 py-2.5 font-semibold">最低每股權利金</th>
                  <th className="px-3 py-2.5 text-right font-semibold">最低每口權利金</th>
                  <th className="px-3 py-2.5 text-right font-semibold">損益平衡價</th>
                </tr>
              </thead>
              <tbody>
                {scenario.targets.map((result, index) => (
                  <tr key={result.targetAnnualizedRatePct} className="border-t border-[#E5E5E5]">
                    <th className="px-3 py-3 font-semibold">
                      <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: targetColors[index % targetColors.length] }} />
                      {formatRate(result.targetAnnualizedRatePct)}
                    </th>
                    <td className="px-3 py-3">{renderResultCell(result)}</td>
                    <td className="num px-3 py-3 text-right">{money.format(result.requiredPremiumPerContract)}</td>
                    <td className="num px-3 py-3 text-right">{money.format(result.breakEvenPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#565656]">
            <DollarSign size={14} className="mt-0.5 shrink-0 text-[#137A3D]" />
            實際賣出時，若收到的權利金低於表格中的最低值，則無法達到對應年化目標。此區塊沒有使用 option chain，也不代表市場存在該報價。
          </p>
        </div>
      )}
    </section>
  )
}
