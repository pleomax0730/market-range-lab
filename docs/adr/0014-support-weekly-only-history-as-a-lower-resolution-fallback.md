# Support weekly-only history as a lower-resolution fallback

The application accepts an uploaded weekly OHLC dataset as the active calculation source when Daily History is unavailable. Daily remains preferred because it preserves session order and supports weekday-position matching. Weekly-only analysis instead builds equal-weight paths from contiguous weekly bars: a closed-session N-week path starts at a weekly close, ends N bars later, and uses intervening weekly High/Low values for touch estimates. Missing weeks are not bridged.

Weekly-only results must be labeled with their data resolution in the UI and exports. They may report the same empirical estimates, confidence bounds, and evidence-based grades as daily analysis, but must not claim daily path order or session-level precision. When matching Daily and Weekly histories both exist, weekly reconciliation remains available; selecting one dataset never silently combines the two. Yahoo quotes remain reference prices only and never backfill either history source.

Because weekly OHLC cannot reconstruct an unfinished daily session, weekly-only analysis during market hours is an ungraded scenario preview. Evidence-based grades resume only with a completed-session reference.
