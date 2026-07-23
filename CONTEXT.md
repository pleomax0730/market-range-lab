# Market Range Analysis

This context estimates forward price ranges for a market symbol from its historical price paths. It communicates statistical boundaries and uncertainty, not position sizing or trade instructions.

## Language

**Supported Symbol**:
A common stock or exchange-traded fund listed in the United States and observed during the regular US equity trading session.
_Avoid_: Option contract, futures contract, cryptocurrency, non-US listing

**Active Symbol**:
The one Supported Symbol whose stored history, quote, inputs, and analysis are currently displayed.
_Avoid_: Portfolio, watchlist

**Trading Week**:
The regular US equity trading sessions grouped by the applicable exchange calendar in the `America/New_York` time zone, including holiday-shortened weeks.
_Avoid_: Seven-day window, five-row assumption

**Target Week Close**:
The regular-session close of the final trading day in a selected Trading Week. It is normally Friday's close and moves to Thursday or another preceding session when Friday is closed.
_Avoid_: Target Friday, calendar-week end

**Canonical Price History**:
The one active, split-adjusted OHLC dataset used for a symbol's calculations. Daily History is preferred; Weekly-Only History is an explicit lower-resolution fallback when Daily History is unavailable.
_Avoid_: Simultaneous calculation sources, option chain, live quote

**Daily History**:
Daily OHLC observations that preserve session-level path detail and support weekday-position-matched analysis.
_Avoid_: Weekly approximation

**Weekly-Only History**:
Uploaded weekly OHLC observations used as the Canonical Price History when no Daily History is available. It supports sequential weekly close and within-week High/Low analysis but cannot reconstruct daily order.
_Avoid_: Daily precision, reconciliation-only file

**Split-Adjusted Price**:
A historical price restated so stock splits do not appear as market returns, with the same adjustment factor applied consistently to Open, High, Low, and Close.
_Avoid_: Total-return price, adjusted Close paired with unadjusted OHLC

**Derived Weekly History**:
Weekly OHLC observations aggregated by the system from Daily History.
_Avoid_: Uploaded weekly history

**Weekly Reconciliation Dataset**:
An uploaded weekly OHLC file compared with Daily History when both are available. The same file may instead become Weekly-Only History when selected as the Active dataset.
_Avoid_: Hidden secondary calculation source

**Full-History Baseline**:
All valid observations in the active Canonical Price History, from its earliest available period through its latest completed period, used as the sole historical analysis window.
_Avoid_: Recent regime, rolling lookback

**Equal-Weight Historical Path**:
An eligible historical path whose contribution to an empirical probability estimate is identical to every other eligible path, regardless of its date.
_Avoid_: Recency weight, regime weight

**Week-Position-Matched Path**:
An eligible historical path that begins at the same weekday position as the analysis reference and ends at the corresponding Target Week Close for the selected horizon.
_Avoid_: Arbitrary trading-session window

**Contiguous Weekly Path**:
An eligible Weekly-Only History path that starts from a weekly Open or Close, advances through consecutive weekly bars for the selected horizon, and uses their High/Low values for touch evidence.
_Avoid_: Weekday-matched daily path, bridged missing week

**Empirical Range Estimate**:
A Statistical Price Range calculated directly from observed Equal-Weight Historical Paths in the Full-History Baseline.
_Avoid_: Normal-distribution forecast, simulated fact

**Bootstrap Confidence Interval**:
An uncertainty interval around an empirical estimate produced by resampling contiguous historical blocks rather than independent daily observations.
_Avoid_: Forecast range, additional historical evidence

**One-Sided Risk Upper Bound**:
The directional 95% upper bound used to decide whether an Expiration Breach Probability or Path Touch Probability is below a grade threshold. It is the more conservative of a one-sided block-bootstrap upper quantile and a one-sided Wilson bound based on effective sample size; it is distinct from the displayed two-sided 95% confidence interval.
_Avoid_: Two-sided interval endpoint, guaranteed maximum probability

