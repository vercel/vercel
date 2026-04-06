---
vercel: patch
---

Improve `vercel teams request` in non-interactive mode: validation, missing team scope, and API errors emit structured JSON on stdout with stable `reason` values and `next[]` commands that preserve global flags (for example `--cwd` and `--non-interactive`).
