# Validate but do not backfill imported history

User-imported daily history is canonical and required; an optional weekly file is reconciliation-only. Imports use explicit column mapping for Date, Open, High, Low, and Close, with Volume optional, and reject duplicate dates, nonpositive prices, invalid OHLC relationships, and confirmed adjustment-basis conflicts. A dataset older than the regular session immediately preceding the Reference Price may still produce ranges but not a Safety Grade, and Yahoo quote data is never merged into or used to backfill canonical history.
