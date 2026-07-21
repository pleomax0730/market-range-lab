# Persist multiple symbol datasets locally

The application stores multiple imported symbol datasets, account inputs, and analysis metadata in local IndexedDB, while presenting one Active Symbol at a time. CSV contents and account values never leave the local application; only the ticker symbol is sent to Yahoo for quote lookup. Users can remove one symbol or clear all local data, and every stored dataset retains its import timestamp, date range, row count, and content hash.
