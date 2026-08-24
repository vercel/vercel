---
'vercel': patch
---

Reliably flush telemetry on all CLI exit paths (including `--version`, help, and early failures), add value-sanitization primitives, and record an `exit_code` event behind `VERCEL_CLI_TELEMETRY_V2`.
