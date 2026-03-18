---
---

Improve GitHub Actions test reliability by retrying failed matrix runs once while reducing resource contention (limited parallelism + smaller retry fan-out). Also improve speed by caching pnpm stores and generating the Turbo cache key only once per matrix job.