**Volatility-Adjusted Historical Path**:
An Equal-Weight Historical Path whose log price moves are scaled by current realized volatility divided by realized volatility at the path's start. The scale is capped, and grading retains the more adverse of the adjusted and original full-history path.
_Avoid_: Recency weighting, discarded crisis path, volatility forecast

**Conservative Model Estimate**:
A lower or upper boundary derived from volatility-adjusted 0.5% expiration and 1% path quantiles, block-bootstrap uncertainty, and diagnostics-approved EVT stress. It is always distinguished from the separate 95% Certified Boundary.
_Avoid_: Certified Conservative Grade, guaranteed tail boundary

**95% Certified Boundary**:
The nearest continuous price whose one-sided 95% Risk Upper Bounds satisfy both Conservative thresholds. It may be materially farther from the Reference Price than the Conservative Model Estimate and may be unavailable when finite evidence is insufficient.
_Avoid_: Model estimate, guaranteed safe price

**Expanding-Window Backtest**:
A calibration test in which each historical boundary is estimated only from earlier eligible paths before the next realized path is checked for expiration breach and path touch.
_Avoid_: In-sample fit, future-data validation, guarantee

**EVT Stress Estimate**:
A separately identified extreme-tail extrapolation used only for stress context when its fit diagnostics are acceptable; it never replaces observed extremes or determines a Safety Grade.
_Avoid_: Primary estimate, guaranteed worst case

**Analysis Horizon**:
The forward time window from the analysis reference point through a selected Target Week Close, expressed as one through eight future Trading Weeks.
_Avoid_: Expiration, cycle

**Decision-Grade Horizon**:
An Analysis Horizon of one through four Trading Weeks for which the system may report a Safety Grade alongside its evidence strength.
_Avoid_: Guaranteed horizon

**Scenario Horizon**:
An Analysis Horizon of five through eight Trading Weeks for which the system reports ranges and breach estimates with a low-evidence warning but no Safety Grade.
_Avoid_: Long-term forecast, safe horizon

**Statistical Price Range**:
A lower and upper price boundary derived from a stated historical or modeled probability over an Analysis Horizon. It is not a guarantee, position-size recommendation, or liquidation threshold.
_Avoid_: Guaranteed range, safe strike

**Candidate Price**:
A continuous lower or upper price level evaluated for closing breach and path-touch risk without assuming that it is a listed option strike.
_Avoid_: Recommended strike, order price

**Expiration Payoff Loss**:
For a downside Put Candidate Price, the positive amount per share by which the strike exceeds a projected Target Week Close, floored at zero.
_Avoid_: Path-touch loss, broker margin loss, realized trade loss

**CVaR95 Expiration Loss**:
The average Expiration Payoff Loss among the worst 5% of matched historical paths.
_Avoid_: Maximum loss, 95% probability, guaranteed tail loss

**Statistical Compensation Floor**:
The upper endpoint of the 95% Bootstrap Confidence Interval for mean Expiration Payoff Loss plus the stated per-share transaction cost.
_Avoid_: Fair value, safe premium, recommended limit price

**Capital Return Floor**:
The Statistical Compensation Floor plus the stated annual return hurdle on the full cash-secured Put strike for the calendar days through the Target Week Close.
_Avoid_: Broker margin return, guaranteed annual yield

**Tail Compensation Floor**:
The Capital Return Floor plus a stated fraction of the difference between CVaR95 Expiration Loss and mean Expiration Payoff Loss. The interface reports light 10% and conservative 25% variants.
_Avoid_: Safety Grade, theoretical option value, objective risk price

**Executable Premium**:
An optional user-entered net option premium per share based on an executable bid or plausible limit fill, after estimated costs, used only to locate the quote relative to historical compensation references. It is not automatically sourced or verified as a live quote.
_Avoid_: Last trade, ask, midpoint, guaranteed fill, evidence that a trade is worthwhile

