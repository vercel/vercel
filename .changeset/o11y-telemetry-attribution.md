---
'vercel': patch
'@vercel/detect-agent': minor
---

Detect agent harnesses via the parent process tree (Linux/macOS, fail-open) with version resolution, and scope telemetry sessions per terminal/harness context. CLI events gated behind `VERCEL_CLI_TELEMETRY_V2`.
