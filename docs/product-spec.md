# Market Range Dashboard Product Spec

## Purpose

Build a local dashboard that imports split-adjusted daily or weekly price history for a US-listed stock or ETF, obtains a best-effort current regular-session quote, and estimates downside and upside price ranges through the next one to eight trading-week closes. The product reports historical closing-breach and intraperiod touch probabilities; it does not issue orders or recommend position quantities.

## Scope

Supported instruments are US-listed common stocks and ETFs during regular market sessions in `America/New_York`. Cryptoassets, futures, non-US listings, and option contracts as historical datasets are excluded.

The first version excludes option chains, premiums, Greeks, broker margin, precise liquidation prices, trade quantities, order entry, IBKR integration, and public deployment.

## Inputs

- Symbol, entered explicitly and checked against Yahoo metadata.
- Daily CSV, preferred because it preserves session-level paths.
- Weekly CSV, accepted as a lower-resolution canonical fallback and optionally compared with Daily History.
- Current regular-session quote from Yahoo, or a visibly identified manual override.
- Cash balance, Assignment Budget Multiple, and Existing Assignment Obligation.
- One selected Candidate Price for detailed evaluation, while system-generated range boundaries remain continuous prices.
- Optional advanced overrides for grading thresholds; every override is included in exports.

For Investing.com exports, the column mapper defaults `Date`, `Price -> Close`, `Open`, `High`, `Low`, and optional `Vol.`. `Change %` is recomputed from Close values and used only as a discrepancy check.

## Historical Data Provenance

The current SOXL history source is the user-downloaded Investing.com page documented in [data-sources.md](./data-sources.md). The UI displays provider, source URL, filename, content hash, import time, date range, and row counts. Historical files remain local.

## Import Validation

The importer supports explicit column mapping, common US date formats, thousands separators, percentages, and `K/M/B` volume suffixes. It sorts accepted rows chronologically after validating them.

Duplicate dates, nonpositive OHLC values, non-finite values, `High < max(Open, Close)`, and `Low > min(Open, Close)` are rejected with row-level errors. Suspected split or adjustment discontinuities require explicit confirmation; confirmed mixed-basis OHLC is rejected. Volume is optional.

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

Primary ranges and breach rates are empirical. Contiguous-block bootstrap provides 95% confidence intervals while preserving serial dependence. EVT may provide a separate stress estimate only when fit diagnostics pass; it cannot replace an observed extreme or assign a Safety Grade. Normal-distribution assumptions are not used.

For every horizon and Candidate Price, calculate separately:

- downside expiration closing-breach probability
- downside intraperiod low-touch probability
- upside expiration closing-breach probability
- upside intraperiod high-touch probability
- empirical range boundaries and historical extremes
- bootstrap confidence intervals and effective independent path count
- EVT stress estimates when valid

Probabilities are not added. The overall grade uses the more adverse side-specific classification.

## Safety Grades

Grades use 95% upper confidence bounds, not point estimates.

| Internal grade | UI label | Expiration breach | Path touch |
| --- | --- | ---: | ---: |
| Conservative | `符合保守門檻` | <= 0.5% | <= 1% |
| Safe | `符合安全門檻` | <= 2% | <= 5% |
| Dangerous | `超出安全門檻` | either Safe limit exceeded | either Safe limit exceeded |

The UI describes grades as threshold classifications. It never displays `Dangerous` as a prediction that a boundary will certainly be touched, and grade tooltips explicitly distinguish threshold failure from certainty.

Fewer than 100 effective independent paths produces `Insufficient Evidence`, not a grade. Scenario Horizons are also ungraded. Advanced overrides are allowed but remain explicit in the UI and export.

## Candidate Prices

Model boundaries are continuous prices and are displayed to the symbol's supported precision. They are not rounded to assumed option strike intervals. A dedicated input evaluates any user-entered price such as `$100` or `$105` against every selected horizon.

Downside levels support put-oriented analysis; upside levels support call-oriented analysis. The account overlay applies only to downside put assignment. Upside call levels are statistical and never labeled capital-safe.

## Assignment Budget Overlay

The overlay calculates:

```text
Assignment Budget = Cash * Assignment Budget Multiple
Available Assignment Budget = Assignment Budget - Existing Assignment Obligation
```

Existing Assignment Obligation defaults to zero. The application never assumes that a user already holds an option position; only a user-entered and locally saved obligation reduces the available budget.

Premium is ignored conservatively. Whole 100-share contract feasibility may be evaluated internally for a Candidate Price, but the UI reports only budget coverage and never recommends a quantity. A negative available budget is displayed as over-committed. Any zero-equity floor is labeled theoretical and is not presented as a broker liquidation price.

## Dashboard Workflow

1. Choose or add an Active Symbol.
2. Import a Daily CSV when available, or a Weekly CSV for lower-resolution analysis; optionally compare matching daily and weekly histories.
3. Review data provenance, quality errors, adjustment warnings, and freshness.
4. Enter cash, assignment multiple, existing obligation, and optional Candidate Price.
5. Review the one-to-eight-week summary table.
6. Select a horizon for detailed distribution, range, touch, close, confidence, and stress views.
7. Optionally pause quote refresh, override the Reference Price, or export the result.

The Candidate Price panel displays the inherited ET Reference Date and session state together with the selected horizon's Target Week Close. Changing a Candidate Price never silently changes that evaluation context.

Analysis recomputes automatically after a fresh 30-second quote or a debounced input change. There is no primary `Run Analysis` button.

## Interface Direction

Use React, TypeScript, Tailwind, and shadcn/ui with a Ramp-inspired light, data-dense product layout. Use blue for actions, green for Conservative, blue for Safe, and red for Dangerous; Ramp lime is a limited accent and never communicates safety. Numeric values use tabular figures.

The desktop-first layout targets widths of 1280px and above, remains usable on tablets, and offers summary-only mobile views. The main surface contains a compact quote/status bar, parameter sidebar, multi-horizon comparison table, selected-horizon chart, candidate evaluator, and data-quality drawer. Avoid marketing heroes, nested cards, excessive rounding, and decorative gradients.

The primary language is Traditional Chinese. Canonical English terms appear in tooltips. Monetary values default to USD; market time is shown in ET with Taiwan time alongside it.

## Local Persistence And Privacy

Multiple symbol datasets are stored in IndexedDB, with one Active Symbol at a time. CSV contents, account inputs, and results remain local; only the symbol is sent to Yahoo for quote lookup. Users can clear one symbol or all local data.

Each stored dataset includes source metadata, original filename, SHA-256 hash, date range, accepted/rejected counts, import time, and model version.

## Export

The first version exports JSON and CSV, not PDF. Exports include all inputs, data provenance, file hash, model version, thresholds, quote source and timestamp, path counts, estimates, confidence intervals, warnings, and results for all horizons.

## Failure States

- Missing or invalid required columns: block import and show row/column guidance.
- Mixed or invalid OHLC basis: reject the dataset.
- Suspicious adjustment discontinuity: require confirmation.
- Stale historical file: show ranges but suppress grades.
- Stale or failed Yahoo quote: pause automatic grading and offer manual price.
- Unsupported symbol metadata: reject automatic mode and explain the supported universe.
- Insufficient effective paths: show estimates and `Insufficient Evidence` without a grade.

## Auditability

Every visible result exposes its source period, eligible path count, effective independent path count, empirical event count, point estimate, confidence interval, model version, data hash, and quote timestamp. The product must never display a bare `0%` without its event count and confidence bound.
