# Market Range Dashboard Product Spec

## Purpose

Build a local dashboard that imports split-adjusted daily or weekly price history for a US-listed stock or ETF, obtains a best-effort current regular-session quote, and estimates downside and upside price ranges through the next one to eight trading-week closes. The product reports historical closing-breach and intraperiod touch probabilities; it does not issue orders or recommend position quantities.

## Scope

Supported instruments are US-listed common stocks and ETFs during regular market sessions in `America/New_York`. Cryptoassets, futures, non-US listings, and option contracts as historical datasets are excluded.

The current version includes auditable historical compensation floors for cash-secured Put premiums. It excludes live option chains, theoretical option valuation, implied volatility, Greeks, account assignment-budget sizing, broker margin, precise liquidation prices, trade quantities, order entry, IBKR integration, and public deployment.

## Inputs

- Symbol, inferred from the uploaded filename (for example, `SOXL ETF Stock Price History Daily.csv`); company-name or long-token matches show a confirmation field so the Yahoo ticker can be corrected before import (for example, `PALANTIR -> PLTR`).
- Daily CSV, preferred because it preserves session-level paths.
- Weekly CSV, accepted as a lower-resolution canonical fallback and optionally compared with Daily History.
- Current regular-session quote from Yahoo, or a visibly identified manual override.
- One selected Candidate Price for detailed evaluation, while system-generated range boundaries remain continuous prices.
- Annual cash-secured capital-return hurdle, persisted locally and defaulted to 10%; changing it reprices the derived floors without recomputing historical paths.
- Optional advanced overrides for grading thresholds; every override is included in exports.

For Investing.com exports, the column mapper defaults `Date`, `Price -> Close`, `Open`, `High`, `Low`, and optional `Vol.`. `Change %` is recomputed from Close values and used only as a discrepancy check. The UI keeps the known source URL and OHLC attestation internally; users only choose Daily or Weekly CSV.

## Historical Data Provenance

The current SOXL history source is the user-downloaded Investing.com page documented in [data-sources.md](./data-sources.md). The UI displays provider, source URL, filename, content hash, import time, date range, and row counts. Historical files remain local.

## Import Validation

The importer supports explicit column mapping, common US date formats, thousands separators, percentages, and `K/M/B` volume suffixes. It sorts accepted rows chronologically after validating them.

Duplicate dates, nonpositive OHLC values, non-finite values, `High < max(Open, Close)`, and `Low > min(Open, Close)` are rejected with row-level errors. Suspected split or adjustment discontinuities are surfaced as warnings in the one-step UI; confirmed mixed-basis OHLC is rejected. Volume is optional.

For a Safety Grade, Daily History must extend through at least the regular session immediately preceding the Reference Price's session. Weekly-Only History must contain a weekly observation no more than two weeks behind the reference date. Older files may produce ranges with a stale-history warning but cannot produce a grade. Yahoo data does not backfill missing history.

## Quote Policy

The local server queries Yahoo every 30 seconds during the regular session and normalizes symbol, price, timestamp, exchange, session, and source. Pre-market, after-hours, and BOATS overnight values are excluded. Outside regular hours, the final regular close is used.

An open-session quote older than two minutes is stale: automatic grading pauses until a fresh quote arrives or the user enters a Manual Reference Price. Quote source, session, timestamp, ET time, Taiwan time, and override status are always visible.

## Calendar And Horizons

The application uses the US equity calendar and groups daily observations into Trading Weeks. A Target Week Close is normally Friday's regular close and becomes the preceding final session when Friday is closed.

All next one through eight Target Week Closes are calculated together. One through four weeks are Decision-Grade Horizons. Five through eight weeks are Scenario Horizons and always show a low-evidence warning without a Safety Grade.

Daily historical paths must start at the same weekday position as the current analysis and end at the corresponding Target Week Close. Weekly-Only History instead uses contiguous weekly bars: closed-session analysis starts from one weekly close and measures the next N weekly closes and intervening High/Low values. Missing weeks are not bridged. Weekly-only results are visibly labeled and cannot claim daily path order.

## Intraday Behavior

During an open session, the current regular-session quote is the Reference Price and the unfinished day is conservatively modeled as one complete session. Historical Open-to-High, Open-to-Low, and Open-to-Close returns are applied from the current quote so today's already-realized overnight gap is not counted twice. The result is labeled `Intraday Conservative Preview`.

