---
'vercel': patch
---

Fix truncated JSON output when `--non-interactive` error and action-required payloads are written to a piped stdout (e.g. `vercel project inspect <missing> --json` on macOS).
