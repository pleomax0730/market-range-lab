import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Database,
  FileUp,
  Gauge,
  Layers3,
  Menu,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  buildSnapshot,
  expiries,
  profiles,
  riskCopy,
  type RiskKey,
  type SymbolKey,
  type VariantKey,
} from "./data";

export type PrototypeState = {
  symbol: SymbolKey;
  setSymbol: (symbol: SymbolKey) => void;
  days: number;
  setDays: (days: number) => void;
  risk: RiskKey;
  setRisk: (risk: RiskKey) => void;
  view: "range" | "recovery" | "evidence";
  setView: (view: "range" | "recovery" | "evidence") => void;
  insightOpen: boolean;
  setInsightOpen: (value: boolean) => void;
};

const money = (value: number) => "$" + value.toFixed(2);
const percent = (value: number) => value.toFixed(1) + "%";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <BarChart3 size={compact ? 18 : 22} />
      </span>
      <span>
        <strong>Market Range</strong>
        {!compact && <small>價格路徑實驗室</small>}
      </span>
    </div>
  );
}

export function PrototypeBadge() {
  return (
    <span className="prototype-badge">
      <Sparkles size={13} />
      視覺原型 · 示意資料
    </span>
  );
}

export function SymbolSelect({
  symbol,
  setSymbol,
}: Pick<PrototypeState, "symbol" | "setSymbol">) {
  return (
    <label className="symbol-select">
      <span>標的</span>
      <span className="select-shell">
        <Search size={16} aria-hidden="true" />
        <select
          value={symbol}
          onChange={(event) => setSymbol(event.target.value as SymbolKey)}
          aria-label="選擇標的"
        >
          {Object.keys(profiles).map((key) => (
            <option key={key} value={key}>
              {key} · {profiles[key as SymbolKey].name}
            </option>
          ))}
        </select>
        <ChevronDown size={15} aria-hidden="true" />
      </span>
    </label>
  );
}

