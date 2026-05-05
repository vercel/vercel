---
---

Internal CI improvement: cache pnpm store in unit-test and e2e-test jobs, cutting install time from ~54s (Linux) / ~217s (Windows) to ~5-10s on cache hits.
