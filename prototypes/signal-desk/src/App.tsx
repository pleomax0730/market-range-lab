/*
THESIS: Market risk becomes legible when price distance, time, and evidence share one instrument; this rejects the category-default dashboard of equal-weight cards.
OWN-WORLD: Three coherent explorations—measurement desk, annotated range canvas, and night research ledger—share one modular data language.
STORY: Choose a symbol and expiry, compare three risk postures, understand why the range exists, then inspect assignment recovery.
FIRST VIEWPORT: Current market state anchors the top; expiry becomes a navigable timeline; the main field is a price-distance instrument rather than a KPI grid.
FORM: Throwaway three-variant prototype. Signal Desk is the recommended operating direction; Canvas and Ledger challenge its density and reading rhythm.
*/
import { useEffect, useMemo, useState } from "react";
import {
  Brand,
  CanvasLegend,
  ContextPanel,
  DataDock,
  DecisionStrip,
  EvidencePanel,
  ExpiryPicker,
  InsightDrawer,
  MenuButton,
  MetricRail,
  PriceIdentity,
  PrototypeBadge,
  RecoveryModule,
  RefreshButton,
  RiskSelector,
  SymbolSelect,
  VariantSwitcher,
  ViewTabs,
  type PrototypeState,
} from "./components";
import {
  buildSnapshot,
  expiries,
  profiles,
  riskCopy,
  type RiskKey,
  type SymbolKey,
  type VariantKey,
} from "./data";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Database,
  FileUp,
  Gauge,
  History,
  LayoutPanelTop,
  MoonStar,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

const validVariants: VariantKey[] = ["signal", "canvas", "night"];
const money = (value: number) => "$" + value.toFixed(2);

function getInitialVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get("variant");
  return validVariants.includes(value as VariantKey)
    ? (value as VariantKey)
    : "signal";
}

function getInitialSymbol(): SymbolKey {
  const value = new URLSearchParams(window.location.search).get("symbol");
  return value === "TQQQ" || value === "NVDA" ? value : "SOXL";
}

function getInitialDays() {
  const value = Number(new URLSearchParams(window.location.search).get("days"));
  return expiries.some((expiry) => expiry.days === value) ? value : 6;
}

function getInitialRisk(): RiskKey {
  const value = new URLSearchParams(window.location.search).get("risk");
  return value === "conservative" || value === "aggressive" ? value : "safe";
}

function getInitialView(): "range" | "recovery" | "evidence" {
  const value = new URLSearchParams(window.location.search).get("view");
  return value === "recovery" || value === "evidence" ? value : "range";
}

function SignalDesk({ state }: { state: PrototypeState }) {
  return (
    <div className="prototype signal-desk">
      <header className="signal-header">
        <Brand />
        <div className="header-center">
          <span>Range instrument</span>
          <i />
          <span>Historical paths</span>
          <i />
          <span>Decision grade</span>
        </div>
        <div className="header-actions">
          <PrototypeBadge />
          <RefreshButton />
        </div>
      </header>

      <div className="signal-shell">
        <DataDock state={state} />
        <main className="signal-main">
          <div className="signal-market-row">
            <PriceIdentity symbol={state.symbol} days={state.days} />
            <ViewTabs state={state} />
          </div>
          <ExpiryPicker days={state.days} setDays={state.setDays} />

          {state.view === "range" && (
            <>
              <MetricRail state={state} />
              <DecisionStrip state={state} />
              <EvidencePanel state={state} />
            </>
          )}
          {state.view === "recovery" && (
            <>
              <RecoveryModule state={state} />
              <MetricRail state={state} minimal />
              <EvidencePanel state={state} />
            </>
          )}
          {state.view === "evidence" && (
            <>
              <EvidencePanel state={state} />
              <MetricRail state={state} minimal />
              <RecoveryModule state={state} />
            </>
          )}
        </main>
        <ContextPanel state={state} />
      </div>
    </div>
  );
}

