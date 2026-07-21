import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Database,
  Download,
  FileUp,
  Info,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { extractMatchedPaths } from "./domain/analyze";
import { assignmentOverlay } from "./domain/assignment";
import { importHistoryCsv } from "./domain/import-history";
import { evaluateCandidate } from "./domain/statistics";
import {
  previousOrSameRegularSession,
  previousRegularSession,
} from "./domain/market-calendar";
import { reconcileWeekly } from "./domain/reconcile-weekly";
import { GRADE_THRESHOLDS, MODEL_VERSION } from "./domain/model";
import { applyGradePause } from "./domain/export-analysis";
import { useHistoricalAnalysis } from "./hooks/use-historical-analysis";
import { TermHelp } from "./components/term-help";
import type {
  HistoryDataset,
  HorizonAnalysis,
  RiskGrade,
} from "./domain/types";
import {
  clearDatasets,
  deleteDataset,
  getActiveDatasetId,
  getDashboardSettings,
  listDatasets,
  saveDashboardSettings,
  saveDataset,
  setActiveDataset,
} from "./data/datasets";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Tooltip } from "./components/ui/tooltip";
import { downloadText, rowsToCsv } from "./lib/export";

const INVESTING_SOURCE =
  "https://www.investing.com/etfs/direxion-dly-semiconductor-bull-3x-historical-data";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  maximumFractionDigits: 2,
});
const gradeText: Record<RiskGrade, string> = {
  conservative: "保守",
  safe: "安全",
  dangerous: "危險",
  insufficient: "證據不足",
  scenario: "情境參考",
};

type Quote = {
  symbol: string;
  price: number;
  quoteTime: string;
  exchangeTimezone: string;
  marketOpen: boolean;
  stale: boolean;
  source: string;
};

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

