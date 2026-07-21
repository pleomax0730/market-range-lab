# Require consistently split-adjusted OHLC history

All canonical Open, High, Low, and Close observations must use the same split-adjusted price basis, while dividend-reinvested total-return prices are excluded. This prevents corporate actions from appearing as extreme market moves and preserves valid intraday ranges; files that adjust only Close or mix adjustment bases are rejected rather than silently normalized.
