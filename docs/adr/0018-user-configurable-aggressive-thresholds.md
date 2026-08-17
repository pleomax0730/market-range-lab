# User-configurable Aggressive risk thresholds

The dashboard needs a third decision tier for leveraged ETFs without changing the evidence model or pretending that “aggressive” means safe. Conservative and Safe remain fixed at 0.5% / 1% and 2% / 5% one-sided 95% risk upper bounds. Aggressive defaults to 5% expiration breach and 10% path touch.

The UI keeps this control secondary: the expiry selector stays primary, while the Aggressive thresholds are inside a collapsed details section. Users may change both percentages, but the validation rules require expiration >= 2%, path touch >= 5%, path touch >= expiration, and both <= 100%. Invalid input is visible and calculations use the defaults until corrected. The resolved values flow through candidate classification, boundary search, historical backtest labels, session cache keys, and JSON/CSV export.

This is a risk-preference setting, not a market-implied probability or a recommendation. It does not change the underlying historical paths, volatility adjustment, confidence-bound method, or Conservative/Safe thresholds.