export function ExpiryPicker({
  days,
  setDays,
  condensed = false,
}: Pick<PrototypeState, "days" | "setDays"> & { condensed?: boolean }) {
  return (
    <div className={condensed ? "expiry-picker condensed" : "expiry-picker"}>
      <div className="control-heading">
        <span>
          <CalendarDays size={16} />
          到期日
        </span>
        <small>以剩餘交易日配對歷史</small>
      </div>
      <div className="expiry-track" role="radiogroup" aria-label="選擇到期日">
        {expiries.map((expiry) => (
          <button
            key={expiry.days}
            className={days === expiry.days ? "active" : ""}
            onClick={() => setDays(expiry.days)}
            role="radio"
            aria-checked={days === expiry.days}
          >
            <strong>{expiry.date}</strong>
            <span>{expiry.label}</span>
            <em>{expiry.days} 日</em>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RiskSelector({
  risk,
  setRisk,
  vertical = false,
}: Pick<PrototypeState, "risk" | "setRisk"> & { vertical?: boolean }) {
  return (
    <div className={vertical ? "risk-selector vertical" : "risk-selector"}>
      {(Object.keys(riskCopy) as RiskKey[]).map((key, index) => (
        <button
          key={key}
          className={risk === key ? "active" : ""}
          onClick={() => setRisk(key)}
          aria-pressed={risk === key}
        >
          <span className="risk-index">0{index + 1}</span>
          <span>
            <strong>{riskCopy[key].label}</strong>
            <small>{riskCopy[key].short}</small>
          </span>
          <span className="risk-dot" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export function PriceIdentity({
  symbol,
  days,
}: Pick<PrototypeState, "symbol" | "days">) {
  const { profile, confidence } = buildSnapshot(symbol, days, "safe");
  return (
    <div className="price-identity">
      <div>
        <span className="identity-kicker">ACTIVE SYMBOL</span>
        <h1>
          {symbol}
          <span>{money(profile.price)}</span>
        </h1>
        <p>{profile.name}</p>
      </div>
      <div className="market-state">
        <span className={profile.change < 0 ? "negative" : "positive"}>
          {profile.change > 0 ? "+" : ""}
          {profile.change.toFixed(2)}%
        </span>
        <small>08/27 16:00 ET · 已收盤</small>
        <em>{confidence}</em>
      </div>
    </div>
  );
}

export function MetricRail({
  state,
  minimal = false,
}: {
  state: PrototypeState;
  minimal?: boolean;
}) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  const min = snapshot.levels[0].strike * 0.92;
  const max = snapshot.profile.price * 1.035;
  const position = (value: number) => ((value - min) / (max - min)) * 100;
  const activeLabel = riskCopy[state.risk].label;

  return (
    <section className={minimal ? "metric-rail minimal" : "metric-rail"}>
      <div className="rail-heading">
        <div>
          <span className="section-label">PUT DECISION RANGE</span>
          <h2>
            別先看表格。
            <br />
            先看距離。
          </h2>
        </div>
        <p>
          在 {state.days} 個交易日的歷史配對中，
          <strong>{activeLabel}</strong>候選價位於
          <strong>{money(snapshot.active.strike)}</strong>。
        </p>
      </div>

      <div className="range-instrument" aria-label="候選價相對目前價格">
        <div className="instrument-scale">
          {Array.from({ length: 9 }).map((_, index) => (
            <i key={index} />
          ))}
        </div>
        <div className="instrument-band">
          <span
            className="safe-zone"
            style={{
              left: position(snapshot.levels[0].strike) + "%",
              width:
                position(snapshot.levels[2].strike) -
                position(snapshot.levels[0].strike) +
                "%",
            }}
          />
          {snapshot.levels.map((level) => (
            <button
              key={level.risk}
              className={state.risk === level.risk ? "level active" : "level"}
              style={{ left: position(level.strike) + "%" }}
              onClick={() => state.setRisk(level.risk)}
              aria-label={
                riskCopy[level.risk].label +
                "，" +
                level.strike.toFixed(2) +
                " 美元"
              }
            >
              <span>{riskCopy[level.risk].label}</span>
              <strong>{money(level.strike)}</strong>
            </button>
          ))}
          <div
            className="current-pin"
            style={{ left: position(snapshot.profile.price) + "%" }}
          >
            <span>目前</span>
            <strong>{money(snapshot.profile.price)}</strong>
          </div>
        </div>
        <div className="instrument-axis">
          <span>{"$" + Math.round(min)}</span>
          <span>價格距離</span>
          <span>{"$" + Math.round(max)}</span>
        </div>
      </div>
    </section>
  );
}

export function DecisionStrip({ state }: { state: PrototypeState }) {
  const { levels } = buildSnapshot(state.symbol, state.days, state.risk);
  return (
    <div className="decision-strip" aria-label="比較風險層級">
      {levels.map((level) => (
        <button
          key={level.risk}
          className={state.risk === level.risk ? "decision active" : "decision"}
          onClick={() => state.setRisk(level.risk)}
          aria-pressed={state.risk === level.risk}
        >
          <span>
            <i className={"tone " + level.risk} />
            Put · {riskCopy[level.risk].label}
          </span>
          <strong>{money(level.strike)}</strong>
          <em>{percent(level.discount)}</em>
          <dl>
            <div>
              <dt>到期跌破</dt>
              <dd>{percent(level.expiry)}</dd>
            </div>
            <div>
              <dt>期間觸及</dt>
              <dd>{percent(level.touch)}</dd>
            </div>
          </dl>
        </button>
      ))}
    </div>
  );
}

export function EvidencePanel({ state }: { state: PrototypeState }) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  const active = snapshot.active;
  const selectedExpiry = expiries.find((expiry) => expiry.days === state.days);
  return (
    <section className="evidence-panel">
      <div className="evidence-head">
        <div>
          <span className="section-label">WHY THIS RANGE</span>
          <h3>模型證據，不藏在 tooltip 裡</h3>
        </div>
        <button
          className="quiet-button"
          onClick={() => state.setInsightOpen(true)}
        >
          查看完整推理
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="evidence-grid">
        <article>
          <span className="evidence-icon">
            <CalendarDays size={18} />
          </span>
          <small>時間配對</small>
          <strong>{state.days} 個交易日</strong>
          <p>歷史起點與目前星期位置一致，目標 {selectedExpiry?.date}。</p>
        </article>
        <article>
          <span className="evidence-icon">
            <Database size={18} />
          </span>
          <small>有效路徑</small>
          <strong>{active.events} 組</strong>
          <p>
            {snapshot.profile.sessions.toLocaleString()} 個日線交易日，等權重重播。
          </p>
        </article>
        <article>
          <span className="evidence-icon">
            <ShieldCheck size={18} />
          </span>
          <small>單側認證</small>
          <strong>{snapshot.confidence}</strong>
          <p>分級依據是風險上限，不把點估計當成保證。</p>
        </article>
      </div>
    </section>
  );
}

export function RecoveryModule({ state }: { state: PrototypeState }) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  const recoveries = snapshot.profile.recovery[state.risk];
  const horizons = [5, 20, 60, 120];
  return (
    <section className="recovery-module">
      <div className="recovery-copy">
        <span className="section-label">IF ASSIGNED</span>
        <h3>被接股之後，時間才是第二個履約價。</h3>
        <p>
          以 {money(snapshot.active.strike)} 接股的歷史事件，追蹤收盤重新站回履約價所需時間。
        </p>
      </div>
      <div className="recovery-steps">
        {recoveries.map((value, index) => (
          <div key={horizons[index]} className="recovery-step">
            <span>{horizons[index]} 日內</span>
            <strong>{value}%</strong>
            <div>
              <i style={{ transform: "scaleX(" + value / 100 + ")" }} />
            </div>
            <small>
              {index === 0
                ? "快速回復"
                : index === 3
                  ? "長期觀察"
                  : "歷史累積"}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DataDock({ state }: { state: PrototypeState }) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  return (
    <aside className="data-dock">
      <div className="dock-top">
        <span>
          <Layers3 size={16} />
          Data dock
        </span>
        <PrototypeBadge />
      </div>
      <SymbolSelect symbol={state.symbol} setSymbol={state.setSymbol} />
      <button
        className="import-tile"
        disabled
        title="視覺原型未連接 CSV 匯入"
      >
        <FileUp size={22} />
        <span>
          <strong>匯入歷史 CSV</strong>
          <small>Daily 可多選 · Weekly 可單獨分析</small>
        </span>
      </button>
      <div className="dataset-line">
        <span className="dataset-symbol">{state.symbol}</span>
        <span>
          <strong>{snapshot.profile.history}</strong>
          <small>{snapshot.profile.sessions.toLocaleString()} sessions</small>
        </span>
        <i aria-label="資料已就緒" />
      </div>
      <RiskSelector risk={state.risk} setRisk={state.setRisk} vertical />
      <button className="model-note" onClick={() => state.setInsightOpen(true)}>
        <CircleHelp size={17} />
        <span>
          <strong>這不是 Delta</strong>
          <small>用歷史路徑估計，不使用 option chain。</small>
        </span>
      </button>
    </aside>
  );
}

export function ViewTabs({ state }: { state: PrototypeState }) {
  const tabs = [
    { value: "range", label: "候選區間", icon: Gauge },
    { value: "recovery", label: "履約後回復", icon: RotateCcw },
    { value: "evidence", label: "模型證據", icon: BookOpen },
  ] as const;
  return (
    <div className="view-tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            className={state.view === tab.value ? "active" : ""}
            onClick={() => state.setView(tab.value)}
            role="tab"
            aria-selected={state.view === tab.value}
          >
            <Icon size={15} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function ContextPanel({ state }: { state: PrototypeState }) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  const active = snapshot.active;
  return (
    <aside className="context-panel">
      <div className="context-status">
        <Activity size={17} />
        <span>
          <small>目前判讀</small>
          <strong>{riskCopy[state.risk].label}候選價已載入</strong>
        </span>
      </div>
      <div className="context-price">
        <small>候選履約價</small>
        <strong>{money(active.strike)}</strong>
        <span>
          <ArrowDownRight size={15} />
          距現價 {Math.abs(active.discount).toFixed(1)}%
        </span>
      </div>
      <dl className="context-stats">
        <div>
          <dt>到期跌破</dt>
          <dd>{percent(active.expiry)}</dd>
        </div>
        <div>
          <dt>期間觸及</dt>
          <dd>{percent(active.touch)}</dd>
        </div>
        <div>
          <dt>有效路徑</dt>
          <dd>{active.events}</dd>
        </div>
      </dl>
      <div className="context-explain">
        <strong>{riskCopy[state.risk].short}</strong>
        <p>{riskCopy[state.risk].description}</p>
      </div>
      <button
        className="primary-action"
        onClick={() => state.setInsightOpen(true)}
      >
        打開模型說明
        <ArrowRight size={16} />
      </button>
    </aside>
  );
}

export function InsightDrawer({
  open,
  onClose,
  state,
}: {
  open: boolean;
  onClose: () => void;
  state: PrototypeState;
}) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], select, input, [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        className="drawer-scrim visible"
        onClick={onClose}
        aria-label="關閉模型說明"
      />
      <aside
        ref={drawerRef}
        className="insight-drawer open"
        role="dialog"
        aria-modal="true"
        aria-labelledby="insight-drawer-title"
      >
        <div className="drawer-head">
          <span id="insight-drawer-title">
            <Gauge size={18} />
            模型說明
          </span>
          <button ref={closeButtonRef} onClick={onClose} aria-label="關閉">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-hero">
          <small>
            {state.symbol} · {state.days} 個交易日
          </small>
          <strong>{money(snapshot.active.strike)}</strong>
          <p>{riskCopy[state.risk].label}候選價</p>
        </div>
        <ol className="reasoning-list">
          <li>
            <span>1</span>
            <div>
              <strong>先按時間找相似路徑</strong>
              <p>以目前星期位置與實際剩餘交易日，從完整歷史抽出可比事件。</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>再看收盤跌破與盤中觸及</strong>
              <p>兩種失敗事件分開計算，不把收盤風險誤當成盤中風險。</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>最後用風險上限分級</strong>
              <p>以信賴上限判斷證據是否足夠，而不是用一條平均線宣稱安全。</p>
            </div>
          </li>
        </ol>
        <div className="drawer-warning">
          <CircleHelp size={18} />
          <p>原型數字是合成示意。正式產品仍需讀取你的 CSV 並執行完整模型。</p>
        </div>
      </aside>
    </>
  );
}

export function VariantSwitcher({
  variant,
  onChange,
}: {
  variant: VariantKey;
  onChange: (variant: VariantKey) => void;
}) {
  const variants: { key: VariantKey; label: string; note: string }[] = [
    { key: "signal", label: "A · Signal Desk", note: "操作工作台" },
    { key: "canvas", label: "B · Range Canvas", note: "分析畫布" },
    { key: "night", label: "C · Night Ledger", note: "研究帳本" },
  ];
  return (
    <nav className="variant-switcher" aria-label="切換視覺方向">
      {variants.map((item) => (
        <button
          key={item.key}
          className={variant === item.key ? "active" : ""}
          onClick={() => onChange(item.key)}
          aria-pressed={variant === item.key}
        >
          <strong>{item.label}</strong>
          <small>{item.note}</small>
        </button>
      ))}
    </nav>
  );
}

export function CanvasLegend({ state }: { state: PrototypeState }) {
  const snapshot = buildSnapshot(state.symbol, state.days, state.risk);
  return (
    <div className="canvas-legend">
      <span>
        <i className="legend-current" />
        目前 {money(snapshot.profile.price)}
      </span>
      {snapshot.levels.map((level) => (
        <button
          key={level.risk}
          onClick={() => state.setRisk(level.risk)}
          aria-pressed={state.risk === level.risk}
        >
          <i className={"tone " + level.risk} />
          {riskCopy[level.risk].label} {money(level.strike)}
        </button>
      ))}
    </div>
  );
}

export function MenuButton({ children }: { children?: ReactNode }) {
  return (
    <button
      className="menu-button"
      aria-label="原型選單尚未連接"
      disabled
      title="視覺原型未連接選單"
    >
      <Menu size={18} />
      {children}
    </button>
  );
}

export function RefreshButton() {
  return (
    <button
      className="refresh-button"
      disabled
      title="視覺原型未連接即時報價"
    >
      <RefreshCw size={16} />
      更新示意快照
    </button>
  );
}
