import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Database,
  Download,
  FileUp,
  Info,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  serializeAnalysisReport,
  type CandidateAnalysis,
} from "./domain/analysis-report";
import { DEFAULT_HISTORY_SOURCE_URL } from "./domain/history-intake";
import {
  defaultExpiryHorizons,
  resolveExpiryHorizon,
  type ExpiryHorizon,
} from "./domain/expiry-horizon";
import { previousRegularSession } from "./domain/market-calendar";
import {
  DEFAULT_AGGRESSIVE_THRESHOLD_PCT,
  GRADE_THRESHOLDS,
  MODEL_VERSION,
  resolveAggressiveThresholds,
} from "./domain/model";
import { useAnalysisSession } from "./hooks/use-analysis-session";
import { useHistoryCatalog } from "./hooks/use-history-catalog";
import { useReferencePrice } from "./hooks/use-reference-price";
import { TermHelp } from "./components/term-help";
import { DownsideDistributionChart } from "./components/downside-distribution-chart";
import { EvaluationContext } from "./components/evaluation-context";
import { PremiumAnalysisPanel } from "./components/premium-analysis-panel";
import { CandidateRecoveryPanel } from "./components/candidate-recovery-panel";
import { RiskGradeBadge } from "./components/risk-grade-badge";
import { BacktestSummary } from "./components/backtest-summary";
import { PutDecisionSummary } from "./components/put-decision-summary";
import { MobileExportMenu } from "./components/mobile-export-menu";
import type { HorizonAnalysis } from "./domain/types";
import {
  defaultDashboardSettings,
  getDashboardSettings,
  normalizeDashboardSettings,
  saveDashboardSettings,
} from "./data/datasets";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Tooltip } from "./components/ui/tooltip";
import { downloadText } from "./lib/export";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  maximumFractionDigits: 2,
});
const dashboardDefaults = defaultDashboardSettings();
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function expiryButtonLabel(horizon: ExpiryHorizon) {
  const [, month, day] = horizon.targetDate.split("-");
  const weekday = weekdayLabels[new Date(`${horizon.targetDate}T12:00:00Z`).getUTCDay()];
  return `${Number(month)}/${Number(day)}（${weekday}）· ${horizon.tradingSessions}日`;
}

