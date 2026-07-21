# Match historical paths by position in the trading week

Only historical paths that begin at the same weekday position as the current analysis and end at the corresponding Target Week Close are eligible for estimation. Arbitrary windows with the same number of sessions are excluded because they can contain different weekend-gap exposure; an Intraday Conservative Preview counts its current day as the first complete remaining session.
