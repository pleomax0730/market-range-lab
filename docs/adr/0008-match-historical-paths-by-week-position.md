# Match historical paths by position in the trading week

> Amended by ADR 0017 for arbitrary expiry dates.

Only historical paths that begin at the same weekday position as the current analysis are eligible for estimation. Their endpoint advances by the same number of US regular sessions as the selected expiry, so Wednesday and Friday expiries in one calendar week remain distinct while weekend-gap exposure stays aligned by anchor weekday. An Intraday Conservative Preview includes its current day in the observed High/Low path.
