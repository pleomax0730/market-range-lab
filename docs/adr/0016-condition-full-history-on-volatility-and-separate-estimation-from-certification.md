# Condition full history on volatility and separate estimation from certification

The full-history, week-position-matched path model remains the primary evidence source. Each eligible path is additionally scaled from its start-date realized volatility to the current realized-volatility state, with a 0.5x-2x cap. The risk model retains the more adverse of the scaled and original path, preserving crisis history while reacting when current volatility is elevated.

Two-sided 95% confidence intervals remain descriptive output. Safety Grades use directional one-sided 95% upper risk bounds because the decision asks only whether risk is below an upper threshold. The grading bound is the maximum of a one-sided contiguous-block-bootstrap upper quantile and a one-sided Wilson bound based on effective sample size.

The product always reports a Conservative Model Estimate derived from volatility-adjusted 0.5% expiration and 1% path quantiles, bootstrap uncertainty, and diagnostics-approved EVT stress. A separate 95% Certified Boundary reports the nearest continuous price that finite evidence can certify. EVT cannot independently certify a grade.

One- through four-week analyses also report expanding-window out-of-sample calibration when more than 500 eligible paths exist. Every test prediction uses only earlier paths and the volatility state observable at that date. This backtest diagnoses historical calibration but does not guarantee future coverage.