function RangeCanvas({ state }: { state: PrototypeState }) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  const active = snapshot.active;
  const target = expiries.find((expiry) => expiry.days === state.days);

  return (
    <div className="prototype range-canvas">
      <header className="canvas-header">
        <Brand />
        <nav>
          <button className="active">研究畫布</button>
          <button>資料集</button>
          <button>模型筆記</button>
        </nav>
        <div>
          <PrototypeBadge />
          <MenuButton />
        </div>
      </header>

      <main className="canvas-main">
        <section className="canvas-intro">
          <div>
            <span className="canvas-issue">ANALYSIS SHEET · 08/27/2026</span>
            <h1>
              一段價格距離，
              <br />
              三種承擔方式。
            </h1>
            <p>
              把目前價、到期日與歷史尾部放在同一張畫布，而不是要求你在十張卡片之間記住關係。
            </p>
          </div>
          <div className="canvas-symbol">
            <SymbolSelect symbol={state.symbol} setSymbol={state.setSymbol} />
            <div className="canvas-quote">
              <span>{state.symbol}</span>
              <strong>{money(snapshot.profile.price)}</strong>
              <em className={snapshot.profile.change < 0 ? "negative" : "positive"}>
                {snapshot.profile.change > 0 ? "+" : ""}
                {snapshot.profile.change.toFixed(2)}%
              </em>
            </div>
            <small>Regular session close · synthetic snapshot</small>
          </div>
        </section>

        <section className="canvas-board">
          <div className="canvas-toolbar">
            <div>
              <CalendarDays size={17} />
              <span>
                <small>觀察到期</small>
                <strong>
                  {target?.date} · {state.days} 個交易日
                </strong>
              </span>
            </div>
            <ExpiryPicker
              days={state.days}
              setDays={state.setDays}
              condensed
            />
          </div>

          <div className="canvas-price-field">
            <CanvasLegend state={state} />
            <div className="canvas-chart">
              <svg
                viewBox="0 0 1000 420"
                role="img"
                aria-label="固定構圖示意，不代表真實模型路徑"
              >
                <path
                  className="path-ghost one"
                  d="M0 112 C95 100 120 178 205 156 S310 94 390 142 S505 255 585 202 S710 160 780 236 S905 318 1000 292"
                />
                <path
                  className="path-ghost two"
                  d="M0 114 C100 126 145 72 215 116 S330 244 420 214 S535 104 618 142 S735 272 805 208 S910 112 1000 148"
                />
                <path
                  className="path-ghost three"
                  d="M0 113 C92 158 146 210 216 186 S320 122 405 174 S520 306 600 284 S722 220 796 278 S905 365 1000 338"
                />
                <path
                  className="path-main"
                  d="M0 113 C88 104 138 145 222 136 S342 170 425 154 S540 224 626 208 S738 184 806 242 S918 272 1000 258"
                />
                <line x1="0" y1="113" x2="1000" y2="113" className="current-line" />
                <line x1="0" y1="258" x2="1000" y2="258" className="strike-line" />
                <circle cx="1000" cy="258" r="8" className="strike-point" />
              </svg>
              <div className="chart-current">
                <span>目前收盤</span>
                <strong>{money(snapshot.profile.price)}</strong>
              </div>
              <div className="chart-strike">
                <span>{riskCopy[state.risk].label}候選</span>
                <strong>{money(active.strike)}</strong>
              </div>
              <div className="chart-note note-one">
                固定構圖示意 · 歷史路徑不是預言，
                <br />
                是同時間跨度的壓力樣本。
              </div>
              <div className="chart-note note-two">
                到期跌破 {active.expiry.toFixed(1)}%
                <br />
                期間觸及 {active.touch.toFixed(1)}%
              </div>
            </div>
            <RiskSelector risk={state.risk} setRisk={state.setRisk} />
          </div>
        </section>

        <section className="canvas-notes">
          <article>
            <span>01</span>
            <div>
              <small>價格</small>
              <strong>{money(active.strike)}</strong>
              <p>距目前價 {Math.abs(active.discount).toFixed(1)}%</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <small>證據</small>
              <strong>{active.events} 組路徑</strong>
              <p>{snapshot.confidence} · 單側風險上限</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <small>若被接股</small>
              <strong>{snapshot.profile.recovery[state.risk][1]}%</strong>
              <p>示意：20 交易日內回到履約價</p>
            </div>
          </article>
          <button onClick={() => state.setInsightOpen(true)}>
            展開模型批註
            <ArrowRight size={17} />
          </button>
        </section>
      </main>
    </div>
  );
}