**Reference Price**:
The Regular-Session Quote or explicit Manual Reference Price from which forward returns are converted into projected price levels.
_Avoid_: Entry price, strike

**Regular-Session Quote**:
The latest observed price during the normal US equity session, or that session's final close after the market closes. It excludes pre-market, after-hours, and overnight venues.
_Avoid_: Extended-hours quote, BOATS overnight price

**Stale Quote**:
An automatically sourced Regular-Session Quote whose timestamp is more than two minutes old while its market is open. Automatic analysis pauses until the quote becomes current or is replaced manually.
_Avoid_: Last close

**Manual Reference Price**:
A user-entered Reference Price used when automatic quoting is unavailable or deliberately overridden, always displayed with manual provenance.
_Avoid_: Live quote

**Intraday Conservative Preview**:
An analysis anchored to a current Regular-Session Quote while an active session is incomplete, conservatively modeling the remaining partial session as one full trading session.
_Avoid_: Intraday forecast, closed-session result

**Open-Based Intraday Path**:
A historical same-day path expressed as Open-to-High, Open-to-Low, and Open-to-Close returns, applied from the current Reference Price during an Intraday Conservative Preview.
_Avoid_: Prior-close path, repeated overnight gap

**Closed-Session Analysis**:
An analysis anchored to a completed regular-session close, without an unfinished-session adjustment.
_Avoid_: Live analysis

**Assignment Obligation**:
The total cash required to purchase all shares delivered through put assignment at their strike prices, before counting premium received.
_Avoid_: Margin requirement, maximum loss

**Existing Assignment Obligation**:
Assignment Obligation already committed by positions outside the candidate analysis, entered as a total cash amount rather than reconstructed from option legs.
_Avoid_: Current margin, position market value

**Assignment Budget**:
The maximum Assignment Obligation the user is willing to accept across the analyzed positions.
_Avoid_: Buying power, available margin

**Assignment Budget Multiple**:
The Assignment Budget divided by the user's cash balance. A value of 1.2 means that $60,000 of cash permits up to $72,000 of Assignment Obligation.
_Avoid_: Margin multiple, broker leverage

**Available Assignment Budget**:
Assignment Budget minus Existing Assignment Obligation. Premium received is excluded from this amount.
_Avoid_: Buying power, broker margin

**Expiration Breach Probability**:
The estimated probability that the symbol closes beyond a candidate price boundary at the end of the Analysis Horizon.
_Avoid_: Touch probability, assignment certainty

**Path Touch Probability**:
The estimated probability that the symbol's intraday high or low reaches a candidate price boundary at any time during the Analysis Horizon, regardless of where the period closes.
_Avoid_: Expiration probability, closing breach

**Safety Grade**:
A conservative classification based on the more adverse of Expiration Breach Probability and Path Touch Probability for the same candidate boundary.
_Avoid_: Guarantee, combined probability

**Conservative Grade**:
A Safety Grade whose one-sided 95% Risk Upper Bounds do not exceed 0.5% for expiration breach or 1% for path touch.
_Avoid_: Zero risk

**Safe Grade**:
A Safety Grade whose one-sided 95% Risk Upper Bounds do not exceed 2% for expiration breach or 5% for path touch, but which does not qualify as Conservative Grade.
_Avoid_: Guaranteed safe

**Dangerous Grade**:
A Safety Grade assigned when either one-sided 95% Risk Upper Bound exceeds the Safe Grade threshold.
The UI label is `超出安全門檻` because this classification does not imply that a breach or touch is certain.
_Avoid_: Certain loss, guaranteed touch, displaying the grade as `危險`

**Insufficient Evidence**:
A result with fewer than 100 effective independent historical paths, or a Scenario Horizon, for which ranges and probabilities are shown without a Safety Grade.
_Avoid_: Safe, dangerous
