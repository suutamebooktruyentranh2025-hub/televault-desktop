# Task Tracker: Dashboard Performance Optimization

| # | Task | Status |
|---|------|--------|
| 1 | Benchmark & identify root causes (Intl in loop, payload bloat, SQLite query) | `[x]` |
| 2 | Optimize `dashboardAggregator.js` in `@televault/core` (cache Intl, lightweight uploadsPerDay) | `[x]` |
| 3 | Add `getDashboardEntries` and `getDayFiles` to `indexDb.js` | `[x]` |
| 4 | Upgrade `vault:getDashboard` & add `vault:getDayFiles` in `browseHandlers.js` | `[x]` |
| 5 | Expose `getDayFiles` in `preload.js` and `electron/preload.js` | `[x]` |
| 6 | Debounce `vaultApi.onChanged` in `useDashboard.js` (800ms) | `[x]` |
| 7 | Lazy-load day files with top 100 limit in `DashboardDayDetail.jsx` | `[x]` |
| 8 | Add symmetrical i18n keys for day detail loading and top count in `locales.js` | `[x]` |
| 9 | Verification: core unit tests, Vite build, e2e timing benchmarks | `[x]` |