function dateInZone(value: string | Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function Grade({ grade }: { grade: RiskGrade }) {
  return (
    <span
      className={`inline-flex min-w-16 justify-center rounded px-2 py-1 text-xs font-bold risk-${grade}`}
    >
      {gradeText[grade]}
    </span>
  );
}

export function App() {
  const [datasets, setDatasets] = useState<HistoryDataset[]>([]);
  const [activeId, setActiveId] = useState("");
  const [symbol, setSymbol] = useState("SOXL");
  const [sourceUrl, setSourceUrl] = useState(INVESTING_SOURCE);
  const [confirmed, setConfirmed] = useState(false);
  const [discontinuitiesConfirmed, setDiscontinuitiesConfirmed] =
    useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote>();
  const [manualPrice, setManualPrice] = useState("135");
  const [quoteError, setQuoteError] = useState("");
  const [quotePaused, setQuotePaused] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [horizon, setHorizon] = useState(1);
  const [candidate, setCandidate] = useState("");
  const [candidateSide, setCandidateSide] = useState<"lower" | "upper">(
    "lower",
  );
  const [cash, setCash] = useState("60000");
  const [multiple, setMultiple] = useState("1.2");
  const [obligation, setObligation] = useState("75000");
  const [intraday, setIntraday] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [manualDate, setManualDate] = useState(() =>
    dateInZone(new Date(), "America/New_York"),
  );
  const [manualSession, setManualSession] = useState<"intraday" | "closed">(
    "closed",
  );
  const [manualUpdatedAt, setManualUpdatedAt] = useState<string>();
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const active = datasets.find((dataset) => dataset.id === activeId);

  useEffect(() => {
    void (async () => {
      const loaded = await listDatasets();
      const storedActive = await getActiveDatasetId();
      const settings = await getDashboardSettings();
      setDatasets(loaded);
      setActiveId(
        loaded.some((dataset) => dataset.id === storedActive)
          ? storedActive!
          : (loaded[0]?.id ?? ""),
      );
      if (settings) {
        setCash(settings.cash);
        setMultiple(settings.multiple);
        setObligation(settings.obligation);
        setCandidate(settings.candidate);
        setCandidateSide(settings.candidateSide);
        setHorizon(settings.horizon);
      }
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    const timer = window.setTimeout(
      () =>
        void saveDashboardSettings({
          cash,
          multiple,
          obligation,
          candidate,
          candidateSide,
          horizon,
        }),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [
    cash,
    multiple,
    obligation,
    candidate,
    candidateSide,
    horizon,
    settingsLoaded,
  ]);

  const refreshQuote = useCallback(
    async (force = false) => {
      if (!active || ((manualOverride || quotePaused) && !force)) return;
      try {
        setQuoteError("");
        const response = await fetch(
          `/api/quote?symbol=${encodeURIComponent(active.symbol)}`,
        );
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        setQuote(value);
        setManualPrice(String(value.price));
        setManualOverride(false);
        setQuotePaused(false);
        setManualUpdatedAt(undefined);
        setIntraday(value.marketOpen);
      } catch (error) {
        setQuoteError(error instanceof Error ? error.message : "無法取得報價");
      }
    },
    [active, manualOverride, quotePaused],
  );

  useEffect(() => {
    if (!active) return;
    const initial = window.setTimeout(() => void refreshQuote(), 0);
    return () => {
      window.clearTimeout(initial);
    };
  }, [active, refreshQuote]);

  useEffect(() => {
    if (!active || quotePaused || manualOverride || !quote?.marketOpen) return;
    const timer = window.setInterval(() => void refreshQuote(), 30_000);
    return () => window.clearInterval(timer);
  }, [active, manualOverride, quote?.marketOpen, quotePaused, refreshQuote]);

  useEffect(() => {
    if (!quote?.marketOpen) return;
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [quote?.marketOpen]);

  const anchorPrice = Number(manualPrice);
  const anchorDate = manualOverride
    ? previousOrSameRegularSession(manualDate)
    : dateInZone(quote?.quoteTime ?? new Date(), "America/New_York");
  const analysisIntraday = manualOverride
    ? manualSession === "intraday"
    : intraday;
  const analysisInput = useMemo(
    () => active && anchorPrice > 0 ? { bars: active.bars, anchorPrice, anchorDate, intraday: analysisIntraday } : undefined,
    [active, anchorPrice, anchorDate, analysisIntraday],
  );
  const { analyses, loading: analysisLoading, error: analysisError } = useHistoricalAnalysis(analysisInput);
  const selected = analyses[horizon - 1];
  const putPrice =
    candidateSide === "lower" && Number(candidate) > 0
      ? Number(candidate)
      : Number(selected?.lower[1]?.price || 0);
  const overlay = assignmentOverlay(
    Number(cash),
    Number(multiple),
    Number(obligation),
    putPrice,
  );
  const quoteAgeStale = Boolean(
    quote?.marketOpen && clock - new Date(quote.quoteTime).getTime() > 120_000,
  );
  const staleGrade = Boolean(
    !manualOverride && (quoteError || !quote || quote.stale || quoteAgeStale),
  );
  const historyStale = Boolean(
    active &&
      (active.bars.at(-1)?.date ?? "") < previousRegularSession(anchorDate),
  );
  const gradePaused = staleGrade || historyStale;

  async function handleFile(file?: File) {
    if (!file) return;
    const result = await importHistoryCsv(await file.text(), {
      symbol: symbol.toUpperCase(),
      filename: file.name,
      sourceUrl,
      importedAt: new Date().toISOString(),
      splitAdjustedConfirmed: confirmed,
      discontinuitiesConfirmed,
      interval: "daily",
    });
    setMessages([
      ...result.errors.map((item) => `錯誤：${item.message}`),
      ...result.warnings.map((item) => `提醒：${item.message}`),
    ]);
    if (!result.dataset) return;
    await saveDataset(result.dataset);
    await setActiveDataset(result.dataset.id);
    setDatasets(await listDatasets());
    setActiveId(result.dataset.id);
  }

  async function handleWeeklyFile(file?: File) {
    if (!file || !active) return;
    const result = await importHistoryCsv(await file.text(), {
      symbol: active.symbol,
      filename: file.name,
      sourceUrl,
      importedAt: new Date().toISOString(),
      splitAdjustedConfirmed: confirmed,
      discontinuitiesConfirmed,
      interval: "weekly",
    });
    if (!result.dataset) {
      setMessages(result.errors.map((item) => `Weekly 錯誤：${item.message}`));
      return;
    }
    const reconciliation = reconcileWeekly(active.bars, result.dataset.bars);
    setMessages([
      `Weekly reconciliation：${reconciliation.comparisons.length} 個可比較週收盤，${reconciliation.mismatchCount} 個差異超過 0.5%。Weekly 不影響分析。`,
    ]);
  }

  function exportResults(kind: "json" | "csv") {
    if (!active) return;
    const base = `${active.symbol}-range-analysis-${anchorDate}`;
    const pauseReasons = [
      ...(historyStale ? ["stale-history"] : []),
      ...(staleGrade ? ["stale-or-missing-quote"] : []),
    ];
    const exportedAnalyses = applyGradePause(analyses, gradePaused);
    const candidatePaths =
      selected && Number(candidate) > 0
        ? extractMatchedPaths(
            active.bars,
            anchorDate,
            selected.weeks,
            analysisIntraday,
          )
        : [];
    const candidateEvaluation =
      selected && Number(candidate) > 0
        ? evaluateCandidate(
            anchorPrice,
            Number(candidate),
            candidateSide,
            candidatePaths,
            selected.effectiveSampleSize,
            selected.weeks,
          )
        : undefined;
    const provenance = {
      modelVersion: MODEL_VERSION,
      thresholds: GRADE_THRESHOLDS,
      dataset: { ...active, bars: undefined },
      quote,
      quotePaused,
      manualOverride,
      manualUpdatedAt,
      manualDate: manualOverride ? anchorDate : undefined,
      manualSession: manualOverride ? manualSession : undefined,
      anchorPrice,
      anchorDate,
      intraday: analysisIntraday,
      gradePaused,
      pauseReasons,
      account: {
        cash: Number(cash),
        assignmentBudgetMultiple: Number(multiple),
        existingAssignmentObligation: Number(obligation),
        overlay,
      },
      candidate: candidateEvaluation
        ? { side: candidateSide, ...candidateEvaluation }
        : undefined,
    };
    if (kind === "json")
      downloadText(
        `${base}.json`,
        JSON.stringify({ ...provenance, analyses: exportedAnalyses }, null, 2),
        "application/json",
      );
    else
      downloadText(
        `${base}.csv`,
        rowsToCsv(
          exportedAnalyses.flatMap((item) => [
            ...item.lower.map((risk) => ({
              symbol: active.symbol,
              modelVersion: MODEL_VERSION,
              dataHash: active.sha256,
              quoteTime: manualOverride
                ? (manualUpdatedAt ?? "")
                : (quote?.quoteTime ?? ""),
              quoteSource: manualOverride
                ? "Manual Reference Price"
                : (quote?.source ?? ""),
              gradePaused: String(gradePaused),
              pauseReasons: pauseReasons.join("|"),
              anchorPrice,
              anchorDate,
              weeks: item.weeks,
              targetDate: item.targetDate,
              side: "lower",
              grade: risk.grade,
              price: risk.price,
              returnPct: risk.returnPct,
              expirationEstimate: risk.expirationBreach,
              expirationLower95: risk.expirationLower95,
              expirationUpper95: risk.expirationUpper95,
              touchEstimate: risk.pathTouch,
              touchLower95: risk.pathTouchLower95,
              touchUpper95: risk.pathTouchUpper95,
              sampleSize: item.sampleSize,
              effectiveSampleSize: item.effectiveSampleSize,
              pathMinPct: item.empirical.pathMinPct,
              pathMaxPct: item.empirical.pathMaxPct,
              evtStressPct: item.evt.lowerStressPct ?? "",
              evtDiagnostics: item.evt.lowerDiagnostics,
            })),
            ...item.upper.map((risk) => ({
              symbol: active.symbol,
              modelVersion: MODEL_VERSION,
              dataHash: active.sha256,
              quoteTime: manualOverride
                ? (manualUpdatedAt ?? "")
                : (quote?.quoteTime ?? ""),
              quoteSource: manualOverride
                ? "Manual Reference Price"
                : (quote?.source ?? ""),
              gradePaused: String(gradePaused),
              pauseReasons: pauseReasons.join("|"),
              anchorPrice,
              anchorDate,
              weeks: item.weeks,
              targetDate: item.targetDate,
              side: "upper",
              grade: risk.grade,
              price: risk.price,
              returnPct: risk.returnPct,
              expirationEstimate: risk.expirationBreach,
              expirationLower95: risk.expirationLower95,
              expirationUpper95: risk.expirationUpper95,
              touchEstimate: risk.pathTouch,
              touchLower95: risk.pathTouchLower95,
              touchUpper95: risk.pathTouchUpper95,
              sampleSize: item.sampleSize,
              effectiveSampleSize: item.effectiveSampleSize,
              pathMinPct: item.empirical.pathMinPct,
              pathMaxPct: item.empirical.pathMaxPct,
              evtStressPct: item.evt.upperStressPct ?? "",
              evtDiagnostics: item.evt.upperDiagnostics,
            })),
          ]),
        ),
        "text/csv",
      );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <header className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded bg-[#0D0D0D] text-[#B5FF4D]">
              <BarChart3 size={19} />
            </div>
            <div>
              <h1 className="text-[17px] font-bold">Market Range Lab</h1>
              <p className="text-xs text-[#6B7280]">歷史路徑與到期價格區間</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!active}
              onClick={() => exportResults("csv")}
            >
              <Download size={15} /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!active}
              onClick={() => exportResults("json")}
            >
              <Download size={15} /> JSON
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:p-6">
        <aside className="space-y-4">
          <section className="panel p-4">
            <div className="mb-4 flex items-center gap-2">
              <FileUp size={17} />
              <h2 className="text-sm font-bold">匯入歷史資料</h2>
            </div>
            <div className="space-y-3">
              <label>
                <span className="field-label">Symbol</span>
                <Input
                  value={symbol}
                  onChange={(event) =>
                    setSymbol(event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                <span className="field-label">資料來源 URL</span>
                <Input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                />
              </label>
              <label className="flex items-start gap-2 text-xs text-[#565656]">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>我確認 OHLC 使用一致的拆分調整基礎</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-[#565656]">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  checked={discontinuitiesConfirmed}
                  onChange={(event) =>
                    setDiscontinuitiesConfirmed(event.target.checked)
                  }
                />
                <span>我已檢視並確認檔案中被偵測的異常價格不連續</span>
              </label>
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#BDBDBD] bg-[#FAFAFA] text-sm hover:border-blue-600">
                <FileUp className="mb-2" size={20} />
                <span>選擇 Daily CSV</span>
                <input
                  className="sr-only"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleFile(event.target.files?.[0])}
                />
              </label>
              {active && (
                <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#D8D8D8] bg-white text-xs font-semibold hover:bg-[#F8F8F8]">
                  <FileUp size={14} />
                  <span>Weekly CSV 對帳（選用）</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) =>
                      void handleWeeklyFile(event.target.files?.[0])
                    }
                  />
                </label>
              )}
            </div>
            {messages.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-[#E5E5E5] pt-3 text-xs text-[#6B4F00]">
                {messages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
          </section>
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={17} />
                <h2 className="text-sm font-bold">本機資料集</h2>
              </div>
              <Tooltip content="Clear all locally stored datasets">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="清除全部"
                  onClick={async () => {
                    await clearDatasets();
                    setDatasets([]);
                    setActiveId("");
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
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setActiveId(dataset.id);
                      void setActiveDataset(dataset.id);
                    }}
                  >
                    <strong className="block text-sm">{dataset.symbol}</strong>
                    <span className="block truncate text-[11px] text-[#6B7280]">
                      {dataset.bars.length.toLocaleString()} sessions
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="刪除資料集"
                    onClick={async () => {
                      await deleteDataset(dataset.id);
                      const next = await listDatasets();
                      setDatasets(next);
                      if (activeId === dataset.id) {
                        const nextId = next[0]?.id ?? "";
                        setActiveId(nextId);
                        await setActiveDataset(nextId);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <div className="min-w-0 space-y-4">
          {!active ? (
            <section className="panel flex min-h-80 flex-col items-center justify-center p-8 text-center">
              <Database size={28} className="mb-3 text-[#6B7280]" />
              <h2 className="font-bold">匯入 Daily CSV 開始分析</h2>
              <p className="mt-2 max-w-md text-sm text-[#6B7280]">
                Daily 為權威資料；Weekly 僅可用於對帳，不會驅動風險分級。
              </p>
            </section>
          ) : (
            <>
              <section className="panel grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
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
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7280]">
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
                    </span>
                  </div>
                  {quoteError && !manualOverride && (
                    <p className="mt-2 text-xs text-red-700">
                      Yahoo 報價失敗：{quoteError}。
                    </p>
                  )}
                  {staleGrade && (
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
                      onChange={(event) => setQuotePaused(event.target.checked)}
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
                      onChange={(event) => {
                        setManualPrice(event.target.value);
                        setManualOverride(true);
                        setManualUpdatedAt(new Date().toISOString());
                        setQuoteError("");
                      }}
                    />
                  </label>
                  <Tooltip content="Refresh regular-session quote from Yahoo Finance">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="更新報價"
                      onClick={() => void refreshQuote(true)}
                    >
                      <RefreshCw size={16} />
                    </Button>
                  </Tooltip>
                </div>
              </section>

              {manualOverride && (
                <section className="panel grid gap-3 p-4 sm:grid-cols-2">
                  <label>
                    <span className="field-label">手動參考交易日（ET）</span>
                    <Input
                      type="date"
                      value={manualDate}
                      onChange={(event) => {
                        setManualDate(event.target.value);
                        setManualUpdatedAt(new Date().toISOString());
                      }}
                    />
                  </label>
                  <label>
                    <span className="field-label">手動參考時段</span>
                    <select
                      className="h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm"
                      value={manualSession}
                      onChange={(event) => {
                        setManualSession(
                          event.target.value as "intraday" | "closed",
                        );
                        setManualUpdatedAt(new Date().toISOString());
                      }}
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
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><h2 className="text-sm font-bold">目標週收盤區間</h2>{analysisLoading && <span className="flex items-center gap-1 text-xs text-[#6B7280]"><RefreshCw size={12} className="animate-spin" />統計更新中</span>}</div>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      {analysisIntraday
                        ? "Intraday Conservative Preview：以當前價為錨，沿用歷史 Open→High/Low/Close 全時段路徑。"
                        : "已收盤錨定：從下一交易時段開始計算路徑。"}
                    </p>
                    {historyStale && (
                      <p className="mt-1 text-xs font-semibold text-red-700">
                        Daily CSV 未更新至前一正常交易日{" "}
                        {previousRegularSession(anchorDate)}，分級已暫停。
                      </p>
                    )}
                    {analysisError && <p className="mt-1 text-xs font-semibold text-red-700">{analysisError}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {analyses.map((item) => (
                      <Button
                        key={item.weeks}
                        size="sm"
                        variant={horizon === item.weeks ? "accent" : "outline"}
                        onClick={() => setHorizon(item.weeks)}
                      >
                        {item.weeks}週
                      </Button>
                    ))}
                  </div>
                </div>
                {selected && (
                  <RiskTable analysis={selected} stale={gradePaused} />
                )}
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div className="panel p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-sm font-bold">自訂價格評估</h2>
                    <Tooltip content="Evaluates a continuous price; no option-chain strike rounding is applied.">
                      <Info size={14} className="text-[#6B7280]" />
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-[1fr_120px] gap-2">
                    <Input
                      className="num"
                      type="number"
                      step="0.01"
                      placeholder="例如 71.00"
                      value={candidate}
                      onChange={(event) => setCandidate(event.target.value)}
                    />
                    <select
                      className="h-10 rounded-md border border-[#D8D8D8] bg-white px-3 text-sm"
                      value={candidateSide}
                      onChange={(event) =>
                        setCandidateSide(
                          event.target.value as "lower" | "upper",
                        )
                      }
                    >
                      <option value="lower">下檔 / Put</option>
                      <option value="upper">上檔 / Call</option>
                    </select>
                  </div>
                  {selected && Number(candidate) > 0 && (
                    <CandidateResult
                      analysis={selected}
                      anchorPrice={anchorPrice}
                      price={Number(candidate)}
                      side={candidateSide}
                      stale={gradePaused}
                      active={active}
                      anchorDate={anchorDate}
                      intraday={analysisIntraday}
                    />
                  )}
                </div>
                <div className="panel p-4">
                  <h2 className="text-sm font-bold">指派預算疊合</h2>
                  <p className="mb-4 mt-1 text-xs text-[#6B7280]">
                    {candidateSide === "upper" && Number(candidate) > 0
                      ? "Call 候選價不套用指派預算；目前使用下檔 Safe 邊界。"
                      : "僅套用下檔 Put 候選價。"}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <label>
                      <span className="field-label">現金</span>
                      <Input
                        className="num"
                        type="number"
                        min="0"
                        value={cash}
                        onChange={(event) => setCash(event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="field-label">Budget 倍數</span>
                      <Input
                        className="num"
                        type="number"
                        min="0"
                        step="0.1"
                        value={multiple}
                        onChange={(event) => setMultiple(event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="field-label">既有義務</span>
                      <Input
                        className="num"
                        type="number"
                        min="0"
                        value={obligation}
                        onChange={(event) => setObligation(event.target.value)}
                      />
                    </label>
                  </div>
                  {!overlay.valid && (
                    <p className="mt-3 text-xs font-semibold text-red-700">
                      帳戶與價格輸入必須是有限的非負數。
                    </p>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
                    <dt className="text-[#6B7280]">指派預算</dt>
                    <dd className="num text-right font-semibold">
                      {money.format(overlay.budget)}
                    </dd>
                    <dt className="text-[#6B7280]">剩餘可用</dt>
                    <dd
                      className={`num text-right font-semibold ${overlay.available <= 0 ? "text-red-700" : ""}`}
                    >
                      {money.format(overlay.available)}
                      {overlay.available < 0 ? " · 已超額承擔" : ""}
                    </dd>
                    <dt className="text-[#6B7280]">Put 價每口現貨價值</dt>
                    <dd className="num text-right font-semibold">
                      {money.format(overlay.contractCost)}
                    </dd>
                  </dl>
                  <p className="mt-4 border-t border-[#E5E5E5] pt-3 text-xs text-[#6B7280]">
                    權利金不計；100
                    股整口可行性僅作內部預算檢查，不是建議張數。理論零權益下限不等於券商強平線。
                  </p>
                </div>
              </section>

              <section className="panel p-4 text-xs text-[#565656]">
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <strong className="text-[#0D0D0D]">歷史資料來源</strong>
                    <p className="mt-1">
                      {active.sourceUrl === INVESTING_SOURCE ? (
                        <a
                          className="text-blue-700 underline"
                          href={INVESTING_SOURCE}
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
                      全歷史等權、同週內位置配對、連續區塊 bootstrap。EVT
                      只是尾部壓力，不參與分級，也不假設正態分配。此工具不是投資建議。
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
}: {
  analysis: HorizonAnalysis;
  stale: boolean;
}) {
  const rows = [
    analysis.lower[0],
    analysis.lower[1],
    analysis.upper[1],
    analysis.upper[0],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-y border-[#E5E5E5] bg-[#FAFAFA] text-left text-xs text-[#6B7280]">
            <th className="px-3 py-2.5">方向</th>
            <th className="px-3 py-2.5">分級</th>
            <th className="px-3 py-2.5 text-right">價格</th>
            <th className="px-3 py-2.5 text-right">幅度</th>
            <th className="px-3 py-2.5 text-right"><TermHelp explanation="Expiration breach estimate / 95% confidence interval：估計週收盤穿越該價格的機率，中括號是考慮有限歷史樣本後的 95% 信賴區間。">到期估計 / 95% CI</TermHelp></th>
            <th className="px-3 py-2.5 text-right"><TermHelp explanation="Path-touch estimate / 95% confidence interval：不只看週收盤，而是統計期間內盤中曾觸及該價格的機率。">觸及估計 / 95% CI</TermHelp></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${index}-${row.price}`}
              className="border-b border-[#EFEFEF]"
            >
              <td className="px-3 py-3 font-medium">
                {index < 2 ? "下檔 / Put" : "上檔 / Call"}
              </td>
              <td className="px-3 py-3">
                {row.meetsTarget === false ? (
                  <span className="risk-insufficient inline-flex rounded px-2 py-1 text-xs font-bold">
                    門檻不可達
                  </span>
                ) : (
                  <Grade grade={stale ? "insufficient" : row.grade} />
                )}
              </td>
              <td className="num px-3 py-3 text-right font-bold">
                {row.meetsTarget === false ? "—" : money.format(row.price)}
              </td>
              <td className="num px-3 py-3 text-right">
                {row.meetsTarget === false
                  ? "—"
                  : percent.format(row.returnPct)}
              </td>
              <td className="num px-3 py-3 text-right">
                {percent.format(row.expirationBreach)} / [
                {percent.format(row.expirationLower95)},{" "}
                {percent.format(row.expirationUpper95)}]
                <small className="block text-[#6B7280]">
                  {Math.round(row.expirationBreach * analysis.sampleSize)} /{" "}
                  {analysis.sampleSize} events
                </small>
              </td>
              <td className="num px-3 py-3 text-right">
                {percent.format(row.pathTouch)} / [
                {percent.format(row.pathTouchLower95)},{" "}
                {percent.format(row.pathTouchUpper95)}]
                <small className="block text-[#6B7280]">
                  {Math.round(row.pathTouch * analysis.sampleSize)} /{" "}
                  {analysis.sampleSize} events
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="desktop-detail mt-4 grid grid-cols-2 gap-3 text-xs text-[#565656] lg:grid-cols-4">
        <div>
          <span className="block text-[#6B7280]">目標收盤</span>
          <strong>{analysis.targetDate}</strong>
        </div>
        <div>
          <span className="block text-[#6B7280]"><TermHelp explanation="N 是符合目前星期位置與期間的歷史路徑數；N_eff 是再考慮路徑重疊與序列自相關後的有效獨立樣本數。">N / N_eff</TermHelp></span>
          <strong className="num">
            {analysis.sampleSize} / {analysis.effectiveSampleSize}
          </strong>
        </div>
        <div>
          <span className="block text-[#6B7280]"><TermHelp explanation="Historical path 1st percentile：約只有 1% 的同類歷史路徑曾出現更深的盤中跌幅。這是經驗分位數，不是保證。">歷史路徑 1%</TermHelp></span>
          <strong className="num">
            {percent.format(analysis.empirical.pathLowPct)}
          </strong>
        </div>
        <div>
          <span className="block text-[#6B7280]"><TermHelp explanation="Historical path 99th percentile：約只有 1% 的同類歷史路徑曾出現更高的盤中漲幅。這是經驗分位數，不是保證。">歷史路徑 99%</TermHelp></span>
          <strong className="num">
            {percent.format(analysis.empirical.pathHighPct)}
          </strong>
        </div>
      </div>
      <div className="desktop-detail mt-3 grid grid-cols-2 gap-3 border-t border-[#EFEFEF] pt-3 text-xs text-[#565656] lg:grid-cols-4">
        <div>
          <span className="block text-[#6B7280]">路徑 1% bootstrap CI</span>
          <strong className="num">
            [{percent.format(analysis.bootstrap.pathLowPct[0])},{" "}
            {percent.format(analysis.bootstrap.pathLowPct[1])}]
          </strong>
        </div>
        <div>
          <span className="block text-[#6B7280]">路徑 99% bootstrap CI</span>
          <strong className="num">
            [{percent.format(analysis.bootstrap.pathHighPct[0])},{" "}
            {percent.format(analysis.bootstrap.pathHighPct[1])}]
          </strong>
        </div>
        <div>
          <span className="block text-[#6B7280]">歷史真實極值</span>
          <strong className="num">
            {percent.format(analysis.empirical.pathMinPct)} /{" "}
            {percent.format(analysis.empirical.pathMaxPct)}
          </strong>
        </div>
        <div>
          <span className="block text-[#6B7280]"><TermHelp explanation="Extreme Value Theory stress：只有尾部擬合通過穩定性與適合度檢查才顯示。它是壓力情境，不參與保守／安全分級。">EVT stress</TermHelp></span>
          <strong className="num">
            {analysis.evt.lowerStressPct === undefined
              ? "不可用"
              : percent.format(analysis.evt.lowerStressPct)}{" "}
            /{" "}
            {analysis.evt.upperStressPct === undefined
              ? "不可用"
              : percent.format(analysis.evt.upperStressPct)}
          </strong>
        </div>
      </div>
      {analysis.weeks > 4 && (
        <p className="mt-3 text-xs text-[#6B7280]">
          5–8 週只是情境分析，不顯示保守／安全決策等級。
        </p>
      )}
    </div>
  );
}

function CandidateResult({
  analysis,
  anchorPrice,
  price,
  side,
  stale,
  active,
  anchorDate,
  intraday,
}: {
  analysis: HorizonAnalysis;
  anchorPrice: number;
  price: number;
  side: "lower" | "upper";
  stale: boolean;
  active: HistoryDataset;
  anchorDate: string;
  intraday: boolean;
}) {
  const paths = useMemo(
    () =>
      extractMatchedPaths(active.bars, anchorDate, analysis.weeks, intraday),
    [active, anchorDate, analysis.weeks, intraday],
  );
  const result = evaluateCandidate(
    anchorPrice,
    price,
    side,
    paths,
    analysis.effectiveSampleSize,
    analysis.weeks,
  );
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#E5E5E5] pt-4 text-sm">
      <div>
        <span className="field-label">分級</span>
        <Grade grade={stale ? "insufficient" : result.grade} />
      </div>
      <div>
        <span className="field-label">相對當前價</span>
        <strong className="num">
          {percent.format(price / anchorPrice - 1)}
        </strong>
      </div>
      <div>
        <span className="field-label"><TermHelp explanation="到期估計是目標週收盤穿越候選價的歷史比例；95% CI 反映有限樣本造成的不確定性。">到期估計 / 95% CI</TermHelp></span>
        <strong className="num">
          {percent.format(result.expirationBreach)} / [
          {percent.format(result.expirationLower95)},{" "}
          {percent.format(result.expirationUpper95)}]
        </strong>
        <small className="block text-[#6B7280]">
          {Math.round(result.expirationBreach * paths.length)} / {paths.length}{" "}
          events
        </small>
      </div>
      <div>
        <span className="field-label"><TermHelp explanation="盤中觸及會檢查整條價格路徑的最高或最低點，因此通常高於只看週收盤的到期穿越機率。">盤中觸及估計 / 95% CI</TermHelp></span>
        <strong className="num">
          {percent.format(result.pathTouch)} / [
          {percent.format(result.pathTouchLower95)},{" "}
          {percent.format(result.pathTouchUpper95)}]
        </strong>
        <small className="block text-[#6B7280]">
          {Math.round(result.pathTouch * paths.length)} / {paths.length} events
        </small>
      </div>
    </div>
  );
}