function formatTime(iso: string, zone: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: zone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function App() {
  const historyCatalog = useHistoryCatalog();
  const {
    datasets,
    activeId,
    active,
    pendingImport,
    messages,
    importFile,
    importFiles,
    confirmImport,
    cancelImport,
    updatePendingSymbol,
  } = historyCatalog;
  const [expiryDate, setExpiryDate] = useState(dashboardDefaults.expiryDate);
  const [aggressiveExpirationRiskPct, setAggressiveExpirationRiskPct] = useState(
    dashboardDefaults.aggressiveExpirationRiskPct,
  );
  const [aggressiveTouchRiskPct, setAggressiveTouchRiskPct] = useState(
    dashboardDefaults.aggressiveTouchRiskPct,
  );
  const [candidate, setCandidate] = useState(dashboardDefaults.candidate);
  const [candidateSide, setCandidateSide] = useState<"lower" | "upper">(
    dashboardDefaults.candidateSide,
  );
  const [netPremiumPerShare, setNetPremiumPerShare] = useState("");
  const [annualCapitalReturnRatePct, setAnnualCapitalReturnRatePct] = useState(
    dashboardDefaults.annualCapitalReturnRatePct,
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mobileDataToolsOpen, setMobileDataToolsOpen] = useState(false);
  const referencePrice = useReferencePrice({
    symbol: active?.symbol,
    fallbackPrice: active?.bars.at(-1)?.close,
    fallbackDate: active?.bars.at(-1)?.date,
  });
  const reference = referencePrice.snapshot;
  const quote = reference.quote;
  const manualPrice = reference.priceInput;
  const quoteError = reference.error;
  const quotePaused = reference.paused;
  const manualOverride = reference.mode === "manual";
  const manualDate = reference.manualDate;
  const manualSession = reference.manualSession;
  const manualUpdatedAt = reference.manualUpdatedAt;
  const anchorPrice = reference.price;
  const anchorDate = reference.anchorDate;
  const analysisIntraday = reference.intraday;

  useEffect(() => {
    void (async () => {
      const settings = await getDashboardSettings();
      if (settings) {
        const normalized = normalizeDashboardSettings(settings);
        setCandidate(normalized.candidate);
        setCandidateSide(normalized.candidateSide);
        setExpiryDate(normalized.expiryDate);
        setAggressiveExpirationRiskPct(normalized.aggressiveExpirationRiskPct);
        setAggressiveTouchRiskPct(normalized.aggressiveTouchRiskPct);
        setAnnualCapitalReturnRatePct(normalized.annualCapitalReturnRatePct);
      }
      setSettingsLoaded(true);
    })();
  }, []);

  const quickExpiries = useMemo(
    () => /^\d{4}-\d{2}-\d{2}$/.test(anchorDate)
      ? defaultExpiryHorizons(anchorDate, analysisIntraday)
      : [],
    [anchorDate, analysisIntraday],
  );
  const selectedExpiryDate = useMemo(() => {
    const current = resolveExpiryHorizon(anchorDate, expiryDate);
    return !expiryDate || expiryDate < anchorDate || (current?.tradingSessions === 0 && !analysisIntraday)
      ? quickExpiries[0]?.targetDate ?? expiryDate
      : expiryDate;
  }, [analysisIntraday, anchorDate, expiryDate, quickExpiries]);
  const selectedExpiryHorizon = useMemo(
    () => resolveExpiryHorizon(anchorDate, selectedExpiryDate),
    [anchorDate, selectedExpiryDate],
  );
  const aggressiveThresholdState = useMemo(
    () => resolveAggressiveThresholds(aggressiveExpirationRiskPct, aggressiveTouchRiskPct),
    [aggressiveExpirationRiskPct, aggressiveTouchRiskPct],
  );
  const aggressiveThresholdError = aggressiveThresholdState.valid
    ? undefined
    : "到期需 ≥ 2%、觸及需 ≥ 5%，且觸及門檻不可低於到期門檻；暫以預設 5%／10% 計算。";
  const quickExpirySelection = quickExpiries.some((item) => item.targetDate === selectedExpiryDate)
    ? selectedExpiryDate
    : "custom";

  useEffect(() => {
    if (!settingsLoaded) return;
    const timer = window.setTimeout(
      () =>
        void saveDashboardSettings({
          settingsVersion: 5,
          candidate,
          candidateSide,
          expiryDate: selectedExpiryDate,
          aggressiveExpirationRiskPct,
          aggressiveTouchRiskPct,
          annualCapitalReturnRatePct,
        }),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [
    annualCapitalReturnRatePct,
    candidate,
    candidateSide,
    aggressiveExpirationRiskPct,
    aggressiveTouchRiskPct,
    selectedExpiryDate,
    settingsLoaded,
  ]);

  const sessionKnobs = useMemo(
    () => ({
      expiryDate: selectedExpiryDate,
      aggressiveExpirationRiskPct,
      aggressiveTouchRiskPct,
      candidate,
      candidateSide,
      netPremiumPerShare,
      annualCapitalReturnRatePct,
    }),
    [
      aggressiveExpirationRiskPct,
      aggressiveTouchRiskPct,
      annualCapitalReturnRatePct,
      candidate,
      candidateSide,
      netPremiumPerShare,
      selectedExpiryDate,
    ],
  );
  const {
    report,
    staleCandidate,
    loading: analysisLoading,
    error: analysisError,
    historyStale,
    weeklyIntraday,
    expiryUnsupported,
    shortDatedIntraday,
    pauseReasons,
    gradePaused,
  } = useAnalysisSession({
    dataset: active,
    reference,
    knobs: sessionKnobs,
  });
  const analyses = report?.analyses ?? [];
  const selected = analyses.find((analysis) => analysis.targetDate === selectedExpiryDate);
  const candidateResult = Number(candidate) > 0
    ? report?.candidate?.targetDate === selectedExpiryDate
      ? report.candidate
      : analysisLoading && staleCandidate?.targetDate === selectedExpiryDate
        ? staleCandidate
        : undefined
    : undefined;
  const candidateResultStale = candidateResult !== undefined && candidateResult === staleCandidate;
  const candidateResultMatchesInput = Boolean(
    candidateResult &&
      candidateResult.side === candidateSide &&
      candidateResult.price === Number(candidate),
  );
  const candidateResultPending = Boolean(candidateResultStale || (candidateResult && analysisLoading));

  function exportResults(kind: "json" | "csv") {
    if (!report) return;
    const serialized = serializeAnalysisReport(report, kind);
    downloadText(serialized.filename, serialized.text, serialized.mimeType);
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <header className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded bg-[#0D0D0D] text-[#B5FF4D] sm:size-9">
              <BarChart3 size={19} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate whitespace-nowrap text-[15px] font-bold sm:text-[17px]">Market Range Lab</h1>
              <p className="hidden text-xs text-[#6B7280] sm:block">歷史路徑與到期價格區間</p>
            </div>
          </div>
          <div className="hidden gap-2 sm:flex">
            <Button
              variant="outline"
              size="sm"
              disabled={!report || analysisLoading}
              onClick={() => exportResults("csv")}
            >
              <Download size={15} /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!report || analysisLoading}
              onClick={() => exportResults("json")}
            >
              <Download size={15} /> JSON
            </Button>
          </div>
          <MobileExportMenu disabled={!report || analysisLoading} onExport={exportResults} />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:p-6">
        <aside className="order-1 space-y-4 lg:order-1">
          {active && (
            <Button
              variant="outline"
              className="w-full justify-between lg:hidden"
              aria-expanded={mobileDataToolsOpen}
              aria-controls="mobile-data-tools"
              onClick={() => setMobileDataToolsOpen((open) => !open)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Database size={16} />
                <span>資料與匯入</span>
              </span>
              <span className="ml-auto flex items-center gap-2 text-xs text-[#565656]">
                {active.symbol} · {active.interval === "daily" ? "日線" : "週線"}
                <ChevronDown className={`transition-transform duration-150 ${mobileDataToolsOpen ? "rotate-180" : ""}`} size={15} />
              </span>
            </Button>
          )}
          <div id="mobile-data-tools" className={`${active && !mobileDataToolsOpen ? "hidden" : "block"} space-y-4 lg:block`}>
          <section className="panel p-4">
            <div className="mb-4 flex items-center gap-2">
              <FileUp size={17} />
              <h2 className="text-sm font-bold">匯入歷史資料</h2>
            </div>
            <div className="space-y-3">
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#BDBDBD] bg-[#FAFAFA] text-sm transition-[border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-within:ring-2 focus-within:ring-blue-600 hover:border-blue-600">
                <FileUp className="mb-2" size={20} />
                <span>選擇 Daily CSV（可多選）</span>
                <small className="mt-1 text-[11px] text-[#6B7280]">
                  同一 Symbol 的不同日期區間
                </small>
                <input
                  className="sr-only"
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  disabled={!historyCatalog.ready}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length) void importFiles(files, "daily");
                  }}
                />
              </label>
              <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#D8D8D8] bg-white text-xs font-semibold transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-within:ring-2 focus-within:ring-blue-600 hover:bg-[#F8F8F8]">
                <FileUp size={14} />
                <span>選擇 Weekly CSV</span>
                <input
                  className="sr-only"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!historyCatalog.ready}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void importFile(file, "weekly");
                  }}
                />
              </label>
            </div>
            {pendingImport && (
              <form
                className="mt-3 border-t border-[#E5E5E5] pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setNetPremiumPerShare("");
                  void confirmImport(pendingImport.symbol);
                }}
              >
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="field-label">確認 Symbol</span>
                    <Input
                      autoFocus
                      className="num"
                      aria-label="確認 Symbol"
                      value={pendingImport.symbol}
                      onChange={(event) =>
                        updatePendingSymbol(event.target.value)
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="取消匯入"
                    onClick={cancelImport}
                  >
                    <X size={15} />
                  </Button>
                  <Button type="submit" size="sm">
                    <Check size={15} />
                    匯入
                  </Button>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#6B7280]">
                  檔名辨識到「{pendingImport.detectedSymbol}」。Yahoo 使用 ticker；例如 Palantir 應輸入 PLTR。
                </p>
              </form>
            )}
            {messages.length > 0 && (
              <div className="ui-enter mt-3 space-y-1 border-t border-[#E5E5E5] pt-3 text-xs text-[#6B4F00]">
                {messages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            {historyCatalog.error && (
              <p className="mt-3 border-t border-[#E5E5E5] pt-3 text-xs font-semibold text-red-700">
                本機資料庫錯誤：{historyCatalog.error}
              </p>
            )}
          </section>
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={17} />
                <h2 className="text-sm font-bold">本機資料集</h2>
              </div>
              <Tooltip content="清除所有本機儲存的資料集">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="清除全部"
                  onClick={() => {
                    setNetPremiumPerShare("");
                    void historyCatalog.clear();
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </Tooltip>
            </div>
            <div className="space-y-2">
              {datasets.length === 0 && (
                <p className="text-xs text-[#6B7280]">尚未匯入資料。</p>
              )}
              {datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className={`flex items-center gap-2 rounded border p-2 ${dataset.id === activeId ? "border-blue-500 bg-blue-50" : "border-[#E5E5E5]"}`}
                >
                  <button
                    className="min-w-0 flex-1 rounded text-left outline-none transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-600"
                    onClick={() => {
                      setMobileDataToolsOpen(false);
                      setNetPremiumPerShare("");
                      void historyCatalog.activate(dataset.id);
                    }}
                  >
                    <strong className="flex items-center gap-2 text-sm">
                      {dataset.symbol}
                      <span className="rounded bg-[#EFEFEF] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#565656]">
                        {dataset.interval}
                      </span>
                    </strong>
                    <span className="block truncate text-[11px] text-[#6B7280]">
                      <span className="num">{dataset.bars.length.toLocaleString()}</span> {dataset.interval === "daily" ? "sessions" : "weeks"}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="刪除資料集"
                    onClick={() => {
                      if (dataset.id === activeId) setNetPremiumPerShare("");
                      void historyCatalog.remove(dataset.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </section>
          </div>
        </aside>

        <div className="order-2 min-w-0 space-y-4 lg:order-2">
          {!historyCatalog.ready ? (
            <section className="panel flex min-h-80 items-center justify-center p-8 text-sm text-[#6B7280]">
              <RefreshCw size={16} className="mr-2 animate-spin-fast" />讀取本機資料集
            </section>
          ) : !active ? (
            <section className="panel flex min-h-80 flex-col items-center justify-center p-8 text-center">
              <Database size={28} className="mb-3 text-[#6B7280]" />
              <h2 className="font-bold">匯入 Daily 或 Weekly CSV 開始分析</h2>
              <p className="mt-2 max-w-md text-sm text-[#6B7280]">
                Daily 提供較完整的逐日路徑；只有 Weekly 時仍可用週 OHLC 進行較低解析度分析。
              </p>
            </section>
          ) : (
            <>
              <section className="panel grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase text-[#6B7280]">
                    <span>Active Symbol</span>
                    <TermHelp
                      explanation={active.interval === "daily"
                        ? "目前 Yahoo 報價與分析都綁定這個 Daily 資料集的 Symbol。"
                        : "目前 Yahoo 報價與分析都綁定這個 Weekly 資料集的 Symbol；結果是較低解析度的週線估計。"}
                    >
                      {active.interval === "daily" ? "Daily" : "Weekly-only"}
                    </TermHelp>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h2 className="text-2xl font-bold">{active.symbol}</h2>
                    <span className="num text-3xl font-bold">
                      {money.format(anchorPrice)}
                    </span>
                    <span
                      className={`text-xs font-semibold ${!manualOverride && quote?.marketOpen ? "text-green-700" : "text-[#6B7280]"}`}
                    >
                      {manualOverride
                        ? "手動模式"
                        : quote?.marketOpen
                          ? "市場交易中"
                          : "已收盤"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7280] num">
                    <span>
                      ET{" "}
                      {manualOverride
                        ? anchorDate
                        : quote
                          ? formatTime(quote.quoteTime, "America/New_York")
                          : anchorDate}
                    </span>
                    <span>
                      Taipei{" "}
                      {manualOverride && manualUpdatedAt
                        ? formatTime(manualUpdatedAt, "Asia/Taipei")
                        : quote
                          ? formatTime(quote.quoteTime, "Asia/Taipei")
                          : "尚無時間"}
                    </span>
                    <span>
                      報價：
                      {manualOverride
                        ? "手動參考價"
                        : (quote?.source ?? "尚無自動報價")}
                      {quote ? ` · ${quote.symbol}` : ""}
                    </span>
                  </div>
                  {quoteError && !manualOverride && (
                    <p className="mt-2 text-xs text-red-700">
                      Yahoo 報價失敗：{quoteError}。
                    </p>
                  )}
                  {reference.stale && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700">
                      <AlertTriangle size={14} />
                      報價無法用於自動分級，請更新或輸入手動參考價。
                    </p>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <label className="mb-2 flex items-center gap-2 text-xs text-[#565656]">
                    <input
                      type="checkbox"
                      checked={quotePaused}
                      onChange={(event) =>
                        referencePrice.setPaused(event.target.checked)
                      }
                    />
                    暫停報價
                  </label>
                  <label>
                    <span className="field-label">當前價格</span>
                    <Input
                      className="num w-32"
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualPrice}
                      onChange={(event) =>
                        referencePrice.setManualPrice(event.target.value)
                      }
                    />
                  </label>
                  <Tooltip content="從 Yahoo Finance 重新擷取常規交易時段報價">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="更新報價"
                      disabled={reference.loading}
                      onClick={() => referencePrice.refresh(true)}
                    >
                      <RefreshCw
                        size={16}
                        className={reference.loading ? "animate-spin-fast" : undefined}
                      />
                    </Button>
                  </Tooltip>
                </div>
              </section>

              {manualOverride && (
                <section className="panel ui-enter grid gap-3 p-4 sm:grid-cols-2">
                  <label>
                    <span className="field-label">手動參考交易日（ET）</span>
                    <Input
                      type="date"
                      value={manualDate}
                      onChange={(event) =>
                        referencePrice.setManualDate(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span className="field-label">手動參考時段</span>
                    <select
                      className="h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm"
                      value={manualSession}
                      onChange={(event) =>
                        referencePrice.setManualSession(
                          event.target.value as "intraday" | "closed",
                        )
                      }
                    >
                      <option value="closed">已收盤</option>
                      <option value="intraday">
                        Intraday Conservative Preview
                      </option>
                    </select>
                  </label>
                </section>
              )}
              <section className="panel p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><h2 className="text-sm font-bold">到期價格區間</h2>{analysisLoading && <span className="flex items-center gap-1 text-xs text-[#6B7280]"><RefreshCw size={12} className="animate-spin-fast" />統計更新中</span>}</div>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      {active.interval === "weekly"
                        ? "Weekly-only：只支援每週最後正常交易日到期；週中到期需要 Daily CSV。"
                        : analysisIntraday
                        ? "盤中預覽：以當前價為錨，按到期前剩餘交易日建立歷史路徑。"
                        : "已收盤錨定：從下一交易日開始，按實際剩餘交易日計算路徑。"}
                    </p>
                  </div>
                  <div className="grid w-full gap-2 sm:max-w-[500px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="min-w-0">
                      <span className="field-label field-label-control">
                        <TermHelp explanation="請依券商實際列出的選擇權到期日選擇。平台不連接 option chain，因此不會自動判斷哪些日期可交易。">到期日（ET）</TermHelp>
                      </span>
                      <Input
                        className="w-full"
                        type="date"
                        min={anchorDate}
                        max={quickExpiries.at(-1)?.targetDate}
                        value={selectedExpiryDate}
                        onChange={(event) => {
                          setExpiryDate(event.target.value);
                          setNetPremiumPerShare("");
                        }}
                      />
                    </label>
                    <label className="min-w-0">
                      <span className="field-label field-label-control">快速選擇每週到期</span>
                      <select
                        className="h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm"
                        value={quickExpirySelection}
                        onChange={(event) => {
                          if (event.target.value === "custom") return;
                          setExpiryDate(event.target.value);
                          setNetPremiumPerShare("");
                        }}
                      >
                        <option value="custom">自訂日期（目前選擇）</option>
                        {quickExpiries.map((item) => (
                          <option key={item.targetDate} value={item.targetDate}>
                            {expiryButtonLabel(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B7280]">
                  {selectedExpiryHorizon && <span className="num">距評估基準 {selectedExpiryHorizon.tradingSessions} 個交易日</span>}
                  <span>每週快捷不代表券商一定提供該到期日；請以 IBKR 實際鏈上日期為準。</span>
                </div>
                <details className="group mb-4 border-y border-[#EFEFEF] py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-[#565656] outline-none focus-visible:ring-2 focus-visible:ring-blue-600 [&::-webkit-details-marker]:hidden">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <TermHelp explanation="激進門檻是可調的風險偏好，不是市場共識；保守與安全門檻不會被改動。">
                        激進風險門檻
                      </TermHelp>
                      <span className="num font-normal text-[#6B7280]">到期 {aggressiveExpirationRiskPct}% · 觸及 {aggressiveTouchRiskPct}%</span>
                    </span>
                    <ChevronDown className="transition-transform duration-150 group-open:rotate-180" size={15} />
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <label>
                      <span className="field-label">到期跌破上限（%）</span>
                      <Input
                        className="num"
                        type="number"
                        min="2"
                        max="100"
                        step="0.1"
                        value={aggressiveExpirationRiskPct}
                        onChange={(event) => setAggressiveExpirationRiskPct(event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="field-label">期間觸及上限（%）</span>
                      <Input
                        className="num"
                        type="number"
                        min="5"
                        max="100"
                        step="0.1"
                        value={aggressiveTouchRiskPct}
                        onChange={(event) => setAggressiveTouchRiskPct(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="h-10 rounded-md px-3 text-xs font-semibold text-[#565656] underline decoration-dotted underline-offset-4 hover:text-[#0D0D0D]"
                      onClick={() => {
                        setAggressiveExpirationRiskPct(DEFAULT_AGGRESSIVE_THRESHOLD_PCT.expiration);
                        setAggressiveTouchRiskPct(DEFAULT_AGGRESSIVE_THRESHOLD_PCT.pathTouch);
                      }}
                    >
                      恢復預設
                    </button>
                  </div>
                  <p className={`mt-2 text-xs ${aggressiveThresholdError ? "font-semibold text-amber-700" : "text-[#6B7280]"}`}>
                    {aggressiveThresholdError ?? "預設 5%／10%；影響激進價格邊界與自訂價格分級，保守／安全門檻維持不變。"}
                  </p>
                </details>
                {historyStale && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {active.interval === "daily"
                      ? `Daily CSV 未更新至前一正常交易日 ${previousRegularSession(anchorDate)}，分級已暫停。`
                      : "Weekly CSV 距參考日超過兩週，分級已暫停。"}
                  </p>
                )}
                {weeklyIntraday && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    Weekly-only 無法重建盤中剩餘交易日，價格區間僅作情境預覽，分級已暫停。
                  </p>
                )}
                {expiryUnsupported && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {pauseReasons.includes("weekly-expiry-resolution")
                      ? "這個週中到期日無法由 Weekly CSV 還原；請匯入 Daily CSV，或改選每週最後正常交易日。"
                      : "請選擇參考日後、八週範圍內的正常交易日；已收盤後不可再分析當日到期。"}
                  </p>
                )}
                {shortDatedIntraday && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    盤中且剩餘不超過 3 個交易日：Daily OHLC 沒有相同時刻的歷史切片，區間可預覽，但分級暫停。
                  </p>
                )}
                {analysisError && <p className="mt-1 text-xs font-semibold text-red-700">{analysisError}</p>}
                {selected && (
                  <RiskTable
                    analysis={selected}
                    stale={gradePaused}
                    anchorPrice={anchorPrice}
                    candidate={
                      candidateResultMatchesInput &&
                      !candidateResultStale &&
                      candidateResult?.side === "lower"
                        ? candidateResult.result.price
                        : undefined
                    }
                  />
                )}
              </section>

              <section className="panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold">自訂價格評估</h2>
                      <Tooltip content="候選價不做履約價間距取整；參考日、盤中／收盤狀態、到期日與剩餘交易日沿用目前分析。">
                        <Info size={14} className="text-[#6B7280]" />
                      </Tooltip>
                    </div>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      輸入任意價格，檢查它在所選到期日前的歷史跌破、觸及與 Premium 壓力參考。
                    </p>
                  </div>
                  {selected && (
                    <EvaluationContext
                      anchorDate={anchorDate}
                      intraday={analysisIntraday}
                      targetDate={selected.targetDate}
                      tradingSessions={selected.tradingSessions}
                    />
                  )}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <Input
                    className="num"
                    type="number"
                    step="0.01"
                    placeholder="例如 71.00"
                    value={candidate}
                    onChange={(event) => {
                      setCandidate(event.target.value);
                      setNetPremiumPerShare("");
                    }}
                  />
                  <select
                    className="h-10 rounded-md border border-[#D8D8D8] bg-white px-3 text-sm"
                    value={candidateSide}
                    onChange={(event) => {
                      setCandidateSide(
                        event.target.value as "lower" | "upper",
                      );
                      setNetPremiumPerShare("");
                    }}
                  >
                    <option value="lower">下檔 / Put</option>
                    <option value="upper">上檔 / Call</option>
                  </select>
                </div>
                <div className={`relative ${Number(candidate) > 0 && analysisLoading ? "min-h-[180px]" : ""}`} aria-busy={analysisLoading}>
                  {candidateResult && (
                    <div className={candidateResultPending ? "opacity-50 transition-opacity duration-150" : undefined}>
                      <CandidateResult
                        candidate={candidateResult}
                        anchorPrice={anchorPrice}
                        netPremiumPerShare={netPremiumPerShare}
                        onNetPremiumPerShareChange={setNetPremiumPerShare}
                        dataLastDate={active.bars.at(-1)?.date ?? ""}
                        historyStale={historyStale}
                        intraday={analysisIntraday}
                        annualCapitalReturnRatePct={annualCapitalReturnRatePct}
                        onAnnualCapitalReturnRatePctChange={setAnnualCapitalReturnRatePct}
                      />
                    </div>
                  )}
                  {Number(candidate) > 0 && analysisLoading && (
                    <div className="absolute inset-0 flex items-start justify-center bg-white/70 pt-6 text-xs text-[#6B7280]">
                      <span className="flex items-center gap-1"><RefreshCw size={12} className="animate-spin-fast" />候選價統計更新中</span>
                    </div>
                  )}
                </div>
              </section>

              <section className="panel p-4 text-xs text-[#565656]">
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <strong className="text-[#0D0D0D]">歷史資料來源</strong>
                    <p className="mt-1">
                      {active.sourceUrl === DEFAULT_HISTORY_SOURCE_URL ? (
                        <a
                          className="text-blue-700 underline"
                          href={DEFAULT_HISTORY_SOURCE_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Investing.com — Direxion Daily Semiconductor Bull 3X
                          Shares Historical Data
                        </a>
                      ) : (
                        <a
                          className="text-blue-700 underline"
                          href={active.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {active.sourceUrl}
                        </a>
                      )}
                    </p>
                    <p className="mt-1">
                      {active.filename} · SHA-256 {active.sha256.slice(0, 16)}…
                      · {active.bars[0].date} → {active.bars.at(-1)?.date} ·
                      匯入 {formatTime(active.importedAt, "Asia/Taipei")}
                    </p>
                  </div>
                  <div>
                    <strong className="text-[#0D0D0D]">
                      模型邊界 · v{MODEL_VERSION}
                    </strong>
                    <p className="mt-1">
                      全歷史等權、{active.interval === "daily" ? "同星期位置與同交易日跨度配對" : "連續週線配對"}、當前波動較不利包絡、連續區塊 bootstrap、單側 95% 分級上限與 expanding-window 樣本外回測。EVT
                      只作尾部壓力，不直接認證分級，也不假設正態分配。此工具不是投資建議。
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function RiskTable({
  analysis,
  stale,
  anchorPrice,
  candidate,
}: {
  analysis: HorizonAnalysis;
  stale: boolean;
  anchorPrice: number;
  candidate?: number;
}) {
  const rows = [
    analysis.lower[0],
    analysis.lower[1],
    analysis.lower[2],
    analysis.upper[2],
    analysis.upper[1],
    analysis.upper[0],
  ];
  const sideLabels = ["下檔 / Put", "下檔 / Put", "下檔 / Put", "上檔 / Call", "上檔 / Call", "上檔 / Call"];
  const gradeLabels = { conservative: "保守", safe: "安全", aggressive: "激進" } as const;
  const thresholdFor = (grade: "conservative" | "safe" | "aggressive") =>
    grade === "aggressive" ? analysis.aggressiveThresholds : GRADE_THRESHOLDS[grade];
  return (
    <div>
      <PutDecisionSummary analysis={analysis} stale={stale} />
      <details className="group mt-4 border-t border-[#E5E5E5] pt-1">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded py-3 text-sm font-semibold text-[#565656] outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <span>查看歷史分布（ECDF）</span>
          <ChevronDown className="transition-transform duration-150 group-open:rotate-180" size={16} />
        </summary>
        <DownsideDistributionChart
          analysis={analysis}
          anchorPrice={anchorPrice}
          candidate={candidate}
          stale={stale}
        />
      </details>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[110px]" />
          <col className="w-[150px]" />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="border-y border-[#E5E5E5] bg-[#FAFAFA] text-left text-xs text-[#6B7280]">
            <th scope="col" className="table-sticky-first table-sticky-header px-3 py-2.5">方向</th>
            <th scope="col" className="table-sticky-second table-sticky-header px-3 py-2.5">分級</th>
            <th className="px-3 py-2.5 text-right">價格</th>
            <th className="px-3 py-2.5 text-right">幅度</th>
            <th className="px-3 py-2.5 text-right"><TermHelp explanation="上方是歷史到期跌破比例與雙側 95% 信賴區間；下方的『分級上限』是只檢查風險是否低於門檻所使用的單側 95% 上限。">到期估計 / 雙側 95% CI</TermHelp></th>
            <th className="px-3 py-2.5 text-right"><TermHelp explanation="上方是期間內盤中曾觸及的比例與雙側 95% 信賴區間；下方的『分級上限』是單側 95% 風險上限。">觸及估計 / 雙側 95% CI</TermHelp></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${index}-${row.price}`}
              className="border-b border-[#EFEFEF]"
            >
              <td className="table-sticky-first px-3 py-3 font-medium">
                {sideLabels[index]}
              </td>
              <td className="table-sticky-second px-3 py-3">
                {row.basis === "model-estimate" ? (
                  <TermHelp
                    explanation={`保守模型估計：價格由全歷史路徑、當前波動較不利包絡、0.5% 到期尾部、1% 盤中尾部及通過診斷的 EVT 壓力共同估計；但目前 N_eff=${analysis.effectiveSampleSize} 的單側 95% 證據仍不足以認證保守門檻。此價格本身的分級是${row.grade === "safe" ? "符合安全門檻" : row.grade === "dangerous" ? "超出安全門檻" : "證據不足"}。`}
                  >
                    <span className="risk-insufficient inline-flex rounded px-2 py-1 text-xs font-bold">
                      {row.grade === "safe"
                        ? "保守估計 · 安全認證"
                        : row.grade === "dangerous"
                          ? "保守估計 · 超出安全"
                          : "保守估計 · 未認證"}
                    </span>
                  </TermHelp>
                ) : row.meetsTarget === false ? (
                  <TermHelp
                    explanation={`門檻不可達：目前有效樣本 N_eff=${analysis.effectiveSampleSize} 下，找不到任何${index < 3 ? "下檔" : "上檔"}價格能同時滿足${gradeLabels[row.requestedGrade ?? "conservative"]}門檻（到期單側 95% 上限 ≤ ${percent.format(thresholdFor(row.requestedGrade ?? "conservative").expirationUpper95)}、觸及單側 95% 上限 ≤ ${percent.format(thresholdFor(row.requestedGrade ?? "conservative").pathTouchUpper95)}）。`}
                  >
                    <span className="risk-insufficient inline-flex rounded px-2 py-1 text-xs font-bold">
                      門檻不可達
                    </span>
                  </TermHelp>
                ) : (
                  <RiskGradeBadge grade={row.grade} />
                )}
              </td>
              <td className="num px-3 py-3 text-right font-bold">
                {row.meetsTarget === false && row.basis !== "model-estimate"
                  ? "—"
                  : money.format(row.price)}
              </td>
              <td className="num px-3 py-3 text-right">
                {row.meetsTarget === false && row.basis !== "model-estimate"
                  ? "—"
                  : percent.format(row.returnPct)}
              </td>
              <td className="num px-3 py-3 text-right">
                {percent.format(row.expirationBreach)} / [
                {percent.format(row.expirationLower95)},{" "}
                {percent.format(row.expirationUpper95)}]
                <small className="num block text-[#6B7280]">
                  {Math.round(row.expirationBreach * analysis.sampleSize)} /{" "}
                  <span className="num">{analysis.sampleSize} events</span>
                </small>
                <small className="num block text-[#6B7280]">
                  分級上限 {percent.format(row.expirationRiskUpper95)}
                </small>
              </td>
              <td className="num px-3 py-3 text-right">
                {percent.format(row.pathTouch)} / [
                {percent.format(row.pathTouchLower95)},{" "}
                {percent.format(row.pathTouchUpper95)}]
                <small className="num block text-[#6B7280]">
                  {Math.round(row.pathTouch * analysis.sampleSize)} /{" "}
                  <span className="num">{analysis.sampleSize} events</span>
                </small>
                <small className="num block text-[#6B7280]">
                  分級上限 {percent.format(row.pathTouchRiskUpper95)}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#565656] lg:grid-cols-4">
        <div>
          <span className="block text-[#6B7280]">目標收盤</span>
          <strong className="num">{analysis.targetDate}</strong>
        </div>
        <div>
          <span className="block text-[#6B7280]"><TermHelp explanation="N 是符合目前星期位置與期間的歷史路徑數；N_eff 是再考慮路徑重疊與序列自相關後的有效獨立樣本數。">N / N_eff</TermHelp></span>
          <strong className="num">
            {analysis.sampleSize} / {analysis.effectiveSampleSize}
          </strong>
        </div>
        <div>
          <span className="block text-[#6B7280]"><TermHelp explanation="即使樣本不足以完成保守認證，仍以波動調整後的 0.5% 到期尾部、1% 盤中尾部、bootstrap 下緣與有效 EVT 壓力取較不利值。它是模型估計，不是保證。">模型保守估計 Put / Call</TermHelp></span>
          <strong className="num">
            {money.format(analysis.conservativeEstimate.lower.price)} /{" "}
            {money.format(analysis.conservativeEstimate.upper.price)}
          </strong>
        </div>
        <div>
          <span className="block text-[#6B7280]"><TermHelp explanation="在單側 95% 風險上限同時符合到期 0.5% 與盤中 1% 時，顯示可被有限歷史證據認證的最高 Put 價或最低 Call 價。它通常比模型保守估計更遠。">95% 認證 Put / Call</TermHelp></span>
          <strong className="num">
            {analysis.conservativeCertification.lower.meetsTarget === false
              ? "不可達"
              : money.format(analysis.conservativeCertification.lower.price)}{" / "}
            {analysis.conservativeCertification.upper.meetsTarget === false
              ? "不可達"
              : money.format(analysis.conservativeCertification.upper.price)}
          </strong>
        </div>
      </div>
      <details className="group mt-3 border-t border-[#EFEFEF]">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <span>
            <strong className="block text-xs text-[#565656]">進階模型診斷</strong>
            <small className="mt-0.5 block text-[11px] text-[#6B7280]">歷史分位數、bootstrap、EVT 與波動調整</small>
          </span>
          <ChevronDown className="text-[#6B7280] transition-transform duration-150 group-open:rotate-180" size={16} />
        </summary>
        <div className="grid grid-cols-2 gap-3 pb-2 pt-1 text-xs text-[#565656] lg:grid-cols-4">
          <div>
            <span className="block text-[#6B7280]"><TermHelp explanation="Historical path 1st percentile：約只有 1% 的同類歷史路徑曾出現更深的盤中跌幅。這是經驗分位數，不是保證。">歷史路徑 1%</TermHelp></span>
            <strong className="num">{percent.format(analysis.empirical.pathLowPct)}</strong>
          </div>
          <div>
            <span className="block text-[#6B7280]"><TermHelp explanation="Historical path 99th percentile：約只有 1% 的同類歷史路徑曾出現更高的盤中漲幅。這是經驗分位數，不是保證。">歷史路徑 99%</TermHelp></span>
            <strong className="num">{percent.format(analysis.empirical.pathHighPct)}</strong>
          </div>
          <div>
            <span className="block text-[#6B7280]">路徑 1% bootstrap CI</span>
            <strong className="num">[{percent.format(analysis.bootstrap.pathLowPct[0])}, {percent.format(analysis.bootstrap.pathLowPct[1])}]</strong>
          </div>
          <div>
            <span className="block text-[#6B7280]">路徑 99% bootstrap CI</span>
            <strong className="num">[{percent.format(analysis.bootstrap.pathHighPct[0])}, {percent.format(analysis.bootstrap.pathHighPct[1])}]</strong>
          </div>
          <div>
            <span className="block text-[#6B7280]">歷史真實極值</span>
            <strong className="num">{percent.format(analysis.empirical.pathMinPct)} / {percent.format(analysis.empirical.pathMaxPct)}</strong>
          </div>
          <div>
            <span className="block text-[#6B7280]"><TermHelp explanation="Extreme Value Theory stress：只有尾部擬合通過穩定性與適合度檢查才顯示。它是壓力情境，不參與門檻分級。">EVT stress</TermHelp></span>
            <strong className="num">
              {analysis.evt.lowerStressPct === undefined ? "不可用" : percent.format(analysis.evt.lowerStressPct)} /{" "}
              {analysis.evt.upperStressPct === undefined ? "不可用" : percent.format(analysis.evt.upperStressPct)}
            </strong>
          </div>
          <div>
            <span className="block text-[#6B7280]"><TermHelp explanation="由匯入價格資料最近 20 個交易日（週線資料則為 12 週）的收盤報酬估算，僅用來把完整歷史路徑調整至目前波動狀態。">當前年化歷史波動</TermHelp></span>
            <strong className="num">
              {analysis.volatilityAdjustment.targetAnnualized === undefined
                ? "不可用"
                : percent.format(analysis.volatilityAdjustment.targetAnnualized)}
            </strong>
          </div>
          <div>
            <span className="block text-[#6B7280]"><TermHelp explanation="目前波動除以每條歷史路徑起點波動的中位倍率。模型同時保留原始完整歷史與調整後路徑，取較不利者；倍率限制在 0.5–2 倍。">波動調整倍率中位數</TermHelp></span>
            <strong className="num">
              {analysis.volatilityAdjustment.medianScale === undefined
                ? "不可用"
                : `${analysis.volatilityAdjustment.medianScale.toFixed(2)}×`}
            </strong>
            <small className="num block text-[#6B7280]">封頂 {analysis.volatilityAdjustment.cappedPathCount} / {analysis.sampleSize}</small>
          </div>
        </div>
      </details>
      <BacktestSummary analysis={analysis} />
      {analysis.weeks > 4 && (
        <p className="mt-3 text-xs text-[#6B7280]">
          超過 4 週只是情境分析，不顯示門檻決策等級。
        </p>
      )}
    </div>
  );
}

function CandidateResult({
  candidate,
  anchorPrice,
  netPremiumPerShare,
  onNetPremiumPerShareChange,
  dataLastDate,
  historyStale,
  intraday,
  annualCapitalReturnRatePct,
  onAnnualCapitalReturnRatePctChange,
}: {
  candidate: CandidateAnalysis;
  anchorPrice: number;
  netPremiumPerShare: string;
  onNetPremiumPerShareChange: (value: string) => void;
  dataLastDate: string;
  historyStale: boolean;
  intraday: boolean;
  annualCapitalReturnRatePct: string;
  onAnnualCapitalReturnRatePctChange: (value: string) => void;
}) {
  const { result, sampleSize } = candidate;
  const optionPosition = candidate.side === "lower"
    ? Math.abs(result.price - anchorPrice) < 0.005
      ? "目前價平"
      : result.price > anchorPrice
        ? "目前價內 Put"
        : undefined
    : Math.abs(result.price - anchorPrice) < 0.005
      ? "目前價平"
      : result.price < anchorPrice
        ? "目前價內 Call"
        : undefined;
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#E5E5E5] pt-4 text-sm lg:grid-cols-4">
      <div>
        <span className="field-label">分級</span>
        <RiskGradeBadge grade={result.grade} />
      </div>
      <div>
        <span className="field-label">相對當前價</span>
        <strong className="num">
          {percent.format(result.price / anchorPrice - 1)}
        </strong>
        {optionPosition && (
          <small className="mt-1 block font-semibold text-[#92400E]">
            {optionPosition}
          </small>
        )}
      </div>
      <div>
        <span className="field-label"><TermHelp explanation="到期估計是所選到期日收盤穿越候選價的歷史比例；中括號是雙側 95% CI。分級另外使用方向正確的單側 95% 風險上限。">到期估計 / 雙側 95% CI</TermHelp></span>
        <strong className="num">
          {percent.format(result.expirationBreach)} / [
          {percent.format(result.expirationLower95)},{" "}
          {percent.format(result.expirationUpper95)}]
        </strong>
        <small className="num block text-[#6B7280]">
          {Math.round(result.expirationBreach * sampleSize)} / {sampleSize}{" "}
          events
        </small>
        <small className="num block text-[#6B7280]">
          分級用單側上限 {percent.format(result.expirationRiskUpper95)}
        </small>
      </div>
      <div>
        <span className="field-label"><TermHelp explanation="期間觸及會檢查參考時點至到期日的整條價格路徑最高或最低點，因此通常高於只看到期收盤的穿越機率；中括號是雙側 95% CI。">期間觸及估計 / 雙側 95% CI</TermHelp></span>
        <strong className="num">
          {percent.format(result.pathTouch)} / [
          {percent.format(result.pathTouchLower95)},{" "}
          {percent.format(result.pathTouchUpper95)}]
        </strong>
        <small className="num block text-[#6B7280]">
          {Math.round(result.pathTouch * sampleSize)} / {sampleSize} events
        </small>
        <small className="num block text-[#6B7280]">
          分級用單側上限 {percent.format(result.pathTouchRiskUpper95)}
        </small>
      </div>
      <CandidateRecoveryPanel
        candidate={candidate}
        netPremiumPerShare={netPremiumPerShare}
        onNetPremiumPerShareChange={onNetPremiumPerShareChange}
        dataLastDate={dataLastDate}
        historyStale={historyStale}
        intraday={intraday}
      />
      <PremiumAnalysisPanel
        candidate={candidate}
        annualCapitalReturnRatePct={annualCapitalReturnRatePct}
        onAnnualCapitalReturnRatePctChange={onAnnualCapitalReturnRatePctChange}
      />
    </div>
  );
}
