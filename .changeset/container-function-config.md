---
'@vercel/container': patch
'vercel': patch
---

Apply `functions` configuration (`memory`, `maxDuration`, `architecture`, `regions`, `functionFailoverRegions`, `experimentalTriggers`, `supportsCancellation`) to container runtime outputs. The `@vercel/container` builder now resolves matching `vercel.json` / per-service `functions` entries at build time, and the CLI writes those settings into the container `.vc-config.json`.