function NightLedger({ state }: { state: PrototypeState }) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  const active = snapshot.active;

  return (
    <div className="prototype night-ledger">
      <aside className="night-rail">
        <Brand compact />
        <nav aria-label="夜間帳本功能">
          <button className="active" aria-label="價格區間">
            <Gauge size={19} />
          </button>
          <button aria-label="歷史資料">
            <Database size={19} />
          </button>
          <button aria-label="回復分析">
            <RotateCcw size={19} />
          </button>
          <button aria-label="模型筆記">
            <BookOpen size={19} />
          </button>
        </nav>
        <button className="night-help" onClick={() => state.setInsightOpen(true)}>
          <CircleHelp size={19} />
        </button>
      </aside>

      <main className="night-main">
        <header className="night-header">
          <div>
            <span>RESEARCH LEDGER / PUT RANGE</span>
            <h1>{state.symbol} 下檔觀察</h1>
          </div>
          <div className="night-tools">
            <PrototypeBadge />
            <SymbolSelect symbol={state.symbol} setSymbol={state.setSymbol} />
          </div>
        </header>

        <section className="night-overview">
          <div className="night-price">
            <small>目前價格 · 08/27 close</small>
            <strong>{money(snapshot.profile.price)}</strong>
            <span className={snapshot.profile.change < 0 ? "negative" : "positive"}>
              {snapshot.profile.change > 0 ? "+" : ""}
              {snapshot.profile.change.toFixed(2)}%
            </span>
          </div>
          <div className="night-thesis">
            <span className="night-rule" />
            <p>
              你不是在挑一個漂亮數字；你是在選擇
              <strong>{state.days} 個交易日</strong>內願意承擔的歷史失敗頻率。
            </p>
          </div>
          <div className="night-grade">
            <small>證據狀態</small>
            <strong>{snapshot.confidence}</strong>
            <span>{active.events} matched paths</span>
          </div>
        </section>

        <section className="ledger-workspace">
          <div className="ledger-left">
            <div className="ledger-section-head">
              <span>
                <CalendarDays size={16} />
                到期航線
              </span>
              <small>選一個券商實際提供的日期</small>
            </div>
            <div className="ledger-expiries">
              {expiries.map((expiry) => (
                <button
                  key={expiry.days}
                  className={state.days === expiry.days ? "active" : ""}
                  onClick={() => state.setDays(expiry.days)}
                  aria-pressed={state.days === expiry.days}
                >
                  <span>{expiry.date}</span>
                  <strong>{expiry.label}</strong>
                  <em>{expiry.days}D</em>
                </button>
              ))}
            </div>

            <div className="ledger-section-head second">
              <span>
                <SlidersHorizontal size={16} />
                風險姿態
              </span>
              <small>選擇失敗率，不是假裝沒有風險</small>
            </div>
            <div className="ledger-levels">
              {snapshot.levels.map((level) => (
                <button
                  key={level.risk}
                  className={state.risk === level.risk ? "active" : ""}
                  onClick={() => state.setRisk(level.risk)}
                  aria-pressed={state.risk === level.risk}
                >
                  <span className={"ledger-signal " + level.risk} />
                  <div>
                    <small>{riskCopy[level.risk].label}</small>
                    <strong>{money(level.strike)}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>到期</dt>
                      <dd>{level.expiry.toFixed(1)}%</dd>
                    </div>
                    <div>
                      <dt>觸及</dt>
                      <dd>{level.touch.toFixed(1)}%</dd>
                    </div>
                  </dl>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          </div>

          <div className="ledger-focus">
            <div className="focus-orbit">
              <span className="orbit-label">SELECTED STRIKE</span>
              <strong>{money(active.strike)}</strong>
              <em>{active.discount.toFixed(1)}%</em>
              <svg viewBox="0 0 300 300" aria-hidden="true">
                <circle cx="150" cy="150" r="108" />
                <circle
                  cx="150"
                  cy="150"
                  r="108"
                  className="orbit-progress"
                  pathLength="100"
                  strokeDasharray="72 100"
                />
              </svg>
            </div>
            <p>{riskCopy[state.risk].description}</p>
            <button onClick={() => state.setInsightOpen(true)}>
              閱讀這個數字怎麼來
              <ArrowRight size={16} />
            </button>
          </div>

          <aside className="ledger-evidence">
            <div className="ledger-section-head">
              <span>
                <ShieldCheck size={16} />
                證據帳
              </span>
              <small>逐條核對，不只看結論</small>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>時間跨度已配對</strong>
                  <p>{state.days} 個交易日 · 同星期位置</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>路徑數量可讀</strong>
                  <p>{active.events} 組有效事件</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>風險未被平均掉</strong>
                  <p>到期跌破與盤中觸及分開</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>回復時間可追蹤</strong>
                  <p>20 日內回復 {snapshot.profile.recovery[state.risk][1]}%</p>
                </div>
              </li>
            </ol>
            <div className="ledger-caution">
              <MoonStar size={17} />
              <p>示意原型。正式結果仍取決於匯入資料品質與模型版本。</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [variant, setVariant] = useState<VariantKey>(getInitialVariant);
  const [symbol, setSymbol] = useState<SymbolKey>(getInitialSymbol);
  const [days, setDays] = useState(getInitialDays);
  const [risk, setRisk] = useState<RiskKey>(getInitialRisk);
  const [view, setView] =
    useState<"range" | "recovery" | "evidence">(getInitialView);
  const [insightOpen, setInsightOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.variant = variant;
    const params = new URLSearchParams(window.location.search);
    params.set("variant", variant);
    params.set("symbol", symbol);
    params.set("days", String(days));
    params.set("risk", risk);
    params.set("view", view);
    window.history.replaceState(null, "", "?" + params.toString());
  }, [variant, symbol, days, risk, view]);

  const state = useMemo<PrototypeState>(
    () => ({
      symbol,
      setSymbol,
      days,
      setDays,
      risk,
      setRisk,
      view,
      setView,
      insightOpen,
      setInsightOpen,
    }),
    [symbol, days, risk, view, insightOpen],
  );

  return (
    <>
      {variant === "signal" && <SignalDesk state={state} />}
      {variant === "canvas" && <RangeCanvas state={state} />}
      {variant === "night" && <NightLedger state={state} />}
      <InsightDrawer
        open={insightOpen}
        onClose={() => setInsightOpen(false)}
        state={state}
      />
      <VariantSwitcher variant={variant} onChange={setVariant} />
    </>
  );
}