Weekly-Only History cannot reconstruct a remaining daily session. During an open session it may show a visibly labeled weekly scenario preview, but Safety Grades are paused until a completed-session reference is available.

After the regular close, the result is a `Closed-Session Analysis` anchored to the completed close.

## Statistical Model

The sole analysis window is the full validated active dataset. Every eligible daily week-position-matched path or contiguous weekly path has equal weight regardless of date.

Primary ranges and breach rates use the more adverse of each equal-weight full-history path and the same path scaled from its start-date realized volatility to the current realized-volatility state. Daily scaling uses 20 completed sessions; Weekly-Only scaling uses 12 completed weeks. Scaling is capped to 0.5x-2x, and the unscaled full-history path is always retained so a low-volatility current regime cannot erase historical stress.

Contiguous-block bootstrap provides two-sided 95% confidence intervals while preserving serial dependence. Directional grade decisions instead use a one-sided 95% upper risk bound: the maximum of the one-sided block-bootstrap upper quantile and a one-sided Wilson upper bound using the effective sample size. EVT is aligned to the 0.5% expiration and 1% path tails and may provide a separate stress estimate only when fit diagnostics pass; it cannot independently certify a Safety Grade. Normal-distribution assumptions are not used.

For every horizon and Candidate Price, calculate separately:

- downside expiration closing-breach probability
- downside intraperiod low-touch probability
- upside expiration closing-breach probability
- upside intraperiod high-touch probability
- empirical range boundaries and historical extremes
- bootstrap confidence intervals and effective independent path count
- one-sided 95% risk upper bounds used for grading
- current-volatility adjustment diagnostics and model Conservative Estimate
- EVT stress estimates when valid
- expanding-window out-of-sample calibration results when more than 500 eligible paths exist

Probabilities are not added. The overall grade uses the more adverse side-specific classification.

For a downside Put Candidate Price, calculate expiration payoff loss on every matched historical path as `max(strike - projected expiration price, 0)`. Report mean loss, mean loss conditional on a positive payoff, a contiguous-block-bootstrap 95% interval for mean loss, CVaR95 across the worst 5% of losses, and the maximum observed loss.

The Put premium view reports four secondary historical references per share:

1. Statistical Compensation Floor: upper 95% mean-loss confidence bound plus $0.03 default transaction cost.
2. Capital Return Floor: Statistical Compensation Floor plus `strike * annual hurdle * calendar days / 365`; the annual hurdle defaults to 10% and is user-adjustable.
3. Light Tail Floor: Capital Return Floor plus `10% * (CVaR95 - mean loss)`.
4. Conservative Tail Floor: Capital Return Floor plus `25% * (CVaR95 - mean loss)`.

These defaults and formula components are visible and exported. The 10% and 25% tail additions are risk-preference assumptions, not statistically calibrated prices. The interface does not accept an executable market premium for comparison and never treats the floors as evidence that a Put is cheap or worth selling. Floor diagnostics never change the Candidate Price's Safety Grade. The model does not calculate a Naked Call minimum premium because finite history cannot bound its theoretical loss.

When fewer than 20 effective positive-payoff observations exist (`effective sample size * observed payoff rate`), or when no historical path produces a positive Put payoff, the interface shows an evidence warning. Bootstrap mean loss and historical CVaR cannot invent an unobserved jump loss; the resulting cost-and-capital-only references are not market fair value.

## Safety Grades

Grades use directional one-sided 95% upper risk bounds, not point estimates or the upper endpoint of the displayed two-sided confidence interval.

| Internal grade | UI label | Expiration breach | Path touch |
| --- | --- | ---: | ---: |
| Conservative | `符合保守門檻` | <= 0.5% | <= 1% |
| Safe | `符合安全門檻` | <= 2% | <= 5% |
| Dangerous | `超出安全門檻` | either Safe limit exceeded | either Safe limit exceeded |

The UI describes grades as threshold classifications. It never displays `Dangerous` as a prediction that a boundary will certainly be touched, and grade tooltips explicitly distinguish threshold failure from certainty.

Fewer than 100 effective independent paths produces `Insufficient Evidence`, not a grade. Scenario Horizons are also ungraded. Advanced overrides are allowed but remain explicit in the UI and export.

