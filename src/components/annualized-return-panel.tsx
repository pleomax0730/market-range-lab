import { useEffect, useId, useMemo, useState } from 'react';
import {
  Calendar,
  DollarSign,
  Plus,
  RotateCcw,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import {
  calculateTargetSellPrice,
  assignReturnRateColors,
  DEFAULT_RETURN_RATES,
  findTodayMarkerDate,
  generateTargetSellPriceSeries,
  QUICK_HORIZON_OPTIONS,
  resolveHorizonEndDate,
  RETURN_RATE_PALETTE,
  type QuickHorizonOption,
  type ReturnRateConfig,
  type TargetPricePoint,
} from '../domain/annualized-return';
import type { HistoryDataset } from '../domain/types';
import { isValidSymbol, normalizeSymbol } from '../lib/symbol-inference';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { TermHelp } from './term-help';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('zh-TW', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

export type AnnualizedReturnPanelProps = {
  datasets?: HistoryDataset[];
  activeSymbol?: string;
  initialPrice?: number;
};

type QuoteState = {
  symbol?: string;
  price?: number;
  time?: string;
  source?: string;
  loading: boolean;
  unavailable: boolean;
};

export function AnnualizedReturnPanel({
  datasets = [],
  activeSymbol,
  initialPrice,
}: AnnualizedReturnPanelProps) {
  const datalistId = useId();
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const seededSymbol = activeSymbol ?? '';
  const seededDataset = datasets.find((dataset) => dataset.symbol.toUpperCase() === normalizeSymbol(seededSymbol));
  const seededClose = seededDataset?.bars.at(-1)?.close;
  const seededPrice = initialPrice && initialPrice > 0 ? initialPrice : seededClose;

  // These are intentionally independent analysis inputs. The imported dataset only supplies
  // an initial suggestion; after first render, the user's values are never synchronized from it.
  const [symbol, setSymbol] = useState(seededSymbol);
  const [buyDate, setBuyDate] = useState(todayStr);
  const [buyPrice, setBuyPrice] = useState(() => {
    return seededPrice && seededPrice > 0 ? String(seededPrice) : '';
  });

  const [horizonOption, setHorizonOption] = useState<QuickHorizonOption>('1y');
  const [customEndDate, setCustomEndDate] = useState(() => resolveHorizonEndDate(todayStr, '1y'));
  const [preferTradingDays, setPreferTradingDays] = useState(true);

  // Return rates state
  const [rates, setRates] = useState<ReturnRateConfig[]>(DEFAULT_RETURN_RATES);
  const [newRateInput, setNewRateInput] = useState('');
  const [rateError, setRateError] = useState('');

  // Optional Quote and Dataset context
  const [quote, setQuote] = useState<QuoteState>({ loading: false, unavailable: false });
  const [showQuoteLine, setShowQuoteLine] = useState(true);

  // Handle horizon end date resolution
  const resolvedEndDate = useMemo(() => {
    return resolveHorizonEndDate(buyDate, horizonOption, customEndDate);
  }, [buyDate, horizonOption, customEndDate]);

  const normalizedSymbol = normalizeSymbol(symbol);
  const isCurrentSymbolValid = isValidSymbol(normalizedSymbol);

  // Non-blocking quote fetch for typed or selected symbol
  useEffect(() => {
    if (!isCurrentSymbolValid) return;

    let cancelled = false;

    fetch(`/api/quote?symbol=${encodeURIComponent(normalizedSymbol)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Quote fetch failed');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data && Number.isFinite(data.price)) {
          setQuote({
            symbol: normalizedSymbol,
            price: Number(data.price),
            time: data.quoteTime,
            source: data.source,
            loading: false,
            unavailable: false,
          });
        } else {
          setQuote({ symbol: normalizedSymbol, loading: false, unavailable: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuote({ symbol: normalizedSymbol, loading: false, unavailable: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedSymbol, isCurrentSymbolValid]);

  const activeQuote = isCurrentSymbolValid && quote.symbol === normalizedSymbol ? quote : undefined;

  // Match local dataset if present
  const localDataset = useMemo(() => {
    const normalized = normalizeSymbol(symbol);
    return datasets.find((d) => d.symbol.toUpperCase() === normalized);
  }, [symbol, datasets]);

  const activeDataset = useMemo(() => {
    const normalized = normalizeSymbol(activeSymbol ?? '');
    if (!normalized) return undefined;
    return datasets.find((dataset) => dataset.symbol.toUpperCase() === normalized);
  }, [activeSymbol, datasets]);

  const activeContextPrice = initialPrice && initialPrice > 0
    ? initialPrice
    : activeDataset?.bars.at(-1)?.close;

  function handleUseActiveContext() {
    const nextSymbol = normalizeSymbol(activeSymbol ?? activeDataset?.symbol ?? '');
    if (!nextSymbol) return;

    setSymbol(nextSymbol);
    if (activeContextPrice && activeContextPrice > 0) {
      setBuyPrice(String(activeContextPrice));
    }
  }

  const parsedBuyPrice = Number(buyPrice);
  const isBuyPriceValid = Number.isFinite(parsedBuyPrice) && parsedBuyPrice > 0;

  // Generate chart data series
  const series = useMemo(() => {
    if (!isBuyPriceValid) return [];
    return generateTargetSellPriceSeries({
      buyDate,
      endDate: resolvedEndDate,
      buyPrice: parsedBuyPrice,
      rates,
      preferTradingDays,
    });
  }, [buyDate, resolvedEndDate, parsedBuyPrice, rates, preferTradingDays, isBuyPriceValid]);

  // Determine today marker
  const todayMarker = useMemo(() => {
    return findTodayMarkerDate(series, todayStr, buyDate);
  }, [series, todayStr, buyDate]);

  // Quick horizon click handler
  function handleHorizonSelect(option: QuickHorizonOption) {
    setHorizonOption(option);
    if (option !== 'custom') {
      const nextEndDate = resolveHorizonEndDate(buyDate, option);
      setCustomEndDate(nextEndDate);
    }
  }

  // Add return rate handler
  function handleAddRate(inputVal?: string) {
    const raw = (inputVal ?? newRateInput).trim();
    if (!raw) return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setRateError('請輸入有效的年化報酬率數字（例如 15 或 -5）');
      return;
    }
    if (parsed <= -100) {
      setRateError('年化報酬率必須大於 -100%');
      return;
    }
    if (rates.some((r) => Math.abs(r.ratePct - parsed) < 0.001)) {
      setRateError(`年化報酬率 ${parsed}% 已存在`);
      return;
    }

    const newRate: ReturnRateConfig = {
      id: `rate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ratePct: parsed,
      color: RETURN_RATE_PALETTE[0],
    };

    setRates((prev) => assignReturnRateColors([...prev, newRate]));
    setNewRateInput('');
    setRateError('');
  }

  function handleRemoveRate(id: string) {
    if (rates.length <= 1) {
      setRateError('請至少保留一個目標年化報酬率');
      return;
    }
    setRates((prev) => assignReturnRateColors(prev.filter((r) => r.id !== id)));
    setRateError('');
  }

  function handleResetRates() {
    setRates(DEFAULT_RETURN_RATES);
    setRateError('');
  }

  const daysHeldTotal = series.length > 0 ? series[series.length - 1].calendarDaysHeld : 0;
  const isFutureBuy = buyDate > todayStr;

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="annualized-return-heading">
      {/* Section Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E5E5] pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded bg-[#0D0D0D] text-[#B5FF4D]">
              <TrendingUp size={14} />
            </div>
            <h2 id="annualized-return-heading" className="text-sm font-bold sm:text-base">
              年化報酬目標賣價趨勢
            </h2>
            <TermHelp explanation="依據複利年化公式：目標賣價 = 買進均價 × (1 + 年化報酬率)^(持有日曆天數 / 365)。此試算採用日曆天數複利計算，屬於未扣除股利、手續費、交易稅等成本之毛目標賣價。">
              複利年化公式
            </TermHelp>
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">
            輸入任意標的、買進日期、買進均價與目標年化報酬率，繪製達成各目標所需之平均賣價曲線。
          </p>
          <p className="mt-1 text-xs text-[#565656]">
            這是獨立試算；匯入 CSV 只提供可選的標的提示與價格帶入，不會覆寫你的輸入。
          </p>
        </div>
        {(activeSymbol || activeDataset) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-xs"
            onClick={handleUseActiveContext}
          >
            帶入目前標的
          </Button>
        )}
      </div>

      {/* Input Form Controls */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Symbol Input */}
        <div>
          <label className="field-label" htmlFor="annualized-symbol-input">
            自訂標的代號（Symbol）
          </label>
          <div className="relative">
            <Input
              id="annualized-symbol-input"
              className="num uppercase"
              placeholder="例如 PLTR、AAPL、NVDA"
              value={symbol}
              list={datalistId}
              onChange={(e) => setSymbol(e.target.value)}
            />
            {datasets.length > 0 && (
              <datalist id={datalistId}>
                {datasets.map((d) => (
                  <option key={d.id} value={d.symbol}>
                    {d.symbol}（本機 {d.interval === 'daily' ? '日線' : '週線'}）
                  </option>
                ))}
              </datalist>
            )}
          </div>
          {/* Symbol Context & Quote Overlay Info */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B7280]">
            {activeQuote?.price !== undefined ? (
              <>
                <span className="text-green-700 font-medium">
                  即時參考價 {money.format(activeQuote.price)}
                </span>
                <button
                  type="button"
                  className="text-blue-600 underline hover:text-blue-800"
                  onClick={() => setBuyPrice(String(activeQuote.price))}
                >
                  帶入買價
                </button>
              </>
            ) : localDataset ? (
              <>
                <span>本機收盤參考 {money.format(localDataset.bars.at(-1)?.close ?? 0)}</span>
                <button
                  type="button"
                  className="text-blue-600 underline hover:text-blue-800"
                  onClick={() => setBuyPrice(String(localDataset.bars.at(-1)?.close ?? 0))}
                >
                  帶入買價
                </button>
              </>
            ) : (
              <span>可輸入未匯入的標的；歷史資料不是必要條件</span>
            )}
          </div>
        </div>

        {/* Buy Date Input */}
        <div>
          <label className="field-label" htmlFor="annualized-buy-date">
            自訂買進日期
          </label>
          <div className="flex gap-2">
            <Input
              id="annualized-buy-date"
              type="date"
              className="num w-full"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 text-xs"
              onClick={() => setBuyDate(todayStr)}
            >
              設為今日
            </Button>
          </div>
          <span className="mt-1 block text-[11px] text-[#6B7280]">
            {isFutureBuy ? '買進日在未來（僅預測投射曲線）' : `距今持有 ${todayMarker.calendarDaysHeld ?? 0} 日曆天`}
          </span>
        </div>

        {/* Average Buy Price Input */}
        <div>
          <label className="field-label" htmlFor="annualized-buy-price">
            自訂買進均價（USD）
          </label>
          <div className="relative">
            <Input
              id="annualized-buy-price"
              type="number"
              min="0.01"
              step="0.01"
              className="num w-full"
              placeholder="例如 100.00"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
            />
          </div>
          {!isBuyPriceValid ? (
            <span className="mt-1 block text-[11px] font-semibold text-red-600">
              請輸入大於 0 的有效買進均價
            </span>
          ) : (
            <span className="mt-1 block text-[11px] text-[#6B7280]">
              可自由修改；不含交易手續費與稅
            </span>
          )}
        </div>

        {/* Horizon Quick Options & Custom End Date */}
        <div>
          <label className="field-label" htmlFor="annualized-horizon-select">
            分析期間（Horizon）
          </label>
          <div className="flex flex-col gap-1.5">
            <select
              id="annualized-horizon-select"
              className="h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              value={horizonOption}
              onChange={(e) => handleHorizonSelect(e.target.value as QuickHorizonOption)}
            >
              {QUICK_HORIZON_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}（預設至 {resolveHorizonEndDate(buyDate, opt.id, customEndDate)}）
                </option>
              ))}
            </select>
            {horizonOption === 'custom' && (
              <Input
                type="date"
                min={buyDate}
                value={customEndDate}
                aria-label="自訂結束日"
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            )}
            <span className="text-[11px] text-[#6B7280]">
              結束日：{resolvedEndDate}（共 {daysHeldTotal} 日曆天）
            </span>
          </div>
        </div>
      </div>

      {/* Horizon Quick Buttons & Trading Day Filter */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEFEF] pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[#6B7280]">快速切換區間：</span>
          {QUICK_HORIZON_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`rounded px-2 py-1 font-medium transition-colors ${
                horizonOption === opt.id
                  ? 'bg-[#0D0D0D] text-white'
                  : 'bg-[#EFEFEF] text-[#565656] hover:bg-[#E5E5E5]'
              }`}
              onClick={() => handleHorizonSelect(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-[#565656]">
          <input
            type="checkbox"
            checked={preferTradingDays}
            onChange={(e) => setPreferTradingDays(e.target.checked)}
          />
          <span>僅美股常規交易日（排除週末與休市）</span>
        </label>
      </div>

      {/* Return Rates Manager */}
      <div className="mt-4 rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#0D0D0D]">目標年化報酬率曲線</span>
            <span className="text-xs text-[#6B7280]">（各曲線獨立繪製不同年化報酬所需平均賣價）</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#6B7280] hover:text-[#0D0D0D]"
            onClick={handleResetRates}
          >
            <RotateCcw size={12} className="mr-1" />
            重置報酬率
          </Button>
        </div>

        {/* Existing Rates Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {rates.map((rate) => {
            const endTargetPrice = isBuyPriceValid
              ? calculateTargetSellPrice(parsedBuyPrice, rate.ratePct / 100, daysHeldTotal)
              : 0;
            const todayTargetPrice =
              isBuyPriceValid && todayMarker.calendarDaysHeld !== undefined && todayMarker.calendarDaysHeld >= 0
                ? calculateTargetSellPrice(
                    parsedBuyPrice,
                    rate.ratePct / 100,
                    todayMarker.calendarDaysHeld,
                  )
                : undefined;

            return (
              <div
                key={rate.id}
                className="flex items-center gap-2 rounded-full border border-[#D8D8D8] bg-white px-3 py-1 shadow-sm text-xs"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: rate.color }}
                  aria-hidden="true"
                />
                <strong className="num">
                  {rate.ratePct >= 0 ? `+${rate.ratePct}%` : `${rate.ratePct}%`} 年化
                </strong>
                <span className="num text-[#6B7280]">
                  到期 {money.format(endTargetPrice)}
                </span>
                {todayTargetPrice !== undefined && !isFutureBuy && (
                  <span className="num text-blue-700">
                    今日 {money.format(todayTargetPrice)}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`移除 ${rate.ratePct}% 年化目標`}
                  className="rounded-full p-0.5 text-[#888] hover:bg-[#EFEFEF] hover:text-[#0D0D0D]"
                  onClick={() => handleRemoveRate(rate.id)}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add Rate Input and Preset Buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EFEFEF] pt-3">
          <div className="flex items-center gap-1.5">
            <div className="relative w-28">
              <Input
                type="number"
                step="1"
                placeholder="例如 15"
                className="num h-8 pr-6 text-xs"
                value={newRateInput}
                onChange={(e) => {
                  setNewRateInput(e.target.value);
                  setRateError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRate();
                  }
                }}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#6B7280]">
                %
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleAddRate()}
            >
              <Plus size={13} className="mr-1" />
              新增
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1 text-xs text-[#6B7280]">
            <span>快捷加入：</span>
            {[8, 15, 25, 50].map((preset) => (
              <button
                key={preset}
                type="button"
                className="rounded bg-white px-2 py-0.5 border border-[#D8D8D8] text-[11px] font-medium text-[#565656] hover:border-blue-600 hover:text-blue-600"
                onClick={() => handleAddRate(String(preset))}
              >
                +{preset}%
              </button>
            ))}
          </div>
        </div>

        {rateError && (
          <p className="mt-2 text-xs font-semibold text-red-600">{rateError}</p>
        )}
      </div>

      {/* Summary Metrics Bar */}
      {isBuyPriceValid && series.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#EFEFEF] pt-3 text-xs sm:grid-cols-4">
          <div>
            <span className="block text-[#6B7280]">標的與買進基準</span>
            <strong className="num text-sm text-[#0D0D0D]">
              {symbol ? symbol.toUpperCase() : '自訂標的'} · {money.format(parsedBuyPrice)}
            </strong>
            <small className="block text-[#6B7280]">{buyDate}</small>
          </div>
          <div>
            <span className="block text-[#6B7280]">分析區間天數</span>
            <strong className="num text-sm text-[#0D0D0D]">
              {daysHeldTotal} 日曆天
            </strong>
            <small className="block text-[#6B7280]">
              {preferTradingDays ? `${series.length} 個交易日` : '全日曆天'}
            </small>
          </div>
          <div>
            <span className="block text-[#6B7280]">今日狀態（{todayStr}）</span>
            <strong className="num text-sm text-[#0D0D0D]">
              {isFutureBuy
                ? '尚未到達買進日'
                : `已持有 ${todayMarker.calendarDaysHeld ?? 0} 天`}
            </strong>
            <small className="block text-[#6B7280]">
              {isFutureBuy ? '投射未來情境' : todayMarker.isInsideHorizon ? '已標記於圖表' : '超出區間'}
            </small>
          </div>
          <div>
            <span className="block text-[#6B7280]">到期最高目標（{rates[rates.length - 1]?.ratePct}%）</span>
            <strong className="num text-sm text-green-700">
              {money.format(
                calculateTargetSellPrice(
                  parsedBuyPrice,
                  (rates[rates.length - 1]?.ratePct ?? 0) / 100,
                  daysHeldTotal,
                ),
              )}
            </strong>
            <small className="block text-[#6B7280]">
              到期日 {resolvedEndDate}
            </small>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="mt-5">
        {!isBuyPriceValid ? (
          <div className="flex h-64 flex-col items-center justify-center rounded border border-dashed border-[#D8D8D8] bg-[#FAFAFA] text-sm text-[#6B7280]">
            <DollarSign size={24} className="mb-2 text-[#999]" />
            <p>請輸入大於 0 的買進均價以繪製目標賣價趨勢線。</p>
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded border border-dashed border-[#D8D8D8] bg-[#FAFAFA] text-sm text-[#6B7280]">
            <Calendar size={24} className="mb-2 text-[#999]" />
            <p>所選日期區間無有效交易日，請調整買進日期或結束日。</p>
          </div>
        ) : (
          <figure className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280]">
              <span className="font-semibold text-[#0D0D0D]">
                各目標年化報酬率所需平均賣價曲線（USD）
              </span>
              {activeQuote?.price !== undefined && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showQuoteLine}
                    onChange={(e) => setShowQuoteLine(e.target.checked)}
                  />
                  <span>顯示即時現價線（{money.format(activeQuote.price)}）</span>
                </label>
              )}
            </div>

            <div className="h-80 w-full sm:h-96" data-testid="annualized-return-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={series}
                  margin={{ top: 18, right: 24, bottom: 20, left: 12 }}
                >
                  <CartesianGrid
                    stroke="var(--chart-grid, #E5E5E5)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val: string) => val.slice(5).replace('-', '/')}
                    tick={{ fontSize: 11, fill: 'var(--chart-axis, #565656)' }}
                    axisLine={{ stroke: 'var(--chart-grid, #D8D8D8)' }}
                    tickLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={(val: number) => `$${val >= 100 ? Math.round(val) : val.toFixed(1)}`}
                    tick={{ fontSize: 11, fill: 'var(--chart-axis, #565656)' }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const point = payload[0].payload as TargetPricePoint;
                      const sortedPayload = [...payload].sort((a, b) => {
                        const aRate = rates.find((rate) => `rate_${rate.id}` === String(a.dataKey))?.ratePct ?? Number.POSITIVE_INFINITY;
                        const bRate = rates.find((rate) => `rate_${rate.id}` === String(b.dataKey))?.ratePct ?? Number.POSITIVE_INFINITY;
                        return aRate - bRate;
                      });
                      const dateObj = parseISO(String(label));
                      const weekday = weekdayLabels[dateObj.getUTCDay()];

                      return (
                        <div
                          className="rounded-md border border-[#D8D8D8] bg-white p-3 shadow-lg text-xs"
                          style={{ minWidth: 200 }}
                        >
                          <div className="mb-2 border-b border-[#EFEFEF] pb-1.5">
                            <strong className="block text-sm text-[#0D0D0D]">
                              {String(label)}（週{weekday}）
                            </strong>
                            <span className="num text-[#6B7280]">
                              持有 {point.calendarDaysHeld} 日曆天
                              {point.isTradingDay ? ' · 市場交易日' : ''}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {sortedPayload.map((entry, index) => {
                              const targetVal = Number(entry.value);
                              const dollarDiff = targetVal - parsedBuyPrice;
                              const pctDiff = parsedBuyPrice > 0 ? dollarDiff / parsedBuyPrice : 0;

                              return (
                                <div
                                  key={String(entry.dataKey ?? index)}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="size-2 rounded-full shrink-0"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-[#565656]">{entry.name}</span>
                                  </div>
                                  <div className="text-right">
                                    <strong className="num text-[#0D0D0D]">
                                      {money.format(targetVal)}
                                    </strong>
                                    <span className="num ml-1.5 text-[11px] text-[#6B7280]">
                                      ({dollarDiff >= 0 ? `+${money.format(dollarDiff)}` : money.format(dollarDiff)} / {percent.format(pctDiff)})
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />

                  {/* Buy Price Baseline */}
                  <ReferenceLine
                    y={parsedBuyPrice}
                    stroke="#888888"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{
                      value: `買價 ${money.format(parsedBuyPrice)}`,
                      position: 'insideBottomLeft',
                      fill: '#565656',
                      fontSize: 11,
                    }}
                  />

                  {/* Optional Real-time Quote Overlay */}
                  {showQuoteLine && activeQuote?.price !== undefined && (
                    <ReferenceLine
                      y={activeQuote.price}
                      stroke="#059669"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{
                        value: `現價 ${money.format(activeQuote.price)}`,
                        position: 'insideTopRight',
                        fill: '#059669',
                        fontSize: 11,
                      }}
                    />
                  )}

                  {/* Today Marker (only if buyDate in past and today in horizon) */}
                  {todayMarker.isInsideHorizon && todayMarker.date && (
                    <ReferenceLine
                      x={todayMarker.date}
                      stroke="#1859A9"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{
                        value: todayMarker.label,
                        position: 'insideTopLeft',
                        fill: '#1859A9',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />
                  )}

                  {/* Trend Lines for Each Annualized Return Rate */}
                  {rates.map((rate) => (
                    <Line
                      key={rate.id}
                      type="monotone"
                      dataKey={`rate_${rate.id}`}
                      name={`${rate.ratePct >= 0 ? `+${rate.ratePct}%` : `${rate.ratePct}%`} 年化`}
                      stroke={rate.color}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Legend & Notes */}
            <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#6B7280]">
              <div className="flex flex-wrap items-center gap-3">
                {rates.map((rate) => (
                  <span key={rate.id} className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: rate.color }}
                    />
                    <span className="font-medium text-[#0D0D0D]">
                      {rate.ratePct >= 0 ? `+${rate.ratePct}%` : `${rate.ratePct}%`} 年化
                    </span>
                  </span>
                ))}
              </div>
              <span>
                毛目標賣價，不計股利與交易稅費 · 依日曆天數複利計算
              </span>
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}
