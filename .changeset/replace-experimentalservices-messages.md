---
'@vercel/fs-detectors': patch
'vercel': patch
---

Replace user-facing `experimentalServices` references with `services` in error/warning messages and rename error codes (`NO_EXPERIMENTAL_SERVICES_CONFIGURED` → `NO_SERVICES_CONFIGURED`, `MISSING_EXPERIMENTAL_SERVICES` → `MISSING_SERVICES`). The deprecated v1 config key should no longer appear in guidance shown to users.