The UI always reports a distinctly labeled `Conservative Model Estimate` together with a separate `95% Certified Boundary`. The model estimate takes the more adverse of the volatility-adjusted 0.5% expiration quantile confidence bound, the 1% path-touch quantile confidence bound, and any diagnostics-approved EVT stress. Its badge states whether that estimated price itself passes certification; the separate certified boundary shows the most aggressive continuous price that finite evidence can certify.

For one- through four-week horizons with enough history, an expanding-window backtest starts after 500 training paths. Each historical prediction may use only earlier paths, applies the volatility state known at that test date, and reports subsequent expiration breaches and path touches. Backtest results are calibration evidence rather than a guarantee or a replacement for the current confidence gate.

## Candidate Prices

Model boundaries are continuous prices and are displayed to the symbol's supported precision. They are not rounded to assumed option strike intervals. A dedicated input evaluates any user-entered price such as `$100` or `$105` against every selected horizon.

Downside levels support put-oriented analysis; upside levels support call-oriented analysis. Upside call levels are statistical and never labeled capital-safe. Account sizing and assignment-budget feasibility are intentionally outside this dashboard's decision surface.

Downside Put candidates additionally show historical premium compensation floors. These are not option-chain quotes, Black-Scholes values, implied probabilities, or claims that a trade is worthwhile. Upper Call candidates explicitly suppress the premium floor because Naked Call loss is unbounded.

## Dashboard Workflow

1. Choose or add an Active Symbol.
2. Import a Daily CSV when available, or a Weekly CSV for lower-resolution analysis; optionally compare matching daily and weekly histories.
3. Review data provenance, quality errors, adjustment warnings, and freshness.
4. Enter an optional Candidate Price and choose Put or Call.
5. Review the one-to-eight-week summary table.
6. Select a horizon for detailed distribution, range, touch, close, confidence, and stress views.
7. For a downside Put candidate, review the four premium compensation floors.
8. Optionally pause quote refresh, override the Reference Price, or export the result.

The Candidate Price panel displays the inherited ET Reference Date and session state together with the selected horizon's Target Week Close. Changing a Candidate Price never silently changes that evaluation context.

Analysis recomputes automatically after a fresh 30-second quote or a debounced input change. There is no primary `Run Analysis` button. Candidate recalculation keeps the previous result footprint in place with an explicit updating state so downstream content does not jump.

## Interface Direction

Use React, TypeScript, Tailwind, and shadcn/ui with a Ramp-inspired light, data-dense product layout. Use blue for actions, green for Conservative, blue for Safe, and red for Dangerous; Ramp lime is a limited accent and never communicates safety. Numeric values use tabular figures.

The desktop-first layout targets widths of 1280px and above, remains usable on tablets, and keeps critical verification metrics visible on mobile in a 2-column grid. The multi-horizon table preserves Direction and Grade context while horizontally scrolling. The main surface contains a compact quote/status bar, parameter sidebar, multi-horizon comparison table, selected-horizon chart, candidate evaluator, and data-quality drawer. Avoid marketing heroes, nested cards, excessive rounding, and decorative gradients.

The primary language is Traditional Chinese. Canonical English terms appear in tooltips. Monetary values default to USD; market time is shown in ET with Taiwan time alongside it.

## Local Persistence And Privacy

Multiple symbol datasets are stored in IndexedDB, with one Active Symbol at a time. CSV contents and results remain local; only the symbol is sent to Yahoo for quote lookup. Users can clear one symbol or all local data.

Each stored dataset includes source metadata, original filename, SHA-256 hash, date range, accepted/rejected counts, import time, and model version.

## Export

The application exports JSON and CSV, not PDF. Exports include all inputs, data provenance, file hash, model version, thresholds, quote source and timestamp, path counts, estimates, confidence intervals, premium-floor assumptions and components, warnings, and results for all horizons.

## Failure States

- Missing or invalid required columns: block import and show row/column guidance.
- Mixed or invalid OHLC basis: reject the dataset.
- Suspicious adjustment discontinuity: import with a visible warning under the default attestation.
- Stale historical file: show ranges but suppress grades.
- Stale or failed Yahoo quote: pause automatic grading and offer manual price.
- Unsupported symbol metadata: reject automatic mode and explain the supported universe.
- Insufficient effective paths: show estimates and `Insufficient Evidence` without a grade.

## Auditability

Every visible result exposes its source period, eligible path count, effective independent path count, empirical event count, point estimate, confidence interval, model version, data hash, and quote timestamp. The product must never display a bare `0%` without its event count and confidence bound.
