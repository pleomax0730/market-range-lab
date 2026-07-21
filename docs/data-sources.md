# Data Sources

## Historical Prices

The user's current SOXL daily and weekly CSV files were downloaded manually from:

- Provider: Investing.com
- Page: [Direxion Daily Semiconductor Bull 3X Shares Historical Data](https://www.investing.com/etfs/direxion-dly-semiconductor-bull-3x-historical-data)
- Page instrument: Direxion Daily Semiconductor Bull 3X Shares (SOXL)
- Page table: `SOXL ETF Stock Price History`
- Available page fields: Date, Price, Open, High, Low, Vol., Change %
- Import mapping: `Price` is treated as `Close`; `Change %` is not trusted as a calculated return and is used only for reconciliation.

The application does not log in to Investing.com, scrape this page, or download files automatically. The user downloads the CSV and imports it into the local application. Daily history is required and canonical; weekly history is optional and reconciliation-only.

Each imported dataset records this provenance separately from its contents:

- provider name and source URL
- symbol and time frame
- original filename
- SHA-256 content hash
- import timestamp
- first and last observation dates
- accepted and rejected row counts
- split-adjustment attestation and validation warnings

## Current Reference Price

Regular-session quotes come from [Yahoo Finance](https://finance.yahoo.com/) through the local server proxy described in ADR 0005. Yahoo data is not merged into the historical dataset and is never used to fill missing historical rows.

## Source Separation

Historical provenance and quote provenance must always remain visible and distinct:

- `Historical: Investing.com manual CSV`
- `Current quote: Yahoo Finance regular session`

An export includes both source labels, URLs, timestamps, and the historical file hash so a result can be reproduced later.
