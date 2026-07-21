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

**Canonical Daily History**:
Daily OHLC price observations for one market symbol that serve as the authoritative source for all return, path, and derived weekly calculations. Every OHLC field uses the same split-adjusted price basis and excludes reinvested distributions.
_Avoid_: Weekly source of truth, option chain, live quote

**Split-Adjusted Price**:
A historical price restated so stock splits do not appear as market returns, with the same adjustment factor applied consistently to Open, High, Low, and Close.
_Avoid_: Total-return price, adjusted Close paired with unadjusted OHLC

**Derived Weekly History**:
Weekly OHLC observations aggregated by the system from Canonical Daily History.
_Avoid_: Uploaded weekly history

**Weekly Reconciliation Dataset**:
An optional uploaded weekly OHLC file used only to detect discrepancies against Derived Weekly History.
_Avoid_: Weekly source of truth

**Full-History Baseline**:
All valid observations in Canonical Daily History, from its earliest available session through its latest completed session, used as the sole historical analysis window.
_Avoid_: Recent regime, rolling lookback

**Equal-Weight Historical Path**:
An eligible historical path whose contribution to an empirical probability estimate is identical to every other eligible path, regardless of its date.
_Avoid_: Recency weight, regime weight

**Week-Position-Matched Path**:
An eligible historical path that begins at the same weekday position as the analysis reference and ends at the corresponding Target Week Close for the selected horizon.
_Avoid_: Arbitrary trading-session window

**Empirical Range Estimate**:
A Statistical Price Range calculated directly from observed Equal-Weight Historical Paths in the Full-History Baseline.
_Avoid_: Normal-distribution forecast, simulated fact

**Bootstrap Confidence Interval**:
An uncertainty interval around an empirical estimate produced by resampling contiguous historical blocks rather than independent daily observations.
_Avoid_: Forecast range, additional historical evidence

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
A Safety Grade whose 95% upper confidence bounds do not exceed 0.5% for expiration breach or 1% for path touch.
_Avoid_: Zero risk

**Safe Grade**:
A Safety Grade whose 95% upper confidence bounds do not exceed 2% for expiration breach or 5% for path touch, but which does not qualify as Conservative Grade.
_Avoid_: Guaranteed safe

**Dangerous Grade**:
A Safety Grade assigned when either 95% upper confidence bound exceeds the Safe Grade threshold.
_Avoid_: Certain loss

**Insufficient Evidence**:
A result with fewer than 100 effective independent historical paths, or a Scenario Horizon, for which ranges and probabilities are shown without a Safety Grade.
_Avoid_: Safe, dangerous
