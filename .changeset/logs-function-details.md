---
'vercel': minor
---

`vercel logs` now includes middleware and function details for each request: region, execution duration, start type (cold/hot), memory, and runtime. Expanded output prints one line per invocation, and `--json` adds `events`, `clientRegion`, and `requestDurationMs`.
