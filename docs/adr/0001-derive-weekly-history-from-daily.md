# Derive weekly history from daily observations

Superseded for weekly-only fallback behavior by ADR 0014. Daily remains the preferred source when available.

Daily price history is the sole authoritative input for statistical calculations, and the system derives weekly bars from it. An uploaded weekly file is optional and is used only for reconciliation because maintaining two independent calculation sources can produce contradictory ranges, while daily observations preserve the intraperiod path information required for touch probabilities.
