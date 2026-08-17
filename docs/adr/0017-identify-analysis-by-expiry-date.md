# Identify Analysis By Expiry Date

## Decision

An analysis is identified by its actual US-market expiry date, not by an integer week number. The model derives the number of remaining regular trading sessions from the reference date through that expiry and replays historical paths with the same anchor weekday and session count.

The supported range remains eight derived trading weeks. Spans through four weeks may be graded; longer spans remain scenario-only. Weekly-only history accepts only the final regular session of a week. A weekly dataset cannot approximate a Wednesday expiry.

Daily intraday analyses with three or fewer sessions remaining remain visible but ungraded because daily OHLC lacks same-clock-time historical observations. Completed-session analyses do not have this restriction.

## Consequences

- Wednesday and Friday expiries in the same week have distinct cache keys, reports, exports, and candidate results.
- Holiday-shortened periods use the actual US regular-session count rather than a fractional-week approximation.
- The interface requires the user to select a broker-listed date because the application does not consume option-chain data.
- Existing saved week-number settings migrate to the default next weekly expiry; absolute expiry dates are persisted thereafter.
