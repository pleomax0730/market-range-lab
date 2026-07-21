# Use full history as the analysis window

Statistical ranges and breach estimates use every valid observation in the uploaded daily history rather than a recent rolling window or a conservative envelope of multiple lookbacks, and every eligible historical path receives equal weight regardless of date. This retains all observed extreme events and keeps one explainable baseline, with the accepted consequence that older volatility regimes remain part of current estimates.
