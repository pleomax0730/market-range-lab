# Use empirical ranges with bootstrap uncertainty and EVT stress estimates

Primary price ranges and breach rates come from equal-weight, week-position-matched paths across the full validated history. ADR 0016 adds a current-volatility adverse envelope without discarding original paths. Contiguous-block bootstrap supplies confidence bounds, while EVT may contribute only to a separately labeled extreme-tail stress or Conservative Model Estimate when fit diagnostics pass; EVT never certifies a Safety Grade, and normal-distribution assumptions are not used.
